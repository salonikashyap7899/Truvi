import { Router, Request, Response } from "express";
import crypto from "crypto";
import Razorpay from "razorpay";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { getDb } from "../config/db";
import { payments, subscriptions, subscriptionPlans } from "../db/schema";
import { getEnv, isRazorpayConfigured } from "../config/env";
import { getPlan, withGst } from "../config/pricing";
import { authenticate, requireRole, AuthedRequest } from "../middleware/auth";
import { sendEmail } from "../services/emailService";

const router = Router();

// ── Razorpay client (lazy; only built when keys exist) ────────────────────
let rzp: Razorpay | null = null;
function getRazorpay(): Razorpay | null {
  if (!isRazorpayConfigured()) return null;
  if (!rzp) {
    const env = getEnv();
    rzp = new Razorpay({ key_id: env.razorpayKeyId, key_secret: env.razorpayKeySecret });
  }
  return rzp;
}

const rupees = (paise: number) => (paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 });

/** Public: what the checkout widget needs (key id + GST %). Never the secret. */
router.get("/config", (_req, res) => {
  const env = getEnv();
  res.json({
    keyId: env.razorpayKeyId || null,
    gstPercent: env.gstPercent,
    configured: isRazorpayConfigured(),
  });
});

// ── Create order ──────────────────────────────────────────────────────────
const createOrderSchema = z.object({
  planId: z.string().min(1),
  name: z.string().min(2).max(120),
  email: z.string().email(),
  phone: z.string().min(6).max(20),
});

router.post("/create-order", async (req: AuthedRequest, res: Response) => {
  const parsed = createOrderSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });

  const plan = getPlan(parsed.data.planId);
  if (!plan) return res.status(404).json({ error: "Unknown plan" });
  if (plan.pricePaise <= 0) return res.status(400).json({ error: "This item is free — no payment needed." });
  if (plan.type === "subscription") {
    return res.status(400).json({
      error:
        "Subscriptions aren't available for online checkout yet. Please contact Truvi support on WhatsApp to activate a Pro plan.",
    });
  }

  const razorpay = getRazorpay();
  if (!razorpay) {
    return res.status(503).json({ error: "Payments are not configured yet. Please try again shortly or contact support." });
  }

  const env = getEnv();
  // The server decides the amount — the client is never trusted for money.
  const basePaise = plan.pricePaise;
  const gstPaise = withGst(basePaise, env.gstPercent) - basePaise;
  const totalPaise = basePaise + gstPaise;

  const db = getDb();
  // Insert a CREATED row up-front so we have a record even if the user abandons.
  const [row] = await db
    .insert(payments)
    .values({
      userId: req.user?.userId ?? null,
      customerName: parsed.data.name.trim(),
      customerEmail: parsed.data.email.trim().toLowerCase(),
      customerPhone: parsed.data.phone.trim(),
      planId: plan.id,
      planLabel: plan.label,
      category: plan.category,
      amountPaise: basePaise,
      gstPaise,
      currency: "INR",
      status: "CREATED",
    })
    .returning();

  try {
    const order = await razorpay.orders.create({
      amount: totalPaise, // paise, incl. GST
      currency: "INR",
      receipt: row._id,
      notes: { planId: plan.id, paymentRowId: row._id },
    });

    await db.update(payments).set({ razorpayOrderId: order.id, updatedAt: new Date() }).where(eq(payments._id, row._id));

    res.json({
      orderId: order.id,
      amount: totalPaise,
      currency: "INR",
      keyId: env.razorpayKeyId,
      planLabel: plan.label,
      basePaise,
      gstPaise,
      prefill: { name: parsed.data.name, email: parsed.data.email, contact: parsed.data.phone },
    });
  } catch (err: any) {
    await db.update(payments).set({ status: "FAILED", notes: "order-create-failed", updatedAt: new Date() }).where(eq(payments._id, row._id));
    res.status(502).json({ error: err?.error?.description || "Could not start payment. Please try again." });
  }
});

// ── Verify payment (called by the browser after the modal succeeds) ────────
const verifySchema = z.object({
  razorpay_order_id: z.string().min(1),
  razorpay_payment_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
});

router.post("/verify", async (req, res) => {
  const parsed = verifySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Validation failed" });

  const env = getEnv();
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = parsed.data;

  const expected = crypto
    .createHmac("sha256", env.razorpayKeySecret)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest("hex");

  const valid =
    expected.length === razorpay_signature.length &&
    crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(razorpay_signature));

  if (!valid) return res.status(400).json({ error: "Payment signature verification failed" });

  const db = getDb();
  const [row] = await db.select().from(payments).where(eq(payments.razorpayOrderId, razorpay_order_id));
  if (!row) return res.status(404).json({ error: "Order not found" });

  // Idempotent: if already PAID, just return success.
  if (row.status !== "PAID") {
    await db
      .update(payments)
      .set({ status: "PAID", razorpayPaymentId: razorpay_payment_id, razorpaySignature: razorpay_signature, updatedAt: new Date() })
      .where(eq(payments._id, row._id));

    void sendPaymentConfirmation(row.customerEmail, row.customerName, row.planLabel, row.amountPaise + row.gstPaise, razorpay_payment_id);
  }

  res.json({
    ok: true,
    payment: {
      planLabel: row.planLabel,
      amountPaise: row.amountPaise + row.gstPaise,
      paymentId: razorpay_payment_id,
      email: row.customerEmail,
    },
  });
});

// ── Create subscription (recurring Pro plans) ──────────────────────────────
const createSubSchema = z.object({
  planId: z.string().min(1),
  name: z.string().min(2).max(120),
  email: z.string().email(),
  phone: z.string().min(6).max(20),
});

// How many billing cycles Razorpay should schedule before auto-completing.
const TOTAL_CYCLES = { monthly: 120, yearly: 10 } as const; // ~10 years either way

router.post("/create-subscription", async (req: AuthedRequest, res: Response) => {
  const parsed = createSubSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });

  const plan = getPlan(parsed.data.planId);
  if (!plan) return res.status(404).json({ error: "Unknown plan" });
  if (plan.type !== "subscription") return res.status(400).json({ error: "This item is not a subscription." });

  const razorpay = getRazorpay();
  if (!razorpay) return res.status(503).json({ error: "Payments are not configured yet. Please try again shortly." });

  const db = getDb();
  const [mapping] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.internalPlanId, plan.id));
  if (!mapping?.razorpayPlanId) {
    return res.status(503).json({
      error: "Subscription plans aren't set up yet. Please run the razorpay:plans script, then try again.",
    });
  }

  const env = getEnv();
  const basePaise = plan.pricePaise;
  const gstPaise = withGst(basePaise, env.gstPercent) - basePaise;

  const [row] = await db
    .insert(subscriptions)
    .values({
      userId: req.user?.userId ?? null,
      customerName: parsed.data.name.trim(),
      customerEmail: parsed.data.email.trim().toLowerCase(),
      customerPhone: parsed.data.phone.trim(),
      internalPlanId: plan.id,
      planLabel: plan.label,
      category: plan.category,
      interval: plan.interval ?? null,
      basePaise,
      gstPaise,
      razorpayPlanId: mapping.razorpayPlanId,
      status: "CREATED",
    })
    .returning();

  try {
    const totalCount = plan.interval === "yearly" ? TOTAL_CYCLES.yearly : TOTAL_CYCLES.monthly;
    const sub = await razorpay.subscriptions.create({
      plan_id: mapping.razorpayPlanId,
      total_count: totalCount,
      customer_notify: 1,
      notes: { internalPlanId: plan.id, subscriptionRowId: row._id },
    });

    await db.update(subscriptions).set({ razorpaySubscriptionId: sub.id, updatedAt: new Date() }).where(eq(subscriptions._id, row._id));

    res.json({
      subscriptionId: sub.id,
      keyId: env.razorpayKeyId,
      planLabel: plan.label,
      amountPaise: basePaise + gstPaise,
      prefill: { name: parsed.data.name, email: parsed.data.email, contact: parsed.data.phone },
    });
  } catch (err: any) {
    await db.update(subscriptions).set({ status: "FAILED", notes: "subscription-create-failed", updatedAt: new Date() }).where(eq(subscriptions._id, row._id));
    res.status(502).json({ error: err?.error?.description || "Could not start subscription. Please try again." });
  }
});

// ── Verify subscription (browser calls after the modal succeeds) ───────────
const verifySubSchema = z.object({
  razorpay_payment_id: z.string().min(1),
  razorpay_subscription_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
});

router.post("/verify-subscription", async (req, res) => {
  const parsed = verifySubSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Validation failed" });

  const env = getEnv();
  const { razorpay_payment_id, razorpay_subscription_id, razorpay_signature } = parsed.data;

  // For subscriptions Razorpay signs `payment_id | subscription_id`.
  const expected = crypto
    .createHmac("sha256", env.razorpayKeySecret)
    .update(`${razorpay_payment_id}|${razorpay_subscription_id}`)
    .digest("hex");

  const valid =
    expected.length === razorpay_signature.length &&
    crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(razorpay_signature));
  if (!valid) return res.status(400).json({ error: "Subscription signature verification failed" });

  const db = getDb();
  const [row] = await db.select().from(subscriptions).where(eq(subscriptions.razorpaySubscriptionId, razorpay_subscription_id));
  if (!row) return res.status(404).json({ error: "Subscription not found" });

  if (row.status !== "ACTIVE") {
    await db
      .update(subscriptions)
      .set({ status: "ACTIVE", razorpayPaymentId: razorpay_payment_id, updatedAt: new Date() })
      .where(eq(subscriptions._id, row._id));
    void sendPaymentConfirmation(row.customerEmail, row.customerName, `${row.planLabel} (subscription)`, row.basePaise + row.gstPaise, razorpay_payment_id);
  }

  res.json({
    ok: true,
    payment: {
      planLabel: `${row.planLabel} (subscription)`,
      amountPaise: row.basePaise + row.gstPaise,
      paymentId: razorpay_payment_id,
      email: row.customerEmail,
    },
  });
});

// ── Admin: list all transactions ───────────────────────────────────────────
router.get("/", authenticate, requireRole("ADMIN"), async (_req, res) => {
  const db = getDb();
  const [rows, subs] = await Promise.all([
    db.select().from(payments).orderBy(desc(payments.createdAt)),
    db.select().from(subscriptions).orderBy(desc(subscriptions.createdAt)),
  ]);
  res.json({ payments: rows, subscriptions: subs });
});

/**
 * Webhook handler — mounted separately in app.ts with a RAW body parser so the
 * signature can be verified against the exact bytes Razorpay sent. Idempotent:
 * a payment.captured for an already-PAID row is a no-op.
 */
export async function razorpayWebhookHandler(req: Request, res: Response) {
  const env = getEnv();
  const signature = req.headers["x-razorpay-signature"];
  const raw = req.body as Buffer; // express.raw → Buffer

  if (!env.razorpayWebhookSecret || typeof signature !== "string" || !Buffer.isBuffer(raw)) {
    return res.status(400).json({ error: "Invalid webhook" });
  }

  const expected = crypto.createHmac("sha256", env.razorpayWebhookSecret).update(raw).digest("hex");
  const valid =
    expected.length === signature.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  if (!valid) return res.status(400).json({ error: "Invalid signature" });

  let event: any;
  try {
    event = JSON.parse(raw.toString("utf8"));
  } catch {
    return res.status(400).json({ error: "Bad payload" });
  }

  const db = getDb();
  const entity = event?.payload?.payment?.entity;

  try {
    if (event.event === "payment.captured" && entity) {
      const orderId = entity.order_id as string | undefined;
      const paymentId = entity.id as string | undefined;
      if (orderId) {
        const [row] = await db.select().from(payments).where(eq(payments.razorpayOrderId, orderId));
        if (row && row.status !== "PAID") {
          await db
            .update(payments)
            .set({ status: "PAID", razorpayPaymentId: paymentId ?? row.razorpayPaymentId, updatedAt: new Date() })
            .where(eq(payments._id, row._id));
          void sendPaymentConfirmation(row.customerEmail, row.customerName, row.planLabel, row.amountPaise + row.gstPaise, paymentId ?? "");
        }
      }
    } else if (event.event === "payment.failed" && entity) {
      const orderId = entity.order_id as string | undefined;
      if (orderId) {
        const [row] = await db.select().from(payments).where(eq(payments.razorpayOrderId, orderId));
        if (row && row.status === "CREATED") {
          await db.update(payments).set({ status: "FAILED", notes: entity.error_description ?? "failed", updatedAt: new Date() }).where(eq(payments._id, row._id));
        }
      }
    } else if (typeof event.event === "string" && event.event.startsWith("subscription.")) {
      const subEntity = event?.payload?.subscription?.entity;
      const subId = subEntity?.id as string | undefined;
      if (subId) {
        const [row] = await db.select().from(subscriptions).where(eq(subscriptions.razorpaySubscriptionId, subId));
        if (row) {
          // Map Razorpay subscription events → our status.
          const next =
            event.event === "subscription.activated" || event.event === "subscription.charged"
              ? "ACTIVE"
              : event.event === "subscription.cancelled"
              ? "CANCELLED"
              : event.event === "subscription.completed"
              ? "COMPLETED"
              : null;
          if (next && row.status !== next) {
            await db.update(subscriptions).set({ status: next, updatedAt: new Date() }).where(eq(subscriptions._id, row._id));
          }
        }
      }
    }
  } catch {
    // Swallow processing errors — Razorpay retries; we still 200 below to avoid
    // duplicate retries once the row is already correct.
  }

  res.json({ received: true });
}

/**
 * Payment confirmation email. Wired to the app's existing mailer; swap the body
 * for your branded template any time. Failures never block the payment flow.
 */
async function sendPaymentConfirmation(to: string, name: string, planLabel: string, totalPaise: number, paymentId: string) {
  try {
    await sendEmail(
      to,
      `Payment received — ${planLabel} · Truvi Ventures`,
      `<div style="font-family:Inter,Arial,sans-serif;color:#0B1F3A">
        <h2 style="color:#0B1F3A">Thank you, ${name}!</h2>
        <p>We've received your payment for <strong>${planLabel}</strong>.</p>
        <table style="border-collapse:collapse;margin:12px 0">
          <tr><td style="padding:4px 12px 4px 0;color:#555">Amount paid</td><td style="padding:4px 0"><strong>₹${rupees(totalPaise)}</strong> (incl. GST)</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#555">Payment ID</td><td style="padding:4px 0">${paymentId}</td></tr>
        </table>
        <p style="color:#555;font-size:13px">Truvi Ventures · Truston Developers Pvt. Ltd., Lucknow</p>
      </div>`
    );
  } catch {
    // best-effort only
  }
}

export default router;
