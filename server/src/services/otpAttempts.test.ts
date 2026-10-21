import { afterEach, describe, expect, it } from "vitest";
import { clearOtpAttempts, otpAttemptBlocked, recordOtpFailure } from "./otpAttempts";

const key = "otp-test:account";

afterEach(() => {
  clearOtpAttempts(key);
});

describe("OTP attempt lockout", () => {
  it("blocks after five failures for the same identity", () => {
    for (let i = 0; i < 4; i += 1) {
      recordOtpFailure(key);
      expect(otpAttemptBlocked(key)).toBe(false);
    }
    recordOtpFailure(key);
    expect(otpAttemptBlocked(key)).toBe(true);
  });

  it("allows a newly issued code after clearing the prior code's lockout", () => {
    for (let i = 0; i < 5; i += 1) recordOtpFailure(key);
    expect(otpAttemptBlocked(key)).toBe(true);

    clearOtpAttempts(key);
    expect(otpAttemptBlocked(key)).toBe(false);

    recordOtpFailure(key);
    expect(otpAttemptBlocked(key)).toBe(false);
  });

  it("does not let clearing one identity affect another identity", () => {
    const other = "otp-test:other-account";
    for (let i = 0; i < 5; i += 1) recordOtpFailure(other);
    clearOtpAttempts(key);
    expect(otpAttemptBlocked(other)).toBe(true);
    clearOtpAttempts(other);
  });
});
