/**
 * Truvi business constants — single source of truth for money math,
 * tier thresholds, and marketplace pricing. Ported 1:1 from the Next.js
 * MVP so behavior stays consistent across stacks. See DECISIONS.md.
 */

export const TDS_PERCENT = 5.0;

export const DEFAULT_PLATFORM_FEE_PERCENT = 0.75;

export const DEFAULT_COMMISSION_MILESTONES = [
  { label: "On Booking", percentOfTotal: 30 },
  { label: "On Agreement", percentOfTotal: 40 },
  { label: "On Registration", percentOfTotal: 30 },
] as const;

export const UNIT_LOCK_MINUTES = 30;

export const LEAD_FOLLOWUP_REMINDER_DAYS = 3;

export const DUPLICATE_LEAD_WINDOW_DAYS = 30;

export const CP_TIER_THRESHOLDS = [
  { tier: "DIAMOND", min: 30 },
  { tier: "PLATINUM", min: 15 },
  { tier: "GOLD", min: 5 },
  { tier: "SILVER", min: 0 },
] as const;

export type CPTier = "SILVER" | "GOLD" | "PLATINUM" | "DIAMOND";

export function tierForBookings(totalBookings: number): CPTier {
  for (const t of CP_TIER_THRESHOLDS) {
    if (totalBookings >= t.min) return t.tier as CPTier;
  }
  return "SILVER";
}

export const LEAD_MARKETPLACE_PRICES: Record<"BASIC" | "QUALIFIED" | "SITE_VISIT", number> = {
  BASIC: 300,
  QUALIFIED: 1000,
  SITE_VISIT: 3000,
};

export const CP_PREMIUM_MONTHLY_PRICE = 1999;

export const FEATURED_LISTING_PRICE_RANGE = { min: 10000, max: 50000 };

export const REVENUE_MIX_TARGET = {
  platformFee: 50,
  featuredListings: 20,
  leadAsAService: 15,
  premiumMembership: 10,
  referralOther: 5,
} as const;
