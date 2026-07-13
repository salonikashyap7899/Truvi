import { Router } from "express";
import bcrypt from "bcryptjs";
import multer from "multer";
import path from "path";
import fs from "fs";
import { eq } from "drizzle-orm";
import { getDb } from "../config/db";
import {
  users,
  IUser,
  OnboardingChecks,
  UserVerification,
  DEFAULT_CP_PROFILE,
  DEFAULT_BUYER_PROFILE,
  DEFAULT_ONBOARDING_CHECKS,
} from "../db/schema";
import { isValidId } from "../lib/ids";
import { signupSchema, loginSchema, verifyEmailSchema, resendOtpSchema } from "../lib/validations/auth";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../lib/jwt";
import { authenticate, AuthedRequest } from "../middleware/auth";
import { sendOtpEmail, sendPhoneOtpViaSms } from "../services/emailService";

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

/**
 * Generate a fresh email OTP for `user`, persist it (10-minute expiry) and
 * e-mail it. Shared by signup, resend and the login-when-unverified path.
 */
async function issueEmailOtp(user: IUser): Promise<void> {
  const otp = generateOtp();
  const verification: UserVerification = {
    ...(user.verification ?? {}),
    emailOtp: otp,
    emailOtpExpiry: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  };
  const db = getDb();
  await db.update(users).set({ verification }).where(eq(users._id, user._id));
  await sendOtpEmail(user.email, otp);
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
  // and instead gated by email OTP verification. New accounts start with
  // emailVerified = false and must confirm the code we e-mail them before they
  // can log in.
  const [user] = await db
    .insert(users)
    .values({
      name,
      email: normalizedEmail,
      password: hashedPassword,
      phone: phone || undefined,
      role,
      approvalStatus: "APPROVED",
      emailVerified: false,
      ...(role === "DEVELOPER" ? { developerProfile: { companyName: companyName!, reraNumber } } : {}),
      ...(role === "CP" ? { cpProfile: { ...DEFAULT_CP_PROFILE } } : {}),
      ...(role === "BUYER" ? { buyerProfile: { ...DEFAULT_BUYER_PROFILE } } : {}),
      ...(role === "AMBASSADOR" ? { onboardingChecks: { ...DEFAULT_ONBOARDING_CHECKS } } : {}),
    })
    .returning();

  try {
    await issueEmailOtp(user);
  } catch (err) {
    console.error("Failed to send signup verification email:", err);
    // The account exists; the user can request a fresh code from the verify
    // screen, so don't fail the signup outright.
  }

  return res.status(201).json({
    message: "Account created. Enter the 6-digit code we e-mailed you to verify your account.",
    needsEmailVerification: true,
    email: user.email,
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

  // Email OTP gate: an unverified account can't log in. Send a fresh code and
  // tell the client to route to the verification screen.
  if (!user.emailVerified) {
    try {
      await issueEmailOtp(user);
    } catch (err) {
      console.error("Failed to send login verification email:", err);
    }
    return res.status(403).json({
      error: "Please verify your email. We've sent a new 6-digit code.",
      needsEmailVerification: true,
      email: user.email,
    });
  }

  return res.json(issueSession(res, user));
});

// Public: confirm the emailed OTP, mark the account verified and log in.
router.post("/verify-email", async (req, res) => {
  const parsed = verifyEmailSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });
  }

  const { email, otp } = parsed.data;
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase().trim()));
  if (!user) return res.status(404).json({ error: "Account not found" });

  if (user.emailVerified) {
    // Already verified — just log them in so a stale verify screen still works.
    return res.json(issueSession(res, user));
  }

  if (!user.verification?.emailOtp || !user.verification?.emailOtpExpiry) {
    return res.status(400).json({ error: "No code requested. Please resend a new code." });
  }
  if (new Date(user.verification.emailOtpExpiry) < new Date()) {
    return res.status(400).json({ error: "Code expired. Please resend a new code." });
  }
  if (user.verification.emailOtp !== otp) {
    return res.status(400).json({ error: "Invalid code" });
  }

  // Clear the OTP and flip emailVerified. If the account already tracks
  // onboarding checks (CP / Ambassador), the email step is satisfied too.
  const verification: UserVerification = {
    ...(user.verification ?? {}),
    emailOtp: null,
    emailOtpExpiry: null,
  };
  const onboardingChecks: OnboardingChecks | undefined = user.onboardingChecks
    ? { ...user.onboardingChecks, emailVerified: true }
    : undefined;

  const [updated] = await db
    .update(users)
    .set({ emailVerified: true, verification, ...(onboardingChecks ? { onboardingChecks } : {}) })
    .where(eq(users._id, user._id))
    .returning();

  return res.json(issueSession(res, updated));
});

// Public: resend the email verification OTP for an unverified account.
router.post("/resend-email-otp", async (req, res) => {
  const parsed = resendOtpSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });
  }

  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.email, parsed.data.email.toLowerCase().trim()));
  // Don't reveal whether an email exists; respond the same either way.
  if (!user || user.emailVerified) {
    return res.json({ message: "If that account needs verification, a new code has been sent." });
  }

  try {
    await issueEmailOtp(user);
  } catch (err) {
    console.error("Failed to resend verification email:", err);
    return res.status(500).json({ error: "Failed to send verification email. Please try again." });
  }
  return res.json({ message: "A new 6-digit code has been sent to your email.", email: user.email });
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
  const onboardingVerified = checks.aadhaarVerified && checks.phoneVerified && checks.emailVerified;

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
  const onboardingVerified =
    onboardingChecks.phoneVerified && onboardingChecks.emailVerified && onboardingChecks.aadhaarVerified;

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
  const onboardingVerified =
    onboardingChecks.phoneVerified && onboardingChecks.emailVerified && onboardingChecks.aadhaarVerified;

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
  const onboardingVerified =
    onboardingChecks.phoneVerified && onboardingChecks.emailVerified && onboardingChecks.aadhaarVerified;

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


export default router;
