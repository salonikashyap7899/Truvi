import { describe, expect, it } from "vitest";
import {
  assertHabitatJournalBalanced,
  buildHabitatChargeJournal,
  calculateHabitatCancellation,
  calculateHabitatMoneySplit,
  canTransitionHabitatBooking,
  habitatEstimatePaise,
  isHabitatAreaCovered,
  isHabitatPayoutEligible,
} from "./habitat";

describe("Habitat booking lifecycle", () => {
  it("lets only the assigned provider accept and progress a booking", () => {
    expect(canTransitionHabitatBooking("PROVIDER", "PROVIDER_ASSIGNED", "ACCEPTED")).toBe(true);
    expect(canTransitionHabitatBooking("PROVIDER", "ACCEPTED", "IN_PROGRESS")).toBe(true);
    expect(canTransitionHabitatBooking("BUYER", "PROVIDER_ASSIGNED", "ACCEPTED")).toBe(false);
    expect(canTransitionHabitatBooking("PROVIDER", "REQUESTED", "IN_PROGRESS")).toBe(false);
  });

  it("requires buyer confirmation after a provider submits completion", () => {
    expect(canTransitionHabitatBooking("PROVIDER", "IN_PROGRESS", "COMPLETION_SUBMITTED")).toBe(true);
    expect(canTransitionHabitatBooking("PROVIDER", "COMPLETION_SUBMITTED", "COMPLETED")).toBe(false);
    expect(canTransitionHabitatBooking("BUYER", "COMPLETION_SUBMITTED", "COMPLETED")).toBe(true);
    expect(canTransitionHabitatBooking("BUYER", "COMPLETED", "CANCELLED")).toBe(false);
  });

  it("keeps estimates in paise and does not invent a quote price", () => {
    expect(habitatEstimatePaise("FIXED", 125_050)).toBe(125_050);
    expect(habitatEstimatePaise("STARTING_PRICE", 99_900)).toBe(99_900);
    expect(habitatEstimatePaise("QUOTE", null)).toBeNull();
    expect(() => habitatEstimatePaise("FIXED", 10.5)).toThrow();
    expect(() => habitatEstimatePaise("QUOTE", 100)).toThrow();
  });

  it("matches provider coverage to the buyer's city or locality", () => {
    expect(isHabitatAreaCovered(["Gomti Nagar, Lucknow"], "Lucknow", "Gomti Nagar")).toBe(true);
    expect(isHabitatAreaCovered(["Kanpur"], "Lucknow")).toBe(false);
  });

  it("calculates commission, commission tax, and provider share in integer paise", () => {
    expect(calculateHabitatMoneySplit(10_001, 1_000, 1_800)).toEqual({
      amountPaise: 10_001,
      commissionPaise: 1_000,
      commissionTaxPaise: 180,
      providerPaise: 8_821,
    });
    expect(() => calculateHabitatMoneySplit(100, 10_000, 10_000)).toThrow("exceed");
    expect(() => calculateHabitatMoneySplit(100, 10_001, 0)).toThrow("basis points");
  });

  it("refunds fully when the provider cancels and pays buyer cancellation fees to the provider", () => {
    expect(calculateHabitatCancellation(10_000, 2_500, false)).toEqual({
      refundPaise: 7_500,
      providerCompensationPaise: 2_500,
    });
    expect(calculateHabitatCancellation(10_000, 2_500, true)).toEqual({
      refundPaise: 10_000,
      providerCompensationPaise: 0,
    });
  });

  it("holds provider payout until the completion window ends and disputes are cleared", () => {
    const now = new Date("2026-10-13T12:00:00.000Z");
    const eligibleAt = new Date("2026-10-13T11:00:00.000Z");
    expect(isHabitatPayoutEligible("COMPLETED", eligibleAt, null, now)).toBe(true);
    expect(isHabitatPayoutEligible("COMPLETION_SUBMITTED", eligibleAt, null, now)).toBe(false);
    expect(isHabitatPayoutEligible("COMPLETED", eligibleAt, "OPEN", now)).toBe(false);
    expect(isHabitatPayoutEligible("COMPLETED", eligibleAt, "RESOLVED_PROVIDER", now)).toBe(true);
  });

  it("creates balanced charge journals and rejects unbalanced journals", () => {
    const split = calculateHabitatMoneySplit(10_000, 1_000, 1_800);
    const journal = buildHabitatChargeJournal(split);
    expect(journal.filter((line) => line.direction === "DEBIT").reduce((sum, line) => sum + line.amountPaise, 0)).toBe(10_000);
    expect(journal.filter((line) => line.direction === "CREDIT").reduce((sum, line) => sum + line.amountPaise, 0)).toBe(10_000);
    expect(() => assertHabitatJournalBalanced([
      { accountCode: "A", direction: "DEBIT", amountPaise: 100 },
      { accountCode: "B", direction: "CREDIT", amountPaise: 99 },
    ])).toThrow("balanced");
  });
});
