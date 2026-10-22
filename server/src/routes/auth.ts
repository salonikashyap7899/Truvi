import { Router } from "express";
import * as authController from "../controllers/authController";
import { findUserById, generateOtp, maskPhone, TOO_MANY_OTP, issueSession } from "../services/authService";
import { zodMessage } from "../lib/validationError";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import multer from "multer";
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
import { loginLimiter, otpSendLimiter, otpVerifyLimiter } from "../middleware/security";
import { sendOtpEmail, sendPhoneOtpViaSms, sendPasswordResetEmail } from "../services/emailService";
import { sendWelcomeEmailOnce } from "../services/lifecycleEmails";
import { isValidPan, isValidAadhaar, maskPan, runProviderKyc } from "../services/kycService";
import { emitNotification } from "../sockets";
import { sendDeveloperWelcome, sendWhatsAppCampaign } from "../services/whatsappService";
import { notifyUser, notifyRole } from "../services/notificationService";
import { logAudit } from "../services/audit";
import { isFounderEmail } from "../config/env";
import { otpAttemptBlocked, recordOtpFailure, clearOtpAttempts } from "../services/otpAttempts";
import { sanitizeUserForClient } from "../lib/sanitizeUser";

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
  const safeUser = sanitizeUserForClient(updated);
  return res.json({ user: { ...safeUser, isFounder: isFounderEmail(updated.email) } });
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
  clearOtpAttempts(`phone:${userId}`);

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
  if (otpAttemptBlocked(attemptKey)) return res.status(429).json({ error: TOO_MANY_OTP });

  if (!user.verification?.phoneOtp || !user.verification?.phoneOtpExpiry) {
    return res.status(400).json({ error: "No OTP requested" });
  }

  if (new Date(user.verification.phoneOtpExpiry) < new Date()) {
    return res.status(400).json({ error: "OTP expired" });
  }

  if (user.verification.phoneOtp !== otp) {
    recordOtpFailure(attemptKey);
    return res.status(400).json({ error: "Invalid OTP" });
  }
  clearOtpAttempts(attemptKey);

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
  clearOtpAttempts(`email:${userId}`);

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
  if (otpAttemptBlocked(attemptKey)) return res.status(429).json({ error: TOO_MANY_OTP });

  if (!user.verification?.emailOtp || !user.verification?.emailOtpExpiry) {
    return res.status(400).json({ error: "No OTP requested" });
  }

  if (new Date(user.verification.emailOtpExpiry) < new Date()) {
    return res.status(400).json({ error: "OTP expired" });
  }

  if (user.verification.emailOtp !== otp) {
    recordOtpFailure(attemptKey);
    return res.status(400).json({ error: "Invalid OTP" });
  }
  clearOtpAttempts(attemptKey);

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
