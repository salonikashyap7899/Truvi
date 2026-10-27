import { describe, expect, it } from "vitest";
import type { IProject, IPropertyRequirement, IUnit } from "../db/schema";
import { cityPrefixPattern, isPublishedProject, locationMatches, matchingUnits, typeBucket } from "./propertyRequirementMatching";

function requirement(overrides: Partial<IPropertyRequirement> = {}): IPropertyRequirement {
  return {
    _id: "00000000-0000-4000-8000-000000000001",
    submittedById: "00000000-0000-4000-8000-000000000002",
    submittedByRole: "BUYER",
    title: "Plot requirement",
    propertyType: "PLOTTED",
    city: "Lucknow",
    location: "Sultanpur Road",
    minBudget: 2_500_000,
    maxBudget: 4_000_000,
    minAreaSqft: 1_000,
    maxAreaSqft: 1_600,
    purpose: "INVESTMENT",
    timeline: "WITHIN_30_DAYS",
    details: null,
    status: "ACTIVE",
    createdAt: new Date("2026-10-01T00:00:00Z"),
    updatedAt: new Date("2026-10-01T00:00:00Z"),
    ...overrides,
  } as IPropertyRequirement;
}

function project(overrides: Partial<IProject> = {}): IProject {
  return {
    _id: "00000000-0000-4000-8000-000000000003",
    developerId: "00000000-0000-4000-8000-000000000004",
    name: "Test Residential Plots",
    description: "Test fixture",
    city: "Lucknow",
    location: "Sultanpur Road, Lucknow",
    projectType: "PLOTTED",
    approvalStatus: "APPROVED",
    availabilityStatus: "AVAILABLE",
    createdAt: new Date("2026-10-01T00:00:00Z"),
    ...overrides,
  } as IProject;
}

function unit(price: number, areaSqft: number, type = "PLOTTED", status = "AVAILABLE"): IUnit {
  return {
    _id: `unit-${price}-${areaSqft}`,
    projectId: "00000000-0000-4000-8000-000000000003",
    unitNumber: `P-${price}`,
    type,
    areaSqft,
    price,
    status,
  } as unknown as IUnit;
}

describe("property requirement matching", () => {
  it("uses a safe, escaped city prefix for indexed candidate queries", () => {
    expect(cityPrefixPattern("Lucknow, Uttar Pradesh")).toBe("lucknow%");
    expect(cityPrefixPattern("New York")).toBe("new york%");
    expect(cityPrefixPattern("A_% City")).toBe("a\\_\\% city%");
    expect(cityPrefixPattern(" , State")).toBeNull();
  });

  it("matches city and locality without case sensitivity", () => {
    expect(locationMatches(requirement(), project())).toBe(true);
  });

  it("rejects a nearby-looking locality that is only a partial word match", () => {
    expect(locationMatches(
      requirement({ city: "Noida", location: "Sector 5" }),
      project({ city: "Noida", location: "Sector 50, Noida" }),
    )).toBe(false);
  });

  it("rejects a project in another city", () => {
    expect(locationMatches(requirement(), project({ city: "Delhi", location: "Sultanpur Road" }))).toBe(false);
  });

  it("matches city names with an optional state suffix but does not use unsafe substrings", () => {
    expect(locationMatches(requirement(), project({ city: "Lucknow, Uttar Pradesh" }))).toBe(true);
    expect(locationMatches(requirement({ city: "York", location: "York" }), project({ city: "New York", location: "York" }))).toBe(false);
  });

  it("only treats approved and available projects as recommendation-eligible", () => {
    expect(isPublishedProject(project())).toBe(true);
    expect(isPublishedProject(project({ approvalStatus: "PENDING" }))).toBe(false);
    expect(isPublishedProject(project({ approvalStatus: "REJECTED" }))).toBe(false);
    expect(isPublishedProject(project({ availabilityStatus: "SOLD_OUT" }))).toBe(false);
    expect(isPublishedProject(null)).toBe(false);
  });

  it("normalizes common real-estate property type aliases", () => {
    expect(typeBucket("Residential Plot")).toBe("PLOT");
    expect(typeBucket("Land Parcel")).toBe("PLOT");
    expect(typeBucket("Flat / Apartment")).toBe("APARTMENT");
    expect(typeBucket("Commercial Office")).toBe("COMMERCIAL");
    expect(typeBucket("Any property")).toBe("ANY");
  });

  it("only returns available units within the requested budget, type, and size", () => {
    const matches = matchingUnits(requirement(), project(), [
      unit(3_200_000, 1_250, "PLOTTED"),
      unit(4_500_000, 1_250, "PLOTTED"),
      unit(3_000_000, 2_000, "PLOTTED"),
      unit(3_000_000, 1_250, "APARTMENT"),
      unit(3_000_000, 1_250, "PLOTTED", "SOLD"),
    ]);
    expect(matches).toHaveLength(1);
    expect(matches[0].price).toBe(3_200_000);
  });

  it("matches broad residential requirements to plots, apartments and villas", () => {
    const broad = requirement({ propertyType: "RESIDENTIAL", minAreaSqft: null, maxAreaSqft: null });
    const matches = matchingUnits(broad, project({ projectType: "RESIDENTIAL" }), [
      unit(3_000_000, 900, "PLOTTED"),
      unit(3_500_000, 900, "APARTMENT"),
      unit(3_800_000, 900, "VILLA"),
      unit(3_500_000, 900, "COMMERCIAL"),
    ]);
    expect(matches.map((item) => item.type).sort()).toEqual(["APARTMENT", "PLOTTED", "VILLA"]);
  });

  it("supports a broad type preference while still checking location and budget", () => {
    const matches = matchingUnits(
      requirement({ propertyType: "ANY", minAreaSqft: null, maxAreaSqft: null }),
      project({ projectType: null }),
      [unit(3_000_000, 900, "APARTMENT")],
    );
    expect(matches).toHaveLength(1);
  });
});
