import { Router } from "express";
import { eq } from "drizzle-orm";
import { getDb } from "../config/db";
import { commissions, leadPurchases, projects, users } from "../db/schema";
import { authenticate, requireRole } from "../middleware/auth";
import { REVENUE_MIX_TARGET, CP_PREMIUM_MONTHLY_PRICE } from "../config/constants";

const router = Router();
router.use(authenticate, requireRole("ADMIN"));

router.get("/", async (_req, res) => {
  const db = getDb();
  const [commissionRows, purchaseRows, userRows, featuredProjects] = await Promise.all([
    db.select().from(commissions),
    db.select().from(leadPurchases),
    db.select().from(users).where(eq(users.role, "CP")),
    db.select().from(projects).where(eq(projects.listingTier, "FEATURED")),
  ]);

  const platformFeeRevenue = commissionRows.reduce((sum, row) => sum + Number(row.platformFeeAmount || 0), 0);
  const leadServiceRevenue = purchaseRows.reduce((sum, row) => sum + Number(row.amountPaid || 0), 0);
  const leadPurchaseCount = purchaseRows.length;
  const premiumCount = userRows.filter((user) => Boolean(user.cpProfile?.isPremium)).length;
  const featuredCount = featuredProjects.length;
  const premiumRevenue = premiumCount * CP_PREMIUM_MONTHLY_PRICE;
  const featuredRevenueEstimate = featuredCount * 25000;

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
  });
});

export default router;
