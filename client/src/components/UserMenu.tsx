import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { LayoutDashboard, LogOut, Home, ChevronDown } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { dashboardPath, roleLabel } from "@/lib/rolePaths";

/**
 * Auth-aware account chip for the public site header. Signed-in users see
 * their avatar initial + name with a dropdown (their role's dashboard, Home,
 * Logout); signed-out visitors see Sign in / Join buttons. Which dashboard is
 * offered comes from the user's role — the actual access boundary stays
 * server-side (requireRole) and in ProtectedRoute.
 */
export function UserMenu() {
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  async function onLogout() {
    setOpen(false);
    await logout();
    navigate("/");
  }

  if (!isAuthenticated || !user) {
    return (
      <div className="flex items-center gap-2">
        <Link
          to="/login"
          className="rounded-full border border-white/20 px-3 py-1.5 text-xs font-semibold text-foreground/90 transition hover:bg-white/10 sm:px-4"
        >
          Sign in
        </Link>
        <Link
          to="/join"
          className="hidden rounded-full bg-[var(--trust)] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[var(--trust)]/85 sm:inline-block sm:px-4"
        >
          Join
        </Link>
      </div>
    );
  }

  const initial = (user.name || user.email || "?").trim().charAt(0).toUpperCase();
  const dash = dashboardPath(user);

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-2 rounded-full border border-white/15 bg-white/5 py-1 pl-1 pr-2.5 transition hover:bg-white/10"
      >
        <span className="grid size-7 place-items-center rounded-full bg-gradient-to-br from-[var(--trust)] to-[#2563eb] text-xs font-bold text-white">
          {initial}
        </span>
        <span className="hidden max-w-[110px] truncate text-xs font-semibold text-foreground/90 sm:block">
          {user.name}
        </span>
        <ChevronDown size={13} className={`text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.16 }}
            role="menu"
            className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-2xl border border-white/10 bg-[#0a0d14]/95 shadow-2xl shadow-black/50 backdrop-blur-xl"
          >
            <div className="border-b border-white/10 px-4 py-3">
              <p className="truncate text-sm font-semibold text-white">{user.name}</p>
              <p className="truncate text-[11px] text-muted-foreground">
                {roleLabel(user.role)} · {user.email}
              </p>
            </div>
            <Link
              to={dash}
              onClick={() => setOpen(false)}
              role="menuitem"
              className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-foreground/90 transition hover:bg-white/5"
            >
              <LayoutDashboard size={14} className="text-[var(--trust)]" />
              My {roleLabel(user.role)} Dashboard
            </Link>
            <Link
              to="/"
              onClick={() => setOpen(false)}
              role="menuitem"
              className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-foreground/90 transition hover:bg-white/5"
            >
              <Home size={14} className="text-muted-foreground" />
              Home
            </Link>
            <button
              onClick={onLogout}
              role="menuitem"
              className="flex w-full items-center gap-2.5 border-t border-white/10 px-4 py-2.5 text-left text-sm text-red-300 transition hover:bg-red-500/10"
            >
              <LogOut size={14} />
              Logout
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default UserMenu;
