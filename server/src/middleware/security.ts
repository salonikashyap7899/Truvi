import path from "path";
import helmet from "helmet";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import type { AuthedRequest } from "./auth";

/**
 * Content Security Policy for pages served directly by Express (the VPS setup).
 * The same policy is configured in client/vercel.json for static-site hosting.
 * Keep the external script list limited to the integrations actually used by
 * Truvi: Razorpay Checkout and Google Maps/Places. Organization JSON-LD is
 * structured data, not executable JavaScript, so it needs no script hash.
 *
 * This policy must be exercised against staging before deployment because
 * payments, Maps/Places, uploaded media and the live API all depend on origins.
 */
const SECURITY_CSP_DIRECTIVES = {
  defaultSrc: ["'self'"],
  baseUri: ["'self'"],
  objectSrc: ["'none'"],
  frameAncestors: ["'self'"],
  formAction: ["'self'", "https:"],
  scriptSrc: [
    "'self'",
    "https://checkout.razorpay.com",
    "https://maps.googleapis.com",
    "https://maps.gstatic.com",
  ],
  scriptSrcAttr: ["'none'"],
  styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
  imgSrc: ["'self'", "data:", "blob:", "https:"],
  fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
  connectSrc: ["'self'", "https:", "wss:"],
  frameSrc: ["'self'", "https://checkout.razorpay.com", "https://api.razorpay.com"],
  mediaSrc: ["'self'", "data:", "blob:", "https:"],
  workerSrc: ["'self'", "blob:"],
  upgradeInsecureRequests: [],
};

export const securityHeaders = helmet({
  contentSecurityPolicy: { directives: SECURITY_CSP_DIRECTIVES },
  crossOriginResourcePolicy: { policy: "cross-origin" },
});

// ── User-uploaded files (/uploads) ─────────────────────────────────────────
// Uploads are served from the app's own origin, so a file that a browser
// renders as a page (HTML, SVG, XML) would run its script as truviventures.com
// and could read the signed-in user's token. Every file is therefore served
// with nosniff (the browser must trust the extension's type, never guess) and
// a script-free CSP. Only images, PDFs and audio/video open inline; anything
// else is forced to download.
const INLINE_UPLOAD_EXT = new Set([
  ".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif",
  ".pdf",
  ".mp3", ".m4a", ".aac", ".wav", ".ogg", ".oga", ".weba",
  ".mp4", ".webm", ".mov", ".ogv",
]);

// No script, no plugins, no network; `sandbox` additionally gives the document
// an opaque origin, so even a slipped-through file can't touch the app's
// storage or cookies. Chrome refuses to show PDFs in a sandboxed document, so
// PDFs get the same policy minus `sandbox` (the PDF viewer doesn't run page
// script on our origin).
const UPLOAD_CSP = "default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'";

export function setUploadHeaders(res: { setHeader(name: string, value: string): unknown }, filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (ext === ".pdf") {
    res.setHeader("Content-Security-Policy", UPLOAD_CSP);
    return;
  }
  res.setHeader("Content-Security-Policy", `${UPLOAD_CSP}; sandbox`);
  // SVGs still render inside <img> tags (which never run script); opened
  // directly they're sandboxed by the CSP above. Everything else that isn't
  // a plain image/PDF/media file downloads instead of rendering.
  if (!INLINE_UPLOAD_EXT.has(ext) && ext !== ".svg") {
    res.setHeader("Content-Disposition", "attachment");
  }
}

/**
 * The visitor's real IP. Behind Cloudflare, req.ip can be a Cloudflare edge
 * address shared by many visitors, which would make per-IP limits throttle
 * everyone together — so prefer the CF-Connecting-IP header Cloudflare sets.
 * (A client that bypasses Cloudflare could fake it, but that only lets it
 * dodge a limit, never lock out other people.)
 */
function clientIp(req: AuthedRequest): string {
  const cf = req.headers["cf-connecting-ip"];
  const ip = typeof cf === "string" && cf.trim() ? cf.trim() : req.ip ?? "";
  return ipKeyGenerator(ip);
}

/** Rate-limit key: the signed-in user when available, else the client IP. */
function userOrIp(req: AuthedRequest): string {
  return req.user?.userId ?? clientIp(req);
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

// ── Auth / OTP limiters ────────────────────────────────────────────────────
// Apply BOTH an IP/network limit and an identity limit. A single strict IP
// limit makes unrelated users on the same office/home/mobile network throttle
// one another, while identity-only limits are too easy to evade with many
// throwaway email addresses. The combination protects both usability and cost.
function authIdentityOrIp(req: AuthedRequest): string {
  if (req.user?.userId) return `user:${req.user.userId}`;
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  if (email) return `email:${email}`;
  return `ip:${clientIp(req)}`;
}

const loginNetworkLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => clientIp(req as AuthedRequest),
  message: {
    error: "Too many sign-in attempts from this network. Please wait a few minutes and try again.",
    code: "LOGIN_RATE_LIMITED",
  },
});
const loginIdentityLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => authIdentityOrIp(req as AuthedRequest),
  message: {
    error: "Sign-in is temporarily paused after several attempts for this account. Please wait a few minutes before trying again.",
    code: "LOGIN_RATE_LIMITED",
  },
});
export const loginLimiter = [loginNetworkLimiter, loginIdentityLimiter];

const otpSendNetworkLimiter = rateLimit({
  windowMs: 60 * 60_000,
  limit: 40,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => clientIp(req as AuthedRequest),
  message: { error: "Too many verification codes were requested from this network. Please try again later." },
});
const otpSendIdentityLimiter = rateLimit({
  windowMs: 60 * 60_000,
  limit: 6,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => authIdentityOrIp(req as AuthedRequest),
  message: { error: "Too many verification codes were requested for this account. Please wait or try again later." },
});
export const otpSendLimiter = [otpSendNetworkLimiter, otpSendIdentityLimiter];

const otpVerifyNetworkLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => clientIp(req as AuthedRequest),
  message: { error: "Too many code-verification attempts from this network. Please wait before retrying." },
});
const otpVerifyIdentityLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => authIdentityOrIp(req as AuthedRequest),
  message: { error: "Too many code-verification attempts for this account. Please wait before retrying." },
});
export const otpVerifyLimiter = [otpVerifyNetworkLimiter, otpVerifyIdentityLimiter];

// ── AI chat usage guard ───────────────────────────────────────────────────
// Every Ask Truvi / Sales Copilot message is a paid model call. Keyed by the
// signed-in user (the route requires login), so one account — or a script
// using it — can't run up the bill. Far above what a person types.
export const aiChatLimiter = makeLimiter(10); // 10 messages / minute
export const aiChatDailyLimiter = makeLimiter(150, 24 * 60 * 60_000); // 150 messages / day

// ── Public enquiry / landing-page forms ────────────────────────────────────
// Open to anonymous visitors (and the enquiry form accepts a file), so cap
// per-IP volume: plenty for a real person, useless for flooding the inbox or
// filling the server's disk.
export const enquiryLimiter = makeLimiter(20, 60 * 60_000); // 20 submissions / hour
