import { useLocation } from "react-router-dom";
import { SiteNav } from "@/components/SiteNav";
import { hasOwnShell, useNavChrome } from "@/lib/navChrome";

/** Room the fixed navbar takes at the top of a page that doesn't pad for it. */
export const GLOBAL_NAV_OFFSET = "calc(env(safe-area-inset-top, 0px) + 4.75rem)";

/**
 * Whether the app-level navbar is showing on this page: every page that
 * doesn't render its own <SiteNav />, except full-screen shells that have
 * their own navigation (see hasOwnShell).
 */
export function useGlobalNavVisible(): boolean {
  const { pathname } = useLocation();
  const pageHasNav = useNavChrome((s) => s.pageNavs > 0);
  return !pageHasNav && !hasOwnShell(pathname);
}

/**
 * Adds the site navbar to every page that doesn't render one itself. The page
 * wrapper (PageTransition in App) pads its top by GLOBAL_NAV_OFFSET while this
 * shows, so content starts below the fixed bar — inside the page's own
 * height, so a short page never gains an extra scroll.
 */
export default function GlobalNav() {
  return useGlobalNavVisible() ? <SiteNav global /> : null;
}
