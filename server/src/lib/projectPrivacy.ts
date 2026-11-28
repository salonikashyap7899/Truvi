/**
 * Project fields that only the owning developer and admins may see. Sales
 * contact stays private from buyers/partners. The internal employee submitter
 * ID is stricter: it is visible only to Admin, never to developers or visitors.
 */
type PublicProjectView<T extends { salesContact?: unknown; submittedById?: unknown }> =
  Omit<T, "salesContact" | "submittedById"> & Partial<Pick<T, "salesContact" | "submittedById">>;

export function withoutPrivateProjectFields<
  T extends { salesContact?: unknown; submittedById?: unknown },
>(
  project: T,
  viewer?: { userId: string; role: string } | null,
  ownerId?: string | null,
): PublicProjectView<T> {
  if (viewer?.role === "ADMIN") return project;

  const { submittedById: _hiddenSubmitter, ...withoutSubmitter } = project;
  if (viewer && ownerId && String(ownerId) === viewer.userId) return withoutSubmitter as PublicProjectView<T>;

  const { salesContact: _hiddenSalesContact, ...publicProject } = withoutSubmitter;
  return publicProject as PublicProjectView<T>;
}
