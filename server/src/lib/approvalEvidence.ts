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

/** Return actionable reasons the public approval badge is not yet supported. */
export function getApprovalVerificationIssues(
  project: ApprovalEvidenceInput,
  now: Date = new Date(),
): string[] {
  const issues: string[] = [];
  const details = project.verificationDetails;
  if (!details?.verificationSource?.trim()) {
    issues.push("Add the official verification source (register, issuing authority, URL, or document reference).");
  }

  if (!details?.lastVerifiedAt) {
    issues.push("Record when the official source was reviewed.");
  } else {
    const checkedAt = details.lastVerifiedAt instanceof Date
      ? details.lastVerifiedAt
      : new Date(details.lastVerifiedAt);
    if (!Number.isFinite(checkedAt.getTime())) {
      issues.push("The verification review date is invalid; record it again.");
    } else if (checkedAt.getTime() > now.getTime()) {
      issues.push("The verification review date cannot be in the future.");
    } else if (now.getTime() - checkedAt.getTime() > APPROVAL_RECHECK_WINDOW_DAYS * 24 * 60 * 60 * 1000) {
      issues.push(`Refresh the verification review; it must be within the ${APPROVAL_RECHECK_WINDOW_DAYS}-day review window.`);
    }
  }

  if (project.reraValidityDate) {
    const validUntil = project.reraValidityDate instanceof Date
      ? project.reraValidityDate
      : new Date(project.reraValidityDate);
    if (!Number.isFinite(validUntil.getTime())) {
      issues.push("The recorded approval validity date is invalid; correct it before verification.");
    } else if (validUntil.getTime() < now.getTime()) {
      issues.push("The recorded approval has expired; update its validity evidence before verification.");
    }
  }

  const authority = project.approvalAuthority ?? "RERA";
  const hasReference = Boolean(project.reraNumber?.trim());
  const exemptionReviewed =
    details?.reraExemptionVerified === true && Boolean(details.reraExemptionBasis?.trim());

  if (authority === "RERA") {
    if (project.reraStatus === "REGISTERED") {
      if (!hasReference) issues.push("Add the RERA registration number.");
      if (details?.reraVerified !== true) issues.push("Check the exact project phase and number against the official RERA register.");
      return issues;
    }
    if (project.reraStatus === "NOT_REGISTERED") {
      if (!exemptionReviewed) issues.push("Review RERA applicability and record the supporting exemption or non-applicability evidence and basis.");
      return issues;
    }
    issues.push("Set the RERA status to Registered or Not Registered after review; Pending or unrecorded status cannot be verified.");
    return issues;
  }

  // A non-RERA planning approval is not a RERA registration. Both the
  // authority's approval reference and the project's RERA applicability /
  // exemption assessment must be independently reviewed.
  if (!hasReference) issues.push("Add the approval reference issued by the project's applicable authority.");
  if (details?.approvalVerified !== true) issues.push("Check the approval document against the issuing authority.");
  if (!exemptionReviewed) issues.push("Review RERA applicability and record the supporting exemption or non-applicability evidence and basis.");
  return issues;
}

export function isApprovalEvidenceVerified(
  project: ApprovalEvidenceInput,
  now: Date = new Date(),
): boolean {
  return getApprovalVerificationIssues(project, now).length === 0;
}
