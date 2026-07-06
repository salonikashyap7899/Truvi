import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { User, Handshake, Building2, ArrowRight } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

/**
 * Full-screen entry gate shown once to unauthenticated visitors.
 * The visitor picks who they are — Buyer, Seller (Channel Partner) or
 * Developer — and is taken straight into the matching sign-in / sign-up
 * flow. Role isolation after login is enforced by ProtectedRoute.
 */

const SEEN_KEY = "truvi-welcome-seen";

type GateRole = "BUYER" | "CP" | "DEVELOPER";

const ROLES: { id: GateRole; label: string; tagline: string; icon: React.ReactNode; accent: string }[] = [
  {
    id: "BUYER",
    label: "Buyer",
    tagline: "I want to find and verify a property before I invest.",
    icon: <User size={22} />,
    accent: "from-sky-500/25 to-blue-900/10 border-sky-400/30 hover:border-sky-300/60",
  },
  {
    id: "CP",
    label: "Seller · Channel Partner",
    tagline: "I sell property and want verified inventory & leads.",
    icon: <Handshake size={22} />,
    accent: "from-emerald-500/25 to-emerald-900/10 border-emerald-400/30 hover:border-emerald-300/60",
  },
  {
    id: "DEVELOPER",
    label: "Developer",
    tagline: "I build projects and want to list them on Truvi.",
    icon: <Building2 size={22} />,
    accent: "from-violet-500/25 to-violet-900/10 border-violet-400/30 hover:border-violet-300/60",
  },
];

// Paths where the gate must never appear (auth flow itself, admin, errors)
const EXCLUDED_PREFIXES = ["/login", "/signup", "/pending-approval", "/unauthorized", "/admin", "/legal"];

export default function WelcomeGate() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [visible, setVisible] = useState(false);
  const [selected, setSelected] = useState<GateRole | null>(null);

  useEffect(() => {
    if (user) return;
    if (EXCLUDED_PREFIXES.some((p) => pathname.startsWith(p))) return;
    if (localStorage.getItem(SEEN_KEY)) return;
    const t = setTimeout(() => setVisible(true), 400);
    return () => clearTimeout(t);
  }, [user, pathname]);

  if (!visible || user) return null;

  function dismiss() {
    localStorage.setItem(SEEN_KEY, "1");
    setVisible(false);
  }

  function go(path: string) {
    dismiss();
    navigate(path);
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] flex items-center justify-center overflow-y-auto bg-[#050608]/92 backdrop-blur-xl p-4"
      >
        {/* Ambient glow */}
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          <div className="absolute left-1/2 top-[-20%] h-[50vh] w-[70vw] -translate-x-1/2 rounded-full opacity-25 blur-3xl"
            style={{ background: "radial-gradient(circle, #3B82F6 0%, transparent 70%)" }} />
          <div className="absolute bottom-[-25%] right-[-10%] h-[45vh] w-[45vw] rounded-full opacity-15 blur-3xl"
            style={{ background: "radial-gradient(circle, #10B981 0%, transparent 70%)" }} />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 30, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="relative w-full max-w-lg my-8"
        >
          {/* Gradient hairline frame */}
          <div className="rounded-[28px] p-px" style={{ background: "linear-gradient(160deg, rgba(255,255,255,0.25), rgba(59,130,246,0.35) 40%, rgba(255,255,255,0.06) 80%)" }}>
            <div className="rounded-[27px] bg-[#0a0d14]/95 px-7 py-9 md:px-10">
              {/* Brand */}
              <div className="flex flex-col items-center text-center">
                <span className="grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-[var(--trust)] to-[var(--tech)] font-display text-lg font-bold shadow-[0_0_40px_rgba(59,130,246,0.45)]">
                  T
                </span>
                <p className="mt-4 font-display text-[13px] font-semibold tracking-[0.35em] text-white/90">TRUVI</p>
                <h1 className="mt-3 font-display text-2xl font-medium leading-snug text-white md:text-[1.7rem]">
                  Know the property<br />
                  <span className="text-gradient-trust">before you buy it.</span>
                </h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  Tell us who you are — we'll tailor Truvi to you.
                </p>
              </div>

              {/* Role cards */}
              <div className="mt-7 space-y-3">
                {ROLES.map((r, i) => (
                  <motion.button
                    key={r.id}
                    initial={{ opacity: 0, x: -16 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.25 + i * 0.1, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                    onClick={() => setSelected(r.id)}
                    className={`group flex w-full items-center gap-4 rounded-2xl border bg-gradient-to-br p-4 text-left transition-all duration-300 ${r.accent} ${
                      selected === r.id ? "ring-2 ring-white/40 scale-[1.015]" : "hover:scale-[1.01]"
                    }`}
                  >
                    <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-white/10 text-white/90">
                      {r.icon}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-display text-[15px] font-semibold text-white">{r.label}</span>
                      <span className="block text-xs text-muted-foreground">{r.tagline}</span>
                    </span>
                    <ArrowRight
                      size={16}
                      className={`shrink-0 transition-all ${selected === r.id ? "text-white translate-x-0.5" : "text-white/30 group-hover:text-white/70"}`}
                    />
                  </motion.button>
                ))}
              </div>

              {/* CTAs */}
              <div className="mt-7 space-y-2.5">
                <button
                  disabled={!selected}
                  onClick={() => selected && go(`/signup?role=${selected}`)}
                  className="w-full rounded-full bg-gradient-to-r from-[#dbeafe] to-white py-3 text-sm font-semibold text-[#0a0d14] transition-all hover:shadow-[0_0_30px_rgba(219,234,254,0.35)] disabled:cursor-not-allowed disabled:opacity-35"
                >
                  Continue — Create my account
                </button>
                <button
                  onClick={() => go(selected ? `/login?role=${selected}` : "/login")}
                  className="w-full rounded-full border border-white/20 py-3 text-sm font-medium text-white transition hover:bg-white/10"
                >
                  I already have an account — Sign in
                </button>
              </div>

              <button
                onClick={dismiss}
                className="mx-auto mt-5 block text-xs text-muted-foreground underline-offset-4 transition hover:text-white hover:underline"
              >
                Just browsing — continue as guest
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
