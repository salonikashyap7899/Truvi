import { Router, Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../config/db";
import { legalDocuments, projects, LegalDocType } from "../db/schema";
import { isValidId } from "../lib/ids";
import { authenticate, requireRole, AuthedRequest } from "../middleware/auth";
import { getEnv } from "../config/env";
import { emitToRole } from "../sockets";

const router = Router();

// ── Uploads ──────────────────────────────────────────────────────────────
function getUploadsDir(): string {
  const env = getEnv();
  return env.uploadDir ? path.resolve(env.uploadDir) : path.resolve(__dirname, "../../../uploads");
}
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = path.join(getUploadsDir(), "legal");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => cb(null, `legal-${Date.now()}${path.extname(file.originalname)}`),
});
const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = [".pdf", ".jpg", ".jpeg", ".png", ".webp"].includes(path.extname(file.originalname).toLowerCase());
    if (ok) cb(null, true);
    else cb(new Error("Only PDF or image files allowed"));
  },
});

const DOC_TYPES: LegalDocType[] = ["RERA", "APPROVAL", "NOC", "TITLE", "OTHER"];

async function loadOwnedProject(req: AuthedRequest, res: Response) {
  if (!isValidId(req.params.projectId)) {
    res.status(404).json({ error: "Project not found" });
    return null;
  }
  const db = getDb();
  const [project] = await db.select().from(projects).where(eq(projects._id, req.params.projectId));
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

// Developer/admin: list ALL legal docs for a project (verified + pending).
router.get("/project/:projectId", authenticate, requireRole("DEVELOPER", "ADMIN", "VERIFIER"), async (req: AuthedRequest, res) => {
  const project = await loadOwnedProject(req, res);
  if (!project) return;
  const db = getDb();
  const docs = await db
    .select()
    .from(legalDocuments)
    .where(eq(legalDocuments.projectId, project._id))
    .orderBy(desc(legalDocuments.createdAt));
  res.json({ documents: docs });
});

// Developer/admin: upload a legal document (starts unverified → not public).
router.post(
  "/project/:projectId",
  authenticate,
  requireRole("DEVELOPER", "ADMIN"),
  upload.single("file"),
  async (req: AuthedRequest, res) => {
    const project = await loadOwnedProject(req, res);
    if (!project) return;
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const schema = z.object({
      title: z.string().min(2),
      docType: z.enum(["RERA", "APPROVAL", "NOC", "TITLE", "OTHER"]).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });

    const env = getEnv();
    const baseUrl = env.publicUrl || "http://localhost:5000";
    const fileUrl = `${baseUrl}/uploads/legal/${req.file.filename}`;

    const db = getDb();
    const [doc] = await db
      .insert(legalDocuments)
      .values({
        projectId: project._id,
        title: parsed.data.title.trim(),
        docType: (parsed.data.docType ?? "OTHER") as LegalDocType,
        fileUrl,
        fileName: req.file.originalname,
        uploadedById: req.user!.userId,
      })
      .returning();

    // Notify admins there's a legal doc awaiting verification.
    emitToRole("ADMIN", "legal:pending", { projectId: project._id, projectName: project.name, document: doc });

    res.status(201).json({ document: doc });
  }
);

// Admin/Verifier: verify (or un-verify) a legal document → controls public visibility.
router.patch("/:id/verify", authenticate, requireRole("ADMIN", "VERIFIER"), async (req: AuthedRequest, res) => {
  if (!isValidId(req.params.id)) return res.status(404).json({ error: "Document not found" });
  const verified = req.body?.verified !== false; // default true
  const db = getDb();
  const [doc] = await db
    .update(legalDocuments)
    .set({
      verified,
      verifiedById: verified ? req.user!.userId : null,
      verifiedAt: verified ? new Date() : null,
    })
    .where(eq(legalDocuments._id, req.params.id))
    .returning();
  if (!doc) return res.status(404).json({ error: "Document not found" });
  res.json({ document: doc });
});

// Developer/admin: delete a legal document.
router.delete("/:id", authenticate, requireRole("DEVELOPER", "ADMIN"), async (req: AuthedRequest, res) => {
  if (!isValidId(req.params.id)) return res.status(404).json({ error: "Document not found" });
  const db = getDb();
  const [doc] = await db.select().from(legalDocuments).where(eq(legalDocuments._id, req.params.id));
  if (!doc) return res.status(404).json({ error: "Document not found" });
  if (req.user!.role === "DEVELOPER") {
    const [project] = await db.select().from(projects).where(eq(projects._id, doc.projectId));
    if (!project || String(project.developerId) !== req.user!.userId) {
      return res.status(403).json({ error: "Not your document" });
    }
  }
  await db.delete(legalDocuments).where(eq(legalDocuments._id, doc._id));
  res.json({ ok: true });
});

// Admin/Verifier: pending review queue across all projects.
router.get("/pending", authenticate, requireRole("ADMIN", "VERIFIER"), async (_req, res) => {
  const db = getDb();
  const rows = await db
    .select({
      document: legalDocuments,
      projectName: projects.name,
    })
    .from(legalDocuments)
    .leftJoin(projects, eq(legalDocuments.projectId, projects._id))
    .where(eq(legalDocuments.verified, false))
    .orderBy(desc(legalDocuments.createdAt));
  res.json({ pending: rows });
});

// PUBLIC: only VERIFIED legal documents for a listing.
router.get("/public/:projectId", async (req, res) => {
  if (!isValidId(req.params.projectId)) return res.json({ documents: [] });
  const db = getDb();
  const docs = await db
    .select({
      _id: legalDocuments._id,
      title: legalDocuments.title,
      docType: legalDocuments.docType,
      fileUrl: legalDocuments.fileUrl,
      verifiedAt: legalDocuments.verifiedAt,
    })
    .from(legalDocuments)
    .where(and(eq(legalDocuments.projectId, req.params.projectId), eq(legalDocuments.verified, true)))
    .orderBy(desc(legalDocuments.createdAt));
  res.json({ documents: docs });
});

export { DOC_TYPES };
export default router;
