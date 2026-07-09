import { Router } from "express";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../config/db";
import { notifications } from "../db/schema";
import { authenticate, AuthedRequest } from "../middleware/auth";

const router = Router();
router.use(authenticate);

router.get("/", async (req: AuthedRequest, res) => {
  const db = getDb();
  const rows = await db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, req.user!.userId))
    .orderBy(desc(notifications.createdAt))
    .limit(50);
  res.json({ notifications: rows });
});

router.patch("/:id/read", async (req: AuthedRequest, res) => {
  const db = getDb();
  const [notification] = await db
    .update(notifications)
    .set({ isRead: true })
    .where(and(eq(notifications._id, req.params.id as string), eq(notifications.userId, req.user!.userId)))
    .returning();

  if (!notification) return res.status(404).json({ error: "Notification not found" });
  res.json({ notification });
});

router.patch("/read-all", async (req: AuthedRequest, res) => {
  const db = getDb();
  await db
    .update(notifications)
    .set({ isRead: true })
    .where(and(eq(notifications.userId, req.user!.userId), eq(notifications.isRead, false)));

  res.json({ message: "All notifications marked as read" });
});

export default router;
