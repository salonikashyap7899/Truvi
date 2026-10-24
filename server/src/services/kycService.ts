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


/**
 * Hosted automated KYC using IDfy Profile Gateway. Truvi must receive the
 * API key, account ID and a provider-configured workflow ID from IDfy before
 * this can be enabled. The workflow must perform the required document,
 * identity and liveness checks and return an explicit approved/rejected
 * decision; document upload or a syntactically valid number is never approval.
 */
export function isHostedKycConfigured(role?: string): boolean {
  const workflowId = role
    ? process.env[`IDFY_KYC_WORKFLOW_ID_${role.toUpperCase()}`]?.trim() || process.env.IDFY_KYC_WORKFLOW_ID?.trim()
    : process.env.IDFY_KYC_WORKFLOW_ID?.trim() ||
      ["BUYER", "CP", "DEVELOPER", "AMBASSADOR"].some((r) => Boolean(process.env[`IDFY_KYC_WORKFLOW_ID_${r}`]?.trim()));
  return Boolean(
    process.env.IDFY_KYC_API_KEY?.trim() &&
    process.env.IDFY_KYC_ACCOUNT_ID?.trim() &&
    workflowId
  );
}

export interface HostedKycSession {
  profileId: string;
  referenceId: string;
  captureLink: string;
}

export interface HostedKycProfileStatus {
  profileId: string;
  referenceId: string;
  status: string;
  reviewerAction: string;
  statusDetail?: string;
}

function idfyHeaders(): Record<string, string> {
  const apiKey = process.env.IDFY_KYC_API_KEY?.trim();
  const accountId = process.env.IDFY_KYC_ACCOUNT_ID?.trim();
  if (!apiKey || !accountId) {
    throw new Error("Hosted KYC provider is not configured");
  }
  return {
    "Content-Type": "application/json",
    "api-key": apiKey,
    "account-id": accountId,
  };
}

async function idfyRequest(path: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const headers = new Headers(idfyHeaders());
  if (init?.headers) {
    new Headers(init.headers).forEach((value, key) => headers.set(key, value));
  }
  const response = await fetch(`https://api.kyc.idfy.com${path}`, {
    ...init,
    headers,
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    // Do not log provider response bodies; they may include identity data.
    throw new Error(`KYC provider request failed (HTTP ${response.status})`);
  }
  const payload: unknown = await response.json();
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("KYC provider returned an invalid response");
  }
  return payload as Record<string, unknown>;
}

function safeCaptureLink(value: unknown): string {
  if (typeof value !== "string") throw new Error("KYC provider did not return a capture link");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("KYC provider returned an invalid capture link");
  }
  if (
    url.protocol !== "https:" ||
    !["capture.kyc.idfy.com", "capture.idfy.com"].includes(url.hostname.toLowerCase())
  ) {
    throw new Error("KYC provider returned an untrusted capture link");
  }
  return url.toString();
}

/** Create a hosted KYC journey; the customer completes capture with IDfy. */
export async function createHostedKycSession(referenceId: string, role: string): Promise<HostedKycSession> {
  const workflowId =
    process.env[`IDFY_KYC_WORKFLOW_ID_${role.toUpperCase()}"]?.trim() ||
    process.env.IDFY_KYC_WORKFLOW_ID?.trim();
  if (!workflowId) throw new Error("Hosted KYC provider is not configured");
  const payload = await idfyRequest("/sync/profiles", {
    method: "POST",
    body: JSON.stringify({
      reference_id: referenceId,
      config: { id: workflowId },
      data: {},
    }),
  });
  const profileId = typeof payload.profile_id === "string" ? payload.profile_id : "";
  const returnedReference = typeof payload.reference_id === "string" ? payload.reference_id : referenceId;
  if (!profileId) throw new Error("KYC provider did not return a profile ID");
  return {
    profileId,
    referenceId: returnedReference,
    captureLink: safeCaptureLink(payload.capture_link),
  };
}

/** Resume an unfinished provider journey without creating a duplicate profile. */
export async function getHostedKycCaptureLink(profileId: string): Promise<string> {
  if (!/^[0-9a-f-]{36}$/i.test(profileId)) throw new Error("Invalid KYC provider profile ID");
  const payload = await idfyRequest(`/profiles/${encodeURIComponent(profileId)}/capture`);
  return safeCaptureLink(payload.capture_link);
}

/** Retrieve only the decision fields needed by Truvi; never return raw provider data. */
export async function getHostedKycProfileStatus(profileId: string): Promise<HostedKycProfileStatus> {
  if (!/^[0-9a-f-]{36}$/i.test(profileId)) throw new Error("Invalid KYC provider profile ID");
  const payload = await idfyRequest(`/profiles/${encodeURIComponent(profileId)}?status_only=true`);
  return {
    profileId,
    referenceId: typeof payload.reference_id === "string" ? payload.reference_id : "",
    status: typeof payload.status === "string" ? payload.status.toLowerCase() : "",
    reviewerAction: typeof payload.reviewer_action === "string" ? payload.reviewer_action.toLowerCase() : "",
    statusDetail: typeof payload.status_detail === "string" ? payload.status_detail.slice(0, 300) : undefined,
  };
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
