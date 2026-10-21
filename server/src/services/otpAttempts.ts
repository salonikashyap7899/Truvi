/**
 * Per-identity OTP guessing protection.
 *
 * Counts reset after the time window and whenever a new OTP is issued. These
 * counters are deliberately separate from IP-based rate limits; they are an
 * additional guard for a single account when requests come from many IPs.
 * This in-memory implementation is intended for the current single-process API.
 */
const OTP_MAX_ATTEMPTS = 5;
const OTP_ATTEMPT_WINDOW_MS = 10 * 60 * 1000;
const otpAttempts = new Map<string, { count: number; first: number }>();

export function otpAttemptBlocked(key: string): boolean {
  const record = otpAttempts.get(key);
  if (!record) return false;
  if (Date.now() - record.first > OTP_ATTEMPT_WINDOW_MS) {
    otpAttempts.delete(key);
    return false;
  }
  return record.count >= OTP_MAX_ATTEMPTS;
}

export function recordOtpFailure(key: string): void {
  const now = Date.now();
  const record = otpAttempts.get(key);
  if (!record || now - record.first > OTP_ATTEMPT_WINDOW_MS) {
    otpAttempts.set(key, { count: 1, first: now });
  } else {
    record.count += 1;
  }
}

/** Clear the counter when a new code is issued or a code is accepted. */
export function clearOtpAttempts(key: string): void {
  otpAttempts.delete(key);
}
