import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { motion, useScroll, useTransform } from "framer-motion";
import {
  Handshake, ArrowRight, Globe, Mail, Phone,
  MapPin, FileCheck, ShieldCheck, Banknote, Star, Clock, QrCode,
} from "lucide-react";
import { AmbassadorQRCode } from "@/components/AmbassadorQRCode";
import { SiteNav } from "@/components/SiteNav";

/* ── Palette: blue replaces gold everywhere ─────────────────────────────── */
const BLUE = "#3B82F6";
const BLUE_DIM = "rgba(59,130,246,0.15)";
const BLUE_BORDER = "rgba(59,130,246,0.22)";
const NAVY = "rgba(13,20,42,0.72)";
const GLASS = "rgba(8,14,30,0.55)";

/* ── Animations ──────────────────────────────────────────────────────────── */
function Reveal({
  children, delay = 0, direction = "up",
}: { children: ReactNode; delay?: number; direction?: "up" | "left" | "right" }) {
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
      style={{ color: BLUE }}
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
      whileHover={{ y: -4, boxShadow: `0 12px 48px rgba(59,130,246,0.14)` }}
      transition={{ duration: 0.3 }}
      className={`rounded-2xl p-6 backdrop-blur-md ${className}`}
      style={{ background: NAVY, border: `1px solid ${BLUE_BORDER}` }}
    >
      {children}
    </motion.div>
  );
}

/* ── Content ─────────────────────────────────────────────────────────────── */
const HERO_STATS = [
  { value: "$1.3T+", label: "Indian Real Estate Market" },
  { value: "9",      label: "Stakeholder Groups Served" },
  { value: "6-Step", label: "Verification Engine" },
  { value: "AI",     label: "Powered Intelligence Core" },
];

const STAKEHOLDERS = [
  "Home Buyers", "Investors", "Builders & Developers", "Banks & NBFCs",
  "Government", "Architects & Surveyors", "Channel Partners", "Law Firms",
];

const WHY = [
  { title: "Mission", desc: "Make Indian real estate transparent through verified intelligence." },
  { title: "Vision",  desc: "Become India's largest Real Estate Intelligence Platform." },
  { title: "Purpose", desc: "Empower buyers, investors, builders and government with trusted information." },
];

const ENGINE_STEPS = [
  { n: "01", title: "Submission",        desc: "Property details received from verified sources." },
  { n: "02", title: "Document Check",    desc: "Ownership, approvals & legal validation." },
  { n: "03", title: "AI Verification",   desc: "Consistency, duplicate & risk detection." },
  { n: "04", title: "Human Review",      desc: "Expert check for accuracy & authenticity." },
  { n: "05", title: "Quality Assurance", desc: "Final compliance & quality checks." },
  { n: "06", title: "Verified Badge",    desc: "Joins the Truvi trusted ecosystem." },
];

const PLATFORM_FEATURES = [
  "Verified Listings", "AI Search", "Trust Score", "Builder Ratings",
  "Locality Intelligence", "Investment Score", "Interactive Maps", "Voice Assistant",
];

const OPPORTUNITY = [
  { value: "$1.3T+",    title: "Indian Real Estate Market",  desc: "One of the world's fastest-growing property economies" },
  { value: "500M+",     title: "Urban Population Growth",    desc: "Driving unprecedented housing demand" },
  { value: "800M+",     title: "Internet Users",             desc: "Fueling a shift to digital property discovery" },
  { value: "AI-First",  title: "Next-Gen Decisions",         desc: "From static listings to real intelligence" },
];

const OPPORTUNITY_CHIPS = ["Growing Housing Demand", "Smart Cities", "Government Digitization", "AI-Driven Decisions"];

/* ── Ambassador flow steps ───────────────────────────────────────────────── */
const AMBASSADOR_STEPS = [
  {
    icon: <ShieldCheck size={20} />,
    title: "Register & Verify",
    desc: "Sign up, upload your Aadhaar, verify your mobile & email OTP. Your profile goes Active instantly.",
  },
  {
    icon: <MapPin size={20} />,
    title: "Pick a Task",
    desc: "Browse available project listings — see the address, Google Map location, and deadline before you accept.",
  },
  {
    icon: <Clock size={20} />,
    title: "6-Hour Lock Window",
    desc: "Accept a task and it locks exclusively to you for 6 hours. Complete it in time or it returns to the pool.",
  },
  {
    icon: <FileCheck size={20} />,
    title: "Site Visit & Upload",
    desc: "Arrive on-site with GPS & internet on. Capture live location, complete the checklist, upload required documents.",
  },
  {
    icon: <Banknote size={20} />,
    title: "Get Paid ₹500",
    desc: "Every successfully completed project (marked Red) earns you ₹500 — straight to your account.",
  },
];

const TASK_STATUSES = [
  { colour: "#F59E0B", label: "Yellow — Locked",    desc: "You accepted the task. 6-hour exclusive window active." },
  { colour: "#10B981", label: "Green — Available",  desc: "Window expired or task returned. Anyone can accept." },
  { colour: "#EF4444", label: "Red — Completed",    desc: "All steps done, documents uploaded. ₹500 earned." },
];

/* ── Hero Scroll Parallax ─────────────────────────────────────────────────── */
function HeroParallax({ children }: { children: ReactNode }) {
  const { scrollY } = useScroll();
  const y = useTransform(scrollY, [0, 400], [0, 60]);
  return <motion.div style={{ y }}>{children}</motion.div>;
}

/* ── Page ─────────────────────────────────────────────────────────────────── */
export default function AboutPage() {
  const [showQRCode, setShowQRCode] = useState(false);

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
          background:
            "radial-gradient(ellipse at 50% 0%, rgba(59,130,246,0.06) 0%, transparent 65%), linear-gradient(to bottom, rgba(5,6,8,0.55) 0%, transparent 30%, rgba(5,6,8,0.35) 100%)",
        }}
        aria-hidden
      />

      <main className="relative min-h-screen text-white">
        <SiteNav />

        {/* ── 1 · HERO ── */}
        <Section className="pt-32 md:pt-40">
          <HeroParallax>
            <Reveal>
              <div className="flex items-center justify-between gap-4">
                <Eyebrow>About Truvi Ventures</Eyebrow>
                <motion.span
                  animate={{ boxShadow: ["0 0 20px rgba(59,130,246,0.4)", "0 0 40px rgba(59,130,246,0.7)", "0 0 20px rgba(59,130,246,0.4)"] }}
                  transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
                  className="grid size-12 shrink-0 place-items-center rounded-full"
                  style={{ background: BLUE }}
                >
                  <img src="/brand/icon.png" alt="Truvi" className="size-7 object-contain" />
                </motion.span>
              </div>
            </Reveal>

            <Reveal delay={0.1}>
              <h1 className="mt-6 max-w-3xl text-4xl font-bold leading-[1.1] md:text-6xl" style={serif}>
                We're building the{" "}
                <span style={{ color: BLUE }}>trust layer</span>{" "}
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
                    style={{ border: `1px solid ${BLUE_BORDER}`, background: GLASS }}
                  >
                    {chip}
                  </motion.span>
                ))}
              </div>
            </Reveal>

            {/* Stat strip */}
            <Reveal delay={0.4}>
              <div
                className="mt-16 grid grid-cols-2 gap-x-8 gap-y-6 border-t pt-8 md:grid-cols-4"
                style={{ borderColor: BLUE_BORDER }}
              >
                {HERO_STATS.map((s, i) => (
                  <motion.div
                    key={s.label}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.5 + i * 0.1, duration: 0.6 }}
                  >
                    <p className="text-2xl font-bold md:text-3xl" style={{ ...serif, color: BLUE }}>{s.value}</p>
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
                    "0 0 40px rgba(59,130,246,0.35)",
                    "0 0 70px rgba(59,130,246,0.6)",
                    "0 0 40px rgba(59,130,246,0.35)",
                  ],
                }}
                transition={{ repeat: Infinity, duration: 3.5, ease: "easeInOut" }}
                className="grid size-36 shrink-0 place-items-center rounded-full text-center"
                style={{ background: BLUE }}
              >
                <div>
                  <p className="text-base font-bold text-white" style={serif}>TRUVI</p>
                  <p className="text-[9px] font-semibold uppercase tracking-[0.25em] text-white/80">Intelligence</p>
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
                    whileHover={{ scale: 1.04 }}
                    className="flex min-h-[76px] items-center justify-center rounded-full px-4 py-3 text-center text-xs font-medium text-white/90 backdrop-blur-sm"
                    style={{ background: NAVY, border: `1px solid ${BLUE_BORDER}` }}
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
                  <span
                    className="grid size-9 place-items-center rounded-full"
                    style={{ border: `1px solid ${BLUE}` }}
                  >
                    <span className="size-2.5 rounded-full" style={{ background: BLUE }} />
                  </span>
                  <h3 className="mt-4 text-lg font-bold" style={{ ...serif, color: BLUE }}>{w.title}</h3>
                  <p className="mt-1.5 text-sm text-white/70">{w.desc}</p>
                </GlassCard>
              </Reveal>
            ))}
            <Reveal delay={0.4}>
              <div
                className="rounded-2xl p-6 backdrop-blur-md"
                style={{ background: NAVY, borderLeft: `3px solid ${BLUE}` }}
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
                <p className="text-[10px] font-semibold tracking-[0.25em]" style={{ color: BLUE }}>{s.n}</p>
                <motion.div
                  whileHover={{ scale: 1.12, boxShadow: `0 0 24px rgba(59,130,246,0.5)` }}
                  className="mx-auto mt-2 grid size-14 place-items-center rounded-full backdrop-blur-sm"
                  style={{ background: NAVY, border: `1px solid ${BLUE}` }}
                >
                  <span className="text-sm font-bold" style={{ ...serif, color: BLUE }}>{s.n}</span>
                </motion.div>
                <h3 className="mt-3 text-sm font-bold" style={serif}>{s.title}</h3>
                <p className="mt-1 text-[11px] leading-snug text-white/55">{s.desc}</p>
              </motion.div>
            ))}
          </div>

          <Reveal delay={0.3}>
            <p className="mt-14 text-[11px] font-semibold uppercase tracking-[0.35em]" style={{ color: BLUE }}>
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
                  style={{ background: NAVY, border: `1px solid ${BLUE_BORDER}` }}
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
                  <p className="text-4xl font-bold md:text-5xl" style={{ ...serif, color: BLUE }}>{o.value}</p>
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
                  style={{ border: `1px solid ${BLUE_BORDER}`, background: GLASS }}
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
                  "0 0 30px rgba(59,130,246,0.4)",
                  "0 0 60px rgba(59,130,246,0.7)",
                  "0 0 30px rgba(59,130,246,0.4)",
                ],
              }}
              transition={{ repeat: Infinity, duration: 3.5 }}
              className="mx-auto grid size-16 place-items-center rounded-full"
              style={{ background: BLUE }}
            >
              <img src="/brand/icon.png" alt="Truvi" className="size-9 object-contain" />
            </motion.span>
            <p className="mt-5 text-xl font-bold tracking-[0.5em]" style={serif}>TRUVI</p>
            <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.3em]" style={{ color: BLUE }}>
              Building India's Real Estate Intelligence Infrastructure
            </p>
            <p className="mx-auto mt-5 max-w-md text-base italic text-white/70" style={serif}>
              "The future of real estate belongs to verified intelligence, trusted data and smarter decisions."
            </p>
          </Reveal>

          <Reveal delay={0.2}>
            <div className="mx-auto mt-10 grid max-w-2xl gap-3 sm:grid-cols-3">
              {[
                { icon: <Globe size={14} />, label: "Website", value: "www.truviventures.com",   href: "https://www.truviventures.com" },
                { icon: <Mail  size={14} />, label: "Email",   value: "truviventures@gmail.com", href: "mailto:truviventures@gmail.com" },
                { icon: <Phone size={14} />, label: "Phone",   value: "+91 91963 66358",          href: "tel:+919196366358" },
              ].map((c) => (
                <motion.a
                  key={c.label}
                  href={c.href}
                  target={c.href.startsWith("http") ? "_blank" : undefined}
                  rel="noopener noreferrer"
                  whileHover={{ y: -3, boxShadow: `0 8px 30px rgba(59,130,246,0.15)` }}
                  className="block rounded-xl px-4 py-4 text-left backdrop-blur-md"
                  style={{ background: NAVY, border: `1px solid ${BLUE_BORDER}` }}
                >
                  <p
                    className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.2em]"
                    style={{ color: BLUE }}
                  >
                    {c.icon} {c.label}
                  </p>
                  <p className="mt-1.5 truncate text-sm text-white/90">{c.value}</p>
                </motion.a>
              ))}
            </div>
          </Reveal>
        </Section>

        {/* ── 7 · TRUVI AMBASSADOR ── */}
        <Section className="relative">
          {/* Section header */}
          <Reveal>
            <div className="flex items-center gap-3">
              <Eyebrow>Truvi Ambassador Program</Eyebrow>
            </div>
          </Reveal>
          <Reveal delay={0.08}>
            <h2 className="mt-4 max-w-2xl text-3xl font-bold leading-tight md:text-4xl" style={serif}>
              Earn{" "}
              <span style={{ color: BLUE }}>₹500 per project</span>{" "}
              as a Truvi Ground Ambassador.
            </h2>
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-white/60">
              Visit properties, verify on-ground details, upload documents — and get paid for every
              completed task. No office. No fixed hours. Just real work, real pay.
            </p>
          </Reveal>

          {/* How it works — step cards */}
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {AMBASSADOR_STEPS.map((step, i) => (
              <Reveal key={step.title} delay={0.1 + i * 0.08}>
                <motion.div
                  whileHover={{ y: -4, boxShadow: `0 12px 40px rgba(59,130,246,0.18)` }}
                  className="flex h-full flex-col gap-4 rounded-2xl p-6 backdrop-blur-md"
                  style={{ background: NAVY, border: `1px solid ${BLUE_BORDER}` }}
                >
                  <span
                    className="grid size-10 shrink-0 place-items-center rounded-xl"
                    style={{ background: BLUE_DIM, color: BLUE }}
                  >
                    {step.icon}
                  </span>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40">Step {i + 1}</p>
                    <h3 className="mt-1 text-sm font-bold text-white">{step.title}</h3>
                    <p className="mt-2 text-xs leading-relaxed text-white/60">{step.desc}</p>
                  </div>
                </motion.div>
              </Reveal>
            ))}
          </div>

          {/* Task status colour legend */}
          <Reveal delay={0.3}>
            <div className="mt-10 rounded-2xl p-6 backdrop-blur-md" style={{ background: NAVY, border: `1px solid ${BLUE_BORDER}` }}>
              <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.3em]" style={{ color: BLUE }}>
                Task Status System
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                {TASK_STATUSES.map((t) => (
                  <div key={t.label} className="flex items-start gap-3">
                    <span
                      className="mt-0.5 size-3 shrink-0 rounded-full"
                      style={{ background: t.colour, boxShadow: `0 0 8px ${t.colour}88` }}
                    />
                    <div>
                      <p className="text-xs font-semibold text-white/90">{t.label}</p>
                      <p className="mt-0.5 text-[11px] text-white/50">{t.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>

          {/* Earnings highlight */}
          <Reveal delay={0.35}>
            <div className="mt-6 flex items-center gap-4 rounded-2xl p-5 backdrop-blur-md"
              style={{ background: BLUE_DIM, border: `1px solid ${BLUE_BORDER}` }}>
              <Star size={22} className="shrink-0" style={{ color: BLUE }} />
              <p className="text-sm text-white/85">
                <span className="font-semibold text-white">₹500 per completed project.</span>{" "}
                Complete all steps, upload documents, and the task turns Red — your payment is triggered automatically.
              </p>
            </div>
          </Reveal>

          {/* CTA button */}
          <Reveal delay={0.45}>
            <div className="mt-10 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
              <Link
                to="/ambassador/signup"
                className="group inline-flex items-center gap-2 rounded-full px-8 py-3.5 text-sm font-semibold text-white transition-all"
                style={{
                  background: BLUE,
                  boxShadow: "0 4px 24px rgba(59,130,246,0.35)",
                }}
              >
                Join as a Truvi Ambassador
                <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" />
              </Link>
              <button
                onClick={() => setShowQRCode(true)}
                className="group inline-flex items-center gap-2 rounded-full px-6 py-3.5 text-sm font-semibold text-white transition-all hover:shadow-[0_4px_20px_rgba(59,130,246,0.3)]"
                style={{
                  background: "rgba(59,130,246,0.15)",
                  border: `1px solid ${BLUE}`,
                }}
              >
                <QrCode size={15} />
                Share QR
              </button>
              <p className="text-xs text-white/40">Free to join · Aadhaar verification required</p>
            </div>
          </Reveal>

          {/* QR Code Modal */}
          {showQRCode && (
            <AmbassadorQRCode onClose={() => setShowQRCode(false)} />
          )}
        </Section>

        {/* ── CHANNEL PARTNER CTA ── */}
        <Section className="relative pb-28 pt-4">
          <Reveal>
            <motion.div
              whileHover={{ boxShadow: `0 16px 60px rgba(59,130,246,0.18)` }}
              className="flex flex-col items-center gap-5 rounded-3xl px-8 py-10 text-center backdrop-blur-md md:flex-row md:justify-between md:text-left"
              style={{ background: NAVY, border: `1px solid ${BLUE_BORDER}` }}
            >
              <div className="flex items-center gap-4">
                <motion.span
                  animate={{ rotate: [0, 8, -8, 0] }}
                  transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
                  className="grid size-12 shrink-0 place-items-center rounded-2xl"
                  style={{ background: BLUE_DIM, border: `1px solid ${BLUE}` }}
                >
                  <Handshake size={22} style={{ color: BLUE }} />
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
                className="group inline-flex shrink-0 items-center gap-2 rounded-full px-7 py-3 text-sm font-semibold text-white transition-all hover:shadow-[0_0_35px_rgba(59,130,246,0.5)]"
                style={{ background: BLUE }}
              >
                Visit the Channel Partner page
                <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" />
              </Link>
            </motion.div>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="mt-4 text-center text-xs text-white/40">
              Already a partner?{" "}
              <Link to="/login" className="underline-offset-4 hover:underline" style={{ color: BLUE }}>
                Sign in to your Channel Partner workspace
              </Link>
            </p>
          </Reveal>
        </Section>

      </main>
    </>
  );
}
