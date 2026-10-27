/**
 * Public requirement summaries are a separate, intentionally shorter field.
 * Defensively strip common email/phone patterns; never use the private details
 * field as a noticeboard summary.
 */
export function sanitizePublicRequirementSummary(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const sanitized = value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[contact removed]")
    .replace(/\+?\d[\d ()-]{7,}\d/g, "[contact removed]")
    .trim();
  return sanitized || null;
}
