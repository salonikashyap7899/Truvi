import "dotenv/config";
import * as Sentry from "@sentry/node";

const dsn = process.env.SENTRY_DSN?.trim();

function scrubErrorText(value: string): string {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\+?\d[\d\s().-]{7,}\d/g, "[phone]")
    .replace(/([?&](?:token|password|otp|secret|key|code)=)[^&#\s]*/gi, "$1[redacted]")
    .replace(/\/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, "/[id]");
}

Sentry.init({
  dsn: dsn || undefined,
  enabled: Boolean(dsn),
  environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || "production",
  tracesSampleRate: 0,
  beforeSend(event) {
    if (event.request) {
      // Never ship request bodies, cookies, bearer tokens, or query-string
      // secrets to an external error-monitoring provider.
      delete event.request.data;
      delete event.request.cookies;
      if (event.request.headers) {
        for (const key of Object.keys(event.request.headers)) {
          if (/authorization|cookie|token|secret|password|api.?key/i.test(key)) {
            delete event.request.headers[key];
          }
        }
      }
      if (typeof event.request.url === "string") {
        event.request.url = scrubErrorText(event.request.url.split("?")[0].split("#")[0]);
      }
    }
    for (const exception of event.exception?.values ?? []) {
      if (typeof exception.value === "string") exception.value = scrubErrorText(exception.value);
    }
    if (typeof event.message === "string") event.message = scrubErrorText(event.message);
    if (event.logentry?.message) event.logentry.message = scrubErrorText(event.logentry.message);
    // Breadcrumb messages can include arbitrary console output and form values.
    delete event.breadcrumbs;
    delete event.user;
    return event;
  },
});

if (!dsn && process.env.NODE_ENV === "production") {
  console.warn("[monitoring] SENTRY_DSN is not configured; external error reporting is disabled.");
}
