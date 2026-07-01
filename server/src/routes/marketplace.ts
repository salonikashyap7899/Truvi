import { Router } from "express";
import { z } from "zod";
import { Lead } from "../models/Lead";
import { LeadPurchase } from "../models/LeadPurchase";
import { authenticate, requireRole, AuthedRequest } from "../middleware/auth";
import { LEAD_MARKETPLACE_PRICES } from "../config/constants";
import { createOrder, verifyPaymentSignature, isPaymentGatewayConfigured } from "../services/paymentService";

const router = Router();
router.use(authenticate);

router.get("/", requireRole("CP"), async (req: AuthedRequest, res) => {
  const purchases = await LeadPurchase.find({ cpId: req.user!.userId }).sort({ createdAt: -1 });
  res.json({ purchases, prices: LEAD_MARKETPLACE_PRICES, paymentGatewayLive: isPaymentGatewayConfigured });
});

const purchaseSchema = z.object({ leadType: z.enum(["BASIC", "QUALIFIED", "SITE_VISIT"]) });

/**
 * Step 1: create a Razorpay order (or a simulated one if no live keys are
 * configured — same graceful-degrade pattern as the Next.js MVP, but here
 * the real integration code path exists and lights up the moment you add
 * RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET to .env).
 */
router.post("/create-order", requireRole("CP"), async (req: AuthedRequest, res) => {
  const parsed = purchaseSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });

  const price = LEAD_MARKETPLACE_PRICES[parsed.data.leadType];
  const order = await createOrder(price, `lead_${parsed.data.leadType}_${req.user!.userId}_${Date.now()}`);

  res.json({ order, leadType: parsed.data.leadType, amount: price, keyId: process.env.RAZORPAY_KEY_ID || null });
});

/**
 * Step 2: after the client completes checkout (or immediately, in
 * simulated mode), confirm the purchase and assign a matching lead.
 */
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

  // FIFO over the unassigned-lead pool. See DECISIONS.md for the note on
  // true premium-priority queueing (not implemented for single-purchase actions).
  const availableLead = await Lead.findOneAndUpdate(
    { assignedToId: null },
    { $set: { assignedToId: req.user!.userId, stage: "ASSIGNED" } },
    { new: true, sort: { createdAt: 1 } }
  );

  if (!availableLead) {
    return res.status(404).json({ error: "No leads currently available in this tier" });
  }

  const purchase = await LeadPurchase.create({
    cpId: req.user!.userId,
    leadType,
    amountPaid: price,
    razorpayOrderId,
    razorpayPaymentId,
    paymentStatus,
  });

  res.status(201).json({ purchase, lead: availableLead });
});

export default router;
