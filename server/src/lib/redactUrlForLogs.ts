const SENSITIVE_QUERY_PARAM = /(?:token|sig|signature|secret|password|otp|code|api[_-]?key|^state$)/i;

/**
 * Remove credentials and short-lived signed-link values from URLs before they
 * reach access logs. Request handling still receives the original URL; this
 * helper is only for log formatting.
 */
export function redactUrlForLogs(rawUrl: string | null | undefined): string {
  if (!rawUrl) return "-";

  try {
    const isAbsolute = /^[a-z][a-z\d+.-]*:\/\//i.test(rawUrl);
    const parsed = new URL(rawUrl, "http://redact.invalid");
    const params = new URLSearchParams();

    for (const [key, value] of parsed.searchParams.entries()) {
      params.append(key, SENSITIVE_QUERY_PARAM.test(key) ? "[REDACTED]" : value);
    }

    const query = params.toString();
    return `${isAbsolute ? parsed.origin : ""}${parsed.pathname}${query ? `?${query}` : ""}`;
  } catch {
    // If parsing fails, prefer hiding the whole query over logging a secret.
    const queryStart = rawUrl.indexOf("?");
    return queryStart < 0 ? rawUrl : `${rawUrl.slice(0, queryStart)}?[REDACTED]`;
  }
}
