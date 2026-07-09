import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { User, Handshake, Building2, ArrowRight } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

/**
 * Entry gate for unauthenticated visitors. It appears after the visitor
 * has scrolled a couple of screens (so they see the site first), asks
 * who they are — Buyer, Seller (Channel Partner) or Developer — and
 * routes them into the matching sign-in / sign-up flow. Role isolation
 * after login is enforced by ProtectedRoute.
 */

const SEEN_KEY = "truvi-welcome-seen";
// Show once the visitor has scrolled ~1.5 screens (2–3 wheel scrolls)
const SCROLL_TRIGGER = 1.5;

type GateRole = "BUYER" | "CP" | "DEVELOPER";

const ROLES: { id: GateRole; label: string; tagline: string; icon: React.ReactNode; accent: string }[] = [
  {
    id: "BUYER",
    label: "Buyer",
    tagline: "Find and verify a property before you invest.",
    icon: <User size={18} />,
    accent: "from-sky-500/25 to-blue-900/10 border-sky-400/30 hover:border-sky-300/60",
  },
  {
    id: "CP",
    label: "Seller · Channel Partner",
    tagline: "Sell property with verified inventory & leads.",
    icon: <Handshake size={18} />,
    accent: "from-emerald-500/25 to-emerald-900/10 border-emerald-400/30 hover:border-emerald-300/60",
  },
  {
    id: "DEVELOPER",
    label: "Developer",
    tagline: "Build projects and list them on Truvi.",
    icon: <Building2 size={18} />,
    accent: "from-violet-500/25 to-violet-900/10 border-violet-400/30 hover:border-violet-300/60",
  },
];

// Paths where the gate must never appear (auth flow itself, admin, errors)
const EXCLUDED_PREFIXES = ["/login", "/signup", "/pending-approval", "/unauthorized", "/admin", "/legal", "/ambassador"];

export default function WelcomeGate() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [visible, setVisible] = useState(false);
  const [selected, setSelected] = useState<GateRole | null>(null);

  const eligible =
    !user && !EXCLUDED_PREFIXES.some((p) => pathname.startsWith(p)) && !localStorage.getItem(SEEN_KEY);

  // Appear only after the visitor has scrolled a couple of screens
  useEffect(() => {
    if (!eligible || visible) return;
    function onScroll() {
      if (window.scrollY > window.innerHeight * SCROLL_TRIGGER) {
        setVisible(true);
      }
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll(); // already scrolled past the trigger (e.g. page restore)
    return () => window.removeEventListener("scroll", onScroll);
  }, [eligible, visible]);

  // Lock the page scroll while the gate is open — one scrollbar, ours
  useEffect(() => {
    if (visible) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [visible]);

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
        className="fixed inset-0 z-[200] overflow-y-auto overflow-x-hidden bg-[#050608]/92 backdrop-blur-xl"
      >
        {/* Ambient glow — clipped so it never causes horizontal overflow */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
          <div
            className="absolute left-1/2 top-[-20%] h-[50vh] w-[70vw] -translate-x-1/2 rounded-full opacity-25 blur-3xl"
            style={{ background: "radial-gradient(circle, #3B82F6 0%, transparent 70%)" }}
          />
          <div
            className="absolute bottom-[-25%] right-0 h-[45vh] w-[40vw] translate-x-1/3 rounded-full opacity-15 blur-3xl"
            style={{ background: "radial-gradient(circle, #10B981 0%, transparent 70%)" }}
          />
        </div>

        {/* min-h-full flex wrapper: centers when it fits, scrolls from the
            top (never clips) when the viewport is short */}
        <div className="flex min-h-full items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, y: 26, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            className="relative w-full max-w-md"
          >
            <div
              className="rounded-[24px] p-px"
              style={{ background: "linear-gradient(160deg, rgba(255,255,255,0.25), rgba(59,130,246,0.35) 40%, rgba(255,255,255,0.06) 80%)" }}
            >
              <div className="rounded-[23px] bg-[#0a0d14]/95 px-6 py-6 md:px-8">
                {/* Brand */}
                <div className="flex flex-col items-center text-center">
                  <span className="grid size-10 place-items-center overflow-hidden rounded-xl bg-white p-1 shadow-[0_0_32px_rgba(59,130,246,0.45)]">
                    <img src="/brand/icon.png" alt="Truvi" className="h-full w-full object-contain" />
                  </span>
                  <h1 className="mt-3 font-display text-xl font-medium leading-snug text-white md:text-[1.35rem]">
                    Know the property <span className="text-gradient-trust">before you buy it.</span>
                  </h1>
                  <p className="mt-1 text-[13px] text-muted-foreground">
                    Tell us who you are — we'll tailor Truvi to you.
                  </p>
                </div>

                {/* Role cards */}
                <div className="mt-4 space-y-2">
                  {ROLES.map((r, i) => (
                    <motion.button
                      key={r.id}
                      initial={{ opacity: 0, x: -14 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.15 + i * 0.08, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                      onClick={() => setSelected(r.id)}
                      className={`group flex w-full items-center gap-3 rounded-xl border bg-gradient-to-br p-3 text-left transition-all duration-300 ${r.accent} ${
                        selected === r.id ? "ring-2 ring-white/40" : ""
                      }`}
                    >
                      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-white/10 text-white/90">
                        {r.icon}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-display text-sm font-semibold text-white">{r.label}</span>
                        <span className="block text-[11px] leading-tight text-muted-foreground">{r.tagline}</span>
                      </span>
                      <ArrowRight
                        size={15}
                        className={`shrink-0 transition-all ${
                          selected === r.id ? "text-white translate-x-0.5" : "text-white/30 group-hover:text-white/70"
                        }`}
                      />
                    </motion.button>
                  ))}
                </div>

                {/* CTAs */}
                <div className="mt-4 space-y-2">
                  <button
                    disabled={!selected}
                    onClick={() => selected && go(`/signup?role=${selected}`)}
                    className="w-full rounded-full bg-gradient-to-r from-[#dbeafe] to-white py-2.5 text-sm font-semibold text-[#0a0d14] transition-all hover:shadow-[0_0_28px_rgba(219,234,254,0.35)] disabled:cursor-not-allowed disabled:opacity-35"
                  >
                    Continue — Create my account
                  </button>
                  <button
                    onClick={() => go(selected ? `/login?role=${selected}` : "/login")}
                    className="w-full rounded-full border border-white/20 py-2.5 text-sm font-medium text-white transition hover:bg-white/10"
                  >
                    I already have an account — Sign in
                  </button>
                </div>

                <button
                  onClick={dismiss}
                  className="mx-auto mt-3 block text-xs text-muted-foreground underline-offset-4 transition hover:text-white hover:underline"
                >
                  Just browsing — continue as guest
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
