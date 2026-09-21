import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import {
  ShieldCheck, ScanSearch, Database, TrendingUp, Scale, Droplets,
  Box, Layers, IndianRupee, Sparkles, CalendarCheck, MapPin, Users, Bell,
  BarChart3, RefreshCw, Megaphone, Award, Trophy, BookOpen,
  ArrowRight, Check,
} from "lucide-react";

type Role = "BUYER" | "CHANNEL PARTNER" | "DEVELOPER / SELLER" | "AMBASSADOR";

interface Slide {
  role: Role;
  title: React.ReactNode;
  sub: string;
  visual: React.ReactNode;
  features: { icon: LucideIcon; label: string }[];
}

const ROLE_TONE: Record<Role, string> = {
  BUYER: "border-sky-400/40 bg-sky-500/10 text-sky-300",
  "CHANNEL PARTNER": "border-violet-400/40 bg-violet-500/10 text-violet-300",
  "DEVELOPER / SELLER": "border-emerald-400/40 bg-emerald-500/10 text-emerald-300",
  AMBASSADOR: "border-amber-400/40 bg-amber-500/10 text-amber-200",
};

/* ── Small reusable visual bits (evoke the feature, brand colours only) ─────── */
function DeviceFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative mx-auto w-full max-w-[260px]">
      <div className="rounded-[2rem] border border-white/12 bg-[#0b1120]/90 p-3 shadow-[0_20px_60px_rgba(59,130,246,0.18)]">
        <div className="overflow-hidden rounded-[1.5rem] border border-white/8 bg-[#070b15]">{children}</div>
      </div>
    </div>
  );
}

const SLIDES: Slide[] = [
  {
    role: "BUYER",
    title: <>Buy property <span className="text-[var(--trust)]">you can trust</span></>,
    sub: "Every property, verified. No fake listings — each project is checked and scored before you see it.",
    visual: (
      <DeviceFrame>
        <div className="space-y-2.5 p-3">
          <div className="flex items-center gap-1.5 text-[10px] text-white/50"><MapPin size={11} /> Lucknow</div>
          <div className="h-24 rounded-lg bg-gradient-to-br from-sky-500/20 to-emerald-500/10" />
          <div className="flex items-center justify-between">
            <div><p className="text-[11px] font-semibold text-white">Green Valley Project</p><p className="text-[9px] text-white/50">Lucknow, UP</p></div>
            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[9px] font-bold text-emerald-300">✓ 78/100</span>
          </div>
        </div>
      </DeviceFrame>
    ),
    features: [
      { icon: ShieldCheck, label: "Verified Listings" },
      { icon: ScanSearch, label: "AI Screened" },
      { icon: Database, label: "Real Data Only" },
    ],
  },
  {
    role: "BUYER",
    title: <>See the <span className="text-[var(--trust)]">Truvi Score™</span></>,
    sub: "Growth potential, legal signals & liquidity — the full picture in one glance.",
    visual: (
      <DeviceFrame>
        <div className="flex flex-col items-center gap-2 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-white/50">Truvi Score™</p>
          <div className="grid size-24 place-items-center rounded-full border-4 border-[var(--trust)]/60 bg-[var(--trust)]/10">
            <span className="font-display text-3xl font-bold text-white">78</span>
          </div>
          <p className="flex items-center gap-1 text-[10px] text-emerald-300"><ShieldCheck size={11} /> Verified by design</p>
          <div className="mt-1 flex gap-1.5">
            <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-[8px] text-emerald-300">Growth High</span>
            <span className="rounded bg-amber-500/15 px-2 py-0.5 text-[8px] text-amber-300">Legal 2</span>
            <span className="rounded bg-sky-500/15 px-2 py-0.5 text-[8px] text-sky-300">Liquidity Med</span>
          </div>
        </div>
      </DeviceFrame>
    ),
    features: [
      { icon: TrendingUp, label: "Growth Potential" },
      { icon: Scale, label: "Legal Signals" },
      { icon: Droplets, label: "Liquidity" },
    ],
  },
  {
    role: "BUYER",
    title: <>Walk the plot <span className="text-[var(--trust)]">in 3D</span></>,
    sub: "Explore layouts, plots and prices in interactive 3D before you visit.",
    visual: (
      <DeviceFrame>
        <div className="relative p-3">
          <div className="h-40 rounded-lg bg-gradient-to-br from-sky-600/25 via-[#0b1120] to-emerald-500/10" />
          <span className="absolute left-5 top-6 rounded-full bg-black/60 px-2 py-0.5 text-[9px] text-white">Green Valley · 3D</span>
          <span className="absolute left-1/2 top-1/2 grid size-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-[var(--trust)] text-white"><MapPin size={12} /></span>
        </div>
      </DeviceFrame>
    ),
    features: [
      { icon: Box, label: "3D Map View" },
      { icon: Layers, label: "Interactive Layouts" },
      { icon: IndianRupee, label: "Live Pricing" },
    ],
  },
  {
    role: "BUYER",
    title: <>Ask Truvi <span className="text-[var(--trust)]">anything</span></>,
    sub: "“Should I buy this plot at ₹1,800/sq ft?” — instant AI answers, every signal sourced.",
    visual: (
      <DeviceFrame>
        <div className="space-y-2 p-3">
          <div className="ml-auto w-[80%] rounded-2xl rounded-br-sm bg-[var(--trust)]/80 p-2 text-[10px] text-white">Should I buy this plot at ₹1,800/sq ft?</div>
          <div className="w-[85%] rounded-2xl rounded-bl-sm border border-white/10 bg-white/5 p-2 text-[10px] text-white/85">Based on 6 verified signals, this property looks good for investment.</div>
          <div className="flex gap-1"><span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[8px] text-emerald-300">Legal ✓</span><span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[8px] text-emerald-300">Location ✓</span><span className="rounded bg-sky-500/15 px-1.5 py-0.5 text-[8px] text-sky-300">Market ↗</span></div>
        </div>
      </DeviceFrame>
    ),
    features: [
      { icon: Sparkles, label: "AI-powered answers" },
      { icon: Scale, label: "Every signal sourced" },
      { icon: BarChart3, label: "Market insight" },
    ],
  },
  {
    role: "BUYER",
    title: <>Book a site visit <span className="text-[var(--trust)]">in seconds</span></>,
    sub: "Found the one? Schedule your visit right from the app.",
    visual: (
      <DeviceFrame>
        <div className="space-y-2 p-3">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold text-white"><CalendarCheck size={13} className="text-[var(--trust)]" /> Site Visit</p>
          <div className="rounded-lg border border-white/10 bg-white/5 p-2 text-[10px] text-white/80">26 Apr 2025</div>
          <div className="flex gap-1.5">
            {["10:00", "12:00", "04:00"].map((t, i) => <span key={t} className={`rounded px-2 py-1 text-[9px] ${i === 1 ? "bg-[var(--trust)] text-white" : "bg-white/5 text-white/60"}`}>{t}</span>)}
          </div>
          <div className="rounded-lg bg-[var(--trust)] py-1.5 text-center text-[10px] font-semibold text-white">Book Visit</div>
        </div>
      </DeviceFrame>
    ),
    features: [
      { icon: CalendarCheck, label: "Pick a slot" },
      { icon: Check, label: "Quick & easy" },
      { icon: MapPin, label: "Green = available" },
    ],
  },
  {
    role: "CHANNEL PARTNER",
    title: <>Sell smarter, <span className="text-violet-300">earn more</span></>,
    sub: "More leads, better tools, bigger earnings — your own CRM built in.",
    visual: (
      <DeviceFrame>
        <div className="space-y-2 p-3">
          <p className="text-[11px] font-semibold text-white">My Leads</p>
          {[["Rohit Sharma", "Hot"], ["Ankit Verma", "Warm"], ["Neha Singh", "Hot"]].map(([n, t]) => (
            <div key={n} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 p-1.5">
              <span className="text-[10px] text-white/85">{n}</span>
              <span className={`rounded px-1.5 py-0.5 text-[8px] ${t === "Hot" ? "bg-rose-500/15 text-rose-300" : "bg-amber-500/15 text-amber-300"}`}>{t}</span>
            </div>
          ))}
        </div>
      </DeviceFrame>
    ),
    features: [
      { icon: Users, label: "Your own Sales CRM" },
      { icon: IndianRupee, label: "Earn on every deal" },
      { icon: Bell, label: "Never miss a follow-up" },
    ],
  },
  {
    role: "DEVELOPER / SELLER",
    title: <>List once, <span className="text-emerald-300">sell faster</span></>,
    sub: "Everything you need to showcase, manage and sell your project — all in one place.",
    visual: (
      <DeviceFrame>
        <div className="space-y-2 p-3">
          <p className="text-[11px] font-semibold text-white">Add Project</p>
          <div className="flex gap-1">{["Project", "Inventory", "Pricing", "Go Live"].map((s, i) => <span key={s} className={`rounded px-1.5 py-0.5 text-[8px] ${i === 0 ? "bg-[var(--trust)] text-white" : "bg-white/5 text-white/50"}`}>{s}</span>)}</div>
          <div className="rounded-lg border border-white/10 bg-white/5 p-1.5 text-[10px] text-white/70">Green Valley</div>
          <div className="rounded-lg border border-white/10 bg-white/5 p-1.5 text-[10px] text-white/70">Lucknow, UP</div>
          <div className="rounded-lg bg-emerald-500/80 py-1.5 text-center text-[10px] font-semibold text-white">Next</div>
        </div>
      </DeviceFrame>
    ),
    features: [
      { icon: Box, label: "3D Maps & Layouts" },
      { icon: RefreshCw, label: "Live Inventory & Updates" },
      { icon: Megaphone, label: "Built-in Marketing" },
    ],
  },
  {
    role: "AMBASSADOR",
    title: <>Grow with Truvi, <span className="text-amber-200">earn as you go</span></>,
    sub: "Complete tasks, climb the leaderboard, and earn as you bring people in. Together we grow.",
    visual: (
      <DeviceFrame>
        <div className="space-y-2 p-3">
          <p className="text-[11px] font-semibold text-white">My Rewards</p>
          <div className="rounded-lg border border-white/10 bg-white/5 p-2">
            <p className="text-[9px] text-white/50">Total Earnings</p>
            <p className="font-display text-xl font-bold text-emerald-300">₹12,450</p>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/5 p-2">
            <p className="text-[9px] text-white/50">Tasks Completed</p>
            <div className="mt-1 h-1.5 w-full rounded-full bg-white/10"><div className="h-full w-3/5 rounded-full bg-amber-300" /></div>
          </div>
        </div>
      </DeviceFrame>
    ),
    features: [
      { icon: Award, label: "Complete tasks, earn rewards" },
      { icon: Trophy, label: "Climb the leaderboard" },
      { icon: BookOpen, label: "Learn from Knowledge Hub" },
    ],
  },
];

/**
 * First-run onboarding — a swipeable, role-based feature tour in the Truvi dark
 * brand. Purely presentational; it never changes app behaviour. Skip / Get
 * Started both dismiss it (and remember that via localStorage).
 */
export default function Onboarding({ onDone }: { onDone: () => void }) {
  const [i, setI] = useState(0);
  const [dir, setDir] = useState(1);
  const [logoFailed, setLogoFailed] = useState(false);
  const slide = SLIDES[i];
  const last = i === SLIDES.length - 1;

  // While the tour is open, hide the global floating buttons (Ask Truvi, Invest,
  // etc.) so they never sit above the fullscreen overlay and swallow taps on the
  // Next / Get Started button.
  useEffect(() => {
    document.body.classList.add("onboarding-open");
    return () => document.body.classList.remove("onboarding-open");
  }, []);

  const go = (n: number) => {
    if (n < 0 || n >= SLIDES.length) return;
    setDir(n > i ? 1 : -1);
    setI(n);
  };
  const finish = () => onDone();

  return (
    <div className="fixed inset-0 flex flex-col bg-[#070b15] text-white" style={{ zIndex: 2147483000, paddingTop: "env(safe-area-inset-top, 0px)", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
      {/* subtle brand glow */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.14),transparent_55%)]" />

      {/* Top bar */}
      <div className="relative flex items-center justify-between px-5 pt-5">
        {/* Real Truvi brand mark — same wordmark (with icon fallback) as the site nav. */}
        {logoFailed ? (
          <div className="flex items-center gap-2 font-display text-sm font-semibold tracking-tight">
            <span className="grid size-7 shrink-0 place-items-center overflow-hidden rounded-lg">
              <img src="/brand/icon.png" alt="" className="h-full w-full object-contain" />
            </span>
            <span className="truncate">TRUVI VENTURES</span>
          </div>
        ) : (
          <img
            src="/brand/wordmark.png"
            alt="Truvi Ventures"
            onError={() => setLogoFailed(true)}
            className="h-6 w-auto max-w-[150px] shrink-0 object-contain sm:h-7 sm:max-w-[175px]"
          />
        )}
        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${ROLE_TONE[slide.role]}`}>{slide.role}</span>
      </div>

      {/* Slide body */}
      <div className="relative flex flex-1 flex-col overflow-hidden px-6">
        <AnimatePresence mode="wait" custom={dir}>
          <motion.div
            key={i}
            custom={dir}
            initial={{ opacity: 0, x: dir * 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: dir * -40 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.15}
            onDragEnd={(_e, info) => {
              if (info.offset.x < -60) go(i + 1);
              else if (info.offset.x > 60) go(i - 1);
            }}
            className="flex flex-1 flex-col justify-center gap-5 py-4"
          >
            <div className="space-y-2">
              <h2 className="font-display text-[28px] font-semibold leading-tight tracking-tight">{slide.title}</h2>
              <p className="max-w-md text-sm text-white/70">{slide.sub}</p>
            </div>

            <div className="py-2">{slide.visual}</div>

            <div className="flex flex-wrap gap-2">
              {slide.features.map((f) => (
                <span key={f.label} className="inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-white/85">
                  <f.icon size={13} className="text-[var(--trust)]" /> {f.label}
                </span>
              ))}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Footer: dots + actions */}
      <div className="relative px-6 pb-6 pt-2">
        <div className="mb-4 flex items-center justify-center gap-1.5">
          {SLIDES.map((_, idx) => (
            <button key={idx} onClick={() => go(idx)} aria-label={`Go to slide ${idx + 1}`} className={`h-1.5 rounded-full transition-all ${idx === i ? "w-6 bg-[var(--trust)]" : "w-1.5 bg-white/20"}`} />
          ))}
        </div>
        <div className="flex items-center justify-between gap-3">
          <button onClick={finish} className="text-sm font-medium text-white/50 hover:text-white">Skip</button>
          {last ? (
            <button onClick={finish} className="inline-flex items-center gap-2 rounded-full bg-[var(--trust)] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[var(--trust)]/85">
              Get Started <ArrowRight size={16} />
            </button>
          ) : (
            <button onClick={() => go(i + 1)} className="inline-flex items-center gap-2 rounded-full bg-[var(--trust)] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[var(--trust)]/85">
              Next <ArrowRight size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
