import "dotenv/config";
import * as Sentry from "@sentry/node";

const dsn = process.env.SENTRY_DSN?.trim();

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
        event.request.url = event.request.url.split("?")[0].split("#")[0];
      }
    }
    delete event.user;
    return event;
  },
});

if (!dsn && process.env.NODE_ENV === "production") {
  console.warn("[monitoring] SENTRY_DSN is not configured; external error reporting is disabled.");
}
