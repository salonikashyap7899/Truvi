/**
 * Project fields that only the owning developer and admins may see. The
 * developer's sales contact and the internal employee submitter ID are never
 * sent to buyers, partners or anonymous visitors — contact is routed through Truvi.
 */
export function withoutPrivateProjectFields<
  T extends { salesContact?: unknown; submittedById?: unknown },
>(
  project: T,
  viewer?: { userId: string; role: string } | null,
  ownerId?: string | null,
): Omit<T, "salesContact" | "submittedById"> & Partial<Pick<T, "salesContact" | "submittedById">> {
  if (viewer && (viewer.role === "ADMIN" || (ownerId && String(ownerId) === viewer.userId))) return project;
  const { salesContact: _hiddenSalesContact, submittedById: _hiddenSubmitter, ...rest } = project;
  return rest;
}
