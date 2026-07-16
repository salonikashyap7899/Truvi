import helmet from "helmet";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import type { AuthedRequest } from "./auth";

/**
 * Security headers. `crossOriginResourcePolicy` is relaxed so uploaded assets
 * served from /uploads remain embeddable by the SPA; everything else uses
 * helmet's secure defaults. CSP is left to the frontend host/CDN (Cloudflare).
 */
export const securityHeaders = helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" },
});

/** Rate-limit key: the signed-in user when available, else the client IP. */
function userOrIp(req: AuthedRequest): string {
  return req.user?.userId ?? ipKeyGenerator(req.ip ?? "");
}

const makeLimiter = (limit: number, windowMs = 60_000) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => userOrIp(req as AuthedRequest),
    message: { error: "Too many requests — please slow down and try again shortly." },
  });

// Spec §9 limits.
export const askLimiter = makeLimiter(10); // 10/min per user
export const verifyLimiter = makeLimiter(5); // 5/min
export const ingestLimiter = makeLimiter(100); // 100/min (admin bulk uploads)
export const adminLimiter = makeLimiter(60); // general admin CRUD
