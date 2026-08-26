import { Link, useLocation } from "react-router-dom";
import { TrendingUp } from "lucide-react";

/**
 * Floating "Invest" launcher — a circle pinned to the LEFT edge on the public
 * marketing surfaces. Tapping it opens the Truvi Invest experience (/invest).
 * Hidden inside the authenticated app / dashboards to avoid clutter.
 */
const PUBLIC_PATHS = new Set(["/", "/home", "/about", "/intelligence", "/inventory", "/join", "/invest"]);

export default function InvestFab() {
  const { pathname } = useLocation();
  const show = PUBLIC_PATHS.has(pathname) || pathname.startsWith("/inventory");
  if (!show || pathname === "/invest") return null;

  return (
    <Link
      to="/invest"
      aria-label="Explore Truvi Invest"
      className="group fixed bottom-6 left-5 z-50 flex items-center gap-2"
    >
      <span className="relative grid size-14 place-items-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-[0_10px_30px_rgba(16,185,129,0.45)] transition-transform group-hover:scale-105">
        <span className="absolute inset-0 animate-ping rounded-full bg-emerald-500/40" />
        <TrendingUp size={22} className="relative" />
      </span>
      <span className="hidden rounded-full bg-black/70 px-3 py-1.5 text-sm font-semibold text-white backdrop-blur sm:group-hover:inline-block">
        Truvi Invest
      </span>
    </Link>
  );
}
