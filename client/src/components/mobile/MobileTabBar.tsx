import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Home, Building2, Sparkles, Menu as MenuIcon, X, LayoutDashboard, LogOut,
  Heart, TrendingUp, Bot,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { navLinksForRole, type NavLink } from "@/components/SiteNav";
import { dashboardPath, roleDisplayLabel } from "@/lib/rolePaths";
import { showsTabBar } from "@/lib/native";
import { useBodyScrollLock } from "@/lib/useBodyScrollLock";

const WA_URL =
  "https://wa.me/917054280101?text=Hi%20Truvi%20Ventures%2C%20I%20would%20like%20to%20know%20more!";

/**
 * The app's bottom navigation — the top-bar hamburger menu, relocated to the
 * bottom for the installed app. The "Menu" button opens a bottom sheet with
 * the exact same options the hamburger showed (role-based links, dashboard,
 * sign in / logout, WhatsApp). Only rendered in the native app; the website is
 * untouched. Nothing is removed — this just moves the menu to the bottom.
 */
export default function MobileTabBar() {
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const { user, isAuthenticated, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  // The AI Sales Copilot is offered to signed-in users (not ambassadors),
  // matching the copilot panel's own visibility rule.
  const showCopilot = isAuthenticated && !!user && user.role !== "AMBASSADOR";

  useBodyScrollLock(menuOpen);

  if (!showsTabBar(pathname)) return null;

  const close = () => setMenuOpen(false);

  // The same options the hamburger showed, minus the dashboard entry (the auth
  // section below renders a richer "My … Dashboard" link, exactly like SiteNav).
  const links: NavLink[] = navLinksForRole(user).filter(
    (l) => !(user && l.to === dashboardPath(user)),
  );

  const linkTarget = (l: NavLink) => l.to ?? `/${l.hash ?? ""}`;

  const savedActive = pathname === "/inventory" && new URLSearchParams(search).get("cat") === "SAVED";
  const exploreActive = pathname === "/inventory" && !savedActive;
  const openAsk = () => window.dispatchEvent(new Event("open-ask-truvi"));
  // Order: Home · Explore · [Ask Truvi] · Saved · Menu — Ask Truvi sits in the
  // centre as the highlighted hero action; Saved moved to its right.
  const bar: { key: string; label: string; Icon: LucideIcon; onPress: () => void; active: boolean; highlight?: boolean }[] = [
    { key: "home", label: "Home", Icon: Home, onPress: () => navigate("/"), active: pathname === "/" },
    { key: "explore", label: "Explore", Icon: Building2, onPress: () => navigate("/inventory"), active: exploreActive },
    { key: "ask", label: "Ask Truvi", Icon: Sparkles, onPress: openAsk, active: false, highlight: true },
    { key: "saved", label: "Saved", Icon: Heart, onPress: () => navigate("/inventory?cat=SAVED"), active: savedActive },
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
              initial={{ opacity: 0, y: 48, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 48, scale: 0.94 }}
              transition={{ type: "spring", stiffness: 380, damping: 30, mass: 0.7 }}
              className="fixed inset-x-0 bottom-0 z-[71] max-h-[82vh] origin-bottom overflow-y-auto rounded-t-3xl border-t border-white/10 bg-[#0a0d14]/98 backdrop-blur-xl"
              style={{ paddingBottom: "calc(20px + env(safe-area-inset-bottom, 0px))" }}
            >
              <div className="flex items-center justify-between px-5 pt-4 pb-2">
                <span className="text-xs font-semibold uppercase tracking-[0.22em] text-white/50">Menu</span>
                <button onClick={close} aria-label="Close menu panel" className="grid size-8 place-items-center rounded-full border border-white/15 text-white/80">
                  <X size={16} />
                </button>
              </div>

              {/* Ask Truvi — the highlighted hero action, first in the list. */}
              <button
                onClick={() => { close(); window.dispatchEvent(new Event("open-ask-truvi")); }}
                className="mx-4 my-2 flex w-[calc(100%-2rem)] items-center gap-3 rounded-2xl border border-white/10 bg-gradient-to-r from-[var(--trust)]/25 to-fuchsia-500/20 px-4 py-3.5 text-left shadow-[0_8px_24px_-8px_rgba(124,58,237,0.6)]"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[var(--trust)] to-fuchsia-500 text-white">
                  <img src="/brand/icon-white.png" alt="" className="h-5 w-5 object-contain" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-white">Ask Truvi</span>
                  <span className="block text-[11px] text-white/60">Your AI property advisor — ask anything</span>
                </span>
              </button>

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

              {/* Truvi Invest + AI Copilot — moved here from the floating buttons
                  so the app screens stay clean; the options live in the menu. */}
              <Link to="/invest" onClick={close} className="flex items-center gap-2 border-b border-white/5 px-5 py-3.5 text-sm font-semibold text-emerald-300">
                <TrendingUp size={15} /> Truvi Invest
              </Link>
              {showCopilot && (
                <button
                  onClick={() => { close(); window.dispatchEvent(new Event("open-copilot")); }}
                  className="flex w-full items-center gap-2 border-b border-white/5 px-5 py-3.5 text-left text-sm font-semibold text-fuchsia-300"
                >
                  <Bot size={15} /> AI Sales Copilot
                </button>
              )}

              {isAuthenticated && user ? (
                <>
                  <Link to={dashboardPath(user)} onClick={close} className="flex items-center gap-2 border-b border-white/5 px-5 py-3.5 text-sm font-semibold text-[var(--trust)]">
                    <LayoutDashboard size={15} /> My {roleDisplayLabel(user)} Dashboard
                  </Link>
                  <button
                    onClick={async () => { close(); await logout(); navigate("/"); }}
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
              <a href={WA_URL} target="_blank" rel="noopener noreferrer" onClick={close} className="flex items-center gap-2 px-5 py-3.5 text-sm font-semibold text-[#25D366]">
                <svg width="16" height="16" viewBox="0 0 32 32" fill="#25D366" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                  <path d="M27.25 4.74A15.36 15.36 0 0 0 16.02 0C7.26 0 .13 7.13.13 15.89c0 2.8.73 5.54 2.12 7.95L0 32l8.36-2.19a15.88 15.88 0 0 0 7.64 1.95h.01c8.75 0 15.88-7.13 15.88-15.89A15.79 15.79 0 0 0 27.25 4.74ZM16.02 29.1a13.18 13.18 0 0 1-6.72-1.84l-.48-.29-4.96 1.3 1.32-4.82-.32-.5a13.15 13.15 0 0 1-2.02-7c0-7.28 5.93-13.21 13.22-13.21a13.14 13.14 0 0 1 9.34 3.87 13.1 13.1 0 0 1 3.86 9.35c0 7.28-5.93 13.14-13.24 13.14Zm7.25-9.87c-.4-.2-2.35-1.16-2.72-1.29-.36-.13-.63-.2-.9.2-.26.39-1.02 1.29-1.25 1.56-.23.26-.46.3-.86.1a10.87 10.87 0 0 1-3.2-1.98 11.9 11.9 0 0 1-2.22-2.75c-.23-.39-.02-.6.17-.8.18-.17.4-.46.6-.69.2-.23.26-.4.4-.66.13-.26.06-.5-.04-.7-.1-.19-.9-2.15-1.23-2.94-.32-.77-.64-.67-.89-.68h-.76c-.26 0-.69.1-1.06.5-.36.4-1.38 1.35-1.38 3.28s1.42 3.8 1.61 4.06c.2.26 2.77 4.23 6.71 5.93.94.4 1.67.64 2.24.82.94.3 1.8.26 2.47.16.75-.11 2.35-.96 2.68-1.89.33-.92.33-1.7.23-1.87-.1-.17-.36-.27-.76-.46Z" />
                </svg> Chat on WhatsApp
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
        {bar.map((t) =>
          t.highlight ? (
            // Ask Truvi — the highlighted hero action: a raised, glowing pill
            // that lifts above the bar so it reads as the primary action.
            <button
              key={t.key}
              onClick={t.onPress}
              aria-label={t.label}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "flex-start",
                gap: 4,
                padding: "0 4px",
                border: "none",
                background: "transparent",
                color: "#fff",
                fontSize: 10.5,
                fontWeight: 700,
                cursor: "pointer",
                WebkitTapHighlightColor: "transparent",
              }}
            >
              <span
                style={{
                  marginTop: -18,
                  display: "grid",
                  placeItems: "center",
                  width: 52,
                  height: 52,
                  borderRadius: 9999,
                  background: "linear-gradient(135deg, #3b82f6 0%, #7c3aed 100%)",
                  boxShadow: "0 10px 24px -6px rgba(124,58,237,0.7), 0 0 0 4px rgba(8,11,18,0.92)",
                }}
              >
                <img src="/brand/icon-white.png" alt="Ask Truvi" width={28} height={28} style={{ objectFit: "contain" }} />
              </span>
              <span style={{ marginTop: 1, background: "linear-gradient(90deg,#93c5fd,#c4b5fd)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>
                {t.label}
              </span>
            </button>
          ) : (
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
          ),
        )}
      </nav>
    </>
  );
}
