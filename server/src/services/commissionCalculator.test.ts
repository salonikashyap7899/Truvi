import { describe, it, expect } from "vitest";
import {
  calculateCommission,
  buildMilestones,
  assertReleasedNeverExceedsTotal,
} from "./commissionCalculator";

describe("calculateCommission", () => {
  it("calculates the correct percent split for cpCommissionAmount", () => {
    const result = calculateCommission({ bookingValue: 5_000_000, commissionPercent: 3 });
    expect(result.cpCommissionAmount).toBe(150_000);
  });

  it("calculates TDS at the configured percent (default 5%)", () => {
    const result = calculateCommission({ bookingValue: 5_000_000, commissionPercent: 3 });
    expect(result.tdsAmount).toBe(7_500);
    expect(result.netPayableToCp).toBe(142_500);
  });

  it("respects a custom TDS percent when provided", () => {
    const result = calculateCommission({ bookingValue: 1_000_000, commissionPercent: 2, tdsPercent: 10 });
    expect(result.cpCommissionAmount).toBe(20_000);
    expect(result.tdsAmount).toBe(2_000);
  });

  it("NEVER subtracts platformFeeAmount from cpCommissionAmount", () => {
    const result = calculateCommission({ bookingValue: 5_000_000, commissionPercent: 3, platformFeePercent: 0.75 });
    expect(result.cpCommissionAmount).toBe(150_000);
    expect(result.platformFeeAmount).toBe(37_500);
    const higherFee = calculateCommission({ bookingValue: 5_000_000, commissionPercent: 3, platformFeePercent: 5 });
    expect(higherFee.cpCommissionAmount).toBe(150_000);
  });

  it("throws on negative bookingValue or commissionPercent", () => {
    expect(() => calculateCommission({ bookingValue: -1, commissionPercent: 3 })).toThrow();
    expect(() => calculateCommission({ bookingValue: 100, commissionPercent: -1 })).toThrow();
  });
});

describe("buildMilestones", () => {
  it("defaults to the 30/40/30 Booking/Agreement/Registration split", () => {
    const milestones = buildMilestones(150_000);
    expect(milestones.map((m) => m.label)).toEqual(["On Booking", "On Agreement", "On Registration"]);
    expect(milestones[0].amount).toBe(45_000);
    expect(milestones[1].amount).toBe(60_000);
    expect(milestones[2].amount).toBe(45_000);
  });

  it("milestone amounts sum exactly to cpCommissionAmount (no rounding drift)", () => {
    const cpCommissionAmount = 100_333.33;
    const milestones = buildMilestones(cpCommissionAmount);
    const sum = milestones.reduce((s, m) => s + m.amount, 0);
    expect(Math.round(sum * 100) / 100).toBe(Math.round(cpCommissionAmount * 100) / 100);
  });

  it("throws if custom milestone percentages do not sum to 100", () => {
    expect(() =>
      buildMilestones(100_000, [
        { label: "A", percentOfTotal: 50 },
        { label: "B", percentOfTotal: 40 },
      ])
    ).toThrow();
  });
});

describe("assertReleasedNeverExceedsTotal", () => {
  it("passes when released sum is within total", () => {
    expect(() => assertReleasedNeverExceedsTotal([45_000, 60_000], 150_000)).not.toThrow();
  });

  it("throws when released sum exceeds total commission", () => {
    expect(() => assertReleasedNeverExceedsTotal([45_000, 60_000, 50_000], 150_000)).toThrow();
  });

  it("allows the full amount to be released across all milestones", () => {
    const milestones = buildMilestones(150_000);
    const allReleased = milestones.map((m) => m.amount);
    expect(() => assertReleasedNeverExceedsTotal(allReleased, 150_000)).not.toThrow();
  });
});
