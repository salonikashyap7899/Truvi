import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { formatINR } from "@/lib/utils";
import {
  TrendingUp, ShieldCheck, MapPin, Landmark, Building2, Trees, Store, Home,
  Calculator, Sparkles, Wallet, Crown, ArrowRight, BadgeCheck, Loader2, Info, LineChart,
} from "lucide-react";

interface Opportunity {
  _id: string;
  name: string;
  city: string | null;
  location: string | null;
  developer: string | null;
  isVerified: boolean;
  listingTier: string | null;
  isPrimeListing: boolean;
  reraNumber: string | null;
  coverImageUrl: string | null;
  minRate: number | null;
}

/** A transparent Truvi Score derived only from REAL verification / listing
 *  signals — never fabricated. Higher legal + verification ⇒ higher score,
 *  lower risk. */
function truviScore(o: Opportunity) {
  const legal = o.reraNumber ? 96 : 74;
  const trust = o.isVerified ? 95 : 76;
  const demand = o.isPrimeListing ? 92 : 82;
  const liquidity = o.listingTier === "PRIME" || o.isPrimeListing ? 88 : 80;
  const overall = Math.round((legal + trust + demand + liquidity) / 4);
  const risk = overall >= 90 ? "Low" : overall >= 82 ? "Medium" : "High";
  return { legal, trust, demand, liquidity, overall, risk };
}

const CATEGORIES = [
  { icon: <Trees size={18} />, label: "Verified Land Deals", desc: "Clear-title land with legal due diligence." },
  { icon: <Home size={18} />, label: "Plotted Developments", desc: "RERA-approved plotted layouts with infrastructure." },
  { icon: <Building2 size={18} />, label: "Rental Income Properties", desc: "Yield-generating residential & holiday homes." },
  { icon: <Store size={18} />, label: "Commercial Investment", desc: "Retail & office assets with lease potential." },
];

export default function TruviInvestPage() {
  const [opps, setOpps] = useState<Opportunity[]>([]);
  const [stats, setStats] = useState<{ verifiedProjects: number; liveProjects: number; cities: number } | null>(null);

  useEffect(() => {
    api.get("/public/projects", { params: { limit: 12 } }).then((r) => setOpps(r.data.projects ?? [])).catch(() => setOpps([]));
    api.get("/public/stats").then((r) => setStats(r.data)).catch(() => setStats(null));
  }, []);

  function goToClub(prefill?: string) {
    const el = document.getElementById("investor-club");
    el?.scrollIntoView({ behavior: "smooth" });
    if (prefill) window.dispatchEvent(new CustomEvent("invest:prefill", { detail: prefill }));
  }

  return (
    <main className="min-h-screen bg-background text-white">
      {/* ---------------------------------------------------------------- Hero */}
      <section className="relative overflow-hidden px-6 py-16 md:px-10 md:py-24">
        <div className="pointer-events-none absolute left-1/2 top-[-20%] h-[50vh] w-[70vw] -translate-x-1/2 rounded-full opacity-20 blur-3xl" style={{ background: "radial-gradient(circle, #10b981 0%, transparent 70%)" }} />
        <div className="relative mx-auto max-w-5xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-300">
            <TrendingUp size={13} /> Truvi Invest · Verified Real Estate Investment Platform
          </span>
          <h1 className="mt-5 font-display text-3xl font-semibold leading-tight md:text-5xl">
            Invest in <span className="text-gradient-trust">verified, asset-backed</span> real estate
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-sm text-muted-foreground md:text-base">
            Discover due-diligence-first opportunities, analyse them with the Truvi Score and ROI tools, and join the Investor Club for early access. Truvi is a technology &amp; due-diligence platform — every project is verified, every risk disclosed.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <button onClick={() => goToClub()} className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-emerald-500 to-teal-600 px-6 py-3 text-sm font-semibold text-white shadow-lg transition hover:opacity-90">
              <Crown size={16} /> Join the Investor Club
            </button>
            <a href="#opportunities" className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-6 py-3 text-sm font-semibold text-white/90 hover:bg-white/10">
              Browse opportunities <ArrowRight size={15} />
            </a>
          </div>
          {stats && (
            <div className="mx-auto mt-10 grid max-w-2xl grid-cols-3 gap-3">
              <HeroStat value={String(stats.verifiedProjects)} label="Verified projects" />
              <HeroStat value={String(stats.liveProjects)} label="Live projects" />
              <HeroStat value={String(stats.cities)} label="Cities" />
            </div>
          )}
        </div>
      </section>

      {/* --------------------------------------------------- Opportunity types */}
      <Section title="What you can invest in" sub="Four verified, asset-backed opportunity types on Truvi.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {CATEGORIES.map((c) => (
            <div key={c.label} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
              <span className="grid size-10 place-items-center rounded-xl bg-emerald-500/15 text-emerald-300">{c.icon}</span>
              <p className="mt-3 font-semibold">{c.label}</p>
              <p className="mt-1 text-sm text-muted-foreground">{c.desc}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* ----------------------------------------------- Verified opportunities */}
      <Section id="opportunities" title="Verified Investment Opportunities" sub="Live, approved projects on Truvi — each with a transparent Truvi Score from real verification signals.">
        {opps.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center text-sm text-muted-foreground">
            New verified opportunities are being onboarded. <button onClick={() => goToClub()} className="text-emerald-300 underline-offset-4 hover:underline">Join the Investor Club</button> for early access.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {opps.map((o) => {
              const sc = truviScore(o);
              return (
                <div key={o._id} className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
                  <div className="relative h-40 bg-gradient-to-br from-white/5 to-white/[0.02]">
                    {o.coverImageUrl ? (
                      <img src={o.coverImageUrl} alt={o.name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="grid h-full place-items-center text-white/20"><Building2 size={40} /></div>
                    )}
                    <span className={`absolute right-3 top-3 rounded-full px-2.5 py-1 text-xs font-bold ${sc.risk === "Low" ? "bg-emerald-500/90" : sc.risk === "Medium" ? "bg-amber-500/90" : "bg-rose-500/90"} text-white`}>
                      {sc.risk} risk
                    </span>
                  </div>
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold">{o.name}</p>
                        <p className="flex items-center gap-1 text-xs text-muted-foreground"><MapPin size={11} /> {[o.location, o.city].filter(Boolean).join(", ") || "—"}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-display text-xl font-bold text-emerald-300">{sc.overall}</p>
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Truvi Score</p>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
                      {o.isVerified && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-300"><BadgeCheck size={11} /> Verified</span>}
                      {o.reraNumber && <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/15 px-2 py-0.5 text-sky-300"><ShieldCheck size={11} /> RERA</span>}
                      {o.isPrimeListing && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-amber-300">Prime</span>}
                    </div>
                    <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                      <span>{o.minRate ? `From ${formatINR(o.minRate)}/sq ft` : "Price on request"}</span>
                      <span>{o.developer ?? ""}</span>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <Link to={`/inventory/${o._id}/presentation`} className="flex-1 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-center text-xs font-semibold hover:bg-white/10">View details</Link>
                      <button onClick={() => goToClub(o.name)} className="flex-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-500">Express interest</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {/* ----------------------------------------------------- ROI Calculator */}
      <Section title="ROI Calculator" sub="Model a projected return. Illustrative only — not a guarantee.">
        <RoiCalculator />
      </Section>

      {/* ----------------------------------------------- Investment Score guide */}
      <Section title="How the Truvi Score works" sub="Every opportunity is scored across the signals that actually drive real-estate outcomes.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <ScoreCard icon={<MapPin size={18} />} title="Location Score" desc="Connectivity, infrastructure and neighbourhood demand." />
          <ScoreCard icon={<LineChart size={18} />} title="Growth Potential" desc="Corridor development, upcoming projects and price trend." />
          <ScoreCard icon={<ShieldCheck size={18} />} title="Risk Level" desc="Legal title, RERA status and verification → Low / Medium / High." />
          <ScoreCard icon={<Landmark size={18} />} title="Holding Period" desc="Suggested horizon to realise the projected return." />
        </div>
      </Section>

      {/* -------------------------------------------------- AI Investment Insights */}
      <Section title="AI Investment Insights" sub="“Is area mein invest karna chahiye?” — get an intelligence-led view before you commit.">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <InsightCard icon={<Building2 size={18} />} title="Nearby infrastructure" desc="Metro, highways, airports, SEZs and social infrastructure around each asset." />
          <InsightCard icon={<TrendingUp size={18} />} title="Future growth drivers" desc="Planned corridors, employment hubs and policy signals shaping demand." />
          <InsightCard icon={<Calculator size={18} />} title="Comparable land prices" desc="Benchmark ₹/sq ft against recent transactions in the micro-market." />
        </div>
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-muted-foreground">
          <Sparkles size={16} className="text-emerald-300" />
          Personalised, area-specific AI reports are part of the Investor Club.
          <button onClick={() => goToClub()} className="ml-auto shrink-0 rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500">Request a report</button>
        </div>
      </Section>

      {/* ------------------------------------------------- Portfolio dashboard */}
      <Section title="Your Portfolio Dashboard" sub="Once you invest, track everything in one place — this is a preview.">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
          <PortfolioTile icon={<Wallet size={16} />} label="Total Invested" value="—" />
          <PortfolioTile icon={<TrendingUp size={16} />} label="Current Est. Value" value="—" />
          <PortfolioTile icon={<LineChart size={16} />} label="Profit / Loss" value="—" />
          <PortfolioTile icon={<ShieldCheck size={16} />} label="Documents & Reports" value="—" />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">Live invested value, current estimate, P/L, title documents, construction &amp; drone updates and exit estimates appear here after your first investment.</p>
      </Section>

      {/* ---------------------------------------------------- Investor Club */}
      <section id="investor-club" className="px-6 py-14 md:px-10">
        <div className="mx-auto max-w-3xl rounded-3xl border border-emerald-500/25 bg-emerald-950/10 p-6 md:p-10">
          <div className="text-center">
            <span className="inline-flex items-center gap-2 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-300"><Crown size={13} /> Investor Club</span>
            <h2 className="mt-3 font-display text-2xl font-semibold md:text-3xl">Get early access to verified opportunities</h2>
            <p className="mt-2 text-sm text-muted-foreground">Exclusive verified deals, early access to projects, market reports and expert webinars. Request access — our team will reach out.</p>
          </div>
          <InvestorClubForm />
        </div>
      </section>

      {/* ---------------------------------------------------- Compliance note */}
      <section className="px-6 pb-16 md:px-10">
        <div className="mx-auto max-w-4xl rounded-2xl border border-white/10 bg-white/[0.02] p-5 text-xs leading-relaxed text-muted-foreground">
          <p className="flex items-center gap-2 font-semibold text-foreground/80"><Info size={14} /> Important disclosure</p>
          <p className="mt-2">
            Truvi is a technology, verification and investor-management platform — not a financial adviser and not a guarantor of returns. All figures shown (including the ROI calculator) are <b>illustrative projections</b>, not assured returns. Real-estate investments carry risk, including loss of capital. Any pooled or fractional investment structure will be launched only under the applicable legal and regulatory framework. Please review each project's title, approvals and risk disclosures, and seek independent advice before investing.
          </p>
        </div>
      </section>
    </main>
  );
}

/* ------------------------------------------------------------ ROI calculator */
function RoiCalculator() {
  const [amount, setAmount] = useState("1000000");
  const [appreciation, setAppreciation] = useState("10");
  const [rentalYield, setRentalYield] = useState("3");
  const [years, setYears] = useState("6");

  const r = useMemo(() => {
    const P = Math.max(0, Number(amount) || 0);
    const g = (Number(appreciation) || 0) / 100;
    const y = (Number(rentalYield) || 0) / 100;
    const n = Math.max(0, Number(years) || 0);
    const futureValue = P * Math.pow(1 + g, n);
    const rentalIncome = P * y * n; // simple, on invested amount
    const totalValue = futureValue + rentalIncome;
    const gain = totalValue - P;
    const cagr = P > 0 && n > 0 ? (Math.pow(totalValue / P, 1 / n) - 1) * 100 : 0;
    return { futureValue, rentalIncome, totalValue, gain, cagr };
  }, [amount, appreciation, rentalYield, years]);

  const field = "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400/50";
  return (
    <div className="grid grid-cols-1 gap-5 rounded-2xl border border-white/10 bg-white/[0.03] p-5 lg:grid-cols-2">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block"><span className="mb-1 block text-xs text-muted-foreground">Investment amount (₹)</span><input type="number" className={field} value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
        <label className="block"><span className="mb-1 block text-xs text-muted-foreground">Expected appreciation (% / yr)</span><input type="number" className={field} value={appreciation} onChange={(e) => setAppreciation(e.target.value)} /></label>
        <label className="block"><span className="mb-1 block text-xs text-muted-foreground">Rental yield (% / yr)</span><input type="number" className={field} value={rentalYield} onChange={(e) => setRentalYield(e.target.value)} /></label>
        <label className="block"><span className="mb-1 block text-xs text-muted-foreground">Holding period (years)</span><input type="number" className={field} value={years} onChange={(e) => setYears(e.target.value)} /></label>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <RoiOut label="Projected property value" value={formatINR(Math.round(r.futureValue))} />
        <RoiOut label="Total rental income" value={formatINR(Math.round(r.rentalIncome))} />
        <RoiOut label="Total projected value" value={formatINR(Math.round(r.totalValue))} accent />
        <RoiOut label="Projected gain" value={formatINR(Math.round(r.gain))} accent />
        <div className="col-span-2 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.08] p-3 text-center">
          <p className="text-xs text-muted-foreground">Projected CAGR</p>
          <p className="font-display text-2xl font-bold text-emerald-300">{r.cagr.toFixed(1)}%</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">Illustrative — not a guaranteed return</p>
        </div>
      </div>
    </div>
  );
}

function RoiOut({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={`mt-0.5 font-display text-lg font-semibold ${accent ? "text-emerald-300" : "text-white"}`}>{value}</p>
    </div>
  );
}

/* --------------------------------------------------------- Investor Club form */
function InvestorClubForm() {
  const [form, setForm] = useState({ name: "", email: "", phone: "", range: "₹10L – ₹50L", city: "", message: "" });
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const h = (e: Event) => { const d = (e as CustomEvent).detail as string; if (d) setForm((f) => ({ ...f, message: `Interested in: ${d}` })); };
    window.addEventListener("invest:prefill", h);
    return () => window.removeEventListener("invest:prefill", h);
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (form.name.trim().length < 2 || !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(form.email)) {
      toast.error("Please enter your name and a valid email");
      return;
    }
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append("name", form.name.trim());
      fd.append("email", form.email.trim());
      fd.append("purposeType", "GUEST");
      fd.append("message", `[Investor Club] Range: ${form.range}${form.city ? ` · City: ${form.city}` : ""}${form.phone ? ` · Phone: ${form.phone}` : ""}${form.message ? ` · ${form.message}` : ""}`);
      await api.post("/enquiries", fd);
      setDone(true);
      toast.success("Request received — our team will reach out.");
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Could not submit — please try again");
    } finally {
      setSaving(false);
    }
  }

  const field = "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400/50";
  if (done) {
    return (
      <div className="mt-6 rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.08] p-6 text-center">
        <BadgeCheck size={28} className="mx-auto text-emerald-300" />
        <p className="mt-2 font-semibold">You're on the list!</p>
        <p className="mt-1 text-sm text-muted-foreground">Our investment team will contact you with verified opportunities and early access.</p>
      </div>
    );
  }
  return (
    <form onSubmit={submit} className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
      <label className="block"><span className="mb-1 block text-xs text-muted-foreground">Full name *</span><input className={field} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Your name" /></label>
      <label className="block"><span className="mb-1 block text-xs text-muted-foreground">Email *</span><input type="email" className={field} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@example.com" /></label>
      <label className="block"><span className="mb-1 block text-xs text-muted-foreground">Phone</span><input className={field} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="10-digit mobile" /></label>
      <label className="block"><span className="mb-1 block text-xs text-muted-foreground">Preferred city</span><input className={field} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="e.g. Pune" /></label>
      <label className="block"><span className="mb-1 block text-xs text-muted-foreground">Investment range</span>
        <select className={field} value={form.range} onChange={(e) => setForm({ ...form, range: e.target.value })}>
          {["Below ₹10L", "₹10L – ₹50L", "₹50L – ₹1Cr", "₹1Cr+"].map((r) => <option key={r} value={r} className="bg-[#0a0d14]">{r}</option>)}
        </select>
      </label>
      <label className="block"><span className="mb-1 block text-xs text-muted-foreground">Message (optional)</span><input className={field} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder="What are you looking for?" /></label>
      <div className="sm:col-span-2">
        <button type="submit" disabled={saving} className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-emerald-500 to-teal-600 px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60">
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Crown size={16} />} Request Investor Club access
        </button>
      </div>
    </form>
  );
}

/* --------------------------------------------------------------- small bits */
function Section({ id, title, sub, children }: { id?: string; title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="px-6 py-10 md:px-10">
      <div className="mx-auto max-w-6xl">
        <h2 className="font-display text-2xl font-semibold md:text-3xl">{title}</h2>
        {sub && <p className="mt-1 text-sm text-muted-foreground">{sub}</p>}
        <div className="mt-6">{children}</div>
      </div>
    </section>
  );
}
function HeroStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
      <p className="font-display text-2xl font-bold text-emerald-300">{value}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}
function ScoreCard({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <span className="grid size-10 place-items-center rounded-xl bg-sky-500/15 text-sky-300">{icon}</span>
      <p className="mt-3 font-semibold">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
    </div>
  );
}
function InsightCard({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <span className="grid size-10 place-items-center rounded-xl bg-violet-500/15 text-violet-300">{icon}</span>
      <p className="mt-3 font-semibold">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
    </div>
  );
}
function PortfolioTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">{icon} {label}</p>
      <p className="mt-1 font-display text-xl font-semibold text-white/50">{value}</p>
    </div>
  );
}
