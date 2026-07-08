import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { z } from "zod";
import { isValidObjectId, Types } from "mongoose";
import { authenticate, requireRole, AuthedRequest } from "../middleware/auth";
import { User } from "../models/User";
import { VerificationTask, TASK_LOCK_HOURS, TASK_PAYOUT_INR } from "../models/VerificationTask";
import { sendEmail } from "../services/emailService";
import { getEnv } from "../config/env";

/**
 * Truvi Ambassador portal — implements the Ambassador SOP end-to-end:
 *
 *   Step 0  Registration & verification: Aadhaar upload + phone OTP +
 *           email OTP. Profile goes Active only when all three are done;
 *           task listings are invisible until then.
 *   Step 1  Task listing (project name, address, map link, deadline).
 *   Step 2  Accept → YELLOW, locked exclusively for 6 hours (atomic
 *           compare-and-swap, same pattern as unit locking). Expired
 *           locks sweep back to GREEN.
 *   Step 3  Site-visit checklist: GPS on, internet on, live location.
 *   Step 4  Required document uploads.
 *   Done    Complete → RED → ₹500 payout entry (PENDING until settled
 *           from the Founder OS).
 *
 * Phone OTP note: no SMS gateway is configured, so the phone OTP is
 * delivered in dev mode (logged server-side and, outside production,
 * returned in the response). Swap `deliverPhoneOtp` for a real SMS
 * provider (MSG91/Twilio) without touching the flow.
 */

const router = Router();
router.use(authenticate);

const ambassadorOnly = requireRole("AMBASSADOR");

// ── Upload storage (Aadhaar + task documents) ───────────────────────────────
function getUploadsDir(): string {
  const env = getEnv();
  return env.uploadDir ? path.resolve(env.uploadDir) : path.resolve(__dirname, "../../../uploads");
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = getUploadsDir();
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `amb-${unique}${path.extname(file.originalname).toLowerCase()}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [".pdf", ".jpg", ".jpeg", ".png", ".webp"];
    if (allowed.includes(path.extname(file.originalname).toLowerCase())) cb(null, true);
    else cb(new Error("File type not allowed (PDF, JPG, PNG, WEBP)"));
  },
});

function fileUrl(filename: string): string {
  const env = getEnv();
  return `${env.publicUrl || "http://localhost:5000"}/uploads/${filename}`;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function generateOtp(): string {
  return String(crypto.randomInt(100000, 999999));
}

function deliverPhoneOtp(phone: string | undefined, otp: string) {
  // Dev-mode delivery — replace with a real SMS gateway when credentials exist.
  console.log(`[ambassador] Phone OTP for ${phone ?? "unknown"}: ${otp}`);
}

function isActive(user: { ambassadorProfile?: { aadhaarUrl?: string; phoneVerified: boolean; emailVerified: boolean } | null }) {
  const p = user.ambassadorProfile;
  return !!(p && p.aadhaarUrl && p.phoneVerified && p.emailVerified);
}

async function activateIfComplete(userId: string) {
  const user = await User.findById(userId);
  if (user && isActive(user) && !user.ambassadorProfile!.activatedAt) {
    user.set("ambassadorProfile.activatedAt", new Date());
    await user.save();
  }
  return user;
}

/** Sweep YELLOW tasks whose 6-hour lock expired back to GREEN (SOP rule). */
async function expireStaleTaskLocks() {
  await VerificationTask.updateMany(
    { status: "YELLOW", lockExpiresAt: { $lt: new Date() } },
    { status: "GREEN", lockedBy: null, lockedAt: null, lockExpiresAt: null },
  );
}

// ── Step 0: verification status + Aadhaar + OTPs ────────────────────────────

router.get("/me", ambassadorOnly, async (req: AuthedRequest, res) => {
  const user = await User.findById(req.user!.userId).select("name email phone ambassadorProfile");
  if (!user) return res.status(404).json({ error: "User not found" });
  const p = user.ambassadorProfile;
  res.json({
    name: user.name,
    email: user.email,
    phone: user.phone ?? null,
    aadhaarUploaded: !!p?.aadhaarUrl,
    phoneVerified: !!p?.phoneVerified,
    emailVerified: !!p?.emailVerified,
    active: isActive(user),
    tasksCompleted: p?.tasksCompleted ?? 0,
    totalEarnings: p?.totalEarnings ?? 0,
  });
});

router.post("/verify/aadhaar", ambassadorOnly, upload.single("file"), async (req: AuthedRequest, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  await User.findByIdAndUpdate(req.user!.userId, {
    "ambassadorProfile.aadhaarUrl": fileUrl(req.file.filename),
    "ambassadorProfile.aadhaarFileName": req.file.originalname,
  });
  const user = await activateIfComplete(req.user!.userId);
  res.json({ ok: true, active: user ? isActive(user) : false });
});

router.post("/verify/phone/send", ambassadorOnly, async (req: AuthedRequest, res) => {
  const user = await User.findById(req.user!.userId);
  if (!user) return res.status(404).json({ error: "User not found" });
  const otp = generateOtp();
  user.set("ambassadorProfile.phoneOtp", otp);
  user.set("ambassadorProfile.phoneOtpExpiresAt", new Date(Date.now() + 10 * 60 * 1000));
  await user.save();
  deliverPhoneOtp(user.phone, otp);
  // Outside production the OTP is returned so the flow is testable
  // without an SMS gateway.
  const dev = process.env.NODE_ENV !== "production";
  res.json({ ok: true, ...(dev ? { devOtp: otp } : {}) });
});

router.post("/verify/email/send", ambassadorOnly, async (req: AuthedRequest, res) => {
  const user = await User.findById(req.user!.userId);
  if (!user) return res.status(404).json({ error: "User not found" });
  const otp = generateOtp();
  user.set("ambassadorProfile.emailOtp", otp);
  user.set("ambassadorProfile.emailOtpExpiresAt", new Date(Date.now() + 10 * 60 * 1000));
  await user.save();
  sendEmail(
    user.email,
    "Your Truvi Ambassador verification code",
    `<p>Hi ${user.name},</p><p>Your Truvi Ambassador email verification code is <b style="font-size:18px">${otp}</b>. It expires in 10 minutes.</p>`,
  ).catch(console.error);
  const dev = process.env.NODE_ENV !== "production";
  res.json({ ok: true, ...(dev ? { devOtp: otp } : {}) });
});

const confirmSchema = z.object({ otp: z.string().length(6) });

function makeConfirmHandler(kind: "phone" | "email") {
  return async (req: AuthedRequest, res: Parameters<Parameters<Router["post"]>[1]>[1]) => {
    const parsed = confirmSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Enter the 6-digit code" });

    const user = await User.findById(req.user!.userId);
    if (!user?.ambassadorProfile) return res.status(404).json({ error: "Ambassador profile not found" });

    const p = user.ambassadorProfile as unknown as Record<string, unknown>;
    const stored = p[`${kind}Otp`] as string | null;
    const expires = p[`${kind}OtpExpiresAt`] as Date | null;

    if (!stored || !expires || expires < new Date()) {
      return res.status(400).json({ error: "Code expired — request a new one" });
    }
    if (stored !== parsed.data.otp) {
      return res.status(400).json({ error: "Incorrect code" });
    }

    user.set(`ambassadorProfile.${kind}Verified`, true);
    user.set(`ambassadorProfile.${kind}Otp`, null);
    user.set(`ambassadorProfile.${kind}OtpExpiresAt`, null);
    await user.save();
    const updated = await activateIfComplete(req.user!.userId);
    res.json({ ok: true, active: updated ? isActive(updated) : false });
  };
}

router.post("/verify/phone/confirm", ambassadorOnly, makeConfirmHandler("phone"));
router.post("/verify/email/confirm", ambassadorOnly, makeConfirmHandler("email"));

// ── Active-profile gate for everything task-related (SOP: no listings
//    are visible before verification completes) ─────────────────────────────

async function requireActiveAmbassador(req: AuthedRequest): Promise<boolean> {
  const user = await User.findById(req.user!.userId).select("ambassadorProfile");
  return !!user && isActive(user);
}

// ── Step 1: task listing ────────────────────────────────────────────────────

router.get("/tasks", ambassadorOnly, async (req: AuthedRequest, res) => {
  if (!(await requireActiveAmbassador(req))) {
    return res.status(403).json({ error: "Complete Aadhaar, phone and email verification to see tasks" });
  }
  await expireStaleTaskLocks();

  const me = new Types.ObjectId(req.user!.userId);
  const tasks = await VerificationTask.find({
    $or: [{ status: "GREEN" }, { status: "YELLOW", lockedBy: me }, { status: "RED", completedBy: me }],
  })
    .sort({ status: 1, createdAt: -1 })
    .limit(100)
    .populate("projectId", "name city");

  res.json({ tasks, payoutPerTask: TASK_PAYOUT_INR, lockHours: TASK_LOCK_HOURS });
});

// ── Step 2: atomic accept → YELLOW, 6h exclusive lock ───────────────────────

router.post("/tasks/:id/accept", ambassadorOnly, async (req: AuthedRequest, res) => {
  if (!isValidObjectId(req.params.id)) return res.status(400).json({ error: "Invalid task id" });
  if (!(await requireActiveAmbassador(req))) {
    return res.status(403).json({ error: "Complete verification before accepting tasks" });
  }

  const now = new Date();
  // Compare-and-swap: only a GREEN task (or a YELLOW one whose lock
  // already expired) can be claimed — MongoDB guarantees this
  // read+write is atomic, so two ambassadors can never both lock it.
  const task = await VerificationTask.findOneAndUpdate(
    {
      _id: req.params.id,
      $or: [{ status: "GREEN" }, { status: "YELLOW", lockExpiresAt: { $lt: now } }],
    },
    {
      status: "YELLOW",
      lockedBy: req.user!.userId,
      lockedAt: now,
      lockExpiresAt: new Date(now.getTime() + TASK_LOCK_HOURS * 60 * 60 * 1000),
      // Reset progress from any previous expired attempt
      "checklist.gpsOn": false,
      "checklist.internetOn": false,
      "checklist.liveLocation": null,
    },
    { new: true },
  );

  if (!task) return res.status(409).json({ error: "This task is locked by another ambassador right now" });
  res.json({ task });
});

// ── Step 3: site-visit checklist with live location ─────────────────────────

const checklistSchema = z.object({
  gpsOn: z.literal(true),
  internetOn: z.literal(true),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

router.post("/tasks/:id/checklist", ambassadorOnly, async (req: AuthedRequest, res) => {
  if (!isValidObjectId(req.params.id)) return res.status(400).json({ error: "Invalid task id" });
  const parsed = checklistSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "GPS on, internet on and a live location are all required" });
  }

  const task = await VerificationTask.findOneAndUpdate(
    { _id: req.params.id, status: "YELLOW", lockedBy: req.user!.userId, lockExpiresAt: { $gt: new Date() } },
    {
      "checklist.gpsOn": true,
      "checklist.internetOn": true,
      "checklist.liveLocation": { lat: parsed.data.lat, lng: parsed.data.lng, capturedAt: new Date() },
    },
    { new: true },
  );
  if (!task) return res.status(409).json({ error: "Task is not locked to you (or the 6-hour window expired)" });
  res.json({ task });
});

// ── Step 4: document uploads ────────────────────────────────────────────────

router.post("/tasks/:id/documents", ambassadorOnly, upload.single("file"), async (req: AuthedRequest, res) => {
  if (!isValidObjectId(req.params.id)) return res.status(400).json({ error: "Invalid task id" });
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const task = await VerificationTask.findOneAndUpdate(
    { _id: req.params.id, status: "YELLOW", lockedBy: req.user!.userId, lockExpiresAt: { $gt: new Date() } },
    { $push: { documents: { url: fileUrl(req.file.filename), fileName: req.file.originalname, uploadedAt: new Date() } } },
    { new: true },
  );
  if (!task) return res.status(409).json({ error: "Task is not locked to you (or the 6-hour window expired)" });
  res.json({ task });
});

// ── Complete → RED → ₹500 payout entry ──────────────────────────────────────

router.post("/tasks/:id/complete", ambassadorOnly, async (req: AuthedRequest, res) => {
  if (!isValidObjectId(req.params.id)) return res.status(400).json({ error: "Invalid task id" });

  const task = await VerificationTask.findOneAndUpdate(
    {
      _id: req.params.id,
      status: "YELLOW",
      lockedBy: req.user!.userId,
      lockExpiresAt: { $gt: new Date() },
      "checklist.gpsOn": true,
      "checklist.internetOn": true,
      "checklist.liveLocation": { $ne: null },
      "documents.0": { $exists: true },
    },
    {
      status: "RED",
      payoutStatus: "PENDING",
      completedBy: req.user!.userId,
      completedAt: new Date(),
    },
    { new: true },
  );
  if (!task) {
    return res.status(409).json({
      error: "Complete the site checklist and upload at least one document first (within the 6-hour window)",
    });
  }

  await User.findByIdAndUpdate(req.user!.userId, {
    $inc: { "ambassadorProfile.tasksCompleted": 1, "ambassadorProfile.totalEarnings": task.payoutAmount },
  });

  res.json({ task, earned: task.payoutAmount });
});

// ── Earnings ────────────────────────────────────────────────────────────────

router.get("/earnings", ambassadorOnly, async (req: AuthedRequest, res) => {
  const tasks = await VerificationTask.find({ completedBy: req.user!.userId, status: "RED" })
    .sort({ completedAt: -1 })
    .select("title address payoutAmount payoutStatus completedAt")
    .populate("projectId", "name");
  const total = tasks.reduce((s, t) => s + t.payoutAmount, 0);
  const paid = tasks.filter((t) => t.payoutStatus === "PAID").reduce((s, t) => s + t.payoutAmount, 0);
  res.json({ tasks, total, paid, pending: total - paid });
});

export default router;
