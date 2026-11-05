/**
 * Evidence gate for public "checked by Truvi" project approval claims.
 *
 * A developer-submitted reference alone is never verification. A recorded
 * source and reviewer date are required, and the check is treated as stale
 * after 90 days. This is an internal freshness policy, not a statutory RERA
 * validity period. If an issuing authority supplies an expiry date, an
 * expired record is not treated as current.
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

  const ageMs = now.getTime() - checkedAt.getTime();
  if (ageMs > APPROVAL_RECHECK_WINDOW_DAYS * 24 * 60 * 60 * 1000) return false;

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
    if (project.reraStatus === "REGISTERED") {
      return hasReference && details.reraVerified === true;
    }
    return project.reraStatus === "NOT_REGISTERED" && exemptionReviewed;
  }

  // A non-RERA planning approval is not a RERA registration. Both the
  // authority's approval reference and the project's RERA applicability /
  // exemption assessment must be independently reviewed.
  return hasReference && details.approvalVerified === true && exemptionReviewed;
}
