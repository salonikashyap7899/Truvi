export type ReviewDecision = "PENDING" | "APPROVED" | "REJECTED";
export type AmbassadorIncentiveStatus = "PENDING" | "APPROVED" | "PAYABLE" | "PAID" | "CANCELLED";
export type IncentiveCalculationType = "FIXED" | "PER_SQ_FT_BLOCK" | "PERCENT_OF_VALUE";

const INCENTIVE_TRANSITIONS: Record<AmbassadorIncentiveStatus, readonly AmbassadorIncentiveStatus[]> = {
  PENDING: ["APPROVED", "CANCELLED"],
  APPROVED: ["PAYABLE", "CANCELLED"],
  PAYABLE: ["PAID", "CANCELLED"],
  PAID: [],
  CANCELLED: [],
};

export function isTrainingDayComplete(
  quizScore: number,
  practicalStatus: ReviewDecision,
  ethicsStatus: ReviewDecision,
): boolean {
  return Number.isFinite(quizScore) && quizScore >= 80 &&
    practicalStatus === "APPROVED" && ethicsStatus === "APPROVED";
}

export function canActivateAmbassador(input: {
  termsAccepted: boolean;
  identityVerified: boolean;
  finalDayComplete: boolean;
}): boolean {
  return input.termsAccepted && input.identityVerified && input.finalDayComplete;
}

export function isEligibleAmbassadorSale(input: {
  stage: string;
  isDuplicate: boolean;
  referralAttributed: boolean;
}): boolean {
  return (input.stage === "REGISTRATION" || input.stage === "COMPLETED") &&
    !input.isDuplicate && input.referralAttributed;
}

export function canTransitionIncentiveStatus(
  current: AmbassadorIncentiveStatus,
  next: AmbassadorIncentiveStatus,
): boolean {
  return INCENTIVE_TRANSITIONS[current].includes(next);
}

export function calculateIncentiveAmount(input: {
  calculationType: IncentiveCalculationType;
  amount: number;
  blockSizeSqFt: number;
  verifiedAreaSqFt: number;
  bookingValue?: number | null;
}): number | null {
  if (!Number.isFinite(input.amount) || input.amount <= 0) return null;
  if (input.calculationType === "FIXED") return input.amount;
  if (input.calculationType === "PER_SQ_FT_BLOCK") {
    if (!Number.isFinite(input.blockSizeSqFt) || input.blockSizeSqFt <= 0 ||
      !Number.isFinite(input.verifiedAreaSqFt) || input.verifiedAreaSqFt <= 0) return null;
    const completeBlocks = Math.floor(input.verifiedAreaSqFt / input.blockSizeSqFt);
    const calculated = completeBlocks * input.amount;
    return Number.isFinite(calculated) && calculated > 0 ? calculated : null;
  }
  if (input.calculationType === "PERCENT_OF_VALUE") {
    if (!Number.isFinite(input.amount) || input.amount > 100 ||
      !Number.isFinite(input.bookingValue) || (input.bookingValue ?? 0) <= 0) return null;
    const calculated = ((input.bookingValue ?? 0) * input.amount) / 100;
    return Number.isFinite(calculated) && calculated > 0 ? calculated : null;
  }
  return null;
}

export function computeAmbassadorQualityScore(input: {
  modulesCompleted: number;
  approvedTasks: number;
  completedSiteVisits: number;
  verifiedSales: number;
  lostLeads: number;
  duplicateLeads: number;
}): number {
  return Math.max(
    0,
    input.modulesCompleted * 2 +
      input.approvedTasks * 5 +
      input.completedSiteVisits * 8 +
      input.verifiedSales * 25 -
      input.lostLeads * 2 -
      input.duplicateLeads * 3,
  );
}


export type AmbassadorOperationalStatus =
  | "REGISTERED" | "VERIFICATION_PENDING" | "TRAINING_IN_PROGRESS"
  | "ASSESSMENT_PENDING" | "CERTIFIED" | "ACTIVE"
  | "TEMPORARILY_INACTIVE" | "SUSPENDED" | "EXITED";

/**
 * Training reviews may change a training-state profile, but must not silently
 * reactivate or demote an operationally active, suspended, exited, or inactive
 * Ambassador. Reactivation remains an explicit Admin action.
 */
export function statusAfterTrainingReview(input: {
  currentStatus: AmbassadorOperationalStatus;
  allTrainingComplete: boolean;
  reviewedDayComplete: boolean;
}): AmbassadorOperationalStatus {
  if (["ACTIVE", "SUSPENDED", "EXITED", "TEMPORARILY_INACTIVE"].includes(input.currentStatus)) {
    return input.currentStatus;
  }
  if (input.allTrainingComplete) return "CERTIFIED";
  if (input.reviewedDayComplete) return "TRAINING_IN_PROGRESS";
  return "ASSESSMENT_PENDING";
}
