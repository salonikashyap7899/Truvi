import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

const mocks = vi.hoisted(() => {
  const unsafe = vi.fn(async (_query: string, _params: unknown[] = []) => []);
  return {
    getDb: vi.fn(),
    issueSession: vi.fn(),
    getSqlClient: vi.fn(() => ({ unsafe })),
  };
});

vi.mock("../config/db", () => ({ getDb: mocks.getDb }));
vi.mock("../db", () => ({ getSqlClient: mocks.getSqlClient }));
vi.mock("../services/authService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/authService")>();
  return { ...actual, issueSession: mocks.issueSession };
});

import { verifyAccount } from "./authController";

describe("verifyAccount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not establish a session for an account that is already verified", async () => {
    const verifiedUser = {
      _id: "76da0eb3-4ed2-4e43-86de-ab0b5ba8ad07",
      email: "verified@example.com",
      emailVerified: true,
      phoneVerified: true,
      password: "stored-password-hash",
      approvalStatus: "APPROVED",
      disabled: false,
    };

    mocks.getDb.mockReturnValue({
      select: () => ({
        from: () => ({
          where: async () => [verifiedUser],
        }),
      }),
    });

    const res = {
      status: vi.fn(),
      json: vi.fn(),
    };
    res.status.mockReturnValue(res);

    await verifyAccount(
      {
        body: {
          email: "verified@example.com",
          emailOtp: "000000",
          phoneOtp: "000000",
        },
      } as Request,
      res as unknown as Response,
    );

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      error: "This account is already verified. Please sign in with your password.",
      code: "ACCOUNT_ALREADY_VERIFIED",
    });
    expect(mocks.issueSession).not.toHaveBeenCalled();
  });
});
