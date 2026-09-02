/**
 * Scheduled reminder sweeps that turn time-based events into notifications —
 * the server-side cron the in-app bell / push / WhatsApp can't do on their own.
 *
 * Currently: lead follow-up reminders. Each pending follow-up that is due soon
 * (or overdue) reminds the assigned CP once — deduped per follow-up via the
 * engine's dedupeKey, so it never nags repeatedly. Extensible: add meeting /
 * site-visit sweeps here the same way.
 */
import { and, eq, lte } from "drizzle-orm";
import { getDb } from "../config/db";
import { leadFollowUps, leads } from "../db/schema";
import { notifyUser } from "./notificationService";

/** Remind CPs about follow-ups due within the next 2 hours (or overdue). */
export async function runFollowUpReminders(): Promise<{ scanned: number; sent: number }> {
  const db = getDb();
  const soon = new Date(Date.now() + 2 * 60 * 60 * 1000);

  const rows = await db
    .select({
      id: leadFollowUps._id,
      cpId: leadFollowUps.cpId,
      channel: leadFollowUps.channel,
      note: leadFollowUps.note,
      leadId: leadFollowUps.leadId,
    })
    .from(leadFollowUps)
    .where(and(eq(leadFollowUps.status, "PENDING"), lte(leadFollowUps.dueAt, soon)));

  let sent = 0;
  for (const f of rows) {
    const [lead] = await db.select({ clientName: leads.clientName }).from(leads).where(eq(leads._id, f.leadId));
    const verb = f.channel === "CALL" ? "Call" : f.channel === "MEETING" ? "Meet" : "Follow up with";
    const created = await notifyUser(String(f.cpId), {
      type: "lead_followup",
      title: "Follow-up due ⏰",
      message: `${verb} ${lead?.clientName ?? "your lead"}${f.note ? ` — ${f.note}` : ""}.`,
      data: { href: "/crm/pipeline" },
      dedupeKey: `followup:${f.id}`, // remind once per follow-up
    });
    if (created.length) sent++;
  }
  return { scanned: rows.length, sent };
}

/**
 * Start the reminder scheduler: a first pass shortly after boot, then every
 * 15 minutes. A single long-lived interval in the API process (pm2-managed).
 */
export function startNotificationReminderScheduler(): void {
  const FIFTEEN_MIN = 15 * 60 * 1000;
  const run = () => {
    runFollowUpReminders()
      .then((r) => { if (r.sent > 0) console.log(`[reminders] follow-up reminders sent: ${r.sent}/${r.scanned}`); })
      .catch((err) => console.warn("[reminders] follow-up sweep failed:", err instanceof Error ? err.message : err));
  };
  setTimeout(run, 90_000).unref(); // first pass ~1.5 min after boot
  setInterval(run, FIFTEEN_MIN).unref();
}
