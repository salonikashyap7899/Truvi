import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { SmoothScroll } from "@/components/landing/SmoothScroll";
import { CursorGlow } from "@/components/landing/CursorGlow";

const CityCanvas = lazy(() =>
  import("@/components/landing/CityCanvas").then((m) => ({ default: m.CityCanvas })),
);

function useMounted() {
  const [m, setM] = useState(false);
  useEffect(() => setM(true), []);
  return m;
}

/** Opens the live Ask Truvi AI assistant (mounted globally in App). */
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
      className={`relative z-10 mx-auto flex w-full max-w-7xl flex-col justify-center px-6 py-28 md:px-12 ${className}`}
    >
      {children}
    </section>
  );
}

/* ---------------- Navigation (simplified per positioning) ---------------- */

function Nav() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 px-6 py-5 md:px-12">
      <div className="mx-auto flex max-w-7xl items-center justify-between rounded-full glass px-5 py-2.5">
        <a href="#top" className="flex items-center gap-2 font-display text-base font-semibold tracking-tight">
          <span className="grid size-6 place-items-center rounded-md bg-gradient-to-br from-[var(--trust)] to-[var(--tech)] text-[10px] font-bold">T</span>
          TRUVI VENTURES
        </a>
        <nav className="hidden gap-6 text-xs uppercase tracking-[0.16em] text-muted-foreground lg:flex">
          <a href="#intelligence" className="hover:text-foreground">Intelligence</a>
          <a href="#ask-truvi" className="hover:text-foreground">Ask Truvi AI</a>
          <Link to="/inventory" className="hover:text-foreground">Inventory</Link>
          <Link to="/join" className="hover:text-foreground">For Developers</Link>
          <a href="#network" className="hover:text-foreground">Truvi Network</a>
          <Link to="/about" className="hover:text-foreground">About</Link>
        </nav>
        <button
          onClick={openAskTruvi}
          className="rounded-full bg-foreground px-4 py-1.5 text-xs font-medium text-background transition hover:opacity-90"
        >
          Ask Truvi AI
        </button>
      </div>
    </header>
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

const INTELLIGENCE_STRIP = [
  "Property Data",
  "Location Intelligence",
  "Legal Signals",
  "AI-Powered Analysis",
  "Risk Prediction",
];

const ROTATING_QUESTIONS = [
  "Compare these two projects",
  "What should I verify before booking?",
  "Explain this project's location",
  "What information needs attention?",
  "Summarise this project for me",
];

const STAGES = [
  {
    n: "01",
    title: "Ingest",
    desc: "Raw multi-source data — brochures, RERA filings, land records, news, site visits — is pulled into one pipeline.",
  },
  {
    n: "02",
    title: "Verify",
    desc: "Every data point is cross-checked against its source. If a fact can't be verified, it's labelled — never guessed.",
  },
  {
    n: "03",
    title: "Structure",
    desc: "Verified records are organised into one unified, comparable project intelligence record.",
  },
  {
    n: "04",
    title: "Deliver",
    desc: "Decision-ready answers — every conclusion traced back to the document, filing, or record it came from.",
  },
];

const DATA_SOURCES = [
  "LDA Master Plan", "Village Boundaries", "Land Use",
  "Circle Rates", "Registered Developers", "RERA Projects",
  "Schools", "Hospitals", "Metro",
  "Highway Projects", "Ring Road", "Government Projects",
  "Property Rates", "Crime Data", "Flood Zones",
  "Future Infrastructure", "Land Feasibility Rate", "Climatic Condition",
];

const FIELD_VERIFICATION = [
  { field: "RERA registration number", status: "verified" },
  { field: "Possession timeline", status: "verified" },
  { field: "Builder litigation history", status: "pending" },
  { field: "Amenity list (final)", status: "pending" },
  { field: "Resale price history", status: "unavailable" },
];

const STATUS_LABELS = [
  { name: "Information Available", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-400/20" },
  { name: "Needs Verification", cls: "bg-sky-500/15 text-sky-300 border-sky-400/20" },
  { name: "Data Unavailable", cls: "bg-white/10 text-foreground/70 border-white/15" },
  { name: "Attention Required", cls: "bg-amber-500/15 text-amber-300 border-amber-400/20" },
  { name: "Information Mismatch", cls: "bg-red-500/15 text-red-300 border-red-400/20" },
];

const PREVIEW_MODULES = [
  { name: "Project Overview", status: 0 },
  { name: "Builder Intelligence", status: 0 },
  { name: "Location Intelligence", status: 0 },
  { name: "Site Insights", status: 1 },
  { name: "Amenities", status: 0 },
  { name: "Documents & Information", status: 1 },
  { name: "Buyer Experience", status: 2 },
];

const SOURCE_LABELS = [
  { icon: "✅", name: "Truvi Verified", desc: "Field-verified by Truvi's ambassador and surveyor network. Highest confidence level." },
  { icon: "📂", name: "Public Record", desc: "Government registries, RERA filings and other publicly accessible documents." },
  { icon: "📋", name: "Builder Submitted", desc: "Provided directly by the developer. Not independently verified unless noted." },
  { icon: "👤", name: "User Submitted", desc: "Inputs from buyers and residents — aggregated and anonymised before display." },
];

const ECOSYSTEM = [
  { name: "Buyers", desc: "Understand a property completely — data, sources and open questions — before committing." },
  { name: "Developers", desc: "Present verified project information to a network of serious, informed buyers." },
  { name: "Channel Partners", desc: "Advise clients with structured intelligence, transparent inventory and clear commissions." },
  { name: "Architects & Consultants", desc: "Access organised project and location data to support professional work." },
  { name: "Researchers & Institutions", desc: "Study structured, source-attributed real estate data at market scale." },
];

const NETWORK_PILLARS = [
  { title: "Truvi Ambassador Network", desc: "Trained field ambassadors visit projects and record on-ground observations." },
  { title: "Site Observations", desc: "Construction activity, visible progress and site conditions — captured directly, not claimed." },
  { title: "Structured Project Data", desc: "Every observation is converted into structured, comparable, source-tagged records." },
  { title: "Continuous Updates", desc: "Information carries a Last Updated date and is refreshed as new observations arrive." },
];

/* ---------------- Ask Truvi AI showcase ---------------- */

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
              <p className="text-sm font-semibold">Ask Truvi AI</p>
              <p className="text-[10px] text-muted-foreground">Decision Intelligence · Source-backed</p>
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
            Not a chatbot — a decision-intelligence assistant grounded in Truvi's data.
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

/* ---------------- Project Intelligence Preview ---------------- */

function ProjectPreview() {
  return (
    <div className="relative mx-auto w-full max-w-4xl">
      <div className="rounded-2xl glass p-5 md:p-7">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 pb-4">
          <div>
            <p className="font-display text-lg font-semibold">Sample Project · Lucknow</p>
            <p className="text-xs text-muted-foreground">Project Intelligence Report</p>
          </div>
          <div className="text-right">
            <span className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[10px] text-muted-foreground">
              Last Updated · 30 Jun 2026
            </span>
          </div>
        </div>

        <div className="mt-5 grid gap-2.5 sm:grid-cols-2">
          {PREVIEW_MODULES.map((m) => {
            const s = STATUS_LABELS[m.status];
            return (
              <div key={m.name} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-3">
                <span className="text-sm text-foreground/90">{m.name}</span>
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${s.cls}`}>{s.name}</span>
              </div>
            );
          })}
        </div>

        <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
          Statuses reflect actual data availability — never a marketing claim. Where information is
          incomplete, Truvi says so.
        </p>
      </div>

      {/* Label legend */}
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {STATUS_LABELS.map((s) => (
          <span key={s.name} className={`rounded-full border px-2.5 py-1 text-[10px] font-medium ${s.cls}`}>{s.name}</span>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Institutional footer ---------------- */

function Footer() {
  const col = "space-y-2 text-sm text-muted-foreground";
  const head = "mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-foreground/80";
  const link = "block transition hover:text-foreground";
  return (
    <footer className="relative z-10 border-t border-white/5 px-6 py-14 md:px-12">
      <div className="mx-auto grid max-w-7xl gap-10 md:grid-cols-5">
        <div className="md:col-span-2">
          <div className="flex items-center gap-2 font-display text-base font-semibold tracking-tight">
            <span className="grid size-6 place-items-center rounded-md bg-gradient-to-br from-[var(--trust)] to-[var(--tech)] text-[10px] font-bold">T</span>
            TRUVI VENTURES
          </div>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
            The intelligence layer for real estate — organising fragmented property information into
            structured, decision-ready intelligence.
          </p>
        </div>
        <div>
          <p className={head}>Company</p>
          <div className={col}>
            <Link to="/about" className={link}>About</Link>
            <a href="#network" className={link}>Truvi Network</a>
            <Link to="/join" className={link}>Join Truvi</Link>
          </div>
        </div>
        <div>
          <p className={head}>Intelligence</p>
          <div className={col}>
            <a href="#ask-truvi" className={link}>Ask Truvi AI</a>
            <a href="#how" className={link}>How Truvi Works</a>
            <a href="#project-intelligence" className={link}>Project Intelligence</a>
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
        <div>© {new Date().getFullYear()} TRUVI VENTURES</div>
        <div>Neutral · Evidence-led · Source-backed</div>
        <Link to="/admin/dashboard" className="transition hover:text-foreground">Admin</Link>
      </div>
    </footer>
  );
}

/* ================= Landing page ================= */

export default function LandingPage() {
  const mounted = useMounted();

  useEffect(() => {
    const prevTitle = document.title;
    document.title = "TRUVI VENTURES — Know the Property Before You Buy It";
    const meta = document.querySelector('meta[name="description"]');
    const prevDesc = meta?.getAttribute("content") ?? null;
    if (meta) {
      meta.setAttribute(
        "content",
        "Truvi brings project data, site verification, builder intelligence, location insights and buyer experience into one real estate intelligence system.",
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
      <Nav />

      <Suspense fallback={null}>{mounted ? <CityCanvas /> : null}</Suspense>

      {/* ---------- HERO ---------- */}
      <Section className="min-h-screen items-center pt-36 text-center">
        <Reveal>
          <Eyebrow>The Intelligence Layer for Indian Real Estate</Eyebrow>
        </Reveal>
        <Reveal delay={0.1}>
          <h1 className="font-display text-3xl font-medium leading-[1.08] tracking-tight text-gradient-aurora md:text-5xl">
            Know the land.<br />Verify the property.<br />Understand the risk.<br />Predict the potential.
          </h1>
        </Reveal>
        <Reveal delay={0.3}>
          <p className="mx-auto mt-8 max-w-2xl text-base text-muted-foreground md:text-lg">
            Truvi combines property data, location intelligence, legal signals and AI to help India make better real estate decisions.
          </p>
        </Reveal>
        <Reveal delay={0.5}>
          <div className="mt-12 flex flex-wrap items-center justify-center gap-4">
            <GlowButton onClick={openAskTruvi}>Ask Truvi AI</GlowButton>
            <GlowButton variant="ghost" to="/inventory">Analyse a Property</GlowButton>
          </div>
        </Reveal>

        {/* ---------- TRUST INTELLIGENCE STRIP ---------- */}
        <Reveal delay={0.7}>
          <div className="mt-16 w-full">
            <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-center gap-x-3 gap-y-2 rounded-full glass px-6 py-3 text-[11px] uppercase tracking-[0.18em] text-muted-foreground md:text-xs">
              {INTELLIGENCE_STRIP.map((item, i) => (
                <span key={item} className="flex items-center gap-3">
                  {i > 0 && <span className="text-[var(--trust)]">•</span>}
                  <span className="whitespace-nowrap">{item}</span>
                </span>
              ))}
            </div>
          </div>
        </Reveal>
      </Section>

      {/* ---------- WHAT IS TRUVI ---------- */}
      <Section id="intelligence">
        <Reveal><Eyebrow>What is Truvi?</Eyebrow></Reveal>
        <Reveal delay={0.1}>
          <h2 className="max-w-4xl font-display text-4xl font-medium leading-[1.05] md:text-6xl">
            Truvi is the <span className="text-gradient-trust">intelligence layer</span> for real estate.
          </h2>
        </Reveal>
        <Reveal delay={0.2}>
          <p className="mt-8 max-w-2xl text-muted-foreground md:text-lg">
            We organise fragmented property information into structured, understandable and
            decision-ready intelligence. Data comes first; conclusions follow the evidence.
          </p>
        </Reveal>
        <div className="mt-14 grid gap-5 md:grid-cols-3">
          {[
            { t: "Organised", d: "Project, builder, location and site information brought into one structured system." },
            { t: "Understandable", d: "Complex records explained in simple language — with sources shown, not hidden." },
            { t: "Decision-ready", d: "What's verified, what's pending and what's unavailable — clearly labelled before you decide." },
          ].map((c, i) => (
            <Reveal key={c.t} delay={i * 0.08}>
              <div className="h-full rounded-2xl glass p-6">
                <h3 className="font-display text-lg font-medium">{c.t}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{c.d}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      {/* ---------- THE PROBLEM ---------- */}
      <Section id="the-problem">
        <Reveal><Eyebrow>The Problem</Eyebrow></Reveal>
        <Reveal delay={0.1}>
          <h2 className="max-w-4xl font-display text-4xl font-medium leading-[1.05] md:text-6xl">
            Real estate data is scattered across{" "}
            <span className="text-gradient-trust">a hundred sources.</span>
          </h2>
        </Reveal>
        <Reveal delay={0.2}>
          <p className="mt-6 max-w-2xl text-muted-foreground md:text-lg">
            Brochures, RERA filings, news, site visits, government portals — each holds a piece of the truth, none hold the whole picture.
          </p>
        </Reveal>

        {/* Data scatter diagram */}
        <Reveal delay={0.3}>
          <div className="mt-14 relative">
            {/* Center node */}
            <div className="flex flex-col items-center">
              <div className="relative w-full max-w-3xl mx-auto">
                {/* Outer source chips in a radial-ish layout */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 mb-6">
                  {[
                    { label: "Brochures", sub: "Marketing PDFs" },
                    { label: "RERA Filings", sub: "Government records" },
                    { label: "News", sub: "Press coverage" },
                    { label: "Site Visits", sub: "Ground truth" },
                    { label: "Land Records", sub: "Title & ownership" },
                    { label: "Builder Records", sub: "Track history" },
                    { label: "Site Plans", sub: "Layouts & approvals" },
                    { label: "Government Portals", sub: "Public databases" },
                    { label: "Circle Rates", sub: "Stamp authority" },
                  ].map((src) => (
                    <div
                      key={src.label}
                      className="rounded-xl border border-white/10 glass px-4 py-3 text-center"
                    >
                      <p className="text-sm font-medium text-white/90">{src.label}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">{src.sub}</p>
                    </div>
                  ))}
                </div>

                {/* Arrows pointing down */}
                <div className="flex justify-center mb-4">
                  <div className="flex flex-col items-center gap-1 text-muted-foreground">
                    <div className="flex gap-6 text-[var(--trust)] text-lg">
                      <span>↓</span><span>↓</span><span>↓</span><span>↓</span><span>↓</span>
                    </div>
                    <p className="text-xs uppercase tracking-widest text-muted-foreground">All sources feed into</p>
                  </div>
                </div>

                {/* Truvi AI Engine center */}
                <div className="flex justify-center">
                  <div className="relative rounded-2xl border border-[var(--trust)]/40 px-10 py-5 text-center"
                    style={{ background: "linear-gradient(135deg, rgba(59,130,246,0.12), rgba(139,92,246,0.08))" }}>
                    <div className="absolute -inset-px rounded-2xl opacity-30" style={{ boxShadow: "0 0 40px var(--trust)" }} />
                    <div className="relative">
                      <div className="mb-1 flex items-center justify-center gap-2">
                        <span className="grid size-6 place-items-center rounded-md bg-gradient-to-br from-[var(--trust)] to-[var(--tech)] text-[10px] font-bold">T</span>
                        <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">TRUVI</span>
                      </div>
                      <p className="font-display text-xl font-semibold text-white">AI Engine</p>
                      <p className="mt-1 text-xs text-muted-foreground">Ingest · Verify · Structure · Deliver</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </Section>

      {/* ---------- ASK TRUVI AI (hero product) ---------- */}
      <Section id="ask-truvi" className="items-center text-center">
        <Reveal><Eyebrow>The Hero Product</Eyebrow></Reveal>
        <Reveal delay={0.1}>
          <h2 className="font-display text-4xl font-medium leading-[1.02] md:text-7xl">
            Ask Truvi AI.<br />
            <span className="text-gradient-aurora">Every answer, source-backed.</span>
          </h2>
        </Reveal>
        <Reveal delay={0.2}>
          <p className="mx-auto mt-8 max-w-2xl text-muted-foreground md:text-lg">
            A real estate decision-intelligence assistant — ask about projects, builders, locations,
            verification data and property decisions. Source type and last-updated date are visible on
            every important answer.
          </p>
        </Reveal>
        <Reveal delay={0.35}>
          <div className="mt-12 w-full">
            <AskTruviShowcase />
          </div>
        </Reveal>
      </Section>

      {/* ---------- HOW TRUVI WORKS ---------- */}
      <Section id="how">
        <Reveal><Eyebrow>How It Works</Eyebrow></Reveal>
        <Reveal delay={0.1}>
          <h2 className="max-w-4xl font-display text-4xl font-medium md:text-6xl">
            From raw records to{" "}
            <span className="text-gradient-trust">decision-ready intelligence.</span>
          </h2>
        </Reveal>
        <Reveal delay={0.15}>
          <p className="mt-6 max-w-2xl text-muted-foreground">
            Every record moves through four checkpoints before it reaches you — nothing is shown until it has a source.
          </p>
        </Reveal>
        <div className="mt-14 grid gap-5 md:grid-cols-4">
          {STAGES.map((s, i) => (
            <Reveal key={s.n} delay={i * 0.1}>
              <div className="relative h-full rounded-2xl glass p-6">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-muted-foreground">{s.n}</span>
                  {i < STAGES.length - 1 && (
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

        {/* Evidence callout */}
        <Reveal delay={0.5}>
          <div className="mt-10 flex flex-col gap-4 rounded-2xl border border-[var(--trust)]/20 glass p-6 md:flex-row md:items-start md:gap-10">
            <div className="flex-1">
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--trust)] mb-2">Evidence, not assumption</p>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Every conclusion Truvi's AI states is traced back to the document, filing, or record it came from.
                If a fact can't be verified, it's labelled — never guessed.
              </p>
            </div>
            <div className="flex shrink-0 flex-col gap-2">
              {[
                { label: "Verified", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-400/20" },
                { label: "Pending", cls: "bg-amber-500/15 text-amber-300 border-amber-400/20" },
                { label: "Unavailable", cls: "bg-white/10 text-foreground/70 border-white/15" },
              ].map((s) => (
                <span key={s.label} className={`rounded-full border px-3 py-1 text-xs font-medium text-center ${s.cls}`}>{s.label}</span>
              ))}
            </div>
          </div>
        </Reveal>
      </Section>

      {/* ---------- PROJECT INTELLIGENCE PREVIEW ---------- */}
      <Section id="project-intelligence" className="items-center text-center">
        <Reveal><Eyebrow>Project Intelligence</Eyebrow></Reveal>
        <Reveal delay={0.1}>
          <h2 className="font-display text-4xl font-medium md:text-6xl">
            Every project, as an <span className="text-gradient-aurora">intelligence report.</span>
          </h2>
        </Reveal>
        <Reveal delay={0.2}>
          <p className="mx-auto mt-6 max-w-2xl text-muted-foreground md:text-lg">
            Not scores that overpromise — honest, labelled information across every dimension that
            matters to a buyer.
          </p>
        </Reveal>
        <Reveal delay={0.35}>
          <div className="mt-12 w-full">
            <ProjectPreview />
          </div>
        </Reveal>
      </Section>

      {/* ---------- DATA VERIFICATION (field-level sample) ---------- */}
      <Section id="verification">
        <Reveal><Eyebrow>Data Verification</Eyebrow></Reveal>
        <Reveal delay={0.1}>
          <h2 className="max-w-4xl font-display text-4xl font-medium md:text-6xl">
            What's verified, what's pending,{" "}
            <span className="text-gradient-trust">what's unavailable.</span>
          </h2>
        </Reveal>
        <Reveal delay={0.2}>
          <p className="mt-6 max-w-2xl text-muted-foreground md:text-lg">
            Every record on Truvi is labelled at the field level — so you always know how much to trust each detail.
          </p>
        </Reveal>

        {/* Sample project record */}
        <Reveal delay={0.3}>
          <div className="mt-12 mx-auto max-w-2xl rounded-2xl border border-white/10 glass overflow-hidden">
            {/* Card header */}
            <div className="border-b border-white/10 px-6 py-4">
              <p className="font-display text-base font-semibold text-white">Skyline Meridian — Tower B</p>
              <p className="text-xs text-muted-foreground mt-0.5">Sample project record</p>
            </div>
            {/* Field rows */}
            <div className="divide-y divide-white/5">
              {FIELD_VERIFICATION.map((row) => (
                <div key={row.field} className="flex items-center justify-between gap-4 px-6 py-4">
                  <span className="text-sm text-foreground/85">{row.field}</span>
                  {row.status === "verified" && (
                    <span className="shrink-0 inline-flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-medium text-emerald-300">
                      ✓ Verified
                    </span>
                  )}
                  {row.status === "pending" && (
                    <span className="shrink-0 inline-flex items-center gap-1.5 rounded-full border border-amber-400/20 bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-medium text-amber-300">
                      ⏳ Pending review
                    </span>
                  )}
                  {row.status === "unavailable" && (
                    <span className="shrink-0 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                      — Unavailable
                    </span>
                  )}
                </div>
              ))}
            </div>
            {/* Legend */}
            <div className="border-t border-white/10 px-6 py-4 grid grid-cols-3 gap-4 text-center">
              <div>
                <span className="inline-block rounded-full border border-emerald-400/20 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-300 mb-1">Verified</span>
                <p className="text-[10px] text-muted-foreground leading-snug">Confirmed against an original source document.</p>
              </div>
              <div>
                <span className="inline-block rounded-full border border-amber-400/20 bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-300 mb-1">Pending</span>
                <p className="text-[10px] text-muted-foreground leading-snug">Sourced, awaiting cross-verification.</p>
              </div>
              <div>
                <span className="inline-block rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] font-medium text-muted-foreground mb-1">Unavailable</span>
                <p className="text-[10px] text-muted-foreground leading-snug">No reliable source exists yet — clearly marked.</p>
              </div>
            </div>
          </div>
        </Reveal>

        {/* Source type legend */}
        <Reveal delay={0.4}>
          <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {SOURCE_LABELS.map((s) => (
              <div key={s.name} className="h-full rounded-2xl glass p-6">
                <div className="text-xl" aria-hidden>{s.icon}</div>
                <h3 className="mt-3 font-display text-lg font-medium">{s.name}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{s.desc}</p>
              </div>
            ))}
          </div>
        </Reveal>

        <Reveal delay={0.5}>
          <p className="mt-8 max-w-2xl text-sm text-muted-foreground">
            Where data is incomplete, it is labelled — never filled in. Read the full{" "}
            <Link to="/legal#verification-methodology" className="text-sky-300 underline-offset-4 hover:underline">
              verification methodology
            </Link>.
          </p>
        </Reveal>
      </Section>

      {/* ---------- SOURCE COVERAGE ---------- */}
      <Section id="source-coverage">
        <Reveal><Eyebrow>Data Team · Source Coverage</Eyebrow></Reveal>
        <Reveal delay={0.1}>
          <h2 className="max-w-4xl font-display text-4xl font-medium md:text-6xl">
            Every source feeding the model{" "}
            <span className="text-gradient-trust">is verified by Truvi.</span>
          </h2>
        </Reveal>
        <Reveal delay={0.2}>
          <p className="mt-6 max-w-2xl text-muted-foreground">
            From master plans to ground-level records — each category below is checked, cross-referenced and kept current before it reaches the AI layer.
          </p>
        </Reveal>

        <Reveal delay={0.3}>
          <div className="mt-12 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {DATA_SOURCES.map((src) => (
              <div
                key={src}
                className="flex items-center gap-2 rounded-xl border border-white/10 glass px-3 py-2.5"
              >
                <span className="text-[var(--trust)] text-xs font-bold shrink-0">✓</span>
                <span className="text-xs text-foreground/85 leading-tight">{src}</span>
              </div>
            ))}
          </div>
        </Reveal>

        <Reveal delay={0.45}>
          <p className="mt-8 max-w-3xl text-sm text-muted-foreground italic">
            Every category above is pulled from an authoritative source, dated, and re-checked on a cycle — so downstream answers carry the Verified label, not an assumption.
          </p>
        </Reveal>
      </Section>

      {/* ---------- REAL ESTATE ECOSYSTEM ---------- */}
      <Section id="ecosystem">
        <Reveal><Eyebrow>Built for the Real Estate Ecosystem</Eyebrow></Reveal>
        <Reveal delay={0.1}>
          <h2 className="max-w-4xl font-display text-4xl font-medium md:text-6xl">
            One system. <span className="text-gradient-trust">Every participant.</span>
          </h2>
        </Reveal>
        <Reveal delay={0.2}>
          <p className="mt-6 max-w-2xl text-muted-foreground">
            Buyers, developers, channel partners, architects, researchers and authorities — all
            important participants in the same ecosystem, working from the same verified information.
          </p>
        </Reveal>
        <div className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-5">
          {ECOSYSTEM.map((s, i) => (
            <Reveal key={s.name} delay={i * 0.06}>
              <div className="group relative h-64 overflow-hidden rounded-2xl glass p-6 transition hover:-translate-y-1">
                <div
                  className="absolute inset-x-0 top-0 h-1 opacity-70 transition group-hover:opacity-100"
                  style={{ background: "linear-gradient(90deg, transparent, var(--trust), transparent)" }}
                />
                <div className="flex h-full flex-col justify-between">
                  <div className="font-mono text-xs text-muted-foreground">0{i + 1}</div>
                  <div>
                    <h3 className="font-display text-lg font-medium">{s.name}</h3>
                    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{s.desc}</p>
                  </div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      {/* ---------- TRUVI NETWORK ---------- */}
      <Section id="network">
        <Reveal><Eyebrow>Truvi Network</Eyebrow></Reveal>
        <Reveal delay={0.1}>
          <h2 className="max-w-4xl font-display text-4xl font-medium md:text-6xl">
            Real estate intelligence starts with <span className="text-gradient-aurora">better data.</span>
          </h2>
        </Reveal>
        <div className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {NETWORK_PILLARS.map((p, i) => (
            <Reveal key={p.title} delay={i * 0.08}>
              <div className="relative h-full overflow-hidden rounded-2xl glass p-6">
                <div
                  className="absolute inset-x-1/2 top-0 h-1 w-16 -translate-x-1/2 rounded-full"
                  style={{ background: "var(--gradient-trust)" }}
                />
                <h3 className="mt-2 font-display text-lg font-medium">{p.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{p.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
        <Reveal delay={0.3}>
          <p className="mt-8 max-w-2xl text-sm text-muted-foreground">
            As the network grows, so does the depth and freshness of Truvi's intelligence — built
            observation by observation, not claim by claim.
          </p>
        </Reveal>
      </Section>

      {/* ---------- VISION ---------- */}
      <Section className="items-center text-center">
        <Reveal><Eyebrow>Vision</Eyebrow></Reveal>
        <Reveal delay={0.1}>
          <h2 className="font-display text-4xl font-medium leading-[1.02] md:text-7xl">
            Smarter real estate decisions<br />
            <span className="text-gradient-aurora">for every Indian buyer.</span>
          </h2>
        </Reveal>
        <Reveal delay={0.3}>
          <p className="mx-auto mt-8 max-w-2xl text-muted-foreground md:text-lg">
            Verified intelligence, honest transparency and personalised guidance — for every property
            decision, in every city.
          </p>
        </Reveal>
      </Section>

      {/* ---------- FINAL CTA ---------- */}
      <Section id="join" className="items-center pb-32 text-center">
        <Reveal>
          <h2 className="font-display text-5xl font-medium leading-[1.0] md:text-8xl">
            Intelligence over assumption.
          </h2>
        </Reveal>
        <Reveal delay={0.2}>
          <p className="mx-auto mt-8 max-w-xl text-muted-foreground md:text-lg">
            Start with one question — and let the evidence guide every decision.
          </p>
        </Reveal>
        <Reveal delay={0.4}>
          <div className="mt-12 flex flex-wrap items-center justify-center gap-4">
            <GlowButton onClick={openAskTruvi}>Ask Truvi AI</GlowButton>
            <GlowButton variant="ghost" to="/inventory">Analyse a Property</GlowButton>
            <GlowButton variant="ghost" to="/signup">Join the Ecosystem</GlowButton>
          </div>
        </Reveal>
      </Section>

      <Footer />
    </div>
  );
}
