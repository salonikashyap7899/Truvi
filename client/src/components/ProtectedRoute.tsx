import { Navigate } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import { dashboardPath } from "@/lib/rolePaths";
import type { Role } from "@/types";

/**
 * Client-side route gating for UX only (redirect before a flash of the
 * wrong screen). The actual authorization boundary is server-side — every
 * Express route re-verifies the role via requireRole() regardless of what
 * this component allows through. Accounts are gated at login by email OTP
 * verification, so there's no approval check here.
 *
 * A signed-in user who opens another role's URL is sent to their OWN
 * dashboard — each role only ever sees its own workspace (plus public pages).
 */
export function ProtectedRoute({ roles, children }: { roles: Role[]; children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);

  if (!accessToken || !user) return <Navigate to="/login" replace />;
  if (!roles.includes(user.role)) return <Navigate to={dashboardPath(user)} replace />;

  return <>{children}</>;
}
