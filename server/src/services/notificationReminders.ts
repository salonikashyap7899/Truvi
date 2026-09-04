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
import { leadFollowUps, leads, users, projects, subscriptions } from "../db/schema";
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
 * Recurring "finish what you started" nudges. Each active user is reminded of
 * the things they haven't done yet — and the reminders STOP on their own the
 * moment the task is done, because the sweep simply stops matching that user.
 *
 * Covered:
 *   • CP / Ambassador who haven't completed KYC.
 *   • Developers who haven't listed a single project.
 *   • Buyers / CPs / Developers who aren't on Pro yet → upgrade nudge.
 *
 * Anti-spam: the dedupeKey carries a time bucket, so each pending item reminds
 * a user AT MOST once per REMIND_EVERY_MS (3 days), no matter how often the
 * sweep runs. Once the user finishes (KYC verified / project listed / Pro
 * bought) the condition is false and no further reminders are created.
 */
const REMIND_EVERY_MS = 3 * 24 * 60 * 60 * 1000; // remind at most once / 3 days

export async function runRoleCompletionReminders(): Promise<{ sent: number }> {
  const db = getDb();
  const bucket = Math.floor(Date.now() / REMIND_EVERY_MS); // rotates every 3 days
  let sent = 0;

  const everyone = await db
    .select({ id: users._id, role: users.role, onboardingVerified: users.onboardingVerified, cpProfile: users.cpProfile })
    .from(users)
    .where(eq(users.disabled, false));

  // Developers who already have ≥1 project, and users already on Pro — skipped.
  const projectRows = await db.select({ developerId: projects.developerId }).from(projects);
  const devsWithProject = new Set(projectRows.map((p) => String(p.developerId)));
  const subRows = await db.select({ userId: subscriptions.userId }).from(subscriptions).where(eq(subscriptions.status, "ACTIVE"));
  const proUsers = new Set(subRows.map((s) => String(s.userId)));

  for (const u of everyone) {
    const uid = String(u.id);
    const role = u.role;
    if (role === "ADMIN" || role === "VERIFIER") continue;

    // 1) KYC not finished (CP / Ambassador can't fully operate without it).
    if ((role === "CP" || role === "AMBASSADOR") && !u.onboardingVerified) {
      const r = await notifyUser(uid, {
        type: "onboarding",
        title: "Finish your KYC ✅",
        message: "Complete your identity verification to unlock full access and start earning.",
        data: { href: role === "CP" ? "/cp/dashboard" : "/ambassador/dashboard" },
        dedupeKey: `remind-kyc:${bucket}`,
      });
      if (r.length) sent++;
    }

    // 2) Developer hasn't listed any project yet.
    if (role === "DEVELOPER" && !devsWithProject.has(uid)) {
      const r = await notifyUser(uid, {
        type: "onboarding",
        title: "List your first project 🏗️",
        message: "Add your project to start getting verified buyer leads on Truvi.",
        data: { href: "/developer/projects/new" },
        dedupeKey: `remind-listproject:${bucket}`,
      });
      if (r.length) sent++;
    }

    // 3) Not on Pro yet → upgrade nudge (muteable via the announcements pref).
    const isPro = proUsers.has(uid) || Boolean(u.cpProfile?.isPremium);
    if (!isPro && (role === "CP" || role === "DEVELOPER" || role === "BUYER")) {
      const r = await notifyUser(uid, {
        type: "system_announcement",
        title: "Upgrade to Truvi Pro ⭐",
        message: "Unlock premium tools, deeper analytics and priority features with Truvi Pro.",
        data: { href: "/pricing" },
        dedupeKey: `remind-pro:${bucket}`,
      });
      if (r.length) sent++;
    }
  }
  return { sent };
}

/**
 * Start the reminder scheduler. Two long-lived intervals in the API process
 * (pm2-managed): frequent lead follow-ups, and a less-frequent role-completion
 * sweep (the 3-day dedupe bucket makes the exact cadence unimportant).
 */
export function startNotificationReminderScheduler(): void {
  const FIFTEEN_MIN = 15 * 60 * 1000;
  const SIX_HOURS = 6 * 60 * 60 * 1000;

  const runFollowUps = () => {
    runFollowUpReminders()
      .then((r) => { if (r.sent > 0) console.log(`[reminders] follow-up reminders sent: ${r.sent}/${r.scanned}`); })
      .catch((err) => console.warn("[reminders] follow-up sweep failed:", err instanceof Error ? err.message : err));
  };
  const runRole = () => {
    runRoleCompletionReminders()
      .then((r) => { if (r.sent > 0) console.log(`[reminders] role-completion reminders sent: ${r.sent}`); })
      .catch((err) => console.warn("[reminders] role sweep failed:", err instanceof Error ? err.message : err));
  };

  setTimeout(runFollowUps, 90_000).unref(); // ~1.5 min after boot
  setInterval(runFollowUps, FIFTEEN_MIN).unref();
  setTimeout(runRole, 120_000).unref();      // ~2 min after boot
  setInterval(runRole, SIX_HOURS).unref();
}
