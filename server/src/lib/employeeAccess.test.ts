import { describe, expect, it } from "vitest";
import { canAccessEmployeeLead, hasEmployeePermission } from "./employeeAccess";

describe("employee permission checks", () => {
  const ownLead = { submittedById: "employee-a", assignedToId: "employee-a" };
  const otherLead = { submittedById: "employee-b", assignedToId: "employee-c" };

  it("denies by default when permission data is missing", () => {
    expect(hasEmployeePermission(undefined, "lead.read.own")).toBe(false);
    expect(canAccessEmployeeLead(undefined, ownLead, "employee-a", "lead.read.own", "lead.read.assigned")).toBe(false);
  });

  it("permits a submitted lead only when own-lead access is explicitly granted", () => {
    expect(canAccessEmployeeLead(["lead.read.own"], ownLead, "employee-a", "lead.read.own", "lead.read.assigned")).toBe(true);
    expect(canAccessEmployeeLead(["lead.read.assigned"], ownLead, "employee-a", "lead.read.own", "lead.read.assigned")).toBe(true);
    expect(canAccessEmployeeLead([], ownLead, "employee-a", "lead.read.own", "lead.read.assigned")).toBe(false);
  });

  it("does not disclose another employee's lead even when its ID is known", () => {
    expect(canAccessEmployeeLead(["lead.read.own", "lead.read.assigned"], otherLead, "employee-a", "lead.read.own", "lead.read.assigned")).toBe(false);
  });

  it("respects separate own and assigned permissions", () => {
    expect(canAccessEmployeeLead(["lead.read.assigned"], otherLead, "employee-c", "lead.read.own", "lead.read.assigned")).toBe(true);
    expect(canAccessEmployeeLead(["lead.read.own"], otherLead, "employee-c", "lead.read.own", "lead.read.assigned")).toBe(false);
  });

  it("requires the matching action permission as well as ownership", () => {
    expect(canAccessEmployeeLead(["lead.read.own"], ownLead, "employee-a", "lead.update.own", "lead.update.assigned")).toBe(false);
    expect(canAccessEmployeeLead(["lead.update.own"], ownLead, "employee-a", "lead.update.own", "lead.update.assigned")).toBe(true);
  });
});
