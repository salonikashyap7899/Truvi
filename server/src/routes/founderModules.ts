import { Router } from "express";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { getDb } from "../config/db";
import {
  employees,
  marketingCampaigns,
  landParcels,
  capTableEntries,
  fundraiseRounds,
  investorUpdates,
} from "../db/schema";
import { authenticate, requireRole } from "../middleware/auth";

/**
 * Founder-only operating modules (Team, Marketing, Land Bank, Investor). These
 * back the previously-placeholder sections of the Founder "CEO OS" dashboard.
 * The founder is an ADMIN-role account, so every route is ADMIN-gated. All
 * figures are derived from rows the founder actually enters — nothing here is
 * fabricated (platform data-integrity rule).
 */
const router = Router();
router.use(authenticate);
router.use(requireRole("ADMIN"));

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
  const [emps, campaigns, land, cap, rounds, updates] = await Promise.all([
    db.select().from(employees).orderBy(desc(employees.performanceScore)),
    db.select().from(marketingCampaigns).orderBy(desc(marketingCampaigns.createdAt)),
    db.select().from(landParcels).orderBy(desc(landParcels.createdAt)),
    db.select().from(capTableEntries).orderBy(desc(capTableEntries.equityPercent)),
    db.select().from(fundraiseRounds).orderBy(desc(fundraiseRounds.createdAt)),
    db.select().from(investorUpdates).orderBy(desc(investorUpdates.createdAt)),
  ]);

  // ---- Team ----
  const activeEmps = emps.filter((e) => e.status === "ACTIVE");
  const team = {
    total: emps.length,
    active: activeEmps.length,
    presentToday: emps.filter((e) => e.presentToday && e.status !== "INACTIVE").length,
    onLeave: emps.filter((e) => e.status === "ON_LEAVE").length,
    tasksPending: emps.reduce((s, e) => s + e.tasksPending, 0),
    avgPerformance: emps.length ? Math.round(emps.reduce((s, e) => s + e.performanceScore, 0) / emps.length) : 0,
    monthlyPayroll: round(activeEmps.reduce((s, e) => s + e.monthlyCtc, 0)),
    byDepartment: Object.entries(
      emps.reduce<Record<string, number>>((acc, e) => ((acc[e.department] = (acc[e.department] || 0) + 1), acc), {})
    ).map(([department, count]) => ({ department, count })),
    ranking: emps.slice(0, 8).map((e) => ({
      id: String(e._id), name: e.name, title: e.title, department: e.department,
      status: e.status, performanceScore: e.performanceScore, tasksPending: e.tasksPending, presentToday: e.presentToday,
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

  res.json({ team, marketing, landBank, investor });
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
});
router.post("/employees", async (req, res) => {
  const parsed = employeeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });
  const db = getDb();
  const [row] = await db.insert(employees).values({ ...parsed.data, department: parsed.data.department || "General" }).returning();
  res.status(201).json({ employee: row });
});
router.delete("/employees/:id", async (req, res) => {
  const db = getDb();
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
  if (!parsed.success) return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });
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
  if (!parsed.success) return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });
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
  if (!parsed.success) return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });
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
  if (!parsed.success) return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });
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
  if (!parsed.success) return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });
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

export default router;
