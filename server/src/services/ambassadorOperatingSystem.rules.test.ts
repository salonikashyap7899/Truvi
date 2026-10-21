import { describe, expect, it } from "vitest";
import {
  canActivateAmbassador,
  calculateIncentiveAmount,
  canTransitionIncentiveStatus,
  computeAmbassadorQualityScore,
  isEligibleAmbassadorSale,
  isTrainingDayComplete,
  hasCompleteSevenDayCurriculum,
  statusAfterTrainingReview,
  areValidScorecardWeights,
  calculateWeightedPerformanceScore,
  DEFAULT_AMBASSADOR_SCORECARD_WEIGHTS,
  validateVerificationChecklist,
} from "./ambassadorOperatingSystem.rules";

describe("Ambassador OS training certification", () => {
  it("requires 80/100 plus both practical and ethics approval", () => {
    expect(isTrainingDayComplete(80, "APPROVED", "APPROVED")).toBe(true);
    expect(isTrainingDayComplete(79, "APPROVED", "APPROVED")).toBe(false);
    expect(isTrainingDayComplete(100, "PENDING", "APPROVED")).toBe(false);
    expect(isTrainingDayComplete(100, "APPROVED", "REJECTED")).toBe(false);
  });

  it("blocks activation until the terms, identity and final training day are complete", () => {
    expect(canActivateAmbassador({ termsAccepted: true, identityVerified: true, finalDayComplete: true })).toBe(true);
    expect(canActivateAmbassador({ termsAccepted: false, identityVerified: true, finalDayComplete: true })).toBe(false);
    expect(canActivateAmbassador({ termsAccepted: true, identityVerified: false, finalDayComplete: true })).toBe(false);
    expect(canActivateAmbassador({ termsAccepted: true, identityVerified: true, finalDayComplete: false })).toBe(false);
  });
});

describe("Ambassador OS sale eligibility", () => {
  it("requires registration/completion, non-duplicate status and referral attribution", () => {
    expect(isEligibleAmbassadorSale({ stage: "REGISTRATION", isDuplicate: false, referralAttributed: true })).toBe(true);
    expect(isEligibleAmbassadorSale({ stage: "COMPLETED", isDuplicate: false, referralAttributed: true })).toBe(true);
    expect(isEligibleAmbassadorSale({ stage: "BOOKING", isDuplicate: false, referralAttributed: true })).toBe(false);
    expect(isEligibleAmbassadorSale({ stage: "REGISTRATION", isDuplicate: true, referralAttributed: true })).toBe(false);
    expect(isEligibleAmbassadorSale({ stage: "REGISTRATION", isDuplicate: false, referralAttributed: false })).toBe(false);
  });
});

describe("Ambassador OS incentives and payouts", () => {
  it("calculates complete verified-area blocks and rejects values below one block", () => {
    expect(calculateIncentiveAmount({
      calculationType: "PER_SQ_FT_BLOCK", amount: 100000, blockSizeSqFt: 1000, verifiedAreaSqFt: 1250,
    })).toBe(100000);
    expect(calculateIncentiveAmount({
      calculationType: "PER_SQ_FT_BLOCK", amount: 100000, blockSizeSqFt: 1000, verifiedAreaSqFt: 900,
    })).toBeNull();
  });

  it("validates fixed and percentage policies", () => {
    expect(calculateIncentiveAmount({
      calculationType: "FIXED", amount: 5000, blockSizeSqFt: 1000, verifiedAreaSqFt: 1250,
    })).toBe(5000);
    expect(calculateIncentiveAmount({
      calculationType: "PERCENT_OF_VALUE", amount: 2, blockSizeSqFt: 1000, verifiedAreaSqFt: 1250, bookingValue: 10000000,
    })).toBe(200000);
    expect(calculateIncentiveAmount({
      calculationType: "PERCENT_OF_VALUE", amount: 150, blockSizeSqFt: 1000, verifiedAreaSqFt: 1250, bookingValue: 10000000,
    })).toBeNull();
    expect(calculateIncentiveAmount({
      calculationType: "PERCENT_OF_VALUE", amount: 2, blockSizeSqFt: 1000, verifiedAreaSqFt: 1250,
    })).toBeNull();
  });

  it("allows only forward payout transitions and requires explicit terminal states", () => {
    expect(canTransitionIncentiveStatus("PENDING", "APPROVED")).toBe(true);
    expect(canTransitionIncentiveStatus("APPROVED", "PAYABLE")).toBe(true);
    expect(canTransitionIncentiveStatus("PAYABLE", "PAID")).toBe(true);
    expect(canTransitionIncentiveStatus("PAID", "PENDING")).toBe(false);
    expect(canTransitionIncentiveStatus("CANCELLED", "APPROVED")).toBe(false);
    expect(canTransitionIncentiveStatus("PENDING", "PAID")).toBe(false);
  });
});

describe("Ambassador OS quality scoring", () => {
  it("rewards verified contribution and applies quality penalties", () => {
    expect(computeAmbassadorQualityScore({
      modulesCompleted: 7, approvedTasks: 2, completedSiteVisits: 1, verifiedSales: 1, lostLeads: 1, duplicateLeads: 1,
    })).toBe(52);
    expect(computeAmbassadorQualityScore({
      modulesCompleted: 0, approvedTasks: 0, completedSiteVisits: 0, verifiedSales: 0, lostLeads: 10, duplicateLeads: 10,
    })).toBe(0);
  });
});


describe("Ambassador OS operational status safety", () => {
  it("does not reactivate a suspended or exited account through a training review", () => {
    expect(statusAfterTrainingReview({ currentStatus: "SUSPENDED", allTrainingComplete: true, reviewedDayComplete: true })).toBe("SUSPENDED");
    expect(statusAfterTrainingReview({ currentStatus: "EXITED", allTrainingComplete: true, reviewedDayComplete: true })).toBe("EXITED");
    expect(statusAfterTrainingReview({ currentStatus: "ACTIVE", allTrainingComplete: true, reviewedDayComplete: true })).toBe("ACTIVE");
    expect(statusAfterTrainingReview({ currentStatus: "TEMPORARILY_INACTIVE", allTrainingComplete: true, reviewedDayComplete: true })).toBe("TEMPORARILY_INACTIVE");
  });

  it("certifies a normally progressing profile only after the final day is complete", () => {
    expect(statusAfterTrainingReview({ currentStatus: "TRAINING_IN_PROGRESS", allTrainingComplete: true, reviewedDayComplete: true })).toBe("CERTIFIED");
    expect(statusAfterTrainingReview({ currentStatus: "ASSESSMENT_PENDING", allTrainingComplete: false, reviewedDayComplete: true })).toBe("TRAINING_IN_PROGRESS");
    expect(statusAfterTrainingReview({ currentStatus: "TRAINING_IN_PROGRESS", allTrainingComplete: false, reviewedDayComplete: false })).toBe("ASSESSMENT_PENDING");
  });
});


describe("Ambassador OS full curriculum gate", () => {
  it("requires all seven individually approved days, not only Day 7", () => {
    const completed = [1,2,3,4,5,6,7].map((day) => ({ day, status: "COMPLETED" }));
    expect(hasCompleteSevenDayCurriculum(completed)).toBe(true);
    expect(hasCompleteSevenDayCurriculum(completed.filter((item) => item.day !== 4))).toBe(false);
    expect(hasCompleteSevenDayCurriculum(completed.map((item) => item.day === 3 ? { ...item, status: "RETAKE_REQUIRED" } : item))).toBe(false);
    expect(hasCompleteSevenDayCurriculum([{ day: 7, status: "COMPLETED" }])).toBe(false);
  });
});


describe("Ambassador OS PDF-weighted scorecard", () => {
  it("uses the seven PDF weights totalling 100 percent", () => {
    expect(DEFAULT_AMBASSADOR_SCORECARD_WEIGHTS).toEqual({
      genuineLeadQuality: 25, customerCommunication: 20, siteVisitContribution: 15,
      verifiedSalesContribution: 15, crmDiscipline: 10, trainingSkillDevelopment: 10, ethicsCompliance: 5,
    });
    expect(areValidScorecardWeights(DEFAULT_AMBASSADOR_SCORECARD_WEIGHTS)).toBe(true);
  });

  it("rejects weights that do not total exactly 100 percent", () => {
    expect(areValidScorecardWeights({ ...DEFAULT_AMBASSADOR_SCORECARD_WEIGHTS, ethicsCompliance: 7 })).toBe(false);
    expect(areValidScorecardWeights({ ...DEFAULT_AMBASSADOR_SCORECARD_WEIGHTS, genuineLeadQuality: -1 })).toBe(false);
  });

  it("calculates a transparent weighted score and disqualifies serious misconduct", () => {
    const weights = DEFAULT_AMBASSADOR_SCORECARD_WEIGHTS;
    const perfect = {
      genuineLeadQuality: 100, customerCommunication: 100, siteVisitContribution: 100,
      verifiedSalesContribution: 100, crmDiscipline: 100, trainingSkillDevelopment: 100, ethicsCompliance: 100,
    };
    expect(calculateWeightedPerformanceScore({ scores: perfect, weights, seriousMisconduct: false }))
      .toEqual({ score: 100, eligibleForLeaderboard: true });
    expect(calculateWeightedPerformanceScore({ scores: perfect, weights, seriousMisconduct: true }))
      .toEqual({ score: 0, eligibleForLeaderboard: false });
  });
});

describe("Ambassador OS verification checklists", () => {
  const items = [
    { key: "price_list", label: "Current official price list checked" },
    { key: "inventory", label: "Inventory status confirmed" },
  ];

  it("accepts only a complete set of checklist responses", () => {
    expect(validateVerificationChecklist(items, ["price_list", "inventory"])).toEqual({
      valid: true, missing: [], unknown: [],
    });
  });

  it("reports missing required items and refuses unknown item keys", () => {
    expect(validateVerificationChecklist(items, ["price_list"])).toEqual({
      valid: false, missing: ["Inventory status confirmed"], unknown: [],
    });
    expect(validateVerificationChecklist(items, ["price_list", "forged_key"])).toEqual({
      valid: false, missing: ["Inventory status confirmed"], unknown: ["forged_key"],
    });
  });
});
