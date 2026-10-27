import { describe, expect, it } from "vitest";
import { sanitizePublicRequirementSummary } from "./requirementPrivacy";

describe("sanitizePublicRequirementSummary", () => {
  it("returns null for empty summaries", () => {
    expect(sanitizePublicRequirementSummary(null)).toBeNull();
    expect(sanitizePublicRequirementSummary("   ")).toBeNull();
  });

  it("removes email addresses and phone-like contact numbers", () => {
    const result = sanitizePublicRequirementSummary("Near main road. Call +91 98765 43210 or email buyer@example.com");
    expect(result).toContain("[contact removed]");
    expect(result).not.toContain("98765 43210");
    expect(result).not.toContain("buyer@example.com");
  });

  it("keeps safe descriptive details intact", () => {
    expect(sanitizePublicRequirementSummary("Preferably close to the main road near schools"))
      .toBe("Preferably close to the main road near schools");
  });
});
