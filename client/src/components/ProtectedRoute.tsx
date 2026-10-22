import { Navigate, useLocation } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import { initializeAuthSession } from "@/lib/api";
import { dashboardPath } from "@/lib/rolePaths";
import type { Role } from "@/types";
import { CpJoiningFlow } from "@/components/CpJoiningGate";

/** CP pages that stay open before joining is complete (help/learning). */
const CP_UNGATED = new Set(["/cp/guide"]);

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
  const isInitialized = useAuthStore((s) => s.isInitialized);
  const sessionRestoreFailed = useAuthStore((s) => s.sessionRestoreFailed);
  const { pathname } = useLocation();

  // Do not send a user to login just because the in-memory token has not yet
  // been restored from the HTTP-only refresh cookie after a reload.
  if (!isInitialized) {
    return (
      <div
        className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-6 text-center"
        role="status"
        aria-label="Restoring your session"
      >
        {sessionRestoreFailed ? (
          <>
            <p className="max-w-md text-sm text-muted-foreground">
              Truvi couldn’t confirm your saved session because the connection failed. Your account has not been signed out.
            </p>
            <button
              type="button"
              onClick={() => void initializeAuthSession()}
              className="rounded-full border border-sky-400/30 bg-sky-400/10 px-4 py-2 text-sm font-semibold text-sky-200 hover:bg-sky-400/15"
            >
              Try restoring session again
            </button>
          </>
        ) : (
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white/80" />
        )}
      </div>
    );
  }
  if (!accessToken || !user) return <Navigate to="/login" replace />;
  if (!roles.includes(user.role)) return <Navigate to={dashboardPath(user)} replace />;

  // Channel Partner workspace pages (not the pages every role shares) need the
  // compulsory CP joining — KYC, WhatsApp channel and partner terms — first.
  if (user.role === "CP" && !roles.includes("BUYER") && !CP_UNGATED.has(pathname)) {
    return <CpJoiningFlow>{children}</CpJoiningFlow>;
  }

  return <>{children}</>;
}
