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
  "/founder/dashboard", "/employee/dashboard",
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

/**
 * Vercel runs this before its catch-all rewrite. Known React routes continue
 * into the SPA rewrite; unknown extensionless routes receive the same React
 * NotFoundPage shell but retain a real HTTP 404 status.
 */
export default async function proxy(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (isKnownSpaRoute(url.pathname)) return next();

  const shellUrl = new URL("/index.html", url.origin);
  const shell = await fetch(shellUrl, {
    method: "GET",
    headers: { accept: "text/html" },
    cache: "no-store",
  });

  if (!shell.ok || !shell.body) {
    return new Response("Not Found", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    });
  }

  const headers = new Headers(shell.headers);
  headers.set("cache-control", "no-store");
  headers.set("x-robots-tag", "noindex, nofollow");

  return new Response(request.method === "HEAD" ? null : shell.body, {
    status: 404,
    statusText: "Not Found",
    headers,
  });
}
