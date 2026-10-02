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
 * Creates a Razorpay order for a given amount (in rupees — converted to
 * paise internally, since Razorpay's API is paise-denominated).
 *
 * If RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET aren't set, falls back to a
 * SIMULATED order (matches the Next.js MVP's "confirm dialog, no real
 * payment" behavior) so the marketplace/premium/featured-listing flows
 * still work end-to-end without live keys. Documented in DECISIONS.md.
 */
export async function createOrder(amountInRupees: number, receipt: string) {
  if (!razorpay) {
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
  });

  return { simulated: false, ...order };
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
  return expected === signature;
}
