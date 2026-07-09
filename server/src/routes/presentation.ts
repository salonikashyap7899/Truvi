import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../config/db";
import { projects, projectAssets, users, ASSET_CATEGORIES, type PresentationInfo, type IProject } from "../db/schema";
import { isValidId } from "../lib/ids";
import { authenticate, requireRole, AuthedRequest } from "../middleware/auth";
import { verifyAccessToken } from "../lib/jwt";
import { getEnv } from "../config/env";
import { uploadsRoot } from "../services/uploadService";

const router = Router();

// ── Multer: presentation assets accept a much wider set of formats than the
// brochure endpoint — drawings, CAD files, videos, presentations, reports.
function getUploadsDir(): string {
  return uploadsRoot();
}

const ALLOWED_EXT = [
  ".pdf", ".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg",
  ".mp4", ".webm", ".mov",
  ".ppt", ".pptx", ".doc", ".docx", ".xls", ".xlsx",
  ".dwg", ".dxf", ".zip",
];

const assetStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = getUploadsDir();
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `asset-${unique}${path.extname(file.originalname).toLowerCase()}`);
  },
});

const assetUpload = multer({
  storage: assetStorage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB — videos/CAD run large
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED_EXT.includes(ext)) cb(null, true);
    else cb(new Error(`File type not allowed. Allowed: ${ALLOWED_EXT.join(", ")}`));
  },
});

function assetFileUrl(filename: string): string {
  const env = getEnv();
  const base = env.publicUrl || "http://localhost:5000";
  return `${base}/uploads/${filename}`;
}

/**
 * Can this request see a non-approved project? Owner and admin can (so a
 * developer can build the presentation before approval); everyone else
 * only sees APPROVED projects. The GET route is public, so auth here is
 * optional — a missing/invalid token just means "anonymous visitor".
 */
function optionalUser(req: AuthedRequest) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return null;
  try {
    return verifyAccessToken(token);
  } catch {
    return null;
  }
}

// ── GET /api/presentation/:id — full presentation profile (public) ─────────
router.get("/:id", async (req: AuthedRequest, res) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ error: "Invalid project id" });

  const db = getDb();
  const [row] = await db
    .select({
      project: projects,
      developer: { _id: users._id, name: users.name, developerProfile: users.developerProfile },
    })
    .from(projects)
    .leftJoin(users, eq(projects.developerId, users._id))
    .where(eq(projects._id, req.params.id))
    .limit(1);
  if (!row) return res.status(404).json({ error: "Project not found" });

  if (row.project.approvalStatus !== "APPROVED") {
    const user = optionalUser(req);
    const isOwner = user && String(row.project.developerId) === user.userId;
    if (!user || (user.role !== "ADMIN" && !isOwner)) {
      return res.status(404).json({ error: "Project not found" });
    }
  }

  const assets = await db
    .select()
    .from(projectAssets)
    .where(eq(projectAssets.projectId, row.project._id))
    .orderBy(projectAssets.category, desc(projectAssets.createdAt));

  const project = { ...row.project, developerId: row.developer ?? row.project.developerId };
  res.json({ project, assets });
});

// ── Mutations below require auth ────────────────────────────────────────────

async function loadOwnedProject(req: AuthedRequest, res: import("express").Response): Promise<IProject | null> {
  if (!isValidId(req.params.id)) {
    res.status(400).json({ error: "Invalid project id" });
    return null;
  }
  const db = getDb();
  const [project] = await db.select().from(projects).where(eq(projects._id, req.params.id)).limit(1);
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return null;
  }
  if (req.user!.role === "DEVELOPER" && String(project.developerId) !== req.user!.userId) {
    res.status(403).json({ error: "Not your project" });
    return null;
  }
  return project;
}

// POST /api/presentation/:id/assets — upload one asset (field name "file")
router.post(
  "/:id/assets",
  authenticate,
  requireRole("DEVELOPER", "ADMIN"),
  assetUpload.single("file"),
  async (req: AuthedRequest, res) => {
    const project = await loadOwnedProject(req, res);
    if (!project) return;

    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const bodySchema = z.object({
      category: z.enum(ASSET_CATEGORIES),
      title: z.string().min(1, "Title required"),
      description: z.string().optional(),
    });
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      // Don't orphan the file on validation failure
      fs.unlink(req.file.path, () => {});
      return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });
    }

    const db = getDb();
    const [asset] = await db
      .insert(projectAssets)
      .values({
        projectId: project._id,
        category: parsed.data.category,
        title: parsed.data.title,
        description: parsed.data.description || null,
        fileUrl: assetFileUrl(req.file.filename),
        fileName: req.file.originalname,
        mimeType: req.file.mimetype,
        sizeBytes: req.file.size,
        uploadedBy: req.user!.userId,
      })
      .returning();

    res.status(201).json({ asset });
  },
);

// DELETE /api/presentation/:id/assets/:assetId
router.delete(
  "/:id/assets/:assetId",
  authenticate,
  requireRole("DEVELOPER", "ADMIN"),
  async (req: AuthedRequest, res) => {
    const project = await loadOwnedProject(req, res);
    if (!project) return;

    if (!isValidId(req.params.assetId)) return res.status(400).json({ error: "Invalid asset id" });
    const db = getDb();
    const [asset] = await db
      .delete(projectAssets)
      .where(and(eq(projectAssets._id, req.params.assetId), eq(projectAssets.projectId, project._id)))
      .returning();
    if (!asset) return res.status(404).json({ error: "Asset not found" });

    // Best-effort disk cleanup; basename() guards against path traversal.
    const filename = path.basename(new URL(asset.fileUrl, "http://localhost").pathname);
    fs.unlink(path.join(getUploadsDir(), filename), () => {});

    res.json({ ok: true });
  },
);

// PUT /api/presentation/:id/info — structured details (type, amenities, security…)
const infoSchema = z.object({
  projectType: z.enum(["RESIDENTIAL", "COMMERCIAL", "INDUSTRIAL", "MIXED_USE", "PLOTTED"]).optional(),
  amenities: z.array(z.string()).optional(),
  securityFeatures: z.array(z.string()).optional(),
  smartHomeFeatures: z.array(z.string()).optional(),
  fireSafetySystems: z.array(z.string()).optional(),
  greenBuildingFeatures: z.array(z.string()).optional(),
  connectivityNotes: z.string().optional(),
  constructionProgressNote: z.string().optional(),
});

router.put(
  "/:id/info",
  authenticate,
  requireRole("DEVELOPER", "ADMIN"),
  async (req: AuthedRequest, res) => {
    const project = await loadOwnedProject(req, res);
    if (!project) return;

    const parsed = infoSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });

    const { projectType, ...info } = parsed.data;
    const presentationInfo: PresentationInfo = { ...(project.presentationInfo ?? {}), ...info };

    const db = getDb();
    const [updated] = await db
      .update(projects)
      .set({
        ...(projectType ? { projectType } : {}),
        presentationInfo,
      })
      .where(eq(projects._id, project._id))
      .returning();

    res.json({ project: updated });
  },
);

export default router;
