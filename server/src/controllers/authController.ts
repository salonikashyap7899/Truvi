import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { getDb } from "../config/db";
import {
  users,
  pendingSignups,
  IUser,
  OnboardingChecks,
  UserVerification,
  isOnboardingComplete,
  DEFAULT_ONBOARDING_CHECKS,
} from "../db/schema";
import { isValidId } from "../lib/ids";
import {
  signupSchema,
  loginSchema,
  verifyAccountSchema,
  resendOtpSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from "../lib/validations/auth";
import { signAccessToken, signRefreshToken, verifyRefreshToken, refreshAuthVersionMatches } from "../lib/jwt";
import { AuthedRequest } from "../middleware/auth";
import { sendPasswordResetEmail } from "../services/emailService";
import { sendWelcomeEmailOnce } from "../services/lifecycleEmails";
import { isFounderEmail } from "../config/env";
import { otpAttemptBlocked, recordOtpFailure, clearOtpAttempts } from "../services/otpAttempts";
import {
  TOO_MANY_OTP,
  clearRefreshCookies,
  createUserFromPending,
  dispatchOtps,
  findUserById,
  generateOtp,
  issueRefreshCookie,
  issueSession,
  issueVerificationOtps,
  maskPhone,
} from "../services/authService";
import { zodMessage } from "../lib/validationError";
import { hashOtpForStorage, verifyStoredOtp } from "../lib/otpHash";
import { sanitizeUserForClient } from "../lib/sanitizeUser";

// HTTP layer: validates requests, invokes auth services, and keeps the public
// API response shapes stable for all existing Truvi client applications.

export const signup = async (req: Request, res: Response) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: zodMessage(parsed.error), issues: parsed.error.flatten() });
  }

  const { name, email, password, phone, role, companyName, reraNumber, referralCode } = parsed.data;
  const normalizedEmail = email.toLowerCase().trim();

  const db = getDb();
  const [existing] = await db.select({ _id: users._id }).from(users).where(eq(users.email, normalizedEmail));
  if (existing) {
    return res.status(409).json({ error: "An account with this email already exists" });
  }

  // Resolve an optional referral code to the referring CP/Ambassador/Developer.
  // A referral code is valid whether it belongs to a Channel Partner, an
  // Ambassador or a Developer — all three earn the 2% incentive on the referred
  // developer's transactions. Invalid codes are ignored silently so signup
  // never fails on a bad code.
  let referredBy: string | null = null;
  const code = referralCode?.trim().toUpperCase();
  if (code) {
    const [referrer] = await db
      .select({ _id: users._id, role: users.role })
      .from(users)
      .where(eq(users.referralCode, code));
    if (referrer && (referrer.role === "CP" || referrer.role === "AMBASSADOR" || referrer.role === "DEVELOPER")) {
      referredBy = String(referrer._id);
    }
  }

  const hashedPassword = await bcrypt.hash(password, 12);
  const emailOtp = generateOtp();
  const phoneOtp = generateOtp();
  const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

  // The account is NOT created yet. We hold the signup in `pending_signups`
  // until BOTH OTPs are verified — only then is the real `users` row created.
  // Re-signing up with the same email simply refreshes the pending codes.
  const pendingValues = {
    name,
    email: normalizedEmail,
    password: hashedPassword,
    phone,
    role,
    companyName: companyName ?? null,
    reraNumber: reraNumber ?? null,
    referredBy,
    emailOtp: hashOtpForStorage(emailOtp),
    emailOtpExpiry: otpExpiry,
    phoneOtp: hashOtpForStorage(phoneOtp),
    phoneOtpExpiry: otpExpiry,
  };
  await db
    .insert(pendingSignups)
    .values(pendingValues)
    .onConflictDoUpdate({ target: pendingSignups.email, set: pendingValues });

  // Signup creates a fresh code pair, including when resuming/retrying an
  // unverified signup. A lockout against the previous pair must not survive
  // code rotation.
  clearOtpAttempts(`verify:${normalizedEmail}`);
  const { emailSent, smsSent } = await dispatchOtps(normalizedEmail, phone, emailOtp, phoneOtp);

  return res.status(201).json({
    message: "Enter the codes we sent to your email and phone to create your account.",
    needsVerification: true,
    email: normalizedEmail,
    phone: maskPhone(phone),
    emailSent,
    smsSent,
  });
};

export const login = async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: zodMessage(parsed.error), issues: parsed.error.flatten() });
  }

  const { email, password } = parsed.data;
  const normalizedEmail = email.toLowerCase().trim();
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.email, normalizedEmail));

  // Recover unfinished signups when a user leaves the OTP screen and later
  // returns through Login. The real users row is intentionally not created
  // until both OTPs verify, so treating this case as "wrong credentials" is
  // confusing and causes repeated signup attempts to invalidate earlier codes.
  if (!user) {
    const [pending] = await db.select().from(pendingSignups).where(eq(pendingSignups.email, normalizedEmail));
    if (!pending || !(await bcrypt.compare(password, pending.password))) {
      return res.status(401).json({ error: "Incorrect email or password. Please double-check both and try again." });
    }

    // Reissuing from Login always rotates the pair, so an earlier expired
    // code or identity-level lockout cannot leave a legitimate user stranded.
    const emailOtp = generateOtp();
    const phoneOtp = generateOtp();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);
    await db.update(pendingSignups).set({
      emailOtp: hashOtpForStorage(emailOtp),
      phoneOtp: hashOtpForStorage(phoneOtp),
      emailOtpExpiry: otpExpiry,
      phoneOtpExpiry: otpExpiry,
    }).where(eq(pendingSignups._id, pending._id));
    clearOtpAttempts(`verify:${normalizedEmail}`);

    const { emailSent, smsSent } = await dispatchOtps(
      normalizedEmail, pending.phone, emailOtp, phoneOtp,
    );
    return res.status(403).json({
      error: emailSent && smsSent
        ? "Your signup is saved but not finished. Enter the fresh verification codes to complete it."
        : "Your signup is saved, but one or more verification codes could not be delivered. Use Resend codes or contact Truvi support.",
      needsVerification: true,
      email: normalizedEmail,
      phone: maskPhone(pending.phone),
      emailSent,
      smsSent,
    });
  }

  const isValid = await bcrypt.compare(password, user.password);
  if (!isValid) return res.status(401).json({ error: "Incorrect email or password. Please double-check both and try again." });

  // Deactivated accounts can't log in (kept in the DB so their history stays).
  if (user.disabled) {
    return res.status(403).json({ error: "This account has been deactivated. Contact Truvi support." });
  }

  // Admin moderation gate: only APPROVED accounts can log in.
  if (user.approvalStatus !== "APPROVED") {
    return res.status(403).json({
      error: user.approvalStatus === "REJECTED"
        ? "This account has been rejected. Contact Truvi support."
        : "This account is pending admin approval.",
    });
  }

  // OTP gate: an account can't log in until BOTH email and phone are verified.
  // Send fresh codes and tell the client to route to the verification screen.
  if (!user.emailVerified || !user.phoneVerified) {
    const { emailSent, smsSent } = await issueVerificationOtps(user);
    return res.status(403).json({
      error: "Please verify your account. We've sent fresh codes to your email and phone.",
      needsVerification: true,
      email: user.email,
      phone: maskPhone(user.phone),
      emailSent,
      smsSent,
    });
  }

  return res.json(issueSession(res, user));
};

export const verifyAccount = async (req: Request, res: Response) => {
  const parsed = verifyAccountSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: zodMessage(parsed.error), issues: parsed.error.flatten() });
  }

  const { email, emailOtp, phoneOtp } = parsed.data;
  const normalizedEmail = email.toLowerCase().trim();
  const attemptKey = `verify:${normalizedEmail}`;
  if (otpAttemptBlocked(attemptKey)) return res.status(429).json({ error: TOO_MANY_OTP });
  const db = getDb();
  const now = new Date();

  // ── Legacy path: a real (unverified) account already exists ────────────────
  const [user] = await db.select().from(users).where(eq(users.email, normalizedEmail));
  if (user) {
    if (user.emailVerified && user.phoneVerified) {
      // Verification is not authentication. This public endpoint must never
      // mint a session for an already-verified account based only on its email.
      // It also prevents bypassing disabled/approval checks enforced by login.
      return res.status(409).json({
        error: "This account is already verified. Please sign in with your password.",
        code: "ACCOUNT_ALREADY_VERIFIED",
      });
    }
    const v = user.verification;
    if (!v?.emailOtp || !v?.emailOtpExpiry || !v?.phoneOtp || !v?.phoneOtpExpiry) {
      return res.status(400).json({ error: "No codes requested. Please resend new codes." });
    }
    if (new Date(v.emailOtpExpiry) < now || new Date(v.phoneOtpExpiry) < now) {
      return res.status(400).json({ error: "Codes expired. Please resend new codes." });
    }
    if (!verifyStoredOtp(emailOtp, v.emailOtp)) { recordOtpFailure(attemptKey); return res.status(400).json({ error: "Invalid email code", field: "emailOtp" }); }
    if (!verifyStoredOtp(phoneOtp, v.phoneOtp)) { recordOtpFailure(attemptKey); return res.status(400).json({ error: "Invalid phone code", field: "phoneOtp" }); }
    clearOtpAttempts(attemptKey);

    const verification: UserVerification = {
      ...(user.verification ?? {}),
      emailOtp: null,
      emailOtpExpiry: null,
      phoneOtp: null,
      phoneOtpExpiry: null,
    };
    const onboardingChecks: OnboardingChecks | undefined = user.onboardingChecks
      ? { ...user.onboardingChecks, emailVerified: true, phoneVerified: true }
      : undefined;
    const [updated] = await db
      .update(users)
      .set({ emailVerified: true, phoneVerified: true, verification, ...(onboardingChecks ? { onboardingChecks } : {}) })
      .where(eq(users._id, user._id))
      .returning();
    void sendWelcomeEmailOnce(updated);
    return res.json(issueSession(res, updated));
  }

  // ── New path: verify the pending signup and CREATE the account now ─────────
  const [pending] = await db.select().from(pendingSignups).where(eq(pendingSignups.email, normalizedEmail));
  if (!pending) return res.status(404).json({ error: "No pending signup found. Please sign up again." });
  if (!pending.emailOtp || !pending.emailOtpExpiry || !pending.phoneOtp || !pending.phoneOtpExpiry) {
    return res.status(400).json({ error: "No codes requested. Please resend new codes." });
  }
  if (pending.emailOtpExpiry < now || pending.phoneOtpExpiry < now) {
    return res.status(400).json({ error: "Codes expired. Please resend new codes." });
  }
  if (!verifyStoredOtp(emailOtp, pending.emailOtp)) { recordOtpFailure(attemptKey); return res.status(400).json({ error: "Invalid email code", field: "emailOtp" }); }
  if (!verifyStoredOtp(phoneOtp, pending.phoneOtp)) { recordOtpFailure(attemptKey); return res.status(400).json({ error: "Invalid phone code", field: "phoneOtp" }); }
  clearOtpAttempts(attemptKey);

  // Guard against a race where a real account for this email appeared meanwhile.
  const [already] = await db.select({ _id: users._id }).from(users).where(eq(users.email, normalizedEmail));
  if (already) {
    await db.delete(pendingSignups).where(eq(pendingSignups._id, pending._id));
    return res.status(409).json({ error: "An account with this email already exists. Please log in." });
  }

  let created: IUser;
  try {
    created = await createUserFromPending(pending);
  } catch (createError) {
    // Two verification requests can arrive from separate tabs/devices. If the
    // other request won the unique-email insert, return its verified session
    // instead of surfacing an intermittent 500 for an account that now exists.
    try {
      const [alreadyCreated] = await db.select().from(users).where(eq(users.email, normalizedEmail));
      if (alreadyCreated?.emailVerified && alreadyCreated?.phoneVerified) {
        await db.delete(pendingSignups).where(eq(pendingSignups._id, pending._id)).catch(() => {});
        return res.json(issueSession(res, alreadyCreated));
      }
    } catch {
      // Keep the original error if the database is unavailable during recovery.
    }
    throw createError;
  }
  // Account is now fully verified — send the one-time welcome email (best-effort).
  void sendWelcomeEmailOnce(created);
  return res.json(issueSession(res, created));
};

export const resendOtp = async (req: Request, res: Response) => {
  const parsed = resendOtpSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: zodMessage(parsed.error), issues: parsed.error.flatten() });
  }

  const db = getDb();
  const normalizedEmail = parsed.data.email.toLowerCase().trim();

  // A signup awaiting verification lives in `pending_signups` — refresh its codes.
  const [pending] = await db.select().from(pendingSignups).where(eq(pendingSignups.email, normalizedEmail));
  if (pending) {
    const emailOtp = generateOtp();
    const phoneOtp = generateOtp();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);
    await db
      .update(pendingSignups)
      .set({
        emailOtp: hashOtpForStorage(emailOtp),
        emailOtpExpiry: otpExpiry,
        phoneOtp: hashOtpForStorage(phoneOtp),
        phoneOtpExpiry: otpExpiry,
      })
      .where(eq(pendingSignups._id, pending._id));
    clearOtpAttempts(`verify:${normalizedEmail}`);
    const { emailSent, smsSent } = await dispatchOtps(normalizedEmail, pending.phone, emailOtp, phoneOtp);
    return res.json({
      message: "Fresh 6-digit codes have been sent to your email and phone.",
      email: normalizedEmail,
      phone: maskPhone(pending.phone),
      emailSent,
      smsSent,
    });
  }

  // Legacy: an unverified real account (predates the pending-signup flow).
  const [user] = await db.select().from(users).where(eq(users.email, normalizedEmail));
  // Don't reveal whether an email exists; respond the same either way.
  if (!user || (user.emailVerified && user.phoneVerified)) {
    return res.json({ message: "If that account needs verification, fresh codes have been sent." });
  }

  const { emailSent, smsSent } = await issueVerificationOtps(user);
  return res.json({
    message: "Fresh 6-digit codes have been sent to your email and phone.",
    email: user.email,
    phone: maskPhone(user.phone),
    emailSent,
    smsSent,
  });
};

export const forgotPassword = async (req: Request, res: Response) => {
  const parsed = forgotPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: zodMessage(parsed.error), issues: parsed.error.flatten() });
  }

  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.email, parsed.data.email.toLowerCase().trim()));

  // Only issue a code for accounts that can actually log in. Either way we
  // respond identically so the endpoint can't be used to probe for accounts.
  if (user && !user.disabled && user.approvalStatus === "APPROVED") {
    const otp = generateOtp();
    const verification: UserVerification = {
      ...(user.verification ?? {}),
      resetPasswordOtp: hashOtpForStorage(otp),
      resetPasswordExpiry: new Date(Date.now() + 10 * 60 * 1000).toISOString(), // 10 mins
    };
    await db.update(users).set({ verification }).where(eq(users._id, user._id));
    // A newly generated reset code replaces the previous one.
    clearOtpAttempts(`reset:${user.email.toLowerCase().trim()}`);
    try {
      await sendPasswordResetEmail(user.email, otp);
    } catch (err) {
      console.error("Failed to send password reset email:", err);
    }
  }

  return res.json({
    message: "If an account exists for that email, we've sent a reset code.",
    email: parsed.data.email,
  });
};

export const resetPassword = async (req: Request, res: Response) => {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: zodMessage(parsed.error), issues: parsed.error.flatten() });
  }

  const { email, otp, password } = parsed.data;
  const normalizedEmail = email.toLowerCase().trim();
  const attemptKey = `reset:${normalizedEmail}`;
  if (otpAttemptBlocked(attemptKey)) return res.status(429).json({ error: TOO_MANY_OTP });
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.email, normalizedEmail));
  if (!user) return res.status(400).json({ error: "Invalid or expired reset code" });

  const v = user.verification;
  if (!v?.resetPasswordOtp || !v?.resetPasswordExpiry) {
    return res.status(400).json({ error: "No reset requested. Please request a new code." });
  }
  if (new Date(v.resetPasswordExpiry) < new Date()) {
    return res.status(400).json({ error: "Reset code expired. Please request a new one." });
  }
  if (!verifyStoredOtp(otp, v.resetPasswordOtp)) {
    recordOtpFailure(attemptKey);
    return res.status(400).json({ error: "Invalid reset code", field: "otp" });
  }
  clearOtpAttempts(attemptKey);

  const hashedPassword = await bcrypt.hash(password, 12);
  const verification: UserVerification = {
    ...(user.verification ?? {}),
    resetPasswordOtp: null,
    resetPasswordExpiry: null,
  };
  // Incrementing the version revokes all refresh tokens issued before this password reset.
  await db.update(users).set({
    password: hashedPassword,
    verification,
    authVersion: (user.authVersion ?? 0) + 1,
  }).where(eq(users._id, user._id));

  return res.json({ message: "Password reset. You can now sign in with your new password." });
};

export const refresh = async (req: Request, res: Response) => {
  const token = req.cookies?.refreshToken;
  if (!token) return res.status(401).json({ error: "No refresh token" });

  let refreshClaims: ReturnType<typeof verifyRefreshToken>;
  try {
    refreshClaims = verifyRefreshToken(token);
  } catch {
    // A genuinely invalid/expired credential can be cleared; an API/database
    // failure must never be misreported as an invalid session.
    clearRefreshCookies(res);
    return res.status(401).json({ error: "Invalid or expired refresh token" });
  }

  const userId = refreshClaims.userId;
  if (!isValidId(userId)) {
    clearRefreshCookies(res);
    return res.status(401).json({ error: "User not found" });
  }

  let user: IUser | null;
  try {
    user = await findUserById(userId);
  } catch (error) {
    // Keep the refresh cookie. Database/network incidents are temporary service
    // failures, not a user logout. The client treats 503 as recoverable and can
    // retry session restoration once the service is healthy.
    console.error(
      "[auth] Refresh session lookup temporarily failed:",
      error instanceof Error ? error.message : "unknown error",
    );
    return res.status(503).json({ error: "Session service is temporarily unavailable. Please retry." });
  }

  if (!user) {
    clearRefreshCookies(res);
    return res.status(401).json({ error: "User not found" });
  }

  // A deactivated account must not keep minting access tokens from a still-
  // valid refresh cookie (which lives 30 days). Login already blocks disabled
  // accounts; mirror that here so an admin deactivating a user actually ends
  // their session at the next token refresh.
  if (user.disabled) {
    clearRefreshCookies(res);
    return res.status(403).json({ error: "This account has been deactivated. Contact Truvi support." });
  }
  // A rejected/pending account can't keep a live session either.
  if (user.approvalStatus !== "APPROVED") {
    clearRefreshCookies(res);
    return res.status(403).json({ error: "This account is not approved. Contact Truvi support." });
  }

  // A reset-password operation increments authVersion. This rejects prior
  // refresh tokens, including legacy tokens (treated as version zero).
  if (!refreshAuthVersionMatches(refreshClaims.authVersion, user.authVersion ?? 0)) {
    clearRefreshCookies(res);
    return res.status(401).json({ error: "Session revoked. Please sign in again." });
  }

  const accessToken = signAccessToken({
    userId: String(user._id),
    role: user.role,
    approvalStatus: user.approvalStatus,
    onboardingVerified: user.onboardingVerified,
    ...(user.role === "CP" ? { cpJoined: !!user.cpJoinedAt } : {}),
  });

  // Sliding session: every successful visit extends the HttpOnly refresh
  // cookie for another 30 days, provided the account remains authorized.
  issueRefreshCookie(res, signRefreshToken({
    userId: String(user._id),
    authVersion: user.authVersion ?? 0,
  }));
  return res.json({ accessToken });
};

export const logout = (req: Request, res: Response) => {
  clearRefreshCookies(res);
  return res.json({ message: "Logged out" });
};

export const getMe = async (req: AuthedRequest, res: Response) => {
  const userId = req.user!.userId;
  if (!isValidId(userId)) return res.status(404).json({ error: "User not found" });
  const user = await findUserById(userId);
  if (!user) return res.status(404).json({ error: "User not found" });
  // The raw DB verification JSON can contain active email/phone/password-reset
  // OTPs. Never include it in a general-purpose profile/session response.
  const safeUser = sanitizeUserForClient(user);
  return res.json({ user: { ...safeUser, isFounder: isFounderEmail(user.email) } });
};
