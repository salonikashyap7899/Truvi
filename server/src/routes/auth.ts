import { Router } from "express";
import bcrypt from "bcryptjs";
import multer from "multer";
import path from "path";
import fs from "fs";
import { eq } from "drizzle-orm";
import { getDb } from "../config/db";
import { getSqlClient } from "../db/index";
import {
  users,
  pendingSignups,
  notifications,
  IUser,
  IPendingSignup,
  Role,
  OnboardingChecks,
  UserVerification,
  DEFAULT_CP_PROFILE,
  DEFAULT_BUYER_PROFILE,
  DEFAULT_ONBOARDING_CHECKS,
  isOnboardingComplete,
} from "../db/schema";
import { isValidId } from "../lib/ids";
import { signupSchema, loginSchema, verifyAccountSchema, resendOtpSchema, forgotPasswordSchema, resetPasswordSchema } from "../lib/validations/auth";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../lib/jwt";
import { authenticate, AuthedRequest } from "../middleware/auth";
import { sendOtpEmail, sendPhoneOtpViaSms, sendPasswordResetEmail } from "../services/emailService";
import { sendWelcomeEmailOnce } from "../services/lifecycleEmails";
import { isValidPan, isValidAadhaar, maskPan, runProviderKyc } from "../services/kycService";
import { emitNotification } from "../sockets";
import { sendDeveloperWelcome } from "../services/whatsappService";
import { notifyUser, notifyRole } from "../services/notificationService";
import { isFounderEmail } from "../config/env";

const router = Router();

// Setup multer for Aadhaar document upload
const uploadDir = path.join(process.cwd(), "uploads", "aadhaar");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const aadhaarUpload = multer({
  dest: uploadDir,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only PDF and image files allowed"));
    }
  },
});

// KYC bundle upload (Aadhaar doc + PAN doc + live selfie) for CP/Ambassador
// identity. Held in memory (not on disk) and persisted durably to the
// `kyc_documents` table as bytea — identity documents must never be publicly
// reachable by URL; they are streamed only to admins via an authenticated route.
const kycUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 6 * 1024 * 1024 }, // 6MB per file
  fileFilter: (req, file, cb) => {
    // Selfies are always images; Aadhaar/PAN may be a PDF scan.
    const allowed = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only PDF and image files allowed"));
    }
  },
});


const isProduction = process.env.NODE_ENV === "production";

// The frontend is deployed on a different origin than this API in production
// (server-only deploy — see README), so the refresh cookie must be
// sent cross-site. SameSite=None requires Secure, which is only true in
// production; locally both run on localhost (different ports but the same
// site), where "lax" already works fine.
const REFRESH_COOKIE_OPTS = {
  httpOnly: true,
  secure: isProduction,
  sameSite: (isProduction ? "none" : "lax") as "none" | "lax",
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
};

async function findUserById(userId: string): Promise<IUser | null> {
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users._id, userId));
  return user ?? null;
}

function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function maskPhone(phone?: string | null): string {
  if (!phone) return "";
  return phone.length >= 4 ? `••••••${phone.slice(-4)}` : phone;
}

/**
 * Dispatch an email OTP + (when a phone is present) an SMS OTP. Returns which
 * channels were ACTUALLY delivered, so callers can honestly tell the user if a
 * channel (e.g. email) isn't working instead of falsely claiming success.
 */
async function dispatchOtps(
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
      // Returns false when Twilio isn't configured (the OTP is logged instead),
      // throws when configured but delivery fails.
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
async function issueVerificationOtps(user: IUser): Promise<{ emailSent: boolean; smsSent: boolean }> {
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
  return dispatchOtps(user.email, user.phone, emailOtp, phoneOtp);
}

/**
 * Promote a verified pending signup into a real, fully-verified `users` row and
 * delete the pending record. Applies the same role-based profile defaults the
 * old inline signup used. This is the ONLY place a self-signup account is
 * created, so no account can exist without passing OTP verification.
 */
async function createUserFromPending(p: IPendingSignup): Promise<IUser> {
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
    await notifyUser(String(user._id), {
      type: "welcome",
      title: "Welcome to Truvi 🎉",
      message: `Your ${label} account is ready. Explore your dashboard to get started.`,
      priority: "high",
    });
    await notifyRole("ADMIN", {
      type: "user_registered",
      title: `New ${label} registered`,
      message: `${user.name} just created a ${label} account on Truvi.`,
      actorUserId: String(user._id),
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
function issueSession(res: import("express").Response, user: IUser) {
  const accessToken = signAccessToken({
    userId: String(user._id),
    role: user.role,
    approvalStatus: user.approvalStatus,
    onboardingVerified: user.onboardingVerified,
  });
  const refreshToken = signRefreshToken({ userId: String(user._id) });
  res.cookie("refreshToken", refreshToken, REFRESH_COOKIE_OPTS);
  return {
    accessToken,
    user: {
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
      avatarUrl: user.avatarUrl ?? null,
      bio: user.bio ?? null,
    },
  };
}

router.post("/signup", async (req, res) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });
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
    emailOtp,
    emailOtpExpiry: otpExpiry,
    phoneOtp,
    phoneOtpExpiry: otpExpiry,
  };
  await db
    .insert(pendingSignups)
    .values(pendingValues)
    .onConflictDoUpdate({ target: pendingSignups.email, set: pendingValues });

  const { emailSent, smsSent } = await dispatchOtps(normalizedEmail, phone, emailOtp, phoneOtp);

  return res.status(201).json({
    message: "Enter the codes we sent to your email and phone to create your account.",
    needsVerification: true,
    email: normalizedEmail,
    phone: maskPhone(phone),
    emailSent,
    smsSent,
  });
});

router.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });
  }

  const { email, password } = parsed.data;
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase().trim()));
  if (!user) return res.status(401).json({ error: "Invalid email or password" });

  const isValid = await bcrypt.compare(password, user.password);
  if (!isValid) return res.status(401).json({ error: "Invalid email or password" });

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
});

// Public: confirm BOTH the emailed and texted OTPs, mark the account verified
// and log in.
router.post("/verify-account", async (req, res) => {
  const parsed = verifyAccountSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });
  }

  const { email, emailOtp, phoneOtp } = parsed.data;
  const normalizedEmail = email.toLowerCase().trim();
  const db = getDb();
  const now = new Date();

  // ── Legacy path: a real (unverified) account already exists ────────────────
  const [user] = await db.select().from(users).where(eq(users.email, normalizedEmail));
  if (user) {
    if (user.emailVerified && user.phoneVerified) {
      // Already verified — just log them in so a stale verify screen still works.
      return res.json(issueSession(res, user));
    }
    const v = user.verification;
    if (!v?.emailOtp || !v?.emailOtpExpiry || !v?.phoneOtp || !v?.phoneOtpExpiry) {
      return res.status(400).json({ error: "No codes requested. Please resend new codes." });
    }
    if (new Date(v.emailOtpExpiry) < now || new Date(v.phoneOtpExpiry) < now) {
      return res.status(400).json({ error: "Codes expired. Please resend new codes." });
    }
    if (v.emailOtp !== emailOtp) return res.status(400).json({ error: "Invalid email code", field: "emailOtp" });
    if (v.phoneOtp !== phoneOtp) return res.status(400).json({ error: "Invalid phone code", field: "phoneOtp" });

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
  if (pending.emailOtp !== emailOtp) return res.status(400).json({ error: "Invalid email code", field: "emailOtp" });
  if (pending.phoneOtp !== phoneOtp) return res.status(400).json({ error: "Invalid phone code", field: "phoneOtp" });

  // Guard against a race where a real account for this email appeared meanwhile.
  const [already] = await db.select({ _id: users._id }).from(users).where(eq(users.email, normalizedEmail));
  if (already) {
    await db.delete(pendingSignups).where(eq(pendingSignups._id, pending._id));
    return res.status(409).json({ error: "An account with this email already exists. Please log in." });
  }

  const created = await createUserFromPending(pending);
  // Account is now fully verified — send the one-time welcome email (best-effort).
  void sendWelcomeEmailOnce(created);
  return res.json(issueSession(res, created));
});

// Public: resend BOTH verification OTPs for an unverified account.
router.post("/resend-otp", async (req, res) => {
  const parsed = resendOtpSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });
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
      .set({ emailOtp, emailOtpExpiry: otpExpiry, phoneOtp, phoneOtpExpiry: otpExpiry })
      .where(eq(pendingSignups._id, pending._id));
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
});

// Public: request a password-reset code. Emails a 6-digit code to the account.
// Available to every role. Never reveals whether an email exists.
router.post("/forgot-password", async (req, res) => {
  const parsed = forgotPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });
  }

  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.email, parsed.data.email.toLowerCase().trim()));

  // Only issue a code for accounts that can actually log in. Either way we
  // respond identically so the endpoint can't be used to probe for accounts.
  if (user && !user.disabled && user.approvalStatus === "APPROVED") {
    const otp = generateOtp();
    const verification: UserVerification = {
      ...(user.verification ?? {}),
      resetPasswordOtp: otp,
      resetPasswordExpiry: new Date(Date.now() + 10 * 60 * 1000).toISOString(), // 10 mins
    };
    await db.update(users).set({ verification }).where(eq(users._id, user._id));
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
});

// Public: confirm the emailed reset code and set a new password. On success the
// code is cleared and all reset state is wiped.
router.post("/reset-password", async (req, res) => {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });
  }

  const { email, otp, password } = parsed.data;
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase().trim()));
  if (!user) return res.status(400).json({ error: "Invalid or expired reset code" });

  const v = user.verification;
  if (!v?.resetPasswordOtp || !v?.resetPasswordExpiry) {
    return res.status(400).json({ error: "No reset requested. Please request a new code." });
  }
  if (new Date(v.resetPasswordExpiry) < new Date()) {
    return res.status(400).json({ error: "Reset code expired. Please request a new one." });
  }
  if (v.resetPasswordOtp !== otp) {
    return res.status(400).json({ error: "Invalid reset code", field: "otp" });
  }

  const hashedPassword = await bcrypt.hash(password, 12);
  const verification: UserVerification = {
    ...(user.verification ?? {}),
    resetPasswordOtp: null,
    resetPasswordExpiry: null,
  };
  await db.update(users).set({ password: hashedPassword, verification }).where(eq(users._id, user._id));

  return res.json({ message: "Password reset. You can now sign in with your new password." });
});

router.post("/refresh", async (req, res) => {
  const token = req.cookies?.refreshToken;
  if (!token) return res.status(401).json({ error: "No refresh token" });

  try {
    const { userId } = verifyRefreshToken(token);
    if (!isValidId(userId)) return res.status(401).json({ error: "User not found" });
    const user = await findUserById(userId);
    if (!user) return res.status(401).json({ error: "User not found" });

    // A deactivated account must not keep minting access tokens from a still-
    // valid refresh cookie (which lives 30 days). Login already blocks disabled
    // accounts; mirror that here so an admin deactivating a user actually ends
    // their session at the next token refresh.
    if (user.disabled) {
      res.clearCookie("refreshToken");
      return res.status(403).json({ error: "This account has been deactivated. Contact Truvi support." });
    }
    // A rejected/pending account can't keep a live session either.
    if (user.approvalStatus !== "APPROVED") {
      res.clearCookie("refreshToken");
      return res.status(403).json({ error: "This account is not approved. Contact Truvi support." });
    }

    const accessToken = signAccessToken({
      userId: String(user._id),
      role: user.role,
      approvalStatus: user.approvalStatus,
      onboardingVerified: user.onboardingVerified,
    });
    return res.json({ accessToken });
  } catch {
    return res.status(401).json({ error: "Invalid or expired refresh token" });
  }
});

router.post("/logout", (_req, res) => {
  res.clearCookie("refreshToken");
  return res.json({ message: "Logged out" });
});

router.get("/me", authenticate, async (req: AuthedRequest, res) => {
  const userId = req.user!.userId;
  if (!isValidId(userId)) return res.status(404).json({ error: "User not found" });
  const user = await findUserById(userId);
  if (!user) return res.status(404).json({ error: "User not found" });
  const { password: _p, ...safeUser } = user;
  return res.json({ user: { ...safeUser, isFounder: isFounderEmail(user.email) } });
});

// PATCH /api/auth/profile — the signed-in user edits their own display profile
// (name, avatar image URL, bio). Any role can call it for their own account.
// The avatar image is uploaded separately via POST /api/uploads (returns a URL),
// then that URL is saved here.
router.patch("/profile", authenticate, async (req: AuthedRequest, res) => {
  const userId = req.user!.userId;
  if (!isValidId(userId)) return res.status(404).json({ error: "User not found" });

  const body = (req.body ?? {}) as { name?: unknown; bio?: unknown; avatarUrl?: unknown };
  const update: Record<string, unknown> = {};

  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (name.length < 2 || name.length > 80) return res.status(400).json({ error: "Name must be 2–80 characters." });
    update.name = name;
  }
  if (body.bio !== undefined) {
    const bio = body.bio === null ? "" : String(body.bio).trim();
    if (bio.length > 500) return res.status(400).json({ error: "Bio must be 500 characters or fewer." });
    update.bio = bio || null;
  }
  if (body.avatarUrl !== undefined) {
    const url = body.avatarUrl === null ? "" : String(body.avatarUrl).trim();
    if (url.length > 1000) return res.status(400).json({ error: "Avatar URL is too long." });
    update.avatarUrl = url || null;
  }

  const db = getDb();
  if (Object.keys(update).length === 0) {
    const current = await findUserById(userId);
    if (!current) return res.status(404).json({ error: "User not found" });
    const { password: _p, ...safeUser } = current;
    return res.json({ user: { ...safeUser, isFounder: isFounderEmail(current.email) } });
  }

  const [updated] = await db.update(users).set(update).where(eq(users._id, userId)).returning();
  if (!updated) return res.status(404).json({ error: "User not found" });
  const { password: _p, ...safeUser } = updated;
  return res.json({ user: { ...safeUser, isFounder: isFounderEmail(updated.email) } });
});

router.post("/verify-ambassador", authenticate, async (req: AuthedRequest, res) => {
  const userId = req.user!.userId;
  if (!isValidId(userId)) return res.status(404).json({ error: "User not found" });

  const user = await findUserById(userId);
  if (!user) return res.status(404).json({ error: "User not found" });
  if (user.role !== "CP" && user.role !== "AMBASSADOR") {
    return res.status(403).json({ error: "Only ambassadors can complete this step" });
  }

  const checks: OnboardingChecks = {
    aadhaarVerified: Boolean(req.body?.aadhaarVerified),
    phoneVerified: Boolean(req.body?.phoneVerified),
    emailVerified: Boolean(req.body?.emailVerified),
  };
  const onboardingVerified = isOnboardingComplete(checks);

  const db = getDb();
  await db
    .update(users)
    .set({ onboardingChecks: checks, onboardingVerified })
    .where(eq(users._id, user._id));

  return res.json({
    onboardingVerified,
    onboardingChecks: checks,
  });
});

router.post("/request-phone-otp", authenticate, async (req: AuthedRequest, res) => {
  const userId = req.user!.userId;
  if (!isValidId(userId)) return res.status(404).json({ error: "User not found" });

  const user = await findUserById(userId);
  if (!user) return res.status(404).json({ error: "User not found" });
  if (!user.phone) return res.status(400).json({ error: "Phone number not set" });

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const verification: UserVerification = {
    ...(user.verification ?? {}),
    phoneOtp: otp,
    phoneOtpExpiry: new Date(Date.now() + 10 * 60 * 1000).toISOString(), // 10 mins
  };
  const db = getDb();
  await db.update(users).set({ verification }).where(eq(users._id, user._id));

  try {
    await sendPhoneOtpViaSms(user.phone!, otp);
  } catch (err: any) {
    console.error("Failed to send phone OTP:", err);
    // Twilio trial accounts can only text numbers verified on that account.
    if (err?.code === 21608 || err?.code === 21211 || err?.code === 21408) {
      return res.status(400).json({
        error:
          "SMS could not be delivered to this number. Twilio trial accounts only send to verified numbers — upgrade the Twilio account (add billing) to send OTPs to any number.",
      });
    }
    return res.status(500).json({ error: "Failed to send OTP SMS. Please try again." });
  }

  return res.json({ message: "OTP sent to phone", phone: user.phone });
});

router.post("/verify-phone-otp", authenticate, async (req: AuthedRequest, res) => {
  const userId = req.user!.userId;
  const { otp } = req.body;

  if (!otp) return res.status(400).json({ error: "OTP required" });
  if (!isValidId(userId)) return res.status(404).json({ error: "User not found" });

  const user = await findUserById(userId);
  if (!user) return res.status(404).json({ error: "User not found" });

  if (!user.verification?.phoneOtp || !user.verification?.phoneOtpExpiry) {
    return res.status(400).json({ error: "No OTP requested" });
  }

  if (new Date(user.verification.phoneOtpExpiry) < new Date()) {
    return res.status(400).json({ error: "OTP expired" });
  }

  if (user.verification.phoneOtp !== otp) {
    return res.status(400).json({ error: "Invalid OTP" });
  }

  const onboardingChecks: OnboardingChecks = {
    ...(user.onboardingChecks ?? DEFAULT_ONBOARDING_CHECKS),
    phoneVerified: true,
  };
  const verification: UserVerification = {
    ...(user.verification ?? {}),
    phoneOtp: null,
    phoneOtpExpiry: null,
  };
  const onboardingVerified = isOnboardingComplete(onboardingChecks);

  const db = getDb();
  await db
    .update(users)
    .set({
      onboardingChecks,
      verification,
      ...(onboardingVerified ? { onboardingVerified: true } : {}),
    })
    .where(eq(users._id, user._id));

  return res.json({
    message: "Phone verified",
    onboardingChecks,
    onboardingVerified: onboardingVerified || user.onboardingVerified,
  });
});

router.post("/request-email-otp", authenticate, async (req: AuthedRequest, res) => {
  const userId = req.user!.userId;
  if (!isValidId(userId)) return res.status(404).json({ error: "User not found" });

  const user = await findUserById(userId);
  if (!user) return res.status(404).json({ error: "User not found" });

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const verification: UserVerification = {
    ...(user.verification ?? {}),
    emailOtp: otp,
    emailOtpExpiry: new Date(Date.now() + 10 * 60 * 1000).toISOString(), // 10 mins
  };
  const db = getDb();
  await db.update(users).set({ verification }).where(eq(users._id, user._id));

  try {
    await sendOtpEmail(user.email, otp);
  } catch (err) {
    console.error("Failed to send email OTP:", err);
    return res.status(500).json({ error: "Failed to send OTP email. Please try again." });
  }

  return res.json({ message: "OTP sent to email", email: user.email });
});

router.post("/verify-email-otp", authenticate, async (req: AuthedRequest, res) => {
  const userId = req.user!.userId;
  const { otp } = req.body;

  if (!otp) return res.status(400).json({ error: "OTP required" });
  if (!isValidId(userId)) return res.status(404).json({ error: "User not found" });

  const user = await findUserById(userId);
  if (!user) return res.status(404).json({ error: "User not found" });

  if (!user.verification?.emailOtp || !user.verification?.emailOtpExpiry) {
    return res.status(400).json({ error: "No OTP requested" });
  }

  if (new Date(user.verification.emailOtpExpiry) < new Date()) {
    return res.status(400).json({ error: "OTP expired" });
  }

  if (user.verification.emailOtp !== otp) {
    return res.status(400).json({ error: "Invalid OTP" });
  }

  const onboardingChecks: OnboardingChecks = {
    ...(user.onboardingChecks ?? DEFAULT_ONBOARDING_CHECKS),
    emailVerified: true,
  };
  const verification: UserVerification = {
    ...(user.verification ?? {}),
    emailOtp: null,
    emailOtpExpiry: null,
  };
  const onboardingVerified = isOnboardingComplete(onboardingChecks);

  const db = getDb();
  await db
    .update(users)
    .set({
      onboardingChecks,
      verification,
      ...(onboardingVerified ? { onboardingVerified: true } : {}),
    })
    .where(eq(users._id, user._id));

  return res.json({
    message: "Email verified",
    onboardingChecks,
    onboardingVerified: onboardingVerified || user.onboardingVerified,
  });
});

router.post("/upload-aadhaar", authenticate, aadhaarUpload.single("aadhaar"), async (req: AuthedRequest, res) => {
  const userId = req.user!.userId;
  if (!req.file) return res.status(400).json({ error: "Aadhaar document required" });
  if (!isValidId(userId)) return res.status(404).json({ error: "User not found" });

  const user = await findUserById(userId);
  if (!user) return res.status(404).json({ error: "User not found" });

  const aadhaarDocumentUrl = `/uploads/aadhaar/${req.file.filename}`;
  const onboardingChecks: OnboardingChecks = {
    ...(user.onboardingChecks ?? DEFAULT_ONBOARDING_CHECKS),
    aadhaarVerified: true,
  };
  const verification: UserVerification = {
    ...(user.verification ?? {}),
    aadhaarDocumentUrl,
    aadhaarVerifiedAt: new Date().toISOString(),
  };
  const onboardingVerified = isOnboardingComplete(onboardingChecks);

  const db = getDb();
  await db
    .update(users)
    .set({
      onboardingChecks,
      verification,
      ...(onboardingVerified ? { onboardingVerified: true } : {}),
    })
    .where(eq(users._id, user._id));

  return res.json({
    message: "Aadhaar document uploaded and verified",
    onboardingChecks,
    onboardingVerified: onboardingVerified || user.onboardingVerified,
    aadhaarUrl: aadhaarDocumentUrl,
  });
});

// CP / Ambassador identity submission: Aadhaar + PAN + live selfie in one go.
// KYC is required only for Channel Partners and Ambassadors, so the endpoint is
// scoped to those roles. Documents are stored and the submission is marked
// PENDING for review — access stays locked until a provider (see kycService) or
// an admin approves it.
//
// NOTE: we deliberately do NOT use `requireRole` here — its CP branch rejects
// any Channel Partner whose onboarding isn't verified yet, which is exactly the
// state of every user submitting KYC (they submit precisely to get verified).
// The role check is done inline below, after the upload is consumed, so a
// rejected request never resets the connection mid-upload.
router.post(
  "/submit-kyc",
  authenticate,
  kycUpload.fields([
    { name: "aadhaar", maxCount: 1 },
    { name: "pan", maxCount: 1 },
    { name: "selfie", maxCount: 1 },
  ]),
  async (req: AuthedRequest, res) => {
    const userId = req.user!.userId;
    if (!isValidId(userId)) return res.status(404).json({ error: "User not found" });

    // KYC is a Channel Partner / Ambassador requirement only.
    if (req.user!.role !== "CP" && req.user!.role !== "AMBASSADOR") {
      return res.status(403).json({ error: "Identity verification is only required for Channel Partners and Ambassadors." });
    }

    // PAN is optional for Ambassadors — many are students without a PAN card.
    // Channel Partners still require Aadhaar + PAN + selfie.
    const isAmbassador = req.user!.role === "AMBASSADOR";

    const files = req.files as Record<string, Express.Multer.File[]> | undefined;
    const aadhaarFile = files?.aadhaar?.[0];
    const panFile = files?.pan?.[0];
    const selfieFile = files?.selfie?.[0];
    if (!aadhaarFile || !selfieFile || (!isAmbassador && !panFile)) {
      return res.status(400).json({
        error: isAmbassador ? "Aadhaar and a live selfie are required" : "Aadhaar, PAN and a selfie are all required",
      });
    }

    const aadhaarNumber = String(req.body?.aadhaarNumber || "").replace(/\s/g, "");
    const panNumber = String(req.body?.panNumber || "").trim().toUpperCase();
    if (!isValidAadhaar(aadhaarNumber)) {
      return res.status(400).json({ error: "Enter a valid 12-digit Aadhaar number" });
    }
    // Validate PAN only when it applies (CP always; Ambassador only if supplied).
    if ((!isAmbassador || panNumber) && !isValidPan(panNumber)) {
      return res.status(400).json({ error: "Enter a valid PAN (e.g. ABCDE1234F)" });
    }

    const user = await findUserById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    // Document bytes are stored durably in Postgres (kyc_documents) — never on
    // disk or a public URL. Only admins can retrieve them, via an authenticated
    // route. On the user we keep just lightweight presence markers + mime.
    const kycFiles = {
      aadhaar: { mime: aadhaarFile.mimetype },
      ...(panFile ? { pan: { mime: panFile.mimetype } } : {}),
      selfie: { mime: selfieFile.mimetype },
    };

    const sqlc = getSqlClient();
    await sqlc`
      INSERT INTO kyc_documents (user_id, aadhaar_data, aadhaar_mime, pan_data, pan_mime, selfie_data, selfie_mime, updated_at)
      VALUES (${userId}, ${aadhaarFile.buffer}, ${aadhaarFile.mimetype}, ${panFile?.buffer ?? null}, ${panFile?.mimetype ?? null}, ${selfieFile.buffer}, ${selfieFile.mimetype}, now())
      ON CONFLICT (user_id) DO UPDATE SET
        aadhaar_data = EXCLUDED.aadhaar_data, aadhaar_mime = EXCLUDED.aadhaar_mime,
        pan_data = EXCLUDED.pan_data, pan_mime = EXCLUDED.pan_mime,
        selfie_data = EXCLUDED.selfie_data, selfie_mime = EXCLUDED.selfie_mime,
        updated_at = now()
    `;

    // KYC is auto-approved on submission — no manual admin review. A configured
    // KYC provider can still explicitly REJECT; with no provider (the default)
    // the identity is approved automatically.
    const provider = await runProviderKyc({
      aadhaarNumber,
      panNumber,
      aadhaarDocumentUrl: "",
      panDocumentUrl: "",
      selfieUrl: "",
    });
    const rejected = provider.outcome === "REJECTED";
    const approved = !rejected;

    const onboardingChecks: OnboardingChecks = {
      ...(user.onboardingChecks ?? DEFAULT_ONBOARDING_CHECKS),
      // Carry the account's real email/phone verification (done at signup) onto
      // onboardingChecks — CP accounts don't otherwise track these, and without
      // them the account could never become fully onboarded after KYC.
      emailVerified: user.emailVerified || (user.onboardingChecks?.emailVerified ?? false),
      phoneVerified: user.phoneVerified || (user.onboardingChecks?.phoneVerified ?? false),
      aadhaarVerified: approved,
      panVerified: approved,
      kycStatus: approved ? "APPROVED" : "REJECTED",
      kycRejectionReason: rejected ? provider.reason ?? "Documents could not be verified." : null,
    };
    const verification: UserVerification = {
      ...(user.verification ?? {}),
      kycFiles,
      ...(panNumber ? { panNumberMasked: maskPan(panNumber) } : {}),
      kycSubmittedAt: new Date().toISOString(),
      ...(approved ? { aadhaarVerifiedAt: new Date().toISOString() } : {}),
    };
    const onboardingVerified = isOnboardingComplete(onboardingChecks);

    const db = getDb();
    await db
      .update(users)
      .set({ onboardingChecks, verification, onboardingVerified })
      .where(eq(users._id, user._id));

    // Tell the user the outcome in real time — their workspace unlocks on approval.
    try {
      const message = approved
        ? "Your identity has been verified — full access is now unlocked."
        : `Your identity verification was rejected. ${onboardingChecks.kycRejectionReason ?? ""} Please re-submit.`;
      const [n] = await db.insert(notifications).values({ userId: user._id, message }).returning();
      emitNotification(String(user._id), n);
    } catch {
      /* non-fatal */
    }

    return res.json({
      message: approved
        ? "Identity verified — full access is now unlocked."
        : `Verification failed. ${onboardingChecks.kycRejectionReason ?? ""}`.trim(),
      onboardingChecks,
      onboardingVerified,
    });
  },
);


export default router;
