import Razorpay from "razorpay";
import crypto from "crypto";

const KEY_ID = process.env.RAZORPAY_KEY_ID;
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;

const hasRazorpayConfig = !!(KEY_ID && KEY_SECRET);

const razorpay = hasRazorpayConfig
  ? new Razorpay({ key_id: KEY_ID!, key_secret: KEY_SECRET! })
  : null;

export const isPaymentGatewayConfigured = hasRazorpayConfig;

/**
 * Simulated (no-money) checkout exists only so local development works
 * without Razorpay keys. It is never allowed outside development/test — a
 * production server without keys refuses paid actions instead of giving them
 * away.
 */
export function simulatedPaymentsAllowed(): boolean {
  const env = process.env.NODE_ENV;
  return !hasRazorpayConfig && (env === "development" || env === "test");
}

/**
 * Creates a Razorpay order for a given amount (in rupees — converted to
 * paise internally, since Razorpay's API is paise-denominated).
 *
 * If RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET aren't set, falls back to a
 * SIMULATED order (matches the Next.js MVP's "confirm dialog, no real
 * payment" behavior) so the marketplace/premium/featured-listing flows
 * still work end-to-end without live keys. Documented in DECISIONS.md.
 */
export async function createOrder(amountInRupees: number, receipt: string, notes?: Record<string, string>) {
  if (!razorpay) {
    if (!simulatedPaymentsAllowed()) throw new PaymentsUnavailableError();
    return {
      simulated: true,
      id: `sim_order_${Date.now()}`,
      amount: amountInRupees * 100,
      currency: "INR",
      receipt,
    };
  }

  const order = await razorpay.orders.create({
    amount: Math.round(amountInRupees * 100),
    currency: "INR",
    receipt,
    notes,
  });

  return { simulated: false, ...order };
}

export class PaymentsUnavailableError extends Error {
  status = 503;
  constructor() {
    super("Payments are not configured yet. Please try again shortly.");
  }
}

/**
 * Server-side view of a Razorpay order, used to bind a payment to the user
 * and product it was created for (the signature alone only proves *some*
 * order was paid, not which product or by whom).
 */
export async function fetchOrder(orderId: string): Promise<{ amount: number; status: string; notes: Record<string, string> } | null> {
  if (!razorpay) return null;
  try {
    const order = await razorpay.orders.fetch(orderId);
    return {
      amount: Number(order.amount),
      status: String(order.status),
      notes: (order.notes ?? {}) as Record<string, string>,
    };
  } catch {
    return null;
  }
}

/**
 * Verifies the Razorpay payment signature after checkout completes
 * client-side. Required before trusting a payment as genuine — never
 * mark something PAID purely because the client says so.
 */
export function verifyPaymentSignature(orderId: string, paymentId: string, signature: string): boolean {
  if (!KEY_SECRET) return false; // can't verify without the secret; caller should treat as simulated instead
  const expected = crypto
    .createHmac("sha256", KEY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
