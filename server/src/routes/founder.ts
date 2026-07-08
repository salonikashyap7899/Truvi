import { Router } from "express";
import { z } from "zod";
import { isValidObjectId } from "mongoose";
import { authenticate, requireRole, AuthedRequest } from "../middleware/auth";
import { User } from "../models/User";
import { Project } from "../models/Project";
import { Unit } from "../models/Unit";
import { Lead, LeadStage } from "../models/Lead";
import { Commission } from "../models/Commission";
import { LeadPurchase } from "../models/LeadPurchase";
import { Enquiry } from "../models/Enquiry";
import { VerificationTask } from "../models/VerificationTask";
import { detectFounderAlerts } from "../services/founderInsightService";

/**
 * Founder OS — Phase 1 API.
 *
 * Everything here is FOUNDER-only. requireRole("FOUNDER") is satisfied
 * exclusively by the FOUNDER role (admins do not pass), while FOUNDER
 * itself passes every other gate in the app — see middleware/auth.ts.
 *
 * All numbers are aggregated live from the operating collections
 * (Commission, LeadPurchase, Lead, Project, Unit, User, Enquiry,
 * VerificationTask) — nothing is hardcoded.
 */

const router = Router();
router.use(authenticate, requireRole("FOUNDER"));

const DAY = 24 * 60 * 60 * 1000;
const FUNNEL_STAGES: LeadStage[] = [
  "GENERATED", "ASSIGNED", "CONTACTED", "SITE_VISIT", "NEGOTIATION", "BOOKING", "REGISTRATION", "LOST",
];

// ── GET /api/founder/overview — the whole company in one payload ───────────
router.get("/overview", async (_req: AuthedRequest, res) => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);

  const [
    commissionTotals,
    commissionMonthly,
    leadPurchaseTotals,
    leadPurchaseMonthly,
    usersByRole,
    pendingApprovals,
    projectCounts,
    funnelRaw,
    recentLeadProjectIds,
    recentProjectDevIds,
    enquiries7d,
    unitTotals,
    projectPerformance,
    cpLeaderboard,
    ambassadorStats,
    alerts,
  ] = await Promise.all([
    Commission.aggregate([
      {
        $group: {
          _id: null,
          platformFees: { $sum: "$platformFeeAmount" },
          cpCommissions: { $sum: "$cpCommissionAmount" },
          gmv: { $sum: "$bookingValue" },
          count: { $sum: 1 },
        },
      },
    ]),

    Commission.aggregate([
      { $match: { createdAt: { $gte: twelveMonthsAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } },
          platformFees: { $sum: "$platformFeeAmount" },
          gmv: { $sum: "$bookingValue" },
          bookings: { $sum: 1 },
        },
      },
    ]),

    LeadPurchase.aggregate([{ $group: { _id: null, total: { $sum: "$amountPaid" }, count: { $sum: 1 } } }]),

    LeadPurchase.aggregate([
      { $match: { createdAt: { $gte: twelveMonthsAgo } } },
      { $group: { _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } }, total: { $sum: "$amountPaid" } } },
    ]),

    User.aggregate([
      { $match: { approvalStatus: "APPROVED" } },
      { $group: { _id: "$role", count: { $sum: 1 } } },
    ]),

    User.countDocuments({ role: { $in: ["DEVELOPER", "CP"] }, approvalStatus: "PENDING" }),

    Project.aggregate([{ $group: { _id: "$approvalStatus", count: { $sum: 1 } } }]),

    Lead.aggregate([{ $group: { _id: "$stage", count: { $sum: 1 } } }]),

    // Developer activity: projects that received leads in the last 30 days…
    Lead.distinct("projectId", { createdAt: { $gte: new Date(Date.now() - 30 * DAY) } }),
    // …plus developers who created a project in the last 30 days
    Project.distinct("developerId", { createdAt: { $gte: new Date(Date.now() - 30 * DAY) } }),

    Enquiry.countDocuments({ createdAt: { $gte: new Date(Date.now() - 7 * DAY) } }),

    Unit.aggregate([{ $group: { _id: "$status", count: { $sum: 1 }, value: { $sum: "$price" } } }]),

    // Per-project performance: units + funnel-weighted leads per project
    Project.aggregate([
      { $match: { approvalStatus: "APPROVED" } },
      { $sort: { createdAt: -1 } },
      { $limit: 20 },
      {
        $lookup: {
          from: "units",
          localField: "_id",
          foreignField: "projectId",
          as: "units",
          pipeline: [{ $group: { _id: "$status", count: { $sum: 1 }, value: { $sum: "$price" } } }],
        },
      },
      {
        $lookup: {
          from: "leads",
          localField: "_id",
          foreignField: "projectId",
          as: "leads",
          pipeline: [{ $group: { _id: "$stage", count: { $sum: 1 } } }],
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "developerId",
          foreignField: "_id",
          as: "developer",
          pipeline: [{ $project: { name: 1 } }],
        },
      },
      { $project: { name: 1, city: 1, isPrimeListing: 1, createdAt: 1, units: 1, leads: 1, developer: { $first: "$developer.name" } } },
    ]),

    // CP leaderboard: commission earnings joined with profile stats
    Commission.aggregate([
      {
        $group: {
          _id: "$cpId",
          commissionEarned: { $sum: "$cpCommissionAmount" },
          platformFees: { $sum: "$platformFeeAmount" },
          bookings: { $sum: 1 },
          gmv: { $sum: "$bookingValue" },
        },
      },
      { $sort: { commissionEarned: -1 } },
      { $limit: 8 },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "cp",
          pipeline: [{ $project: { name: 1, cpTier: 1, "cpProfile.conversionRatio": 1, "cpProfile.totalBookings": 1 } }],
        },
      },
      { $unwind: "$cp" },
    ]),

    (async () => {
      const [active, tasks] = await Promise.all([
        User.countDocuments({ role: "AMBASSADOR", "ambassadorProfile.activatedAt": { $ne: null } }),
        VerificationTask.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
      ]);
      const byStatus = Object.fromEntries(tasks.map((t) => [t._id, t.count]));
      return { activeAmbassadors: active, tasks: byStatus };
    })(),

    detectFounderAlerts(),
  ]);

  // ── Assemble the revenue series (fees + lead sales, last 12 months) ──
  const monthKeys: string[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthKeys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  const feeByMonth = new Map(commissionMonthly.map((m) => [m._id, m]));
  const lpByMonth = new Map(leadPurchaseMonthly.map((m) => [m._id, m.total]));
  const revenueSeries = monthKeys.map((key) => {
    const fees = feeByMonth.get(key);
    return {
      month: key,
      revenue: Math.round((fees?.platformFees ?? 0) + (lpByMonth.get(key) ?? 0)),
      gmv: Math.round(fees?.gmv ?? 0),
      bookings: fees?.bookings ?? 0,
    };
  });

  const revenueThisMonth = revenueSeries[revenueSeries.length - 1]?.revenue ?? 0;
  const revenueLastMonth = revenueSeries[revenueSeries.length - 2]?.revenue ?? 0;
  const momChangePct =
    revenueLastMonth > 0 ? Math.round(((revenueThisMonth - revenueLastMonth) / revenueLastMonth) * 100) : null;

  // ── KPIs ──
  const roleCounts = Object.fromEntries(usersByRole.map((r) => [r._id, r.count]));
  const projectByStatus = Object.fromEntries(projectCounts.map((p) => [p._id, p.count]));
  const funnel = FUNNEL_STAGES.map((stage) => ({
    stage,
    count: funnelRaw.find((f) => f._id === stage)?.count ?? 0,
  }));
  const totalLeads = funnel.reduce((s, f) => s + f.count, 0);
  const closedWon = (funnel.find((f) => f.stage === "BOOKING")?.count ?? 0) + (funnel.find((f) => f.stage === "REGISTRATION")?.count ?? 0);

  const activeDevIds = new Set<string>(recentProjectDevIds.map(String));
  if (recentLeadProjectIds.length > 0) {
    const devsOfActiveProjects = await Project.distinct("developerId", { _id: { $in: recentLeadProjectIds } });
    devsOfActiveProjects.forEach((id) => activeDevIds.add(String(id)));
  }

  const unitByStatus = Object.fromEntries(unitTotals.map((u) => [u._id, u]));

  // ── Project performance table with RAG health ──
  const projects = projectPerformance.map((p) => {
    const unitStats = Object.fromEntries((p.units as { _id: string; count: number; value: number }[]).map((u) => [u._id, u]));
    const totalUnits = (p.units as { count: number }[]).reduce((s, u) => s + u.count, 0);
    const sold = unitStats.SOLD?.count ?? 0;
    const soldValue = unitStats.SOLD?.value ?? 0;
    const leadStats = Object.fromEntries((p.leads as { _id: string; count: number }[]).map((l) => [l._id, l.count]));
    const leadCount = (p.leads as { count: number }[]).reduce((s, l) => s + l.count, 0);
    const wonLeads = (leadStats.BOOKING ?? 0) + (leadStats.REGISTRATION ?? 0);
    const soldPct = totalUnits > 0 ? Math.round((sold / totalUnits) * 100) : 0;

    const health: "GREEN" | "AMBER" | "RED" =
      (soldPct >= 40 && leadCount > 0) || wonLeads >= 2 ? "GREEN" : soldPct >= 15 || leadCount >= 3 ? "AMBER" : "RED";

    return {
      _id: p._id,
      name: p.name,
      city: p.city,
      developer: p.developer ?? "—",
      isPrimeListing: !!p.isPrimeListing,
      totalUnits,
      soldUnits: sold,
      soldPct,
      salesValue: Math.round(soldValue),
      leads: leadCount,
      wonLeads,
      health,
    };
  });

  res.json({
    generatedAt: now.toISOString(),
    kpis: {
      totalRevenue: Math.round((commissionTotals[0]?.platformFees ?? 0) + (leadPurchaseTotals[0]?.total ?? 0)),
      revenueThisMonth,
      momChangePct,
      gmv: Math.round(commissionTotals[0]?.gmv ?? 0),
      cpCommissionsPaid: Math.round(commissionTotals[0]?.cpCommissions ?? 0),
      bookings: commissionTotals[0]?.count ?? 0,
      activeDevelopers: activeDevIds.size,
      totalDevelopers: roleCounts.DEVELOPER ?? 0,
      totalCps: roleCounts.CP ?? 0,
      totalBuyers: roleCounts.BUYER ?? 0,
      pendingApprovals,
      liveProjects: projectByStatus.APPROVED ?? 0,
      pendingProjects: projectByStatus.PENDING ?? 0,
      totalLeads,
      conversionPct: totalLeads > 0 ? Math.round((closedWon / totalLeads) * 100) : 0,
      enquiries7d,
      unitsAvailable: unitByStatus.AVAILABLE?.count ?? 0,
      unitsSold: unitByStatus.SOLD?.count ?? 0,
    },
    revenueSeries,
    funnel,
    projects,
    cpLeaderboard: cpLeaderboard.map((c) => ({
      cpId: c._id,
      name: c.cp.name,
      tier: c.cp.cpTier ?? "SILVER",
      bookings: c.bookings,
      commissionEarned: Math.round(c.commissionEarned),
      platformFees: Math.round(c.platformFees),
      gmv: Math.round(c.gmv),
      conversionRatio: c.cp.cpProfile?.conversionRatio ?? 0,
    })),
    ambassadors: ambassadorStats,
    alerts,
  });
});

// ── Verification-task management (create / list / mark payout paid) ────────

const createTaskSchema = z.object({
  projectId: z.string().optional(),
  title: z.string().min(2),
  address: z.string().min(4),
  mapUrl: z.string().url().optional().or(z.literal("")),
  deadline: z.string().datetime().optional(),
});

router.post("/tasks", async (req: AuthedRequest, res) => {
  const parsed = createTaskSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });
  const { projectId, title, address, mapUrl, deadline } = parsed.data;
  if (projectId && !isValidObjectId(projectId)) return res.status(400).json({ error: "Invalid projectId" });

  const task = await VerificationTask.create({
    projectId: projectId || null,
    title,
    address,
    mapUrl: mapUrl || undefined,
    deadline: deadline ? new Date(deadline) : null,
    status: "GREEN",
  });
  res.status(201).json({ task });
});

router.get("/tasks", async (_req: AuthedRequest, res) => {
  const tasks = await VerificationTask.find()
    .sort({ createdAt: -1 })
    .limit(100)
    .populate("lockedBy", "name email")
    .populate("completedBy", "name email")
    .populate("projectId", "name city");
  res.json({ tasks });
});

router.patch("/tasks/:id/payout", async (req: AuthedRequest, res) => {
  if (!isValidObjectId(req.params.id)) return res.status(400).json({ error: "Invalid task id" });
  const task = await VerificationTask.findOneAndUpdate(
    { _id: req.params.id, status: "RED", payoutStatus: "PENDING" },
    { payoutStatus: "PAID" },
    { new: true },
  );
  if (!task) return res.status(404).json({ error: "No pending payout found for this task" });
  res.json({ task });
});

export default router;
