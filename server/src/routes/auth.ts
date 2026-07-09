import { Router, Response } from "express";
import bcrypt from "bcryptjs";
import multer from "multer";
import path from "path";
import fs from "fs";
import { eq, or } from "drizzle-orm";
import { getDb } from "../config/db";
import {
  users,
  notifications,
  DEFAULT_CP_PROFILE,
  DEFAULT_BUYER_PROFILE,
  DEFAULT_ONBOARDING_CHECKS,
  OnboardingChecks,
  UserVerification,
} from "../db/schema";
import {
  generateCode,
  hashCode,
  verifyCode,
  deliverOtp,
  isChannelLive,
  OTP_TTL_MS,
  OTP_RESEND_COOLDOWN_MS,
  OTP_MAX_ATTEMPTS,
} from "../services/otpService";
import { isValidId } from "../lib/ids";
import { signupSchema, loginSchema } from "../lib/validations/auth";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../lib/jwt";
import { authenticate, AuthedRequest } from "../middleware/auth";
import { emitNotification, emitToRole } from "../sockets";

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
// (server-only Render deploy — see README), so the refresh cookie must be
// sent cross-site. SameSite=None requires Secure, which is only true in
// production; locally both run on localhost (different ports but the same
// site), where "lax" already works fine.
const REFRESH_COOKIE_OPTS = {
  httpOnly: true,
  secure: isProduction,
  sameSite: (isProduction ? "none" : "lax") as "none" | "lax",
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
};

router.post("/signup", async (req, res) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });
  }

  const { name, email, password, phone, role, companyName, reraNumber } = parsed.data;
  const normalizedEmail = email.toLowerCase().trim();
  const normalizedPhone = phone.trim();
  const db = getDb();

  // One account per person: neither the email nor the mobile number may
  // already belong to an existing account.
  const existingUsers = await db
    .select({ email: users.email, phone: users.phone })
    .from(users)
    .where(or(eq(users.email, normalizedEmail), eq(users.phone, normalizedPhone)));
  if (existingUsers.some((u) => u.email === normalizedEmail)) {
    return res.status(409).json({ error: "An account with this email already exists" });
  }
  if (existingUsers.some((u) => u.phone === normalizedPhone)) {
    return res.status(409).json({ error: "An account with this mobile number already exists" });
  }

  const hashedPassword = await bcrypt.hash(password, 12);

  const [user] = await db
    .insert(users)
    .values({
      name,
      email: normalizedEmail,
      password: hashedPassword,
      phone: normalizedPhone,
      role,
      approvalStatus: "PENDING",
      ...(role === "DEVELOPER" ? { developerProfile: { companyName: companyName!, reraNumber } } : {}),
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
        const [notification] = await db.insert(notifications).values({ userId: admin._id, message }).returning();
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

  const { email, password } = parsed.data;
  const db = getDb();
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

  res.cookie("refreshToken", refreshToken, REFRESH_COOKIE_OPTS);
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

/**
 * Shared OTP request handler for both channels. Generates a code, stores only
 * its salted hash, enforces a resend cooldown, and dispatches via the real
 * provider (SMS/email) — falling back to a server-log in dev when no provider
 * is configured.
 */
async function handleOtpRequest(req: AuthedRequest, res: Response, channel: "phone" | "email") {
  const userId = req.user!.userId;
  if (!isValidId(userId)) return res.status(404).json({ error: "User not found" });

  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users._id, userId)).limit(1);
  if (!user) return res.status(404).json({ error: "User not found" });

  const destination = channel === "phone" ? user.phone : user.email;
  if (!destination) return res.status(400).json({ error: `No ${channel} on file for this account` });

  const v = user.verification ?? {};
  const lastSent = channel === "phone" ? v.phoneOtpLastSent : v.emailOtpLastSent;
  if (lastSent && Date.now() - new Date(lastSent).getTime() < OTP_RESEND_COOLDOWN_MS) {
    const waitSec = Math.ceil((OTP_RESEND_COOLDOWN_MS - (Date.now() - new Date(lastSent).getTime())) / 1000);
    return res.status(429).json({ error: `Please wait ${waitSec}s before requesting another code` });
  }

  const code = generateCode();
  const expiry = new Date(Date.now() + OTP_TTL_MS).toISOString();
  const now = new Date().toISOString();
  const verification: UserVerification =
    channel === "phone"
      ? { ...v, phoneOtpHash: hashCode(code), phoneOtpExpiry: expiry, phoneOtpAttempts: 0, phoneOtpLastSent: now }
      : { ...v, emailOtpHash: hashCode(code), emailOtpExpiry: expiry, emailOtpAttempts: 0, emailOtpLastSent: now };

  try {
    await deliverOtp(channel, destination, code);
  } catch (err) {
    console.error(`Failed to deliver ${channel} OTP:`, err);
    return res.status(502).json({ error: `Could not send the code right now. Please try again shortly.` });
  }

  // Only persist the hash after successful dispatch, so a delivery failure
  // doesn't leave an unusable pending code on the account.
  await db.update(users).set({ verification }).where(eq(users._id, userId));

  if (!isChannelLive(channel)) {
    console.log(`[DEV] ${channel} OTP for ${destination}: ${code} (no provider configured — see .env)`);
  }

  return res.json({
    message: `OTP sent to ${channel}`,
    [channel]: destination,
    delivery: isChannelLive(channel) ? "sent" : "dev-logged",
  });
}

/**
 * Shared OTP verify handler. Constant-time hash compare, expiry check, and a
 * max-attempts cap that invalidates the code after too many wrong guesses.
 */
async function handleOtpVerify(req: AuthedRequest, res: Response, channel: "phone" | "email") {
  const userId = req.user!.userId;
  const { otp } = req.body;

  if (!otp || typeof otp !== "string") return res.status(400).json({ error: "OTP required" });
  if (!isValidId(userId)) return res.status(404).json({ error: "User not found" });

  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users._id, userId)).limit(1);
  if (!user) return res.status(404).json({ error: "User not found" });

  const v = user.verification ?? {};
  const storedHash = channel === "phone" ? v.phoneOtpHash : v.emailOtpHash;
  const expiry = channel === "phone" ? v.phoneOtpExpiry : v.emailOtpExpiry;
  const attempts = (channel === "phone" ? v.phoneOtpAttempts : v.emailOtpAttempts) ?? 0;

  if (!storedHash || !expiry) return res.status(400).json({ error: "No OTP requested" });
  if (new Date(expiry) < new Date()) return res.status(400).json({ error: "OTP expired" });
  if (attempts >= OTP_MAX_ATTEMPTS) {
    return res.status(429).json({ error: "Too many incorrect attempts. Request a new code." });
  }

  if (!verifyCode(otp, storedHash)) {
    // Count the failed attempt so the code can't be brute-forced.
    const bumped: UserVerification =
      channel === "phone" ? { ...v, phoneOtpAttempts: attempts + 1 } : { ...v, emailOtpAttempts: attempts + 1 };
    await db.update(users).set({ verification: bumped }).where(eq(users._id, userId));
    return res.status(400).json({ error: "Invalid OTP" });
  }

  const onboardingChecks: OnboardingChecks = {
    ...(user.onboardingChecks ?? DEFAULT_ONBOARDING_CHECKS),
    ...(channel === "phone" ? { phoneVerified: true } : { emailVerified: true }),
  };
  // Clear the consumed code + counters for this channel.
  const verification: UserVerification = { ...v };
  if (channel === "phone") {
    verification.phoneOtpHash = null;
    verification.phoneOtpExpiry = null;
    verification.phoneOtpAttempts = 0;
  } else {
    verification.emailOtpHash = null;
    verification.emailOtpExpiry = null;
    verification.emailOtpAttempts = 0;
  }

  const onboardingVerified =
    onboardingChecks.phoneVerified && onboardingChecks.emailVerified && onboardingChecks.aadhaarVerified;

  await db
    .update(users)
    .set({
      onboardingChecks,
      verification,
      ...(onboardingVerified ? { onboardingVerified: true } : {}),
    })
    .where(eq(users._id, userId));

  return res.json({
    message: channel === "phone" ? "Phone verified" : "Email verified",
    onboardingChecks,
    onboardingVerified: onboardingVerified || user.onboardingVerified,
  });
}

router.post("/request-phone-otp", authenticate, (req: AuthedRequest, res) => handleOtpRequest(req, res, "phone"));
router.post("/verify-phone-otp", authenticate, (req: AuthedRequest, res) => handleOtpVerify(req, res, "phone"));
router.post("/request-email-otp", authenticate, (req: AuthedRequest, res) => handleOtpRequest(req, res, "email"));
router.post("/verify-email-otp", authenticate, (req: AuthedRequest, res) => handleOtpVerify(req, res, "email"));

router.post("/upload-aadhaar", authenticate, aadhaarUpload.single("aadhaar"), async (req: AuthedRequest, res) => {
  const userId = req.user!.userId;
  if (!req.file) return res.status(400).json({ error: "Aadhaar document required" });
  if (!isValidId(userId)) return res.status(404).json({ error: "User not found" });

  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users._id, userId)).limit(1);
  if (!user) return res.status(404).json({ error: "User not found" });

  // Store file reference
  const verification: UserVerification = {
    ...(user.verification ?? {}),
    aadhaarDocumentUrl: `/uploads/aadhaar/${req.file.filename}`,
    aadhaarVerifiedAt: new Date().toISOString(),
  };
  const onboardingChecks: OnboardingChecks = {
    ...(user.onboardingChecks ?? DEFAULT_ONBOARDING_CHECKS),
    aadhaarVerified: true,
  };

  const onboardingVerified =
    onboardingChecks.phoneVerified && onboardingChecks.emailVerified && onboardingChecks.aadhaarVerified;

  await db
    .update(users)
    .set({
      verification,
      onboardingChecks,
      ...(onboardingVerified ? { onboardingVerified: true } : {}),
    })
    .where(eq(users._id, userId));

  return res.json({
    message: "Aadhaar document uploaded and verified",
    onboardingChecks,
    onboardingVerified: onboardingVerified || user.onboardingVerified,
    aadhaarUrl: verification.aadhaarDocumentUrl,
  });
});


export default router;
