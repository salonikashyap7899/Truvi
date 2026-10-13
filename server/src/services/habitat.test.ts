import { describe, expect, it } from "vitest";
import { canTransitionHabitatBooking, habitatEstimatePaise, isHabitatAreaCovered } from "./habitat";

describe("Habitat booking lifecycle", () => {
  it("lets only the assigned provider accept and progress a booking", () => {
    expect(canTransitionHabitatBooking("PROVIDER", "PROVIDER_ASSIGNED", "ACCEPTED")).toBe(true);
    expect(canTransitionHabitatBooking("PROVIDER", "ACCEPTED", "IN_PROGRESS")).toBe(true);
    expect(canTransitionHabitatBooking("BUYER", "PROVIDER_ASSIGNED", "ACCEPTED")).toBe(false);
    expect(canTransitionHabitatBooking("PROVIDER", "REQUESTED", "IN_PROGRESS")).toBe(false);
  });

  it("requires buyer confirmation after a provider submits completion", () => {
    expect(canTransitionHabitatBooking("PROVIDER", "IN_PROGRESS", "COMPLETION_SUBMITTED")).toBe(true);
    expect(canTransitionHabitatBooking("PROVIDER", "COMPLETION_SUBMITTED", "COMPLETED")).toBe(false);
    expect(canTransitionHabitatBooking("BUYER", "COMPLETION_SUBMITTED", "COMPLETED")).toBe(true);
    expect(canTransitionHabitatBooking("BUYER", "COMPLETED", "CANCELLED")).toBe(false);
  });

  it("keeps estimates in paise and does not invent a quote price", () => {
    expect(habitatEstimatePaise("FIXED", 125_050)).toBe(125_050);
    expect(habitatEstimatePaise("STARTING_PRICE", 99_900)).toBe(99_900);
    expect(habitatEstimatePaise("QUOTE", null)).toBeNull();
    expect(() => habitatEstimatePaise("FIXED", 10.5)).toThrow();
    expect(() => habitatEstimatePaise("QUOTE", 100)).toThrow();
  });

  it("matches provider coverage to the buyer's city or locality", () => {
    expect(isHabitatAreaCovered(["Gomti Nagar, Lucknow"], "Lucknow", "Gomti Nagar")).toBe(true);
    expect(isHabitatAreaCovered(["Kanpur"], "Lucknow")).toBe(false);
  });
});
