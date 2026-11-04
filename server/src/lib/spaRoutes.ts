/**
 * Server-side mirror of the React Router route surface.
 *
 * The VPS serves the SPA shell for known application routes, but returns an
 * HTTP 404 (with the same shell so React can render NotFoundPage) for unknown
 * extensionless paths. Keep this list aligned with client/src/App.tsx.
 */
const exactRoutes = new Set([
  "/", "/welcome", "/intelligence", "/ask-truvi", "/help/meet", "/home",
  "/invest", "/join", "/about", "/legal", "/pricing", "/payment-success",
  "/payment-failed", "/terms", "/refund-policy", "/privacy", "/privacy-policy",
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

export function isKnownSpaRoute(pathname: string): boolean {
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return exactRoutes.has(normalized) || dynamicRoutePatterns.some((pattern) => pattern.test(normalized));
}
