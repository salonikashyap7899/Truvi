import crypto from "crypto";

const HASH_PREFIX = "hmac-sha256:";

/**
 * OTPs have only one million possible six-digit values, so a plain hash can be
 * brute-forced after a database leak. HMAC makes verification codes useless
 * without a server-held secret. Production already requires JWT_REFRESH_SECRET;
 * OTP_HASH_SECRET can be set separately when independent key rotation is desired.
 */
function otpHashKey(): string {
  return process.env.OTP_HASH_SECRET?.trim()
    || process.env.JWT_REFRESH_SECRET?.trim()
    || process.env.JWT_ACCESS_SECRET?.trim()
    || "truvi-local-otp-test-key";
}

/** Value persisted to the database; the raw OTP is still sent to the user. */
export function hashOtpForStorage(otp: string): string {
  const digest = crypto
    .createHmac("sha256", otpHashKey())
    .update(`truvi-otp:${otp}`, "utf8")
    .digest("hex");
  return `${HASH_PREFIX}${digest}`;
}

/**
 * Compare a supplied OTP with its stored value. During rollout, accept the
 * existing plaintext format only for still-live legacy codes; every newly
 * issued code is stored as HMAC. This avoids invalidating codes users already
 * received during the brief deployment transition.
 */
export function verifyStoredOtp(suppliedOtp: string, storedValue: string | null | undefined): boolean {
  if (!storedValue) return false;

  if (!storedValue.startsWith(HASH_PREFIX)) {
    return storedValue === suppliedOtp;
  }

  const storedHex = storedValue.slice(HASH_PREFIX.length);
  if (!/^[0-9a-f]{64}$/i.test(storedHex)) return false;
  const expected = Buffer.from(hashOtpForStorage(suppliedOtp).slice(HASH_PREFIX.length), "hex");
  const stored = Buffer.from(storedHex, "hex");
  return expected.length === stored.length && crypto.timingSafeEqual(expected, stored);
}
