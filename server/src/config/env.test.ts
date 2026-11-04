import { afterEach, describe, expect, it } from "vitest";
import { getEnv } from "./env";

const saved = {
  GST_COLLECTION_ENABLED: process.env.GST_COLLECTION_ENABLED,
  GST_PERCENT: process.env.GST_PERCENT,
  GSTIN: process.env.GSTIN,
};

afterEach(() => {
  for (const key of Object.keys(saved) as Array<keyof typeof saved>) {
    const value = saved[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("GST collection configuration", () => {
  it("does not collect GST by default, even if an old GST_PERCENT is present", () => {
    delete process.env.GST_COLLECTION_ENABLED;
    process.env.GST_PERCENT = "18";
    process.env.GSTIN = "09ABCDE1234F1Z5";

    expect(getEnv().gstPercent).toBe(0);
    expect(getEnv().gstCollectionEnabled).toBe(false);
    expect(getEnv().gstin).toBe("");
  });

  it("enables tax only with explicit enablement, a valid GSTIN and a positive rate", () => {
    process.env.GST_COLLECTION_ENABLED = "true";
    process.env.GST_PERCENT = "18";
    process.env.GSTIN = "09ABCDE1234F1Z5";

    expect(getEnv().gstPercent).toBe(18);
    expect(getEnv().gstCollectionEnabled).toBe(true);
    expect(getEnv().gstin).toBe("09ABCDE1234F1Z5");
  });

  it("fails closed when the enabled tax configuration has no valid GSTIN", () => {
    process.env.GST_COLLECTION_ENABLED = "true";
    process.env.GST_PERCENT = "18";
    process.env.GSTIN = "not-a-gstin";

    expect(getEnv().gstPercent).toBe(0);
    expect(getEnv().gstCollectionEnabled).toBe(false);
  });
});
