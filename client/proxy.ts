import { next } from "@vercel/functions";

const exactRoutes = new Set([
  "/", "/welcome", "/intelligence", "/ask-truvi", "/help/meet", "/home",
  "/invest", "/join", "/about", "/legal", "/pricing", "/payment-success",
  "/payment-failed", "/terms", "/refund-policy", "/privacy", "/privacy-policy", "/grievance",
  "/restore-account", "/login", "/signup", "/forgot-password", "/employee/activate",
  "/verify-email", "/unauthorized", "/inventory", "/map", "/marketing",
  "/admin", "/admin/dashboard", "/admin/users", "/admin/employees", "/admin/listings",
  "/admin/scores", "/admin/leads", "/admin/offers", "/admin/meetings", "/admin/enquiries",
  "/admin/calls", "/admin/vouchers", "/admin/revenue", "/admin/settings", "/admin/compliance",
  "/admin/ambassador-tasks", "/admin/ambassador-operating-system", "/admin/payments",
  "/admin/marketing", "/admin/notifications", "/admin/requirements", "/admin/verification",
  "/admin/kyc", "/admin/referral-leads", "/admin/documents", "/admin/finance",
  "/admin/commissions", "/admin/investments", "/admin/ambassador-knowledge",
  "/admin/academy", "/admin/audit-logs", "/admin/habitat",
  "/founder/dashboard", "/employee/dashboard", "/employee/marketing", "/marketing/activate", "/marketing/partner", "/admin/marketing-os",
  "/ambassador", "/ambassador/signup", "/ambassador/login", "/ambassador/dashboard",
  "/ambassador/operating-system", "/ambassador/staff-operating-system", "/ambassador/certificate",
  "/developer/dashboard", "/developer/guide", "/developer/inventory", "/developer/crm",
  "/developer/analytics", "/developer/campaigns", "/developer/projects/new",
  "/cp/dashboard", "/cp/commissions", "/cp/guide", "/cp/marketplace", "/cp/academy",
  "/cp/sales", "/cp/ai", "/cp/business", "/cp/growth", "/cp/onboard-developers", "/cp/connect",
  "/crm/pipeline", "/bookings", "/vault", "/requirements", "/privacy-center",
  "/settings/notifications", "/buyer/dashboard", "/buyer/projects", "/buyer/compare",
  "/habitat", "/habitat/developer", "/habitat/provider",
]);

const dynamicRoutePatterns = [
  /^\/inventory\/[^/]+\/(?:presentation|3d)$/,
  /^\/projects\/[^/]+$/,
  /^\/developer\/projects\/[^/]+$/,
  /^\/admin\/users\/[^/]+$/,
  /^\/admin\/listings\/[^/]+$/,
  /^\/habitat\/invite\/[^/]+$/,
];

function isKnownSpaRoute(pathname: string): boolean {
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return exactRoutes.has(normalized) || dynamicRoutePatterns.some((pattern) => pattern.test(normalized));
}

/** Accept only exact HTTPS origins from deployment configuration. */
function configuredHttpsOrigin(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || url.username || url.password) return null;
    if (url.pathname !== "/" || url.search || url.hash) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function configuredHttpsOrigins(value: string | undefined): string[] {
  return [...new Set((value ?? "").split(",").map((entry) => configuredHttpsOrigin(entry)).filter((entry): entry is string => Boolean(entry)))];
}

function websocketOrigin(origin: string): string {
  return "wss://" + new URL(origin).host;
}

/**
 * Build a restrictive page policy from exact deploy-time API/media origins.
 * CSP_MEDIA_ORIGINS is a comma-separated allowlist for external project media.
 * No scheme-wide https: or wss: source expressions are used.
 */
function pageContentSecurityPolicy(requestUrl: string): string {
  const pageOrigin = new URL(requestUrl).origin;
  const apiOrigin = configuredHttpsOrigin(process.env.VITE_API_URL) ?? pageOrigin;
  const mediaOrigins = configuredHttpsOrigins(process.env.CSP_MEDIA_ORIGINS);
  const connectSources = [...new Set([
    "'self'", apiOrigin, websocketOrigin(pageOrigin), websocketOrigin(apiOrigin),
    "https://maps.googleapis.com", "https://maps.gstatic.com",
    "https://api.razorpay.com", "https://checkout.razorpay.com",
  ])];
  const imageSources = [...new Set([
    "'self'", "data:", "blob:", apiOrigin, ...mediaOrigins,
    "https://maps.googleapis.com", "https://maps.gstatic.com",
  ])];
  const mediaSources = [...new Set(["'self'", "data:", "blob:", apiOrigin, ...mediaOrigins])];
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'self'",
    "form-action 'self'",
    "script-src 'self' https://checkout.razorpay.com https://maps.googleapis.com https://maps.gstatic.com",
    "script-src-attr 'none'",
    "style-src 'self' https://fonts.googleapis.com",
    "style-src-attr 'unsafe-inline'",
    "img-src " + imageSources.join(" "),
    "font-src 'self' data: https://fonts.gstatic.com",
    "connect-src " + connectSources.join(" "),
    "frame-src 'self' https://checkout.razorpay.com https://api.razorpay.com",
    "media-src " + mediaSources.join(" "),
    "worker-src 'self' blob:",
    "upgrade-insecure-requests",
  ].join("; ");
}

function withPageSecurityHeaders(response: Response, request: Request): Response {
  const headers = new Headers(response.headers);
  headers.set("Content-Security-Policy", pageContentSecurityPolicy(request.url));
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("X-Frame-Options", "SAMEORIGIN");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

/**
 * Vercel runs this before its catch-all rewrite. Known React routes continue
 * into the SPA rewrite; unknown extensionless routes receive the same React
 * NotFoundPage shell but retain a real HTTP 404 status.
 */
export default async function proxy(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (isKnownSpaRoute(url.pathname)) return withPageSecurityHeaders(await next(), request);

  const shellUrl = new URL("/index.html", url.origin);
  const shell = await fetch(shellUrl, {
    method: "GET",
    headers: { accept: "text/html" },
    cache: "no-store",
  });

  if (!shell.ok || !shell.body) {
    return withPageSecurityHeaders(new Response("Not Found", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    }), request);
  }

  const headers = new Headers(shell.headers);
  headers.set("cache-control", "no-store");
  headers.set("x-robots-tag", "noindex, nofollow");

  return withPageSecurityHeaders(new Response(request.method === "HEAD" ? null : shell.body, {
    status: 404,
    statusText: "Not Found",
    headers,
  }), request);
}
