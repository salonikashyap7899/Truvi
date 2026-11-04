import { Router, type Request } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { z } from "zod";
import * as Sentry from "@sentry/node";

const router = Router();
const REQUEST_ID_RE = /^[A-Za-z0-9-]{16,64}$/;
const FAILURE_KINDS = new Set(["network", "timeout"] as const);

function safeClientIp(req: Request): string {
  const cfIp = req.headers["cf-connecting-ip"];
  const ip = typeof cfIp === "string" && cfIp.trim() ? cfIp.trim() : req.ip ?? "";
  return ipKeyGenerator(ip);
}

const kycFailureLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 12,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: safeClientIp,
});

function browserCategory(userAgent: string): string {
  if (/CriOS\//i.test(userAgent)) return "Chrome on iOS";
  if (/EdgA?\//i.test(userAgent)) return "Edge on mobile";
  if (/Android/i.test(userAgent) && /Chrome\//i.test(userAgent)) return "Chrome on Android";
  if (/iPhone|iPad|iPod/i.test(userAgent) && /Safari\//i.test(userAgent)) return "Safari on iOS";
  if (/Chrome\//i.test(userAgent)) return "Chrome";
  if (/Firefox\//i.test(userAgent)) return "Firefox";
  if (/Safari\//i.test(userAgent)) return "Safari";
  return "Other";
}

/**
 * Best-effort client-side KYC connection diagnostics. This route intentionally
 * accepts only a correlation ID, a small enum, and online/offline state. Never
 * send or log identity numbers, files, request bodies, auth headers, cookies,
 * full user-agent strings, or client-provided error messages.
 */

const frontendErrorSchema = z.object({
  kind: z.enum(["window_error", "unhandled_rejection", "react_boundary"]),
  name: z.string().trim().min(1).max(80),
  message: z.string().trim().min(1).max(300),
  stack: z.string().max(4_000).optional(),
  page: z.string().max(200).optional(),
}).strict();

const frontendErrorLimiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: safeClientIp,
});

function scrubClientText(value: string, maxLength: number): string {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}/gi, "[email]")
    .replace(/\\+?\\d[\\d\\s().-]{7,}\\d/g, "[phone]")
    .replace(/([?&](?:token|password|otp|secret|key|code)=)[^&#\\s]*/gi, "$1[redacted]")
    .replace(/\\/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, "/[id]")
    .slice(0, maxLength);
}

/**
 * Browser exceptions are sent as minimal diagnostics only. No access token,
 * cookie, request body, user identity, or raw URL is accepted by this route.
 */
router.post("/frontend-error", frontendErrorLimiter, (req, res) => {
  const parsed = frontendErrorSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid browser error report", requestId: res.locals.requestId });
  }

  const report = {
    kind: parsed.data.kind,
    name: scrubClientText(parsed.data.name, 80),
    message: scrubClientText(parsed.data.message, 300),
    stack: parsed.data.stack ? scrubClientText(parsed.data.stack, 4_000) : undefined,
    page: parsed.data.page ? scrubClientText(parsed.data.page.split("?")[0].split("#")[0], 200) : undefined,
  };
  const error = new Error(report.message);
  error.name = report.name;

  if (process.env.SENTRY_DSN?.trim()) {
    Sentry.withScope((scope) => {
      scope.setTag("error_source", "browser");
      scope.setTag("browser_error_kind", report.kind);
      scope.setExtra("page", report.page);
      scope.setExtra("browser_stack", report.stack);
      Sentry.captureException(error);
    });
  } else {
    // Still provide a sanitised fallback in the VPS logs until Sentry is set.
    console.error(JSON.stringify({ event: "browser_error", ...report }));
  }

  return res.status(202).json({ received: true });
});

router.post("/kyc-failure", kycFailureLimiter, (req, res) => {
  const body = req.body as Record<string, unknown> | undefined;
  const requestId = typeof body?.requestId === "string" ? body.requestId : "";
  const failureKind = typeof body?.failureKind === "string" ? body.failureKind : "";
  const online = typeof body?.online === "boolean" ? body.online : null;

  if (!REQUEST_ID_RE.test(requestId) || !FAILURE_KINDS.has(failureKind as "network" | "timeout")) {
    return res.status(400).json({ error: "Invalid diagnostic report", requestId: res.locals.requestId });
  }

  console.warn(JSON.stringify({
    event: "kyc_client_connection_failure",
    requestId,
    failureKind,
    browser: browserCategory(String(req.headers["user-agent"] || "")),
    browserOnlineFlag: online,
  }));

  return res.status(202).json({ received: true });
});

export default router;
