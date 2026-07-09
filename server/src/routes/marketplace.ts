import { Router } from "express";
import { z } from "zod";
import { asc, desc, eq, isNull } from "drizzle-orm";
import { getDb } from "../config/db";
import { leads, leadPurchases } from "../db/schema";
import { authenticate, requireRole, AuthedRequest } from "../middleware/auth";
import { LEAD_MARKETPLACE_PRICES } from "../config/constants";
import { createOrder, verifyPaymentSignature, isPaymentGatewayConfigured } from "../services/paymentService";

const router = Router();
router.use(authenticate);

router.get("/", requireRole("CP"), async (req: AuthedRequest, res) => {
  const db = getDb();
  const purchases = await db
    .select()
    .from(leadPurchases)
    .where(eq(leadPurchases.cpId, req.user!.userId))
    .orderBy(desc(leadPurchases.createdAt));

  res.json({ purchases, prices: LEAD_MARKETPLACE_PRICES, paymentGatewayLive: isPaymentGatewayConfigured });
});

const purchaseSchema = z.object({ leadType: z.enum(["BASIC", "QUALIFIED", "SITE_VISIT"]) });

router.post("/create-order", requireRole("CP"), async (req: AuthedRequest, res) => {
  const parsed = purchaseSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });

  const price = LEAD_MARKETPLACE_PRICES[parsed.data.leadType];
  const order = await createOrder(price, `lead_${parsed.data.leadType}_${req.user!.userId}_${Date.now()}`);

  res.json({ order, leadType: parsed.data.leadType, amount: price, keyId: process.env.RAZORPAY_KEY_ID || null });
});

const confirmSchema = z.object({
  leadType: z.enum(["BASIC", "QUALIFIED", "SITE_VISIT"]),
  razorpayOrderId: z.string().optional(),
  razorpayPaymentId: z.string().optional(),
  razorpaySignature: z.string().optional(),
});

router.post("/confirm", requireRole("CP"), async (req: AuthedRequest, res) => {
  const parsed = confirmSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });

  const { leadType, razorpayOrderId, razorpayPaymentId, razorpaySignature } = parsed.data;
  const price = LEAD_MARKETPLACE_PRICES[leadType];

  let paymentStatus: "SIMULATED" | "PAID" | "FAILED" = "SIMULATED";
  if (isPaymentGatewayConfigured && razorpayOrderId && razorpayPaymentId && razorpaySignature) {
    const valid = verifyPaymentSignature(razorpayOrderId, razorpayPaymentId, razorpaySignature);
    if (!valid) return res.status(400).json({ error: "Payment verification failed" });
    paymentStatus = "PAID";
  }

  const db = getDb();
  const [availableLead] = await db
    .select()
    .from(leads)
    .where(isNull(leads.assignedToId))
    .orderBy(asc(leads.createdAt))
    .limit(1);

  if (!availableLead) {
    return res.status(404).json({ error: "No leads currently available in this tier" });
  }

  const [lead] = await db
    .update(leads)
    .set({ assignedToId: req.user!.userId, stage: "ASSIGNED" })
    .where(eq(leads._id, availableLead._id))
    .returning();

  const [purchase] = await db
    .insert(leadPurchases)
    .values({
      cpId: req.user!.userId,
      leadType,
      amountPaid: price,
      razorpayOrderId,
      razorpayPaymentId,
      paymentStatus,
    })
    .returning();

  res.status(201).json({ purchase, lead });
});

export default router;
