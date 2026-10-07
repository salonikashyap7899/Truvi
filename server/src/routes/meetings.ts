import { Router } from "express";
import { z } from "zod";
import { and, count, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "../config/db";
import { platformSettings, supportMeetings, users, SupportMeetingStatus } from "../db/schema";
import { isValidId } from "../lib/ids";
import { zodMessage } from "../lib/validationError";
import { authenticate, requireRole, AuthedRequest } from "../middleware/auth";
import { logAudit } from "../services/audit";
import { notifyRole, notifyUser } from "../services/notificationService";
import { istToday } from "../services/offerService";

/**
 * "Schedule a Google Meet" with the Truvi team, plus the fixed onboarding
 * session. There is no Google Calendar integration in Truvi, so the user picks
 * a date and time, and an admin confirms it with a Meet link (the admin screen
 * has a one-tap "Create a Meet" shortcut). The user then sees the date, time
 * and link with a Join button.
 *
 *  GET   /api/meetings/mine                    The caller's meetings + onboarding status.
 *  POST  /api/meetings                         Request a meeting (date + time).
 *  POST  /api/meetings/:id/cancel              Cancel one of my meetings.
 *  POST  /api/meetings/onboarding/complete     Mark my onboarding as done.
 *  GET   /api/meetings/admin                   Admin: all requests.
 *  PATCH /api/meetings/admin/:id               Admin: confirm (link) / reschedule / complete / cancel.
 *  PUT   /api/meetings/admin/onboarding-session Admin: set the fixed onboarding session.
 *  POST  /api/meetings/admin/users/:id/reset   Admin: reset a user's onboarding or CP joining.
 */
const router = Router();
router.use(authenticate);

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;
const MEET_LINK = z
  .string()
  .trim()
  .max(300)
  .url("Paste a valid meeting link")
  .refine((u) => u.startsWith("https://"), "The meeting link must start with https://");

function pastTime(date: string, time: string): boolean {
  return new Date(`${date}T${time}:00+05:30`).getTime() < Date.now();
}

async function onboardingSession() {
  const [s] = await getDb().select({ session: platformSettings.onboardingSession }).from(platformSettings).limit(1);
  const session = s?.session ?? null;
  // An onboarding date that has passed is no longer offered.
  if (!session || session.date < istToday()) return null;
  return session;
}

router.get("/mine", async (req: AuthedRequest, res) => {
  const db = getDb();
  const rows = await db
    .select({
      _id: supportMeetings._id,
      topic: supportMeetings.topic,
      date: supportMeetings.date,
      time: supportMeetings.time,
      note: supportMeetings.note,
      meetLink: supportMeetings.meetLink,
      status: supportMeetings.status,
      createdAt: supportMeetings.createdAt,
    })
    .from(supportMeetings)
    .where(eq(supportMeetings.userId, req.user!.userId))
    .orderBy(desc(supportMeetings.date), desc(supportMeetings.time))
    .limit(30);
  const [me] = await db.select({ onboardingCompletedAt: users.onboardingCompletedAt }).from(users).where(eq(users._id, req.user!.userId));
  res.json({
    meetings: rows,
    onboardingSession: await onboardingSession(),
    onboardingCompleted: !!me?.onboardingCompletedAt,
  });
});

const requestSchema = z.object({
  topic: z.enum(["ONBOARDING", "HELP"]).default("HELP"),
  date: z.string().regex(DATE, "Pick a date"),
  time: z.string().regex(TIME, "Pick a time"),
  note: z.string().trim().max(500).optional().or(z.literal("")),
});

router.post("/", async (req: AuthedRequest, res) => {
  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: zodMessage(parsed.error) });
  const d = parsed.data;
  if (d.date < istToday() || pastTime(d.date, d.time)) return res.status(400).json({ error: "Pick a date and time in the future" });
  if (d.date > istToday(60)) return res.status(400).json({ error: "Pick a date within the next 2 months" });
  if (d.time < "09:00" || d.time > "19:00") return res.status(400).json({ error: "Our team is available between 9:00 AM and 7:00 PM" });

  const db = getDb();
  const [{ open }] = await db
    .select({ open: count() })
    .from(supportMeetings)
    .where(and(eq(supportMeetings.userId, req.user!.userId), inArray(supportMeetings.status, ["REQUESTED", "CONFIRMED"])));
  if (open >= 3) return res.status(429).json({ error: "You already have 3 upcoming meetings — cancel one to book another" });

  const [meeting] = await db
    .insert(supportMeetings)
    .values({ userId: req.user!.userId, topic: d.topic, date: d.date, time: d.time, note: d.note || null })
    .returning();

  void (async () => {
    const [me] = await db.select({ name: users.name, role: users.role }).from(users).where(eq(users._id, req.user!.userId));
    await notifyRole("ADMIN", {
      type: "meeting_scheduled",
      title: "Google Meet requested",
      message: `${me?.name ?? "A user"} (${me?.role ?? ""}) asked for a ${d.topic === "ONBOARDING" ? "onboarding" : "help"} meeting on ${d.date} at ${d.time}. Add the Meet link to confirm.`,
      actorUserId: req.user!.userId,
      data: { href: "/admin/meetings" },
    });
  })().catch(() => {});

  res.status(201).json({ meeting });
});

router.post("/:id/cancel", async (req: AuthedRequest, res) => {
  if (!isValidId(req.params.id)) return res.status(404).json({ error: "Meeting not found" });
  const [m] = await getDb()
    .update(supportMeetings)
    .set({ status: "CANCELLED" })
    .where(and(
      eq(supportMeetings._id, req.params.id),
      eq(supportMeetings.userId, req.user!.userId),
      inArray(supportMeetings.status, ["REQUESTED", "CONFIRMED"]),
    ))
    .returning({ _id: supportMeetings._id });
  if (!m) return res.status(404).json({ error: "Meeting not found" });
  res.json({ ok: true });
});

router.post("/onboarding/complete", async (req: AuthedRequest, res) => {
  const [u] = await getDb()
    .update(users)
    .set({ onboardingCompletedAt: new Date() })
    .where(eq(users._id, req.user!.userId))
    .returning({ onboardingCompletedAt: users.onboardingCompletedAt });
  if (!u) return res.status(404).json({ error: "User not found" });
  res.json({ ok: true, onboardingCompletedAt: u.onboardingCompletedAt });
});

// ── Admin ────────────────────────────────────────────────────────────────────
router.get("/admin", requireRole("ADMIN"), async (req: AuthedRequest, res) => {
  const status = typeof req.query.status === "string" ? req.query.status : null;
  const allowed: SupportMeetingStatus[] = ["REQUESTED", "CONFIRMED", "COMPLETED", "CANCELLED"];
  const db = getDb();
  const rows = await db
    .select({
      meeting: supportMeetings,
      user: { _id: users._id, name: users.name, email: users.email, phone: users.phone, role: users.role },
    })
    .from(supportMeetings)
    .innerJoin(users, eq(supportMeetings.userId, users._id))
    .where(status && allowed.includes(status as SupportMeetingStatus) ? eq(supportMeetings.status, status as SupportMeetingStatus) : undefined)
    .orderBy(desc(supportMeetings.date), desc(supportMeetings.time))
    .limit(200);
  const [s] = await db.select({ session: platformSettings.onboardingSession }).from(platformSettings).limit(1);
  res.json({ meetings: rows.map((r) => ({ ...r.meeting, user: r.user })), onboardingSession: s?.session ?? null });
});

const adminPatch = z.object({
  date: z.string().regex(DATE).optional(),
  time: z.string().regex(TIME).optional(),
  meetLink: MEET_LINK.nullable().optional(),
  status: z.enum(["REQUESTED", "CONFIRMED", "COMPLETED", "CANCELLED"]).optional(),
  adminNote: z.string().trim().max(500).nullable().optional(),
});

router.patch("/admin/:id", requireRole("ADMIN"), async (req: AuthedRequest, res) => {
  if (!isValidId(req.params.id)) return res.status(404).json({ error: "Meeting not found" });
  const parsed = adminPatch.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: zodMessage(parsed.error) });
  const d = parsed.data;
  const db = getDb();
  const [m] = await db.select().from(supportMeetings).where(eq(supportMeetings._id, req.params.id));
  if (!m) return res.status(404).json({ error: "Meeting not found" });
  const link = d.meetLink === undefined ? m.meetLink : d.meetLink;
  if (d.status === "CONFIRMED" && !link) return res.status(400).json({ error: "Add the Google Meet link to confirm" });
  if ((d.date || d.time) && pastTime(d.date ?? m.date, d.time ?? m.time) && d.status !== "COMPLETED" && d.status !== "CANCELLED") {
    return res.status(400).json({ error: "Pick a date and time in the future" });
  }

  const [saved] = await db.update(supportMeetings).set(d).where(eq(supportMeetings._id, m._id)).returning();
  if (saved.status === "COMPLETED" && saved.topic === "ONBOARDING") {
    await db.update(users).set({ onboardingCompletedAt: new Date() }).where(eq(users._id, m.userId));
  }
  void logAudit({ userId: req.user!.userId, action: "meeting.update", resourceType: "support_meeting", resourceId: String(m._id), metadata: { fields: Object.keys(d) } });

  const when = `${saved.date} at ${saved.time}`;
  const message =
    saved.status === "CONFIRMED" ? `Your Google Meet with the Truvi team is confirmed for ${when}. Open "Meetings" to join.`
    : saved.status === "CANCELLED" ? `Your meeting on ${when} was cancelled by the Truvi team.${saved.adminNote ? ` ${saved.adminNote}` : ""}`
    : saved.status === "COMPLETED" ? "Thanks for meeting the Truvi team!"
    : `Your meeting request was updated (${when}).`;
  void notifyUser(String(m.userId), {
    type: "meeting_scheduled",
    title: "Truvi meeting",
    message,
    actorUserId: req.user!.userId,
    data: { href: "/help/meet" },
  }).catch(() => {});

  res.json({ meeting: saved });
});

const sessionSchema = z.object({
  date: z.string().regex(DATE, "Pick a date"),
  time: z.string().regex(TIME, "Pick a time"),
  link: MEET_LINK,
  note: z.string().trim().max(300).optional(),
}).nullable();

router.put("/admin/onboarding-session", requireRole("ADMIN"), async (req: AuthedRequest, res) => {
  const parsed = sessionSchema.safeParse(req.body?.session ?? null);
  if (!parsed.success) return res.status(400).json({ error: zodMessage(parsed.error) });
  const session = parsed.data;
  if (session && session.date < istToday()) return res.status(400).json({ error: "Pick a date that hasn't passed" });
  const db = getDb();
  const [row] = await db.select({ _id: platformSettings._id }).from(platformSettings).limit(1);
  if (row) await db.update(platformSettings).set({ onboardingSession: session, updatedAt: new Date() }).where(eq(platformSettings._id, row._id));
  else await db.insert(platformSettings).values({ onboardingSession: session });
  void logAudit({ userId: req.user!.userId, action: "settings.onboarding_session", resourceType: "settings", metadata: { cleared: !session } });
  res.json({ onboardingSession: session });
});

const resetSchema = z.object({ what: z.enum(["onboarding", "cpJoining"]) });

router.post("/admin/users/:id/reset", requireRole("ADMIN"), async (req: AuthedRequest, res) => {
  if (!isValidId(req.params.id)) return res.status(404).json({ error: "User not found" });
  const parsed = resetSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: zodMessage(parsed.error) });
  const db = getDb();
  const [target] = await db.select({ _id: users._id, role: users.role }).from(users).where(eq(users._id, req.params.id));
  if (!target) return res.status(404).json({ error: "User not found" });
  if (parsed.data.what === "cpJoining" && target.role !== "CP") return res.status(400).json({ error: "Only Channel Partners have a joining step" });
  // KYC is never touched here — only the joining / onboarding markers.
  await db
    .update(users)
    .set(parsed.data.what === "onboarding" ? { onboardingCompletedAt: null } : { cpJoinedAt: null })
    .where(eq(users._id, target._id));
  void logAudit({ userId: req.user!.userId, action: `user.reset.${parsed.data.what}`, resourceType: "user", resourceId: String(target._id) });
  res.json({ ok: true });
});

export default router;
