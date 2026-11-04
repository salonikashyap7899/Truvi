import { describe, expect, it } from "vitest";
import { canTransitionGrievance, canTransitionPrivacyRequest } from "./compliance.rules";

describe("compliance workflow transitions", () => {
  it("allows a grievance to move through acknowledgement and resolution", () => {
    expect(canTransitionGrievance("SUBMITTED", "ACKNOWLEDGED")).toBe(true);
    expect(canTransitionGrievance("ACKNOWLEDGED", "RESOLVED")).toBe(true);
    expect(canTransitionGrievance("CLOSED", "IN_PROGRESS")).toBe(false);
  });

  it("allows privacy requests to be reviewed before completion", () => {
    expect(canTransitionPrivacyRequest("SUBMITTED", "UNDER_REVIEW")).toBe(true);
    expect(canTransitionPrivacyRequest("APPROVED", "COMPLETED")).toBe(true);
    expect(canTransitionPrivacyRequest("SUBMITTED", "COMPLETED")).toBe(false);
    expect(canTransitionPrivacyRequest("COMPLETED", "UNDER_REVIEW")).toBe(false);
  });
});
