import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertFounderPasswordsConfigured,
  ensureDefaultFounder,
  founderDefaults,
  FounderProvisioningConfigError,
} from "./bootstrapFounder";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("founderDefaults", () => {
  it("does not provide a built-in password when founder secrets are missing", () => {
    vi.stubEnv("FOUNDER1_PASSWORD", "");
    vi.stubEnv("FOUNDER2_PASSWORD", "");
    vi.stubEnv("FOUNDER_PASSWORD", "");

    const { founders } = founderDefaults();

    expect(founders.map((founder) => founder.password)).toEqual(["", ""]);
    expect(() => assertFounderPasswordsConfigured(founders)).toThrow(FounderProvisioningConfigError);
  });

  it("does not block database startup when new founder accounts have no passwords configured", async () => {
    vi.stubEnv("FOUNDER1_PASSWORD", "");
    vi.stubEnv("FOUNDER2_PASSWORD", "");
    vi.stubEnv("FOUNDER_PASSWORD", "");

    const limit = vi.fn().mockResolvedValue([]);
    const where = vi.fn(() => ({ limit }));
    const from = vi.fn(() => ({ where }));
    const select = vi.fn(() => ({ from }));
    const values = vi.fn().mockResolvedValue(undefined);
    const insert = vi.fn(() => ({ values }));
    const db = { select, insert } as unknown as Parameters<typeof ensureDefaultFounder>[0];
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(ensureDefaultFounder(db)).resolves.toBeUndefined();

    expect(select).toHaveBeenCalledTimes(2);
    expect(insert).not.toHaveBeenCalled();
    expect(warning).toHaveBeenCalledWith(expect.stringContaining("Database startup will continue."));
  });

  it("prefers individual founder secrets and supports the shared fallback", () => {
    vi.stubEnv("FOUNDER1_PASSWORD", "unique-founder-one-secret");
    vi.stubEnv("FOUNDER2_PASSWORD", "");
    vi.stubEnv("FOUNDER_PASSWORD", "shared-founder-secret");

    const { founders } = founderDefaults();

    expect(founders.map((founder) => founder.password)).toEqual([
      "unique-founder-one-secret",
      "shared-founder-secret",
    ]);
    expect(() => assertFounderPasswordsConfigured(founders)).not.toThrow();
  });
});
