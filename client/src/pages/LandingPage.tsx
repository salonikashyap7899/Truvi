import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
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
      className={`relative z-10 mx-auto flex min-h-screen w-full max-w-7xl flex-col justify-center px-6 py-32 md:px-12 ${className}`}
    >
      {children}
    </section>
  );
}

function Nav() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 px-6 py-5 md:px-12">
      <div className="mx-auto flex max-w-7xl items-center justify-between rounded-full glass px-5 py-2.5">
        <a href="#top" className="flex items-center gap-2 font-display text-base font-semibold tracking-tight">
          <span className="grid size-6 place-items-center rounded-md bg-gradient-to-br from-[var(--trust)] to-[var(--tech)] text-[10px] font-bold">T</span>
          TRUVI
        </a>
        <nav className="hidden gap-7 text-xs uppercase tracking-[0.18em] text-muted-foreground md:flex">
          <a href="#ecosystem" className="hover:text-foreground">Ecosystem</a>
          <a href="#pillars" className="hover:text-foreground">Pillars</a>
          <a href="#roadmap" className="hover:text-foreground">Roadmap</a>
          <Link to="/login" className="hover:text-foreground">Log in</Link>
        </nav>
        <Link
          to="/join"
          className="rounded-full bg-foreground px-4 py-1.5 text-xs font-medium text-background transition hover:opacity-90"
        >
          Join
        </Link>
      </div>
    </header>
  );
}

function GlowButton({
  children,
  variant = "primary",
  href,
  to,
}: {
  children: ReactNode;
  variant?: "primary" | "ghost";
  href?: string;
  to?: string;
}) {
  const ghostClass =
    "inline-flex items-center gap-2 rounded-full glass px-6 py-3 text-sm font-medium transition hover:bg-white/10";
  const primaryClass =
    "group relative inline-flex items-center gap-2 overflow-hidden rounded-full px-6 py-3 text-sm font-medium text-background glow-trust";
  const primaryStyle = { background: "linear-gradient(135deg, #dbeafe, #ffffff)" };

  if (variant === "ghost") {
    if (to) {
      return (
        <Link to={to} className={ghostClass}>
          {children}
        </Link>
      );
    }
    return (
      <a href={href ?? "#"} className={ghostClass}>
        {children}
      </a>
    );
  }

  const inner = (
    <>
      <span className="relative z-10">{children}</span>
      <span className="relative z-10 transition group-hover:translate-x-1">→</span>
    </>
  );

  if (to) {
    return (
      <Link to={to} className={primaryClass} style={primaryStyle}>
        {inner}
      </Link>
    );
  }
  return (
    <a href={href ?? "#"} className={primaryClass} style={primaryStyle}>
      {inner}
    </a>
  );
}

const stakeholders = [
  { name: "Developers", desc: "Reach verified buyers and partners through one trusted network.", color: "var(--trust)" },
  { name: "Channel Partners", desc: "Exclusive inventory, training, dashboards, transparent commissions.", color: "var(--growth)" },
  { name: "Investors", desc: "Curated opportunities backed by verified data and intelligence.", color: "var(--gold)" },
  { name: "Buyers", desc: "Clarity, transparency and confidence at every step of the journey.", color: "var(--tech)" },
  { name: "Service Providers", desc: "Plug into a national ecosystem of demand and projects.", color: "var(--trust)" },
];

const pillars = [
  { name: "Trust", color: "var(--trust)", desc: "The foundation. Verification, transparency, accountability." },
  { name: "Growth", color: "var(--growth)", desc: "Compounding network effects across every stakeholder." },
  { name: "Technology", color: "#cbd5e1", desc: "An operating system purpose-built for real estate." },
  { name: "Network", color: "#60a5fa", desc: "Connections that turn fragmented markets into ecosystems." },
  { name: "Intelligence", color: "var(--tech)", desc: "AI-driven insight from search to closing." },
];

const phases = [
  { n: "01", title: "Network Foundation", desc: "Build the trust layer across India's leading micro-markets." },
  { n: "02", title: "Intelligence", desc: "Unify data and unlock AI across the buying journey." },
  { n: "03", title: "National Ecosystem", desc: "Connect every stakeholder under one trusted standard." },
  { n: "04", title: "Global Network", desc: "Extend the network to international real estate corridors." },
  { n: "05", title: "Trust Infrastructure", desc: "Become the default trust layer for global real estate." },
];

const values = ["Trust", "Transparency", "Relationships", "Growth", "Execution", "Long-Term Thinking"];

export default function LandingPage() {
  const mounted = useMounted();

  useEffect(() => {
    const prevTitle = document.title;
    document.title = "TRUVI — Trust Infrastructure for Real Estate";
    const meta = document.querySelector('meta[name="description"]');
    const prevDesc = meta?.getAttribute("content") ?? null;
    if (meta) {
      meta.setAttribute(
        "content",
        "TRUVI is building the world's most trusted real estate ecosystem. Trust creates value.",
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

      {/* Cinematic 3D background */}
      <Suspense fallback={null}>{mounted ? <CityCanvas /> : null}</Suspense>

      {/* HERO */}
      <Section className="items-center text-center">
        <Reveal>
          <Eyebrow>The Trust Infrastructure</Eyebrow>
        </Reveal>
        <Reveal delay={0.1}>
          <h1 className="font-display text-5xl font-medium leading-[0.95] tracking-tight text-gradient-aurora md:text-[7.5rem]">
            Trust Creates<br />Value.
          </h1>
        </Reveal>
        <Reveal delay={0.3}>
          <p className="mx-auto mt-8 max-w-2xl text-base text-muted-foreground md:text-lg">
            TRUVI is building the world's most trusted real estate ecosystem — an
            operating system where every stakeholder, every project and every
            connection is powered by verified trust.
          </p>
        </Reveal>
        <Reveal delay={0.5}>
          <div className="mt-12 flex flex-wrap items-center justify-center gap-4">
            <GlowButton href="#ecosystem">Explore the Ecosystem</GlowButton>
            <GlowButton variant="ghost" to="/join">Become a Partner</GlowButton>
          </div>
        </Reveal>
        <motion.div
          aria-hidden
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.4, duration: 1 }}
          className="absolute bottom-10 left-1/2 -translate-x-1/2 text-[10px] uppercase tracking-[0.4em] text-muted-foreground"
        >
          Scroll · Enter the city
        </motion.div>
      </Section>

      {/* PROBLEM */}
      <Section id="problem">
        <Reveal><Eyebrow>The Problem</Eyebrow></Reveal>
        <Reveal delay={0.1}>
          <h2 className="max-w-4xl font-display text-4xl font-medium leading-[1.05] md:text-7xl">
            Real estate is the world's largest market — and its most <span className="text-gradient-trust">broken</span> one.
          </h2>
        </Reveal>
        <div className="mt-20 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {[
            { t: "Fragmented Information", d: "Data scattered across portals, brokers and spreadsheets." },
            { t: "Low Transparency", d: "Buyers and partners operate behind a fog of unverified claims." },
            { t: "Inefficient Sales", d: "Long cycles, high friction, lost trust on every handoff." },
            { t: "High Acquisition Costs", d: "Marketing spend burns out before reaching qualified intent." },
          ].map((p, i) => (
            <Reveal key={p.t} delay={i * 0.08}>
              <div className="group relative h-full rounded-2xl glass p-6">
                <div className="mb-4 size-2 rounded-full bg-destructive animate-pulse-glow" />
                <h3 className="font-display text-lg font-medium">{p.t}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{p.d}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      {/* SOLUTION */}
      <Section id="solution" className="items-center text-center">
        <Reveal><Eyebrow>The Solution</Eyebrow></Reveal>
        <Reveal delay={0.1}>
          <h2 className="font-display text-5xl font-medium leading-[1.0] md:text-8xl">
            One Ecosystem.<br />
            <span className="text-gradient-aurora">Endless Opportunities.</span>
          </h2>
        </Reveal>
        <Reveal delay={0.3}>
          <p className="mx-auto mt-10 max-w-2xl text-muted-foreground md:text-lg">
            We replace fragmentation with a single trusted network — where data,
            people and projects connect, verify and grow together.
          </p>
        </Reveal>
      </Section>

      {/* ECOSYSTEM */}
      <Section id="ecosystem">
        <Reveal><Eyebrow>Every Stakeholder</Eyebrow></Reveal>
        <Reveal delay={0.1}>
          <h2 className="max-w-4xl font-display text-4xl font-medium md:text-7xl">
            Five towers. <span className="text-gradient-trust">One network.</span>
          </h2>
        </Reveal>
        <div className="mt-20 grid gap-5 md:grid-cols-2 lg:grid-cols-5">
          {stakeholders.map((s, i) => (
            <Reveal key={s.name} delay={i * 0.06}>
              <div className="group relative h-72 overflow-hidden rounded-2xl glass p-6 transition hover:-translate-y-1">
                <div
                  className="absolute inset-x-0 top-0 h-1 opacity-70 transition group-hover:opacity-100"
                  style={{ background: `linear-gradient(90deg, transparent, ${s.color}, transparent)` }}
                />
                <div className="flex h-full flex-col justify-between">
                  <div className="font-mono text-xs text-muted-foreground">0{i + 1}</div>
                  <div>
                    <h3 className="font-display text-xl font-medium">{s.name}</h3>
                    <p className="mt-3 text-sm text-muted-foreground">{s.desc}</p>
                  </div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      {/* PILLARS */}
      <Section id="pillars">
        <Reveal><Eyebrow>Five Infrastructure Pillars</Eyebrow></Reveal>
        <Reveal delay={0.1}>
          <h2 className="max-w-4xl font-display text-4xl font-medium md:text-7xl">
            The foundation beneath every project, partner and transaction.
          </h2>
        </Reveal>
        <div className="mt-20 grid gap-6 md:grid-cols-5">
          {pillars.map((p, i) => (
            <Reveal key={p.name} delay={i * 0.08}>
              <div className="relative h-[380px] overflow-hidden rounded-2xl glass">
                <div
                  className="absolute inset-x-1/2 bottom-0 top-12 w-[3px] -translate-x-1/2 rounded-full"
                  style={{
                    background: `linear-gradient(180deg, transparent, ${p.color}, transparent)`,
                    boxShadow: `0 0 40px ${p.color}`,
                  }}
                />
                <div className="absolute inset-x-0 bottom-0 p-6">
                  <div className="font-mono text-xs text-muted-foreground">0{i + 1}</div>
                  <h3 className="mt-2 font-display text-xl font-medium" style={{ color: p.color }}>
                    {p.name}
                  </h3>
                  <p className="mt-2 text-sm text-muted-foreground">{p.desc}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      {/* OS */}
      <Section className="items-center text-center">
        <Reveal><Eyebrow>The Operating System</Eyebrow></Reveal>
        <Reveal delay={0.1}>
          <h2 className="font-display text-5xl font-medium leading-[1.0] md:text-8xl">
            We are building the<br />
            <span className="text-gradient-aurora">Operating System for Real Estate.</span>
          </h2>
        </Reveal>
        <Reveal delay={0.3}>
          <p className="mx-auto mt-8 max-w-2xl text-muted-foreground md:text-lg">
            Verification. Intelligence. Distribution. Settlement. One stack —
            shared by every participant in the market.
          </p>
        </Reveal>
      </Section>

      {/* VALUES */}
      <Section>
        <Reveal><Eyebrow>Values</Eyebrow></Reveal>
        <Reveal delay={0.1}>
          <h2 className="max-w-4xl font-display text-4xl font-medium md:text-7xl">
            What powers the city.
          </h2>
        </Reveal>
        <div className="mt-16 flex flex-wrap gap-3">
          {values.map((v, i) => (
            <Reveal key={v} delay={i * 0.05}>
              <div className="rounded-full glass px-6 py-3 text-sm tracking-wide">
                {v}
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      {/* ROADMAP */}
      <Section id="roadmap">
        <Reveal><Eyebrow>Strategic Roadmap</Eyebrow></Reveal>
        <Reveal delay={0.1}>
          <h2 className="max-w-4xl font-display text-4xl font-medium md:text-7xl">
            A road that ends as <span className="text-gradient-aurora">global infrastructure.</span>
          </h2>
        </Reveal>
        <div className="relative mt-20">
          <div className="absolute left-4 top-0 h-full w-px bg-gradient-to-b from-[var(--trust)] via-[var(--tech)] to-transparent md:left-1/2" />
          <div className="space-y-12">
            {phases.map((p, i) => (
              <Reveal key={p.n} delay={i * 0.05}>
                <div className={`relative grid items-center gap-6 md:grid-cols-2 ${i % 2 ? "md:[&>div:first-child]:order-2" : ""}`}>
                  <div className="pl-12 md:pl-0 md:pr-12 md:text-right">
                    <div className="font-mono text-xs text-muted-foreground">Phase {p.n}</div>
                    <h3 className="mt-2 font-display text-2xl font-medium md:text-4xl">{p.title}</h3>
                    <p className="mt-3 text-sm text-muted-foreground">{p.desc}</p>
                  </div>
                  <div className="absolute left-4 top-2 size-3 -translate-x-1/2 rounded-full bg-[var(--trust)] glow-trust md:left-1/2" />
                  <div className="hidden md:block" />
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </Section>

      {/* DIFFERENCE */}
      <Section>
        <Reveal><Eyebrow>The Difference</Eyebrow></Reveal>
        <Reveal delay={0.1}>
          <h2 className="max-w-4xl font-display text-4xl font-medium md:text-7xl">
            Not a portal. Not a brokerage. <span className="text-gradient-trust">An ecosystem.</span>
          </h2>
        </Reveal>
        <div className="mt-16 grid gap-6 md:grid-cols-3">
          {[
            { t: "Traditional Portals", d: "Listings. Static. Disconnected from outcomes.", muted: true },
            { t: "Traditional Brokerage", d: "Local. Limited reach. Capped by relationships.", muted: true },
            { t: "TRUVI", d: "A living network. Verified. Intelligent. Compounding." },
          ].map((c, i) => (
            <Reveal key={c.t} delay={i * 0.1}>
              <div
                className={`relative h-72 overflow-hidden rounded-2xl p-6 ${
                  c.muted ? "border border-white/5 bg-white/[0.02]" : "glass glow-trust"
                }`}
              >
                {!c.muted && (
                  <div className="absolute inset-0 -z-10 opacity-60" style={{ background: "var(--gradient-aurora)" }} />
                )}
                <h3 className={`font-display text-xl font-medium ${c.muted ? "text-muted-foreground" : ""}`}>{c.t}</h3>
                <p className="mt-3 text-sm text-muted-foreground">{c.d}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      {/* 2050 */}
      <Section className="items-center text-center">
        <Reveal><Eyebrow>2050 Vision</Eyebrow></Reveal>
        <Reveal delay={0.1}>
          <h2 className="font-display text-5xl font-medium leading-[1.0] md:text-[8rem]">
            The trust layer<br /><span className="text-gradient-aurora">around the world.</span>
          </h2>
        </Reveal>
        <Reveal delay={0.3}>
          <p className="mx-auto mt-10 max-w-2xl text-muted-foreground md:text-lg">
            Every city, every project, every transaction — connected by a single
            standard of verified trust.
          </p>
        </Reveal>
      </Section>

      {/* CTA */}
      <Section id="join" className="items-center text-center">
        <Reveal>
          <h2 className="font-display text-5xl font-medium leading-[1.0] md:text-8xl">
            Trust Creates Value.
          </h2>
        </Reveal>
        <Reveal delay={0.2}>
          <p className="mx-auto mt-8 max-w-xl text-muted-foreground md:text-lg">
            Join the foundation of the next era of real estate.
          </p>
        </Reveal>
        <Reveal delay={0.4}>
          <div className="mt-12 flex flex-wrap items-center justify-center gap-4">
            <GlowButton to="/signup">Join the Ecosystem</GlowButton>
            <GlowButton variant="ghost" to="/join">Become a Partner</GlowButton>
            <GlowButton variant="ghost" to="/about">Request Demo</GlowButton>
          </div>
        </Reveal>
      </Section>

      <footer className="relative z-10 border-t border-white/5 px-6 py-12 text-center md:px-12">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-4 text-xs uppercase tracking-[0.2em] text-muted-foreground md:flex-row md:justify-between">
          <div>© {new Date().getFullYear()} TRUVI</div>
          <div>The Trust Infrastructure for Real Estate</div>
        </div>
      </footer>
    </div>
  );
}
