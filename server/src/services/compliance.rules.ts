export type GrievanceStatus = "SUBMITTED" | "ACKNOWLEDGED" | "IN_PROGRESS" | "WAITING_FOR_USER" | "RESOLVED" | "CLOSED";
export type PrivacyRequestStatus = "SUBMITTED" | "UNDER_REVIEW" | "WAITING_FOR_USER" | "APPROVED" | "REJECTED" | "COMPLETED";

const grievanceTransitions: Record<GrievanceStatus, readonly GrievanceStatus[]> = {
  SUBMITTED: ["ACKNOWLEDGED", "IN_PROGRESS", "CLOSED"],
  ACKNOWLEDGED: ["IN_PROGRESS", "WAITING_FOR_USER", "RESOLVED", "CLOSED"],
  IN_PROGRESS: ["WAITING_FOR_USER", "RESOLVED", "CLOSED"],
  WAITING_FOR_USER: ["IN_PROGRESS", "RESOLVED", "CLOSED"],
  RESOLVED: ["IN_PROGRESS", "CLOSED"],
  CLOSED: [],
};

const privacyTransitions: Record<PrivacyRequestStatus, readonly PrivacyRequestStatus[]> = {
  SUBMITTED: ["UNDER_REVIEW", "WAITING_FOR_USER", "APPROVED", "REJECTED"],
  UNDER_REVIEW: ["WAITING_FOR_USER", "APPROVED", "REJECTED"],
  WAITING_FOR_USER: ["UNDER_REVIEW", "APPROVED", "REJECTED"],
  APPROVED: ["COMPLETED"],
  REJECTED: [],
  COMPLETED: [],
};

export function canTransitionGrievance(from: GrievanceStatus, to: GrievanceStatus): boolean {
  return from === to || grievanceTransitions[from]?.includes(to) === true;
}

export function canTransitionPrivacyRequest(from: PrivacyRequestStatus, to: PrivacyRequestStatus): boolean {
  return from === to || privacyTransitions[from]?.includes(to) === true;
}
