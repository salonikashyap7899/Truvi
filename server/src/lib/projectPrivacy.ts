/**
 * Project fields that only the owning developer and admins may see. Sales
 * contact stays private from buyers/partners. The internal employee submitter
 * ID is stricter: it is visible only to Admin, never to developers or visitors.
 */
export function withoutPrivateProjectFields<
  T extends { salesContact?: unknown; submittedById?: unknown },
>(
  project: T,
  viewer?: { userId: string; role: string } | null,
  ownerId?: string | null,
): Omit<T, "salesContact" | "submittedById"> & Partial<Pick<T, "salesContact" | "submittedById">> {
  if (viewer?.role === "ADMIN") return project;

  const { submittedById: _hiddenSubmitter, ...withoutSubmitter } = project;
  if (viewer && ownerId && String(ownerId) === viewer.userId) return withoutSubmitter;

  const { salesContact: _hiddenSalesContact, ...publicProject } = withoutSubmitter;
  return publicProject;
}
