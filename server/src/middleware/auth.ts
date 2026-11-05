import { Request, Response, NextFunction } from "express";
import { verifyAccessToken, TokenPayload } from "../lib/jwt";
import { getDb } from "../config/db";
import { users } from "../db/schema";
import { eq } from "drizzle-orm";

export interface AuthedRequest extends Request {
  user?: TokenPayload;
}

// MAU/DAU: record each account's last-active time, but at most once per
// ~10 min per user (in-memory throttle) so we don't write on every request.
// Fire-and-forget — never blocks or fails the request.
const ACTIVE_THROTTLE_MS = 10 * 60 * 1000;
const lastTouched = new Map<string, number>();
function touchActive(userId: string) {
  const now = Date.now();
  const prev = lastTouched.get(userId) ?? 0;
  if (now - prev < ACTIVE_THROTTLE_MS) return;
  lastTouched.set(userId, now);
  getDb().update(users).set({ lastActiveAt: new Date() }).where(eq(users._id, userId)).catch(() => {});
}

/**
 * Verifies the access token from the Authorization header. Attaches the
 * decoded payload to req.user. This is the server-side re-verification
 * every protected route relies on — the frontend's stored role is never
 * trusted on its own.
 */
async function resolveActiveSession(token: string): Promise<TokenPayload | null> {
  const payload = verifyAccessToken(token);
  const [account] = await getDb().select({
    role: users.role,
    approvalStatus: users.approvalStatus,
    disabled: users.disabled,
    authVersion: users.authVersion,
    onboardingVerified: users.onboardingVerified,
    cpJoinedAt: users.cpJoinedAt,
  }).from(users).where(eq(users._id, payload.userId)).limit(1);

  if (!account || account.disabled) return null;
  if ((payload.authVersion ?? 0) !== (account.authVersion ?? 0)) return null;

  // Role and onboarding permissions are refreshed from the database on every
  // protected request; a stale JWT cannot retain a role after it is changed.
  return {
    ...payload,
    role: account.role,
    approvalStatus: account.approvalStatus,
    onboardingVerified: account.onboardingVerified,
    ...(account.role === "CP" ? { cpJoined: Boolean(account.cpJoinedAt) } : {}),
    authVersion: account.authVersion ?? 0,
  };
}

/**
 * Verify the bearer token AND the current account state. The DB check makes
 * account deactivation, password changes and admin access revocation immediate
 * instead of waiting for the 15-minute access token to expire.
 */
export async function authenticate(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Not authenticated" });

  try {
    const session = await resolveActiveSession(token);
    if (!session) return res.status(401).json({ error: "Your session is no longer active. Please sign in again." });
    req.user = session;
    touchActive(session.userId);
    return next();
  } catch {
    return res.status(401).json({ error: "Invalid, expired, or unavailable session" });
  }
}

/**
 * For routes open to guests that should still know who a signed-in caller is
 * (e.g. checkout, so a purchase is linked to the buyer's account). No token →
 * continue as a guest. A token that is expired or invalid → 401, so the app
 * refreshes its session and retries instead of silently acting as a guest.
 */
export async function optionalAuthenticate(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return next();
  try {
    const session = await resolveActiveSession(token);
    if (!session) return res.status(401).json({ error: "Your session is no longer active. Please sign in again." });
    req.user = session;
    touchActive(session.userId);
    return next();
  } catch {
    return res.status(401).json({ error: "Invalid, expired, or unavailable session" });
  }
}

/**
 * Restricts a route to the given roles. Must run after `authenticate`.
 *
 * Admin account-approval has been removed — accounts are gated at login by
 * email OTP verification instead, so there is no approvalStatus check here.
 * The CP onboarding gate (Aadhaar + phone + email, per the Ambassador SOP)
 * still applies before a CP can reach project details.
 */
export function requireRole(...roles: Array<"ADMIN" | "DEVELOPER" | "CP" | "BUYER" | "AMBASSADOR" | "VERIFIER" | "EMPLOYEE">) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: "Not authenticated" });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    // Enforce KYC for customer/partner roles on protected API routes as well
    // as in React routing. The KYC submission/status endpoints use authenticate
    // without requireRole, so an unverified user can still complete verification.
    if (
      ["BUYER", "CP", "DEVELOPER", "AMBASSADOR"].includes(req.user.role) &&
      req.user.onboardingVerified !== true
    ) {
      return res.status(403).json({
        error: "Complete onboarding verification (KYC) to access your dashboard",
        code: "KYC_REQUIRED",
      });
    }
    // Compulsory Channel Partner joining (after KYC). Only an explicit `false`
    // blocks, so sessions issued before this flag existed keep working.
    if (req.user.role === "CP" && req.user.cpJoined === false) {
      return res.status(403).json({ error: "Complete your Channel Partner joining to continue", code: "CP_JOINING_REQUIRED" });
    }
    next();
  };
}
