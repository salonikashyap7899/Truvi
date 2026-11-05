/**
 * Mirrors server/src/lib/approvalEvidence.ts.
 * 90 days is an internal review freshness rule, not a statutory RERA period.
 */
export const APPROVAL_RECHECK_WINDOW_DAYS = 90;

export interface ApprovalEvidenceInput {
  approvalAuthority?: string | null;
  reraStatus?: string | null;
  reraNumber?: string | null;
  reraValidityDate?: Date | string | null;
  verificationDetails?: {
    reraVerified?: boolean | null;
    approvalVerified?: boolean | null;
    reraExemptionVerified?: boolean | null;
    reraExemptionBasis?: string | null;
    verificationSource?: string | null;
    lastVerifiedAt?: Date | string | null;
  } | null;
}

export function isApprovalEvidenceVerified(
  project: ApprovalEvidenceInput,
  now: Date = new Date(),
): boolean {
  const details = project.verificationDetails;
  if (!details?.verificationSource?.trim() || !details.lastVerifiedAt) return false;

  const checkedAt = details.lastVerifiedAt instanceof Date
    ? details.lastVerifiedAt
    : new Date(details.lastVerifiedAt);
  if (!Number.isFinite(checkedAt.getTime()) || checkedAt.getTime() > now.getTime()) return false;
  if (now.getTime() - checkedAt.getTime() > APPROVAL_RECHECK_WINDOW_DAYS * 24 * 60 * 60 * 1000) return false;

  if (project.reraValidityDate) {
    const validUntil = project.reraValidityDate instanceof Date
      ? project.reraValidityDate
      : new Date(project.reraValidityDate);
    if (!Number.isFinite(validUntil.getTime()) || validUntil.getTime() < now.getTime()) return false;
  }

  const authority = project.approvalAuthority ?? "RERA";
  const hasReference = Boolean(project.reraNumber?.trim());
  const exemptionReviewed =
    details.reraExemptionVerified === true && Boolean(details.reraExemptionBasis?.trim());

  if (authority === "RERA") {
    if (project.reraStatus === "REGISTERED") return hasReference && details.reraVerified === true;
    return project.reraStatus === "NOT_REGISTERED" && exemptionReviewed;
  }

  return hasReference && details.approvalVerified === true && exemptionReviewed;
}
