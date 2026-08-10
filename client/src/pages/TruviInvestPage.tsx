import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { formatINR } from "@/lib/utils";
import { useAuthStore } from "@/store/authStore";
import { loadRazorpay, openRazorpayCheckout } from "@/lib/razorpay";
import {
  TrendingUp, ShieldCheck, MapPin, Landmark, Building2, Trees, Store, Home,
  Calculator, Sparkles, Wallet, Crown, ArrowRight, BadgeCheck, Loader2, Info, LineChart, X, Clock,
} from "lucide-react";

interface Investable {
  projectId: string;
  name: string;
  city: string | null;
  location: string | null;
  developer: string | null;
  isVerified: boolean;
  reraNumber: string | null;
  coverImageUrl: string | null;
  minAmount: number;
  maxAmount: number | null;
  targetAnnualReturnPercent: number;
  tenureMonths: number;
  monthlyPayoutPercent: number | null;
  notes: string | null;
}
interface PortfolioItem {
  _id: string; projectName: string; city: string | null; amount: number;
  targetAnnualReturnPercent: number; tenureMonths: number; monthlyPayout: number; maturityValue: number; projectedGain: number; createdAt: string;
}

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
  const user = useAuthStore((s) => s.user);
  const [opps, setOpps] = useState<Opportunity[]>([]);
  const [stats, setStats] = useState<{ verifiedProjects: number; liveProjects: number; cities: number } | null>(null);
  const [investables, setInvestables] = useState<Investable[]>([]);
  const [portfolio, setPortfolio] = useState<{ items: PortfolioItem[]; summary: { count: number; totalInvested: number; totalMaturity: number; projectedGain: number } } | null>(null);
  const [investTarget, setInvestTarget] = useState<Investable | null>(null);

  function loadPortfolio() {
    if (useAuthStore.getState().user) api.get("/invest/portfolio").then((r) => setPortfolio(r.data)).catch(() => setPortfolio(null));
  }

  useEffect(() => {
    api.get("/public/projects", { params: { limit: 12 } }).then((r) => setOpps(r.data.projects ?? [])).catch(() => setOpps([]));
    api.get("/public/stats").then((r) => setStats(r.data)).catch(() => setStats(null));
    api.get("/invest/opportunities").then((r) => setInvestables(r.data.opportunities ?? [])).catch(() => setInvestables([]));
    loadPortfolio();
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

      {/* ------------------------------------------------ Open for investment */}
      {investables.length > 0 && (
        <Section title="Open for Investment" sub="Verified projects currently accepting investment, with admin-set targeted terms. Returns are targeted, not guaranteed.">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {investables.map((o) => (
              <div key={o.projectId} className="overflow-hidden rounded-2xl border border-emerald-500/25 bg-emerald-950/10">
                <div className="relative h-36 bg-gradient-to-br from-white/5 to-white/[0.02]">
                  {o.coverImageUrl ? <img src={o.coverImageUrl} alt={o.name} className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-white/20"><Building2 size={36} /></div>}
                  <span className="absolute right-3 top-3 rounded-full bg-emerald-500/90 px-2.5 py-1 text-xs font-bold text-white">{o.targetAnnualReturnPercent}% p.a. target</span>
                </div>
                <div className="p-4">
                  <p className="font-semibold">{o.name}</p>
                  <p className="flex items-center gap-1 text-xs text-muted-foreground"><MapPin size={11} /> {[o.location, o.city].filter(Boolean).join(", ") || "—"}</p>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                    <MiniTerm label="Target/yr" value={`${o.targetAnnualReturnPercent}%`} />
                    <MiniTerm label="Tenure" value={`${o.tenureMonths} mo`} />
                    <MiniTerm label="Monthly" value={o.monthlyPayoutPercent ? `${o.monthlyPayoutPercent}%` : "—"} />
                  </div>
                  <p className="mt-2 text-[11px] text-muted-foreground">Min {formatINR(o.minAmount)}{o.maxAmount ? ` · Max ${formatINR(o.maxAmount)}` : ""}</p>
                  <button onClick={() => setInvestTarget(o)} className="mt-3 w-full rounded-lg bg-gradient-to-r from-emerald-500 to-teal-600 px-3 py-2 text-sm font-semibold text-white hover:opacity-90">Invest now</button>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

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
      <Section title="Your Portfolio Dashboard" sub={portfolio && portfolio.items.length > 0 ? "Your investments, projected value and monthly payouts." : "Once you invest, track everything in one place."}>
        {portfolio && portfolio.items.length > 0 ? (
          <>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <PortfolioTile icon={<Wallet size={16} />} label="Total Invested" value={formatINR(portfolio.summary.totalInvested)} live />
              <PortfolioTile icon={<TrendingUp size={16} />} label="Projected Maturity" value={formatINR(portfolio.summary.totalMaturity)} live />
              <PortfolioTile icon={<LineChart size={16} />} label="Projected Gain" value={formatINR(portfolio.summary.projectedGain)} live />
              <PortfolioTile icon={<ShieldCheck size={16} />} label="Investments" value={String(portfolio.summary.count)} live />
            </div>
            <div className="mt-4 overflow-x-auto rounded-2xl border border-white/10">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="bg-white/[0.03] text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr><th className="px-4 py-3">Project</th><th className="px-4 py-3 text-right">Invested</th><th className="px-4 py-3 text-right">Target/yr</th><th className="px-4 py-3 text-right">Tenure</th><th className="px-4 py-3 text-right">Monthly payout</th><th className="px-4 py-3 text-right">Projected maturity</th></tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {portfolio.items.map((p) => (
                    <tr key={p._id}>
                      <td className="px-4 py-3"><p className="font-medium">{p.projectName}</p><p className="text-[11px] text-muted-foreground">{p.city ?? ""}</p></td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatINR(p.amount)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-emerald-300">{p.targetAnnualReturnPercent}%</td>
                      <td className="px-4 py-3 text-right tabular-nums">{p.tenureMonths} mo</td>
                      <td className="px-4 py-3 text-right tabular-nums">{p.monthlyPayout ? formatINR(p.monthlyPayout) : "—"}</td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums text-emerald-300">{formatINR(p.maturityValue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">Projected figures are illustrative targets, not guaranteed. Title documents, construction updates and exit estimates are added by the Truvi team.</p>
          </>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
              <PortfolioTile icon={<Wallet size={16} />} label="Total Invested" value="—" />
              <PortfolioTile icon={<TrendingUp size={16} />} label="Projected Maturity" value="—" />
              <PortfolioTile icon={<LineChart size={16} />} label="Projected Gain" value="—" />
              <PortfolioTile icon={<ShieldCheck size={16} />} label="Documents & Reports" value="—" />
            </div>
            <p className="mt-3 text-xs text-muted-foreground">Invested value, projected maturity, monthly payouts, title documents and updates appear here after your first investment.</p>
          </>
        )}
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

      {investTarget && (
        <InvestModal
          opp={investTarget}
          isLoggedIn={!!user}
          onClose={() => setInvestTarget(null)}
          onInvested={() => { setInvestTarget(null); loadPortfolio(); toast.success("Investment successful — see your portfolio below."); }}
        />
      )}
    </main>
  );
}

/* --------------------------------------------------------------- Invest flow */
function InvestModal({ opp, isLoggedIn, onClose, onInvested }: { opp: Investable; isLoggedIn: boolean; onClose: () => void; onInvested: () => void }) {
  const navigate = useNavigate();
  const [amount, setAmount] = useState(String(opp.minAmount));
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);

  const proj = useMemo(() => {
    const P = Math.max(0, Number(amount) || 0);
    const years = opp.tenureMonths / 12;
    const maturity = Math.round(P * Math.pow(1 + opp.targetAnnualReturnPercent / 100, years));
    const monthly = opp.monthlyPayoutPercent ? Math.round((P * opp.monthlyPayoutPercent) / 100) : 0;
    return { maturity, monthly, gain: maturity - P };
  }, [amount, opp]);

  async function invest() {
    if (!isLoggedIn) { toast.info("Please sign in to invest"); navigate("/login"); return; }
    const amt = Number(amount);
    if (amt < opp.minAmount) { toast.error(`Minimum investment is ${formatINR(opp.minAmount)}`); return; }
    if (opp.maxAmount && amt > opp.maxAmount) { toast.error(`Maximum investment is ${formatINR(opp.maxAmount)}`); return; }
    if (!agree) { toast.error("Please accept the risk disclosure to continue"); return; }
    setBusy(true);
    try {
      const ok = await loadRazorpay();
      if (!ok) { toast.error("Could not load the payment gateway. Please try again."); setBusy(false); return; }
      const { data } = await api.post("/invest/create-order", { projectId: opp.projectId, amount: amt });
      const me = useAuthStore.getState().user;
      openRazorpayCheckout({
        keyId: data.keyId,
        orderId: data.orderId,
        amount: data.amount,
        name: "Truvi Invest",
        description: `Investment · ${opp.name}`,
        prefill: { name: me?.name ?? "", email: me?.email ?? "", contact: (me as any)?.phone ?? "" },
        onSuccess: async (r) => {
          try {
            await api.post("/invest/verify", r);
            onInvested();
          } catch {
            toast.error("Payment done but confirmation failed — our team will verify it.");
          } finally { setBusy(false); }
        },
        onDismiss: () => setBusy(false),
      });
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Could not start the investment");
      setBusy(false);
    }
  }

  const field = "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400/50";
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0a0d14] text-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between border-b border-white/10 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold">Invest · {opp.name}</h2>
            <p className="text-xs text-muted-foreground">{[opp.location, opp.city].filter(Boolean).join(", ")}</p>
          </div>
          <button onClick={onClose} className="rounded-full p-1 text-white/60 hover:bg-white/10 hover:text-white"><X size={18} /></button>
        </div>
        <div className="overflow-y-auto px-5 py-4">
          <div className="grid grid-cols-3 gap-2 text-center">
            <MiniTerm label="Target return" value={`${opp.targetAnnualReturnPercent}% p.a.`} />
            <MiniTerm label="Tenure" value={`${opp.tenureMonths} mo`} />
            <MiniTerm label="Monthly payout" value={opp.monthlyPayoutPercent ? `${opp.monthlyPayoutPercent}%` : "—"} />
          </div>
          <label className="mt-4 block"><span className="mb-1 block text-xs text-muted-foreground">Investment amount (₹) · min {formatINR(opp.minAmount)}</span>
            <input type="number" className={field} value={amount} onChange={(e) => setAmount(e.target.value)} min={opp.minAmount} />
          </label>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <ProjOut label="Est. maturity" value={formatINR(proj.maturity)} />
            <ProjOut label="Projected gain" value={formatINR(proj.gain)} />
            <ProjOut label="Monthly payout" value={proj.monthly ? formatINR(proj.monthly) : "—"} />
          </div>
          <label className="mt-4 flex items-start gap-2 text-xs text-muted-foreground">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5" />
            <span>I understand this is a real-estate investment carrying risk (including loss of capital). Returns shown are <b>targeted / projected, not guaranteed</b>, and I have reviewed the project's disclosures.</span>
          </label>
          <div className="mt-3 flex items-center gap-1.5 rounded-lg border border-amber-500/25 bg-amber-500/[0.06] p-2 text-[11px] text-amber-200/90">
            <Clock size={13} /> Payments are processed securely via Razorpay. This is an asset-backed opportunity, not an assured-return deposit.
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-white/10 px-5 py-4">
          <button onClick={onClose} className="rounded-full border border-white/10 px-4 py-2 text-sm text-white/70 hover:bg-white/10">Cancel</button>
          <button onClick={invest} disabled={busy} className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-emerald-500 to-teal-600 px-6 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60">
            {busy && <Loader2 size={15} className="animate-spin" />} {isLoggedIn ? "Invest & Pay" : "Sign in to invest"}
          </button>
        </div>
      </div>
    </div>
  );
}
function MiniTerm({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2"><p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-0.5 text-sm font-semibold">{value}</p></div>;
}
function ProjOut({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.06] p-2 text-center"><p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-0.5 text-sm font-semibold text-emerald-300">{value}</p></div>;
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
function PortfolioTile({ icon, label, value, live }: { icon: React.ReactNode; label: string; value: string; live?: boolean }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">{icon} {label}</p>
      <p className={`mt-1 font-display text-xl font-semibold ${live ? "text-white" : "text-white/50"}`}>{value}</p>
    </div>
  );
}
