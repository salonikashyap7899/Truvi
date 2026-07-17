import { Router } from "express";
import bcrypt from "bcryptjs";
import multer from "multer";
import path from "path";
import fs from "fs";
import { eq } from "drizzle-orm";
import { getDb } from "../config/db";
import {
  users,
  notifications,
  IUser,
  OnboardingChecks,
  UserVerification,
  DEFAULT_CP_PROFILE,
  DEFAULT_BUYER_PROFILE,
  DEFAULT_ONBOARDING_CHECKS,
  isOnboardingComplete,
} from "../db/schema";
import { isValidId } from "../lib/ids";
import { signupSchema, loginSchema, verifyAccountSchema, resendOtpSchema } from "../lib/validations/auth";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../lib/jwt";
import { authenticate, AuthedRequest } from "../middleware/auth";
import { sendOtpEmail, sendPhoneOtpViaSms } from "../services/emailService";
import { isValidPan, isValidAadhaar, maskPan, runProviderKyc } from "../services/kycService";
import { emitNotification } from "../sockets";

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

// KYC bundle upload (Aadhaar doc + PAN doc + live selfie) for CP identity.
const kycDir = path.join(process.cwd(), "uploads", "kyc");
if (!fs.existsSync(kycDir)) fs.mkdirSync(kycDir, { recursive: true });
const kycUpload = multer({
  dest: kycDir,
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
 * Generate fresh email + phone OTPs for `user`, persist them (10-minute
 * expiry) and dispatch both an e-mail and an SMS. Shared by signup, resend
 * and the login-when-unverified path. Returns which channels were dispatched
 * so callers can warn the user if SMS/email isn't configured on the server.
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

  let emailSent = false;
  let smsSent = false;
  try {
    await sendOtpEmail(user.email, emailOtp);
    emailSent = true;
  } catch (err) {
    console.error("Failed to send verification email:", err);
  }
  if (user.phone) {
    try {
      // Returns false when Twilio isn't configured (the OTP is logged instead),
      // throws when configured but delivery fails.
      smsSent = await sendPhoneOtpViaSms(user.phone, phoneOtp);
    } catch (err) {
      console.error("Failed to send verification SMS:", err);
    }
  }
  return { emailSent, smsSent };
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
      approvalStatus: user.approvalStatus,
      emailVerified: user.emailVerified,
      phoneVerified: user.phoneVerified,
      onboardingVerified: user.onboardingVerified,
      onboardingChecks: user.onboardingChecks,
    },
  };
}

router.post("/signup", async (req, res) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });
  }

  const { name, email, password, phone, role, companyName, reraNumber } = parsed.data;
  const normalizedEmail = email.toLowerCase().trim();

  const db = getDb();
  const [existing] = await db.select({ _id: users._id }).from(users).where(eq(users.email, normalizedEmail));
  if (existing) {
    return res.status(409).json({ error: "An account with this email already exists" });
  }

  const hashedPassword = await bcrypt.hash(password, 12);

  // Admin account-approval has been removed — every account is auto-approved
  // and instead gated by email + phone OTP verification. New accounts start
  // unverified and must confirm the codes we send to their email AND phone
  // before they can log in.
  const [user] = await db
    .insert(users)
    .values({
      name,
      email: normalizedEmail,
      password: hashedPassword,
      phone,
      role,
      approvalStatus: "APPROVED",
      emailVerified: false,
      phoneVerified: false,
      ...(role === "DEVELOPER" ? { developerProfile: { companyName: companyName!, reraNumber } } : {}),
      ...(role === "CP" ? { cpProfile: { ...DEFAULT_CP_PROFILE } } : {}),
      ...(role === "BUYER" ? { buyerProfile: { ...DEFAULT_BUYER_PROFILE } } : {}),
      ...(role === "AMBASSADOR" ? { onboardingChecks: { ...DEFAULT_ONBOARDING_CHECKS } } : {}),
    })
    .returning();

  const { smsSent } = await issueVerificationOtps(user);

  return res.status(201).json({
    message: "Account created. Enter the codes we sent to your email and phone to verify your account.",
    needsVerification: true,
    email: user.email,
    phone: maskPhone(user.phone),
    smsSent,
    userId: user._id,
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

  // OTP gate: an account can't log in until BOTH email and phone are verified.
  // Send fresh codes and tell the client to route to the verification screen.
  if (!user.emailVerified || !user.phoneVerified) {
    const { smsSent } = await issueVerificationOtps(user);
    return res.status(403).json({
      error: "Please verify your account. We've sent fresh codes to your email and phone.",
      needsVerification: true,
      email: user.email,
      phone: maskPhone(user.phone),
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
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase().trim()));
  if (!user) return res.status(404).json({ error: "Account not found" });

  if (user.emailVerified && user.phoneVerified) {
    // Already verified — just log them in so a stale verify screen still works.
    return res.json(issueSession(res, user));
  }

  const v = user.verification;
  if (!v?.emailOtp || !v?.emailOtpExpiry || !v?.phoneOtp || !v?.phoneOtpExpiry) {
    return res.status(400).json({ error: "No codes requested. Please resend new codes." });
  }
  const now = new Date();
  if (new Date(v.emailOtpExpiry) < now || new Date(v.phoneOtpExpiry) < now) {
    return res.status(400).json({ error: "Codes expired. Please resend new codes." });
  }
  if (v.emailOtp !== emailOtp) {
    return res.status(400).json({ error: "Invalid email code", field: "emailOtp" });
  }
  if (v.phoneOtp !== phoneOtp) {
    return res.status(400).json({ error: "Invalid phone code", field: "phoneOtp" });
  }

  // Clear both OTPs and flip the flags. If the account already tracks onboarding
  // checks (CP / Ambassador), the email + phone steps are satisfied too.
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
    .set({
      emailVerified: true,
      phoneVerified: true,
      verification,
      ...(onboardingChecks ? { onboardingChecks } : {}),
    })
    .where(eq(users._id, user._id))
    .returning();

  return res.json(issueSession(res, updated));
});

// Public: resend BOTH verification OTPs for an unverified account.
router.post("/resend-otp", async (req, res) => {
  const parsed = resendOtpSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });
  }

  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.email, parsed.data.email.toLowerCase().trim()));
  // Don't reveal whether an email exists; respond the same either way.
  if (!user || (user.emailVerified && user.phoneVerified)) {
    return res.json({ message: "If that account needs verification, fresh codes have been sent." });
  }

  const { smsSent } = await issueVerificationOtps(user);
  return res.json({
    message: "Fresh 6-digit codes have been sent to your email and phone.",
    email: user.email,
    phone: maskPhone(user.phone),
    smsSent,
  });
});

router.post("/refresh", async (req, res) => {
  const token = req.cookies?.refreshToken;
  if (!token) return res.status(401).json({ error: "No refresh token" });

  try {
    const { userId } = verifyRefreshToken(token);
    if (!isValidId(userId)) return res.status(401).json({ error: "User not found" });
    const user = await findUserById(userId);
    if (!user) return res.status(401).json({ error: "User not found" });

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
  return res.json({ user: safeUser });
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

// CP identity submission: Aadhaar + PAN + live selfie in one go. Documents are
// stored and the submission is marked PENDING for review — access stays locked
// until a provider (see kycService) or an admin approves it.
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

    const files = req.files as Record<string, Express.Multer.File[]> | undefined;
    const aadhaarFile = files?.aadhaar?.[0];
    const panFile = files?.pan?.[0];
    const selfieFile = files?.selfie?.[0];
    if (!aadhaarFile || !panFile || !selfieFile) {
      return res.status(400).json({ error: "Aadhaar, PAN and a selfie are all required" });
    }

    const aadhaarNumber = String(req.body?.aadhaarNumber || "").replace(/\s/g, "");
    const panNumber = String(req.body?.panNumber || "").trim().toUpperCase();
    if (!isValidAadhaar(aadhaarNumber)) {
      return res.status(400).json({ error: "Enter a valid 12-digit Aadhaar number" });
    }
    if (!isValidPan(panNumber)) {
      return res.status(400).json({ error: "Enter a valid PAN (e.g. ABCDE1234F)" });
    }

    const user = await findUserById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const aadhaarDocumentUrl = `/uploads/kyc/${aadhaarFile.filename}`;
    const panDocumentUrl = `/uploads/kyc/${panFile.filename}`;
    const selfieUrl = `/uploads/kyc/${selfieFile.filename}`;

    // Let the provider hook decide automatically; with no provider it defers to
    // manual admin review, so we mark PENDING and leave the checks unverified.
    const provider = await runProviderKyc({ aadhaarNumber, panNumber, aadhaarDocumentUrl, panDocumentUrl, selfieUrl });
    const approved = provider.outcome === "APPROVED";
    const rejected = provider.outcome === "REJECTED";

    const onboardingChecks: OnboardingChecks = {
      ...(user.onboardingChecks ?? DEFAULT_ONBOARDING_CHECKS),
      aadhaarVerified: approved,
      panVerified: approved,
      kycStatus: approved ? "APPROVED" : rejected ? "REJECTED" : "PENDING",
      kycRejectionReason: rejected ? provider.reason ?? null : null,
    };
    const verification: UserVerification = {
      ...(user.verification ?? {}),
      aadhaarDocumentUrl,
      panDocumentUrl,
      selfieUrl,
      panNumberMasked: maskPan(panNumber),
      kycSubmittedAt: new Date().toISOString(),
      ...(approved ? { aadhaarVerifiedAt: new Date().toISOString() } : {}),
    };
    const onboardingVerified = isOnboardingComplete(onboardingChecks);

    const db = getDb();
    await db
      .update(users)
      .set({ onboardingChecks, verification, onboardingVerified })
      .where(eq(users._id, user._id));

    // Alert admins there's a KYC submission to review (real-time bell + toast).
    if (!approved) {
      try {
        const admins = await db.select({ _id: users._id }).from(users).where(eq(users.role, "ADMIN"));
        if (admins.length) {
          const message = `New identity verification to review: ${user.name} (${user.role}) submitted Aadhaar + PAN + selfie.`;
          const rows = await db.insert(notifications).values(admins.map((a) => ({ userId: a._id, message }))).returning();
          rows.forEach((n) => emitNotification(String(n.userId), n));
        }
      } catch {
        /* non-fatal */
      }
    }

    return res.json({
      message: approved
        ? "Identity verified — you're all set."
        : "Documents submitted. We'll verify your identity shortly.",
      onboardingChecks,
      onboardingVerified,
    });
  },
);


export default router;
