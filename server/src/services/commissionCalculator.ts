import { DEFAULT_COMMISSION_MILESTONES, DEFAULT_PLATFORM_FEE_PERCENT, TDS_PERCENT } from "../config/constants";

export interface CommissionCalcInput {
  bookingValue: number;
  commissionPercent: number;
  platformFeePercent?: number;
  tdsPercent?: number;
}

export interface CommissionCalcResult {
  cpCommissionAmount: number;
  platformFeeAmount: number;
  tdsAmount: number;
  netPayableToCp: number;
}

/**
 * Core commission calculation — the single source of truth for money math.
 *
 * Non-negotiable business rule: platformFeeAmount is NEVER subtracted from
 * cpCommissionAmount. They are two independent line items billed to two
 * different parties (CP earns the full commission; Developer pays the
 * platform fee on top). TDS is a statutory withholding on the CP's income,
 * tracked separately too.
 */
export function calculateCommission(input: CommissionCalcInput): CommissionCalcResult {
  const { bookingValue, commissionPercent } = input;
  const platformFeePercent = input.platformFeePercent ?? DEFAULT_PLATFORM_FEE_PERCENT;
  const tdsPercent = input.tdsPercent ?? TDS_PERCENT;

  if (bookingValue < 0) throw new Error("bookingValue cannot be negative");
  if (commissionPercent < 0) throw new Error("commissionPercent cannot be negative");

  const cpCommissionAmount = round2(bookingValue * (commissionPercent / 100));
  const platformFeeAmount = round2(bookingValue * (platformFeePercent / 100));
  const tdsAmount = round2(cpCommissionAmount * (tdsPercent / 100));
  const netPayableToCp = round2(cpCommissionAmount - tdsAmount);

  return { cpCommissionAmount, platformFeeAmount, tdsAmount, netPayableToCp };
}

export interface MilestoneInput {
  label: string;
  percentOfTotal: number;
}

export interface MilestoneResult extends MilestoneInput {
  amount: number;
}

export function buildMilestones(
  cpCommissionAmount: number,
  milestones: MilestoneInput[] = DEFAULT_COMMISSION_MILESTONES as unknown as MilestoneInput[]
): MilestoneResult[] {
  const totalPercent = milestones.reduce((sum, m) => sum + m.percentOfTotal, 0);
  if (Math.round(totalPercent) !== 100) {
    throw new Error(`Milestone percentages must sum to 100, got ${totalPercent}`);
  }

  const results: MilestoneResult[] = [];
  let allocated = 0;

  milestones.forEach((m, idx) => {
    const isLast = idx === milestones.length - 1;
    const amount = isLast
      ? round2(cpCommissionAmount - allocated)
      : round2(cpCommissionAmount * (m.percentOfTotal / 100));
    allocated = round2(allocated + amount);
    results.push({ ...m, amount });
  });

  return results;
}

export function assertReleasedNeverExceedsTotal(
  releasedAmounts: number[],
  cpCommissionAmount: number
): void {
  const totalReleased = round2(releasedAmounts.reduce((sum, a) => sum + a, 0));
  if (totalReleased > cpCommissionAmount + 0.01) {
    throw new Error(
      `Released milestones (₹${totalReleased}) exceed total CP commission (₹${cpCommissionAmount})`
    );
  }
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
