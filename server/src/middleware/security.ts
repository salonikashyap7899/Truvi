import path from "path";
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
// Protect the pre-auth endpoints (login, signup, OTP send/verify, password
// reset) that otherwise have no throttle. Keyed by the signed-in user when one
// exists (the authenticated OTP endpoints) and otherwise by client IP, so a
// shared NAT is limited together. Limits are set well above normal human use —
// a real person signing in or verifying a code never hits them; an automated
// brute-force or SMS-spam run does.
export const loginLimiter = makeLimiter(10, 15 * 60_000); // 10 login attempts / 15 min
export const otpSendLimiter = makeLimiter(6, 60 * 60_000); // 6 code sends / hour (SMS + email cost)
export const otpVerifyLimiter = makeLimiter(20, 15 * 60_000); // 20 verify attempts / 15 min

// ── AI chat (Anthropic bill) ───────────────────────────────────────────────
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
