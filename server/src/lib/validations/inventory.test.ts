import { describe, expect, it } from "vitest";
import { createUnitSchema } from "./inventory";

const validUnit = {
  projectId: "project-1",
  unitNumber: "A-101",
  type: "Residential Plot",
  areaSqft: 1800,
  price: 5500000,
};

describe("createUnitSchema plot size", () => {
  it("allows a unit when plot size is omitted", () => {
    const result = createUnitSchema.safeParse(validUnit);
    expect(result.success).toBe(true);
  });

  it("treats a blank plot size as omitted", () => {
    const result = createUnitSchema.safeParse({ ...validUnit, plotSize: "   " });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.plotSize).toBeUndefined();
  });

  it("accepts plot size when provided", () => {
    const result = createUnitSchema.safeParse({ ...validUnit, plotSize: "30x40 ft" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.plotSize).toBe("30x40 ft");
  });

  it("still rejects plot sizes longer than 60 characters", () => {
    const result = createUnitSchema.safeParse({ ...validUnit, plotSize: "x".repeat(61) });
    expect(result.success).toBe(false);
  });
});
