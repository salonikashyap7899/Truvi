import { Router } from "express";
import { zodMessage } from "../lib/validationError";
import { z } from "zod";
import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "../config/db";
import {
  employees,
  marketingCampaigns,
  landParcels,
  capTableEntries,
  fundraiseRounds,
  investorUpdates,
  customerFeedback,
  users,
  employeeInvites,
  employeeTasks,
  employeeAttendance,
  employeeSalaryRecords,
  leads,
  siteVisits,
} from "../db/schema";
import { authenticate, AuthedRequest } from "../middleware/auth";
import { isFounderEmail } from "../config/env";

/**
 * Founder-only operating modules (Team, Marketing, Land Bank, Investor). These
 * back the previously-placeholder sections of the Founder "CEO OS" dashboard.
 * These routes are restricted to configured founder identities, not all
 * operational ADMIN accounts. All figures are derived from rows the founder
 * actually enters — nothing here is fabricated (platform data-integrity rule).
 */
const router = Router();
router.use(authenticate);

// Re-resolve identity from the database rather than trusting client routing
// or only the ADMIN role embedded in an access token.
router.use(async (req: AuthedRequest, res, next) => {
  if (!req.user || req.user.role !== "ADMIN") {
    return res.status(403).json({ error: "Founder access required" });
  }
  const userId = req.user.userId;
  try {
    const db = getDb();
    const [account] = await db
      .select({ email: users.email, role: users.role, disabled: users.disabled })
      .from(users)
      .where(eq(users._id, userId))
      .limit(1);
    if (!account || account.disabled || account.role !== "ADMIN" || !isFounderEmail(account.email)) {
      return res.status(403).json({ error: "Founder access required" });
    }
    return next();
  } catch (error) {
    return next(error);
  }
});

const round = (n: number) => Math.round(n * 100) / 100;

// Robust boolean coercion: multipart/JSON may send "true"/"false" as strings,
// and z.coerce.boolean() wrongly treats the string "false" as true.
const zBool = z.preprocess((v) => {
  if (typeof v === "string") return v.toLowerCase() === "true" || v === "1";
  return v;
}, z.boolean());

// --------------------------------------------------------------- aggregate
router.get("/summary", async (_req, res) => {
  const db = getDb();
  const [emps, campaigns, land, cap, rounds, updates, feedback, employeeAccounts, invites, workTasks, attendanceRows, salaryRows, employeeLeadRows, employeeVisitRows] = await Promise.all([
    db.select().from(employees).orderBy(desc(employees.performanceScore)),
    db.select().from(marketingCampaigns).orderBy(desc(marketingCampaigns.createdAt)),
    db.select().from(landParcels).orderBy(desc(landParcels.createdAt)),
    db.select().from(capTableEntries).orderBy(desc(capTableEntries.equityPercent)),
    db.select().from(fundraiseRounds).orderBy(desc(fundraiseRounds.createdAt)),
    db.select().from(investorUpdates).orderBy(desc(investorUpdates.createdAt)),
    db.select().from(customerFeedback).orderBy(desc(customerFeedback.createdAt)),
    db.select().from(users).where(eq(users.role, "EMPLOYEE")),
    db.select().from(employeeInvites),
    db.select().from(employeeTasks),
    db.select().from(employeeAttendance),
    db.select().from(employeeSalaryRecords),
    db.select().from(leads).where(eq(leads.creatorRole, "EMPLOYEE")),
    db.select().from(siteVisits).where(sql`responsible_user_id IS NOT NULL`),
  ]);

  // ---- Team ----
  const activeEmps = emps.filter((e) => e.status === "ACTIVE");
  const linkedEmployeeIds = new Set(emps.filter((e) => e.accountUserId).map((e) => String(e.accountUserId)));
  const linkedAccountRows = employeeAccounts.filter((u) => linkedEmployeeIds.has(String(u._id)));
  const enabledAccounts = linkedAccountRows.filter((u) => !u.disabled);
  const activeProfileIds = new Set(emps.filter((e) => e.status !== "INACTIVE").map((e) => String(e._id)));
  const pendingInvitations = new Set(invites.filter((i) => !i.usedAt && i.expiresAt > new Date() && activeProfileIds.has(String(i.employeeId))).map((i) => String(i.employeeId)));
  const todayIST = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const todayAttendance = attendanceRows.filter((a) => a.attendanceDate === todayIST);
  const pendingTasks = workTasks.filter((t) => !["COMPLETED", "CANCELLED"].includes(t.status));
  const employeeLeadIds = new Set(employeeLeadRows.filter((l) => linkedEmployeeIds.has(String(l.submittedById)) || linkedEmployeeIds.has(String(l.assignedToId))).map((l) => String(l._id)));
  const now = new Date();
  const team = {
    total: emps.length,
    active: activeEmps.length,
    presentToday: todayAttendance.filter((a) => a.status === "PRESENT").length + (emps.filter((e) => !e.accountUserId && e.presentToday && e.status !== "INACTIVE").length),
    onLeave: todayAttendance.filter((a) => a.status === "ON_LEAVE").length + emps.filter((e) => !e.accountUserId && e.status === "ON_LEAVE").length,
    tasksPending: pendingTasks.length + emps.filter((e) => !e.accountUserId).reduce((sum, e) => sum + e.tasksPending, 0),
    avgPerformance: emps.length ? Math.round(emps.reduce((s, e) => s + e.performanceScore, 0) / emps.length) : 0,
    monthlyPayroll: round(activeEmps.reduce((s, e) => s + e.monthlyCtc, 0)),
    employeeAccounts: employeeAccounts.length,
    activeEmployeeAccounts: enabledAccounts.length,
    inactiveEmployeeAccounts: employeeAccounts.filter((u) => u.disabled).length,
    pendingInvitations: pendingInvitations.size,
    employeeTasksPending: pendingTasks.length,
    employeeTasksOverdue: pendingTasks.filter((t) => t.deadlineAt && t.deadlineAt < now).length,
    employeeLeadsSubmitted: employeeLeadIds.size,
    employeeSiteVisits: employeeVisitRows.filter((v) => linkedEmployeeIds.has(String(v.responsibleUserId))).length,
    employeeAttendanceMarkedToday: todayAttendance.length,
    paidPayrollThisPeriod: round(salaryRows.filter((s) => s.status === "PAID").reduce((sum, s) => sum + s.netPayable, 0)),
    byRecruitmentSource: Object.entries(emps.reduce<Record<string, number>>((acc, e) => { const source = e.recruitmentSource || "Other"; acc[source] = (acc[source] || 0) + 1; return acc; }, {})).map(([source, count]) => ({ source, count })),
    byDepartment: Object.entries(
      emps.reduce<Record<string, number>>((acc, e) => ((acc[e.department] = (acc[e.department] || 0) + 1), acc), {})
    ).map(([department, count]) => ({ department, count })),
    ranking: emps.slice(0, 8).map((e) => ({
      id: String(e._id), name: e.name, title: e.title, department: e.department,
      status: e.status, performanceScore: e.performanceScore, tasksPending: e.accountUserId ? pendingTasks.filter((t) => String(t.employeeId) === String(e._id)).length : e.tasksPending,
      presentToday: e.accountUserId ? todayAttendance.some((a) => String(a.employeeId) === String(e._id) && a.status === "PRESENT") : e.presentToday,
    })),
  };

  // ---- Marketing ----
  const totalSpend = round(campaigns.reduce((s, c) => s + c.spend, 0));
  const totalLeads = campaigns.reduce((s, c) => s + c.leads, 0);
  const totalConversions = campaigns.reduce((s, c) => s + c.conversions, 0);
  const totalMktRevenue = round(campaigns.reduce((s, c) => s + c.revenue, 0));
  const byChannel = Object.entries(
    campaigns.reduce<Record<string, { spend: number; leads: number }>>((acc, c) => {
      acc[c.channel] = acc[c.channel] || { spend: 0, leads: 0 };
      acc[c.channel].spend += c.spend;
      acc[c.channel].leads += c.leads;
      return acc;
    }, {})
  ).map(([channel, v]) => ({ channel, spend: round(v.spend), leads: v.leads }));
  const marketing = {
    activeCampaigns: campaigns.filter((c) => c.status === "ACTIVE").length,
    totalSpend,
    totalLeads,
    totalConversions,
    costPerLead: totalLeads ? round(totalSpend / totalLeads) : 0,
    roi: totalSpend ? Math.round(((totalMktRevenue - totalSpend) / totalSpend) * 100) : 0,
    revenue: totalMktRevenue,
    byChannel,
    campaigns: campaigns.map((c) => ({
      id: String(c._id), name: c.name, channel: c.channel, status: c.status,
      spend: round(c.spend), leads: c.leads, conversions: c.conversions, revenue: round(c.revenue),
    })),
  };

  // ---- Land Bank ----
  const areaByUnit = Object.entries(
    land.reduce<Record<string, number>>((acc, p) => ((acc[p.areaUnit] = round((acc[p.areaUnit] || 0) + p.area)), acc), {})
  ).map(([unit, area]) => ({ unit, area }));
  const landBank = {
    totalParcels: land.length,
    areaByUnit,
    verified: land.filter((p) => p.status === "VERIFIED" || p.status === "ACQUIRED").length,
    inPipeline: land.filter((p) => p.status === "PIPELINE" || p.status === "OPPORTUNITY").length,
    totalValue: round(land.reduce((s, p) => s + p.estimatedValue, 0)),
    pendingDueDiligence: land.filter((p) => !p.dueDiligenceDone).length,
    parcels: land.map((p) => ({
      id: String(p._id), name: p.name, location: p.location, area: p.area, areaUnit: p.areaUnit,
      status: p.status, estimatedValue: round(p.estimatedValue), dueDiligenceDone: p.dueDiligenceDone, priority: p.priority,
    })),
    highPriority: land.filter((p) => p.priority === "HIGH").map((p) => ({
      id: String(p._id), name: p.name, location: p.location, status: p.status,
    })),
  };

  // ---- Investor ----
  const activeRound = rounds.find((r) => r.status === "OPEN") || rounds[0] || null;
  const esopPercent = round(cap.filter((c) => c.holderType === "ESOP").reduce((s, c) => s + c.equityPercent, 0));
  const investor = {
    valuation: activeRound ? round(activeRound.valuation) : 0,
    activeRound: activeRound
      ? {
          name: activeRound.name, target: round(activeRound.targetAmount), committed: round(activeRound.committedAmount),
          valuation: round(activeRound.valuation), status: activeRound.status,
          progress: activeRound.targetAmount ? Math.min(100, Math.round((activeRound.committedAmount / activeRound.targetAmount) * 100)) : 0,
        }
      : null,
    totalRaised: round(cap.reduce((s, c) => s + c.investedAmount, 0)),
    esopPercent,
    capTable: cap.map((c) => ({
      id: String(c._id), holderName: c.holderName, holderType: c.holderType,
      equityPercent: round(c.equityPercent), investedAmount: round(c.investedAmount),
    })),
    updates: updates.slice(0, 10).map((u) => ({ id: String(u._id), title: u.title, body: u.body, createdAt: u.createdAt })),
  };

  // ---- Customer Experience (NPS / complaints) ----
  const npsRows = feedback.filter((f) => f.kind === "NPS" && typeof f.score === "number");
  const promoters = npsRows.filter((f) => (f.score as number) >= 9).length;
  const detractors = npsRows.filter((f) => (f.score as number) <= 6).length;
  const complaints = feedback.filter((f) => f.kind === "COMPLAINT");
  const resolvedComplaints = complaints.filter((c) => c.status === "RESOLVED" && c.resolvedAt);
  const cx = {
    nps: npsRows.length ? Math.round(((promoters - detractors) / npsRows.length) * 100) : null,
    avgRating: npsRows.length ? round(npsRows.reduce((s, f) => s + (f.score as number), 0) / npsRows.length) : null,
    responses: npsRows.length,
    promoters, detractors,
    passives: npsRows.length - promoters - detractors,
    complaintsOpen: complaints.filter((c) => c.status === "OPEN").length,
    complaintsResolved: resolvedComplaints.length,
    avgResolutionHours: resolvedComplaints.length
      ? Math.round(resolvedComplaints.reduce((s, c) => s + (c.resolvedAt!.getTime() - c.createdAt.getTime()) / 3600000, 0) / resolvedComplaints.length)
      : null,
    rows: feedback.slice(0, 20).map((f) => ({
      id: String(f._id), kind: f.kind, customerName: f.customerName, score: f.score,
      note: f.note, status: f.status, createdAt: f.createdAt,
    })),
  };

  res.json({ team, marketing, landBank, investor, cx });
});

// --------------------------------------------------------------- Team CRUD
const employeeSchema = z.object({
  name: z.string().min(1),
  title: z.string().optional(),
  department: z.string().optional(),
  status: z.enum(["ACTIVE", "ON_LEAVE", "INACTIVE"]).optional(),
  presentToday: zBool.optional(),
  performanceScore: z.coerce.number().int().min(0).max(100).optional(),
  tasksPending: z.coerce.number().int().min(0).optional(),
  monthlyCtc: z.coerce.number().min(0).optional(),
  salaryDueDay: z.coerce.number().int().min(1).max(28).optional(),
});
router.post("/employees", async (req, res) => {
  const parsed = employeeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: zodMessage(parsed.error), issues: parsed.error.flatten() });
  const db = getDb();
  const [row] = await db.insert(employees).values({ ...parsed.data, department: parsed.data.department || "General" }).returning();
  res.status(201).json({ employee: row });
});
router.delete("/employees/:id", async (req, res) => {
  const db = getDb();
  const [existing] = await db.select().from(employees).where(eq(employees._id, String(req.params.id))).limit(1);
  if (existing?.accountUserId) return res.status(409).json({ error: "This employee has a login account and operational history. Deactivate the account from Employee Management instead so tasks, attendance, leads and payroll remain linked." });
  const [row] = await db.delete(employees).where(eq(employees._id, String(req.params.id))).returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  res.json({ ok: true });
});

// --------------------------------------------------------- Marketing CRUD
const campaignSchema = z.object({
  name: z.string().min(1),
  channel: z.string().optional(),
  status: z.enum(["ACTIVE", "PAUSED", "COMPLETED"]).optional(),
  spend: z.coerce.number().min(0).optional(),
  leads: z.coerce.number().int().min(0).optional(),
  conversions: z.coerce.number().int().min(0).optional(),
  revenue: z.coerce.number().min(0).optional(),
});
router.post("/campaigns", async (req, res) => {
  const parsed = campaignSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: zodMessage(parsed.error), issues: parsed.error.flatten() });
  const db = getDb();
  const [row] = await db.insert(marketingCampaigns).values({ ...parsed.data, channel: parsed.data.channel || "Other" }).returning();
  res.status(201).json({ campaign: row });
});
router.delete("/campaigns/:id", async (req, res) => {
  const db = getDb();
  const [row] = await db.delete(marketingCampaigns).where(eq(marketingCampaigns._id, String(req.params.id))).returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  res.json({ ok: true });
});

// --------------------------------------------------------- Land Bank CRUD
const landSchema = z.object({
  name: z.string().min(1),
  location: z.string().min(1),
  area: z.coerce.number().min(0).optional(),
  areaUnit: z.enum(["ACRE", "BIGHA", "SQFT", "HECTARE"]).optional(),
  status: z.enum(["OPPORTUNITY", "PIPELINE", "DUE_DILIGENCE", "VERIFIED", "ACQUIRED"]).optional(),
  estimatedValue: z.coerce.number().min(0).optional(),
  dueDiligenceDone: zBool.optional(),
  priority: z.enum(["HIGH", "MEDIUM", "LOW"]).optional(),
  notes: z.string().optional(),
});
router.post("/land", async (req, res) => {
  const parsed = landSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: zodMessage(parsed.error), issues: parsed.error.flatten() });
  const db = getDb();
  const [row] = await db.insert(landParcels).values(parsed.data).returning();
  res.status(201).json({ parcel: row });
});
router.delete("/land/:id", async (req, res) => {
  const db = getDb();
  const [row] = await db.delete(landParcels).where(eq(landParcels._id, String(req.params.id))).returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  res.json({ ok: true });
});

// ---------------------------------------------------------- Investor CRUD
const capSchema = z.object({
  holderName: z.string().min(1),
  holderType: z.enum(["FOUNDER", "INVESTOR", "ANGEL", "ESOP", "OTHER"]).optional(),
  equityPercent: z.coerce.number().min(0).max(100).optional(),
  investedAmount: z.coerce.number().min(0).optional(),
});
router.post("/cap-table", async (req, res) => {
  const parsed = capSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: zodMessage(parsed.error), issues: parsed.error.flatten() });
  const db = getDb();
  const [row] = await db.insert(capTableEntries).values(parsed.data).returning();
  res.status(201).json({ entry: row });
});
router.delete("/cap-table/:id", async (req, res) => {
  const db = getDb();
  const [row] = await db.delete(capTableEntries).where(eq(capTableEntries._id, String(req.params.id))).returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  res.json({ ok: true });
});

const fundraiseSchema = z.object({
  name: z.string().min(1),
  targetAmount: z.coerce.number().min(0).optional(),
  committedAmount: z.coerce.number().min(0).optional(),
  valuation: z.coerce.number().min(0).optional(),
  status: z.enum(["OPEN", "CLOSED"]).optional(),
});
router.post("/fundraise", async (req, res) => {
  const parsed = fundraiseSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: zodMessage(parsed.error), issues: parsed.error.flatten() });
  const db = getDb();
  const [row] = await db.insert(fundraiseRounds).values(parsed.data).returning();
  res.status(201).json({ round: row });
});
router.delete("/fundraise/:id", async (req, res) => {
  const db = getDb();
  const [row] = await db.delete(fundraiseRounds).where(eq(fundraiseRounds._id, String(req.params.id))).returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  res.json({ ok: true });
});

const updateSchema = z.object({ title: z.string().min(1), body: z.string().optional() });
router.post("/updates", async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: zodMessage(parsed.error), issues: parsed.error.flatten() });
  const db = getDb();
  const [row] = await db.insert(investorUpdates).values(parsed.data).returning();
  res.status(201).json({ update: row });
});
router.delete("/updates/:id", async (req, res) => {
  const db = getDb();
  const [row] = await db.delete(investorUpdates).where(eq(investorUpdates._id, String(req.params.id))).returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  res.json({ ok: true });
});

// ------------------------------------------------ Customer Experience CRUD
const feedbackSchema = z.object({
  kind: z.enum(["NPS", "COMPLAINT"]),
  customerName: z.string().max(120).optional(),
  score: z.coerce.number().int().min(0).max(10).optional(),
  note: z.string().max(500).optional(),
  status: z.enum(["OPEN", "RESOLVED"]).optional(),
});
router.post("/feedback", async (req: AuthedRequest, res) => {
  const parsed = feedbackSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: zodMessage(parsed.error), issues: parsed.error.flatten() });
  const d = parsed.data;
  const db = getDb();
  const [row] = await db.insert(customerFeedback).values({
    kind: d.kind,
    customerName: d.customerName || null,
    score: d.kind === "NPS" ? d.score ?? null : null,
    note: d.note || null,
    status: d.kind === "COMPLAINT" ? d.status ?? "OPEN" : "OPEN",
    resolvedAt: d.kind === "COMPLAINT" && d.status === "RESOLVED" ? new Date() : null,
    createdById: req.user!.userId,
  }).returning();
  res.status(201).json({ feedback: row });
});
// Mark a complaint resolved / reopen it.
router.patch("/feedback/:id", async (req, res) => {
  const status = req.body?.status === "RESOLVED" ? "RESOLVED" : "OPEN";
  const db = getDb();
  const [row] = await db.update(customerFeedback)
    .set({ status, resolvedAt: status === "RESOLVED" ? new Date() : null })
    .where(eq(customerFeedback._id, String(req.params.id))).returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  res.json({ feedback: row });
});
router.delete("/feedback/:id", async (req, res) => {
  const db = getDb();
  const [row] = await db.delete(customerFeedback).where(eq(customerFeedback._id, String(req.params.id))).returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  res.json({ ok: true });
});

export default router;
