import { Router } from "express";
import { User } from "../models/User";
import { authenticate, requireRole, AuthedRequest } from "../middleware/auth";
import { CP_PREMIUM_MONTHLY_PRICE } from "../config/constants";
import { createOrder, isPaymentGatewayConfigured } from "../services/paymentService";

const router = Router();
router.use(authenticate);

router.post("/create-order", requireRole("CP"), async (req: AuthedRequest, res) => {
  const order = await createOrder(CP_PREMIUM_MONTHLY_PRICE, `premium_${req.user!.userId}_${Date.now()}`);
  res.json({ order, amount: CP_PREMIUM_MONTHLY_PRICE, keyId: process.env.RAZORPAY_KEY_ID || null });
});

router.post("/subscribe", requireRole("CP"), async (req: AuthedRequest, res) => {
  const expires = new Date();
  expires.setMonth(expires.getMonth() + 1);

  const user = await User.findByIdAndUpdate(
    req.user!.userId,
    { $set: { "cpProfile.isPremium": true, "cpProfile.premiumExpiresAt": expires } },
    { new: true }
  ).select("-password");

  res.json({ user, price: CP_PREMIUM_MONTHLY_PRICE, paymentGatewayLive: isPaymentGatewayConfigured });
});

router.delete("/subscribe", requireRole("CP"), async (req: AuthedRequest, res) => {
  const user = await User.findByIdAndUpdate(
    req.user!.userId,
    { $set: { "cpProfile.isPremium": false, "cpProfile.premiumExpiresAt": null } },
    { new: true }
  ).select("-password");

  res.json({ user });
});

export default router;
