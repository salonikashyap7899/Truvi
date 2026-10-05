/**
 * Project fields that only the owning developer and admins may see. The
 * developer's sales contact (a real phone number and email) is never sent to
 * buyers, partners or anonymous visitors — contact is routed through Truvi.
 */
export function withoutPrivateProjectFields<T extends { salesContact?: unknown }>(
  project: T,
  viewer?: { userId: string; role: string } | null,
  ownerId?: string | null,
): Omit<T, "salesContact"> & { salesContact?: T["salesContact"] } {
  if (viewer && (viewer.role === "ADMIN" || (ownerId && String(ownerId) === viewer.userId))) return project;
  const { salesContact: _hidden, ...rest } = project;
  return rest;
}
