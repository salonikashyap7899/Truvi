import { Router } from "express";
import { and, desc, eq, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../config/db";
import { notifications, notificationPreferences, userNotificationChannelPreferences } from "../db/schema";
import { isWhatsAppEnabled } from "../services/whatsappService";
import { authenticate, AuthedRequest } from "../middleware/auth";

const router = Router();
router.use(authenticate);

const preferenceSchema = z.object({
  inApp: z.boolean(),
  email: z.boolean(),
});

/** Property recommendation preferences. Existing users default to in-app/email enabled. */
router.get("/preferences", async (req: AuthedRequest, res) => {
  const db = getDb();
  const userId = req.user!.userId;
  const [legacyInApp] = await db.select({ enabled: notificationPreferences.enabled })
    .from(notificationPreferences)
    .where(and(
      eq(notificationPreferences.userId, userId),
      eq(notificationPreferences.category, "properties"),
    )).limit(1);
  const channelRows = await db.select({
    channel: userNotificationChannelPreferences.channel,
    enabled: userNotificationChannelPreferences.enabled,
  }).from(userNotificationChannelPreferences)
    .where(and(
      eq(userNotificationChannelPreferences.userId, userId),
      eq(userNotificationChannelPreferences.category, "properties"),
    ));
  const channels = new Map(channelRows.map((row) => [row.channel, row.enabled]));
  res.json({
    preferences: {
      inApp: legacyInApp?.enabled ?? true,
      email: channels.get("EMAIL") ?? true,
      // Property-match WhatsApp is intentionally unavailable; the existing
      // provider dispatcher is restricted to configured developer events.
      whatsapp: false,
      whatsappAvailable: false,
      whatsappProviderConfigured: isWhatsAppEnabled(),
    },
  });
});

/** Save only the supported property recommendation channels. WhatsApp is not advertised as active. */
router.put("/preferences", async (req: AuthedRequest, res) => {
  const parsed = preferenceSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid notification preferences." });
  }
  const db = getDb();
  const userId = req.user!.userId;
  const now = new Date();

  await db.insert(notificationPreferences)
    .values({ userId, category: "properties", enabled: parsed.data.inApp, updatedAt: now })
    .onConflictDoUpdate({
      target: [notificationPreferences.userId, notificationPreferences.category],
      set: { enabled: parsed.data.inApp, updatedAt: now },
    });

  await db.insert(userNotificationChannelPreferences)
    .values({ userId, channel: "EMAIL", category: "properties", enabled: parsed.data.email, updatedAt: now })
    .onConflictDoUpdate({
      target: [
        userNotificationChannelPreferences.userId,
        userNotificationChannelPreferences.channel,
        userNotificationChannelPreferences.category,
      ],
      set: { enabled: parsed.data.email, updatedAt: now },
    });

  res.json({
    preferences: {
      inApp: parsed.data.inApp,
      email: parsed.data.email,
      whatsapp: false,
      whatsappAvailable: false,
    },
  });
});

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
