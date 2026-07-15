import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X, LayoutDashboard, LogOut } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { dashboardPath, roleLabel } from "@/lib/rolePaths";
import type { User } from "@/types";
import UserMenu from "@/components/UserMenu";

/* Brand: the header logo reads TRUVI VENTURES; TRUVI is used elsewhere. */

const WA_URL =
  "https://wa.me/919196366358?text=Hi%20Truvi%20Ventures%2C%20I%20would%20like%20to%20know%20more!";

/**
 * Header brand. Prefers the horizontal wordmark image; if that file hasn't
 * been uploaded (or fails to load), falls back to the app icon + text so the
 * navbar never shows a broken image.
 */
function BrandLogo() {
  const [wordmarkFailed, setWordmarkFailed] = useState(false);

  if (wordmarkFailed) {
    return (
      <>
        <span className="grid size-7 shrink-0 place-items-center overflow-hidden rounded-lg">
          <img src="/brand/icon.png" alt="" className="h-full w-full object-contain" />
        </span>
        <span className="truncate">TRUVI VENTURES</span>
      </>
    );
  }
  return (
    <img
      src="/brand/wordmark.png"
      alt="Truvi Ventures"
      onError={() => setWordmarkFailed(true)}
      className="h-6 w-auto max-w-[150px] shrink-0 object-contain sm:h-7 sm:max-w-[175px]"
    />
  );
}

function WhatsAppNavIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path
        d="M27.25 4.74A15.36 15.36 0 0 0 16.02 0C7.26 0 .13 7.13.13 15.89c0 2.8.73 5.54 2.12 7.95L0 32l8.36-2.19a15.88 15.88 0 0 0 7.64 1.95h.01c8.75 0 15.88-7.13 15.88-15.89A15.79 15.79 0 0 0 27.25 4.74ZM16.02 29.1a13.18 13.18 0 0 1-6.72-1.84l-.48-.29-4.96 1.3 1.32-4.82-.32-.5a13.15 13.15 0 0 1-2.02-7c0-7.28 5.93-13.21 13.22-13.21a13.14 13.14 0 0 1 9.34 3.87 13.1 13.1 0 0 1 3.86 9.35c0 7.28-5.93 13.14-13.24 13.14Zm7.25-9.87c-.4-.2-2.35-1.16-2.72-1.29-.36-.13-.63-.2-.9.2-.26.39-1.02 1.29-1.25 1.56-.23.26-.46.3-.86.1a10.87 10.87 0 0 1-3.2-1.98 11.9 11.9 0 0 1-2.22-2.75c-.23-.39-.02-.6.17-.8.18-.17.4-.46.6-.69.2-.23.26-.4.4-.66.13-.26.06-.5-.04-.7-.1-.19-.9-2.15-1.23-2.94-.32-.77-.64-.67-.89-.68h-.76c-.26 0-.69.1-1.06.5-.36.4-1.38 1.35-1.38 3.28s1.42 3.8 1.61 4.06c.2.26 2.77 4.23 6.71 5.93.94.4 1.67.64 2.24.82.94.3 1.8.26 2.47.16.75-.11 2.35-.96 2.68-1.89.33-.92.33-1.7.23-1.87-.1-.17-.36-.27-.76-.46Z"
        fill="#3B82F6"
      />
    </svg>
  );
}

/** Nav links. Hash links live on the landing page — from other routes they
 *  navigate back to "/" with the hash (the landing page scrolls to it). */
type NavLink = { label: string; to?: string; hash?: string };

const NAV_LINKS: NavLink[] = [
  { label: "Intelligence", to: "/intelligence" },
  { label: "Ask Truvi", hash: "#ask-truvi" },
  { label: "Inventory", to: "/inventory" },
  { label: "Pricing", to: "/pricing" },
  { label: "For Developers", hash: "#developer-intelligence" },
  { label: "About", to: "/about" },
];

/**
 * Role-scoped navigation (per the Truvi role-flow). Every signed-in role gets
 * a "Dashboard" entry first so the navbar never looks empty, followed by the
 * pages that role is actually allowed to use:
 *  - Buyer      → Dashboard + Inventory + Intelligence + Ask Truvi
 *  - CP         → Dashboard + Inventory + For Developers + Ask Truvi
 *  - Developer  → Dashboard + Inventory + For Developers
 *  - Ambassador → Dashboard (My Tasks) only — field agents aren't shown the
 *    marketing/inventory nav — resolves "ambassador can see every page"
 *  - Admin / Verifier → Dashboard + Inventory + Intelligence
 *  - Signed-out visitors → full marketing nav
 */
function navLinksForRole(user?: Pick<User, "role" | "email"> | null): NavLink[] {
  if (!user) return NAV_LINKS; // guests get the marketing nav

  const dash = (label: string): NavLink => ({ label, to: dashboardPath(user) });

  switch (user.role) {
    case "AMBASSADOR":
      return [dash("My Tasks")];
    case "BUYER":
      return [
        dash("Dashboard"),
        { label: "Inventory", to: "/inventory" },
        { label: "Intelligence", to: "/intelligence" },
        { label: "Pricing", to: "/pricing" },
        { label: "Ask Truvi", hash: "#ask-truvi" },
      ];
    case "CP":
      return [
        dash("Dashboard"),
        { label: "Inventory", to: "/inventory" },
        { label: "Pricing", to: "/pricing" },
        { label: "For Developers", hash: "#developer-intelligence" },
      ];
    case "DEVELOPER":
      return [
        dash("Dashboard"),
        { label: "Inventory", to: "/inventory" },
        { label: "Pricing", to: "/pricing" },
        { label: "For Developers", hash: "#developer-intelligence" },
      ];
    case "ADMIN":
    case "VERIFIER":
      return [
        dash("Dashboard"),
        { label: "Inventory", to: "/inventory" },
        { label: "Intelligence", to: "/intelligence" },
      ];
    default:
      return NAV_LINKS;
  }
}

function NavItem({
  link,
  onNavigate,
  className,
}: {
  link: (typeof NAV_LINKS)[number];
  onNavigate: () => void;
  className: string;
}) {
  const { pathname } = useLocation();
  if (link.to) {
    return (
      <Link to={link.to} onClick={onNavigate} className={className}>
        {link.label}
      </Link>
    );
  }
  // Hash target: plain anchor on the landing page, route + hash elsewhere
  if (pathname === "/") {
    return (
      <a href={link.hash} onClick={onNavigate} className={className}>
        {link.label}
      </a>
    );
  }
  return (
    <Link to={`/${link.hash}`} onClick={onNavigate} className={className}>
      {link.label}
    </Link>
  );
}

export function SiteNav() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const { user, isAuthenticated, logout } = useAuth();

  // Close the mobile menu whenever the route changes
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Lock page scroll while the mobile menu is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [open]);

  const close = () => setOpen(false);

  const visibleLinks = navLinksForRole(user);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 px-4 py-4 sm:px-6 md:px-12 md:py-5">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 rounded-full glass px-4 py-2.5 sm:px-5">
        <Link
          to="/"
          onClick={close}
          className="flex min-w-0 items-center gap-2 font-display text-sm font-semibold tracking-tight sm:text-base"
        >
          <BrandLogo />
        </Link>

        {/* Desktop links — centered so the bar stays balanced whatever the count */}
        <nav className="hidden flex-1 items-center justify-center gap-5 text-xs uppercase tracking-[0.16em] text-muted-foreground lg:flex xl:gap-6">
          {visibleLinks.map((link) => (
            <NavItem key={link.label} link={link} onNavigate={close} className="whitespace-nowrap transition-colors hover:text-foreground" />
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          <motion.a
            href={WA_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Chat on WhatsApp"
            whileHover={{ scale: 1.05, boxShadow: "0 0 22px rgba(217,164,74,0.45)" }}
            whileTap={{ scale: 0.96 }}
            className="flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold transition-all sm:px-4"
            style={{
              background: "rgba(59,130,246,0.12)",
              border: "1px solid rgba(59,130,246,0.45)",
              color: "#3B82F6",
            }}
          >
            <WhatsAppNavIcon />
            <span className="hidden sm:inline">WhatsApp</span>
          </motion.a>

          {/* Account: name + dashboard + logout when signed in; Sign in / Join otherwise */}
          <UserMenu />

          {/* Mobile menu toggle */}
          <button
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            className="grid size-9 place-items-center rounded-full border border-white/15 text-foreground/90 transition hover:bg-white/10 lg:hidden"
          >
            {open ? <X size={17} /> : <Menu size={17} />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop — closes the menu on tap */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={close}
              className="fixed inset-0 -z-10 bg-black/60 backdrop-blur-sm lg:hidden"
            />
            <motion.nav
              initial={{ opacity: 0, y: -8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.98 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="mx-auto mt-2 flex max-w-7xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0a0d14]/95 shadow-2xl shadow-black/50 backdrop-blur-xl lg:hidden"
            >
              {/* Drop the dashboard entry here — the auth section below renders
                  a richer "My {role} Dashboard" link, so we avoid duplicating it. */}
              {visibleLinks
                .filter((link) => !(user && link.to === dashboardPath(user)))
                .map((link) => (
                  <NavItem
                    key={link.label}
                    link={link}
                    onNavigate={close}
                    className="border-b border-white/5 px-5 py-3.5 text-sm uppercase tracking-[0.16em] text-foreground/85 transition hover:bg-white/5 hover:text-foreground"
                  />
                ))}

              {/* Auth section (mobile) */}
              {isAuthenticated && user ? (
                <>
                  <Link
                    to={dashboardPath(user)}
                    onClick={close}
                    className="flex items-center gap-2 border-b border-white/5 px-5 py-3.5 text-sm font-semibold text-[var(--trust)]"
                  >
                    <LayoutDashboard size={15} />
                    My {roleLabel(user.role)} Dashboard
                  </Link>
                  <button
                    onClick={async () => {
                      close();
                      await logout();
                    }}
                    className="flex w-full items-center gap-2 border-b border-white/5 px-5 py-3.5 text-left text-sm font-semibold text-red-300"
                  >
                    <LogOut size={15} />
                    Logout ({user.name})
                  </button>
                </>
              ) : (
                <Link
                  to="/login"
                  onClick={close}
                  className="border-b border-white/5 px-5 py-3.5 text-sm font-semibold text-[var(--trust)]"
                >
                  Sign in / Join
                </Link>
              )}
              <a
                href={WA_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={close}
                className="flex items-center gap-2 px-5 py-3.5 text-sm font-semibold"
                style={{ color: "#3B82F6" }}
              >
                <WhatsAppNavIcon />
                Chat on WhatsApp
              </a>
            </motion.nav>
          </>
        )}
      </AnimatePresence>
    </header>
  );
}

export default SiteNav;
