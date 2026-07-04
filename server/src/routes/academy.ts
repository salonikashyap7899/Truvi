import { Router } from "express";
import { z } from "zod";
import { CourseProgress } from "../models/CourseProgress";
import { authenticate, AuthedRequest } from "../middleware/auth";

const router = Router();
router.use(authenticate);

router.get("/progress", async (req: AuthedRequest, res) => {
  const progress = await CourseProgress.find({ userId: req.user!.userId });
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

  let progress = await CourseProgress.findOne({ userId, courseId });
  if (!progress) {
    progress = await CourseProgress.create({ userId, courseId: String(courseId), completedModules: [] });
  }

  if (!progress.completedModules.includes(moduleId)) {
    progress.completedModules.push(moduleId);
  }

  if (progress.completedModules.length >= totalModules && !progress.completedAt) {
    progress.completedAt = new Date();
  }

  await progress.save();
  res.json({ progress });
});

router.delete("/progress/:courseId/module/:moduleId", async (req: AuthedRequest, res) => {
  const { courseId, moduleId } = req.params;
  const userId = req.user!.userId;

  const progress = await CourseProgress.findOne({ userId, courseId });
  if (!progress) return res.status(404).json({ error: "Progress not found" });

  progress.completedModules = progress.completedModules.filter((m) => m !== moduleId);
  if (progress.completedAt) progress.completedAt = undefined;
  await progress.save();
  res.json({ progress });
});

export default router;
