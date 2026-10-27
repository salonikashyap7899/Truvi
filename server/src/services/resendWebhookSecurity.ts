import { createHmac, timingSafeEqual } from "node:crypto";

export interface ResendWebhookHeaders {
  id?: string;
  timestamp?: string;
  signature?: string;
}

/**
 * Verify Resend/Svix webhook signatures against the exact raw request bytes.
 * Secrets must be the whsec_ value shown by Resend; the timestamp limit blocks
 * stale replay attempts. No payload parsing should happen before this check.
 */
export function verifyResendWebhookSignature(
  rawBody: Buffer,
  headers: ResendWebhookHeaders,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  if (!Buffer.isBuffer(rawBody) || !secret.startsWith("whsec_")) return false;
  const id = headers.id?.trim();
  const timestamp = headers.timestamp?.trim();
  const signatureHeader = headers.signature?.trim();
  if (!id || !timestamp || !signatureHeader) return false;

  const timestampSeconds = Number(timestamp);
  if (!Number.isSafeInteger(timestampSeconds) || Math.abs(nowSeconds - timestampSeconds) > 300) return false;

  const key = Buffer.from(secret.slice("whsec_".length), "base64");
  if (key.length === 0) return false;
  const expected = createHmac("sha256", key)
    .update(id)
    .update(".")
    .update(timestamp)
    .update(".")
    .update(rawBody)
    .digest();

  const supplied = [...signatureHeader.matchAll(/(?:^|\s)v1,\s*([A-Za-z0-9+/=]+)/g)].map((match) => match[1]);
  return supplied.some((value) => {
    try {
      const candidate = Buffer.from(value, "base64");
      return candidate.length === expected.length && timingSafeEqual(candidate, expected);
    } catch {
      return false;
    }
  });
}
