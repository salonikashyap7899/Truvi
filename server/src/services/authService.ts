import bcrypt from "bcryptjs";
import crypto from "crypto";
import { eq } from "drizzle-orm";
import { getDb } from "../config/db";
import {
  users,
  pendingSignups,
  IUser,
  IPendingSignup,
  Role,
  OnboardingChecks,
  UserVerification,
  DEFAULT_CP_PROFILE,
  DEFAULT_BUYER_PROFILE,
  DEFAULT_ONBOARDING_CHECKS,
} from "../db/schema";
import { signAccessToken, signRefreshToken } from "../lib/jwt";
import { sendOtpEmail, sendPhoneOtpViaSms } from "./emailService";
import { sendWelcomeEmailOnce } from "./lifecycleEmails";
import { sendDeveloperWelcome, sendWhatsAppCampaign } from "./whatsappService";
import { notifyUser, notifyRole } from "./notificationService";
import { isFounderEmail } from "../config/env";
import { otpAttemptBlocked, recordOtpFailure, clearOtpAttempts } from "./otpAttempts";

const isProduction = process.env.NODE_ENV === "production";

// The frontend is deployed on a different origin than this API in production
// (server-only deploy — see README), so the refresh cookie must be
// sent cross-site. SameSite=None requires Secure, which is only true in
// production; locally both run on localhost (different ports but the same
// site), where "lax" already works fine.
const REFRESH_COOKIE_SAME_SITE = (isProduction ? "none" : "lax") as "none" | "lax";
const REFRESH_COOKIE_MAX_AGE = 30 * 24 * 60 * 60 * 1000;

function refreshCookieScope(res: import("express").Response) {
  const hostname = String(res.req?.hostname ?? "").trim().toLowerCase().replace(/\.$/, "");
  const configuredDomain = process.env.REFRESH_COOKIE_DOMAIN
    ?.trim()
    .replace(/^\./, "")
    .toLowerCase();
  const configuredDomainMatchesHost = Boolean(
    configuredDomain &&
    (hostname === configuredDomain || hostname.endsWith(`.${configuredDomain}`)),
  );
  const isTruviHost = hostname === "truviventures.com" || hostname.endsWith(".truviventures.com");
  // Browsers reject a Domain cookie that is not a parent of the API hostname.
  // Use the shared Truvi domain for apex/www/subdomains; use host-only cookies
  // when the API is deployed on an unrelated origin (e.g. a platform hostname).
  const domain = configuredDomainMatchesHost
    ? `.${configuredDomain}`
    : !configuredDomain && isTruviHost
      ? ".truviventures.com"
      : undefined;

  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: REFRESH_COOKIE_SAME_SITE,
    path: "/",
    ...(domain ? { domain } : {}),
  };
}

export function clearRefreshCookies(res: import("express").Response) {
  // Clear both the shared-domain cookie and any older host-only cookie issued
  // before the domain migration. Both can coexist in browsers after migration.
  res.clearCookie("refreshToken", refreshCookieScope(res));
  res.clearCookie("refreshToken", { path: "/" });
}

export function issueRefreshCookie(res: import("express").Response, token: string) {
  // Remove the previous host-only cookie on this hostname before setting the
  // appropriate cookie scope for the current API host.
  res.clearCookie("refreshToken", { path: "/" });
  res.cookie("refreshToken", token, {
    ...refreshCookieScope(res),
    maxAge: REFRESH_COOKIE_MAX_AGE,
  });
}

export async function findUserById(userId: string): Promise<IUser | null> {
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users._id, userId));
  return user ?? null;
}

export function generateOtp(): string {
  // Cryptographically secure 6-digit code (crypto.randomInt is unbiased over
  // the range). Never Math.random() — a predictable PRNG would let an attacker
  // anticipate OTPs.
  return crypto.randomInt(100000, 1000000).toString();
}

export const TOO_MANY_OTP = "Too many incorrect codes. Please wait a few minutes and request a fresh code.";

export function maskPhone(phone?: string | null): string {
  if (!phone) return "";
  return phone.length >= 4 ? `••••••${phone.slice(-4)}` : phone;
}

/**
 * Dispatch an email OTP + (when a phone is present) an SMS OTP. Returns which
 * channels were ACTUALLY delivered, so callers can honestly tell the user if a
 * channel (e.g. email) isn't working instead of falsely claiming success.
 */
export async function dispatchOtps(
  email: string,
  phone: string | null | undefined,
  emailOtp: string,
  phoneOtp: string,
): Promise<{ emailSent: boolean; smsSent: boolean }> {
  let emailSent = false;
  let smsSent = false;
  try {
    emailSent = await sendOtpEmail(email, emailOtp);
  } catch (err) {
    console.error("Failed to send verification email:", err);
  }
  if (phone) {
    try {
      // Returns false when Twilio is not configured; never logs the OTP.
      // Throws when configured but delivery fails.
      smsSent = await sendPhoneOtpViaSms(phone, phoneOtp);
    } catch (err) {
      console.error("Failed to send verification SMS:", err);
    }
  }
  return { emailSent, smsSent };
}

/**
 * Generate + persist fresh OTPs on an EXISTING user and dispatch them. Used by
 * the login-when-unverified path for legacy accounts that predate the
 * pending-signup flow (new signups live in `pending_signups`, not `users`).
 */
export async function issueVerificationOtps(user: IUser): Promise<{ emailSent: boolean; smsSent: boolean }> {
  const emailOtp = generateOtp();
  const phoneOtp = generateOtp();
  const expiry = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const verification: UserVerification = {
    ...(user.verification ?? {}),
    emailOtp,
    emailOtpExpiry: expiry,
    phoneOtp,
    phoneOtpExpiry: expiry,
  };
  const db = getDb();
  await db.update(users).set({ verification }).where(eq(users._id, user._id));
  // Issuing a fresh pair of codes invalidates the previous pair; reset the
  // matching account-level attempt counter so a prior lockout cannot block
  // the newly issued valid codes.
  clearOtpAttempts(`verify:${user.email.toLowerCase().trim()}`);
  return dispatchOtps(user.email, user.phone, emailOtp, phoneOtp);
}

/**
 * Promote a verified pending signup into a real, fully-verified `users` row and
 * delete the pending record. Applies the same role-based profile defaults the
 * old inline signup used. This is the ONLY place a self-signup account is
 * created, so no account can exist without passing OTP verification.
 */
export async function createUserFromPending(p: IPendingSignup): Promise<IUser> {
  const db = getDb();
  const role = p.role as Role;
  const [user] = await db
    .insert(users)
    .values({
      name: p.name,
      email: p.email,
      password: p.password,
      phone: p.phone,
      role,
      approvalStatus: "APPROVED",
      emailVerified: true,
      phoneVerified: true,
      ...(p.referredBy ? { referredBy: p.referredBy } : {}),
      ...(role === "DEVELOPER" ? { developerProfile: { companyName: p.companyName ?? "", reraNumber: p.reraNumber ?? undefined } } : {}),
      ...(role === "CP" ? { cpProfile: { ...DEFAULT_CP_PROFILE } } : {}),
      ...(role === "BUYER" ? { buyerProfile: { ...DEFAULT_BUYER_PROFILE } } : {}),
      ...(role === "AMBASSADOR" ? { onboardingChecks: { ...DEFAULT_ONBOARDING_CHECKS, emailVerified: true, phoneVerified: true } } : {}),
    })
    .returning();
  await db.delete(pendingSignups).where(eq(pendingSignups._id, p._id));

  // One-time WhatsApp welcome for a brand-new developer (dormant unless the
  // WhatsApp Business API is configured). Fire-and-forget — never blocks signup.
  if (role === "DEVELOPER") void sendDeveloperWelcome(user.phone, user.name);

  // In-app notifications on registration: welcome the new user, and alert
  // admins/founders about the new account. Wrapped so a notification failure
  // can never break account creation.
  try {
    const ROLE_WORDS: Record<string, string> = {
      DEVELOPER: "developer", CP: "channel partner", BUYER: "buyer",
      AMBASSADOR: "ambassador", VERIFIER: "verifier", ADMIN: "admin",
    };
    const label = ROLE_WORDS[role] ?? "user";
    const uid = String(user._id);

    // 1) Welcome everyone — in-app + WhatsApp (WhatsApp is dormant until a
    //    provider is configured; AiSensy or Meta template).
    await notifyUser(uid, {
      type: "welcome",
      title: "Welcome to Truvi 🎉",
      message: `Your ${label} account is ready. Explore your dashboard to get started.`,
      priority: "high",
    });
    void sendWhatsAppCampaign("WELCOME", user.phone, user.name);

    // 2) Role-specific "get started" nudge — guides each new user to their work.
    const START: Record<string, { title: string; message: string; href: string }> = {
      DEVELOPER: {
        title: "List your first project 🏗️",
        message: "Add your project and inventory to reach thousands of buyers and channel partners on Truvi.",
        href: "/developer/projects/new",
      },
      CP: {
        title: "Start earning 💼",
        message: "Complete your KYC, then refer developers & buyers and close deals to earn commission.",
        href: "/cp/dashboard",
      },
      AMBASSADOR: {
        title: "Your first task awaits 📍",
        message: "Accept a site-verification task, capture live GPS on site, and earn ₹500 per verification.",
        href: "/ambassador/dashboard",
      },
      BUYER: {
        title: "Explore verified plots 🏡",
        message: "Browse verified projects with 3D plot views, Truvi Score and site-visit booking.",
        href: "/inventory",
      },
    };
    const start = START[role];
    if (start) {
      await notifyUser(uid, {
        type: "onboarding",
        title: start.title,
        message: start.message,
        data: { href: start.href },
      });
    }

    // 3) Pro upgrade nudge for the roles that can subscribe.
    if (role === "CP" || role === "DEVELOPER" || role === "BUYER") {
      await notifyUser(uid, {
        type: "system_announcement",
        title: "Upgrade to Truvi Pro ⭐",
        message: "Unlock premium tools, deeper property intelligence and priority features with Truvi Pro.",
        data: { href: "/pricing" },
      });
    }

    // 4) Alert admins/founders about the new account.
    await notifyRole("ADMIN", {
      type: "user_registered",
      title: `New ${label} registered`,
      message: `${user.name} just created a ${label} account on Truvi.`,
      actorUserId: uid,
      data: { href: `/admin/users/${user._id}` },
    });
  } catch {
    /* non-fatal */
  }

  return user;
}

/**
 * Issue an authenticated session: set the refresh cookie and return the
 * access token + safe user shape. Shared by login and verify-email so both
 * paths log the user in identically.
 */
export function issueSession(res: import("express").Response, user: IUser) {
  const accessToken = signAccessToken({
    userId: String(user._id),
    role: user.role,
    approvalStatus: user.approvalStatus,
    onboardingVerified: user.onboardingVerified,
    ...(user.role === "CP" ? { cpJoined: !!user.cpJoinedAt } : {}),
  });
  const refreshToken = signRefreshToken({
    userId: String(user._id),
    authVersion: user.authVersion ?? 0,
  });
  issueRefreshCookie(res, refreshToken);
  return {
    accessToken,
    user: {
      // Expose the id under BOTH keys: the client User type uses `_id` (matching
      // GET /auth/me, which returns the raw row), while some older code reads
      // `id`. Sending only `id` here left `user._id` undefined right after login,
      // which broke per-account features (e.g. saving a property).
      _id: user._id,
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      isFounder: isFounderEmail(user.email),
      approvalStatus: user.approvalStatus,
      emailVerified: user.emailVerified,
      phoneVerified: user.phoneVerified,
      onboardingVerified: user.onboardingVerified,
      onboardingChecks: user.onboardingChecks,
      whatsappChannelJoined: user.whatsappChannelJoined ?? false,
      cpJoinedAt: user.cpJoinedAt ?? null,
      onboardingCompletedAt: user.onboardingCompletedAt ?? null,
      avatarUrl: user.avatarUrl ?? null,
      bio: user.bio ?? null,
    },
  };
}
