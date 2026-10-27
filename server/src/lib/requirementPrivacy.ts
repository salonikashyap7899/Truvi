/**
 * Public requirement summaries are a separate, intentionally shorter field.
 * Strip common contact patterns and any known private client values before
 * returning user-authored text to other users on the noticeboard.
 */
export function sanitizePublicRequirementSummary(
  value: string | null | undefined,
  privateValues: Array<string | null | undefined> = [],
): string | null {
  if (!value?.trim()) return null;
  let sanitized = value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}/gi, "[contact removed]")
    .replace(/\\+?\\d[\\d ()-]{7,}\\d/g, "[contact removed]");

  for (const privateValue of privateValues) {
    const sensitive = privateValue?.trim();
    // Avoid redacting extremely short values (e.g. "A") that would erase normal
    // words throughout a summary. The value is escaped before creating a regex.
    if (!sensitive || sensitive.length < 3) continue;
    const escaped = sensitive.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&");
    sanitized = sanitized.replace(new RegExp(escaped, "gi"), "[private detail removed]");
  }

  return sanitized.trim() || null;
}
