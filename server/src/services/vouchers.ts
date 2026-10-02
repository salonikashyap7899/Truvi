import type { IVoucher } from "../db/schema";
import type { PlanDef } from "../config/pricing";

/** Always leave at least ₹1 so Razorpay has a positive amount to charge. */
const MIN_CHARGE_PAISE = 100;

export interface VoucherResult {
  ok: boolean;
  reason?: string;
  discountPaise: number;
}

/**
 * Decide whether a voucher applies to a plan + base amount and how much it
 * discounts, in paise. Pure and server-only — the client never computes a
 * discount. Never discounts below a ₹1 minimum charge.
 */
export function evaluateVoucher(v: IVoucher, plan: PlanDef, basePaise: number): VoucherResult {
  const fail = (reason: string): VoucherResult => ({ ok: false, reason, discountPaise: 0 });

  if (!v.active) return fail("This voucher is no longer active.");
  if (v.expiresAt && v.expiresAt.getTime() < Date.now()) return fail("This voucher has expired.");
  if (v.maxRedemptions != null && v.redeemedCount >= v.maxRedemptions) return fail("This voucher has reached its usage limit.");
  if (v.category && v.category !== plan.category) return fail("This voucher doesn't apply to this plan.");
  if (Array.isArray(v.planIds) && v.planIds.length > 0 && !v.planIds.includes(plan.id)) return fail("This voucher doesn't apply to this plan.");
  if (basePaise < (v.minAmountPaise ?? 0)) return fail("Your order value is below this voucher's minimum.");

  let discount = 0;
  if (v.discountType === "PERCENT") {
    const pct = Math.max(0, Math.min(100, v.discountValue));
    discount = Math.round((basePaise * pct) / 100);
    if (v.maxDiscountPaise && v.maxDiscountPaise > 0) discount = Math.min(discount, v.maxDiscountPaise);
  } else {
    discount = Math.max(0, v.discountValue);
  }

  // Never take the charge below the ₹1 minimum (a 100%-off / oversized voucher
  // is clamped rather than producing a zero-amount order Razorpay can't take).
  discount = Math.min(discount, Math.max(0, basePaise - MIN_CHARGE_PAISE));
  if (discount <= 0) return fail("This voucher gives no discount on this plan.");
  return { ok: true, discountPaise: discount };
}

/** Normalise a user-entered code the way we store & look them up. */
export function normalizeVoucherCode(raw: string): string {
  return (raw || "").trim().toUpperCase().replace(/\s+/g, "");
}
