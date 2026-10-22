import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

const { getDbMock } = vi.hoisted(() => ({ getDbMock: vi.fn() }));
vi.mock("../config/db", () => ({ getDb: getDbMock }));

import { verifyAccount } from "./authController";

describe("verifyAccount public endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("never issues a session for an account that is already verified", async () => {
    const email = `verified-${Date.now()}@example.com`;
    const verifiedUser = {
      _id: "00000000-0000-4000-8000-000000000001",
      email,
      emailVerified: true,
      phoneVerified: true,
      disabled: true,
      approvalStatus: "PENDING",
    };
    const where = vi.fn().mockResolvedValue([verifiedUser]);
    const from = vi.fn().mockReturnValue({ where });
    const select = vi.fn().mockReturnValue({ from });
    getDbMock.mockReturnValue({ select });

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      cookie: vi.fn().mockReturnThis(),
      clearCookie: vi.fn().mockReturnThis(),
    } as unknown as Response;

    await verifyAccount({
      body: { email, emailOtp: "000000", phoneOtp: "000000" },
    } as Request, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      code: "ACCOUNT_ALREADY_VERIFIED",
    }));
    expect(res.cookie).not.toHaveBeenCalled();
  });
});
