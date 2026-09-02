import { Router } from "express";
import { and, desc, eq, lt, sql } from "drizzle-orm";
import { getDb } from "../config/db";
import { notifications, userPushTokens } from "../db/schema";
import { authenticate, AuthedRequest } from "../middleware/auth";
import { catchUpPushForUser } from "../services/pushService";

const router = Router();
router.use(authenticate);

/**
 * List the signed-in user's notifications (newest first).
 * Query params:
 *   - unread=1     → only unread
 *   - limit=N      → page size (default 50, max 100)
 *   - before=ISO   → cursor: rows older than this createdAt (infinite scroll)
 */
router.get("/", async (req: AuthedRequest, res) => {
  const db = getDb();
  const limit = Math.min(Number(req.query.limit) || 50, 100);
  const onlyUnread = req.query.unread === "1" || req.query.unread === "true";
  const before = req.query.before ? new Date(String(req.query.before)) : null;

  const conds = [eq(notifications.userId, req.user!.userId)];
  if (onlyUnread) conds.push(eq(notifications.isRead, false));
  if (before && !Number.isNaN(before.getTime())) conds.push(lt(notifications.createdAt, before));

  const rows = await db
    .select()
    .from(notifications)
    .where(and(...conds))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
  res.json({ notifications: rows });
});

/** Unread count — used by the bell badge; kept cheap and separate from the list. */
router.get("/unread-count", async (req: AuthedRequest, res) => {
  const db = getDb();
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.userId, req.user!.userId), eq(notifications.isRead, false)));
  res.json({ count: row?.count ?? 0 });
});

router.patch("/:id/read", async (req: AuthedRequest, res) => {
  const db = getDb();
  const [notification] = await db
    .update(notifications)
    .set({ isRead: true, readAt: new Date() })
    .where(and(eq(notifications._id, req.params.id as string), eq(notifications.userId, req.user!.userId)))
    .returning();

  if (!notification) return res.status(404).json({ error: "Notification not found" });
  res.json({ notification });
});

router.patch("/read-all", async (req: AuthedRequest, res) => {
  const db = getDb();
  await db
    .update(notifications)
    .set({ isRead: true, readAt: new Date() })
    .where(and(eq(notifications.userId, req.user!.userId), eq(notifications.isRead, false)));

  res.json({ message: "All notifications marked as read" });
});

/**
 * Register (or refresh) this device's push token for the signed-in user.
 * Called by the mobile app after it obtains an FCM token. The token is unique,
 * so re-registering the same device just re-points it at the current user.
 */
router.post("/push-token", async (req: AuthedRequest, res) => {
  const token = typeof req.body?.token === "string" ? req.body.token.trim() : "";
  if (!token) return res.status(400).json({ error: "token is required" });
  const platform = typeof req.body?.platform === "string" ? req.body.platform : "android";
  const deviceId = typeof req.body?.deviceId === "string" ? req.body.deviceId : null;

  const db = getDb();
  await db
    .insert(userPushTokens)
    .values({ userId: req.user!.userId, token, platform, deviceId })
    .onConflictDoUpdate({
      target: userPushTokens.token,
      set: { userId: req.user!.userId, platform, deviceId, updatedAt: new Date() },
    });

  // Now that this user has a device, deliver as push any notifications created
  // while they had none (e.g. the welcome + role onboarding made at signup,
  // before they first opened the app). Fire-and-forget; never blocks the response.
  void catchUpPushForUser(req.user!.userId);

  res.json({ ok: true });
});

/** Remove a device token (e.g. on logout). */
router.delete("/push-token", async (req: AuthedRequest, res) => {
  const token = typeof req.body?.token === "string" ? req.body.token.trim() : "";
  if (!token) return res.status(400).json({ error: "token is required" });
  const db = getDb();
  await db
    .delete(userPushTokens)
    .where(and(eq(userPushTokens.token, token), eq(userPushTokens.userId, req.user!.userId)));
  res.json({ ok: true });
});

/** Delete one of the user's own notifications. */
router.delete("/:id", async (req: AuthedRequest, res) => {
  const db = getDb();
  const [deleted] = await db
    .delete(notifications)
    .where(and(eq(notifications._id, req.params.id as string), eq(notifications.userId, req.user!.userId)))
    .returning({ id: notifications._id });

  if (!deleted) return res.status(404).json({ error: "Notification not found" });
  res.json({ message: "Notification deleted" });
});

export default router;
