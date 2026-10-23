export type EmployeeLeadResource = {
  submittedById: string | null;
  assignedToId: string | null;
};

/** Employee permissions are explicit allow-list entries. Missing/empty lists deny access. */
export function hasEmployeePermission(permissions: string[] | null | undefined, permission: string): boolean {
  return Array.isArray(permissions) && permissions.includes(permission);
}

/** Apply both permission scope and record ownership; knowing an ID alone never grants access. */
export function canAccessEmployeeLead(
  permissions: string[] | null | undefined,
  lead: EmployeeLeadResource,
  userId: string,
  ownPermission: string,
  assignedPermission: string,
): boolean {
  const submittedByCurrentUser = String(lead.submittedById ?? "") === userId;
  const assignedToCurrentUser = String(lead.assignedToId ?? "") === userId;
  return (submittedByCurrentUser && hasEmployeePermission(permissions, ownPermission)) ||
    (assignedToCurrentUser && hasEmployeePermission(permissions, assignedPermission));
}
