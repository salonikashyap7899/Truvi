import { createContext } from "react";
import { create } from "zustand";

/**
 * Site-wide navbar bookkeeping. Every page shows the top navbar: pages that
 * render their own <SiteNav /> keep it (they already pad for it), and the
 * app-level <GlobalNav /> adds one to every other page. These counters let the
 * two cooperate without duplicates:
 *  - pageNavs: <SiteNav /> instances rendered by the page itself → GlobalNav
 *    steps aside while any are mounted.
 *  - navs: every mounted navbar → a page's own header <UserMenu /> hides,
 *    since the navbar already carries the account menu.
 */
interface NavChromeState {
  pageNavs: number;
  navs: number;
  mount: (isPageNav: boolean) => void;
  unmount: (isPageNav: boolean) => void;
}

export const useNavChrome = create<NavChromeState>((set) => ({
  pageNavs: 0,
  navs: 0,
  mount: (isPageNav) => set((s) => ({ navs: s.navs + 1, pageNavs: s.pageNavs + (isPageNav ? 1 : 0) })),
  unmount: (isPageNav) => set((s) => ({ navs: s.navs - 1, pageNavs: s.pageNavs - (isPageNav ? 1 : 0) })),
}));

/** True inside the navbar, so its own <UserMenu /> is never hidden. */
export const InNavbarContext = createContext(false);

/**
 * Full-screen shells with their own complete navigation (the admin OS — every
 * /admin page lives inside it — and the founder OS, both with a fixed sidebar;
 * the immersive 3D viewer; the first-run tour). The shared navbar would cover
 * their controls, so it isn't added there.
 */
export function hasOwnShell(pathname: string): boolean {
  return (
    pathname === "/welcome" ||
    pathname.startsWith("/admin/") ||
    pathname === "/founder/dashboard" ||
    /^\/inventory\/[^/]+\/3d$/.test(pathname)
  );
}

/**
 * Pages that already show their own back link at the top ("Back to
 * dashboard", "Back to sign in", "Back to Inventory", …). The navbar's back
 * button is left off these so there are never two.
 */
const OWN_BACK_LINK: RegExp[] = [
  /^\/forgot-password$/,
  /^\/payment-(success|failed)$/,
  /^\/unauthorized$/,
  /^\/vault$/,
  /^\/bookings$/,
  /^\/crm\/pipeline$/,
  /^\/buyer\/compare$/,
  /^\/cp\/(guide|academy|connect)$/,
  /^\/developer\/guide$/,
  /^\/inventory\/[^/]+\/presentation$/,
];

/** Whether the navbar should show its ← Back button on this page. */
export function showsNavBack(pathname: string, homePath: string | null): boolean {
  if (pathname === "/" || pathname === homePath) return false;
  return !OWN_BACK_LINK.some((re) => re.test(pathname));
}
