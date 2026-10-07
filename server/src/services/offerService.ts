import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "../config/db";
import { offers, IOffer, Role } from "../db/schema";

/** Today's calendar date in India (YYYY-MM-DD). Offer windows and visit dates are IST. */
export function istToday(offsetDays = 0): string {
  return new Date(Date.now() + 5.5 * 3600 * 1000 + offsetDays * 86400 * 1000).toISOString().slice(0, 10);
}

/** Is the offer switched on and inside its start/end window (inclusive, IST)? */
export function isOfferLive(o: Pick<IOffer, "isActive" | "deletedAt" | "startDate" | "endDate">, today = istToday()): boolean {
  if (!o.isActive || o.deletedAt) return false;
  if (o.startDate && today < o.startDate) return false;
  if (o.endDate && today > o.endDate) return false;
  return true;
}

export function isOfferEligible(o: Pick<IOffer, "eligibleRoles">, role: Role | null | undefined): boolean {
  const roles = Array.isArray(o.eligibleRoles) ? o.eligibleRoles : [];
  // Guests see only offers meant for buyers.
  return roles.includes((role ?? "BUYER") as Role);
}

export interface RewardInput {
  areaSqft?: number | null;
  units?: number | null;
  bookingValue?: number | null;
}

/**
 * The reward for a sale under this offer, in rupees — the single source of
 * truth (the client only displays it). PER_AREA_BLOCK: every `basisQuantity`
 * sq ft earns `amount` (whole blocks unless `prorate`); PER_UNIT: `amount` per
 * unit; PERCENT_OF_VALUE: `amount`% of the booking value; FIXED: `amount`.
 */
export function computeOfferReward(
  o: Pick<IOffer, "calcBasis" | "basisQuantity" | "amount" | "prorate">,
  input: RewardInput,
): number {
  const amount = Number(o.amount) || 0;
  switch (o.calcBasis) {
    case "PER_AREA_BLOCK": {
      const block = Number(o.basisQuantity) || 0;
      const area = Number(input.areaSqft) || 0;
      if (block <= 0 || area <= 0) return 0;
      const blocks = o.prorate ? area / block : Math.floor(area / block);
      return Math.round(blocks * amount);
    }
    case "PER_UNIT":
      return Math.round(Math.max(0, Math.floor(Number(input.units) || 0)) * amount);
    case "PERCENT_OF_VALUE":
      return Math.round(((Number(input.bookingValue) || 0) * amount) / 100);
    case "FIXED":
      return Math.round(amount);
    default:
      return 0;
  }
}

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
function compactInr(n: number): string {
  if (n >= 1e7) return `₹${+(n / 1e7).toFixed(2)} Cr`;
  if (n >= 1e5) return `₹${+(n / 1e5).toFixed(2)} Lakh`;
  return inr(n);
}

/** Short badge copy, e.g. "Earn ₹1 Lakh per 1,000 sq ft" (admin text wins). */
export function offerBadge(o: IOffer): string {
  if (o.badgeText?.trim()) return o.badgeText.trim();
  const verb = o.rewardType === "DISCOUNT" ? "Save" : o.rewardType === "GIFT" ? "Get" : "Earn";
  switch (o.calcBasis) {
    case "PER_AREA_BLOCK":
      return `${verb} ${compactInr(o.amount)} per ${(o.basisQuantity ?? 0).toLocaleString("en-IN")} sq ft`;
    case "PER_UNIT":
      return `${verb} ${compactInr(o.amount)} per unit`;
    case "PERCENT_OF_VALUE":
      return `${verb} ${o.amount}% of booking value`;
    default:
      return `${verb} ${compactInr(o.amount)}`;
  }
}

/** Worked examples shown in the offer details (1×, 2×, 3× the basis). */
export function offerExamples(o: IOffer): { label: string; reward: number }[] {
  if (o.calcBasis === "PER_AREA_BLOCK" && o.basisQuantity) {
    return [1, 2, 3].map((k) => {
      const area = o.basisQuantity! * k;
      return { label: `${area.toLocaleString("en-IN")} sq ft sold`, reward: computeOfferReward(o, { areaSqft: area }) };
    });
  }
  if (o.calcBasis === "PER_UNIT") {
    return [1, 2, 3].map((k) => ({ label: `${k} unit${k > 1 ? "s" : ""} sold`, reward: computeOfferReward(o, { units: k }) }));
  }
  if (o.calcBasis === "PERCENT_OF_VALUE") {
    return [5e6, 1e7].map((v) => ({ label: `${compactInr(v)} booking`, reward: computeOfferReward(o, { bookingValue: v }) }));
  }
  return [];
}

/** The public, display-safe shape of an offer (no audit/internal fields). */
export function publicOffer(o: IOffer) {
  return {
    _id: o._id,
    name: o.name,
    projectId: o.projectId,
    unitId: o.unitId,
    description: o.description,
    terms: o.terms,
    badge: offerBadge(o),
    rewardType: o.rewardType,
    calcBasis: o.calcBasis,
    basisQuantity: o.basisQuantity,
    amount: o.amount,
    prorate: o.prorate,
    startDate: o.startDate,
    endDate: o.endDate,
    examples: offerExamples(o),
  };
}

/**
 * The live offer a new lead qualifies for (unit-specific beats project-wide),
 * for the creator's role — checked on the server, never taken from the client.
 */
export async function findEligibleOffer(projectId: string, unitId: string | null, role: Role): Promise<IOffer | null> {
  const rows = await getDb()
    .select()
    .from(offers)
    .where(and(eq(offers.projectId, projectId), eq(offers.isActive, true), isNull(offers.deletedAt)));
  const today = istToday();
  const live = rows.filter((o) => isOfferLive(o, today) && isOfferEligible(o, role) && (!o.unitId || o.unitId === unitId));
  live.sort((a, b) => Number(!!b.unitId) - Number(!!a.unitId) || +b.createdAt - +a.createdAt);
  return live[0] ?? null;
}
