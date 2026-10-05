import { useLocation } from "react-router-dom";
import { SiteNav } from "@/components/SiteNav";
import { hasOwnShell, useNavChrome } from "@/lib/navChrome";

/**
 * Adds the site navbar to every page that doesn't render one itself, plus a
 * spacer so the page's content starts below the fixed bar. Steps aside while
 * the current page shows its own <SiteNav />, and on full-screen shells that
 * have their own navigation (see hasOwnShell).
 */
export default function GlobalNav() {
  const { pathname } = useLocation();
  const pageHasNav = useNavChrome((s) => s.pageNavs > 0);

  if (pageHasNav || hasOwnShell(pathname)) return null;

  return (
    <>
      <SiteNav global />
      <div aria-hidden style={{ height: "calc(env(safe-area-inset-top, 0px) + 4.75rem)" }} />
    </>
  );
}
