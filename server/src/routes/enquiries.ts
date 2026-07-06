import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { z } from "zod";
import { Enquiry } from "../models/Enquiry";
import { authenticate, requireRole, AuthedRequest } from "../middleware/auth";
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
    return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });
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

  const enquiry = await Enquiry.create({
    email,
    name,
    purposeType,
    message,
    uploadUrl,
    uploadFileName,
    projectId: projectId || undefined,
    projectName: projectName || undefined,
  });

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

  return res.status(201).json({ ok: true, enquiryId: enquiry._id });
});

// GET /api/enquiries  — admin only
router.get("/", authenticate, requireRole("ADMIN"), async (_req: AuthedRequest, res) => {
  const enquiries = await Enquiry.find().sort({ createdAt: -1 }).limit(200);
  res.json({ enquiries });
});

export default router;
