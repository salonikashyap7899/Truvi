import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Home, Building2, Sparkles, Menu as MenuIcon, X, LayoutDashboard, LogOut, MessageCircle,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { navLinksForRole, type NavLink } from "@/components/SiteNav";
import { dashboardPath, roleDisplayLabel } from "@/lib/rolePaths";
import { showsTabBar } from "@/lib/native";
import { useBodyScrollLock } from "@/lib/useBodyScrollLock";

const WA_URL =
  "https://wa.me/919196366358?text=Hi%20Truvi%20Ventures%2C%20I%20would%20like%20to%20know%20more!";

/**
 * The app's bottom navigation — the top-bar hamburger menu, relocated to the
 * bottom for the installed app. The "Menu" button opens a bottom sheet with
 * the exact same options the hamburger showed (role-based links, dashboard,
 * sign in / logout, WhatsApp). Only rendered in the native app; the website is
 * untouched. Nothing is removed — this just moves the menu to the bottom.
 */
export default function MobileTabBar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user, isAuthenticated, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  useBodyScrollLock(menuOpen);

  if (!showsTabBar(pathname)) return null;

  const close = () => setMenuOpen(false);

  // The same options the hamburger showed, minus the dashboard entry (the auth
  // section below renders a richer "My … Dashboard" link, exactly like SiteNav).
  const links: NavLink[] = navLinksForRole(user).filter(
    (l) => !(user && l.to === dashboardPath(user)),
  );

  const linkTarget = (l: NavLink) => l.to ?? `/${l.hash ?? ""}`;

  const bar: { key: string; label: string; Icon: LucideIcon; onPress: () => void; active: boolean }[] = [
    { key: "home", label: "Home", Icon: Home, onPress: () => navigate("/"), active: pathname === "/" },
    { key: "explore", label: "Explore", Icon: Building2, onPress: () => navigate("/inventory"), active: pathname === "/inventory" },
    { key: "ask", label: "Ask Truvi", Icon: Sparkles, onPress: () => window.dispatchEvent(new Event("open-ask-truvi")), active: false },
    { key: "menu", label: "Menu", Icon: MenuIcon, onPress: () => setMenuOpen(true), active: menuOpen },
  ];

  return (
    <>
      {/* Bottom sheet menu — the relocated hamburger */}
      <AnimatePresence>
        {menuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={close}
              className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm"
            />
            <motion.nav
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 30 }}
              transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
              className="fixed inset-x-0 bottom-0 z-[71] max-h-[80vh] overflow-y-auto rounded-t-3xl border-t border-white/10 bg-[#0a0d14]/98 backdrop-blur-xl"
              style={{ paddingBottom: "calc(72px + env(safe-area-inset-bottom, 0px))" }}
            >
              <div className="flex items-center justify-between px-5 pt-4 pb-2">
                <span className="text-xs font-semibold uppercase tracking-[0.22em] text-white/50">Menu</span>
                <button onClick={close} aria-label="Close menu panel" className="grid size-8 place-items-center rounded-full border border-white/15 text-white/80">
                  <X size={16} />
                </button>
              </div>

              {links.map((l) => (
                <Link
                  key={l.label}
                  to={linkTarget(l)}
                  onClick={close}
                  className="block border-b border-white/5 px-5 py-3.5 text-sm uppercase tracking-[0.16em] text-white/85 transition hover:bg-white/5"
                >
                  {l.label}
                </Link>
              ))}

              {isAuthenticated && user ? (
                <>
                  <Link to={dashboardPath(user)} onClick={close} className="flex items-center gap-2 border-b border-white/5 px-5 py-3.5 text-sm font-semibold text-[var(--trust)]">
                    <LayoutDashboard size={15} /> My {roleDisplayLabel(user)} Dashboard
                  </Link>
                  <button
                    onClick={async () => { close(); await logout(); }}
                    className="flex w-full items-center gap-2 border-b border-white/5 px-5 py-3.5 text-left text-sm font-semibold text-red-300"
                  >
                    <LogOut size={15} /> Logout ({user.name})
                  </button>
                </>
              ) : (
                <Link to="/login" onClick={close} className="block border-b border-white/5 px-5 py-3.5 text-sm font-semibold text-[var(--trust)]">
                  Sign in / Join
                </Link>
              )}
              <a href={WA_URL} target="_blank" rel="noopener noreferrer" onClick={close} className="flex items-center gap-2 px-5 py-3.5 text-sm font-semibold text-[#3B82F6]">
                <MessageCircle size={15} /> Chat on WhatsApp
              </a>
            </motion.nav>
          </>
        )}
      </AnimatePresence>

      {/* Fixed bottom bar */}
      <nav
        aria-label="Primary"
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 60,
          display: "flex",
          justifyContent: "space-around",
          alignItems: "stretch",
          background: "rgba(8,11,18,0.92)",
          borderTop: "1px solid rgba(255,255,255,0.08)",
          backdropFilter: "blur(12px)",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        {bar.map((t) => (
          <button
            key={t.key}
            onClick={t.onPress}
            aria-current={t.active ? "page" : undefined}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 3,
              padding: "9px 4px 8px",
              border: "none",
              background: "transparent",
              color: t.active ? "#3B82F6" : "rgba(255,255,255,0.55)",
              fontSize: 10.5,
              fontWeight: 600,
              cursor: "pointer",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            <t.Icon size={21} strokeWidth={t.active ? 2.4 : 1.9} />
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
    </>
  );
}
