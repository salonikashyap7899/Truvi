import { Router } from "express";
import { zodMessage } from "../lib/validationError";
import { z } from "zod";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "../config/db";
import { leads, leadPurchases } from "../db/schema";
import { authenticate, requireRole, AuthedRequest } from "../middleware/auth";
import { LEAD_MARKETPLACE_PRICES } from "../config/constants";
import {
  createOrder,
  fetchOrder,
  verifyPaymentSignature,
  isPaymentGatewayConfigured,
  simulatedPaymentsAllowed,
} from "../services/paymentService";

const router = Router();

// Unassigned leads that can be sold to Channel Partners. Leads a buyer or an
// ambassador added from inventory belong to the Truvi team and are never sold.
const marketplacePool = and(
  isNull(leads.assignedToId),
  sql`coalesce(${leads.creatorRole}, '') not in ('BUYER', 'AMBASSADOR')`,
);
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
  if (!parsed.success) return res.status(400).json({ error: zodMessage(parsed.error), issues: parsed.error.flatten() });

  const price = LEAD_MARKETPLACE_PRICES[parsed.data.leadType];
  // Don't take money when there's no lead to hand over.
  const [available] = await getDb().select({ _id: leads._id }).from(leads).where(marketplacePool).limit(1);
  if (!available) return res.status(404).json({ error: "No leads currently available in this tier" });

  const order = await createOrder(price, `lead_${Date.now()}`, {
    userId: req.user!.userId,
    product: `LEAD_${parsed.data.leadType}`,
  });

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
  if (!parsed.success) return res.status(400).json({ error: zodMessage(parsed.error), issues: parsed.error.flatten() });

  const { leadType, razorpayOrderId, razorpayPaymentId, razorpaySignature } = parsed.data;
  const price = LEAD_MARKETPLACE_PRICES[leadType];
  const userId = req.user!.userId;

  // A lead (client name + phone) is handed out only for a verified payment of
  // an order this server created for this CP and this tier, and each order
  // buys exactly one lead. Simulated purchases exist only in local dev.
  let paymentStatus: "SIMULATED" | "PAID" = "SIMULATED";
  if (!simulatedPaymentsAllowed()) {
    if (!isPaymentGatewayConfigured) {
      return res.status(503).json({ error: "Payments are not configured yet. Please try again shortly." });
    }
    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      return res.status(402).json({ error: "Payment is required to buy a lead." });
    }
    if (!verifyPaymentSignature(razorpayOrderId, razorpayPaymentId, razorpaySignature)) {
      return res.status(400).json({ error: "Payment verification failed" });
    }
    const order = await fetchOrder(razorpayOrderId);
    if (
      !order ||
      order.notes.userId !== userId ||
      order.notes.product !== `LEAD_${leadType}` ||
      order.amount !== Math.round(price * 100)
    ) {
      return res.status(400).json({ error: "This payment doesn't match this purchase." });
    }
    paymentStatus = "PAID";
  }

  const db = getDb();
  const outcome = await db.transaction(async (tx) => {
    if (razorpayOrderId) {
      // Serialise confirmations of the same order, then refuse a reused one.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`lead_purchase:${razorpayOrderId}`}))`);
      const [used] = await tx
        .select({ _id: leadPurchases._id })
        .from(leadPurchases)
        .where(eq(leadPurchases.razorpayOrderId, razorpayOrderId))
        .limit(1);
      if (used) return { error: 409 as const };
    }

    const [availableLead] = await tx
      .select({ _id: leads._id })
      .from(leads)
      .where(marketplacePool)
      .orderBy(asc(leads.createdAt))
      .limit(1)
      .for("update", { skipLocked: true });
    if (!availableLead) return { error: 404 as const };

    const [lead] = await tx
      .update(leads)
      .set({ assignedToId: userId, stage: "ASSIGNED" })
      .where(and(eq(leads._id, availableLead._id), isNull(leads.assignedToId)))
      .returning();
    if (!lead) return { error: 404 as const };

    const [purchase] = await tx
      .insert(leadPurchases)
      .values({
        cpId: userId,
        leadType,
        amountPaid: price,
        razorpayOrderId,
        razorpayPaymentId,
        paymentStatus,
      })
      .returning();
    return { lead, purchase };
  });

  if ("error" in outcome) {
    return outcome.error === 409
      ? res.status(409).json({ error: "This payment has already been used." })
      : res.status(404).json({ error: "No leads currently available in this tier" });
  }
  const { lead, purchase } = outcome;

  res.status(201).json({ purchase, lead });
});

export default router;
