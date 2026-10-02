/**
 * CP identity (KYC) verification.
 *
 * Today this does structural validation only (PAN format, Aadhaar Verhoeff
 * checksum) and hands the decision to a human admin — see `runProviderKyc`.
 * When a licensed KYC provider (Signzy / IDfy / HyperVerge / Digio / Cashfree
 * etc.) is available, implement the provider call inside `runProviderKyc` and
 * it will drive the APPROVED/REJECTED status automatically instead of
 * MANUAL_REVIEW. Nothing else needs to change.
 */

const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

/** PAN is 5 letters + 4 digits + 1 letter, e.g. ABCDE1234F. */
export function isValidPan(pan: string): boolean {
  return PAN_REGEX.test((pan || "").trim().toUpperCase());
}

// Verhoeff checksum tables — the algorithm UIDAI uses for the 12-digit Aadhaar.
const D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

/** 12 digits with a valid Verhoeff checksum (catches typos & obvious fakes). */
export function isValidAadhaar(aadhaar: string): boolean {
  const digits = (aadhaar || "").replace(/\s/g, "");
  if (!/^\d{12}$/.test(digits)) return false;
  let c = 0;
  const reversed = digits.split("").reverse().map(Number);
  reversed.forEach((n, i) => {
    c = D[c][P[i % 8][n]];
  });
  return c === 0;
}

/** Mask a PAN for storage/display: ABCDE1234F → ABXXXX34F. */
export function maskPan(pan: string): string {
  const p = (pan || "").trim().toUpperCase();
  if (p.length !== 10) return "XXXXXXXXXX";
  return `${p.slice(0, 2)}XXXX${p.slice(6)}`;
}

export type KycOutcome = "APPROVED" | "REJECTED" | "MANUAL_REVIEW";

/**
 * Provider hook. Returns the automated decision for a submission. With no
 * provider wired up it always defers to a human ("MANUAL_REVIEW"), so the
 * admin review flow is the source of truth. Structural validity is checked by
 * the caller before this runs.
 */
export async function runProviderKyc(_input: {
  aadhaarNumber: string;
  panNumber: string;
  aadhaarDocumentUrl: string;
  panDocumentUrl: string;
  selfieUrl: string;
}): Promise<{ outcome: KycOutcome; provider: string; reason?: string }> {
  // TODO(provider): call the licensed KYC/identity API here — Aadhaar/PAN
  // government-DB validation + selfie liveness/face-match — and map its result
  // to APPROVED / REJECTED. Until then, defer to manual admin review.
  return { outcome: "MANUAL_REVIEW", provider: "none" };
}
