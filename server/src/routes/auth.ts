import { Router } from "express";
import bcrypt from "bcryptjs";
import multer from "multer";
import path from "path";
import fs from "fs";
import { User } from "../models/User";
import { Notification } from "../models/Notification";
import { isValidId } from "../lib/ids";
import { signupSchema, loginSchema } from "../lib/validations/auth";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../lib/jwt";
import { authenticate, AuthedRequest } from "../middleware/auth";
import { emitNotification, emitToRole } from "../sockets";
import { DEFAULT_CP_PROFILE, DEFAULT_BUYER_PROFILE } from "../db/schema";

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

  const existing = await User.findOne({ email: normalizedEmail }).lean();
  if (existing) {
    return res.status(409).json({ error: "An account with this email already exists" });
  }

  const hashedPassword = await bcrypt.hash(password, 12);

  const user = await User.create({
    name,
    email: normalizedEmail,
    password: hashedPassword,
    phone: phone || undefined,
    role,
    approvalStatus: "PENDING",
    ...(role === "DEVELOPER" ? { developerProfile: { companyName: companyName!, reraNumber } } : {}),
    ...(role === "CP" ? { cpProfile: { ...DEFAULT_CP_PROFILE } } : {}),
    ...(role === "BUYER" ? { buyerProfile: { ...DEFAULT_BUYER_PROFILE } } : {}),
  });

  // Notify all admins about the new pending account in real-time
  try {
    const admins = await User.find({ role: "ADMIN" }).select("_id").lean();
    const roleLabel = role === "BUYER" ? "Buyer" : role === "DEVELOPER" ? "Developer" : "Channel Partner";
    const message = `New ${roleLabel} account pending approval: ${name} (${normalizedEmail})`;

    await Promise.all(
      admins.map(async (admin) => {
        const notification = await Notification.create({ userId: admin._id, message });
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
  const user = await User.findOne({ email: email.toLowerCase().trim() });
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
    const user = await User.findById(userId).lean();
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
  const user = await User.findById(userId).lean();
  if (!user) return res.status(404).json({ error: "User not found" });
  const { password: _p, ...safeUser } = user;
  return res.json({ user: safeUser });
});

router.post("/verify-ambassador", authenticate, async (req: AuthedRequest, res) => {
  const userId = req.user!.userId;
  if (!isValidId(userId)) return res.status(404).json({ error: "User not found" });

  const user = await User.findById(userId);
  if (!user) return res.status(404).json({ error: "User not found" });
  if (user.role !== "CP") return res.status(403).json({ error: "Only ambassadors can complete this step" });

  const checks = {
    aadhaarVerified: Boolean(req.body?.aadhaarVerified),
    phoneVerified: Boolean(req.body?.phoneVerified),
    emailVerified: Boolean(req.body?.emailVerified),
  };

  user.onboardingChecks = checks;
  user.onboardingVerified = checks.aadhaarVerified && checks.phoneVerified && checks.emailVerified;
  await user.save();

  return res.json({
    onboardingVerified: user.onboardingVerified,
    onboardingChecks: user.onboardingChecks,
  });
});

router.post("/request-phone-otp", authenticate, async (req: AuthedRequest, res) => {
  const userId = req.user!.userId;
  if (!isValidId(userId)) return res.status(404).json({ error: "User not found" });

  const user = await User.findById(userId);
  if (!user) return res.status(404).json({ error: "User not found" });
  if (!user.phone) return res.status(400).json({ error: "Phone number not set" });

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  user.verification = user.verification || {};
  user.verification.phoneOtp = otp;
  user.verification.phoneOtpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 mins
  await user.save();

  // In production, send via SMS service (Twilio, AWS SNS, etc.)
  console.log(`[DEV] Phone OTP for ${user.phone}: ${otp}`);

  return res.json({ message: "OTP sent to phone", phone: user.phone });
});

router.post("/verify-phone-otp", authenticate, async (req: AuthedRequest, res) => {
  const userId = req.user!.userId;
  const { otp } = req.body;

  if (!otp) return res.status(400).json({ error: "OTP required" });
  if (!isValidId(userId)) return res.status(404).json({ error: "User not found" });

  const user = await User.findById(userId);
  if (!user) return res.status(404).json({ error: "User not found" });

  if (!user.verification?.phoneOtp || !user.verification?.phoneOtpExpiry) {
    return res.status(400).json({ error: "No OTP requested" });
  }

  if (user.verification.phoneOtpExpiry < new Date()) {
    return res.status(400).json({ error: "OTP expired" });
  }

  if (user.verification.phoneOtp !== otp) {
    return res.status(400).json({ error: "Invalid OTP" });
  }

  if (!user.onboardingChecks) {
    user.onboardingChecks = { aadhaarVerified: false, phoneVerified: false, emailVerified: false };
  }
  user.onboardingChecks.phoneVerified = true;
  user.verification.phoneOtp = undefined;
  user.verification.phoneOtpExpiry = undefined;
  
  const allVerified = user.onboardingChecks.phoneVerified && user.onboardingChecks.emailVerified && user.onboardingChecks.aadhaarVerified;
  if (allVerified) {
    user.onboardingVerified = true;
  }

  await user.save();

  return res.json({
    message: "Phone verified",
    onboardingChecks: user.onboardingChecks,
    onboardingVerified: user.onboardingVerified,
  });
});

router.post("/request-email-otp", authenticate, async (req: AuthedRequest, res) => {
  const userId = req.user!.userId;
  if (!isValidId(userId)) return res.status(404).json({ error: "User not found" });

  const user = await User.findById(userId);
  if (!user) return res.status(404).json({ error: "User not found" });

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  user.verification = user.verification || {};
  user.verification.emailOtp = otp;
  user.verification.emailOtpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 mins
  await user.save();

  // In production, send via email service (SendGrid, AWS SES, etc.)
  console.log(`[DEV] Email OTP for ${user.email}: ${otp}`);

  return res.json({ message: "OTP sent to email", email: user.email });
});

router.post("/verify-email-otp", authenticate, async (req: AuthedRequest, res) => {
  const userId = req.user!.userId;
  const { otp } = req.body;

  if (!otp) return res.status(400).json({ error: "OTP required" });
  if (!isValidId(userId)) return res.status(404).json({ error: "User not found" });

  const user = await User.findById(userId);
  if (!user) return res.status(404).json({ error: "User not found" });

  if (!user.verification?.emailOtp || !user.verification?.emailOtpExpiry) {
    return res.status(400).json({ error: "No OTP requested" });
  }

  if (user.verification.emailOtpExpiry < new Date()) {
    return res.status(400).json({ error: "OTP expired" });
  }

  if (user.verification.emailOtp !== otp) {
    return res.status(400).json({ error: "Invalid OTP" });
  }

  if (!user.onboardingChecks) {
    user.onboardingChecks = { aadhaarVerified: false, phoneVerified: false, emailVerified: false };
  }
  user.onboardingChecks.emailVerified = true;
  user.verification.emailOtp = undefined;
  user.verification.emailOtpExpiry = undefined;

  const allVerified = user.onboardingChecks.phoneVerified && user.onboardingChecks.emailVerified && user.onboardingChecks.aadhaarVerified;
  if (allVerified) {
    user.onboardingVerified = true;
  }

  await user.save();

  return res.json({
    message: "Email verified",
    onboardingChecks: user.onboardingChecks,
    onboardingVerified: user.onboardingVerified,
  });
});

router.post("/upload-aadhaar", authenticate, aadhaarUpload.single("aadhaar"), async (req: AuthedRequest, res) => {
  const userId = req.user!.userId;
  if (!req.file) return res.status(400).json({ error: "Aadhaar document required" });
  if (!isValidId(userId)) return res.status(404).json({ error: "User not found" });

  const user = await User.findById(userId);
  if (!user) return res.status(404).json({ error: "User not found" });

  // Store file reference
  user.verification = user.verification || {};
  user.verification.aadhaarDocumentUrl = `/uploads/aadhaar/${req.file.filename}`;
  if (!user.onboardingChecks) {
    user.onboardingChecks = { aadhaarVerified: false, phoneVerified: false, emailVerified: false };
  }
  user.onboardingChecks.aadhaarVerified = true;
  user.verification.aadhaarVerifiedAt = new Date();

  const allVerified = user.onboardingChecks.phoneVerified && user.onboardingChecks.emailVerified && user.onboardingChecks.aadhaarVerified;
  if (allVerified) {
    user.onboardingVerified = true;
  }

  await user.save();

  return res.json({
    message: "Aadhaar document uploaded and verified",
    onboardingChecks: user.onboardingChecks,
    onboardingVerified: user.onboardingVerified,
    aadhaarUrl: user.verification.aadhaarDocumentUrl,
  });
});


export default router;
