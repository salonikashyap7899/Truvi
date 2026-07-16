/**
 * Canonical pricing catalog — the SERVER is the single source of truth for
 * every amount. The frontend never sends an amount; it sends a `planId` and
 * the server looks up how much to charge here. All money is stored in **paise**
 * (integer) — never floating point.
 *
 * `listPaise` is the strike-through "before" price (marketing only).
 * `type: "subscription"` items are recognised but NOT charged in this pass —
 * create-order refuses them with a clear message until Razorpay subscription
 * plans are created in the dashboard and wired up.
 */

export type PlanCategory = "BUYER" | "CP" | "DEVELOPER";
export type PlanType = "one_time" | "subscription";

export interface PlanDef {
  id: string;
  label: string;
  category: PlanCategory;
  type: PlanType;
  /** Amount actually charged, in paise. 0 = free (no checkout). */
  pricePaise: number;
  /** Strike-through original price in paise (optional, marketing). */
  listPaise?: number;
  /** Billing interval for subscriptions. */
  interval?: "monthly" | "yearly" | "6-months";
}

const R = (rupees: number) => Math.round(rupees * 100); // rupees → paise

export const PLANS: Record<string, PlanDef> = {
  // ── Buyers ────────────────────────────────────────────────────────────
  buyer_ai_report: { id: "buyer_ai_report", label: "AI Property Report", category: "BUYER", type: "one_time", pricePaise: R(28), listPaise: R(299) },
  buyer_premium_verification: { id: "buyer_premium_verification", label: "Premium + Document Verification", category: "BUYER", type: "one_time", pricePaise: R(99), listPaise: R(999) },
  buyer_consultant_call: { id: "buyer_consultant_call", label: "Property Consultant Call", category: "BUYER", type: "one_time", pricePaise: R(49), listPaise: R(449) },
  buyer_concierge: { id: "buyer_concierge", label: "Concierge Buying Service", category: "BUYER", type: "one_time", pricePaise: R(5999), listPaise: R(39999) },
  buyer_pro_monthly: { id: "buyer_pro_monthly", label: "Buyer Pro (Monthly)", category: "BUYER", type: "subscription", pricePaise: R(299), interval: "monthly" },
  buyer_pro_yearly: { id: "buyer_pro_yearly", label: "Buyer Pro (Yearly)", category: "BUYER", type: "subscription", pricePaise: R(1999), interval: "yearly" },

  // ── Channel Partners ──────────────────────────────────────────────────
  cp_premium_membership: { id: "cp_premium_membership", label: "Premium CP Membership (6 months)", category: "CP", type: "one_time", pricePaise: R(99), listPaise: R(999), interval: "6-months" },
  cp_verified_badge: { id: "cp_verified_badge", label: "Verified CP Badge (6 months)", category: "CP", type: "one_time", pricePaise: R(999), listPaise: R(2999), interval: "6-months" },
  cp_lead_purchase: { id: "cp_lead_purchase", label: "Lead Purchase (contact data)", category: "CP", type: "one_time", pricePaise: R(99), listPaise: R(999) },
  cp_crm: { id: "cp_crm", label: "CRM Access (Monthly)", category: "CP", type: "one_time", pricePaise: R(99), listPaise: R(999), interval: "monthly" },
  cp_pro_monthly: { id: "cp_pro_monthly", label: "CP Pro (Monthly)", category: "CP", type: "subscription", pricePaise: R(999), interval: "monthly" },
  cp_pro_yearly: { id: "cp_pro_yearly", label: "CP Pro (Yearly)", category: "CP", type: "subscription", pricePaise: R(9999), interval: "yearly" },

  // ── Developers ────────────────────────────────────────────────────────
  dev_verified_badge: { id: "dev_verified_badge", label: "Verified Developer Badge (Prime Listing)", category: "DEVELOPER", type: "one_time", pricePaise: R(999), listPaise: R(4999) },
  dev_3d_mapping: { id: "dev_3d_mapping", label: "3D Mapping", category: "DEVELOPER", type: "one_time", pricePaise: R(99), listPaise: R(999) },
  dev_crm: { id: "dev_crm", label: "Developer CRM (Monthly)", category: "DEVELOPER", type: "one_time", pricePaise: R(49), listPaise: R(449), interval: "monthly" },
  dev_ai_analytics: { id: "dev_ai_analytics", label: "AI Analytics Dashboard", category: "DEVELOPER", type: "one_time", pricePaise: R(999), listPaise: R(4999) },
  dev_marketing_campaign: { id: "dev_marketing_campaign", label: "Marketing Campaign", category: "DEVELOPER", type: "one_time", pricePaise: R(100000), listPaise: R(200000) },
  dev_pro_monthly: { id: "dev_pro_monthly", label: "Developer Pro (Monthly)", category: "DEVELOPER", type: "subscription", pricePaise: R(9999), interval: "monthly" },
  dev_pro_yearly: { id: "dev_pro_yearly", label: "Developer Pro (Yearly)", category: "DEVELOPER", type: "subscription", pricePaise: R(99999), interval: "yearly" },
};

export function getPlan(planId: string): PlanDef | undefined {
  return PLANS[planId];
}

/** All subscription (recurring) plans. */
export function getSubscriptionPlans(): PlanDef[] {
  return Object.values(PLANS).filter((p) => p.type === "subscription");
}

/** Maps our interval to a Razorpay plan `period`. */
export function razorpayPeriod(interval?: string): "monthly" | "yearly" {
  return interval === "yearly" ? "yearly" : "monthly";
}

/** When a plan bought/started on `start` expires, given its billing interval.
 *  Returns null for one-off items that never expire (no interval). */
export function intervalEnd(start: Date, interval?: string | null): Date | null {
  if (!interval) return null;
  const d = new Date(start);
  if (interval === "monthly") d.setMonth(d.getMonth() + 1);
  else if (interval === "yearly") d.setFullYear(d.getFullYear() + 1);
  else if (interval === "6-months") d.setMonth(d.getMonth() + 6);
  else return null;
  return d;
}

/** Adds GST on top of a base paise amount. Returns integer paise. A non-finite
 *  gstPercent (e.g. a bad env value) falls back to 18 so the result can never
 *  become NaN and poison a DB insert or a Razorpay amount. */
export function withGst(basePaise: number, gstPercent: number): number {
  const pct = Number.isFinite(gstPercent) ? gstPercent : 18;
  return basePaise + Math.round((basePaise * pct) / 100);
}
