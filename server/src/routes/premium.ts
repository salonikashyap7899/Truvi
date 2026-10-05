import { Router } from "express";
import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { getDb } from "../config/db";
import { users, DEFAULT_CP_PROFILE, CpProfile } from "../db/schema";
import { authenticate, requireRole, AuthedRequest } from "../middleware/auth";
import { zodMessage } from "../lib/validationError";
import { CP_PREMIUM_MONTHLY_PRICE } from "../config/constants";
import {
  createOrder,
  isPaymentGatewayConfigured,
  simulatedPaymentsAllowed,
  verifyPaymentSignature,
} from "../services/paymentService";

const router = Router();
router.use(authenticate);

/**
 * Premium is granted only for a verified payment of an order this server
 * created for this CP. The order id is remembered on the CP's profile at
 * create-order time and consumed (atomically) on /subscribe, so a payment
 * can't be replayed for another month or used by someone else.
 */
router.post("/create-order", requireRole("CP"), async (req: AuthedRequest, res) => {
  const order = await createOrder(CP_PREMIUM_MONTHLY_PRICE, `prem_${Date.now()}`, {
    userId: req.user!.userId,
    product: "CP_PREMIUM",
  });
  const db = getDb();
  await db
    .update(users)
    .set({
      cpProfile: sql`coalesce(${users.cpProfile}, ${JSON.stringify(DEFAULT_CP_PROFILE)}::jsonb) || jsonb_build_object('pendingPremiumOrderId', ${order.id}::text)`,
    })
    .where(eq(users._id, req.user!.userId));
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

const subscribeSchema = z.object({
  razorpayOrderId: z.string().min(1).optional(),
  razorpayPaymentId: z.string().min(1).optional(),
  razorpaySignature: z.string().min(1).optional(),
});

router.post("/subscribe", requireRole("CP"), async (req: AuthedRequest, res) => {
  const parsed = subscribeSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: zodMessage(parsed.error) });
  const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = parsed.data;
  const userId = req.user!.userId;
  const db = getDb();

  const [existing] = await db.select({ cpProfile: users.cpProfile }).from(users).where(eq(users._id, userId));
  const current = (existing?.cpProfile ?? DEFAULT_CP_PROFILE) as CpProfile & { pendingPremiumOrderId?: string };

  if (!simulatedPaymentsAllowed()) {
    if (!isPaymentGatewayConfigured) {
      return res.status(503).json({ error: "Payments are not configured yet. Please try again shortly." });
    }
    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      return res.status(402).json({ error: "Payment is required to activate Premium." });
    }
    if (!verifyPaymentSignature(razorpayOrderId, razorpayPaymentId, razorpaySignature)) {
      return res.status(400).json({ error: "Payment verification failed" });
    }
    if (current.pendingPremiumOrderId !== razorpayOrderId) {
      return res.status(409).json({ error: "This payment has already been used or wasn't started from this account." });
    }
  }

  // Renewals stack onto an active subscription instead of resetting it.
  const now = new Date();
  const activeUntil = current.isPremium && current.premiumExpiresAt ? new Date(current.premiumExpiresAt) : null;
  const expires = activeUntil && activeUntil > now ? new Date(activeUntil) : now;
  expires.setMonth(expires.getMonth() + 1);

  // Consume the pending order in the same statement that grants Premium, so
  // two concurrent requests with one payment can't both succeed.
  const claim = razorpayOrderId
    ? sql`${users.cpProfile}->>'pendingPremiumOrderId' = ${razorpayOrderId}`
    : sql`true`;
  const [updated] = await db
    .update(users)
    .set({
      cpProfile: sql`(coalesce(${users.cpProfile}, ${JSON.stringify(DEFAULT_CP_PROFILE)}::jsonb) - 'pendingPremiumOrderId') || jsonb_build_object('isPremium', true, 'premiumExpiresAt', ${expires.toISOString()}::text)`,
    })
    .where(sql`${users._id} = ${userId} and ${claim}`)
    .returning();
  if (!updated) {
    return res.status(409).json({ error: "This payment has already been used." });
  }
  const { password: _p, ...user } = updated;

  res.json({ user, price: CP_PREMIUM_MONTHLY_PRICE, paymentGatewayLive: isPaymentGatewayConfigured });
});

router.delete("/subscribe", requireRole("CP"), async (req: AuthedRequest, res) => {
  const user = await setPremium(req.user!.userId, false, null);

  res.json({ user });
});

export default router;
