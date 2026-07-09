import { Router } from "express";
import { authenticate, requireRole } from "../middleware/auth";
import { REVENUE_MIX_TARGET, CP_PREMIUM_MONTHLY_PRICE } from "../config/constants";
import { Commission } from "../models/Commission";
import { LeadPurchase } from "../models/LeadPurchase";
import { Project } from "../models/Project";
import { User } from "../models/User";

const router = Router();
router.use(authenticate, requireRole("ADMIN"));

router.get("/", async (_req, res) => {
  const [commissionRows, purchaseRows, userRows, featuredProjects] = await Promise.all([
    Commission.find().lean(),
    LeadPurchase.find().lean(),
    User.find({ role: "CP" }).lean(),
    Project.find({ listingTier: "FEATURED" }).lean(),
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
