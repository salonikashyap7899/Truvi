import { describe, expect, it } from "vitest";
import { sanitizeUserForClient } from "./sanitizeUser";

describe("sanitizeUserForClient", () => {
  it("removes password hashes and verification codes from the returned user", () => {
    const safeUser = sanitizeUserForClient({
      _id: "user-1",
      name: "Test User",
      role: "BUYER",
      password: "bcrypt-hash",
      verification: {
        emailOtp: "123456",
        phoneOtp: "234567",
        resetPasswordOtp: "345678",
      },
    });

    expect(safeUser).toEqual({ _id: "user-1", name: "Test User", role: "BUYER" });
    expect(safeUser).not.toHaveProperty("password");
    expect(safeUser).not.toHaveProperty("verification");
  });
});
