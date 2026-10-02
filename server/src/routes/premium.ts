import { Router } from "express";
import { eq } from "drizzle-orm";
import { getDb } from "../config/db";
import { users, DEFAULT_CP_PROFILE, CpProfile } from "../db/schema";
import { authenticate, requireRole, AuthedRequest } from "../middleware/auth";
import { CP_PREMIUM_MONTHLY_PRICE } from "../config/constants";
import { createOrder, isPaymentGatewayConfigured } from "../services/paymentService";

const router = Router();
router.use(authenticate);

router.post("/create-order", requireRole("CP"), async (req: AuthedRequest, res) => {
  const order = await createOrder(CP_PREMIUM_MONTHLY_PRICE, `premium_${req.user!.userId}_${Date.now()}`);
  res.json({ order, amount: CP_PREMIUM_MONTHLY_PRICE, keyId: process.env.RAZORPAY_KEY_ID || null });
});

async function setPremium(userId: string, isPremium: boolean, premiumExpiresAt: string | null) {
  const db = getDb();
  const [existing] = await db.select().from(users).where(eq(users._id, userId)).limit(1);
  if (!existing) return null;

  const cpProfile: CpProfile = {
    ...DEFAULT_CP_PROFILE,
    ...(existing.cpProfile ?? {}),
    isPremium,
    premiumExpiresAt,
  };

  const [updated] = await db.update(users).set({ cpProfile }).where(eq(users._id, userId)).returning();
  if (!updated) return null;
  const { password: _p, ...safeUser } = updated;
  return safeUser;
}

router.post("/subscribe", requireRole("CP"), async (req: AuthedRequest, res) => {
  const expires = new Date();
  expires.setMonth(expires.getMonth() + 1);

  const user = await setPremium(req.user!.userId, true, expires.toISOString());

  res.json({ user, price: CP_PREMIUM_MONTHLY_PRICE, paymentGatewayLive: isPaymentGatewayConfigured });
});

router.delete("/subscribe", requireRole("CP"), async (req: AuthedRequest, res) => {
  const user = await setPremium(req.user!.userId, false, null);

  res.json({ user });
});

export default router;
