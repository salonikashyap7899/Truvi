export type EmployeeTaskState = "ASSIGNED" | "ACCEPTED" | "IN_PROGRESS" | "ON_HOLD" | "COMPLETED" | "CANCELLED";

export function aggregateAssignedTaskStatus(statuses: readonly EmployeeTaskState[]): EmployeeTaskState {
  if (statuses.length > 0 && statuses.every((status) => status === "COMPLETED")) return "COMPLETED";
  if (statuses.some((status) => ["ACCEPTED", "IN_PROGRESS", "ON_HOLD", "COMPLETED"].includes(status))) return "IN_PROGRESS";
  return "ASSIGNED";
}

export function shouldSendTaskDeadlineReminder(taskStatus: EmployeeTaskState, assigneeStatus?: EmployeeTaskState | null): boolean {
  if (taskStatus === "COMPLETED" || taskStatus === "CANCELLED") return false;
  if (assigneeStatus === "COMPLETED" || assigneeStatus === "CANCELLED") return false;
  return true;
}
