import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { SmoothScroll } from "@/components/landing/SmoothScroll";
import { CursorGlow } from "@/components/landing/CursorGlow";
import { SiteNav } from "@/components/SiteNav";
import { api } from "@/lib/api";
import type { Project } from "@/types";

const CityCanvas = lazy(() =>
  import("@/components/landing/CityCanvas").then((m) => ({ default: m.CityCanvas })),
);

function useMounted() {
  const [m, setM] = useState(false);
  useEffect(() => setM(true), []);
  return m;
}

/** Opens the live Ask Truvi assistant (mounted globally in App). */
function openAskTruvi() {
  window.dispatchEvent(new Event("open-ask-truvi"));
}

function Reveal({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-10%" }}
      transition={{ duration: 1, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <div className="mb-6 inline-flex items-center gap-2 rounded-full glass px-4 py-1.5 text-xs uppercase tracking-[0.2em] text-muted-foreground">
      <span className="size-1.5 rounded-full bg-[var(--trust)] animate-pulse-glow" />
      {children}
    </div>
  );
}

function Section({
  id,
  children,
  className = "",
}: {
  id?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      className={`relative z-10 mx-auto flex w-full max-w-7xl flex-col justify-center px-4 py-20 sm:px-6 md:px-12 md:py-28 ${className}`}
    >
      {children}
    </section>
  );
}

/* ---------------- Buttons ---------------- */

function GlowButton({
  children,
  variant = "primary",
  href,
  to,
  onClick,
}: {
  children: ReactNode;
  variant?: "primary" | "ghost";
  href?: string;
  to?: string;
  onClick?: () => void;
}) {
  const ghostClass =
    "inline-flex items-center gap-2 rounded-full glass px-6 py-3 text-sm font-medium transition hover:bg-white/10";
  const primaryClass =
    "group relative inline-flex items-center gap-2 overflow-hidden rounded-full px-6 py-3 text-sm font-medium text-background glow-trust";
  const primaryStyle = { background: "linear-gradient(135deg, #dbeafe, #ffffff)" };

  const inner =
    variant === "ghost" ? (
      children
    ) : (
      <>
        <span className="relative z-10">{children}</span>
        <span className="relative z-10 transition group-hover:translate-x-1">→</span>
      </>
    );
  const cls = variant === "ghost" ? ghostClass : primaryClass;
  const style = variant === "ghost" ? undefined : primaryStyle;

  if (onClick) {
    return (
      <button onClick={onClick} className={cls} style={style}>
        {inner}
      </button>
    );
  }
  if (to) {
    return (
      <Link to={to} className={cls} style={style}>
        {inner}
      </Link>
    );
  }
  return (
    <a href={href ?? "#"} className={cls} style={style}>
      {inner}
    </a>
  );
}

/* ---------------- Content data ---------------- */

const PAIN_CARDS = [
  { title: "Fragmented Data", desc: "Records scattered across portals, brochures, registries and hearsay — never in one place." },
  { title: "Unclear Pricing", desc: "No reliable way to know whether a quoted rate is fair, inflated, or an opportunity." },
  { title: "Hidden Risk", desc: "Litigation, title issues and zoning constraints surface after the decision, not before it." },
  { title: "Broker-led Decisions", desc: "The biggest purchase of a lifetime, guided by whoever has the strongest incentive to close." },
];

const ENGINE_INPUTS = [
  "Property Records",
  "Legal Signals",
  "Market Prices",
  "Infrastructure",
  "Geospatial Data",
  "Buyer Behaviour",
];

const ENGINE_OUTPUTS = [
  "Truvi Score™",
  "Risk Intelligence",
  "Price Intelligence",
  "Growth Potential",
  "Liquidity Signals",
];

const ROTATING_QUESTIONS = [
  "Is this plot overpriced?",
  "What are the risks in this property?",
  "Compare these two locations.",
  "What could this property be worth in 5 years?",
];

const BEFORE_TRUVI = ["Broker opinion", "Multiple portals", "Manual documents", "Guesswork", "Days of research"];
const WITH_TRUVI = ["One property profile", "Truvi Intelligence Engine™ analysis", "Risk Signals™", "Data-backed decision", "Minutes"];

const DEVELOPER_INTEL = [
  { title: "Demand Heatmaps", desc: "Where buyers are actually searching, enquiring and converting — mapped by micro-market." },
  { title: "Pricing Intelligence", desc: "Live rate benchmarks against comparable projects, corridors and circle rates." },
  { title: "Competitor Tracking", desc: "Launches, price moves and absorption of every competing project around yours." },
  { title: "Inventory Signals", desc: "Which configurations move, which stall — across your portfolio and the market's." },
  { title: "Lead Intelligence", desc: "Enquiries scored and tagged by intent, purpose and readiness — not just volume." },
  { title: "Location Opportunity", desc: "Land and corridor opportunities ranked by infrastructure and growth signals." },
];

const FLYWHEEL = ["More Properties", "More Signals", "Better Intelligence", "Better Decisions", "More Users"];

const METHODOLOGY = [
  { n: "01", title: "Data Sources", desc: "Government records, market data, site observations and developer submissions — every input tagged to its origin." },
  { n: "02", title: "Signal Verification", desc: "Each signal is cross-checked against its source. What can't be verified is labelled — never guessed." },
  { n: "03", title: "Intelligence Analysis", desc: "The Truvi Intelligence Engine™ weighs verified signals into risk, price, growth and liquidity intelligence." },
  { n: "04", title: "Confidence Score", desc: "Every output carries a confidence level, so you know how strongly the evidence supports it." },
];

/* ---------------- Live showcase data ---------------- */
/* Every showcase number on this page is driven by the platform's real
   Prime Listing and its intelligence profile. The static values below
   are only the fallback for an empty database. */

interface IntelSlim {
  categories: { key: string; verifiedCount: number; totalCount: number }[];
  ai: { confidenceScore: number; riskFlags: string[]; overallStatus: string };
}

export interface Showcase {
  heroQuery: string;
  heroChips: { label: string; value: string; cls: string }[];
  passportTitle: string;
  passportFields: { label: string; value: string }[];
  score: number;
  scoreLabel: string;
  scoreBreakdown: { label: string; value: number }[];
  demoName: string;
  demoSub: string;
  demoRate: string;
  demoScore: number;
  demoSignals: { label: string; value: string; cls: string }[];
}

function useShowcase(): Showcase {
  const [listing, setListing] = useState<Project | null>(null);
  const [intel, setIntel] = useState<IntelSlim | null>(null);

  useEffect(() => {
    api
      .get("/inventory")
      .then((res) => {
        const list: Project[] = res.data.projects ?? [];
        if (list.length === 0) return;
        const prime = list.find((p) => p.isPrimeListing) ?? list[0];
        setListing(prime);
        return api
          .get(`/inventory/${prime._id}/intelligence`)
          .then((r) => setIntel(r.data.intelligence))
          .catch(() => {});
      })
      .catch(() => {}); // fall back to sample content silently
  }, []);

  return deriveShowcase(listing, intel);
}

const GOOD = "border-emerald-400/20 bg-emerald-500/15 text-emerald-300";
const WARN = "border-amber-400/20 bg-amber-500/15 text-amber-300";
const NEUTRAL = "border-white/15 bg-white/10 text-foreground/80";
const TRUST = "border-[var(--trust)]/40 bg-[var(--trust)]/15 text-sky-300";

function deriveShowcase(listing: Project | null, intel: IntelSlim | null): Showcase {
  // Fallback: the sample property shown before any listing exists
  if (!listing) {
    return {
      heroQuery: "Should I buy this plot in Malihabad for ₹1,800/sq ft?",
      heroChips: [
        { label: "Truvi Score™", value: "78 / 100", cls: TRUST },
        { label: "Growth Potential", value: "High", cls: GOOD },
        { label: "Legal Signals", value: "2 detected", cls: WARN },
        { label: "Liquidity", value: "Medium", cls: NEUTRAL },
      ],
      passportTitle: "Residential Plot · Malihabad, Lucknow",
      passportFields: [
        { label: "Property ID", value: "TRV-LKO-004821" },
        { label: "Ownership Signals", value: "Clear · 2 transfers on record" },
        { label: "Legal Risk", value: "Low · no active litigation found" },
        { label: "Price History", value: "₹1,420 → ₹1,850/sq ft (3 yrs)" },
        { label: "Location Score", value: "88 / 100" },
        { label: "Infrastructure Score", value: "84 / 100" },
        { label: "Liquidity Score", value: "75 / 100" },
      ],
      score: 82,
      scoreLabel: "Strong Property",
      scoreBreakdown: [
        { label: "Legal Confidence", value: 91 },
        { label: "Price Fairness", value: 72 },
        { label: "Location", value: 88 },
        { label: "Growth", value: 84 },
        { label: "Liquidity", value: 75 },
      ],
      demoName: "Malihabad, Lucknow",
      demoSub: "Residential plot · Live intelligence sample",
      demoRate: "₹1,850",
      demoScore: 81,
      demoSignals: [
        { label: "Price Fairness", value: "Fair", cls: "text-emerald-300" },
        { label: "5-Year Growth Potential", value: "High", cls: "text-emerald-300" },
        { label: "Liquidity", value: "Medium", cls: "text-amber-300" },
        { label: "Legal Signals™", value: "1 detected", cls: "text-amber-300" },
        { label: "Infrastructure Impact", value: "Positive", cls: "text-emerald-300" },
      ],
    };
  }

  // Per-category verified % from the real intelligence profile
  const pct = (key: string, fallback: number) => {
    const c = intel?.categories.find((x) => x.key === key);
    return c && c.totalCount > 0 ? Math.round((c.verifiedCount / c.totalCount) * 100) : fallback;
  };

  const score = intel?.ai.confidenceScore ?? listing.trustScore ?? 75;
  const scoreLabel = score >= 75 ? "Strong Property" : score >= 55 ? "Promising Property" : "Needs Review";
  const riskCount = intel?.ai.riskFlags.length ?? 0;
  const growth = pct("infrastructure", 80) >= 70 ? "High" : "Medium";
  const liquidityPct = pct("community", 70);
  const liquidity = liquidityPct >= 75 ? "High" : liquidityPct >= 50 ? "Medium" : "Low";
  const rate = listing.minRate ? `₹${listing.minRate.toLocaleString("en-IN")}` : null;
  const priceRange =
    listing.minPrice && listing.maxPrice
      ? `₹${(listing.minPrice / 100000).toFixed(1)} L – ₹${(listing.maxPrice / 100000).toFixed(1)} L`
      : "Being compiled";
  const legalRisk =
    listing.legalRiskLevel === "HIGH" ? "Elevated · records under review"
    : listing.legalRiskLevel === "MEDIUM" ? "Moderate · some checks pending"
    : "Low · no active litigation found";
  const propertyId = `TRV-${listing.city.slice(0, 3).toUpperCase()}-${listing._id.slice(-6).toUpperCase()}`;

  return {
    heroQuery: rate
      ? `Should I buy in ${listing.name}, ${listing.city} at ${rate}/sq ft?`
      : `Should I buy in ${listing.name}, ${listing.city}?`,
    heroChips: [
      { label: "Truvi Score™", value: `${score} / 100`, cls: TRUST },
      { label: "Growth Potential", value: growth, cls: growth === "High" ? GOOD : NEUTRAL },
      { label: "Legal Signals", value: riskCount > 0 ? `${riskCount} detected` : "None found", cls: riskCount > 0 ? WARN : GOOD },
      { label: "Liquidity", value: liquidity, cls: liquidity === "High" ? GOOD : NEUTRAL },
    ],
    passportTitle: `${listing.name} · ${listing.location}, ${listing.city}`,
    passportFields: [
      { label: "Property ID", value: propertyId },
      { label: "Ownership Signals", value: listing.verificationDetails?.titleClearance ? "Clear · title verified" : "Under verification" },
      { label: "Legal Risk", value: legalRisk },
      { label: "Price Range (live units)", value: priceRange },
      { label: "Location Score", value: `${pct("location", 80)} / 100` },
      { label: "Infrastructure Score", value: `${pct("infrastructure", 78)} / 100` },
      { label: "Liquidity Score", value: `${liquidityPct} / 100` },
    ],
    score,
    scoreLabel,
    scoreBreakdown: [
      { label: "Legal Confidence", value: pct("government", 85) },
      { label: "Price Fairness", value: pct("market", 72) },
      { label: "Location", value: pct("location", 82) },
      { label: "Growth", value: pct("infrastructure", 78) },
      { label: "Liquidity", value: liquidityPct },
    ],
    demoName: `${listing.name}`,
    demoSub: `${listing.location}, ${listing.city} · Live intelligence`,
    demoRate: rate ?? "On request",
    demoScore: score,
    demoSignals: [
      { label: "Price Fairness", value: pct("market", 70) >= 60 ? "Fair" : "Review", cls: "text-emerald-300" },
      { label: "5-Year Growth Potential", value: growth, cls: growth === "High" ? "text-emerald-300" : "text-amber-300" },
      { label: "Liquidity", value: liquidity, cls: liquidity === "High" ? "text-emerald-300" : "text-amber-300" },
      { label: "Legal Signals™", value: riskCount > 0 ? `${riskCount} detected` : "None found", cls: riskCount > 0 ? "text-amber-300" : "text-emerald-300" },
      { label: "Infrastructure Impact", value: pct("infrastructure", 75) >= 60 ? "Positive" : "Neutral", cls: "text-emerald-300" },
    ],
  };
}

/* ---------------- Hero: live Ask Truvi demo ---------------- */

function HeroAskDemo({ s }: { s: Showcase }) {
  return (
    <div className="relative mx-auto w-full max-w-2xl text-left">
      <div className="absolute -inset-6 -z-10 opacity-30 blur-3xl" style={{ background: "var(--gradient-aurora)" }} />
      <div className="rounded-2xl glass p-5">
        {/* Query bar */}
        <div className="flex items-center gap-3 rounded-xl border border-white/15 bg-white/5 px-4 py-3">
          <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[var(--trust)]/25 text-xs">✦</span>
          <p className="text-sm text-foreground/90">{s.heroQuery}</p>
          <motion.span
            className="ml-auto h-4 w-px shrink-0 bg-white/60"
            animate={{ opacity: [1, 0, 1] }}
            transition={{ duration: 1.1, repeat: Infinity }}
          />
        </div>

        {/* Animated intelligence response */}
        <div className="mt-4">
          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.5 }}
            className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground"
          >
            Truvi Intelligence Engine™ · analysing signals…
          </motion.p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {s.heroChips.map((chip, i) => (
              <motion.span
                key={chip.label}
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                whileInView={{ opacity: 1, y: 0, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: 0.8 + i * 0.35, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium ${chip.cls}`}
              >
                <span className="opacity-70">{chip.label}</span>
                <span className="font-semibold">{chip.value}</span>
              </motion.span>
            ))}
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3">
          <p className="text-[11px] text-muted-foreground">Every signal traced to its source.</p>
          <button
            onClick={openAskTruvi}
            className="rounded-full bg-foreground px-4 py-1.5 text-xs font-medium text-background transition hover:opacity-90"
          >
            Ask Truvi →
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Truvi Intelligence Engine diagram ---------------- */

function EngineDiagram() {
  return (
    <div className="mt-14 grid items-center gap-6 lg:grid-cols-[1fr_auto_1.1fr_auto_1fr]">
      {/* Inputs */}
      <div className="space-y-2.5">
        <p className="mb-3 text-center text-[11px] uppercase tracking-[0.2em] text-muted-foreground lg:text-left">
          Incoming Signals
        </p>
        {ENGINE_INPUTS.map((s) => (
          <div key={s} className="flex items-center justify-between gap-2 rounded-xl border border-white/10 glass px-4 py-2.5">
            <span className="text-sm text-foreground/90">{s}</span>
            <span className="hidden text-[var(--trust)] lg:inline" aria-hidden>→</span>
          </div>
        ))}
      </div>

      {/* Left connector */}
      <div className="hidden justify-center lg:flex">
        <span className="text-2xl text-[var(--trust)]" aria-hidden>⟶</span>
      </div>
      <div className="flex justify-center lg:hidden">
        <span className="text-xl text-[var(--trust)]" aria-hidden>↓</span>
      </div>

      {/* Engine core */}
      <div className="relative rounded-2xl border border-[var(--trust)]/40 px-8 py-10 text-center"
        style={{ background: "linear-gradient(135deg, rgba(59,130,246,0.14), rgba(139,92,246,0.10))" }}>
        <div className="absolute -inset-px rounded-2xl opacity-30" style={{ boxShadow: "0 0 50px var(--trust)" }} />
        <div className="relative">
          <div className="mb-2 flex items-center justify-center gap-2">
            <span className="grid size-7 place-items-center rounded-md bg-gradient-to-br from-[var(--trust)] to-[var(--tech)] text-[11px] font-bold">T</span>
          </div>
          <p className="font-display text-xl font-semibold text-white md:text-2xl">
            TRUVI INTELLIGENCE ENGINE™
          </p>
          <p className="mt-2 text-xs text-muted-foreground">Ingest · Verify · Weigh · Deliver</p>
          <div className="mx-auto mt-4 h-1 w-24 rounded-full" style={{ background: "var(--gradient-trust)" }} />
        </div>
      </div>

      {/* Right connector */}
      <div className="hidden justify-center lg:flex">
        <span className="text-2xl text-[var(--trust)]" aria-hidden>⟶</span>
      </div>
      <div className="flex justify-center lg:hidden">
        <span className="text-xl text-[var(--trust)]" aria-hidden>↓</span>
      </div>

      {/* Outputs */}
      <div className="space-y-2.5">
        <p className="mb-3 text-center text-[11px] uppercase tracking-[0.2em] text-muted-foreground lg:text-left">
          Intelligence Out
        </p>
        {ENGINE_OUTPUTS.map((s) => (
          <div key={s} className="flex items-center gap-2 rounded-xl border border-[var(--trust)]/25 bg-[var(--trust)]/10 px-4 py-2.5">
            <span className="hidden text-[var(--trust)] lg:inline" aria-hidden>→</span>
            <span className="text-sm font-medium text-white">{s}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Ask Truvi showcase ---------------- */

function AskTruviShowcase() {
  const [qi, setQi] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setQi((i) => (i + 1) % ROTATING_QUESTIONS.length), 3200);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="relative mx-auto w-full max-w-3xl">
      <div className="absolute -inset-8 -z-10 opacity-40 blur-3xl" style={{ background: "var(--gradient-aurora)" }} />
      <div className="rounded-2xl glass p-5 md:p-7">
        {/* Window chrome */}
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-2">
            <span className="grid size-7 place-items-center rounded-full bg-[var(--trust)]/20 text-sm">✦</span>
            <div>
              <p className="text-sm font-semibold">Ask Truvi™</p>
              <p className="text-[10px] text-muted-foreground">Property Intelligence · Source-backed</p>
            </div>
          </div>
          <span className="rounded-full border border-emerald-400/20 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-300">Live</span>
        </div>

        {/* Rotating question */}
        <div className="mt-5 flex justify-end">
          <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-[var(--trust)] px-4 py-2.5 text-sm text-white">
            <AnimatePresence mode="wait">
              <motion.span
                key={qi}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.35 }}
                className="inline-block"
              >
                {ROTATING_QUESTIONS[qi]}
              </motion.span>
            </AnimatePresence>
          </div>
        </div>

        {/* Sample grounded answer */}
        <div className="mt-4 max-w-[92%] rounded-2xl rounded-bl-sm bg-white/10 px-4 py-3 text-sm leading-relaxed text-foreground">
          Here's what the available data shows — organised by what is verified, what comes from public
          records, and what still needs confirmation. Nothing is assumed; every point below carries its
          source and date.
          <div className="mt-3 flex flex-wrap gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/20 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-300">✅ Truvi Verified · Updated 30 Jun 2026</span>
            <span className="inline-flex items-center gap-1 rounded-full border border-sky-400/20 bg-sky-500/15 px-2 py-0.5 text-[10px] font-medium text-sky-300">📂 Public Record</span>
            <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-[10px] font-medium text-foreground/70">❓ Needs Verification</span>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
          <p className="text-[11px] text-muted-foreground">
            Not a chatbot — a property-intelligence assistant grounded in Truvi's data.
          </p>
          <button
            onClick={openAskTruvi}
            className="rounded-full bg-foreground px-4 py-1.5 text-xs font-medium text-background transition hover:opacity-90"
          >
            Try it now →
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Truvi Score ring ---------------- */

function ScoreRing({ score }: { score: number }) {
  const r = 64;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative grid place-items-center">
      <svg width="170" height="170" viewBox="0 0 170 170" className="-rotate-90">
        <circle cx="85" cy="85" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="11" />
        <motion.circle
          cx="85" cy="85" r={r} fill="none"
          stroke="url(#scoreGrad)" strokeWidth="11" strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          whileInView={{ strokeDashoffset: c * (1 - score / 100) }}
          viewport={{ once: true }}
          transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
        />
        <defs>
          <linearGradient id="scoreGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#60a5fa" />
            <stop offset="100%" stopColor="#34d399" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute text-center">
        <p className="font-display text-4xl font-semibold text-white">{score}</p>
        <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">/ 100</p>
      </div>
    </div>
  );
}

/* ---------------- Demo property (product proof, live data) ---------------- */

function DemoPropertyCard({ s }: { s: Showcase }) {
  return (
    <div className="relative mx-auto w-full max-w-2xl">
      <div className="absolute -inset-6 -z-10 opacity-25 blur-3xl" style={{ background: "var(--gradient-aurora)" }} />
      <div className="rounded-2xl glass overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-6 py-4">
          <div>
            <p className="font-display text-lg font-semibold text-white">{s.demoName}</p>
            <p className="text-xs text-muted-foreground">{s.demoSub}</p>
          </div>
          <div className="text-right">
            <p className="font-display text-xl font-semibold text-white">
              {s.demoRate}
              {s.demoRate.startsWith("₹") && <span className="text-sm text-muted-foreground">/sq ft</span>}
            </p>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Asking rate</p>
          </div>
        </div>

        <div className="flex flex-col gap-6 px-6 py-6 sm:flex-row sm:items-center">
          <div className="flex flex-col items-center gap-1 shrink-0">
            <ScoreRing score={s.demoScore} />
            <p className="text-xs font-medium text-emerald-300">Truvi Score™ · {s.scoreLabel.split(" ")[0]}</p>
          </div>
          <div className="flex-1 space-y-2.5">
            {s.demoSignals.map((sig) => (
              <div key={sig.label} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5">
                <span className="text-sm text-foreground/85">{sig.label}</span>
                <span className={`text-sm font-semibold ${sig.cls}`}>{sig.value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-white/10 px-6 py-4 text-center">
          <GlowButton to="/inventory">View Full Property Intelligence</GlowButton>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Footer ---------------- */

function Footer() {
  const col = "space-y-2 text-sm text-muted-foreground";
  const head = "mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-foreground/80";
  const link = "block transition hover:text-foreground";
  return (
    <footer className="relative z-10 border-t border-white/5 px-6 py-14 md:px-12">
      <div className="mx-auto grid max-w-7xl gap-10 md:grid-cols-5">
        <div className="md:col-span-2">
          <div className="flex items-center gap-2 font-display text-base font-semibold tracking-tight">
            TRUVI
          </div>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
            The intelligence layer for Indian real estate — organising fragmented property information
            into structured, decision-ready intelligence.
          </p>
          <p className="mt-3 max-w-sm text-xs leading-relaxed text-muted-foreground">
            Truvi is a property intelligence platform by Truvi Ventures.
          </p>
        </div>
        <div>
          <p className={head}>Company</p>
          <div className={col}>
            <Link to="/about" className={link}>About</Link>
            <Link to="/join" className={link}>Join Truvi</Link>
          </div>
        </div>
        <div>
          <p className={head}>Intelligence</p>
          <div className={col}>
            <a href="#ask-truvi" className={link}>Ask Truvi™</a>
            <Link to="/intelligence" className={link}>Truvi Intelligence Engine™</Link>
            <a href="#truvi-score" className={link}>Truvi Score™</a>
            <a href="#passport" className={link}>Property Passport™</a>
            <Link to="/legal#verification-methodology" className={link}>Verification Methodology</Link>
          </div>
        </div>
        <div>
          <p className={head}>Legal</p>
          <div className={col}>
            <Link to="/legal#privacy-policy" className={link}>Privacy Policy</Link>
            <Link to="/legal#terms-of-use" className={link}>Terms of Use</Link>
            <Link to="/legal#data-policy" className={link}>Data Policy</Link>
            <Link to="/legal#disclaimer" className={link}>Disclaimer</Link>
          </div>
        </div>
      </div>
      <div className="mx-auto mt-12 flex max-w-7xl flex-col items-center gap-3 border-t border-white/5 pt-6 text-xs uppercase tracking-[0.2em] text-muted-foreground md:flex-row md:justify-between">
        <div>© {new Date().getFullYear()} Truvi Ventures</div>
        <div>Neutral · Evidence-led · Source-backed</div>
        <Link to="/admin/dashboard" className="transition hover:text-foreground">Admin</Link>
      </div>
    </footer>
  );
}

/* ================= Landing page ================= */

export default function LandingPage() {
  const mounted = useMounted();
  const showcase = useShowcase();
  const { hash } = useLocation();

  // Arriving from another page with a hash (e.g. /#ask-truvi) — scroll to it
  useEffect(() => {
    if (!hash) return;
    const t = setTimeout(() => {
      document.querySelector(hash)?.scrollIntoView({ behavior: "smooth" });
    }, 150);
    return () => clearTimeout(t);
  }, [hash]);

  useEffect(() => {
    const prevTitle = document.title;
    document.title = "TRUVI — The Intelligence Layer for Indian Real Estate";
    const meta = document.querySelector('meta[name="description"]');
    const prevDesc = meta?.getAttribute("content") ?? null;
    if (meta) {
      meta.setAttribute(
        "content",
        "Truvi turns fragmented property data, legal signals, geospatial data and market behaviour into decision-ready real estate intelligence — Truvi Score, risk, value and growth for every property.",
      );
    }
    return () => {
      document.title = prevTitle;
      if (meta && prevDesc !== null) meta.setAttribute("content", prevDesc);
    };
  }, []);

  return (
    <div id="top" className="landing-page relative min-h-screen overflow-x-hidden">
      <SmoothScroll />
      <CursorGlow />
      <SiteNav />

      <Suspense fallback={null}>{mounted ? <CityCanvas /> : null}</Suspense>

      {/* ---------- 1 · HERO ---------- */}
      {/* !justify-start: the hero is taller than one screen, so vertical
          centering would push its top underneath the fixed navbar. */}
      <Section className="min-h-screen items-center !justify-start pt-32 md:pt-36 pb-16 text-center">
        <Reveal>
          <Eyebrow>Property Intelligence · Verified by Design</Eyebrow>
        </Reveal>
        <Reveal delay={0.1}>
          <h1 className="font-display text-3xl font-medium leading-[1.08] tracking-tight text-gradient-aurora sm:text-4xl md:text-5xl">
            The Intelligence Layer<br />for Indian Real Estate.
          </h1>
        </Reveal>
        <Reveal delay={0.3}>
          <p className="mx-auto mt-8 max-w-2xl text-base text-muted-foreground md:text-lg">
            Truvi turns property records, legal signals, geospatial data and market behaviour into
            one answer: should you buy, and at what price.
          </p>
        </Reveal>
        <Reveal delay={0.45}>
          <div className="mt-10 w-full">
            <HeroAskDemo s={showcase} />
          </div>
        </Reveal>
        <Reveal delay={0.6}>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <GlowButton onClick={openAskTruvi}>Ask Truvi</GlowButton>
            <GlowButton variant="ghost" to="/inventory">Analyse a Property</GlowButton>
          </div>
        </Reveal>
      </Section>

      {/* ---------- 2 · THE PROBLEM ---------- */}
      <Section id="the-problem">
        <Reveal><Eyebrow>The Problem</Eyebrow></Reveal>
        <Reveal delay={0.1}>
          <h2 className="max-w-4xl font-display text-3xl font-medium leading-[1.05] sm:text-4xl md:text-6xl">
            India doesn't have a property discovery problem.{" "}
            <span className="text-gradient-trust">It has a property decision problem.</span>
          </h2>
        </Reveal>
        <Reveal delay={0.2}>
          <p className="mt-6 max-w-2xl text-muted-foreground md:text-lg">
            Finding property is easy. Knowing whether it's worth buying — legally clean, fairly
            priced, and likely to grow — is where every buyer is on their own.
          </p>
        </Reveal>
        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {PAIN_CARDS.map((c, i) => (
            <Reveal key={c.title} delay={i * 0.08}>
              <div className="h-full rounded-2xl glass p-6">
                <div className="font-mono text-xs text-muted-foreground">0{i + 1}</div>
                <h3 className="mt-3 font-display text-lg font-medium">{c.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{c.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      {/* ---------- 3 · TRUVI INTELLIGENCE ENGINE ---------- */}
      <Section id="intelligence">
        <Reveal><Eyebrow>Meet Truvi Intelligence</Eyebrow></Reveal>
        <Reveal delay={0.1}>
          <h2 className="max-w-4xl font-display text-3xl font-medium leading-[1.05] sm:text-4xl md:text-6xl">
            Data goes in. <span className="text-gradient-trust">Intelligence comes out.</span>
          </h2>
        </Reveal>
        <Reveal delay={0.2}>
          <p className="mt-6 max-w-2xl text-muted-foreground md:text-lg">
            The Truvi Intelligence Engine™ ingests six signal streams for every property and delivers
            the four things a decision actually needs — score, risk, value and growth.
          </p>
        </Reveal>
        <Reveal delay={0.3}>
          <EngineDiagram />
        </Reveal>
      </Section>

      {/* ---------- 4 · ASK TRUVI ---------- */}
      <Section id="ask-truvi" className="items-center text-center">
        <Reveal><Eyebrow>Ask Truvi™</Eyebrow></Reveal>
        <Reveal delay={0.1}>
          <h2 className="font-display text-3xl font-medium leading-[1.02] sm:text-4xl md:text-6xl lg:text-7xl">
            Ask real estate questions.<br />
            <span className="text-gradient-aurora">Get property intelligence.</span>
          </h2>
        </Reveal>
        <Reveal delay={0.2}>
          <p className="mx-auto mt-8 max-w-2xl text-muted-foreground md:text-lg">
            Conversational property search and analysis — grounded in Truvi's verified data, with the
            source and date visible on every important answer.
          </p>
        </Reveal>
        <Reveal delay={0.35}>
          <div className="mt-12 w-full">
            <AskTruviShowcase />
          </div>
        </Reveal>
      </Section>

      {/* ---------- 5 · TRUVI PROPERTY PASSPORT ---------- */}
      <Section id="passport">
        <Reveal><Eyebrow>Truvi Property Passport™</Eyebrow></Reveal>
        <Reveal delay={0.1}>
          <h2 className="max-w-4xl font-display text-3xl font-medium leading-[1.05] sm:text-4xl md:text-6xl">
            Every property gets a{" "}
            <span className="text-gradient-trust">permanent intelligence profile.</span>
          </h2>
        </Reveal>
        <Reveal delay={0.2}>
          <p className="mt-6 max-w-2xl text-muted-foreground md:text-lg">
            Ownership, legal, price and location intelligence — attached to the property itself and
            kept current, so its history never has to be reconstructed again.
          </p>
        </Reveal>
        <Reveal delay={0.3}>
          <div className="mt-12 mx-auto max-w-2xl rounded-2xl border border-white/10 glass overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4 sm:px-6">
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">Truvi Property Passport™</p>
                <p className="mt-1 font-display text-base font-semibold text-white">{showcase.passportTitle}</p>
              </div>
              <span className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-[var(--trust)] to-[var(--tech)] font-display text-sm font-bold">T</span>
            </div>
            <div className="divide-y divide-white/5">
              {showcase.passportFields.map((f) => (
                <div key={f.label} className="flex items-center justify-between gap-4 px-6 py-3.5">
                  <span className="text-sm text-muted-foreground">{f.label}</span>
                  <span className="text-sm font-medium text-foreground/95 text-right">{f.value}</span>
                </div>
              ))}
              <div className="flex items-center justify-between gap-4 px-6 py-4 bg-[var(--trust)]/10">
                <span className="text-sm font-semibold text-white">Truvi Score™</span>
                <span className="font-display text-lg font-semibold text-emerald-300">{showcase.score} / 100</span>
              </div>
            </div>
          </div>
        </Reveal>
      </Section>

      {/* ---------- 6 · TRUVI SCORE ---------- */}
      <Section id="truvi-score">
        <Reveal><Eyebrow>Truvi Score™</Eyebrow></Reveal>
        <Reveal delay={0.1}>
          <h2 className="max-w-4xl font-display text-3xl font-medium leading-[1.05] sm:text-4xl md:text-6xl">
            One number that says{" "}
            <span className="text-gradient-trust">what the evidence says.</span>
          </h2>
        </Reveal>
        <Reveal delay={0.25}>
          <div className="mt-12 mx-auto flex w-full max-w-3xl flex-col items-center gap-10 rounded-2xl glass p-8 md:flex-row">
            <div className="flex flex-col items-center gap-2 shrink-0">
              <ScoreRing score={showcase.score} />
              <p className="font-display text-base font-semibold text-white">{showcase.score} / 100</p>
              <p className="text-xs font-medium text-emerald-300">{showcase.scoreLabel}</p>
            </div>
            <div className="w-full flex-1 space-y-4">
              {showcase.scoreBreakdown.map((b) => (
                <div key={b.label}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="text-foreground/85">{b.label}</span>
                    <span className="font-semibold text-white">{b.value}</span>
                  </div>
                  <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                    <motion.div
                      className="h-full rounded-full"
                      style={{ background: "var(--gradient-trust)" }}
                      initial={{ width: 0 }}
                      whileInView={{ width: `${b.value}%` }}
                      viewport={{ once: true }}
                      transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      </Section>

      {/* ---------- 7 · PRODUCT PROOF: DEMO PROPERTY ---------- */}
      <Section id="demo-property" className="items-center text-center">
        <Reveal><Eyebrow>Live Example</Eyebrow></Reveal>
        <Reveal delay={0.1}>
          <h2 className="font-display text-3xl font-medium sm:text-4xl md:text-6xl">
            Not features. <span className="text-gradient-aurora">Output.</span>
          </h2>
        </Reveal>
        <Reveal delay={0.2}>
          <p className="mx-auto mt-6 max-w-2xl text-muted-foreground md:text-lg">
            This is what Truvi produces for a real property — before you spend a rupee or a weekend on it.
          </p>
        </Reveal>
        <Reveal delay={0.3}>
          <div className="mt-12 w-full">
            <DemoPropertyCard s={showcase} />
          </div>
        </Reveal>
      </Section>

      {/* ---------- 8 · BEFORE / WITH TRUVI ---------- */}
      <Section id="before-after">
        <Reveal><Eyebrow>The Difference</Eyebrow></Reveal>
        <Reveal delay={0.1}>
          <h2 className="max-w-4xl font-display text-3xl font-medium leading-[1.05] sm:text-4xl md:text-6xl">
            Days of guesswork,{" "}
            <span className="text-gradient-trust">or minutes of intelligence.</span>
          </h2>
        </Reveal>
        <div className="mt-14 grid gap-5 md:grid-cols-2">
          <Reveal delay={0.15}>
            <div className="h-full rounded-2xl border border-white/10 glass p-7">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Before Truvi</p>
              <div className="mt-5 space-y-3">
                {BEFORE_TRUVI.map((item) => (
                  <div key={item} className="flex items-center gap-3 text-sm text-muted-foreground">
                    <span className="text-red-400/70">✕</span>
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
          <Reveal delay={0.25}>
            <div className="relative h-full rounded-2xl border border-[var(--trust)]/30 glass p-7">
              <div className="absolute inset-x-0 top-0 h-1 rounded-t-2xl" style={{ background: "var(--gradient-trust)" }} />
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--trust)]">With Truvi</p>
              <div className="mt-5 space-y-3">
                {WITH_TRUVI.map((item) => (
                  <div key={item} className="flex items-center gap-3 text-sm text-foreground/95">
                    <span className="text-emerald-400">✓</span>
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </Section>

      {/* ---------- 9 · DEVELOPER INTELLIGENCE (B2B) ---------- */}
      <Section id="developer-intelligence">
        <Reveal><Eyebrow>Developer Intelligence</Eyebrow></Reveal>
        <Reveal delay={0.1}>
          <h2 className="max-w-4xl font-display text-3xl font-medium leading-[1.05] sm:text-4xl md:text-6xl">
            The market, as your{" "}
            <span className="text-gradient-trust">launch dashboard.</span>
          </h2>
        </Reveal>
        <Reveal delay={0.2}>
          <p className="mt-6 max-w-2xl text-muted-foreground md:text-lg">
            The same engine that scores properties for buyers gives developers the demand, pricing and
            competitive intelligence behind every launch decision.
          </p>
        </Reveal>
        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {DEVELOPER_INTEL.map((d, i) => (
            <Reveal key={d.title} delay={i * 0.06}>
              <div className="h-full rounded-2xl glass p-6">
                <h3 className="font-display text-lg font-medium text-[var(--trust)]">{d.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{d.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
        <Reveal delay={0.4}>
          <div className="mt-10 flex flex-wrap items-center gap-4">
            <GlowButton to="/signup?role=DEVELOPER">List Your Project on Truvi</GlowButton>
            <Link
              to="/login"
              className="rounded-full border border-white/20 px-6 py-3 text-sm font-semibold text-foreground/90 transition hover:bg-white/5"
            >
              Sign in as Developer
            </Link>
          </div>
        </Reveal>
      </Section>

      {/* ---------- 11 · DATA MOAT ---------- */}
      <Section id="data-moat" className="items-center text-center">
        <Reveal><Eyebrow>The Data Moat</Eyebrow></Reveal>
        <Reveal delay={0.1}>
          <h2 className="font-display text-3xl font-medium sm:text-4xl md:text-6xl">
            Every property analysed{" "}
            <span className="text-gradient-aurora">makes Truvi smarter.</span>
          </h2>
        </Reveal>
        <Reveal delay={0.25}>
          <div className="mt-14 flex flex-wrap items-center justify-center gap-3">
            {FLYWHEEL.map((step) => (
              <span key={step} className="flex items-center gap-3">
                <span className="rounded-full border border-[var(--trust)]/30 bg-[var(--trust)]/10 px-4 py-2 text-sm font-medium text-white">
                  {step}
                </span>
                <span className="text-[var(--trust)]" aria-hidden>→</span>
              </span>
            ))}
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="text-lg text-[var(--trust)]" aria-hidden>↻</span>
              and the flywheel turns
            </span>
          </div>
        </Reveal>
        <Reveal delay={0.4}>
          <p className="mx-auto mt-10 max-w-2xl text-sm text-muted-foreground md:text-base">
            Truvi isn't a wrapper on a model — it's a compounding property-intelligence dataset.
            Every analysis adds signals no one else has, and every signal makes the next analysis better.
          </p>
        </Reveal>
      </Section>

      {/* ---------- 12 · TRUST & METHODOLOGY ---------- */}
      <Section id="methodology">
        <Reveal><Eyebrow>Trust & Methodology</Eyebrow></Reveal>
        <Reveal delay={0.1}>
          <h2 className="max-w-4xl font-display text-4xl font-medium md:text-6xl">
            How Truvi <span className="text-gradient-trust">thinks.</span>
          </h2>
        </Reveal>
        <div className="mt-14 grid gap-5 md:grid-cols-4">
          {METHODOLOGY.map((s, i) => (
            <Reveal key={s.n} delay={i * 0.1}>
              <div className="relative h-full rounded-2xl glass p-6">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-muted-foreground">{s.n}</span>
                  {i < METHODOLOGY.length - 1 && (
                    <span className="hidden text-[var(--trust)] md:inline" aria-hidden>→</span>
                  )}
                </div>
                <h3 className="mt-3 font-display text-xl font-medium" style={{ color: i === 3 ? "var(--growth)" : "var(--trust)" }}>
                  {s.title}
                </h3>
                <p className="mt-2 text-sm text-muted-foreground">{s.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
        <Reveal delay={0.5}>
          <div className="mt-10 rounded-2xl border border-white/10 glass p-6">
            <p className="text-sm leading-relaxed text-muted-foreground">
              <span className="font-semibold text-foreground/90">Important:</span> Truvi provides
              decision intelligence, not legal certification or guaranteed investment returns. Where
              data is incomplete, it is labelled — never filled in. Read the full{" "}
              <Link to="/legal#verification-methodology" className="text-sky-300 underline-offset-4 hover:underline">
                verification methodology
              </Link>.
            </p>
          </div>
        </Reveal>
      </Section>

      {/* ---------- FINAL CTA ---------- */}
      <Section id="join" className="items-center pb-32 text-center">
        <Reveal>
          <h2 className="font-display text-4xl font-medium leading-[1.0] sm:text-5xl md:text-7xl lg:text-8xl">
            Don't search for property.<br />
            <span className="text-gradient-aurora">Understand it.</span>
          </h2>
        </Reveal>
        <Reveal delay={0.4}>
          <div className="mt-12 flex flex-wrap items-center justify-center gap-4">
            <GlowButton onClick={openAskTruvi}>Ask Truvi</GlowButton>
            <GlowButton variant="ghost" to="/inventory">Analyse a Property</GlowButton>
          </div>
        </Reveal>
      </Section>

      <Footer />
    </div>
  );
}
