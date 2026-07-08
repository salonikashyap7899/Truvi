import { useEffect, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Handshake, ArrowRight, Globe, Mail, Phone } from "lucide-react";

/**
 * About Truvi Ventures — content and palette from the official About Us
 * deck: near-black canvas, champagne-gold accents, deep navy cards and
 * serif display headings.
 */

const GOLD = "#D9A44A";
const NAVY = "#131C36";
const NAVY_BORDER = "rgba(217,164,74,0.16)";

function Reveal({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 26 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[0.35em]" style={{ color: GOLD }}>
      {children}
    </p>
  );
}

function Section({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`mx-auto max-w-5xl px-6 py-14 md:px-10 md:py-20 ${className}`}>{children}</section>;
}

function NavyCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl p-6 ${className}`} style={{ background: NAVY, border: `1px solid ${NAVY_BORDER}` }}>
      {children}
    </div>
  );
}

/* ── Content from the deck ────────────────────────────────────────────────── */

const HERO_STATS = [
  { value: "$1.3T+", label: "Indian Real Estate Market" },
  { value: "9", label: "Stakeholder Groups Served" },
  { value: "6-Step", label: "Verification Engine" },
  { value: "AI", label: "Powered Intelligence Core" },
];

const STAKEHOLDERS = [
  "Home Buyers", "Investors", "Builders & Developers", "Banks & NBFCs",
  "Government", "Architects & Surveyors", "Channel Partners", "Law Firms",
];

const WHY = [
  { title: "Mission", desc: "Make Indian real estate transparent through verified intelligence." },
  { title: "Vision", desc: "Become India's largest Real Estate Intelligence Platform." },
  { title: "Purpose", desc: "Empower buyers, investors, builders and government with trusted information." },
];

const ENGINE_STEPS = [
  { n: "01", title: "Submission", desc: "Property details received from verified sources." },
  { n: "02", title: "Document Check", desc: "Ownership, approvals & legal validation." },
  { n: "03", title: "AI Verification", desc: "Consistency, duplicate & risk detection." },
  { n: "04", title: "Human Review", desc: "Expert check for accuracy & authenticity." },
  { n: "05", title: "Quality Assurance", desc: "Final compliance & quality checks." },
  { n: "06", title: "Verified Badge", desc: "Joins the Truvi trusted ecosystem." },
];

const PLATFORM_FEATURES = [
  "Verified Listings", "AI Search", "Trust Score", "Builder Ratings",
  "Locality Intelligence", "Investment Score", "Interactive Maps", "Voice Assistant",
];

const OPPORTUNITY = [
  { value: "$1.3T+", title: "Indian Real Estate Market", desc: "One of the world's fastest-growing property economies" },
  { value: "500M+", title: "Urban Population Growth", desc: "Driving unprecedented housing demand" },
  { value: "800M+", title: "Internet Users", desc: "Fueling a shift to digital property discovery" },
  { value: "AI-First", title: "Next-Gen Decisions", desc: "From static listings to real intelligence" },
];

const OPPORTUNITY_CHIPS = ["Growing Housing Demand", "Smart Cities", "Government Digitization", "AI-Driven Decisions"];

/* ── Page ─────────────────────────────────────────────────────────────────── */

export default function AboutPage() {
  useEffect(() => {
    document.title = "TRUVI — About Truvi Ventures";
  }, []);

  const serif = { fontFamily: "Georgia, 'Times New Roman', serif" };

  return (
    // Transparent canvas — the shared 3D cityscape background shows through,
    // with the deck's champagne glow layered on top of it.
    <main className="relative min-h-screen text-white">
      {/* Champagne glow, top-right — as in the deck */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div
          className="absolute right-[-12%] top-[-8%] h-[55vh] w-[55vw] rounded-full opacity-30 blur-3xl"
          style={{ background: `radial-gradient(circle, ${GOLD} 0%, transparent 70%)` }}
        />
        <div
          className="absolute bottom-[10%] left-[-15%] h-[40vh] w-[40vw] rounded-full opacity-10 blur-3xl"
          style={{ background: `radial-gradient(circle, ${GOLD} 0%, transparent 70%)` }}
        />
      </div>

      {/* ── 1 · HERO ── */}
      <Section className="relative pt-32 md:pt-40">
        <Reveal>
          <div className="flex items-center justify-between gap-4">
            <Eyebrow>About Truvi Ventures</Eyebrow>
            <span className="grid size-12 shrink-0 place-items-center rounded-full" style={{ background: GOLD }}>
              <img src="/brand/icon.png" alt="Truvi" className="size-7 object-contain" />
            </span>
          </div>
        </Reveal>
        <Reveal delay={0.1}>
          <h1 className="mt-6 max-w-3xl text-4xl font-bold leading-[1.1] md:text-6xl" style={serif}>
            We're building the trust layer for Indian real estate.
          </h1>
        </Reveal>
        <Reveal delay={0.2}>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-white/65 md:text-lg">
            Verified data. AI intelligence. One platform — for every buyer, builder, bank and
            government body that needs to trust a property decision.
          </p>
        </Reveal>
        <Reveal delay={0.3}>
          <div className="mt-8 flex flex-wrap gap-3">
            {["Verified", "Trusted", "Intelligent"].map((chip) => (
              <span
                key={chip}
                className="rounded-full px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/85"
                style={{ border: `1px solid ${NAVY_BORDER}` }}
              >
                {chip}
              </span>
            ))}
          </div>
        </Reveal>

        {/* Stat strip */}
        <Reveal delay={0.4}>
          <div className="mt-16 grid grid-cols-2 gap-x-8 gap-y-6 border-t pt-8 md:grid-cols-4" style={{ borderColor: NAVY_BORDER }}>
            {HERO_STATS.map((s) => (
              <div key={s.label}>
                <p className="text-2xl font-bold md:text-3xl" style={{ ...serif, color: GOLD }}>{s.value}</p>
                <p className="mt-1 text-[10px] uppercase tracking-[0.18em] text-white/50">{s.label}</p>
              </div>
            ))}
          </div>
        </Reveal>
      </Section>

      {/* ── 2 · ECOSYSTEM ── */}
      <Section className="relative">
        <Reveal><Eyebrow>The Truvi Ecosystem</Eyebrow></Reveal>
        <Reveal delay={0.1}>
          <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <h2 className="max-w-md text-3xl font-bold leading-tight md:text-4xl" style={serif}>
              One platform. Every stakeholder.
            </h2>
            <p className="max-w-xs text-sm text-white/55 md:text-right">
              A single, trusted source of truth connecting the entire property decision chain.
            </p>
          </div>
        </Reveal>

        <Reveal delay={0.25}>
          <div className="mt-12 flex flex-col items-center gap-8 md:flex-row md:justify-center md:gap-10">
            {/* Center node */}
            <div className="grid size-36 shrink-0 place-items-center rounded-full text-center shadow-[0_0_60px_rgba(217,164,74,0.35)]" style={{ background: GOLD }}>
              <div>
                <p className="text-base font-bold text-[#131C36]" style={serif}>TRUVI</p>
                <p className="text-[9px] font-semibold uppercase tracking-[0.25em] text-[#131C36]/80">Intelligence</p>
              </div>
            </div>
            {/* Stakeholder nodes */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:max-w-lg">
              {STAKEHOLDERS.map((s) => (
                <div
                  key={s}
                  className="flex min-h-[76px] items-center justify-center rounded-full px-4 py-3 text-center text-xs font-medium text-white/90"
                  style={{ background: NAVY, border: `1px solid rgba(217,164,74,0.35)` }}
                >
                  {s}
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      </Section>

      {/* ── 3 · WHY WE EXIST ── */}
      <Section className="relative">
        <Reveal><Eyebrow>Why We Exist</Eyebrow></Reveal>
        <Reveal delay={0.1}>
          <h2 className="mt-4 max-w-lg text-3xl font-bold leading-tight md:text-4xl" style={serif}>
            Trust should come before every property decision.
          </h2>
        </Reveal>
        <div className="mt-10 space-y-4">
          {WHY.map((w, i) => (
            <Reveal key={w.title} delay={0.15 + i * 0.08}>
              <NavyCard>
                <span className="grid size-9 place-items-center rounded-full" style={{ border: `1px solid ${GOLD}` }}>
                  <span className="size-2.5 rounded-full" style={{ background: GOLD }} />
                </span>
                <h3 className="mt-4 text-lg font-bold" style={{ ...serif, color: GOLD }}>{w.title}</h3>
                <p className="mt-1.5 text-sm text-white/70">{w.desc}</p>
              </NavyCard>
            </Reveal>
          ))}
          <Reveal delay={0.4}>
            <div className="rounded-2xl p-6" style={{ background: NAVY, borderLeft: `3px solid ${GOLD}` }}>
              <p className="text-lg italic text-white/90" style={serif}>
                "Trust should come before every property decision."
              </p>
              <p className="mt-3 text-[10px] uppercase tracking-[0.25em] text-white/45">
                Founder & CEO, Truvi Ventures
              </p>
            </div>
          </Reveal>
        </div>
      </Section>

      {/* ── 4 · VERIFICATION ENGINE ── */}
      <Section className="relative">
        <Reveal><Eyebrow>How It Works</Eyebrow></Reveal>
        <Reveal delay={0.1}>
          <h2 className="mt-4 text-3xl font-bold md:text-4xl" style={serif}>The Truvi Verification Engine</h2>
          <p className="mt-2 text-sm text-white/55">AI-powered. Human-verified. Truvi-trusted.</p>
        </Reveal>

        <div className="mt-10 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-6">
          {ENGINE_STEPS.map((s, i) => (
            <Reveal key={s.n} delay={0.15 + i * 0.06}>
              <div className="text-center">
                <p className="text-[10px] font-semibold tracking-[0.25em]" style={{ color: GOLD }}>{s.n}</p>
                <div
                  className="mx-auto mt-2 grid size-14 place-items-center rounded-full"
                  style={{ background: NAVY, border: `1px solid ${GOLD}` }}
                >
                  <span className="text-sm font-bold" style={{ ...serif, color: GOLD }}>{s.n}</span>
                </div>
                <h3 className="mt-3 text-sm font-bold" style={serif}>{s.title}</h3>
                <p className="mt-1 text-[11px] leading-snug text-white/55">{s.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal delay={0.3}>
          <p className="mt-14 text-[11px] font-semibold uppercase tracking-[0.35em]" style={{ color: GOLD }}>
            On One Platform
          </p>
          <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
            {PLATFORM_FEATURES.map((f) => (
              <div
                key={f}
                className="rounded-xl px-5 py-3.5 text-center text-sm font-medium text-white/85"
                style={{ background: NAVY, border: `1px solid ${NAVY_BORDER}` }}
              >
                {f}
              </div>
            ))}
          </div>
        </Reveal>
      </Section>

      {/* ── 5 · THE OPPORTUNITY ── */}
      <Section className="relative">
        <Reveal><Eyebrow>The Opportunity</Eyebrow></Reveal>
        <Reveal delay={0.1}>
          <h2 className="mt-4 max-w-xl text-3xl font-bold leading-tight md:text-4xl" style={serif}>
            India's real estate ecosystem is entering the era of verified intelligence.
          </h2>
        </Reveal>
        <div className="mt-10 grid gap-4 md:grid-cols-2">
          {OPPORTUNITY.map((o, i) => (
            <Reveal key={o.title} delay={0.15 + i * 0.07}>
              <NavyCard className="h-full">
                <p className="text-4xl font-bold md:text-5xl" style={{ ...serif, color: GOLD }}>{o.value}</p>
                <p className="mt-3 text-sm font-semibold text-white/90">{o.title}</p>
                <p className="mt-1 text-xs text-white/55">{o.desc}</p>
              </NavyCard>
            </Reveal>
          ))}
        </div>
        <Reveal delay={0.4}>
          <div className="mt-6 flex flex-wrap gap-2.5">
            {OPPORTUNITY_CHIPS.map((c) => (
              <span
                key={c}
                className="rounded-full px-4 py-1.5 text-xs text-white/80"
                style={{ border: `1px solid ${NAVY_BORDER}`, background: "rgba(19,28,54,0.5)" }}
              >
                {c}
              </span>
            ))}
          </div>
        </Reveal>
      </Section>

      {/* ── 6 · CLOSING + CONTACT ── */}
      <Section className="relative text-center">
        <Reveal>
          <span className="mx-auto grid size-16 place-items-center rounded-full shadow-[0_0_50px_rgba(217,164,74,0.4)]" style={{ background: GOLD }}>
            <img src="/brand/icon.png" alt="Truvi" className="size-9 object-contain" />
          </span>
          <p className="mt-5 text-xl font-bold tracking-[0.5em]" style={serif}>TRUVI</p>
          <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.3em]" style={{ color: GOLD }}>
            Building India's Real Estate Intelligence Infrastructure
          </p>
          <p className="mx-auto mt-5 max-w-md text-base italic text-white/70" style={serif}>
            "The future of real estate belongs to verified intelligence, trusted data and smarter decisions."
          </p>
        </Reveal>

        <Reveal delay={0.2}>
          <div className="mx-auto mt-10 grid max-w-2xl gap-3 sm:grid-cols-3">
            {[
              { icon: <Globe size={14} />, label: "Website", value: "www.truviventures.com" },
              { icon: <Mail size={14} />, label: "Email", value: "truviventures@gmail.com" },
              { icon: <Phone size={14} />, label: "Phone", value: "+91 96366358" },
            ].map((c) => (
              <div key={c.label} className="rounded-xl px-4 py-4 text-left" style={{ background: NAVY, border: `1px solid ${NAVY_BORDER}` }}>
                <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.2em]" style={{ color: GOLD }}>
                  {c.icon} {c.label}
                </p>
                <p className="mt-1.5 truncate text-sm text-white/90">{c.value}</p>
              </div>
            ))}
          </div>
        </Reveal>
      </Section>

      {/* ── CHANNEL PARTNER CTA ── */}
      <Section className="relative pb-28 pt-4">
        <Reveal>
          <div
            className="flex flex-col items-center gap-5 rounded-3xl px-8 py-10 text-center md:flex-row md:justify-between md:text-left"
            style={{ background: NAVY, border: `1px solid rgba(217,164,74,0.35)` }}
          >
            <div className="flex items-center gap-4">
              <span className="grid size-12 shrink-0 place-items-center rounded-2xl" style={{ background: "rgba(217,164,74,0.15)", border: `1px solid ${GOLD}` }}>
                <Handshake size={22} style={{ color: GOLD }} />
              </span>
              <div>
                <h3 className="text-xl font-bold" style={serif}>Channel Partners</h3>
                <p className="mt-1 text-sm text-white/60">
                  Sell with verified inventory, transparent commissions and Truvi intelligence.
                </p>
              </div>
            </div>
            <Link
              to="/signup?role=CP"
              className="group inline-flex shrink-0 items-center gap-2 rounded-full px-7 py-3 text-sm font-semibold text-[#131C36] transition-all hover:shadow-[0_0_35px_rgba(217,164,74,0.45)]"
              style={{ background: GOLD }}
            >
              Visit the Channel Partner page
              <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        </Reveal>
        <Reveal delay={0.1}>
          <p className="mt-4 text-center text-xs text-white/40">
            Already a partner?{" "}
            <Link to="/login" className="underline-offset-4 hover:underline" style={{ color: GOLD }}>
              Sign in to your Channel Partner workspace
            </Link>
          </p>
        </Reveal>
      </Section>
    </main>
  );
}
