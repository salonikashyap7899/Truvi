import { describe, expect, it } from "vitest";
import { withGst } from "./pricing";

describe("withGst", () => {
  it("does not add tax when the approved rate is zero", () => {
    expect(withGst(10_000, 0)).toBe(10_000);
  });

  it("adds the configured rate using integer paise arithmetic", () => {
    expect(withGst(10_000, 18)).toBe(11_800);
  });

  it("fails closed to zero for a non-finite rate", () => {
    expect(withGst(10_000, Number.NaN)).toBe(10_000);
  });

  it("fails closed for out-of-range rates", () => {
    expect(withGst(10_000, -5)).toBe(10_000);
    expect(withGst(10_000, 150)).toBe(10_000);
  });
});
