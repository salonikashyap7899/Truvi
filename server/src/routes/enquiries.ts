import { Router } from "express";
import { zodMessage } from "../lib/validationError";
import multer from "multer";
import path from "path";
import fs from "fs";
import { z } from "zod";
import { desc } from "drizzle-orm";
import { getDb } from "../config/db";
import { CURRENT_POLICY_VERSIONS } from "../config/compliance";
import { enquiries } from "../db/schema";
import { isValidId } from "../lib/ids";
import { authenticate, requireRole, AuthedRequest } from "../middleware/auth";
import { notifyRole } from "../services/notificationService";
import { emitToRole } from "../sockets";
import { getEnv } from "../config/env";
import { enquiryLimiter } from "../middleware/security";
import { fileMatchesExtension, randomFileStem } from "../services/uploadService";

const router = Router();

// ── Multer setup for enquiry uploads (no auth required) ──────────────────────
function getUploadsDir(): string {
  const env = getEnv();
  return env.uploadDir ? path.resolve(env.uploadDir) : path.resolve(__dirname, "../../../uploads");
}

const enquiryStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = getUploadsDir();
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  // Random, unguessable name (the old ms-timestamp names could be guessed);
  // the extension is lower-cased and checked against the allowlist below.
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `enquiry-${randomFileStem()}${ext}`);
  },
});

const enquiryUpload = multer({
  storage: enquiryStorage,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 }, // 5 MB, one file
  fileFilter: (_req, file, cb) => {
    const allowed = [".pdf", ".jpg", ".jpeg", ".png", ".webp", ".doc", ".docx"];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error("File type not allowed"));
  },
});

const enquirySchema = z.object({
  email: z.string().email("Valid email required"),
  name: z.string().min(1, "Name required"),
  purposeType: z.enum(["BUYER", "DEVELOPER", "CP", "GUEST"]),
  message: z.string().max(4000).optional(),
  projectId: z.string().optional(),
  projectName: z.string().optional(),
  privacyNoticeAcknowledged: z.preprocess((value) => value === true || value === "true", z.literal(true)),
  phone: z.string().trim().optional(),
  investorClub: z.preprocess((value) => value === true || value === "true", z.boolean()).optional(),
  city: z.string().trim().max(100).optional(),
  profession: z.string().trim().max(120).optional(),
  experience: z.string().max(80).optional(),
  geography: z.string().trim().max(160).optional(),
  capacity: z.string().max(80).optional(),
  horizon: z.string().max(40).optional(),
  contactTime: z.string().max(40).optional(),
  website: z.string().max(200).optional(),
});

/** Remove a just-uploaded attachment from a rejected enquiry (never stored data). */
function discardUpload(file?: Express.Multer.File) {
  if (file?.path) fs.promises.unlink(file.path).catch(() => {});
}

// POST /api/enquiries  — public, no auth needed. Rate-limited (it accepts a
// file from anyone) and the file must really be the type its name claims.
router.post("/", enquiryLimiter, enquiryUpload.single("file"), async (req, res) => {
  const parsed = enquirySchema.safeParse(req.body);
  if (!parsed.success) {
    discardUpload(req.file);
    return res.status(400).json({ error: zodMessage(parsed.error), issues: parsed.error.flatten() });
  }
  if (parsed.data.investorClub) {
    const {
      name, phone, city, experience, capacity, horizon, contactTime, website,
    } = parsed.data;
    const validPhone = /^(?:\\+?91[\\-\\s]?)?[6-9]\\d{9}$/.test((phone || "").replace(/[()]/g, "").trim());
    const allowedExperience = ["New to real-estate investing", "Exploring real-estate investment", "Some prior experience", "Experienced investor"];
    const allowedCapacity = ["Prefer to discuss", "Below ₹10 lakh", "₹10–25 lakh", "₹25–50 lakh", "₹50 lakh–₹1 crore", "₹1–5 crore", "Above ₹5 crore"];
    const allowedHorizon = ["Below 2 years", "2–3 years", "3–5 years", "5+ years", "To be discussed"];
    const allowedContactTime = ["Business hours", "Morning", "Afternoon", "Evening"];
    if (name.trim().length < 2 || name.length > 120) {
      discardUpload(req.file);
      return res.status(400).json({ error: "Please enter your full name." });
    }
    if (!validPhone) {
      discardUpload(req.file);
      return res.status(400).json({ error: "Please enter a valid Indian mobile number." });
    }
    if ((city || "").trim().length < 2) {
      discardUpload(req.file);
      return res.status(400).json({ error: "Please enter your city." });
    }
    if (!experience || !allowedExperience.includes(experience) ||
        !capacity || !allowedCapacity.includes(capacity) ||
        !horizon || !allowedHorizon.includes(horizon) ||
        !contactTime || !allowedContactTime.includes(contactTime)) {
      discardUpload(req.file);
      return res.status(400).json({ error: "Please check the investor preference fields and try again." });
    }
    // Quietly accept honeypot submissions without creating an enquiry record.
    if (website?.trim()) return res.status(201).json({ ok: true });
  }
  if (req.file && !fileMatchesExtension(req.file.path, path.extname(req.file.filename))) {
    discardUpload(req.file);
    return res.status(400).json({ error: "That file doesn't look like a valid PDF, image or Word document." });
  }

  const { email, name, purposeType, message, projectId, projectName } = parsed.data;
  const investorClub = parsed.data.investorClub === true;
  const normalizedPhone = investorClub
    ? (parsed.data.phone || "").replace(/[^\\d]/g, "").replace(/^91(?=\\d{10}$)/, "")
    : undefined;
  const storedMessage = investorClub
    ? [
        "[TRUVI INVESTOR CLUB — EXPRESSION OF INTEREST]",
        `City: ${parsed.data.city}`,
        `Profession / business: ${parsed.data.profession || "Not provided"}`,
        `Investment experience: ${parsed.data.experience}`,
        `Preferred investment geography: ${parsed.data.geography || "Not specified"}`,
        `Indicative investment capacity: ${parsed.data.capacity}`,
        `Preferred investment horizon: ${parsed.data.horizon}`,
        `Preferred contact time: ${parsed.data.contactTime}`,
        message || "",
      ].filter(Boolean).join("\\n")
    : message;

  let uploadUrl: string | undefined;
  let uploadFileName: string | undefined;

  if (req.file) {
    const env = getEnv();
    const baseUrl = env.publicUrl || "http://localhost:5000";
    uploadUrl = `${baseUrl}/uploads/${req.file.filename}`;
    uploadFileName = req.file.originalname;
  }

  const db = getDb();
  const [enquiry] = await db
    .insert(enquiries)
    .values({
      email,
      name,
      phone: normalizedPhone,
      purposeType,
      message: storedMessage,
      privacyNoticeVersion: CURRENT_POLICY_VERSIONS.PRIVACY_NOTICE,
      privacyNoticeAcknowledgedAt: new Date(),
      uploadUrl,
      uploadFileName,
      projectId: projectId && isValidId(projectId) ? projectId : undefined,
      projectName: projectName || undefined,
    })
    .returning();

  // Notify admin panel in real-time
  emitToRole("ADMIN", "enquiry:new", {
    _id: enquiry._id,
    email,
    name,
    purposeType,
    message: storedMessage,
    phone: normalizedPhone,
    uploadUrl,
    uploadFileName,
    projectName,
    createdAt: enquiry.createdAt,
    privacyNoticeVersion: enquiry.privacyNoticeVersion,
    privacyNoticeAcknowledgedAt: enquiry.privacyNoticeAcknowledgedAt,
  });

  // Persist a bell/push notification for admins/founders (the socket emit above
  // is transient and lost if they're offline). Never fail the enquiry on it.
  try {
    await notifyRole("ADMIN", {
      type: "new_enquiry",
      title: investorClub ? "New Investor Club interest" : "New enquiry",
      message: investorClub
        ? `${name} registered Investor Club interest.`
        : `${name || "Someone"} sent an enquiry${projectName ? ` about ${projectName}` : ""}.`,
      data: { href: "/admin/enquiries" },
    });
  } catch {
    /* non-fatal */
  }

  return res.status(201).json({ ok: true, enquiryId: enquiry._id });
});

// ── Project landing-page lead (phone-first) ──────────────────────────────────
// Public. A landing page collects name + mobile (email optional) and posts here.
// Stored in the same Enquiries inbox as purposeType BUYER so the founder/admin
// sees every landing-page lead alongside site enquiries.
const leadSchema = z.object({
  name: z.string().min(1, "Please enter your name."),
  phone: z
    .string()
    .trim()
    .regex(/^(\+?91[\-\s]?)?[6-9]\d{9}$/, "Please enter a valid 10-digit mobile number."),
  email: z.string().email("Please enter a valid email.").optional().or(z.literal("")),
  projectId: z.string().optional(),
  projectName: z.string().optional(),
  message: z.string().max(2000).optional(),
  privacyNoticeAcknowledged: z.preprocess((value) => value === true || value === "true", z.literal(true)),
});

// POST /api/enquiries/lead  — public, no auth needed
router.post("/lead", enquiryLimiter, async (req, res) => {
  const parsed = leadSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: zodMessage(parsed.error), issues: parsed.error.flatten() });
  }

  const { name, phone, email, projectId, projectName, message } = parsed.data;
  const normalizedPhone = phone.replace(/[^\d]/g, "").replace(/^91(?=\d{10}$)/, "");

  const db = getDb();
  const [enquiry] = await db
    .insert(enquiries)
    .values({
      name,
      phone: normalizedPhone,
      email: email && email.length ? email : null,
      purposeType: "BUYER",
      message: message || undefined,
      privacyNoticeVersion: CURRENT_POLICY_VERSIONS.PRIVACY_NOTICE,
      privacyNoticeAcknowledgedAt: new Date(),
      projectId: projectId && isValidId(projectId) ? projectId : undefined,
      projectName: projectName || undefined,
    })
    .returning();

  // Real-time admin panel notification.
  emitToRole("ADMIN", "enquiry:new", {
    _id: enquiry._id,
    name,
    phone: normalizedPhone,
    email: enquiry.email,
    purposeType: "BUYER",
    message: message || undefined,
    projectName,
    createdAt: enquiry.createdAt,
    privacyNoticeVersion: enquiry.privacyNoticeVersion,
    privacyNoticeAcknowledgedAt: enquiry.privacyNoticeAcknowledgedAt,
  });

  // Persistent bell/push notification (best-effort).
  try {
    await notifyRole("ADMIN", {
      type: "new_enquiry",
      title: "New project lead",
      message: `${name || "Someone"} is interested${projectName ? ` in ${projectName}` : ""}.`,
      data: { href: "/admin/enquiries" },
    });
  } catch {
    /* non-fatal */
  }

  return res.status(201).json({ ok: true, enquiryId: enquiry._id });
});

// GET /api/enquiries  — admin only
router.get("/", authenticate, requireRole("ADMIN"), async (_req: AuthedRequest, res) => {
  const db = getDb();
  const rows = await db.select().from(enquiries).orderBy(desc(enquiries.createdAt)).limit(200);
  res.json({ enquiries: rows });
});

export default router;
