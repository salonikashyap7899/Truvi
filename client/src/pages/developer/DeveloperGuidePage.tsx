import { Link } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Building2, Sparkles, Users, Headphones, Globe, Mail, Phone } from "lucide-react";

/**
 * Developer / Builder partnership guide — the "why list on Truvi" pitch rendered
 * as a page (no PDF). Reached from the developer dashboard corner link.
 */

const PROBLEMS = [
  "Kam leads, marketing cost zyada",
  "Fake & duplicate listings se buyer trust kam",
  "Har jagah alag platform, koi verification nahi",
  "In-house sales team par poori dependency",
  "Unverified project par buyer confidence nahi karta",
  "Genuine inventory bhi bheed mein kho jaata hai",
];

const SOLUTIONS = [
  { t: "Verified Listing", d: "Har project aur inventory verify hoke hi platform par jaata hai — buyers ka bharosa milta hai." },
  { t: "AI Powered Matching", d: "“Ask Truvi” AI sahi buyer ko sahi project se connect karta hai — sirf random leads nahi." },
  { t: "Trust Score", d: "Har builder aur project ko trust score milta hai jo credibility clearly dikhata hai." },
  { t: "Pan India CP Network", d: "Across-India channel partners aapke liye active leads generate karte hain." },
];

const MODEL1 = [
  "Project / inventory 100% verified hona chahiye",
  "Listing par koi cost nahi",
  "Truvi + Pan India CP network leads layega",
  "Truvi sales team aapke liye sales bhi karegi",
];
const MODEL2 = [
  "“Ask Truvi” aapka sales data analyze karega",
  "Data ke aadhar par targeted marketing milegi",
  "Leads seedha aapke paas jaayenge",
  "In leads par koi commission nahi",
];

const WHY = [
  "Verified data & Trust Score se buyer confidence",
  "AI powered search aur recommendation engine",
  "Pan India growing channel-partner network",
  "Government & enterprise ready platform",
  "Scalable, future-ready technology",
  "Zero-cost listing option available",
];

export default function DeveloperGuidePage() {
  return (
    <main className="min-h-screen p-6 text-white md:p-10">
      <div className="mx-auto max-w-5xl">
        <Link to="/developer/dashboard" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-white">
          <ArrowLeft size={15} /> Back to dashboard
        </Link>

        {/* Hero */}
        <section className="mt-6 rounded-3xl border border-white/10 glass p-7 md:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--trust)]">Developer &amp; Builder Partnership Program</p>
          <h1 className="mt-3 font-display text-3xl font-medium leading-[1.1] sm:text-4xl md:text-5xl">
            Apna project ya inventory list kariye —{" "}
            <span className="text-gradient-trust">zero cost, zyada leads.</span>
          </h1>
          <p className="mt-4 max-w-2xl text-muted-foreground md:text-lg">
            Achha inventory ready hai, lekin sahi buyers tak nahi pohonch raha? Truvi verified data, AI
            intelligence, trust score aur Pan-India CP network se aapke project ko sahi buyers tak le jaata hai.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            {["Zero Cost Listing", "Pan India CP Leads", "Truvi Sales Support"].map((b) => (
              <span key={b} className="inline-flex items-center gap-1.5 rounded-full border border-[var(--trust)]/30 bg-[var(--trust)]/10 px-3 py-1.5 text-xs font-medium">
                <CheckCircle2 size={13} className="text-emerald-400" /> {b}
              </span>
            ))}
          </div>
          <div className="mt-7">
            <Link to="/developer/projects/new" className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[var(--trust)] via-[#3b82f6] to-[#2563eb] px-6 py-3 text-sm font-semibold text-white shadow-[0_12px_32px_-8px_rgba(59,130,246,0.7)] transition hover:shadow-[0_16px_40px_-6px_rgba(59,130,246,0.9)]">
              <Building2 size={16} /> List a project
            </Link>
          </div>
        </section>

        {/* Problem */}
        <Section title="Developers aur builders ki sabse badi problem" subtitle="Achha inventory ready hai, lekin sahi buyers tak nahi pohonch raha.">
          <div className="grid gap-3 sm:grid-cols-2">
            {PROBLEMS.map((p) => (
              <div key={p} className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-foreground/90">
                <span className="mt-0.5 text-rose-400">✕</span> {p}
              </div>
            ))}
          </div>
        </Section>

        {/* Solution */}
        <Section title="Truvi kaise solve karta hai" subtitle="Verified data + AI intelligence + Trust Score + Pan India CP network.">
          <div className="grid gap-4 sm:grid-cols-2">
            {SOLUTIONS.map((s, i) => (
              <div key={s.t} className="rounded-2xl border border-white/10 glass p-6">
                <span className="font-mono text-xs text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
                <h3 className="mt-1 font-display text-lg font-medium text-[var(--trust)]">{s.t}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{s.d}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* Two models */}
        <Section title="2 partnership models — aapki choice" subtitle="Jaisi zaroorat, waisa model chuniye — dono mein aapka faayda hi faayda hai.">
          <div className="grid gap-5 md:grid-cols-2">
            <div className="relative rounded-2xl border border-[var(--trust)]/30 glass p-6">
              <div className="absolute inset-x-0 top-0 h-1 rounded-t-2xl" style={{ background: "var(--gradient-trust)" }} />
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--trust)]">Model 1 · Zero Cost</p>
              <h3 className="mt-1 flex items-center gap-2 font-display text-xl font-medium"><Sparkles size={18} className="text-[var(--trust)]" /> Full Verified Listing</h3>
              <ul className="mt-4 space-y-2 text-sm text-foreground/90">
                {MODEL1.map((m) => <li key={m} className="flex items-start gap-2"><CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-400" /> {m}</li>)}
              </ul>
            </div>
            <div className="rounded-2xl border border-white/10 glass p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-foreground/70">Model 2 · AI Powered</p>
              <h3 className="mt-1 flex items-center gap-2 font-display text-xl font-medium"><Users size={18} className="text-[var(--trust)]" /> Marketing Only — Ask Truvi</h3>
              <ul className="mt-4 space-y-2 text-sm text-foreground/90">
                {MODEL2.map((m) => <li key={m} className="flex items-start gap-2"><CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-400" /> {m}</li>)}
              </ul>
            </div>
          </div>
        </Section>

        {/* Why partner */}
        <Section title="Truvi ke saath partner kyun kare" subtitle="Trust, technology aur reach — teeno ek platform par.">
          <div className="grid gap-3 sm:grid-cols-2">
            {WHY.map((w) => (
              <div key={w} className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-foreground/90">
                <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-400" /> {w}
              </div>
            ))}
          </div>
        </Section>

        {/* CTA */}
        <section className="mt-8 rounded-3xl border border-white/10 glass p-7 text-center md:p-10">
          <h2 className="font-display text-2xl font-medium sm:text-3xl">Aaj hi list kariye</h2>
          <p className="mt-2 text-muted-foreground">More leads. More clients. Zero-cost listing ke saath.</p>
          <div className="mt-6 flex justify-center">
            <Link to="/developer/projects/new" className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[var(--trust)] via-[#3b82f6] to-[#2563eb] px-6 py-3 text-sm font-semibold text-white">
              <Building2 size={16} /> List a project
            </Link>
          </div>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><Globe size={14} /> www.truviventures.com</span>
            <span className="inline-flex items-center gap-1.5"><Mail size={14} /> truviventures@gmail.com</span>
            <span className="inline-flex items-center gap-1.5"><Phone size={14} /> +91 91963 66358</span>
          </div>
          <p className="mt-5 text-xs italic text-muted-foreground">"Building trust before every property decision."</p>
        </section>

        <p className="mt-8 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <Headphones size={13} /> Prefer to listen? A short voice guide is on your dashboard.
        </p>
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
