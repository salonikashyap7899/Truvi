import { Router } from "express";
import { z } from "zod";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "../config/db";
import { academyContent, courseProgress } from "../db/schema";
import { authenticate, requireRole, AuthedRequest } from "../middleware/auth";
import { uploadMedia, fileUrl } from "../services/uploadService";

const router = Router();
router.use(authenticate);

router.get("/progress", async (req: AuthedRequest, res) => {
  const db = getDb();
  const progress = await db
    .select()
    .from(courseProgress)
    .where(eq(courseProgress.userId, req.user!.userId));
  res.json({ progress });
});

const completeModuleSchema = z.object({
  moduleId: z.string().min(1),
  totalModules: z.number().int().positive(),
  courseTitle: z.string().optional(),
});

router.post("/progress/:courseId", async (req: AuthedRequest, res) => {
  const parsed = completeModuleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });

  const { moduleId, totalModules } = parsed.data;
  const courseId = String(req.params.courseId);
  const userId = req.user!.userId;

  const db = getDb();
  let [progress] = await db
    .select()
    .from(courseProgress)
    .where(and(eq(courseProgress.userId, userId), eq(courseProgress.courseId, courseId)));
  if (!progress) {
    [progress] = await db
      .insert(courseProgress)
      .values({ userId, courseId, completedModules: [] })
      .returning();
  }

  const completedModules = [...(progress.completedModules ?? [])];
  if (!completedModules.includes(moduleId)) {
    completedModules.push(moduleId);
  }

  const completedAt =
    completedModules.length >= totalModules && !progress.completedAt ? new Date() : progress.completedAt;

  const [updated] = await db
    .update(courseProgress)
    .set({ completedModules, completedAt })
    .where(eq(courseProgress._id, progress._id))
    .returning();
  res.json({ progress: updated });
});

router.delete("/progress/:courseId/module/:moduleId", async (req: AuthedRequest, res) => {
  const courseId = String(req.params.courseId);
  const moduleId = String(req.params.moduleId);
  const userId = req.user!.userId;

  const db = getDb();
  const [progress] = await db
    .select()
    .from(courseProgress)
    .where(and(eq(courseProgress.userId, userId), eq(courseProgress.courseId, courseId)));
  if (!progress) return res.status(404).json({ error: "Progress not found" });

  const completedModules = (progress.completedModules ?? []).filter((m) => m !== moduleId);
  const [updated] = await db
    .update(courseProgress)
    .set({ completedModules, completedAt: null })
    .where(eq(courseProgress._id, progress._id))
    .returning();
  res.json({ progress: updated });
});

// ---------------------------------------------------------------------------
// Learning content (admin-managed videos + PDFs)
// ---------------------------------------------------------------------------

// Any authenticated user (CPs) can list learning materials. Optionally scoped
// to a single course via ?courseId=.
router.get("/content", async (req: AuthedRequest, res) => {
  const db = getDb();
  const courseId = req.query.courseId ? String(req.query.courseId) : null;
  const rows = await db
    .select()
    .from(academyContent)
    .where(courseId ? eq(academyContent.courseId, courseId) : undefined)
    .orderBy(asc(academyContent.sortOrder), asc(academyContent.createdAt));
  res.json({ content: rows });
});

const createContentSchema = z.object({
  courseId: z.string().min(1),
  title: z.string().min(1),
  type: z.enum(["VIDEO", "PDF"]),
  url: z.string().url().optional(),
  description: z.string().optional(),
  duration: z.string().optional(),
  sortOrder: z.coerce.number().int().optional(),
});

// Admin creates a content item. Accepts multipart/form-data with an optional
// uploaded `file` (video or PDF); when no file is sent, an external `url`
// (e.g. a hosted/YouTube video link) is required instead.
router.post(
  "/content",
  requireRole("ADMIN"),
  (req, res, next) => {
    uploadMedia.single("file")(req, res, (err) => {
      if (err) return res.status(400).json({ error: err instanceof Error ? err.message : "Upload failed" });
      next();
    });
  },
  async (req: AuthedRequest, res) => {
    const parsed = createContentSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });

    const { courseId, title, type, description, duration, sortOrder } = parsed.data;
    const url = req.file ? fileUrl(req.file.filename) : parsed.data.url;
    if (!url) return res.status(400).json({ error: "Provide a file upload or a URL." });

    const db = getDb();
    const [content] = await db
      .insert(academyContent)
      .values({
        courseId,
        title,
        type,
        url,
        description: description || null,
        duration: duration || null,
        sortOrder: sortOrder ?? 0,
        createdById: req.user!.userId,
      })
      .returning();
    res.status(201).json({ content });
  }
);

router.delete("/content/:id", requireRole("ADMIN"), async (req, res) => {
  const db = getDb();
  const [deleted] = await db
    .delete(academyContent)
    .where(eq(academyContent._id, String(req.params.id)))
    .returning();
  if (!deleted) return res.status(404).json({ error: "Content not found" });
  res.json({ ok: true });
});

export default router;
