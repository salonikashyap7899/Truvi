import crypto from "crypto";

/**
 * Compare a received shared webhook token without a timing-sensitive string
 * comparison. Missing server configuration always fails closed.
 */
export function isWebhookTokenValid(supplied: unknown, expected: string): boolean {
  if (!expected || typeof supplied !== "string" || !supplied) return false;
  const suppliedBytes = Buffer.from(supplied, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");
  return suppliedBytes.length === expectedBytes.length &&
    crypto.timingSafeEqual(suppliedBytes, expectedBytes);
}
