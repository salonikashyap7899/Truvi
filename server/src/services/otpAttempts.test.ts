import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockStore = vi.hoisted(() => {
  const records = new Map<string, { count: number; first: number }>();
  const unsafe = vi.fn(async (query: string, params: unknown[] = []) => {
    const key = String(params[0] ?? "");
    const now = Date.now();
    if (query.trimStart().startsWith("SELECT")) {
      const row = records.get(key);
      return row ? [{ failure_count: row.count, window_started_at: new Date(row.first) }] : [];
    }
    if (query.includes("VALUES ($1, 0, now(), now())")) {
      records.set(key, { count: 0, first: now });
      return [];
    }
    if (query.includes("VALUES ($1, 1, now(), now())")) {
      const row = records.get(key);
      if (!row || now - row.first > 10 * 60 * 1000) {
        records.set(key, { count: 1, first: now });
      } else {
        row.count += 1;
      }
      return [];
    }
    throw new Error("Unexpected OTP attempts SQL in test");
  });
  return { records, unsafe, getSqlClient: vi.fn(() => ({ unsafe })) };
});

vi.mock("../db", () => ({ getSqlClient: mockStore.getSqlClient }));

import { clearOtpAttempts, otpAttemptBlocked, recordOtpFailure } from "./otpAttempts";

const key = "otp-test:account";
const other = "otp-test:other-account";

beforeEach(() => {
  mockStore.records.clear();
  mockStore.unsafe.mockClear();
});

afterEach(async () => {
  await clearOtpAttempts(key);
  await clearOtpAttempts(other);
});

describe("persistent OTP attempt lockout", () => {
  it("blocks after five failures for the same identity", async () => {
    for (let i = 0; i < 4; i += 1) {
      await recordOtpFailure(key);
      expect(await otpAttemptBlocked(key)).toBe(false);
    }
    await recordOtpFailure(key);
    expect(await otpAttemptBlocked(key)).toBe(true);
  });

  it("allows a newly issued code after clearing the prior code's lockout", async () => {
    for (let i = 0; i < 5; i += 1) await recordOtpFailure(key);
    expect(await otpAttemptBlocked(key)).toBe(true);

    await clearOtpAttempts(key);
    expect(await otpAttemptBlocked(key)).toBe(false);

    await recordOtpFailure(key);
    expect(await otpAttemptBlocked(key)).toBe(false);
  });

  it("does not let clearing one identity affect another identity", async () => {
    for (let i = 0; i < 5; i += 1) await recordOtpFailure(other);
    await clearOtpAttempts(key);
    expect(await otpAttemptBlocked(other)).toBe(true);
  });

  it("automatically starts a fresh window after ten minutes", async () => {
    mockStore.records.set(key, { count: 5, first: Date.now() - 11 * 60 * 1000 });
    expect(await otpAttemptBlocked(key)).toBe(false);
    await recordOtpFailure(key);
    expect(await otpAttemptBlocked(key)).toBe(false);
  });

  it("uses PostgreSQL upserts so each failure is recorded atomically", async () => {
    await recordOtpFailure(key);
    const statement = String(mockStore.unsafe.mock.calls[0]?.[0] ?? "");
    expect(statement).toContain("ON CONFLICT (identity_key) DO UPDATE");
    expect(statement).toContain("failure_count + 1");
  });
});
