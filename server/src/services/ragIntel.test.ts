import { describe, expect, it } from "vitest";
import { isUndefinedRagTableError } from "./ragIntel";

describe("optional RAG table errors", () => {
  it("recognizes PostgreSQL undefined_table errors", () => {
    expect(isUndefinedRagTableError({ code: "42P01", message: 'relation "satellite_gis" does not exist' })).toBe(true);
  });

  it("recognizes an undefined_table error wrapped in a cause", () => {
    expect(isUndefinedRagTableError({
      message: "Database query failed",
      cause: { code: "42P01", message: 'relation "community_intelligence" does not exist' },
    })).toBe(true);
  });

  it("does not suppress unrelated database failures", () => {
    expect(isUndefinedRagTableError({ code: "08006", message: "connection failure" })).toBe(false);
    expect(isUndefinedRagTableError(new Error("unexpected failure"))).toBe(false);
    expect(isUndefinedRagTableError(null)).toBe(false);
  });
});
