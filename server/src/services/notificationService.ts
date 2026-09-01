/**
 * Centralized notification engine.
 *
 * Every notification in the app should be created through this service instead
 * of ad-hoc `db.insert(notifications)` calls scattered across routes. It:
 *   - writes ONE row per recipient (never a shared row for many users),
 *   - stamps a machine-readable `type`, optional `title`, deep-link `data`,
 *     `priority` and `actorUserId`,
 *   - emits the row over Socket.io to each recipient's personal room in real
 *     time (`notification:new`), and
 *   - supports idempotency via `dedupeKey`, so a double-fired event (e.g. an
 *     admin clicking "Approve" twice) never produces duplicate notifications.
 *
 * This is the Truvi (Express + Drizzle + Postgres + Socket.io) equivalent of
 * the spec's "Notification Engine" — Socket.io stands in for Supabase Realtime,
 * and server-side auth + per-user queries stand in for RLS.
 */
import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { getDb } from "../config/db";
import { notifications, notificationPreferences, users } from "../db/schema";
import { emitNotification } from "../sockets";
import { isWhatsAppEnabled, dispatchNotificationWhatsApp } from "./whatsappService";

export type NotificationPriority = "low" | "normal" | "high" | "critical";

/**
 * Known notification types. This is intentionally a plain list of string
 * constants, not a closed enum — callers may pass any string, so the system
 * stays extensible (per the spec). These just document the common ones and
 * give call sites autocomplete.
 */
export const NotificationType = {
  // Projects
  PROJECT_SUBMITTED: "project_submitted",
  PROJECT_APPROVED: "project_approved",
  PROJECT_REJECTED: "project_rejected",
  PROJECT_CHANGES_REQUIRED: "project_changes_required",
  PROJECT_LIVE: "project_live",
  NEW_PROJECT: "new_project",
  // Properties
  NEW_PROPERTY: "new_property",
  PROPERTY_UPDATED: "property_updated",
  PROPERTY_PRICE_CHANGED: "property_price_changed",
  // Referrals & commissions
  DEVELOPER_REFERRED: "developer_referred",
  CHANNEL_PARTNER_REFERRED: "channel_partner_referred",
  REFERRAL_REGISTERED: "referral_registered",
  REFERRAL_CONVERTED: "referral_converted",
  COMMISSION_EARNED: "commission_earned",
  // Leads
  NEW_LEAD: "new_lead",
  LEAD_ASSIGNED: "lead_assigned",
  LEAD_UPDATED: "lead_updated",
  LEAD_FOLLOWUP: "lead_followup",
  LEAD_CONVERTED: "lead_converted",
  // Tasks
  INVESTOR_TASK: "investor_task",
  INVESTOR_TASK_REMINDER: "investor_task_reminder",
  DAILY_TASK: "daily_task",
  TASK_COMPLETED: "task_completed",
  // Meetings
  MEETING_REMINDER: "meeting_reminder",
  MEETING_SCHEDULED: "meeting_scheduled",
  MEETING_UPDATED: "meeting_updated",
  MEETING_CANCELLED: "meeting_cancelled",
  // Misc
  INVESTMENT_OPPORTUNITY: "investment_opportunity",
  SYSTEM_ANNOUNCEMENT: "system_announcement",
  SECURITY_ALERT: "security_alert",
  GENERAL: "general",
} as const;

/**
 * Which preference category a type belongs to. Types not listed here are always
 * delivered (they have no off-switch). Security types are intentionally absent
 * so they can never be muted.
 */
const TYPE_CATEGORY: Record<string, string> = {
  project_submitted: "projects",
  project_approved: "projects",
  project_rejected: "projects",
  project_changes_required: "projects",
  project_live: "projects",
  new_project: "projects",
  new_property: "properties",
  property_updated: "properties",
  property_price_changed: "properties",
  developer_referred: "referrals",
  channel_partner_referred: "referrals",
  referral_registered: "referrals",
  referral_converted: "referrals",
  commission_earned: "referrals",
  new_lead: "leads",
  lead_assigned: "leads",
  lead_updated: "leads",
  lead_followup: "leads",
  lead_converted: "leads",
  investor_task: "tasks",
  investor_task_reminder: "tasks",
  daily_task: "tasks",
  task_completed: "tasks",
  meeting_reminder: "meetings",
  meeting_scheduled: "meetings",
  meeting_updated: "meetings",
  meeting_cancelled: "meetings",
  investment_opportunity: "investment",
  system_announcement: "announcements",
};

export interface NotificationInput {
  type: string;
  message: string;
  title?: string;
  data?: Record<string, unknown>;
  priority?: NotificationPriority;
  actorUserId?: string;
  expiresAt?: Date;
  /**
   * Idempotency key. If given, a recipient who already has a notification of
   * the same `type` + `dedupeKey` is skipped, so re-fired events don't stack.
   */
  dedupeKey?: string;
}

/** Categories a user has explicitly switched OFF (missing row = on). */
async function disabledCategories(userIds: string[]): Promise<Map<string, Set<string>>> {
  const db = getDb();
  const rows = await db
    .select({ userId: notificationPreferences.userId, category: notificationPreferences.category })
    .from(notificationPreferences)
    .where(and(inArray(notificationPreferences.userId, userIds), eq(notificationPreferences.enabled, false)));
  const map = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!map.has(r.userId)) map.set(r.userId, new Set());
    map.get(r.userId)!.add(r.category);
  }
  return map;
}

/**
 * Core: create one notification row per recipient, honouring preferences and
 * idempotency, then emit each in real time. Returns the rows actually created.
 */
export async function createNotifications(
  recipientUserIds: string[],
  input: NotificationInput,
): Promise<Array<typeof notifications.$inferSelect>> {
  const db = getDb();
  let recipients = Array.from(new Set(recipientUserIds.filter(Boolean)));
  if (recipients.length === 0) return [];

  // Preference filter — a muteable category the user turned off is skipped.
  const category = TYPE_CATEGORY[input.type];
  if (category) {
    const off = await disabledCategories(recipients);
    recipients = recipients.filter((id) => !off.get(id)?.has(category));
    if (recipients.length === 0) return [];
  }

  // Idempotency — skip recipients who already have this (type + dedupeKey).
  if (input.dedupeKey) {
    const since = new Date(Date.now() - 1000 * 60 * 60 * 24 * 7); // 7-day window
    const existing = await db
      .select({ userId: notifications.userId })
      .from(notifications)
      .where(
        and(
          inArray(notifications.userId, recipients),
          eq(notifications.type, input.type),
          gt(notifications.createdAt, since),
          sql`${notifications.data} ->> '_dedupe' = ${input.dedupeKey}`,
        ),
      );
    const seen = new Set(existing.map((e) => e.userId));
    recipients = recipients.filter((id) => !seen.has(id));
    if (recipients.length === 0) return [];
  }

  const data = input.dedupeKey ? { ...(input.data ?? {}), _dedupe: input.dedupeKey } : input.data;

  const rows = await db
    .insert(notifications)
    .values(
      recipients.map((userId) => ({
        userId,
        message: input.message,
        type: input.type,
        title: input.title ?? null,
        actorUserId: input.actorUserId ?? null,
        data: data ?? null,
        priority: input.priority ?? "normal",
        expiresAt: input.expiresAt ?? null,
      })),
    )
    .returning();

  for (const row of rows) emitNotification(String(row.userId), row);

  // WhatsApp side-channel — runs ALONGSIDE the in-app notification, never
  // replaces it. Dormant unless credentials are configured. Developer
  // recipients also get a WhatsApp copy for eligible event types. Entirely
  // fire-and-forget so it can never delay or fail the in-app path.
  if (isWhatsAppEnabled()) {
    void (async () => {
      try {
        const recips = await db
          .select({ id: users._id, role: users.role, phone: users.phone, name: users.name })
          .from(users)
          .where(inArray(users._id, rows.map((r) => String(r.userId))));
        const byId = new Map(recips.map((u) => [String(u.id), u]));
        for (const row of rows) {
          const u = byId.get(String(row.userId));
          if (u) await dispatchNotificationWhatsApp(u, { type: row.type, title: row.title, message: row.message });
        }
      } catch {
        /* non-fatal */
      }
    })();
  }

  return rows;
}

/** Notify a single user. */
export function notifyUser(userId: string, input: NotificationInput) {
  return createNotifications([userId], input);
}

/** Notify an explicit list of users. */
export function notifyUsers(userIds: string[], input: NotificationInput) {
  return createNotifications(userIds, input);
}

/**
 * Notify everyone holding a role (or any of several roles). Note: in Truvi a
 * "founder" is an ADMIN, so notifying role "ADMIN" reaches admins and founders.
 */
export async function notifyRole(role: string | string[], input: NotificationInput) {
  const db = getDb();
  const roles = Array.isArray(role) ? role : [role];
  const targets = await db
    .select({ id: users._id })
    .from(users)
    .where(inArray(users.role, roles as never));
  return createNotifications(targets.map((t) => String(t.id)), input);
}
