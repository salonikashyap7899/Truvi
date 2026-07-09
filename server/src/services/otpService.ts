import crypto from "crypto";
import { sendOtpEmail, isEmailConfigured } from "./emailService";
import { sendSms, isSmsConfigured } from "./smsService";

/**
 * OTP generation, hashing and delivery — shared by the phone and email
 * verification endpoints.
 *
 * Security notes:
 *  - Codes are never stored in plaintext. We keep only a salted SHA-256 hash
 *    (salt = JWT_ACCESS_SECRET, already required in prod) and compare hashes
 *    with a constant-time check.
 *  - A resend cooldown and a max-attempts cap are enforced by the caller
 *    using the timestamps/counters this module defines.
 */

export const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
export const OTP_RESEND_COOLDOWN_MS = 60 * 1000; // 1 minute between sends
export const OTP_MAX_ATTEMPTS = 5;

export type OtpChannel = "phone" | "email";

export function generateCode(): string {
  // crypto.randomInt is unbiased, unlike Math.random-based generation.
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function hashCode(code: string): string {
  const salt = process.env.JWT_ACCESS_SECRET || "truvi-otp-fallback-salt";
  return crypto.createHmac("sha256", salt).update(code).digest("hex");
}

/** Constant-time comparison of a submitted code against a stored hash. */
export function verifyCode(submitted: string, storedHash: string): boolean {
  const a = Buffer.from(hashCode(submitted), "hex");
  const b = Buffer.from(storedHash, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Deliver a code over the given channel. Resolves on success; rejects if a
 * configured provider errors. In dev (no provider configured) it logs and
 * resolves, so the flow is testable end-to-end locally.
 */
export async function deliverOtp(channel: OtpChannel, destination: string, code: string): Promise<void> {
  if (channel === "phone") {
    await sendSms(destination, `Your Truvi verification code is ${code}. It expires in 10 minutes.`);
  } else {
    await sendOtpEmail(destination, code);
  }
}

/** Whether real delivery is configured for a channel (false = dev/console mode). */
export function isChannelLive(channel: OtpChannel): boolean {
  return channel === "phone" ? isSmsConfigured() : isEmailConfigured();
}
