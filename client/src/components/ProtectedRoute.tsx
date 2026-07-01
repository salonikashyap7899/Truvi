import { Navigate } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import type { Role } from "@/types";

/**
 * Client-side route gating for UX only (redirect before a flash of the
 * wrong screen). The actual authorization boundary is server-side — every
 * Express route re-verifies role + approvalStatus via requireRole()
 * regardless of what this component allows through.
 */
export function ProtectedRoute({ roles, children }: { roles: Role[]; children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);

  if (!accessToken || !user) return <Navigate to="/login" replace />;
  if (user.role !== "ADMIN" && user.approvalStatus !== "APPROVED") return <Navigate to="/pending-approval" replace />;
  if (!roles.includes(user.role)) return <Navigate to="/unauthorized" replace />;

  return <>{children}</>;
}
