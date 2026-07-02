import { Router } from "express";
import bcrypt from "bcryptjs";
import { User } from "../models/User";
import { signupSchema, loginSchema } from "../lib/validations/auth";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../lib/jwt";
import { authenticate, AuthedRequest } from "../middleware/auth";

const router = Router();

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

  const existing = await User.findOne({ email: normalizedEmail });
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
    ...(role === "CP" ? { cpProfile: { isPremium: false, conversionRatio: 0, totalBookings: 0 } } : {}),
    ...(role === "BUYER" ? { buyerProfile: { savedProjectIds: [], compareProjectIds: [] } } : {}),
  });

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

  const payload = { userId: String(user._id), role: user.role, approvalStatus: user.approvalStatus };
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken({ userId: String(user._id) });

  res.cookie("refreshToken", refreshToken, REFRESH_COOKIE_OPTS);
  return res.json({
    accessToken,
    user: { id: user._id, name: user.name, email: user.email, role: user.role, approvalStatus: user.approvalStatus },
  });
});

router.post("/refresh", async (req, res) => {
  const token = req.cookies?.refreshToken;
  if (!token) return res.status(401).json({ error: "No refresh token" });

  try {
    const { userId } = verifyRefreshToken(token);
    const user = await User.findById(userId);
    if (!user) return res.status(401).json({ error: "User not found" });

    const accessToken = signAccessToken({ userId: String(user._id), role: user.role, approvalStatus: user.approvalStatus });
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
  const user = await User.findById(req.user!.userId).select("-password");
  if (!user) return res.status(404).json({ error: "User not found" });
  return res.json({ user });
});

export default router;
