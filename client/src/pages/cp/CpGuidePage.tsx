import { Link } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Headphones } from "lucide-react";

/**
 * Channel Partner Program guide — the "why partner with Truvi" pitch rendered as
 * a page (no PDF). Reached from the CP dashboard corner link.
 */

const PROBLEMS = [
  "Fake leads", "No proper CRM", "Inventory confusion", "Delayed commission",
  "No marketing support", "Project information missing", "Manual follow-up", "No branding",
];
const WHY_JOIN = [
  "Verified projects", "Dedicated relationship manager", "Faster booking", "Easy inventory access",
  "Live price updates", "Instant support", "Marketing material", "Faster commission process",
];
const VERIFICATION = ["Developer verification", "Legal verification", "RERA", "Location analysis", "Amenities", "Price comparison", "Future growth"];
const MARKETING = ["Facebook Ads", "Instagram Ads", "Google Ads", "Landing pages", "Video content", "Creative designs", "WhatsApp campaigns", "Email marketing"];
const CRM = ["Lead management", "Customer follow-up", "Reminders & call logs", "Site-visit booking", "Commission dashboard"];
const SALES = ["Project experts", "Closing assistance", "Negotiation support", "Sales training", "Presentation support", "Customer handling"];
const DASHBOARD = ["Live inventory", "Booking status", "Lead status", "Commission status", "Performance analytics", "Mobile friendly"];
const COMMISSION_STAGES = ["Lead Submitted", "Site Visit", "Booking", "Documentation", "Commission Released"];
const JOURNEY = ["Register", "Verification", "Training", "Access Dashboard", "Receive Leads", "Site Visits", "Booking", "Commission"];
const TRADITIONAL = ["Manual work", "No support", "Delayed commission", "No technology", "Limited projects"];
const WITH_TRUVI = ["Technology", "Support", "Marketing", "Verified projects", "Faster growth"];

export default function CpGuidePage() {
  return (
    <main className="min-h-screen p-6 text-white md:p-10">
      <div className="mx-auto max-w-5xl">
        <Link to="/cp/dashboard" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-white">
          <ArrowLeft size={15} /> Back to dashboard
        </Link>

        {/* Hero */}
        <section className="mt-6 rounded-3xl border border-white/10 glass p-7 md:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--trust)]">Channel Partner Program</p>
          <h1 className="mt-3 font-display text-3xl font-medium leading-[1.1] sm:text-4xl md:text-5xl">
            Grow faster. Earn more.{" "}
            <span className="text-gradient-trust">Build trust.</span>
          </h1>
          <p className="mt-4 max-w-2xl text-muted-foreground md:text-lg">
            Truvi is a real estate growth partner that helps channel partners grow through technology,
            verified data and marketing. We don't just hand you leads — we give you a complete growth ecosystem.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            {["Transparent", "Trusted", "Technology Driven"].map((b) => (
              <span key={b} className="inline-flex items-center gap-1.5 rounded-full border border-[var(--trust)]/30 bg-[var(--trust)]/10 px-3 py-1.5 text-xs font-medium">
                <CheckCircle2 size={13} className="text-emerald-400" /> {b}
              </span>
            ))}
          </div>
        </section>

        {/* One platform */}
        <Section title="One platform. Everything together.">
          <ChipRow items={["Marketing", "Verified Leads", "CRM", "Sales Support", "Inventory", "Commission Tracking", "After Sales"]} />
        </Section>

        {/* Problems */}
        <Section title="Current problems in real estate" subtitle="What channel partners deal with today — solved on Truvi.">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {PROBLEMS.map((p) => (
              <div key={p} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-foreground/90">
                <span className="text-rose-400">✕</span> {p}
              </div>
            ))}
          </div>
        </Section>

        {/* Why join */}
        <Section title="Why channel partners join Truvi">
          <CardGrid items={WHY_JOIN} />
        </Section>

        {/* Verification */}
        <Section title="Every project goes through verification">
          <ChipRow items={VERIFICATION} />
        </Section>

        {/* Marketing + CRM + Sales + Dashboard */}
        <Section title="Full growth stack" subtitle="Marketing, CRM, a dedicated sales team and a real-time dashboard — all included.">
          <div className="grid gap-5 md:grid-cols-2">
            <Panel title="Marketing support" items={MARKETING} />
            <Panel title="CRM — no Excel, everything digital" items={CRM} />
            <Panel title="Dedicated sales team" items={SALES} />
            <Panel title="Real-time dashboard" items={DASHBOARD} />
          </div>
        </Section>

        {/* Transparent commission */}
        <Section title="Transparent commission system" subtitle="Track every stage.">
          <div className="flex flex-wrap items-center gap-2">
            {COMMISSION_STAGES.map((s, i) => (
              <span key={s} className="flex items-center gap-2">
                <span className="rounded-full border border-[var(--trust)]/30 bg-[var(--trust)]/10 px-4 py-2 text-sm font-medium">
                  <span className="mr-1.5 font-mono text-xs text-[var(--trust)]">{i + 1}</span>{s}
                </span>
                {i < COMMISSION_STAGES.length - 1 && <span className="text-[var(--trust)]" aria-hidden>→</span>}
              </span>
            ))}
          </div>
        </Section>

        {/* Why Truvi vs traditional */}
        <Section title="Why Truvi?">
          <div className="grid gap-5 md:grid-cols-2">
            <div className="h-full rounded-2xl border border-white/10 glass p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Traditional Broker</p>
              <div className="mt-4 space-y-2.5">
                {TRADITIONAL.map((t) => <div key={t} className="flex items-center gap-3 text-sm text-muted-foreground"><span className="text-rose-400/70">✕</span> {t}</div>)}
              </div>
            </div>
            <div className="relative h-full rounded-2xl border border-[var(--trust)]/30 glass p-6">
              <div className="absolute inset-x-0 top-0 h-1 rounded-t-2xl" style={{ background: "var(--gradient-trust)" }} />
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--trust)]">With Truvi</p>
              <div className="mt-4 space-y-2.5">
                {WITH_TRUVI.map((t) => <div key={t} className="flex items-center gap-3 text-sm text-foreground/95"><CheckCircle2 size={15} className="text-emerald-400" /> {t}</div>)}
              </div>
            </div>
          </div>
        </Section>

        {/* Journey */}
        <Section title="Partner journey">
          <div className="flex flex-wrap items-center gap-2">
            {JOURNEY.map((j, i) => (
              <span key={j} className="flex items-center gap-2">
                <span className="rounded-full border border-white/12 bg-white/[0.04] px-3.5 py-1.5 text-sm font-medium">
                  <span className="mr-1.5 font-mono text-xs text-[var(--trust)]">{i + 1}</span>{j}
                </span>
                {i < JOURNEY.length - 1 && <span className="text-[var(--trust)]" aria-hidden>→</span>}
              </span>
            ))}
          </div>
        </Section>

        {/* Earnings example */}
        <Section title="Earnings example">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { n: "5", l: "Bookings / month" },
              { n: "₹60,000", l: "Average commission" },
              { n: "₹3,00,000", l: "Monthly earnings" },
              { n: "₹36 Lakhs+", l: "Yearly earnings" },
            ].map((s) => (
              <div key={s.l} className="rounded-2xl border border-white/10 glass p-6 text-center">
                <p className="font-display text-2xl font-semibold text-gradient-trust">{s.n}</p>
                <p className="mt-2 text-sm text-muted-foreground">{s.l}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs italic text-muted-foreground">
            Illustrative example. Actual earnings depend on the project, commission structure and sales performance.
          </p>
        </Section>

        {/* CTA */}
        <section className="mt-10 rounded-3xl border border-white/10 glass p-7 text-center md:p-10">
          <h2 className="font-display text-2xl font-medium sm:text-3xl">Grow together. Earn together. Build trust together.</h2>
          <div className="mt-6 flex justify-center">
            <Link to="/cp/marketplace" className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[var(--trust)] via-[#3b82f6] to-[#2563eb] px-6 py-3 text-sm font-semibold text-white">
              Explore projects
            </Link>
          </div>
          <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <Headphones size={13} /> Prefer to listen? A short voice guide is on your dashboard.
          </p>
        </section>
      </div>
    </main>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="font-display text-2xl font-medium sm:text-3xl">{title}</h2>
      {subtitle && <p className="mt-2 max-w-3xl text-sm text-muted-foreground md:text-base">{subtitle}</p>}
      <div className="mt-6">{children}</div>
    </section>
  );
}

function ChipRow({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap gap-3">
      {items.map((s) => (
        <span key={s} className="rounded-full border border-white/12 bg-white/[0.04] px-4 py-2 text-sm font-medium text-foreground/90">{s}</span>
      ))}
    </div>
  );
}

function CardGrid({ items }: { items: string[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((s) => (
        <div key={s} className="flex items-start gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-foreground/90">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-400" /> {s}
        </div>
      ))}
    </div>
  );
}

function Panel({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="h-full rounded-2xl border border-white/10 glass p-6">
      <h3 className="font-display text-lg font-medium text-[var(--trust)]">{title}</h3>
      <div className="mt-3 flex flex-wrap gap-2">
        {items.map((s) => (
          <span key={s} className="rounded-full bg-white/5 px-3 py-1 text-xs text-foreground/85">{s}</span>
        ))}
      </div>
    </div>
  );
}
