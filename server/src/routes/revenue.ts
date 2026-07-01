import { Router } from "express";
import { Commission } from "../models/Commission";
import { LeadPurchase } from "../models/LeadPurchase";
import { User } from "../models/User";
import { Project } from "../models/Project";
import { authenticate, requireRole } from "../middleware/auth";
import { REVENUE_MIX_TARGET, CP_PREMIUM_MONTHLY_PRICE } from "../config/constants";

const router = Router();
router.use(authenticate, requireRole("ADMIN"));

router.get("/", async (_req, res) => {
  const [platformFeeAgg, leadPurchaseAgg, premiumCount, featuredCount] = await Promise.all([
    Commission.aggregate([{ $group: { _id: null, total: { $sum: "$platformFeeAmount" } } }]),
    LeadPurchase.aggregate([{ $group: { _id: null, total: { $sum: "$amountPaid" }, count: { $sum: 1 } } }]),
    User.countDocuments({ role: "CP", "cpProfile.isPremium": true }),
    Project.countDocuments({ listingTier: "FEATURED" }),
  ]);

  const platformFeeRevenue = platformFeeAgg[0]?.total || 0;
  const leadServiceRevenue = leadPurchaseAgg[0]?.total || 0;
  const leadPurchaseCount = leadPurchaseAgg[0]?.count || 0;
  const premiumRevenue = premiumCount * CP_PREMIUM_MONTHLY_PRICE;
  const featuredRevenueEstimate = featuredCount * 25000; // midpoint of price range, display estimate only

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
