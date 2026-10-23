import { describe, expect, it } from "vitest";
import { dateRangesOverlap, inclusiveCalendarDays, isValidIsoDate } from "./employeeLeaveRules";

describe("employee leave date rules", () => {
  it("validates real ISO calendar dates including leap days", () => {
    expect(isValidIsoDate("2028-02-29")).toBe(true);
    expect(isValidIsoDate("2026-10-23")).toBe(true);
    expect(isValidIsoDate("2027-02-29")).toBe(false);
    expect(isValidIsoDate("2026-02-30")).toBe(false);
    expect(isValidIsoDate("2026-2-03")).toBe(false);
    expect(isValidIsoDate("")).toBe(false);
  });

  it("counts both first and last leave dates", () => {
    expect(inclusiveCalendarDays("2026-10-23", "2026-10-23")).toBe(1);
    expect(inclusiveCalendarDays("2026-10-23", "2026-10-25")).toBe(3);
    expect(inclusiveCalendarDays("2028-02-28", "2028-03-01")).toBe(3);
  });

  it("treats touching calendar days as overlaps", () => {
    expect(dateRangesOverlap("2026-10-23", "2026-10-25", "2026-10-25", "2026-10-28")).toBe(true);
    expect(dateRangesOverlap("2026-10-23", "2026-10-24", "2026-10-25", "2026-10-28")).toBe(false);
  });
});
