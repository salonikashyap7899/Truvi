import { Request, Response, NextFunction } from "express";
import { verifyAccessToken, TokenPayload } from "../lib/jwt";

export interface AuthedRequest extends Request {
  user?: TokenPayload;
}

/**
 * Verifies the access token from the Authorization header. Attaches the
 * decoded payload to req.user. This is the server-side re-verification
 * every protected route relies on — the frontend's stored role is never
 * trusted on its own.
 */
export function authenticate(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  try {
    req.user = verifyAccessToken(token);
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
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
export function requireRole(...roles: Array<"ADMIN" | "DEVELOPER" | "CP" | "BUYER" | "AMBASSADOR" | "VERIFIER">) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: "Not authenticated" });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    if (req.user.role === "CP" && req.user.onboardingVerified !== true) {
      return res.status(403).json({ error: "Complete onboarding verification to access project details" });
    }
    next();
  };
}
