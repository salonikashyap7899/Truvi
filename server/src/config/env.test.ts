import { afterEach, describe, expect, it } from "vitest";
import { getEnv } from "./env";

const keys = ["GST_REGISTERED", "GST_PERCENT", "GSTIN"] as const;
const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]])) as Record<(typeof keys)[number], string | undefined>;

afterEach(() => {
  for (const key of keys) {
    const value = saved[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("GST configuration", () => {
  it("fails closed when registration is not explicitly enabled, even with a legacy rate", () => {
    delete process.env.GST_REGISTERED;
    process.env.GST_PERCENT = "18";
    process.env.GSTIN = "09ABCDE1234F1Z5";

    expect(getEnv().gstPercent).toBe(0);
  });

  it("uses the configured rate only when registration, GSTIN and rate are present", () => {
    process.env.GST_REGISTERED = "true";
    process.env.GST_PERCENT = "18";
    process.env.GSTIN = "09ABCDE1234F1Z5";

    expect(getEnv().gstPercent).toBe(18);
  });

  it("fails closed when GSTIN is missing or malformed", () => {
    process.env.GST_REGISTERED = "true";
    process.env.GST_PERCENT = "18";
    process.env.GSTIN = "not-a-gstin";

    expect(getEnv().gstPercent).toBe(0);
  });

  it("fails closed for an invalid configured percentage", () => {
    process.env.GST_REGISTERED = "true";
    process.env.GST_PERCENT = "not-a-number";
    process.env.GSTIN = "09ABCDE1234F1Z5";

    expect(getEnv().gstPercent).toBe(0);
  });
});
