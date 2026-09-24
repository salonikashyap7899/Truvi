import type { ZodError } from "zod";

/**
 * Turn a Zod validation error into a single, human-readable message using the
 * schema's own field messages (e.g. "Password must be at least 8 characters",
 * "Add at least one uppercase letter", "Enter a valid email") instead of a
 * generic "Validation failed". This is what forms show the user, so it should
 * read like advice, not a stack trace.
 *
 * When a field has no custom message (Zod's built-in "Required" / "Invalid
 * input" etc.), we prefix a readable version of the field name so the user
 * still knows which field to fix.
 */
export function zodMessage(err: ZodError): string {
  const issue = err.issues?.[0];
  if (!issue) return "Please check the details you entered and try again.";

  const msg = (issue.message || "").trim();
  const rawField = issue.path?.find((p) => typeof p === "string");
  const field = typeof rawField === "string" ? rawField : "";

  // Zod's default messages aren't friendly — detect them and fall back to a
  // field-labelled message instead.
  const looksGeneric =
    !msg ||
    /^required$/i.test(msg) ||
    /^invalid input$/i.test(msg) ||
    /^invalid$/i.test(msg) ||
    /^string must contain/i.test(msg) ||
    /^expected /i.test(msg) ||
    /^number must /i.test(msg);

  if (looksGeneric && field) {
    const label = field
      .replace(/([A-Z])/g, " $1")
      .replace(/[_-]+/g, " ")
      .replace(/^./, (c) => c.toUpperCase())
      .trim();
    return `Please enter a valid ${label.toLowerCase()}.`;
  }

  return msg || "Please check the details you entered and try again.";
}
