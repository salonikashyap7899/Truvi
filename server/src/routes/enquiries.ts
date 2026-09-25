import { Router } from "express";
import { zodMessage } from "../lib/validationError";
import multer from "multer";
import path from "path";
import fs from "fs";
import { z } from "zod";
import { desc } from "drizzle-orm";
import { getDb } from "../config/db";
import { enquiries } from "../db/schema";
import { isValidId } from "../lib/ids";
import { authenticate, requireRole, AuthedRequest } from "../middleware/auth";
import { notifyRole } from "../services/notificationService";
import { emitToRole } from "../sockets";
import { getEnv } from "../config/env";

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
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `enquiry-${Date.now()}${ext}`);
  },
});

const enquiryUpload = multer({
  storage: enquiryStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
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
  message: z.string().optional(),
  projectId: z.string().optional(),
  projectName: z.string().optional(),
});

// POST /api/enquiries  — public, no auth needed
router.post("/", enquiryUpload.single("file"), async (req, res) => {
  const parsed = enquirySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: zodMessage(parsed.error), issues: parsed.error.flatten() });
  }

  const { email, name, purposeType, message, projectId, projectName } = parsed.data;

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
      purposeType,
      message,
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
    message,
    uploadUrl,
    uploadFileName,
    projectName,
    createdAt: enquiry.createdAt,
  });

  // Persist a bell/push notification for admins/founders (the socket emit above
  // is transient and lost if they're offline). Never fail the enquiry on it.
  try {
    await notifyRole("ADMIN", {
      type: "new_enquiry",
      title: "New enquiry",
      message: `${name || "Someone"} sent an enquiry${projectName ? ` about ${projectName}` : ""}.`,
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
});

// POST /api/enquiries/lead  — public, no auth needed
router.post("/lead", async (req, res) => {
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
