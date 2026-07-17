import { Router } from "express";
import { z } from "zod";
import { and, desc, eq, gte, or } from "drizzle-orm";
import { getDb } from "../config/db";
import {
  crmTasks,
  commissions,
  leadActivities,
  leadFollowUps,
  leads,
  payments,
  projects,
  siteVisits,
  subscriptions,
  users,
} from "../db/schema";
import { getPlan, intervalEnd } from "../config/pricing";
import { isValidId } from "../lib/ids";
import { authenticate, requireRole, AuthedRequest } from "../middleware/auth";

/**
 * CP CRM — the paid productivity layer. Everything here (pipeline extras,
 * follow-ups, buyer timeline, tasks, tags, analytics summary, export) is
 * locked behind a CRM plan; the free tier only ever sees `GET /entitlement`.
 */

export type CpPlanTier = "FREE" | "CRM_LITE" | "CP_PRO" | "ENTERPRISE";

const CRM_PLAN_IDS = new Set(["cp_crm", "cp_crm_lite"]);
const PRO_PLAN_IDS = new Set(["cp_pro_monthly", "cp_pro_yearly", "cp_premium_membership"]);
const ENTERPRISE_PLAN_IDS = new Set(["cp_enterprise_monthly"]);

export interface CpEntitlement {
  tier: CpPlanTier;
  crm: boolean; // pipeline, follow-ups, timeline, tasks, tags, export
  ai: boolean; // AI scoring, copilot pro tools
  analytics: boolean; // targets, KPI dashboard, earnings graphs
  team: boolean; // Enterprise team CRM
  expiresAt: string | null;
}

export async function resolveCpEntitlement(userId: string): Promise<CpEntitlement> {
  const db = getDb();
  const now = Date.now();

  const [user] = await db.select().from(users).where(eq(users._id, userId)).limit(1);

  const [pays, subs] = await Promise.all([
    db.select().from(payments).where(and(eq(payments.userId, userId), eq(payments.status, "PAID"))),
    db.select().from(subscriptions).where(and(eq(subscriptions.userId, userId), eq(subscriptions.status, "ACTIVE"))),
  ]);

  const state = { tier: "FREE" as CpPlanTier, expiresAt: null as string | null };
  const rank: Record<CpPlanTier, number> = { FREE: 0, CRM_LITE: 1, CP_PRO: 2, ENTERPRISE: 3 };

  const consider = (planId: string, ends: Date | null) => {
    if (ends && ends.getTime() < now) return; // expired
    let planTier: CpPlanTier | null = null;
    if (ENTERPRISE_PLAN_IDS.has(planId)) planTier = "ENTERPRISE";
    else if (PRO_PLAN_IDS.has(planId)) planTier = "CP_PRO";
    else if (CRM_PLAN_IDS.has(planId)) planTier = "CRM_LITE";
    if (!planTier) return;
    if (rank[planTier] > rank[state.tier]) {
      state.tier = planTier;
      state.expiresAt = ends ? ends.toISOString() : null;
    }
  };

  for (const p of pays) consider(p.planId, intervalEnd(p.createdAt, getPlan(p.planId)?.interval));
  for (const s of subs) consider(s.internalPlanId, intervalEnd(s.createdAt, s.interval));

  // Legacy premium toggle (POST /api/premium/subscribe) also unlocks Pro.
  const prof = user?.cpProfile;
  if (prof?.isPremium) {
    const ends = prof.premiumExpiresAt ? new Date(prof.premiumExpiresAt) : null;
    if ((!ends || ends.getTime() > now) && rank["CP_PRO"] > rank[state.tier]) {
      state.tier = "CP_PRO";
      state.expiresAt = ends ? ends.toISOString() : null;
    }
  }

  const tier = state.tier;
  return {
    tier,
    crm: tier !== "FREE",
    ai: tier === "CP_PRO" || tier === "ENTERPRISE",
    analytics: tier !== "FREE",
    team: tier === "ENTERPRISE",
    expiresAt: state.expiresAt,
  };
}

const router = Router();
router.use(authenticate);
router.use(requireRole("CP"));

/** Free-tier accessible: tells the client which tier the CP is on. */
router.get("/entitlement", async (req: AuthedRequest, res) => {
  const entitlement = await resolveCpEntitlement(req.user!.userId);
  res.json({ entitlement });
});

/** Everything below is the paid CRM. */
router.use(async (req: AuthedRequest, res, next) => {
  const entitlement = await resolveCpEntitlement(req.user!.userId);
  if (!entitlement.crm) {
    return res.status(402).json({
      error: "CRM subscription required",
      upsell: "Unlock Truvi CRM — pipeline, follow-ups, AI reminders and WhatsApp automation from ₹99/month.",
    });
  }
  (req as AuthedRequest & { entitlement: CpEntitlement }).entitlement = entitlement;
  next();
});

/** A CP may only touch leads submitted by or assigned to them. */
async function ownedLead(userId: string, leadId: string) {
  if (!isValidId(leadId)) return null;
  const db = getDb();
  const [lead] = await db
    .select()
    .from(leads)
    .where(and(eq(leads._id, leadId), or(eq(leads.submittedById, userId), eq(leads.assignedToId, userId))))
    .limit(1);
  return lead ?? null;
}

// ── Follow-ups ─────────────────────────────────────────────────────────────
const createFollowUpSchema = z.object({
  dueAt: z.string().min(1),
  channel: z.enum(["CALL", "WHATSAPP", "EMAIL", "MEETING"]).default("CALL"),
  note: z.string().max(2000).optional(),
});

router.get("/followups", async (req: AuthedRequest, res) => {
  const db = getDb();
  const rows = await db
    .select({ followUp: leadFollowUps, lead: { _id: leads._id, clientName: leads.clientName, clientPhone: leads.clientPhone, stage: leads.stage } })
    .from(leadFollowUps)
    .leftJoin(leads, eq(leadFollowUps.leadId, leads._id))
    .where(eq(leadFollowUps.cpId, req.user!.userId))
    .orderBy(leadFollowUps.dueAt);
  res.json({ followUps: rows.map((r) => ({ ...r.followUp, lead: r.lead })) });
});

router.post("/leads/:id/followups", async (req: AuthedRequest, res) => {
  const parsed = createFollowUpSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });

  const lead = await ownedLead(req.user!.userId, String(req.params.id));
  if (!lead) return res.status(404).json({ error: "Lead not found" });

  const dueAt = new Date(parsed.data.dueAt);
  if (Number.isNaN(dueAt.getTime())) return res.status(400).json({ error: "Invalid dueAt date" });

  const db = getDb();
  const [followUp] = await db
    .insert(leadFollowUps)
    .values({ leadId: lead._id, cpId: req.user!.userId, dueAt, channel: parsed.data.channel, note: parsed.data.note })
    .returning();

  await db.insert(leadActivities).values({
    leadId: lead._id,
    cpId: req.user!.userId,
    type: "FOLLOW_UP",
    content: `Follow-up scheduled (${parsed.data.channel}) for ${dueAt.toLocaleString("en-IN")}`,
  });

  res.status(201).json({ followUp });
});

router.patch("/followups/:id", async (req: AuthedRequest, res) => {
  const parsed = z.object({ status: z.enum(["PENDING", "DONE", "MISSED"]) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });
  if (!isValidId(String(req.params.id))) return res.status(404).json({ error: "Follow-up not found" });

  const db = getDb();
  const [updated] = await db
    .update(leadFollowUps)
    .set({ status: parsed.data.status })
    .where(and(eq(leadFollowUps._id, String(req.params.id)), eq(leadFollowUps.cpId, req.user!.userId)))
    .returning();
  if (!updated) return res.status(404).json({ error: "Follow-up not found" });
  res.json({ followUp: updated });
});

// ── Buyer timeline / activities ────────────────────────────────────────────
const createActivitySchema = z.object({
  type: z.enum(["CALL", "WHATSAPP", "EMAIL", "NOTE", "SITE_VISIT", "DOCUMENT", "AI_REPORT"]),
  content: z.string().min(1).max(4000),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

router.get("/leads/:id/activities", async (req: AuthedRequest, res) => {
  const lead = await ownedLead(req.user!.userId, String(req.params.id));
  if (!lead) return res.status(404).json({ error: "Lead not found" });

  const db = getDb();
  const activities = await db
    .select()
    .from(leadActivities)
    .where(eq(leadActivities.leadId, lead._id))
    .orderBy(desc(leadActivities.createdAt));
  res.json({ activities });
});

router.post("/leads/:id/activities", async (req: AuthedRequest, res) => {
  const parsed = createActivitySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });

  const lead = await ownedLead(req.user!.userId, String(req.params.id));
  if (!lead) return res.status(404).json({ error: "Lead not found" });

  const db = getDb();
  const [activity] = await db
    .insert(leadActivities)
    .values({ leadId: lead._id, cpId: req.user!.userId, ...parsed.data })
    .returning();
  res.status(201).json({ activity });
});

// ── Lead tags ──────────────────────────────────────────────────────────────
router.patch("/leads/:id/tags", async (req: AuthedRequest, res) => {
  const parsed = z.object({ tags: z.array(z.string().min(1).max(40)).max(20) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });

  const lead = await ownedLead(req.user!.userId, String(req.params.id));
  if (!lead) return res.status(404).json({ error: "Lead not found" });

  const db = getDb();
  const [updated] = await db.update(leads).set({ tags: parsed.data.tags }).where(eq(leads._id, lead._id)).returning();
  res.json({ lead: updated });
});

// ── Tasks ──────────────────────────────────────────────────────────────────
const createTaskSchema = z.object({
  title: z.string().min(1).max(300),
  dueAt: z.string().optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).default("MEDIUM"),
  leadId: z.string().optional(),
});

router.get("/tasks", async (req: AuthedRequest, res) => {
  const db = getDb();
  const tasks = await db
    .select()
    .from(crmTasks)
    .where(eq(crmTasks.cpId, req.user!.userId))
    .orderBy(desc(crmTasks.createdAt));
  res.json({ tasks });
});

router.post("/tasks", async (req: AuthedRequest, res) => {
  const parsed = createTaskSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });

  const { title, dueAt, priority, leadId } = parsed.data;
  if (leadId && !(await ownedLead(req.user!.userId, leadId))) return res.status(404).json({ error: "Lead not found" });

  const db = getDb();
  const [task] = await db
    .insert(crmTasks)
    .values({
      cpId: req.user!.userId,
      title,
      priority,
      leadId: leadId || null,
      dueAt: dueAt ? new Date(dueAt) : null,
    })
    .returning();
  res.status(201).json({ task });
});

router.patch("/tasks/:id", async (req: AuthedRequest, res) => {
  const parsed = z.object({ status: z.enum(["OPEN", "DONE"]) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });
  if (!isValidId(String(req.params.id))) return res.status(404).json({ error: "Task not found" });

  const db = getDb();
  const [updated] = await db
    .update(crmTasks)
    .set({ status: parsed.data.status })
    .where(and(eq(crmTasks._id, String(req.params.id)), eq(crmTasks.cpId, req.user!.userId)))
    .returning();
  if (!updated) return res.status(404).json({ error: "Task not found" });
  res.json({ task: updated });
});

// ── Daily targets + KPI summary (Business Hub) ─────────────────────────────
router.get("/summary", async (req: AuthedRequest, res) => {
  const db = getDb();
  const uid = req.user!.userId;
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [myLeads, myFollowUps, myCommissions, myVisits, todayActivities] = await Promise.all([
    db.select().from(leads).where(or(eq(leads.submittedById, uid), eq(leads.assignedToId, uid))),
    db.select().from(leadFollowUps).where(eq(leadFollowUps.cpId, uid)),
    db.select().from(commissions).where(eq(commissions.cpId, uid)),
    db.select().from(siteVisits).where(eq(siteVisits.cpId, uid)),
    db
      .select()
      .from(leadActivities)
      .where(and(eq(leadActivities.cpId, uid), gte(leadActivities.createdAt, startOfDay))),
  ]);

  const isToday = (d: Date | string | null | undefined) => !!d && new Date(d).getTime() >= startOfDay.getTime();

  const bookedStages = new Set(["BOOKING", "REGISTRATION", "COMPLETED"]);
  const bookedLeads = myLeads.filter((l) => bookedStages.has(l.stage));
  const visitedLeads = myLeads.filter((l) => ["SITE_VISIT", "NEGOTIATION", ...bookedStages].includes(l.stage));

  const earnedTotal = myCommissions.reduce((s, c) => s + c.cpCommissionAmount, 0);
  const paidTotal = myCommissions.reduce(
    (s, c) => s + c.milestones.filter((m) => m.isReleased).reduce((a, m) => a + m.amount, 0),
    0
  );

  // Monthly earnings series (last 6 months) for the earnings graph.
  const months: { month: string; earned: number; paid: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    const key = d.toLocaleString("en-IN", { month: "short", year: "2-digit" });
    const inMonth = myCommissions.filter((c) => {
      const cd = new Date(c.createdAt);
      return cd.getMonth() === d.getMonth() && cd.getFullYear() === d.getFullYear();
    });
    months.push({
      month: key,
      earned: inMonth.reduce((s, c) => s + c.cpCommissionAmount, 0),
      paid: inMonth.reduce((s, c) => s + c.milestones.filter((m) => m.isReleased).reduce((a, m) => a + m.amount, 0), 0),
    });
  }

  res.json({
    today: {
      calls: todayActivities.filter((a) => a.type === "CALL").length,
      whatsapp: todayActivities.filter((a) => a.type === "WHATSAPP").length,
      followUpsDue: myFollowUps.filter((f) => f.status === "PENDING" && isToday(f.dueAt) === true).length,
      followUpsPending: myFollowUps.filter((f) => f.status === "PENDING").length,
      siteVisits: myVisits.filter((v) => isToday(v.scheduledAt)).length,
      closings: bookedLeads.filter((l) => isToday(l.updatedAt)).length,
      earnings: myCommissions.filter((c) => isToday(c.createdAt)).reduce((s, c) => s + c.cpCommissionAmount, 0),
    },
    kpis: {
      totalLeads: myLeads.length,
      activeLeads: myLeads.filter((l) => !bookedStages.has(l.stage) && l.stage !== "LOST").length,
      conversionPercent: myLeads.length ? Math.round((bookedLeads.length / myLeads.length) * 100) : 0,
      siteVisitPercent: myLeads.length ? Math.round((visitedLeads.length / myLeads.length) * 100) : 0,
      avgDealSize: bookedLeads.length ? Math.round(earnedTotal / bookedLeads.length) : 0,
      lifetimeEarnings: earnedTotal,
      pendingCommission: earnedTotal - paidTotal,
      paidCommission: paidTotal,
      ltvGenerated: myCommissions.reduce((s, c) => s + c.bookingValue, 0),
    },
    monthlyEarnings: months,
  });
});

// ── Export (CSV) ───────────────────────────────────────────────────────────
router.get("/export", async (req: AuthedRequest, res) => {
  const db = getDb();
  const uid = req.user!.userId;

  const rows = await db
    .select({ lead: leads, project: { name: projects.name, city: projects.city } })
    .from(leads)
    .leftJoin(projects, eq(leads.projectId, projects._id))
    .where(or(eq(leads.submittedById, uid), eq(leads.assignedToId, uid)))
    .orderBy(desc(leads.updatedAt));

  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const header = ["Client Name", "Phone", "Email", "Project", "City", "Stage", "Tags", "Source", "Created", "Updated"];
  const lines = rows.map(({ lead, project }) =>
    [
      lead.clientName,
      lead.clientPhone,
      lead.clientEmail,
      project?.name,
      project?.city,
      lead.stage,
      (lead.tags ?? []).join("; "),
      lead.source,
      lead.createdAt.toISOString(),
      lead.updatedAt.toISOString(),
    ]
      .map(esc)
      .join(",")
  );

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="truvi-leads-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send([header.map(esc).join(","), ...lines].join("\n"));
});

export default router;
