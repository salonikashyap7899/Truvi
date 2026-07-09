import { Router } from "express";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { getDb } from "../config/db";
import { courseProgress } from "../db/schema";
import { authenticate, AuthedRequest } from "../middleware/auth";

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
    .where(and(eq(courseProgress.userId, userId), eq(courseProgress.courseId, courseId)))
    .limit(1);

  if (!progress) {
    [progress] = await db
      .insert(courseProgress)
      .values({ userId, courseId, completedModules: [] })
      .returning();
  }

  const completedModules = progress.completedModules.includes(moduleId)
    ? progress.completedModules
    : [...progress.completedModules, moduleId];

  const completedAt =
    completedModules.length >= totalModules && !progress.completedAt ? new Date() : progress.completedAt;

  [progress] = await db
    .update(courseProgress)
    .set({ completedModules, completedAt })
    .where(eq(courseProgress._id, progress._id))
    .returning();

  res.json({ progress });
});

router.delete("/progress/:courseId/module/:moduleId", async (req: AuthedRequest, res) => {
  const { courseId, moduleId } = req.params;
  const userId = req.user!.userId;
  const db = getDb();

  const [progress] = await db
    .select()
    .from(courseProgress)
    .where(and(eq(courseProgress.userId, userId), eq(courseProgress.courseId, courseId as string)))
    .limit(1);
  if (!progress) return res.status(404).json({ error: "Progress not found" });

  const completedModules = progress.completedModules.filter((m) => m !== moduleId);
  const [updated] = await db
    .update(courseProgress)
    .set({ completedModules, completedAt: null })
    .where(eq(courseProgress._id, progress._id))
    .returning();

  res.json({ progress: updated });
});

export default router;
