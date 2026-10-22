import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { hashOtpForStorage, verifyStoredOtp } from "./otpHash";

const previousOtpSecret = process.env.OTP_HASH_SECRET;
const previousRefreshSecret = process.env.JWT_REFRESH_SECRET;
const previousAccessSecret = process.env.JWT_ACCESS_SECRET;

describe("OTP hashing at rest", () => {
  beforeEach(() => {
    process.env.OTP_HASH_SECRET = "unit-test-only-otp-hmac-secret";
  });

  afterAll(() => {
    if (previousOtpSecret === undefined) delete process.env.OTP_HASH_SECRET;
    else process.env.OTP_HASH_SECRET = previousOtpSecret;
    if (previousRefreshSecret === undefined) delete process.env.JWT_REFRESH_SECRET;
    else process.env.JWT_REFRESH_SECRET = previousRefreshSecret;
    if (previousAccessSecret === undefined) delete process.env.JWT_ACCESS_SECRET;
    else process.env.JWT_ACCESS_SECRET = previousAccessSecret;
  });

  it("stores an HMAC rather than the raw six-digit code", () => {
    const stored = hashOtpForStorage("123456");
    expect(stored).toMatch(/^hmac-sha256:[0-9a-f]{64}$/);
    expect(stored).not.toContain("123456");
  });

  it("validates the correct OTP and rejects a different OTP", () => {
    const stored = hashOtpForStorage("123456");
    expect(verifyStoredOtp("123456", stored)).toBe(true);
    expect(verifyStoredOtp("654321", stored)).toBe(false);
  });

  it("temporarily supports existing plaintext OTPs so in-flight codes remain valid", () => {
    expect(verifyStoredOtp("123456", "123456")).toBe(true);
    expect(verifyStoredOtp("654321", "123456")).toBe(false);
    expect(verifyStoredOtp("123456", null)).toBe(false);
  });

  it("fails closed for malformed HMAC values", () => {
    expect(verifyStoredOtp("123456", "hmac-sha256:not-a-digest")).toBe(false);
  });
});
