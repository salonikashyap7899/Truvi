import { useEffect, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Database, ShieldCheck, LayoutGrid, Zap, ArrowRight, Check, Clock, HelpCircle,
  FileText, Landmark, Newspaper, Map, ScrollText, HardHat, Building2,
} from "lucide-react";

/* ── Shared bits (kept local — mirrors LandingPage's visual language) ────── */

function Reveal({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full glass px-3 py-1 text-xs uppercase tracking-widest text-muted-foreground">
      <span className="size-1.5 rounded-full bg-[var(--trust)] animate-pulse" />
      {children}
    </div>
  );
}

function Section({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`mx-auto max-w-6xl px-6 py-16 md:px-10 md:py-24 ${className}`}>{children}</section>;
}

/* ── Section 2: scattered sources hub ────────────────────────────────────── */

const SOURCES = [
  { icon: <FileText size={15} />, name: "Brochures", desc: "Marketing PDFs" },
  { icon: <Landmark size={15} />, name: "RERA Filings", desc: "Government records" },
  { icon: <Newspaper size={15} />, name: "News", desc: "Press coverage" },
  { icon: <Map size={15} />, name: "Site Visits", desc: "Ground truth" },
  { icon: <ScrollText size={15} />, name: "Land Records", desc: "Title & ownership" },
  { icon: <Building2 size={15} />, name: "Builder Records", desc: "Track history" },
  { icon: <HardHat size={15} />, name: "Site Plans", desc: "Layouts & approvals" },
];

/* ── Section 3: pipeline ─────────────────────────────────────────────────── */

const PIPELINE = [
  { icon: <Database size={20} />, title: "Ingest", desc: "Raw multi-source data" },
  { icon: <ShieldCheck size={20} />, title: "Verify", desc: "Cross-check vs. source" },
  { icon: <LayoutGrid size={20} />, title: "Structure", desc: "One unified record" },
  { icon: <Zap size={20} />, title: "Deliver", desc: "Decision-ready answer" },
];

/* ── Section 4: sample record ────────────────────────────────────────────── */

type FieldStatus = "VERIFIED" | "PENDING" | "UNAVAILABLE";

const SAMPLE_FIELDS: { label: string; status: FieldStatus }[] = [
  { label: "RERA registration number", status: "VERIFIED" },
  { label: "Possession timeline", status: "VERIFIED" },
  { label: "Builder litigation history", status: "PENDING" },
  { label: "Amenity list (final)", status: "PENDING" },
  { label: "Resale price history", status: "UNAVAILABLE" },
];

function FieldBadge({ status }: { status: FieldStatus }) {
  if (status === "VERIFIED")
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-green-800 bg-green-900/40 px-2.5 py-0.5 text-[11px] font-medium text-green-400">
        ✓ Verified
      </span>
    );
  if (status === "PENDING")
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-amber-800 bg-amber-900/40 px-2.5 py-0.5 text-[11px] font-medium text-amber-400">
        ⏳ Pending review
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/5 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
      — Unavailable
    </span>
  );
}

const STATUS_LEGEND = [
  { icon: <Check size={17} />, title: "Verified", desc: "Confirmed against an original source document.", cls: "text-green-400 border-green-800/60 bg-green-900/20" },
  { icon: <Clock size={17} />, title: "Pending", desc: "Sourced, awaiting cross-verification.", cls: "text-amber-400 border-amber-800/60 bg-amber-900/20" },
  { icon: <HelpCircle size={17} />, title: "Unavailable", desc: "No reliable source exists yet — clearly marked.", cls: "text-muted-foreground border-white/15 bg-white/5" },
];

/* ── Section 5: source coverage chips ────────────────────────────────────── */

const COVERAGE = [
  "LDA Master Plan", "Village Boundaries", "Land Use",
  "Circle Rates", "Registered Developers", "RERA Projects",
  "Schools", "Hospitals", "Metro",
  "Highway Projects", "Ring Road", "Government Projects",
  "Property Rates", "Crime Data", "Flood Zones",
  "Future Infrastructure", "Land Feasibility Rate", "Climatic Condition",
];

/* ── Section 6: pillars ──────────────────────────────────────────────────── */

const PILLARS = [
  { icon: <LayoutGrid size={18} />, title: "Organised", desc: "Project, builder, location and site data brought into one structured system." },
  { icon: <ScrollText size={18} />, title: "Understandable", desc: "Complex records explained in simple language — with sources shown, not hidden." },
  { icon: <Zap size={18} />, title: "Decision-ready", desc: "What's verified, pending or unavailable — clearly labelled before you decide." },
];

/* ── Page ────────────────────────────────────────────────────────────────── */

export default function IntelligencePage() {
  useEffect(() => {
    document.title = "TRUVI — Intelligence";
  }, []);

  return (
    <main className="min-h-screen text-white pb-28">
      {/* 1 ── HERO */}
      <Section className="pt-28 md:pt-36">
        <Reveal><Eyebrow>AI Intelligence — Verified by Design</Eyebrow></Reveal>
        <Reveal delay={0.1}>
          <h1 className="mt-6 max-w-3xl font-display text-4xl font-medium leading-[1.05] tracking-tight md:text-6xl">
            How Truvi's <span className="text-gradient-trust">AI</span> turns raw data into verified intelligence.
          </h1>
        </Reveal>
        <Reveal delay={0.2}>
          <p className="mt-6 max-w-2xl text-muted-foreground md:text-lg">
            A visual walkthrough for Truvi Ventures — the verification engine behind every project,
            builder and location record on the platform.
          </p>
        </Reveal>
      </Section>

      {/* 2 ── THE PROBLEM */}
      <Section>
        <Reveal><Eyebrow>The Problem</Eyebrow></Reveal>
        <Reveal delay={0.1}>
          <h2 className="mt-5 max-w-3xl font-display text-3xl font-medium leading-[1.08] md:text-5xl">
            Real estate data is scattered across <span className="text-gradient-trust">a hundred sources.</span>
          </h2>
        </Reveal>
        <Reveal delay={0.2}>
          <p className="mt-5 max-w-2xl text-muted-foreground">
            Brochures, RERA filings, news, site visits, government portals — each holds a piece of
            the truth, none hold the whole picture.
          </p>
        </Reveal>

        <Reveal delay={0.3}>
          <div className="mt-12 flex flex-col items-center gap-8 md:flex-row md:items-center md:gap-10">
            {/* Source cards */}
            <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-3 md:order-1">
              {SOURCES.map((s) => (
                <div key={s.name} className="rounded-xl border border-white/10 glass p-3.5">
                  <span className="text-[var(--trust)]">{s.icon}</span>
                  <p className="mt-1.5 text-sm font-semibold">{s.name}</p>
                  <p className="text-xs text-muted-foreground">{s.desc}</p>
                </div>
              ))}
            </div>
            {/* Convergence arrow + engine node */}
            <div className="flex items-center gap-4 md:order-2 md:flex-col">
              <ArrowRight size={20} className="text-muted-foreground rotate-90 md:rotate-0" />
            </div>
            <div className="md:order-3">
              <div className="grid size-36 place-items-center rounded-full border border-[var(--trust)]/40 bg-gradient-to-br from-[var(--trust)]/30 to-[var(--tech)]/20 shadow-[0_0_60px_rgba(59,130,246,0.25)]">
                <div className="text-center">
                  <p className="font-display text-base font-bold tracking-wide">TRUVI</p>
                  <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">AI Engine</p>
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </Section>

      {/* 3 ── HOW IT WORKS */}
      <Section>
        <Reveal><Eyebrow>How It Works</Eyebrow></Reveal>
        <Reveal delay={0.1}>
          <h2 className="mt-5 max-w-3xl font-display text-3xl font-medium leading-[1.08] md:text-5xl">
            From raw records to <span className="text-gradient-trust">decision-ready intelligence.</span>
          </h2>
        </Reveal>
        <Reveal delay={0.2}>
          <p className="mt-5 max-w-2xl text-muted-foreground">
            Every record moves through four checkpoints before it reaches you — nothing is shown
            until it has a source.
          </p>
        </Reveal>

        <Reveal delay={0.3}>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {PIPELINE.map((step, i) => (
              <div key={step.title} className="relative rounded-2xl border border-white/10 glass p-6">
                <span className="grid size-11 place-items-center rounded-xl border border-[var(--trust)]/30 bg-[var(--trust)]/10 text-[var(--trust)]">
                  {step.icon}
                </span>
                <p className="mt-4 font-display text-lg font-medium">{step.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{step.desc}</p>
                {i < PIPELINE.length - 1 && (
                  <ArrowRight size={16} className="absolute -right-3 top-1/2 hidden -translate-y-1/2 text-muted-foreground lg:block" />
                )}
              </div>
            ))}
          </div>
        </Reveal>

        <Reveal delay={0.4}>
          <div className="mt-8 flex flex-col gap-6 rounded-2xl border border-white/10 glass p-6 md:flex-row md:items-center">
            <div className="md:max-w-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--trust)]">Evidence, not assumption</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Every conclusion Truvi's AI states is traced back to the document, filing, or record
                it came from. If a fact can't be verified, it's labelled — never guessed.
              </p>
            </div>
            <div className="flex-1 space-y-3">
              {[
                { label: "Verified", width: "68%", cls: "bg-gradient-to-r from-[var(--trust)] to-[var(--tech)]" },
                { label: "Pending", width: "28%", cls: "bg-amber-400" },
                { label: "Unavailable", width: "10%", cls: "bg-white/30" },
              ].map((bar) => (
                <div key={bar.label} className="flex items-center gap-3">
                  <div className="h-2.5 flex-1 rounded-full bg-white/10 overflow-hidden">
                    <div className={`h-full rounded-full ${bar.cls}`} style={{ width: bar.width }} />
                  </div>
                  <span className="w-24 text-xs text-muted-foreground">{bar.label}</span>
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      </Section>

      {/* 4 ── DATA VERIFICATION */}
      <Section>
        <Reveal><Eyebrow>Data Verification</Eyebrow></Reveal>
        <Reveal delay={0.1}>
          <h2 className="mt-5 max-w-3xl font-display text-3xl font-medium leading-[1.08] md:text-5xl">
            What's verified, what's pending, <span className="text-gradient-trust">what's unavailable.</span>
          </h2>
        </Reveal>
        <Reveal delay={0.2}>
          <p className="mt-5 max-w-2xl text-muted-foreground">
            Every record on Truvi is labelled at the field level — so you always know how much to
            trust each detail.
          </p>
        </Reveal>

        <Reveal delay={0.3}>
          <div className="mt-10 rounded-2xl border border-white/10 glass p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-display text-lg font-medium">Skyline Meridian — Tower B</p>
                <p className="text-xs text-muted-foreground">Sample project record</p>
              </div>
              <span className="grid size-11 place-items-center rounded-xl bg-gradient-to-br from-[var(--trust)] to-[var(--tech)] font-display text-lg font-bold">
                A
              </span>
            </div>
            <div className="mt-4 divide-y divide-white/5">
              {SAMPLE_FIELDS.map((f) => (
                <div key={f.label} className="flex items-center justify-between gap-3 py-3">
                  <p className="text-sm text-foreground/90">{f.label}</p>
                  <FieldBadge status={f.status} />
                </div>
              ))}
            </div>
          </div>
        </Reveal>

        <Reveal delay={0.4}>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {STATUS_LEGEND.map((s) => (
              <div key={s.title} className="rounded-2xl border border-white/10 glass p-5">
                <span className={`grid size-10 place-items-center rounded-xl border ${s.cls}`}>{s.icon}</span>
                <p className="mt-3 font-display text-base font-medium">{s.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{s.desc}</p>
              </div>
            ))}
          </div>
        </Reveal>
      </Section>

      {/* 5 ── SOURCE COVERAGE */}
      <Section>
        <Reveal><Eyebrow>Data Team · Source Coverage</Eyebrow></Reveal>
        <Reveal delay={0.1}>
          <h2 className="mt-5 max-w-3xl font-display text-3xl font-medium leading-[1.08] md:text-5xl">
            Every source feeding the model <span className="text-gradient-trust">is verified by Truvi.</span>
          </h2>
        </Reveal>
        <Reveal delay={0.2}>
          <p className="mt-5 max-w-2xl text-muted-foreground">
            From master plans to ground-level records — each category below is checked,
            cross-referenced and kept current before it reaches the AI layer.
          </p>
        </Reveal>

        <Reveal delay={0.3}>
          <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {COVERAGE.map((name) => (
              <div key={name} className="flex items-center justify-between gap-2 rounded-xl border border-white/10 glass px-4 py-3">
                <span className="text-sm font-medium text-foreground/90">{name}</span>
                <Check size={14} className="text-green-400 shrink-0" />
              </div>
            ))}
          </div>
        </Reveal>

        <Reveal delay={0.4}>
          <div className="mt-6 flex items-start gap-4 rounded-2xl border border-white/10 glass p-5">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-green-800/60 bg-green-900/30 text-green-400">
              <Check size={16} />
            </span>
            <p className="text-sm text-muted-foreground">
              Every category above is pulled from an authoritative source, dated, and re-checked on a
              cycle — so downstream answers carry the <span className="font-semibold text-foreground">Verified</span> label,
              not an assumption.
            </p>
          </div>
        </Reveal>
      </Section>

      {/* 6 ── THREE PILLARS */}
      <Section>
        <Reveal><Eyebrow>The Three Pillars</Eyebrow></Reveal>
        <Reveal delay={0.1}>
          <h2 className="mt-5 max-w-3xl font-display text-3xl font-medium leading-[1.08] md:text-5xl">
            Organised. Understandable. <span className="text-gradient-trust">Decision-ready.</span>
          </h2>
        </Reveal>
        <Reveal delay={0.2}>
          <p className="mt-5 max-w-2xl text-muted-foreground">
            The same three principles that shape the Truvi platform shape every answer its AI gives.
          </p>
        </Reveal>

        <Reveal delay={0.3}>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {PILLARS.map((p) => (
              <div key={p.title} className="rounded-2xl border border-white/10 glass p-6">
                <span className="grid size-11 place-items-center rounded-xl border border-[var(--trust)]/30 bg-[var(--trust)]/10 text-[var(--trust)]">
                  {p.icon}
                </span>
                <p className="mt-4 font-display text-lg font-medium">{p.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{p.desc}</p>
              </div>
            ))}
          </div>
        </Reveal>

        <Reveal delay={0.4}>
          <div className="mt-14 flex justify-center">
            <div className="grid size-40 place-items-center rounded-full border border-dashed border-white/25 p-4">
              <div className="grid size-full place-items-center rounded-full bg-gradient-to-br from-[var(--trust)]/40 to-[var(--tech)]/25 shadow-[0_0_60px_rgba(59,130,246,0.2)]">
                <div className="text-center">
                  <p className="font-display text-base font-bold tracking-wide">TRUVI</p>
                  <p className="text-[9px] uppercase tracking-[0.22em] text-muted-foreground">Intelligence</p>
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </Section>

      {/* 7 ── CLOSING */}
      <Section className="text-center">
        <Reveal>
          <h2 className="mx-auto max-w-3xl font-display text-3xl font-medium leading-[1.1] md:text-5xl">
            Data comes first. <br />
            <span className="text-gradient-trust">Conclusions follow the evidence.</span>
          </h2>
        </Reveal>
        <Reveal delay={0.15}>
          <p className="mt-4 text-sm text-muted-foreground md:text-base">
            Truvi — the intelligence layer for real estate.
          </p>
        </Reveal>
        <Reveal delay={0.3}>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link
              to="/inventory"
              className="rounded-full bg-foreground px-6 py-2.5 text-sm font-medium text-background transition hover:opacity-90"
            >
              Explore Inventory
            </Link>
            <Link
              to="/"
              className="rounded-full border border-white/20 px-6 py-2.5 text-sm font-medium text-white transition hover:bg-white/10"
            >
              Back to Home
            </Link>
          </div>
        </Reveal>
      </Section>
    </main>
  );
}
