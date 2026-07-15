import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { z } from "zod";
import { and, asc, desc, eq } from "drizzle-orm";
import { getDb } from "../config/db";
import {
  projects,
  projectAssets,
  units,
  users,
  ASSET_CATEGORIES,
  LEGAL_ASSET_CATEGORIES,
  IProject,
  ProjectType,
  PresentationInfo,
} from "../db/schema";
import { isValidId } from "../lib/ids";
import { authenticate, requireRole, AuthedRequest } from "../middleware/auth";
import { verifyAccessToken } from "../lib/jwt";
import { getEnv } from "../config/env";

const router = Router();

// ── Multer: presentation assets accept a much wider set of formats than the
// brochure endpoint — drawings, CAD files, videos, presentations, reports.
function getUploadsDir(): string {
  const env = getEnv();
  return env.uploadDir ? path.resolve(env.uploadDir) : path.resolve(__dirname, "../../../uploads");
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
    .where(eq(projects._id, req.params.id));
  if (!row) return res.status(404).json({ error: "Project not found" });

  const project = row.project;
  if (project.approvalStatus !== "APPROVED") {
    const user = optionalUser(req);
    const isOwner = user && String(project.developerId) === user.userId;
    if (!user || (user.role !== "ADMIN" && !isOwner)) {
      return res.status(404).json({ error: "Project not found" });
    }
  }

  let assets = await db
    .select()
    .from(projectAssets)
    .where(eq(projectAssets.projectId, project._id))
    .orderBy(asc(projectAssets.category), desc(projectAssets.createdAt));

  // Legal documents (approvals, NOCs, RERA certs) are public ONLY after an
  // admin verifies them. The owner and admins still see the pending ones.
  {
    const viewer = optionalUser(req);
    const isOwner = viewer && String(project.developerId) === viewer.userId;
    if (!viewer || (viewer.role !== "ADMIN" && !isOwner)) {
      assets = assets.filter((a) => a.verified || !LEGAL_ASSET_CATEGORIES.includes(a.category));
    }
  }

  // Public per-unit data powering the interactive 3D master plan: each unit
  // renders as a clickable plot colored by its live status. Prices are
  // already public on the inventory list (minPrice/maxPrice), so exposing
  // the per-unit price here is consistent. Lock ownership stays private.
  const unitRows = await db
    .select({
      _id: units._id,
      unitNumber: units.unitNumber,
      type: units.type,
      areaSqft: units.areaSqft,
      price: units.price,
      status: units.status,
    })
    .from(units)
    .where(eq(units.projectId, project._id))
    .orderBy(asc(units.unitNumber));
  const byType: Record<string, number> = {};
  let available = 0;
  for (const u of unitRows) {
    byType[u.type] = (byType[u.type] ?? 0) + 1;
    if (u.status === "AVAILABLE") available += 1;
  }
  const unitSummary = { total: unitRows.length, available, byType };

  res.json({
    project: { ...project, developerId: row.developer ?? project.developerId },
    assets,
    unitSummary,
    units: unitRows,
  });
});

// ── Mutations below require auth ────────────────────────────────────────────

async function loadOwnedProject(req: AuthedRequest, res: any): Promise<IProject | null> {
  if (!isValidId(req.params.id)) {
    res.status(400).json({ error: "Invalid project id" });
    return null;
  }
  const db = getDb();
  const [project] = await db.select().from(projects).where(eq(projects._id, req.params.id));
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

    // Legal documents uploaded by a developer need admin verification before
    // they appear publicly. Admin uploads (and non-legal categories) go live
    // immediately.
    const isLegal = LEGAL_ASSET_CATEGORIES.includes(parsed.data.category);
    const verified = !isLegal || req.user!.role === "ADMIN";

    const db = getDb();
    const [asset] = await db
      .insert(projectAssets)
      .values({
        projectId: project._id,
        category: parsed.data.category,
        title: parsed.data.title,
        description: parsed.data.description,
        fileUrl: assetFileUrl(req.file.filename),
        fileName: req.file.originalname,
        mimeType: req.file.mimetype,
        sizeBytes: req.file.size,
        uploadedBy: req.user!.userId,
        verified,
      })
      .returning();

    res.status(201).json({
      asset,
      ...(isLegal && !verified
        ? { message: "Legal document uploaded — it will appear publicly after admin verification." }
        : {}),
    });
  },
);

// PATCH /api/presentation/:id/assets/:assetId/verify — admin verifies (or
// un-verifies) a legal document so it becomes publicly visible.
router.patch(
  "/:id/assets/:assetId/verify",
  authenticate,
  requireRole("ADMIN"),
  async (req: AuthedRequest, res) => {
    const project = await loadOwnedProject(req, res);
    if (!project) return;
    if (!isValidId(req.params.assetId)) return res.status(400).json({ error: "Invalid asset id" });

    const verified = req.body?.verified !== false; // default: verify
    const db = getDb();
    const [asset] = await db
      .update(projectAssets)
      .set({ verified })
      .where(and(eq(projectAssets._id, req.params.assetId), eq(projectAssets.projectId, project._id)))
      .returning();
    if (!asset) return res.status(404).json({ error: "Asset not found" });

    res.json({ asset });
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
  paymentPlans: z.array(z.string()).optional(),
  offers: z.string().optional(),
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
        presentationInfo,
        ...(projectType ? { projectType: projectType as ProjectType } : {}),
      })
      .where(eq(projects._id, project._id))
      .returning();

    res.json({ project: updated });
  },
);

export default router;
