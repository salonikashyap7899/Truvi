import { Router, Response, NextFunction } from "express";
import path from "path";
import fs from "fs";
import multer from "multer";
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "../config/db";
import { projects, projectAssets, brochureEvents } from "../db/schema";
import { authenticate, requireRole, AuthedRequest } from "../middleware/auth";
import { verifyAccessToken } from "../lib/jwt";
import { isValidId } from "../lib/ids";

const router = Router();

const UPLOAD_DIR = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.resolve(__dirname, "../../uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// PDF-only uploader for brochures (25 MB). Kept separate from the general
// 10 MB uploader so brochures can be a little larger without loosening limits
// elsewhere.
const brochureUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname) || ".pdf"}`),
  }),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const okType = file.mimetype === "application/pdf";
    const okExt = path.extname(file.originalname).toLowerCase() === ".pdf";
    if (!okType || !okExt) return cb(new Error("Only PDF files are allowed for brochures."));
    cb(null, true);
  },
});

function publicUrl(filename: string): string {
  const base = process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || "http://localhost:5000";
  return `${base}/uploads/${filename}`;
}

/** Local disk path of a stored asset, derived from its public /uploads URL. */
function diskPathFor(fileUrl: string): string | null {
  try {
    const name = path.basename(new URL(fileUrl).pathname);
    if (!name || name.includes("..")) return null;
    return path.join(UPLOAD_DIR, name);
  } catch {
    // Not a full URL — treat as a bare filename.
    const name = path.basename(fileUrl);
    return name ? path.join(UPLOAD_DIR, name) : null;
  }
}

/** Attaches req.user when a valid token is present, but never rejects. */
function optionalAuth(req: AuthedRequest, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (token) {
    try {
      req.user = verifyAccessToken(token);
    } catch {
      /* ignore — treat as anonymous */
    }
  }
  next();
}

/** The single active brochure for a project = the most recent BROCHURE asset. */
async function activeBrochure(projectId: string) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(projectAssets)
    .where(and(eq(projectAssets.projectId, projectId), eq(projectAssets.category, "BROCHURE")))
    .orderBy(desc(projectAssets.createdAt))
    .limit(1);
  return row ?? null;
}

function safeName(s: string): string {
  return (s || "Project").replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "Project";
}

async function recordEvent(
  projectId: string,
  assetId: string | null,
  user: { userId: string; role: string } | undefined,
  eventType: "VIEW" | "DOWNLOAD",
  platform: string | null,
) {
  try {
    await getDb().insert(brochureEvents).values({
      projectId,
      assetId: assetId ?? undefined,
      userId: user?.userId,
      role: user?.role,
      eventType,
      platform: platform ?? undefined,
    });
  } catch {
    /* analytics must never break serving the file */
  }
}

// ── Admin: upload / replace a brochure ──────────────────────────────────────
// POST /api/admin/projects/:projectId/brochure  (field name "file")
router.post(
  "/admin/projects/:projectId/brochure",
  authenticate,
  requireRole("ADMIN"),
  brochureUpload.single("file"),
  async (req: AuthedRequest, res) => {
    const { projectId } = req.params;
    if (!isValidId(projectId)) return res.status(400).json({ error: "Invalid project id" });
    if (!req.file) return res.status(400).json({ error: "No PDF uploaded" });

    const db = getDb();
    const [project] = await db.select({ _id: projects._id, name: projects.name }).from(projects).where(eq(projects._id, projectId));
    if (!project) {
      // Clean up the orphaned upload.
      fs.promises.unlink(req.file.path).catch(() => {});
      return res.status(404).json({ error: "Project not found" });
    }

    // Replace: remove any existing brochure assets (and their files) first.
    const existing = await db
      .select()
      .from(projectAssets)
      .where(and(eq(projectAssets.projectId, projectId), eq(projectAssets.category, "BROCHURE")));
    for (const old of existing) {
      const p = diskPathFor(old.fileUrl);
      if (p) fs.promises.unlink(p).catch(() => {});
    }
    if (existing.length) {
      await db.delete(projectAssets).where(and(eq(projectAssets.projectId, projectId), eq(projectAssets.category, "BROCHURE")));
    }

    const [asset] = await db
      .insert(projectAssets)
      .values({
        projectId,
        category: "BROCHURE",
        title: `${project.name} Brochure`,
        fileUrl: publicUrl(req.file.filename),
        fileName: req.file.originalname,
        mimeType: req.file.mimetype,
        sizeBytes: req.file.size,
        uploadedBy: req.user!.userId,
        verified: true,
      })
      .returning();

    res.status(201).json({ brochure: publicMeta(asset) });
  },
);

// ── Public-ish: brochure metadata (button visibility) ───────────────────────
// GET /api/projects/:projectId/brochure  → { exists, fileName, sizeBytes, ... }
router.get("/projects/:projectId/brochure", optionalAuth, async (req: AuthedRequest, res) => {
  const { projectId } = req.params;
  if (!isValidId(projectId)) return res.status(400).json({ error: "Invalid project id" });
  const asset = await activeBrochure(projectId);
  if (!asset) return res.json({ exists: false });
  const body: any = { exists: true, ...publicMeta(asset) };
  // Admins also get the live analytics inline.
  if (req.user?.role === "ADMIN") body.analytics = await analyticsFor(projectId);
  res.json(body);
});

// ── View (inline, streamed) ─────────────────────────────────────────────────
// GET /api/projects/:projectId/brochure/view  → streams the PDF inline
router.get("/projects/:projectId/brochure/view", authenticate, (req, res) => streamBrochure(req as AuthedRequest, res, "inline"));

// ── Download (attachment, friendly filename) ────────────────────────────────
// GET /api/projects/:projectId/brochure/download
router.get("/projects/:projectId/brochure/download", authenticate, (req, res) => streamBrochure(req as AuthedRequest, res, "attachment"));

async function streamBrochure(req: AuthedRequest, res: Response, disposition: "inline" | "attachment") {
  const { projectId } = req.params;
  if (!isValidId(projectId)) return res.status(400).json({ error: "Invalid project id" });
  const db = getDb();
  const [project] = await db.select({ name: projects.name }).from(projects).where(eq(projects._id, projectId));
  const asset = await activeBrochure(projectId);
  if (!project || !asset) return res.status(404).json({ error: "No brochure available" });

  const filePath = diskPathFor(asset.fileUrl);
  if (!filePath || !fs.existsSync(filePath)) return res.status(404).json({ error: "Brochure file not found" });

  const downloadName = `Truvi_${safeName(project.name)}_Brochure.pdf`;
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `${disposition}; filename="${downloadName}"`);
  res.setHeader("Cache-Control", "private, max-age=0, no-store");

  // Record analytics (never blocks the stream).
  const platform = String(req.headers["user-agent"] || "").slice(0, 200);
  void recordEvent(projectId, asset._id, req.user, disposition === "attachment" ? "DOWNLOAD" : "VIEW", platform);

  fs.createReadStream(filePath).on("error", () => {
    if (!res.headersSent) res.status(500).json({ error: "Failed to read brochure" });
  }).pipe(res);
}

// ── Admin: delete brochure ──────────────────────────────────────────────────
// DELETE /api/admin/projects/:projectId/brochure
router.delete("/admin/projects/:projectId/brochure", authenticate, requireRole("ADMIN"), async (req: AuthedRequest, res) => {
  const { projectId } = req.params;
  if (!isValidId(projectId)) return res.status(400).json({ error: "Invalid project id" });
  const db = getDb();
  const existing = await db
    .select()
    .from(projectAssets)
    .where(and(eq(projectAssets.projectId, projectId), eq(projectAssets.category, "BROCHURE")));
  if (existing.length === 0) return res.status(404).json({ error: "No brochure to delete" });
  for (const old of existing) {
    const p = diskPathFor(old.fileUrl);
    if (p) fs.promises.unlink(p).catch(() => {});
  }
  await db.delete(projectAssets).where(and(eq(projectAssets.projectId, projectId), eq(projectAssets.category, "BROCHURE")));
  res.json({ ok: true });
});

// ── Admin: analytics ────────────────────────────────────────────────────────
// GET /api/admin/projects/:projectId/brochure/analytics
router.get("/admin/projects/:projectId/brochure/analytics", authenticate, requireRole("ADMIN"), async (req: AuthedRequest, res) => {
  const { projectId } = req.params;
  if (!isValidId(projectId)) return res.status(400).json({ error: "Invalid project id" });
  res.json({ analytics: await analyticsFor(projectId) });
});

async function analyticsFor(projectId: string) {
  const db = getDb();
  const [row] = await db
    .select({
      views: sql<number>`sum(case when ${brochureEvents.eventType} = 'VIEW' then 1 else 0 end)::int`,
      downloads: sql<number>`sum(case when ${brochureEvents.eventType} = 'DOWNLOAD' then 1 else 0 end)::int`,
      lastViewed: sql<Date | null>`max(case when ${brochureEvents.eventType} = 'VIEW' then ${brochureEvents.createdAt} end)`,
      lastDownloaded: sql<Date | null>`max(case when ${brochureEvents.eventType} = 'DOWNLOAD' then ${brochureEvents.createdAt} end)`,
    })
    .from(brochureEvents)
    .where(eq(brochureEvents.projectId, projectId));
  return {
    views: Number(row?.views ?? 0),
    downloads: Number(row?.downloads ?? 0),
    lastViewed: row?.lastViewed ? new Date(row.lastViewed).toISOString() : null,
    lastDownloaded: row?.lastDownloaded ? new Date(row.lastDownloaded).toISOString() : null,
  };
}

/** Metadata safe to expose (never the raw storage path or key). */
function publicMeta(asset: {
  _id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: Date;
}) {
  return {
    id: asset._id,
    fileName: asset.fileName,
    mimeType: asset.mimeType,
    sizeBytes: asset.sizeBytes,
    uploadedAt: asset.createdAt ? new Date(asset.createdAt).toISOString() : null,
    updatedAt: asset.createdAt ? new Date(asset.createdAt).toISOString() : null,
  };
}

export default router;
