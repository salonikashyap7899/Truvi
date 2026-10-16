import type { HabitatBookingStatus, HabitatPricingModel } from "../db/schema";

export type HabitatActor = "BUYER" | "PROVIDER" | "ADMIN";

const transitions: Record<HabitatActor, Partial<Record<HabitatBookingStatus, HabitatBookingStatus[]>>> = {
  BUYER: {
    REQUESTED: ["CANCELLED"],
    PROVIDER_ASSIGNED: ["CANCELLED", "DISPUTED"],
    ACCEPTED: ["DISPUTED", "CANCELLED"],
    QUOTE_PROVIDED: ["CANCELLED"],
    PAYMENT_PENDING: ["CANCELLED"],
    PAID: ["DISPUTED", "CANCELLED"],
    IN_PROGRESS: ["DISPUTED"],
    COMPLETION_SUBMITTED: ["COMPLETED", "DISPUTED"],
  },
  PROVIDER: {
    PROVIDER_ASSIGNED: ["ACCEPTED", "REJECTED"],
    ACCEPTED: ["QUOTE_PROVIDED", "IN_PROGRESS"],
    PAYMENT_PENDING: ["IN_PROGRESS"],
    PAID: ["IN_PROGRESS"],
    IN_PROGRESS: ["COMPLETION_SUBMITTED"],
  },
  ADMIN: {
    REQUESTED: ["CANCELLED"],
    PROVIDER_ASSIGNED: ["CANCELLED"],
    ACCEPTED: ["CANCELLED"],
    IN_PROGRESS: ["CANCELLED"],
    COMPLETION_SUBMITTED: ["CANCELLED"],
    DISPUTED: ["CANCELLED"],
    QUOTE_PROVIDED: ["CANCELLED"],
    PAYMENT_PENDING: ["CANCELLED"],
    PAID: ["CANCELLED"],
  },
};

export function canTransitionHabitatBooking(
  actor: HabitatActor,
  from: HabitatBookingStatus,
  to: HabitatBookingStatus,
): boolean {
  return transitions[actor][from]?.includes(to) ?? false;
}

/** Returns the estimate in integer paise; QUOTE services must not show a fake fixed price. */
export function habitatEstimatePaise(
  model: HabitatPricingModel,
  pricePaise: number | null,
): number | null {
  if (model === "QUOTE") {
    if (pricePaise !== null) throw new Error("Quote-based services cannot have a fixed price");
    return null;
  }
  if (pricePaise === null || !Number.isSafeInteger(pricePaise) || pricePaise <= 0) {
    throw new Error("Fixed and starting-price services require a positive integer paise amount");
  }
  return pricePaise;
}

export function isHabitatAreaCovered(serviceAreas: string[], requestedCity: string, requestedLocality?: string): boolean {
  const requested = [requestedCity, requestedLocality]
    .map((value) => value?.trim().toLocaleLowerCase())
    .filter((value): value is string => Boolean(value));
  return serviceAreas.some((area) => {
    const normalizedArea = area.trim().toLocaleLowerCase();
    return requested.some((location) =>
      normalizedArea === location || normalizedArea.includes(location) || location.includes(normalizedArea),
    );
  });
}

export interface HabitatMoneySplit {
  amountPaise: number;
  commissionPaise: number;
  commissionTaxPaise: number;
  providerPaise: number;
}

export function calculateHabitatMoneySplit(
  amountPaise: number,
  commissionRateBps: number,
  commissionTaxRateBps: number,
): HabitatMoneySplit {
  if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0) throw new Error("Amount must be positive integer paise");
  if (!Number.isInteger(commissionRateBps) || commissionRateBps < 0 || commissionRateBps > 10_000) {
    throw new Error("Commission rate must be between 0 and 10000 basis points");
  }
  if (!Number.isInteger(commissionTaxRateBps) || commissionTaxRateBps < 0 || commissionTaxRateBps > 10_000) {
    throw new Error("Commission tax rate must be between 0 and 10000 basis points");
  }
  const commissionPaise = Math.round((amountPaise * commissionRateBps) / 10_000);
  const commissionTaxPaise = Math.round((commissionPaise * commissionTaxRateBps) / 10_000);
  const providerPaise = amountPaise - commissionPaise - commissionTaxPaise;
  if (providerPaise < 0) throw new Error("Commission and tax exceed the customer charge");
  return { amountPaise, commissionPaise, commissionTaxPaise, providerPaise };
}

export function calculateHabitatCancellation(
  amountPaise: number,
  cancellationFeeBps: number,
  providerCancelled: boolean,
): { refundPaise: number; providerCompensationPaise: number } {
  if (!Number.isSafeInteger(amountPaise) || amountPaise < 0) throw new Error("Amount must be non-negative integer paise");
  if (!Number.isInteger(cancellationFeeBps) || cancellationFeeBps < 0 || cancellationFeeBps > 10_000) {
    throw new Error("Cancellation fee must be between 0 and 10000 basis points");
  }
  if (providerCancelled) return { refundPaise: amountPaise, providerCompensationPaise: 0 };
  const providerCompensationPaise = Math.round((amountPaise * cancellationFeeBps) / 10_000);
  return { refundPaise: amountPaise - providerCompensationPaise, providerCompensationPaise };
}

export function isHabitatPayoutEligible(
  status: string,
  eligibleAt: Date | null,
  disputeStatus: string | null,
  now = new Date(),
): boolean {
  return (status === "COMPLETED" || status === "CANCELLED") &&
    eligibleAt !== null &&
    eligibleAt.getTime() <= now.getTime() &&
    (status === "CANCELLED"
      ? disputeStatus === null
      : disputeStatus === null || ["RESOLVED_PROVIDER", "PARTIAL_REFUND"].includes(disputeStatus));
}

export type HabitatLedgerLine = { accountCode: string; direction: "DEBIT" | "CREDIT"; amountPaise: number };

export function assertHabitatJournalBalanced(lines: HabitatLedgerLine[]): void {
  const debit = lines.filter((line) => line.direction === "DEBIT").reduce((sum, line) => sum + line.amountPaise, 0);
  const credit = lines.filter((line) => line.direction === "CREDIT").reduce((sum, line) => sum + line.amountPaise, 0);
  if (!lines.length || lines.some((line) => !Number.isSafeInteger(line.amountPaise) || line.amountPaise <= 0) || debit !== credit) {
    throw new Error("Habitat ledger journal must contain positive, balanced debit and credit entries");
  }
}

export function buildHabitatChargeJournal(split: HabitatMoneySplit): HabitatLedgerLine[] {
  const lines: HabitatLedgerLine[] = [
    { accountCode: "GATEWAY_CLEARING", direction: "DEBIT", amountPaise: split.amountPaise },
    { accountCode: "PROVIDER_PAYABLE", direction: "CREDIT", amountPaise: split.providerPaise },
  ];
  if (split.commissionPaise > 0) {
    lines.push({ accountCode: "TRUVI_COMMISSION_REVENUE", direction: "CREDIT", amountPaise: split.commissionPaise });
  }
  if (split.commissionTaxPaise > 0) {
    lines.push({ accountCode: "TRUVI_COMMISSION_TAX_PAYABLE", direction: "CREDIT", amountPaise: split.commissionTaxPaise });
  }
  assertHabitatJournalBalanced(lines);
  return lines;
}
