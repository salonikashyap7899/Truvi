import { describe, expect, it } from "vitest";
import jwt from "jsonwebtoken";
import { signAccessToken, isExpiredAccessToken, signRefreshToken, verifyRefreshToken, refreshAuthVersionMatches } from "./jwt";

// Mirror jwt.ts's secret resolution so we can mint a deliberately-expired token.
const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "dev-access-secret-change-me";
const payload = { userId: "u_1", role: "ADMIN" as const, approvalStatus: "APPROVED" as const };

describe("isExpiredAccessToken", () => {
  it("is false for a fresh, validly-signed token", () => {
    expect(isExpiredAccessToken(signAccessToken(payload))).toBe(false);
  });

  it("is true for a correctly-signed token that has expired", () => {
    const expired = jwt.sign(payload, ACCESS_SECRET, { expiresIn: -10 });
    expect(isExpiredAccessToken(expired)).toBe(true);
  });

  it("is false for a forged token (wrong signing secret), even if unexpired", () => {
    const forged = jwt.sign(payload, "not-the-real-secret", { expiresIn: "15m" });
    expect(isExpiredAccessToken(forged)).toBe(false);
  });

  it("is false for garbage that isn't a JWT at all", () => {
    expect(isExpiredAccessToken("not.a.jwt")).toBe(false);
  });
});


describe("refresh token auth versions", () => {
  it("round-trips the auth version in newly issued refresh tokens", () => {
    const token = signRefreshToken({ userId: "user-1", authVersion: 3 });
    const claims = verifyRefreshToken(token);
    expect(claims.userId).toBe("user-1");
    expect(claims.authVersion).toBe(3);
  });

  it("accepts legacy tokens only while the account is at version zero", () => {
    expect(refreshAuthVersionMatches(undefined, 0)).toBe(true);
    expect(refreshAuthVersionMatches(undefined, 1)).toBe(false);
    expect(refreshAuthVersionMatches(2, 2)).toBe(true);
    expect(refreshAuthVersionMatches(2, 3)).toBe(false);
  });
});
