import { Router } from "express";
import { eq } from "drizzle-orm";
import { getDb } from "../config/db";
import { commissions, leadPurchases, leads, projects, users } from "../db/schema";
import { authenticate, requireRole } from "../middleware/auth";
import { REVENUE_MIX_TARGET, CP_PREMIUM_MONTHLY_PRICE } from "../config/constants";

const router = Router();
router.use(authenticate, requireRole("ADMIN"));

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

router.get("/", async (_req, res) => {
  const db = getDb();
  const [commissionRows, purchaseRows, cpRows, featuredProjects, leadRows, allProjects, developerRows] =
    await Promise.all([
      db.select().from(commissions),
      db.select().from(leadPurchases),
      db.select().from(users).where(eq(users.role, "CP")),
      db.select().from(projects).where(eq(projects.listingTier, "FEATURED")),
      db.select({ _id: leads._id, projectId: leads.projectId }).from(leads),
      db.select({ _id: projects._id, developerId: projects.developerId, name: projects.name }).from(projects),
      db.select({ _id: users._id, name: users.name }).from(users).where(eq(users.role, "DEVELOPER")),
    ]);

  const platformFeeRevenue = commissionRows.reduce((sum, row) => sum + Number(row.platformFeeAmount || 0), 0);
  const leadServiceRevenue = purchaseRows.reduce((sum, row) => sum + Number(row.amountPaid || 0), 0);
  const leadPurchaseCount = purchaseRows.length;
  const premiumCount = cpRows.filter((user) => Boolean(user.cpProfile?.isPremium)).length;
  const featuredCount = featuredProjects.length;
  const premiumRevenue = premiumCount * CP_PREMIUM_MONTHLY_PRICE;
  const featuredRevenueEstimate = featuredCount * 25000;

  // ---- Monthly revenue trend (last 6 months, real dated sources only) ------
  // Commission platform fee + lead-marketplace purchases both carry createdAt;
  // premium/featured are undated estimates, so they're excluded from the trend.
  const now = new Date();
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    return { key: monthKey(d), label: d.toLocaleString("en-IN", { month: "short" }), revenue: 0 };
  });
  const monthIndex = new Map(months.map((m, i) => [m.key, i]));
  const addToMonth = (date: Date | string, amount: number) => {
    const i = monthIndex.get(monthKey(new Date(date)));
    if (i !== undefined) months[i].revenue += amount;
  };
  for (const c of commissionRows) addToMonth(c.createdAt, Number(c.platformFeeAmount || 0));
  for (const p of purchaseRows) addToMonth(p.createdAt, Number(p.amountPaid || 0));
  const monthlyTrend = months.map((m) => ({ month: m.label, revenue: Math.round(m.revenue) }));

  // ---- Top paying developers (platform fee routed via their projects) ------
  const leadProject = new Map(leadRows.map((l) => [String(l._id), String(l.projectId)]));
  const projectDeveloper = new Map(allProjects.map((p) => [String(p._id), String(p.developerId)]));
  const developerName = new Map(developerRows.map((d) => [String(d._id), d.name]));
  const revByDeveloper = new Map<string, number>();
  for (const c of commissionRows) {
    const projectId = leadProject.get(String(c.leadId));
    const developerId = projectId ? projectDeveloper.get(projectId) : undefined;
    if (!developerId) continue;
    revByDeveloper.set(developerId, (revByDeveloper.get(developerId) || 0) + Number(c.platformFeeAmount || 0));
  }
  const topDevelopers = [...revByDeveloper.entries()]
    .map(([developerId, revenue]) => ({
      name: developerName.get(developerId) || "Unknown developer",
      revenue: Math.round(revenue),
    }))
    .filter((d) => d.revenue > 0)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  res.json({
    platformFeeRevenue,
    leadServiceRevenue,
    leadPurchaseCount,
    premiumRevenue,
    premiumCount,
    featuredRevenueEstimate,
    featuredCount,
    totalRevenue: platformFeeRevenue + leadServiceRevenue + premiumRevenue + featuredRevenueEstimate,
    target: REVENUE_MIX_TARGET,
    monthlyTrend,
    topDevelopers,
  });
});

export default router;
