import { Router } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";

const router = Router();
const REQUEST_ID_RE = /^[A-Za-z0-9-]{16,64}$/;
const FAILURE_KINDS = new Set(["network", "timeout"] as const);

function safeClientIp(req: Parameters<Parameters<typeof rateLimit>[0]["keyGenerator"]>[0]): string {
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
