import { Capacitor } from "@capacitor/core";

/**
 * True only inside the installed Capacitor app (Android/iOS), false on the web.
 * Computed once at module load. Used to give the installed app its own
 * native-style shell (bottom tab bar + app home) while the website keeps its
 * marketing pages untouched.
 */
export const IS_NATIVE = Capacitor.isNativePlatform();

// Tag the root so app-only CSS (e.g. hiding a floating button that becomes a
// bottom-tab in the app) can target the installed app without affecting the web.
if (IS_NATIVE && typeof document !== "undefined") {
  document.documentElement.classList.add("native-app");
}

/**
 * Routes that run as their own full-screen shell (immersive 3D, the pan/zoom
 * master plan, the map, and the founder/admin OS dashboards). The app's bottom
 * tab bar is hidden on these so it never covers their own controls.
 */
export function isImmersiveRoute(pathname: string): boolean {
  return (
    pathname === "/map" ||
    pathname === "/admin/dashboard" ||
    pathname === "/founder/dashboard" ||
    /^\/inventory\/[^/]+\/(3d|presentation)$/.test(pathname)
  );
}

/** Whether the app's bottom tab bar should show for the current route. */
export function showsTabBar(pathname: string): boolean {
  return IS_NATIVE && !isImmersiveRoute(pathname);
}
