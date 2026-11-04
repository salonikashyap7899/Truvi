type BrowserErrorKind = "window_error" | "unhandled_rejection" | "react_boundary";

function scrub(value: string, maxLength: number): string {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}/gi, "[email]")
    .replace(/\\+?\\d[\\d\\s().-]{7,}\\d/g, "[phone]")
    .replace(/([?&](?:token|password|otp|secret|key|code)=)[^&#\\s]*/gi, "$1[redacted]")
    .replace(/\\/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, "/[id]")
    .slice(0, maxLength);
}

/** Best-effort, PII-minimised browser diagnostics. Never blocks the UI. */
export function reportClientError(
  error: unknown,
  kind: BrowserErrorKind = "window_error",
): void {
  if (!import.meta.env.PROD || typeof window === "undefined") return;

  const value = error instanceof Error
    ? error
    : new Error(typeof error === "string" ? error : "An unhandled browser error occurred");

  const baseUrl = (import.meta.env.VITE_API_URL || window.location.origin).replace(/\\/$/, "");
  const payload = {
    kind,
    name: scrub(value.name || "Error", 80),
    message: scrub(value.message || "Unknown browser error", 300),
    stack: value.stack ? scrub(value.stack, 4_000) : undefined,
    page: scrub(window.location.pathname, 200),
  };

  void fetch(`${baseUrl}/api/telemetry/frontend-error`, {
    method: "POST",
    mode: "cors",
    credentials: "omit",
    keepalive: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).catch(() => {
    // Error reporting must never create another visible app error.
  });
}
