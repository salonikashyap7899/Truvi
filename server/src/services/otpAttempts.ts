import { getSqlClient } from "../db";

/**
 * Persistent per-identity OTP guessing protection.
 *
 * Backed by PostgreSQL rather than a process-local Map so the limit survives
 * PM2 restarts and is shared by multiple API workers. The table is created
 * additively by the server's existing idempotent boot-time schema reconciler.
 * Rows are updated/reset in place; no user, OTP or business records are deleted.
 */
const OTP_MAX_ATTEMPTS = 5;
const OTP_ATTEMPT_WINDOW_MS = 10 * 60 * 1000;

interface OtpAttemptRecord {
  failure_count: number | string;
  window_started_at: Date | string;
}

async function findAttemptRecord(key: string): Promise<OtpAttemptRecord | null> {
  const rows = await getSqlClient().unsafe(
    "SELECT failure_count, window_started_at FROM otp_attempts WHERE identity_key = $1 LIMIT 1",
    [key],
  ) as unknown as OtpAttemptRecord[];
  return rows[0] ?? null;
}

function isWindowExpired(record: OtpAttemptRecord, now = Date.now()): boolean {
  const startedAt = new Date(record.window_started_at).getTime();
  return !Number.isFinite(startedAt) || now - startedAt > OTP_ATTEMPT_WINDOW_MS;
}

/** Returns true after five failures in the current ten-minute window. */
export async function otpAttemptBlocked(key: string): Promise<boolean> {
  const record = await findAttemptRecord(key);
  if (!record || isWindowExpired(record)) return false;
  return Number(record.failure_count) >= OTP_MAX_ATTEMPTS;
}

/**
 * Atomically records a failure. Concurrent requests cannot overwrite each
 * other's counters; the first failure after expiry starts a fresh window.
 */
export async function recordOtpFailure(key: string): Promise<void> {
  await getSqlClient().unsafe(
    `INSERT INTO otp_attempts (identity_key, failure_count, window_started_at, updated_at)
     VALUES ($1, 1, now(), now())
     ON CONFLICT (identity_key) DO UPDATE SET
       failure_count = CASE
         WHEN otp_attempts.window_started_at < now() - INTERVAL '10 minutes' THEN 1
         ELSE otp_attempts.failure_count + 1
       END,
       window_started_at = CASE
         WHEN otp_attempts.window_started_at < now() - INTERVAL '10 minutes' THEN now()
         ELSE otp_attempts.window_started_at
       END,
       updated_at = now()`,
    [key],
  );
}

/** Clear the counter when a new OTP is issued or a code is accepted. */
export async function clearOtpAttempts(key: string): Promise<void> {
  await getSqlClient().unsafe(
    `INSERT INTO otp_attempts (identity_key, failure_count, window_started_at, updated_at)
     VALUES ($1, 0, now(), now())
     ON CONFLICT (identity_key) DO UPDATE SET
       failure_count = 0,
       window_started_at = now(),
       updated_at = now()`,
    [key],
  );
}
