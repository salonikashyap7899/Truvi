import { describe, expect, it } from "vitest";
import { aggregateAssignedTaskStatus, shouldSendTaskDeadlineReminder, type EmployeeTaskState } from "./employeeTaskRules";

describe("multi-assignee task lifecycle", () => {
  it("keeps a new group task assigned until someone starts", () => {
    expect(aggregateAssignedTaskStatus(["ASSIGNED", "ASSIGNED"])).toBe("ASSIGNED");
  });

  it("keeps a shared task open until every active assignee completes it", () => {
    expect(aggregateAssignedTaskStatus(["COMPLETED", "IN_PROGRESS"])).toBe("IN_PROGRESS");
    expect(aggregateAssignedTaskStatus(["COMPLETED", "ASSIGNED"])).toBe("IN_PROGRESS");
    expect(aggregateAssignedTaskStatus(["COMPLETED", "COMPLETED"])).toBe("COMPLETED");
  });

  it("does not remind completed or cancelled tasks or assignee rows", () => {
    expect(shouldSendTaskDeadlineReminder("COMPLETED")).toBe(false);
    expect(shouldSendTaskDeadlineReminder("CANCELLED", "ASSIGNED")).toBe(false);
    expect(shouldSendTaskDeadlineReminder("IN_PROGRESS", "COMPLETED")).toBe(false);
    expect(shouldSendTaskDeadlineReminder("IN_PROGRESS", "CANCELLED")).toBe(false);
  });

  it("reminds assignees who still have open work", () => {
    const statuses: EmployeeTaskState[] = ["ASSIGNED", "ACCEPTED", "IN_PROGRESS", "ON_HOLD"];
    expect(statuses.every((status) => shouldSendTaskDeadlineReminder("IN_PROGRESS", status))).toBe(true);
  });
});
