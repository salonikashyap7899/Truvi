import { Router } from "express";
import * as authController from "../controllers/authController";
import { findUserById, generateOtp, maskPhone, TOO_MANY_OTP, issueSession, clearRefreshCookies } from "../services/authService";
import { zodMessage } from "../lib/validationError";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import multer from "multer";
import { eq } from "drizzle-orm";
import { getDb } from "../config/db";
import { getSqlClient } from "../db/index";
import {
  users,
  employees,
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
import { loginLimiter, otpSendLimiter, otpVerifyLimiter } from "../middleware/security";
import { sendOtpEmail, sendPhoneOtpViaSms, sendPasswordResetEmail } from "../services/emailService";
import { sendWelcomeEmailOnce } from "../services/lifecycleEmails";
import { isValidPan, isValidAadhaar, maskPan, runProviderKyc, isHostedKycConfigured, createHostedKycSession, getHostedKycCaptureLink, getHostedKycProfileStatus } from "../services/kycService";
import { emitNotification } from "../sockets";
import { sendDeveloperWelcome, sendWhatsAppCampaign } from "../services/whatsappService";
import { notifyUser, notifyRole } from "../services/notificationService";
import { logAudit } from "../services/audit";
import { isFounderEmail } from "../config/env";
import { otpAttemptBlocked, recordOtpFailure, clearOtpAttempts } from "../services/otpAttempts";
import { sanitizeUserForClient } from "../lib/sanitizeUser";
import { hashOtpForStorage, verifyStoredOtp } from "../lib/otpHash";

const router = Router();

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
      cb(new Error("Upload a JPG, PNG or WEBP image, or a PDF file."));
    }
  },
});


router.post("/signup", ...otpSendLimiter, authController.signup);

router.post("/login", ...loginLimiter, authController.login);

// Public: confirm BOTH the emailed and texted OTPs, mark the account verified
// and log in.
router.post("/verify-account", ...otpVerifyLimiter, authController.verifyAccount);

// Public: resend BOTH verification OTPs for an unverified account.
router.post("/resend-otp", ...otpSendLimiter, authController.resendOtp);

// Public: request a password-reset code. Emails a 6-digit code to the account.
// Available to every role. Never reveals whether an email exists.
router.post("/forgot-password", ...otpSendLimiter, authController.forgotPassword);

// Public: confirm the emailed reset code and set a new password. On success the
// code is cleared and all reset state is wiped.
router.post("/reset-password", ...otpVerifyLimiter, authController.resetPassword);

router.post("/refresh", authController.refresh);

router.post("/logout", authController.logout);

router.get("/me", authenticate, authController.getMe);

// POST /api/auth/join-whatsapp-channel — the signed-in user confirms they've
// followed the mandatory Truvi Ventures WhatsApp updates channel. There is no
// WhatsApp API to verify membership, so this records the user's own
// confirmation, which unlocks the CP workspace alongside KYC.
router.post("/join-whatsapp-channel", authenticate, async (req: AuthedRequest, res) => {
  const userId = req.user!.userId;
  if (!isValidId(userId)) return res.status(404).json({ error: "User not found" });
  const db = getDb();
  const [updated] = await db
    .update(users)
    .set({ whatsappChannelJoined: true })
    .where(eq(users._id, userId))
    .returning({ whatsappChannelJoined: users.whatsappChannelJoined });
  if (!updated) return res.status(404).json({ error: "User not found" });
  return res.json({ ok: true, whatsappChannelJoined: true });
});

// POST /api/auth/cp-joining/complete — compulsory Channel Partner joining.
// After KYC and the WhatsApp channel, the CP accepts the partner terms; the
// joining is then saved on the account and never asked again unless an admin
// resets it. KYC itself is untouched. Returns a fresh access token so the
// unlocked state applies immediately.
router.post("/cp-joining/complete", authenticate, async (req: AuthedRequest, res) => {
  const userId = req.user!.userId;
  if (!isValidId(userId)) return res.status(404).json({ error: "User not found" });
  if (req.body?.acceptTerms !== true) return res.status(400).json({ error: "Please accept the Channel Partner terms" });
  const user = await findUserById(userId);
  if (!user) return res.status(404).json({ error: "User not found" });
  if (user.role !== "CP") return res.status(400).json({ error: "Only Channel Partners have a joining step" });
  if (!user.onboardingVerified) return res.status(400).json({ error: "Finish your KYC verification first" });
  if (!user.whatsappChannelJoined) return res.status(400).json({ error: "Join the WhatsApp updates channel first" });
  const cpJoinedAt = user.cpJoinedAt ?? new Date();
  if (!user.cpJoinedAt) {
    await getDb().update(users).set({ cpJoinedAt }).where(eq(users._id, userId));
    void logAudit({ userId, action: "cp.joining.complete", resourceType: "user", resourceId: userId });
  }
  const accessToken = signAccessToken({
    userId,
    role: user.role,
    approvalStatus: user.approvalStatus,
    onboardingVerified: user.onboardingVerified,
    cpJoined: true,
  });
  return res.json({ ok: true, accessToken, cpJoinedAt });
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
    const safeUser = sanitizeUserForClient(current);
    return res.json({ user: { ...safeUser, isFounder: isFounderEmail(current.email) } });
  }

  const [updated] = await db.update(users).set(update).where(eq(users._id, userId)).returning();
  if (!updated) return res.status(404).json({ error: "User not found" });

  // Keep the employee directory's display name in sync with the employee's
  // own account profile. Contact changes have dedicated OTP-protected routes.
  if (updated.role === "EMPLOYEE" && typeof update.name === "string") {
    await db.update(employees).set({ name: update.name }).where(eq(employees.accountUserId, userId)).catch(() => []);
  }
  if (updated.role === "EMPLOYEE") {
    void notifyRole("ADMIN", {
      type: "employee_profile_updated",
      title: "Employee profile updated",
      message: updated.name + " updated their profile photo or personal details.",
      actorUserId: userId,
      data: { href: "/admin/employees?tab=employees" },
      priority: "normal",
      dedupeKey: "employee-profile:" + userId + ":" + Math.floor(Date.now() / 60000),
    }).catch(() => []);
  }

  const safeUser = sanitizeUserForClient(updated);
  return res.json({ user: { ...safeUser, isFounder: isFounderEmail(updated.email) } });
});

// Request verification at the NEW email address. Current account details remain
// unchanged until the destination address confirms ownership with its OTP.
router.post("/profile/request-email-change", authenticate, ...otpSendLimiter, async (req: AuthedRequest, res) => {
  const userId = req.user!.userId;
  const targetEmail = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail) || targetEmail.length > 254) {
    return res.status(400).json({ error: "Enter a valid email address." });
  }
  const user = await findUserById(userId);
  if (!user) return res.status(404).json({ error: "User not found." });
  if (targetEmail === user.email.toLowerCase()) return res.status(400).json({ error: "This is already your current email address." });
  const [existing] = await getDb().select({ id: users._id }).from(users).where(eq(users.email, targetEmail)).limit(1);
  if (existing) return res.status(409).json({ error: "That email address is already used by another Truvi account." });

  const otp = generateOtp();
  try {
    const sent = await sendOtpEmail(targetEmail, otp);
    if (!sent) return res.status(503).json({ error: "Email delivery is unavailable right now. Please try again later." });
  } catch (error) {
    console.error("Failed to send email-change OTP:", error);
    return res.status(503).json({ error: "Could not send a verification code to that address." });
  }

  const verification: UserVerification = {
    ...(user.verification ?? {}),
    pendingEmailChange: targetEmail,
    pendingEmailChangeOtp: hashOtpForStorage(otp),
    pendingEmailChangeExpiry: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  };
  await getDb().update(users).set({ verification }).where(eq(users._id, userId));
  await clearOtpAttempts("email-change:" + userId);
  return res.json({ message: "A verification code was sent to your new email address.", email: targetEmail, expiresInSeconds: 600 });
});

router.post("/profile/verify-email-change", authenticate, ...otpVerifyLimiter, async (req: AuthedRequest, res) => {
  const userId = req.user!.userId;
  const otp = typeof req.body?.otp === "string" ? req.body.otp.trim() : "";
  if (!/^\d{6}$/.test(otp)) return res.status(400).json({ error: "Enter the 6-digit verification code." });
  if (await otpAttemptBlocked("email-change:" + userId)) return res.status(429).json({ error: TOO_MANY_OTP });
  const user = await findUserById(userId);
  if (!user) return res.status(404).json({ error: "User not found." });
  const verification = user.verification ?? {};
  if (!verification.pendingEmailChange || !verification.pendingEmailChangeOtp || !verification.pendingEmailChangeExpiry) {
    return res.status(400).json({ error: "Request a new email verification code first." });
  }
  if (new Date(verification.pendingEmailChangeExpiry).getTime() <= Date.now()) {
    return res.status(400).json({ error: "That code expired. Request a new one." });
  }
  if (!verifyStoredOtp(otp, verification.pendingEmailChangeOtp)) {
    await recordOtpFailure("email-change:" + userId);
    return res.status(400).json({ error: "Incorrect verification code." });
  }

  const targetEmail = verification.pendingEmailChange.toLowerCase();
  const [existing] = await getDb().select({ id: users._id }).from(users).where(eq(users.email, targetEmail)).limit(1);
  if (existing && String(existing.id) !== userId) return res.status(409).json({ error: "That email address has been claimed. Request a code for another address." });
  const nextVerification: UserVerification = {
    ...verification,
    pendingEmailChange: null,
    pendingEmailChangeOtp: null,
    pendingEmailChangeExpiry: null,
    emailOtp: null,
    emailOtpExpiry: null,
  };
  const onboardingChecks: OnboardingChecks = {
    ...(user.onboardingChecks ?? DEFAULT_ONBOARDING_CHECKS),
    emailVerified: true,
  };
  try {
    const [updated] = await getDb().update(users).set({
      email: targetEmail,
      emailVerified: true,
      onboardingChecks,
      onboardingVerified: isOnboardingComplete(onboardingChecks),
      verification: nextVerification,
      authVersion: (user.authVersion ?? 0) + 1,
    }).where(eq(users._id, userId)).returning();
    if (!updated) return res.status(404).json({ error: "User not found." });
    await getDb().update(employees).set({ officialEmail: targetEmail }).where(eq(employees.accountUserId, userId)).catch(() => []);
    await clearOtpAttempts("email-change:" + userId);
    clearRefreshCookies(res);
    void notifyRole("ADMIN", {
      type: "employee_contact_updated",
      title: "Employee email updated",
      message: updated.name + " verified a new account email address.",
      actorUserId: userId,
      data: { href: "/admin/employees?tab=employees" },
      priority: "normal",
    }).catch(() => []);
    return res.json({ message: "Email updated and verified. Please sign in again with your new email address.", email: updated.email, requiresSignIn: true });
  } catch (error: any) {
    if (error?.code === "23505") return res.status(409).json({ error: "That email address is already used by another account." });
    throw error;
  }
});

router.post("/profile/request-phone-change", authenticate, ...otpSendLimiter, async (req: AuthedRequest, res) => {
  const userId = req.user!.userId;
  const phone = typeof req.body?.phone === "string" ? req.body.phone.trim() : "";
  const digits = phone.replace(/\D/g, "");
  if (!/^[+\d\s()-]{10,20}$/.test(phone) || digits.length < 10 || digits.length > 15) {
    return res.status(400).json({ error: "Enter a valid phone number containing 10–15 digits." });
  }
  const user = await findUserById(userId);
  if (!user) return res.status(404).json({ error: "User not found." });
  if (phone === (user.phone ?? "")) return res.status(400).json({ error: "This is already your current phone number." });
  const otp = generateOtp();
  try {
    const sent = await sendPhoneOtpViaSms(phone, otp);
    if (!sent) return res.status(503).json({ error: "SMS delivery is unavailable right now. Please try again later." });
  } catch (error: any) {
    console.error("Failed to send phone-change OTP:", error);
    if ([21608, 21211, 21408].includes(Number(error?.code))) return res.status(400).json({ error: "SMS could not be delivered to this number. Please verify the phone format or Twilio account configuration." });
    return res.status(503).json({ error: "Could not send a verification code to that number." });
  }
  const nextVerification: UserVerification = {
    ...(user.verification ?? {}),
    pendingPhoneChange: phone,
    pendingPhoneChangeOtp: hashOtpForStorage(otp),
    pendingPhoneChangeExpiry: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  };
  await getDb().update(users).set({ verification: nextVerification }).where(eq(users._id, userId));
  await clearOtpAttempts("phone-change:" + userId);
  return res.json({ message: "A verification code was sent to your new phone number.", expiresInSeconds: 600 });
});

router.post("/profile/verify-phone-change", authenticate, ...otpVerifyLimiter, async (req: AuthedRequest, res) => {
  const userId = req.user!.userId;
  const otp = typeof req.body?.otp === "string" ? req.body.otp.trim() : "";
  if (!/^\d{6}$/.test(otp)) return res.status(400).json({ error: "Enter the 6-digit verification code." });
  if (await otpAttemptBlocked("phone-change:" + userId)) return res.status(429).json({ error: TOO_MANY_OTP });
  const user = await findUserById(userId);
  if (!user) return res.status(404).json({ error: "User not found." });
  const verification = user.verification ?? {};
  if (!verification.pendingPhoneChange || !verification.pendingPhoneChangeOtp || !verification.pendingPhoneChangeExpiry) {
    return res.status(400).json({ error: "Request a phone verification code first." });
  }
  if (new Date(verification.pendingPhoneChangeExpiry).getTime() <= Date.now()) {
    return res.status(400).json({ error: "That code expired. Request a new one." });
  }
  if (!verifyStoredOtp(otp, verification.pendingPhoneChangeOtp)) {
    await recordOtpFailure("phone-change:" + userId);
    return res.status(400).json({ error: "Incorrect verification code." });
  }
  const nextVerification: UserVerification = {
    ...verification,
    pendingPhoneChange: null,
    pendingPhoneChangeOtp: null,
    pendingPhoneChangeExpiry: null,
    phoneOtp: null,
    phoneOtpExpiry: null,
  };
  const onboardingChecks: OnboardingChecks = {
    ...(user.onboardingChecks ?? DEFAULT_ONBOARDING_CHECKS),
    phoneVerified: true,
  };
  const [updated] = await getDb().update(users).set({
    phone: verification.pendingPhoneChange,
    phoneVerified: true,
    onboardingChecks,
    onboardingVerified: isOnboardingComplete(onboardingChecks),
    verification: nextVerification,
  }).where(eq(users._id, userId)).returning();
  if (!updated) return res.status(404).json({ error: "User not found." });
  await getDb().update(employees).set({ phone: verification.pendingPhoneChange }).where(eq(employees.accountUserId, userId)).catch(() => []);
  await clearOtpAttempts("phone-change:" + userId);
  void notifyRole("ADMIN", {
    type: "employee_contact_updated",
    title: "Employee phone updated",
    message: updated.name + " verified a new account phone number.",
    actorUserId: userId,
    data: { href: "/admin/employees?tab=employees" },
    priority: "normal",
  }).catch(() => []);
  const safeUser = sanitizeUserForClient(updated);
  return res.json({ message: "Phone number updated and verified.", user: { ...safeUser, isFounder: isFounderEmail(updated.email) } });
});

router.post("/change-password", authenticate, async (req: AuthedRequest, res) => {
  const userId = req.user!.userId;
  const currentPassword = typeof req.body?.currentPassword === "string" ? req.body.currentPassword : "";
  const newPassword = typeof req.body?.newPassword === "string" ? req.body.newPassword : "";
  if (!currentPassword || currentPassword.length > 200) return res.status(400).json({ error: "Enter your current password." });
  if (newPassword.length < 12 || newPassword.length > 128 || !/[a-z]/.test(newPassword) || !/[A-Z]/.test(newPassword) || !/\d/.test(newPassword) || !/[^A-Za-z0-9]/.test(newPassword)) {
    return res.status(400).json({ error: "Use 12–128 characters with uppercase, lowercase, a number and a symbol." });
  }
  const user = await findUserById(userId);
  if (!user) return res.status(404).json({ error: "User not found." });
  if (!await bcrypt.compare(currentPassword, user.password)) return res.status(400).json({ error: "Your current password is incorrect." });
  if (await bcrypt.compare(newPassword, user.password)) return res.status(400).json({ error: "Choose a password you have not used for this account." });
  const verification: UserVerification = {
    ...(user.verification ?? {}),
    resetPasswordOtp: null,
    resetPasswordExpiry: null,
  };
  await getDb().update(users).set({
    password: await bcrypt.hash(newPassword, 12),
    authVersion: (user.authVersion ?? 0) + 1,
    verification,
  }).where(eq(users._id, userId));
  clearRefreshCookies(res);
  if (user.role === "EMPLOYEE") {
    void notifyRole("ADMIN", {
      type: "employee_security_updated",
      title: "Employee account security updated",
      message: user.name + " changed their account password.",
      actorUserId: userId,
      data: { href: "/admin/employees?tab=employees" },
      priority: "normal",
    }).catch(() => []);
  }
  await logAudit({ userId, action: "account.password.change", resourceType: "user", resourceId: userId, metadata: { selfService: true } });
  return res.json({ message: "Password changed successfully. Please sign in again.", requiresSignIn: true });
});

router.post("/verify-ambassador", authenticate, (_req: AuthedRequest, res) => {
  return res.status(403).json({
    error: "Verification status can only be updated through verified OTP and KYC review flows.",
  });
});

router.post("/request-phone-otp", authenticate, ...otpSendLimiter, async (req: AuthedRequest, res) => {
  const userId = req.user!.userId;
  if (!isValidId(userId)) return res.status(404).json({ error: "User not found" });

  const user = await findUserById(userId);
  if (!user) return res.status(404).json({ error: "User not found" });
  if (!user.phone) return res.status(400).json({ error: "Phone number not set" });

  const otp = generateOtp();
  const verification: UserVerification = {
    ...(user.verification ?? {}),
    phoneOtp: otp,
    phoneOtpExpiry: new Date(Date.now() + 10 * 60 * 1000).toISOString(), // 10 mins
  };
  const db = getDb();
  await db.update(users).set({ verification }).where(eq(users._id, user._id));
  await clearOtpAttempts(`phone:${userId}`);

  try {
    const smsSent = await sendPhoneOtpViaSms(user.phone!, otp);
    if (!smsSent) {
      return res.status(503).json({ error: "SMS verification is temporarily unavailable. Please try again later or contact Truvi support." });
    }
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

router.post("/verify-phone-otp", authenticate, ...otpVerifyLimiter, async (req: AuthedRequest, res) => {
  const userId = req.user!.userId;
  const { otp } = req.body;

  if (!otp) return res.status(400).json({ error: "OTP required" });
  if (!isValidId(userId)) return res.status(404).json({ error: "User not found" });

  const user = await findUserById(userId);
  if (!user) return res.status(404).json({ error: "User not found" });

  const attemptKey = `phone:${userId}`;
  if (await otpAttemptBlocked(attemptKey)) return res.status(429).json({ error: TOO_MANY_OTP });

  if (!user.verification?.phoneOtp || !user.verification?.phoneOtpExpiry) {
    return res.status(400).json({ error: "No OTP requested" });
  }

  if (new Date(user.verification.phoneOtpExpiry) < new Date()) {
    return res.status(400).json({ error: "OTP expired" });
  }

  if (user.verification.phoneOtp !== otp) {
    await recordOtpFailure(attemptKey);
    return res.status(400).json({ error: "Invalid OTP" });
  }
  await clearOtpAttempts(attemptKey);

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

router.post("/request-email-otp", authenticate, ...otpSendLimiter, async (req: AuthedRequest, res) => {
  const userId = req.user!.userId;
  if (!isValidId(userId)) return res.status(404).json({ error: "User not found" });

  const user = await findUserById(userId);
  if (!user) return res.status(404).json({ error: "User not found" });

  const otp = generateOtp();
  const verification: UserVerification = {
    ...(user.verification ?? {}),
    emailOtp: otp,
    emailOtpExpiry: new Date(Date.now() + 10 * 60 * 1000).toISOString(), // 10 mins
  };
  const db = getDb();
  await db.update(users).set({ verification }).where(eq(users._id, user._id));
  await clearOtpAttempts(`email:${userId}`);

  try {
    const emailSent = await sendOtpEmail(user.email, otp);
    if (!emailSent) {
      return res.status(503).json({ error: "Email verification is temporarily unavailable. Please try again later or contact Truvi support." });
    }
  } catch (err) {
    console.error("Failed to send email OTP:", err);
    return res.status(503).json({ error: "Email verification could not be sent right now. Please try again later." });
  }

  return res.json({ message: "OTP sent to email", email: user.email });
});

router.post("/verify-email-otp", authenticate, ...otpVerifyLimiter, async (req: AuthedRequest, res) => {
  const userId = req.user!.userId;
  const { otp } = req.body;

  if (!otp) return res.status(400).json({ error: "OTP required" });
  if (!isValidId(userId)) return res.status(404).json({ error: "User not found" });

  const user = await findUserById(userId);
  if (!user) return res.status(404).json({ error: "User not found" });

  const attemptKey = `email:${userId}`;
  if (await otpAttemptBlocked(attemptKey)) return res.status(429).json({ error: TOO_MANY_OTP });

  if (!user.verification?.emailOtp || !user.verification?.emailOtpExpiry) {
    return res.status(400).json({ error: "No OTP requested" });
  }

  if (new Date(user.verification.emailOtpExpiry) < new Date()) {
    return res.status(400).json({ error: "OTP expired" });
  }

  if (user.verification.emailOtp !== otp) {
    await recordOtpFailure(attemptKey);
    return res.status(400).json({ error: "Invalid OTP" });
  }
  await clearOtpAttempts(attemptKey);

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

// Hosted-provider KYC: the provider owns document capture, identity checks and
// liveness. These endpoints never mark a user verified based on an upload alone.
const KYC_DASHBOARD_ROLES = new Set(["BUYER", "CP", "DEVELOPER", "AMBASSADOR"]);

router.get("/kyc/provider-status", authenticate, (req: AuthedRequest, res) => {
  if (!KYC_DASHBOARD_ROLES.has(req.user!.role)) {
    return res.status(403).json({ error: "Identity verification is not available for this account type." });
  }
  return res.json({ configured: isHostedKycConfigured(req.user!.role) });
});

router.post("/kyc/start", authenticate, async (req: AuthedRequest, res) => {
  const userId = req.user!.userId;
  if (!isValidId(userId)) return res.status(404).json({ error: "User not found" });
  if (!KYC_DASHBOARD_ROLES.has(req.user!.role)) {
    return res.status(403).json({ error: "Identity verification is not available for this account type." });
  }
  if (!isHostedKycConfigured(req.user!.role)) {
    return res.status(503).json({ error: "Automatic identity verification is not configured yet. Please contact Truvi support." });
  }

  const user = await findUserById(userId);
  if (!user) return res.status(404).json({ error: "User not found" });
  if (user.onboardingVerified) {
    const accessToken = signAccessToken({
      userId: String(user._id),
      role: user.role,
      approvalStatus: user.approvalStatus,
      onboardingVerified: true,
      ...(user.role === "CP" ? { cpJoined: !!user.cpJoinedAt } : {}),
    });
    return res.json({
      alreadyVerified: true,
      onboardingVerified: true,
      accessToken,
      user: sanitizeUserForClient(user),
    });
  }

  try {
    // Reuse an unfinished provider profile to avoid duplicate checks/charges
    // when a customer returns to continue an interrupted capture journey.
    const existingProfileId =
      user.verification?.kycProvider === "IDFY" &&
      typeof user.verification.kycProviderProfileId === "string"
        ? user.verification.kycProviderProfileId
        : null;
    if (existingProfileId) {
      try {
        const status = await getHostedKycProfileStatus(existingProfileId);
        const finished = status.status === "approved" || status.status === "rejected" ||
          status.reviewerAction === "approved" || status.reviewerAction === "rejected";
        if (!finished) {
          const captureLink = await getHostedKycCaptureLink(existingProfileId);
          return res.json({ captureLink, alreadyStarted: true });
        }
      } catch {
        // An expired/invalid provider profile may need a fresh hosted journey.
      }
    }

    const providerSession = await createHostedKycSession(crypto.randomUUID(), user.role);
    const checks: OnboardingChecks = {
      ...(user.onboardingChecks ?? DEFAULT_ONBOARDING_CHECKS),
      aadhaarVerified: false,
      panVerified: false,
      kycStatus: "PENDING",
      kycRejectionReason: null,
    };
    const verification: UserVerification = {
      ...(user.verification ?? {}),
      kycProvider: "IDFY",
      kycProviderProfileId: providerSession.profileId,
      kycProviderReferenceId: providerSession.referenceId,
      kycProviderStartedAt: new Date().toISOString(),
      kycSubmittedAt: new Date().toISOString(),
    };
    await getDb().update(users)
      .set({ onboardingChecks: checks, onboardingVerified: false, verification })
      .where(eq(users._id, user._id));

    return res.json({ captureLink: providerSession.captureLink, alreadyStarted: false });
  } catch {
    // The provider may return identity data in its error body. Never echo or log
    // that body; the browser gets a generic retryable error only.
    return res.status(503).json({ error: "Automatic verification could not start. Please retry in a moment." });
  }
});

router.get("/kyc/status", authenticate, async (req: AuthedRequest, res) => {
  const userId = req.user!.userId;
  if (!isValidId(userId)) return res.status(404).json({ error: "User not found" });
  if (!KYC_DASHBOARD_ROLES.has(req.user!.role)) {
    return res.status(403).json({ error: "Identity verification is not available for this account type." });
  }
  const user = await findUserById(userId);
  if (!user) return res.status(404).json({ error: "User not found" });

  const profileId =
    user.verification?.kycProvider === "IDFY" &&
    typeof user.verification.kycProviderProfileId === "string"
      ? user.verification.kycProviderProfileId
      : null;
  if (!isHostedKycConfigured(req.user!.role) || !profileId) {
    return res.json({
      configured: isHostedKycConfigured(req.user!.role),
      hasProviderSession: Boolean(profileId),
      onboardingVerified: user.onboardingVerified,
      onboardingChecks: user.onboardingChecks ?? null,
    });
  }

  try {
    const result = await getHostedKycProfileStatus(profileId);
    const approved =
      result.status === "approved" ||
      (result.status === "completed" && result.reviewerAction === "approved") ||
      result.reviewerAction === "approved";
    const rejected = result.status === "rejected" || result.reviewerAction === "rejected";
    let updatedChecks = user.onboardingChecks ?? DEFAULT_ONBOARDING_CHECKS;
    let onboardingVerified = user.onboardingVerified;

    if (approved || rejected) {
      updatedChecks = {
        ...updatedChecks,
        emailVerified: user.emailVerified || (updatedChecks.emailVerified ?? false),
        phoneVerified: user.phoneVerified || (updatedChecks.phoneVerified ?? false),
        aadhaarVerified: approved,
        // The configured IDfy workflow must verify every role-appropriate item.
        // Truvi records this combined identity decision for its existing gate.
        panVerified: user.role === "AMBASSADOR" ? true : approved,
        kycStatus: approved ? "APPROVED" : "REJECTED",
        kycRejectionReason: rejected
          ? (result.statusDetail || "The identity provider could not verify this submission.")
          : null,
      };
      onboardingVerified = isOnboardingComplete(updatedChecks);
      const verification: UserVerification = {
        ...(user.verification ?? {}),
        ...(approved ? { aadhaarVerifiedAt: new Date().toISOString() } : {}),
      };
      await getDb().update(users)
        .set({ onboardingChecks: updatedChecks, onboardingVerified, verification })
        .where(eq(users._id, user._id));

      if (approved) {
        // Refresh the role/verification claims immediately so protected API
        // calls work in this tab without a logout or a manual page reload.
        const accessToken = signAccessToken({
          userId: String(user._id),
          role: user.role,
          approvalStatus: user.approvalStatus,
          onboardingVerified,
          ...(user.role === "CP" ? { cpJoined: !!user.cpJoinedAt } : {}),
        });
        return res.json({
          configured: true,
          hasProviderSession: true,
          providerStatus: result.status,
          onboardingVerified,
          onboardingChecks: updatedChecks,
          accessToken,
          user: sanitizeUserForClient({ ...user, onboardingChecks: updatedChecks, onboardingVerified }),
        });
      }
    }

    return res.json({
      configured: true,
      hasProviderSession: true,
      providerStatus: result.status,
      providerDecision: approved ? "APPROVED" : rejected ? "REJECTED" : "PENDING",
      providerMessage: rejected ? result.statusDetail : undefined,
      onboardingVerified,
      onboardingChecks: updatedChecks,
    });
  } catch {
    // A temporary provider timeout must not clear the account's session or
    // grant access. The UI silently retries this status check.
    return res.status(503).json({ error: "Verification status is temporarily unavailable. Retrying shortly." });
  }
});

// (The legacy POST /upload-aadhaar route was removed: no client called it, it
// wrote Aadhaar images to the public /uploads path, and it marked Aadhaar
// "verified" for any single uploaded file — a weaker shortcut around the real
// KYC flow below. Identity documents now go only through /submit-kyc.)

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
      return res.status(400).json({ error: "Please enter a correct 12-digit Aadhaar number." });
    }
    // Validate PAN only when it applies (CP always; Ambassador only if supplied).
    if ((!isAmbassador || panNumber) && !isValidPan(panNumber)) {
      return res.status(400).json({ error: "Please enter a correct PAN number, like ABCDE1234F." });
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

    // A structurally valid document is not proof of identity. Only a provider
    // result of APPROVED may unlock access; MANUAL_REVIEW stays pending until an
    // authorized admin reviews the submission.
    const provider = await runProviderKyc({
      aadhaarNumber,
      panNumber,
      aadhaarDocumentUrl: "",
      panDocumentUrl: "",
      selfieUrl: "",
    });
    const rejected = provider.outcome === "REJECTED";
    const approved = provider.outcome === "APPROVED";

    const onboardingChecks: OnboardingChecks = {
      ...(user.onboardingChecks ?? DEFAULT_ONBOARDING_CHECKS),
      // Carry the account's real email/phone verification (done at signup) onto
      // onboardingChecks — CP accounts don't otherwise track these, and without
      // them the account could never become fully onboarded after KYC.
      emailVerified: user.emailVerified || (user.onboardingChecks?.emailVerified ?? false),
      phoneVerified: user.phoneVerified || (user.onboardingChecks?.phoneVerified ?? false),
      aadhaarVerified: approved,
      panVerified: approved,
      kycStatus: approved ? "APPROVED" : rejected ? "REJECTED" : "PENDING",
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
        : rejected
          ? `Your identity verification was rejected. ${onboardingChecks.kycRejectionReason ?? ""} Please re-submit.`
          : "Your KYC documents were received and are awaiting manual review.";
      const [n] = await db.insert(notifications).values({ userId: user._id, message }).returning();
      emitNotification(String(user._id), n);
    } catch {
      /* non-fatal */
    }

    return res.json({
      message: approved
        ? "Identity verified — full access is now unlocked."
        : rejected
          ? `Verification failed. ${onboardingChecks.kycRejectionReason ?? ""}`.trim()
          : "Documents submitted successfully and are awaiting KYC review.",
      onboardingChecks,
      onboardingVerified,
    });
  },
);


export default router;
