import { useEffect, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { motion, useScroll, useTransform } from "framer-motion";
import { Handshake, ArrowRight, Globe, Mail, Phone } from "lucide-react";

const GOLD = "#D9A44A";
const NAVY = "rgba(13,20,42,0.72)";
const NAVY_BORDER = "rgba(217,164,74,0.18)";
const GLASS = "rgba(8,14,30,0.55)";

/* ── WhatsApp SVG Icon ──────────────────────────────────────────────────── */
function WhatsAppIcon({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="16" cy="16" r="16" fill="#25D366" />
      <path
        d="M22.94 9.06A9.77 9.77 0 0 0 16.02 6C10.51 6 6.04 10.47 6.04 15.98c0 1.76.46 3.47 1.33 4.98L6 26l5.18-1.36a9.93 9.93 0 0 0 4.82 1.23h.01c5.5 0 9.97-4.47 9.97-9.98a9.91 9.91 0 0 0-2.04-6.83ZM16.02 24.5a8.23 8.23 0 0 1-4.2-1.15l-.3-.18-3.08.81.82-3-.2-.31a8.24 8.24 0 0 1-1.26-4.39c0-4.56 3.71-8.27 8.27-8.27a8.2 8.2 0 0 1 5.84 2.42 8.2 8.2 0 0 1 2.41 5.85c0 4.56-3.71 8.22-8.3 8.22Zm4.54-6.17c-.25-.12-1.47-.72-1.7-.81-.23-.08-.39-.12-.56.12-.16.25-.64.81-.78.97-.15.17-.29.19-.54.06a6.8 6.8 0 0 1-2-.96 7.54 7.54 0 0 1-1.39-1.53c-.14-.25-.01-.38.11-.5.11-.11.25-.29.37-.43.13-.14.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.13-.56-1.34-.76-1.84-.2-.48-.4-.41-.56-.42H13c-.16 0-.43.06-.66.31-.23.25-.86.84-.86 2.04s.88 2.37 1 2.53c.13.16 1.73 2.64 4.19 3.7.59.25 1.04.4 1.4.51.59.19 1.12.16 1.54.1.47-.07 1.47-.6 1.68-1.18.2-.57.2-1.07.14-1.17-.07-.11-.23-.16-.48-.28Z"
        fill="white"
      />
    </svg>
  );
}

/* ── Animations ──────────────────────────────────────────────────────────── */
function Reveal({ children, delay = 0, direction = "up" }: { children: ReactNode; delay?: number; direction?: "up" | "left" | "right" }) {
  const y = direction === "up" ? 32 : 0;
  const x = direction === "left" ? -32 : direction === "right" ? 32 : 0;
  return (
    <motion.div
      initial={{ opacity: 0, y, x }}
      whileInView={{ opacity: 1, y: 0, x: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.75, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <motion.p
      initial={{ opacity: 0, letterSpacing: "0.1em" }}
      whileInView={{ opacity: 1, letterSpacing: "0.35em" }}
      viewport={{ once: true }}
      transition={{ duration: 0.9, ease: "easeOut" }}
      className="text-[11px] font-semibold uppercase"
      style={{ color: GOLD }}
    >
      {children}
    </motion.p>
  );
}

function Section({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section className={`relative z-10 mx-auto max-w-5xl px-6 py-14 md:px-10 md:py-20 ${className}`}>
      {children}
    </section>
  );
}

function GlassCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      whileHover={{ y: -4, boxShadow: `0 12px 48px rgba(217,164,74,0.12)` }}
      transition={{ duration: 0.3 }}
      className={`rounded-2xl p-6 backdrop-blur-md ${className}`}
      style={{ background: NAVY, border: `1px solid ${NAVY_BORDER}` }}
    >
      {children}
    </motion.div>
  );
}

/* ── Content ─────────────────────────────────────────────────────────────── */

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

/* ── Floating WhatsApp Button ───────────────────────────────────────────── */
function WhatsAppFAB() {
  const waUrl = "https://wa.me/919196366358?text=Hi%20Truvi%20Ventures%2C%20I%20would%20like%20to%20know%20more!";
  return (
    <motion.a
      href={waUrl}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat on WhatsApp"
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ delay: 1.2, type: "spring", stiffness: 200, damping: 18 }}
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.95 }}
      className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 rounded-full shadow-2xl overflow-hidden"
      style={{
        background: "linear-gradient(135deg, #25D366 0%, #128C7E 100%)",
        boxShadow: "0 8px 32px rgba(37,211,102,0.45), 0 2px 8px rgba(0,0,0,0.3)",
      }}
    >
      {/* Pulse ring */}
      <motion.span
        animate={{ scale: [1, 1.6], opacity: [0.5, 0] }}
        transition={{ repeat: Infinity, duration: 2, ease: "easeOut" }}
        className="absolute inset-0 rounded-full"
        style={{ background: "rgba(37,211,102,0.4)" }}
      />

      <span className="relative flex items-center gap-2.5 px-4 py-3">
        <WhatsAppIcon size={26} />
        <span className="text-sm font-semibold text-white pr-1 hidden sm:block">Chat with us</span>
      </span>
    </motion.a>
  );
}

/* ── Hero Scroll Parallax ────────────────────────────────────────────────── */
function HeroParallax({ children }: { children: ReactNode }) {
  const { scrollY } = useScroll();
  const y = useTransform(scrollY, [0, 400], [0, 60]);
  return <motion.div style={{ y }}>{children}</motion.div>;
}

/* ── Page ─────────────────────────────────────────────────────────────────── */

export default function AboutPage() {
  useEffect(() => {
    document.title = "TRUVI — About Truvi Ventures";
  }, []);

  const serif = { fontFamily: "Georgia, 'Times New Roman', serif" };

  return (
    <>
      {/* Page-level vignette overlay */}
      <div
        className="pointer-events-none fixed inset-0 z-[1]"
        style={{
          background: "radial-gradient(ellipse at 50% 0%, rgba(217,164,74,0.07) 0%, transparent 65%), linear-gradient(to bottom, rgba(5,6,8,0.55) 0%, transparent 30%, rgba(5,6,8,0.35) 100%)",
        }}
        aria-hidden
      />

      <main className="relative min-h-screen text-white">
        {/* ── 1 · HERO ── */}
        <Section className="pt-32 md:pt-40">
          <HeroParallax>
            <Reveal>
              <div className="flex items-center justify-between gap-4">
                <Eyebrow>About Truvi Ventures</Eyebrow>
                <motion.span
                  animate={{ boxShadow: ["0 0 20px rgba(217,164,74,0.4)", "0 0 40px rgba(217,164,74,0.7)", "0 0 20px rgba(217,164,74,0.4)"] }}
                  transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
                  className="grid size-12 shrink-0 place-items-center rounded-full"
                  style={{ background: GOLD }}
                >
                  <img src="/brand/icon.png" alt="Truvi" className="size-7 object-contain" />
                </motion.span>
              </div>
            </Reveal>
            <Reveal delay={0.1}>
              <h1 className="mt-6 max-w-3xl text-4xl font-bold leading-[1.1] md:text-6xl" style={serif}>
                We're building the{" "}
                <span style={{ color: GOLD }}>trust layer</span>{" "}
                for Indian real estate.
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
                {["Verified", "Trusted", "Intelligent"].map((chip, i) => (
                  <motion.span
                    key={chip}
                    initial={{ opacity: 0, scale: 0.85 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.5 + i * 0.1, duration: 0.5 }}
                    className="rounded-full px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/85 backdrop-blur-sm"
                    style={{ border: `1px solid ${NAVY_BORDER}`, background: GLASS }}
                  >
                    {chip}
                  </motion.span>
                ))}
              </div>
            </Reveal>

            {/* Stat strip */}
            <Reveal delay={0.4}>
              <div className="mt-16 grid grid-cols-2 gap-x-8 gap-y-6 border-t pt-8 md:grid-cols-4" style={{ borderColor: NAVY_BORDER }}>
                {HERO_STATS.map((s, i) => (
                  <motion.div
                    key={s.label}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.5 + i * 0.1, duration: 0.6 }}
                  >
                    <p className="text-2xl font-bold md:text-3xl" style={{ ...serif, color: GOLD }}>{s.value}</p>
                    <p className="mt-1 text-[10px] uppercase tracking-[0.18em] text-white/50">{s.label}</p>
                  </motion.div>
                ))}
              </div>
            </Reveal>
          </HeroParallax>
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
              <motion.div
                animate={{
                  boxShadow: [
                    "0 0 40px rgba(217,164,74,0.35)",
                    "0 0 70px rgba(217,164,74,0.6)",
                    "0 0 40px rgba(217,164,74,0.35)",
                  ],
                }}
                transition={{ repeat: Infinity, duration: 3.5, ease: "easeInOut" }}
                className="grid size-36 shrink-0 place-items-center rounded-full text-center"
                style={{ background: GOLD }}
              >
                <div>
                  <p className="text-base font-bold text-[#131C36]" style={serif}>TRUVI</p>
                  <p className="text-[9px] font-semibold uppercase tracking-[0.25em] text-[#131C36]/80">Intelligence</p>
                </div>
              </motion.div>

              {/* Stakeholder nodes */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:max-w-lg">
                {STAKEHOLDERS.map((s, i) => (
                  <motion.div
                    key={s}
                    initial={{ opacity: 0, scale: 0.85 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.3 + i * 0.06, duration: 0.5 }}
                    whileHover={{ scale: 1.04, borderColor: GOLD }}
                    className="flex min-h-[76px] items-center justify-center rounded-full px-4 py-3 text-center text-xs font-medium text-white/90 backdrop-blur-sm transition-colors"
                    style={{ background: NAVY, border: `1px solid rgba(217,164,74,0.28)` }}
                  >
                    {s}
                  </motion.div>
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
                <GlassCard>
                  <span className="grid size-9 place-items-center rounded-full" style={{ border: `1px solid ${GOLD}` }}>
                    <span className="size-2.5 rounded-full" style={{ background: GOLD }} />
                  </span>
                  <h3 className="mt-4 text-lg font-bold" style={{ ...serif, color: GOLD }}>{w.title}</h3>
                  <p className="mt-1.5 text-sm text-white/70">{w.desc}</p>
                </GlassCard>
              </Reveal>
            ))}
            <Reveal delay={0.4}>
              <div
                className="rounded-2xl p-6 backdrop-blur-md"
                style={{ background: NAVY, borderLeft: `3px solid ${GOLD}` }}
              >
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
              <motion.div
                key={s.n}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.15 + i * 0.07, duration: 0.6 }}
                className="text-center"
              >
                <p className="text-[10px] font-semibold tracking-[0.25em]" style={{ color: GOLD }}>{s.n}</p>
                <motion.div
                  whileHover={{ scale: 1.12, boxShadow: `0 0 24px rgba(217,164,74,0.5)` }}
                  className="mx-auto mt-2 grid size-14 place-items-center rounded-full backdrop-blur-sm"
                  style={{ background: NAVY, border: `1px solid ${GOLD}` }}
                >
                  <span className="text-sm font-bold" style={{ ...serif, color: GOLD }}>{s.n}</span>
                </motion.div>
                <h3 className="mt-3 text-sm font-bold" style={serif}>{s.title}</h3>
                <p className="mt-1 text-[11px] leading-snug text-white/55">{s.desc}</p>
              </motion.div>
            ))}
          </div>

          {/* Connector line */}
          <Reveal delay={0.2}>
            <div className="relative mt-6 hidden lg:block">
              <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2" style={{ background: `linear-gradient(to right, transparent, ${GOLD}55, transparent)` }} />
            </div>
          </Reveal>

          <Reveal delay={0.3}>
            <p className="mt-14 text-[11px] font-semibold uppercase tracking-[0.35em]" style={{ color: GOLD }}>
              On One Platform
            </p>
            <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
              {PLATFORM_FEATURES.map((f, i) => (
                <motion.div
                  key={f}
                  initial={{ opacity: 0, x: i % 2 === 0 ? -16 : 16 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.35 + i * 0.05, duration: 0.5 }}
                  whileHover={{ x: 4 }}
                  className="rounded-xl px-5 py-3.5 text-center text-sm font-medium text-white/85 backdrop-blur-sm"
                  style={{ background: NAVY, border: `1px solid ${NAVY_BORDER}` }}
                >
                  {f}
                </motion.div>
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
                <GlassCard className="h-full">
                  <p className="text-4xl font-bold md:text-5xl" style={{ ...serif, color: GOLD }}>{o.value}</p>
                  <p className="mt-3 text-sm font-semibold text-white/90">{o.title}</p>
                  <p className="mt-1 text-xs text-white/55">{o.desc}</p>
                </GlassCard>
              </Reveal>
            ))}
          </div>
          <Reveal delay={0.4}>
            <div className="mt-6 flex flex-wrap gap-2.5">
              {OPPORTUNITY_CHIPS.map((c) => (
                <motion.span
                  key={c}
                  whileHover={{ scale: 1.05 }}
                  className="rounded-full px-4 py-1.5 text-xs text-white/80 backdrop-blur-sm"
                  style={{ border: `1px solid ${NAVY_BORDER}`, background: GLASS }}
                >
                  {c}
                </motion.span>
              ))}
            </div>
          </Reveal>
        </Section>

        {/* ── 6 · CLOSING + CONTACT ── */}
        <Section className="relative text-center">
          <Reveal>
            <motion.span
              animate={{
                boxShadow: [
                  "0 0 30px rgba(217,164,74,0.4)",
                  "0 0 60px rgba(217,164,74,0.7)",
                  "0 0 30px rgba(217,164,74,0.4)",
                ],
              }}
              transition={{ repeat: Infinity, duration: 3.5 }}
              className="mx-auto grid size-16 place-items-center rounded-full"
              style={{ background: GOLD }}
            >
              <img src="/brand/icon.png" alt="Truvi" className="size-9 object-contain" />
            </motion.span>
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
                { icon: <Globe size={14} />, label: "Website", value: "www.truviventures.com", href: "https://www.truviventures.com" },
                { icon: <Mail size={14} />, label: "Email", value: "truviventures@gmail.com", href: "mailto:truviventures@gmail.com" },
                { icon: <Phone size={14} />, label: "Phone", value: "+91 91963 66358", href: "tel:+919196366358" },
              ].map((c) => (
                <motion.a
                  key={c.label}
                  href={c.href}
                  target={c.href.startsWith("http") ? "_blank" : undefined}
                  rel="noopener noreferrer"
                  whileHover={{ y: -3, boxShadow: `0 8px 30px rgba(217,164,74,0.15)` }}
                  className="rounded-xl px-4 py-4 text-left block backdrop-blur-md"
                  style={{ background: NAVY, border: `1px solid ${NAVY_BORDER}` }}
                >
                  <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.2em]" style={{ color: GOLD }}>
                    {c.icon} {c.label}
                  </p>
                  <p className="mt-1.5 truncate text-sm text-white/90">{c.value}</p>
                </motion.a>
              ))}
            </div>
          </Reveal>

          {/* WhatsApp CTA inline */}
          <Reveal delay={0.35}>
            <div className="mt-8">
              <motion.a
                href="https://wa.me/919196366358?text=Hi%20Truvi%20Ventures%2C%20I%20would%20like%20to%20know%20more!"
                target="_blank"
                rel="noopener noreferrer"
                whileHover={{ scale: 1.04, boxShadow: "0 8px 40px rgba(37,211,102,0.35)" }}
                whileTap={{ scale: 0.97 }}
                className="inline-flex items-center gap-3 rounded-full px-8 py-3.5 text-sm font-semibold text-white shadow-lg"
                style={{
                  background: "linear-gradient(135deg, #25D366 0%, #128C7E 100%)",
                  boxShadow: "0 4px 20px rgba(37,211,102,0.3)",
                }}
              >
                <WhatsAppIcon size={20} />
                Message us on WhatsApp
              </motion.a>
            </div>
          </Reveal>
        </Section>

        {/* ── CHANNEL PARTNER CTA ── */}
        <Section className="relative pb-28 pt-4">
          <Reveal>
            <motion.div
              whileHover={{ boxShadow: `0 16px 60px rgba(217,164,74,0.2)` }}
              className="flex flex-col items-center gap-5 rounded-3xl px-8 py-10 text-center backdrop-blur-md md:flex-row md:justify-between md:text-left"
              style={{ background: NAVY, border: `1px solid rgba(217,164,74,0.35)` }}
            >
              <div className="flex items-center gap-4">
                <motion.span
                  animate={{ rotate: [0, 8, -8, 0] }}
                  transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
                  className="grid size-12 shrink-0 place-items-center rounded-2xl"
                  style={{ background: "rgba(217,164,74,0.15)", border: `1px solid ${GOLD}` }}
                >
                  <Handshake size={22} style={{ color: GOLD }} />
                </motion.span>
                <div>
                  <h3 className="text-xl font-bold" style={serif}>Channel Partners</h3>
                  <p className="mt-1 text-sm text-white/60">
                    Sell with verified inventory, transparent commissions and Truvi intelligence.
                  </p>
                </div>
              </div>
              <Link
                to="/signup?role=CP"
                className="group inline-flex shrink-0 items-center gap-2 rounded-full px-7 py-3 text-sm font-semibold text-[#131C36] transition-all hover:shadow-[0_0_35px_rgba(217,164,74,0.55)]"
                style={{ background: GOLD }}
              >
                Visit the Channel Partner page
                <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" />
              </Link>
            </motion.div>
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

      {/* Floating WhatsApp button — always visible */}
      <WhatsAppFAB />
    </>
  );
}
