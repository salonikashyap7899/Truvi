import { ArrowLeft } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { dashboardPath } from "@/lib/rolePaths";
import { showsNavBack } from "@/lib/navChrome";

/**
 * "← Back" link shown just below the navbar, at the top-left of the page
 * (the same place and style as a page's own "← Back to Inventory" link) —
 * kept out of the navbar itself. Hidden on home / the user's dashboard and on
 * pages that already have their own back link.
 *
 * `floating` is for pages that render their own <SiteNav /> and already leave
 * room under it: the link sits in that space without moving the page. The
 * default (in-flow) version is used under the app-level navbar.
 */
export default function PageBackLink({ floating = false }: { floating?: boolean }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  if (!showsNavBack(pathname, user ? dashboardPath(user) : null)) return null;

  // Go back within the site when there's history; a page opened directly
  // (shared link, new tab) goes to the user's dashboard, or home.
  const goBack = () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate(user ? dashboardPath(user) : "/");
  };

  return (
    <div
      className={floating ? "pointer-events-none absolute inset-x-0 z-20" : "relative z-20"}
      style={floating ? { top: "calc(env(safe-area-inset-top, 0px) + 5.25rem)" } : undefined}
    >
      {/* Same insets as the navbar bar, so "← Back" lines up with the logo. */}
      <div className={`px-4 sm:px-6 md:px-12 ${floating ? "" : "py-1.5"}`}>
        <div className="mx-auto max-w-7xl px-3 sm:px-4">
        <button
          type="button"
          onClick={goBack}
          aria-label="Go back"
          className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full px-1 py-1 text-sm text-muted-foreground transition hover:text-white"
        >
          <ArrowLeft size={16} /> Back
        </button>
        </div>
      </div>
    </div>
  );
}
