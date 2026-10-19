import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertFounderPasswordsConfigured,
  founderDefaults,
  FounderProvisioningConfigError,
} from "./bootstrapFounder";

afterEach(() => {
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
