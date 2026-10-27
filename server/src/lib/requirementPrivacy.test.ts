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

  it("removes a known private client name even if it was copied into a public summary", () => {
    const result = sanitizePublicRequirementSummary(
      "John Smith is looking for a residential plot near the main road",
      ["John Smith", "+91 98765 43210", "john@example.com"],
    );
    expect(result).not.toContain("John Smith");
    expect(result).toContain("[private detail removed]");
  });

  it("escapes special regex characters in private values", () => {
    const result = sanitizePublicRequirementSummary("Need a plot for A+B Realty", ["A+B Realty"]);
    expect(result).toBe("Need a plot for [private detail removed]");
  });

  it("keeps safe descriptive details intact", () => {
    expect(sanitizePublicRequirementSummary("Preferably close to the main road near schools"))
      .toBe("Preferably close to the main road near schools");
  });
});
