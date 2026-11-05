/**
 * CP identity (KYC) verification.
 *
 * Today KYC submissions are reviewed manually by an authorised Truvi
 * administrator. The application does not authenticate Aadhaar with UIDAI or
 * query government identity databases. Do not add full Aadhaar-number capture
 * or document processing without a documented legal basis and specialist review.
 */

const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

/** PAN is 5 letters + 4 digits + 1 letter, e.g. ABCDE1234F. */
export function isValidPan(pan: string): boolean {
  return PAN_REGEX.test((pan || "").trim().toUpperCase());
}

/** Mask a PAN for storage/display: ABCDE1234F → ABXXXX34F. */
export function maskPan(pan: string): string {
  const p = (pan || "").trim().toUpperCase();
  if (p.length !== 10) return "XXXXXXXXXX";
  return `${p.slice(0, 2)}XXXX${p.slice(6)}`;
}

export type KycOutcome = "APPROVED" | "REJECTED" | "MANUAL_REVIEW";

/**
 * Manual-review hook. A document upload is not proof of identity. Until a
 * reviewed identity provider is configured and approved for this purpose,
 * every submission remains pending for an authorised human reviewer.
 */
export async function runProviderKyc(_input: {
  panNumber: string;
  aadhaarDocumentUrl: string;
  panDocumentUrl: string;
  selfieUrl: string;
}): Promise<{ outcome: KycOutcome; provider: string; reason?: string }> {
  // No identity-provider integration is configured. Never describe this
  // manual flow as Aadhaar/UIDAI authentication or automated identity proof.
  return { outcome: "MANUAL_REVIEW", provider: "none" };
}
