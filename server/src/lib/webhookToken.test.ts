import { describe, expect, it } from "vitest";
import { isWebhookTokenValid } from "./webhookToken";

describe("isWebhookTokenValid", () => {
  it("accepts only the exact configured token", () => {
    expect(isWebhookTokenValid("a-long-random-shared-secret", "a-long-random-shared-secret")).toBe(true);
    expect(isWebhookTokenValid("different-secret", "a-long-random-shared-secret")).toBe(false);
  });

  it("fails closed for missing configuration, absent tokens, and non-string tokens", () => {
    expect(isWebhookTokenValid("anything", "")).toBe(false);
    expect(isWebhookTokenValid(undefined, "configured-secret")).toBe(false);
    expect(isWebhookTokenValid(["configured-secret"], "configured-secret")).toBe(false);
    expect(isWebhookTokenValid("", "configured-secret")).toBe(false);
  });
});
