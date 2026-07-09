import { Router } from "express";
import bcrypt from "bcryptjs";
import multer from "multer";
import path from "path";
import fs from "fs";
import { and, eq } from "drizzle-orm";
import { getDb } from "../config/db";
import {
  users,
  notifications,
  DEFAULT_CP_PROFILE,
  DEFAULT_BUYER_PROFILE,
  DEFAULT_ONBOARDING_CHECKS,
  type OnboardingChecks,
  type VerificationState,
} from "../db/schema";
import { isValidId } from "../lib/ids";
import { signupSchema, loginSchema } from "../lib/validations/auth";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../lib/jwt";
import { authenticate, AuthedRequest } from "../middleware/auth";
import { emitNotification, emitToRole } from "../sockets";
import { getEnv } from "../config/env";
import { uploadsRoot } from "../services/uploadService";

const router = Router();

// Setup multer for Aadhaar document upload — nested under the shared uploads
// root so writes and the /uploads static handler always agree.
const uploadDir = path.join(uploadsRoot(), "aadhaar");
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


// Refresh-cookie policy is driven by env (see config/env.ts):
//  - Cross-origin split (Render API + Vercel frontend): SameSite=None; Secure.
//  - Single-origin deploy (one VPS serving API + built frontend): SameSite=Lax.
// Read per-request so it always reflects the current environment.
function refreshCookieOpts() {
  const env = getEnv();
  return {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: env.cookieSameSite,
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  };
}

router.post("/signup", async (req, res) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });
  }

  const db = getDb();
  const { name, email, password, phone, role, companyName, reraNumber } = parsed.data;
  const normalizedEmail = email.toLowerCase().trim();

  const [existing] = await db.select({ _id: users._id }).from(users).where(eq(users.email, normalizedEmail)).limit(1);
  if (existing) {
    return res.status(409).json({ error: "An account with this email already exists" });
  }

  const hashedPassword = await bcrypt.hash(password, 12);

  const [user] = await db
    .insert(users)
    .values({
      name,
      email: normalizedEmail,
      password: hashedPassword,
      phone: phone || null,
      role,
      approvalStatus: "PENDING",
      ...(role === "DEVELOPER"
        ? { developerProfile: { companyName: companyName!, reraNumber } }
        : {}),
      ...(role === "CP" ? { cpProfile: { ...DEFAULT_CP_PROFILE } } : {}),
      ...(role === "BUYER" ? { buyerProfile: { ...DEFAULT_BUYER_PROFILE } } : {}),
    })
    .returning();

  // Notify all admins about the new pending account in real-time
  try {
    const admins = await db.select({ _id: users._id }).from(users).where(eq(users.role, "ADMIN"));
    const roleLabel = role === "BUYER" ? "Buyer" : role === "DEVELOPER" ? "Developer" : "Channel Partner";
    const message = `New ${roleLabel} account pending approval: ${name} (${normalizedEmail})`;

    await Promise.all(
      admins.map(async (admin) => {
        const [notification] = await db
          .insert(notifications)
          .values({ userId: admin._id, message })
          .returning();
        emitNotification(String(admin._id), notification);
      })
    );

    // Also emit a role-level event so the admin dashboard list refreshes live
    emitToRole("ADMIN", "user:pending", {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      approvalStatus: user.approvalStatus,
      developerProfile: user.developerProfile,
    });
  } catch (err) {
    console.error("Failed to notify admins on signup:", err);
  }

  return res.status(201).json({
    message: "Account created. An admin will review and approve your account before you can access the platform.",
    userId: user._id,
  });
});

router.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });
  }

  const db = getDb();
  const { email, password } = parsed.data;
  const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase().trim())).limit(1);
  if (!user) return res.status(401).json({ error: "Invalid email or password" });

  const isValid = await bcrypt.compare(password, user.password);
  if (!isValid) return res.status(401).json({ error: "Invalid email or password" });

  const payload = {
    userId: String(user._id),
    role: user.role,
    approvalStatus: user.approvalStatus,
    onboardingVerified: user.onboardingVerified,
  };
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken({ userId: String(user._id) });

  res.cookie("refreshToken", refreshToken, refreshCookieOpts());
  return res.json({
    accessToken,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      approvalStatus: user.approvalStatus,
      onboardingVerified: user.onboardingVerified,
      onboardingChecks: user.onboardingChecks,
    },
  });
});

router.post("/refresh", async (req, res) => {
  const token = req.cookies?.refreshToken;
  if (!token) return res.status(401).json({ error: "No refresh token" });

  try {
    const { userId } = verifyRefreshToken(token);
    if (!isValidId(userId)) return res.status(401).json({ error: "User not found" });
    const db = getDb();
    const [user] = await db.select().from(users).where(eq(users._id, userId)).limit(1);
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
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users._id, userId)).limit(1);
  if (!user) return res.status(404).json({ error: "User not found" });
  const { password: _p, ...safeUser } = user;
  return res.json({ user: safeUser });
});

router.post("/verify-ambassador", authenticate, async (req: AuthedRequest, res) => {
  const userId = req.user!.userId;
  if (!isValidId(userId)) return res.status(404).json({ error: "User not found" });

  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users._id, userId)).limit(1);
  if (!user) return res.status(404).json({ error: "User not found" });
  if (user.role !== "CP") return res.status(403).json({ error: "Only ambassadors can complete this step" });

  const checks: OnboardingChecks = {
    aadhaarVerified: Boolean(req.body?.aadhaarVerified),
    phoneVerified: Boolean(req.body?.phoneVerified),
    emailVerified: Boolean(req.body?.emailVerified),
  };
  const onboardingVerified = checks.aadhaarVerified && checks.phoneVerified && checks.emailVerified;

  await db
    .update(users)
    .set({ onboardingChecks: checks, onboardingVerified })
    .where(eq(users._id, userId));

  return res.json({
    onboardingVerified,
    onboardingChecks: checks,
  });
});

router.post("/request-phone-otp", authenticate, async (req: AuthedRequest, res) => {
  const userId = req.user!.userId;
  if (!isValidId(userId)) return res.status(404).json({ error: "User not found" });

  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users._id, userId)).limit(1);
  if (!user) return res.status(404).json({ error: "User not found" });
  if (!user.phone) return res.status(400).json({ error: "Phone number not set" });

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const verification: VerificationState = {
    ...(user.verification ?? {}),
    phoneOtp: otp,
    phoneOtpExpiry: new Date(Date.now() + 10 * 60 * 1000).toISOString(), // 10 mins
  };
  await db.update(users).set({ verification }).where(eq(users._id, userId));

  // In production, send via SMS service (Twilio, AWS SNS, etc.)
  console.log(`[DEV] Phone OTP for ${user.phone}: ${otp}`);

  return res.json({ message: "OTP sent to phone", phone: user.phone });
});

router.post("/verify-phone-otp", authenticate, async (req: AuthedRequest, res) => {
  const userId = req.user!.userId;
  const { otp } = req.body;

  if (!otp) return res.status(400).json({ error: "OTP required" });
  if (!isValidId(userId)) return res.status(404).json({ error: "User not found" });

  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users._id, userId)).limit(1);
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

  const checks: OnboardingChecks = {
    ...(user.onboardingChecks ?? DEFAULT_ONBOARDING_CHECKS),
    phoneVerified: true,
  };
  const verification: VerificationState = {
    ...(user.verification ?? {}),
    phoneOtp: null,
    phoneOtpExpiry: null,
  };
  const onboardingVerified = checks.phoneVerified && checks.emailVerified && checks.aadhaarVerified;

  await db
    .update(users)
    .set({ onboardingChecks: checks, verification, onboardingVerified })
    .where(eq(users._id, userId));

  return res.json({
    message: "Phone verified",
    onboardingChecks: checks,
    onboardingVerified,
  });
});

router.post("/request-email-otp", authenticate, async (req: AuthedRequest, res) => {
  const userId = req.user!.userId;
  if (!isValidId(userId)) return res.status(404).json({ error: "User not found" });

  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users._id, userId)).limit(1);
  if (!user) return res.status(404).json({ error: "User not found" });

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const verification: VerificationState = {
    ...(user.verification ?? {}),
    emailOtp: otp,
    emailOtpExpiry: new Date(Date.now() + 10 * 60 * 1000).toISOString(), // 10 mins
  };
  await db.update(users).set({ verification }).where(eq(users._id, userId));

  // In production, send via email service (SendGrid, AWS SES, etc.)
  console.log(`[DEV] Email OTP for ${user.email}: ${otp}`);

  return res.json({ message: "OTP sent to email", email: user.email });
});

router.post("/verify-email-otp", authenticate, async (req: AuthedRequest, res) => {
  const userId = req.user!.userId;
  const { otp } = req.body;

  if (!otp) return res.status(400).json({ error: "OTP required" });
  if (!isValidId(userId)) return res.status(404).json({ error: "User not found" });

  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users._id, userId)).limit(1);
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

  const checks: OnboardingChecks = {
    ...(user.onboardingChecks ?? DEFAULT_ONBOARDING_CHECKS),
    emailVerified: true,
  };
  const verification: VerificationState = {
    ...(user.verification ?? {}),
    emailOtp: null,
    emailOtpExpiry: null,
  };
  const onboardingVerified = checks.phoneVerified && checks.emailVerified && checks.aadhaarVerified;

  await db
    .update(users)
    .set({ onboardingChecks: checks, verification, onboardingVerified })
    .where(eq(users._id, userId));

  return res.json({
    message: "Email verified",
    onboardingChecks: checks,
    onboardingVerified,
  });
});

router.post("/upload-aadhaar", authenticate, aadhaarUpload.single("aadhaar"), async (req: AuthedRequest, res) => {
  const userId = req.user!.userId;
  if (!req.file) return res.status(400).json({ error: "Aadhaar document required" });
  if (!isValidId(userId)) return res.status(404).json({ error: "User not found" });

  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users._id, userId)).limit(1);
  if (!user) return res.status(404).json({ error: "User not found" });

  const aadhaarDocumentUrl = `/uploads/aadhaar/${req.file.filename}`;
  const verification: VerificationState = {
    ...(user.verification ?? {}),
    aadhaarDocumentUrl,
    aadhaarVerifiedAt: new Date().toISOString(),
  };
  const checks: OnboardingChecks = {
    ...(user.onboardingChecks ?? DEFAULT_ONBOARDING_CHECKS),
    aadhaarVerified: true,
  };
  const onboardingVerified = checks.phoneVerified && checks.emailVerified && checks.aadhaarVerified;

  await db
    .update(users)
    .set({ onboardingChecks: checks, verification, onboardingVerified })
    .where(eq(users._id, userId));

  return res.json({
    message: "Aadhaar document uploaded and verified",
    onboardingChecks: checks,
    onboardingVerified,
    aadhaarUrl: aadhaarDocumentUrl,
  });
});


export default router;
