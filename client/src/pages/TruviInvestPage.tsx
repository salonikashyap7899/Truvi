import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { formatINR } from "@/lib/utils";
import { useAuthStore } from "@/store/authStore";
import { loadRazorpay, openRazorpayCheckout } from "@/lib/razorpay";
import {
  TrendingUp, ShieldCheck, MapPin, Building2, Trees, Store,
  Sparkles, Wallet, Crown, ArrowRight, BadgeCheck, Loader2, Info, LineChart, X, Clock,
  Layers, Target, CheckCircle2, PieChart, Coins, Scale, Workflow,
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
  projectType: string | null;
  reraNumber: string | null;
  coverImageUrl: string | null;
  minRate: number | null;
}

/** A readable investment "type" label + primary return driver from the
 *  project type — turns a listing into an investment thesis. */
function investmentThesis(projectType: string | null) {
  const t = (projectType || "").toUpperCase();
  if (t.includes("LAND") || t.includes("PLOT")) return { label: "LAND / PLOTTED", driver: "Development + appreciation" };
  if (t.includes("COMMERCIAL") || t.includes("OFFICE") || t.includes("RETAIL")) return { label: "COMMERCIAL", driver: "Rental income + appreciation" };
  if (t.includes("VILLA") || t.includes("PLOTTED")) return { label: "DEVELOPMENT", driver: "Development + appreciation" };
  if (t.includes("APARTMENT") || t.includes("RESIDENTIAL") || t.includes("FLAT")) return { label: "RESIDENTIAL", driver: "Appreciation + rental" };
  return { label: "REAL ESTATE", driver: "Development + appreciation" };
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

/** Where Truvi deploys investor capital — framed as a capital-deployment
 *  ecosystem, not a marketplace. */
const DEPLOY_CATEGORIES = [
  { icon: <Trees size={18} />, label: "Land Acquisition", desc: "Early-stage land opportunities with verified title, location intelligence and acquisition upside." },
  { icon: <Building2 size={18} />, label: "Development Projects", desc: "Capital deployed into plotted developments, residential and commercial projects." },
  { icon: <Store size={18} />, label: "Income Assets", desc: "Rental-generating residential, commercial and hospitality assets." },
  { icon: <Layers size={18} />, label: "Special Situations", desc: "Select opportunities where structured capital can unlock value through acquisition, development or turnaround." },
];

/** The investor journey — the story the page tells end-to-end. */
const HOW_STEPS = [
  { n: "01", title: "You Invest", desc: "Join the Truvi Investor Club and define your investment preferences, ticket size and risk profile.", icon: <Crown size={16} /> },
  { n: "02", title: "Truvi Evaluates", desc: "We verify the opportunity across title, approvals, location, developer, market demand, financials and exit potential.", icon: <ShieldCheck size={16} /> },
  { n: "03", title: "Capital Is Deployed", desc: "Approved investor capital is deployed into the selected opportunity through the applicable investment structure.", icon: <Coins size={16} /> },
  { n: "04", title: "Project Creates Value", desc: "Capital is used for acquisition, development, construction, leasing or other approved project activities.", icon: <Workflow size={16} /> },
  { n: "05", title: "Exit / Income", desc: "The asset generates value through sale, appreciation, rental income or project exit.", icon: <TrendingUp size={16} /> },
  { n: "06", title: "Investor Receives Return", desc: "Returns are distributed according to the applicable investment agreement and project structure.", icon: <Wallet size={16} /> },
];

/** The full investor onboarding funnel shown under the Investor Club form. */
const INVESTOR_FUNNEL = [
  "Join Investor Club",
  "Investor Profile",
  "KYC",
  "Investor Eligibility / Suitability",
  "Investment Mandate",
  "Opportunity Access",
  "Investment Proposal",
  "Investor Approval",
  "Investment Agreement",
  "Capital Deployment",
  "Portfolio Dashboard",
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
  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });

  return (
    <main className="min-h-screen bg-background text-white">
      {/* ---------------------------------------------------------------- Hero */}
      <section className="relative overflow-hidden px-6 py-16 md:px-10 md:py-24">
        <div className="pointer-events-none absolute left-1/2 top-[-20%] h-[50vh] w-[70vw] -translate-x-1/2 rounded-full opacity-20 blur-3xl" style={{ background: "radial-gradient(circle, #10b981 0%, transparent 70%)" }} />
        <div className="relative mx-auto max-w-5xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-300">
            <TrendingUp size={13} /> Truvi Invest · Capital into verified real estate
          </span>
          <h1 className="mt-5 font-display text-3xl font-semibold leading-tight md:text-5xl">
            Invest in Real Estate. <span className="text-gradient-trust">Truvi Finds, Verifies &amp; Manages the Opportunity.</span>
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-sm text-muted-foreground md:text-base">
            Your capital is allocated to selected real-estate opportunities identified and evaluated by Truvi, with project progress, capital deployment and investment performance tracked through the platform.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <button onClick={() => goToClub()} className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-emerald-500 to-teal-600 px-6 py-3 text-sm font-semibold text-white shadow-lg transition hover:opacity-90">
              <Crown size={16} /> Join Investor Club
            </button>
            <button onClick={() => scrollTo("how-it-works")} className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-6 py-3 text-sm font-semibold text-white/90 hover:bg-white/10">
              See How It Works <ArrowRight size={15} />
            </button>
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

      {/* ------------------------------------------------- Where capital is deployed */}
      <Section title="Where Truvi Deploys Capital" sub="Investor capital is deployed into selected, verified opportunities — not an open marketplace of listings.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {DEPLOY_CATEGORIES.map((c) => (
            <div key={c.label} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
              <span className="grid size-10 place-items-center rounded-xl bg-emerald-500/15 text-emerald-300">{c.icon}</span>
              <p className="mt-3 font-semibold">{c.label}</p>
              <p className="mt-1 text-sm text-muted-foreground">{c.desc}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-3 text-sm text-muted-foreground">
          <BadgeCheck size={15} className="text-emerald-300 shrink-0" /> Every opportunity is evaluated before capital is considered for deployment.
        </p>
      </Section>

      {/* ------------------------------------------------- How your capital works */}
      <Section id="how-it-works" title="How Your Capital Works" sub="From joining the Investor Club to receiving your return — the full journey your money takes.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {HOW_STEPS.map((s) => (
            <div key={s.n} className="relative rounded-2xl border border-white/10 bg-white/[0.03] p-5">
              <div className="flex items-center gap-3">
                <span className="grid size-9 place-items-center rounded-xl bg-emerald-500/15 text-emerald-300">{s.icon}</span>
                <span className="font-display text-2xl font-bold text-white/15">{s.n}</span>
              </div>
              <p className="mt-3 font-semibold">{s.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{s.desc}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* ------------------------------------------------- Investment example (illustrative) */}
      <Section title="Where does your money go?" sub="An illustrative example of how investor capital is allocated inside a project. Actual percentages vary per project — nothing here is a fixed promise.">
        <InvestmentExample />
      </Section>

      {/* ------------------------------------------------- Why investors use Truvi */}
      <Section title="Why Investors Use Truvi" sub="What you get with Truvi that a traditional property portal doesn't offer.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { icon: <Target size={18} />, t: "Access", d: "Opportunities that may not be available through traditional property portals." },
            { icon: <ShieldCheck size={18} />, t: "Verification", d: "Title, approvals, location, market, developer and project-level due diligence." },
            { icon: <Sparkles size={18} />, t: "Intelligence", d: "Infrastructure, demand, comparable transactions and growth drivers." },
            { icon: <Scale size={18} />, t: "Structure", d: "Investment terms and project economics presented before commitment." },
            { icon: <PieChart size={18} />, t: "Transparency", d: "Track capital deployment, milestones, project performance and exit progress." },
            { icon: <Wallet size={18} />, t: "One Portfolio", d: "Multiple real-estate investments tracked from one dashboard." },
          ].map((c) => (
            <div key={c.t} className="rounded-2xl border border-emerald-500/20 bg-emerald-950/[0.08] p-5">
              <span className="grid size-10 place-items-center rounded-xl bg-emerald-500/15 text-emerald-300">{c.icon}</span>
              <p className="mt-3 font-semibold">{c.t}</p>
              <p className="mt-1 text-sm text-muted-foreground">{c.d}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* ------------------------------------------------ Open for investment */}
      {investables.length > 0 && (
        <Section title="Open for Investment" sub="Selected verified projects currently accepting investor capital, with admin-set targeted terms. Returns are targeted / projected, not guaranteed.">
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
                    <MiniTerm label="Horizon" value={`${o.tenureMonths} mo`} />
                    <MiniTerm label="Monthly" value={o.monthlyPayoutPercent ? `${o.monthlyPayoutPercent}%` : "—"} />
                  </div>
                  <p className="mt-2 text-[11px] text-muted-foreground">Min {formatINR(o.minAmount)}{o.maxAmount ? ` · Max ${formatINR(o.maxAmount)}` : ""}</p>
                  <button onClick={() => setInvestTarget(o)} className="mt-3 w-full rounded-lg bg-gradient-to-r from-emerald-500 to-teal-600 px-3 py-2 text-sm font-semibold text-white hover:opacity-90">View investment memo</button>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

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
              const th = investmentThesis(o.projectType);
              return (
                <div key={o._id} className="flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
                  <div className="relative h-40 bg-gradient-to-br from-white/5 to-white/[0.02]">
                    {o.coverImageUrl ? (
                      <img src={o.coverImageUrl} alt={o.name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="grid h-full place-items-center text-white/20"><Building2 size={40} /></div>
                    )}
                    <span className="absolute left-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white backdrop-blur">
                      {[o.city, th.label].filter(Boolean).join(" · ")}
                    </span>
                    <span className="absolute right-3 top-3 rounded-lg bg-emerald-500/90 px-2.5 py-1 text-xs font-bold text-white">Score {sc.overall}</span>
                  </div>
                  <div className="flex flex-1 flex-col p-4">
                    <p className="font-semibold">{o.name}</p>
                    <p className="flex items-center gap-1 text-xs text-muted-foreground"><MapPin size={11} /> {[o.location, o.city].filter(Boolean).join(", ") || "—"}</p>

                    <div className="mt-3 space-y-1.5 text-sm">
                      <MemoLine label="Truvi Investment Score™" value={`${sc.overall}/100`} accent />
                      <MemoLine label="Risk" value={sc.risk} />
                      <MemoLine label="Primary return driver" value={th.driver} />
                      {o.developer && <MemoLine label="Developer" value={o.developer} />}
                    </div>

                    <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
                      {o.isVerified && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-300"><BadgeCheck size={11} /> Verified</span>}
                      {o.reraNumber && <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/15 px-2 py-0.5 text-sky-300"><ShieldCheck size={11} /> RERA</span>}
                      {o.isPrimeListing && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-amber-300">Prime</span>}
                    </div>

                    <div className="mt-4 flex gap-2 pt-1">
                      <Link to={`/inventory/${o._id}/presentation`} className="flex-1 rounded-lg bg-emerald-600 px-3 py-2 text-center text-xs font-semibold text-white hover:bg-emerald-500">View Investment Memo →</Link>
                      <button onClick={() => goToClub(o.name)} className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold hover:bg-white/10">Interest</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {/* ------------------------------------------- Investment Return Simulator */}
      <Section title="Investment Return Simulator" sub="Model an illustrative outcome across amount, structure, project type and horizon. Illustrative projection only — actual returns depend on project performance and structure.">
        <ReturnSimulator />
      </Section>

      {/* --------------------------------------------- Truvi Investment Score™ */}
      <Section title="Truvi Investment Score™" sub="Truvi's data and verification advantage, turned into an investment-decision engine. Every opportunity is scored across the signals that actually drive real-estate outcomes.">
        <InvestmentScoreCard />
      </Section>

      {/* ------------------------------------------------ Capital transparency */}
      <Section title="Where Your Money Goes — Capital Transparency" sub="For each investment, your dashboard tracks capital from received to exit. Below is an illustrative view of live project progress.">
        <CapitalTransparency />
      </Section>

      {/* -------------------------------------------------- AI Investment Insights */}
      <Section title="AI Investment Insights" sub="Intelligence-led analysis behind every deployment decision — infrastructure, growth drivers and comparable prices.">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <InsightCard icon={<Building2 size={18} />} title="Nearby infrastructure" desc="Metro, highways, airports, SEZs and social infrastructure around each asset." />
          <InsightCard icon={<TrendingUp size={18} />} title="Future growth drivers" desc="Planned corridors, employment hubs and policy signals shaping demand." />
          <InsightCard icon={<Scale size={18} />} title="Comparable land prices" desc="Benchmark ₹/sq ft against recent transactions in the micro-market." />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-muted-foreground">
          <Sparkles size={16} className="text-emerald-300" />
          Personalised, area-specific AI reports are part of the Investor Club.
          <button onClick={() => goToClub()} className="ml-auto shrink-0 rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500">Request a report</button>
        </div>
      </Section>

      {/* ------------------------------------------------- Portfolio dashboard */}
      <Section title="My Truvi Portfolio" sub={portfolio && portfolio.items.length > 0 ? "Your capital, projected exit value and each investment's status." : "Once you invest, track capital, project progress and returns in one place."}>
        {portfolio && portfolio.items.length > 0 ? (
          <>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <PortfolioTile icon={<Wallet size={16} />} label="Total Invested" value={formatINR(portfolio.summary.totalInvested)} live />
              <PortfolioTile icon={<TrendingUp size={16} />} label="Projected Exit Value" value={formatINR(portfolio.summary.totalMaturity)} live />
              <PortfolioTile icon={<LineChart size={16} />} label="Projected Gain" value={formatINR(portfolio.summary.projectedGain)} live />
              <PortfolioTile icon={<Layers size={16} />} label="Active Investments" value={String(portfolio.summary.count)} live />
            </div>
            <div className="mt-4 overflow-x-auto rounded-2xl border border-white/10">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-white/[0.03] text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr><th className="px-4 py-3">Investment</th><th className="px-4 py-3 text-right">Invested</th><th className="px-4 py-3 text-right">Target/yr</th><th className="px-4 py-3 text-right">Horizon</th><th className="px-4 py-3 text-right">Monthly income</th><th className="px-4 py-3 text-right">Projected exit</th></tr>
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
            <p className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
              {["Investment Memo", "Documents", "Capital Deployment", "Project Updates", "Valuation", "Returns", "Exit"].map((t) => (
                <span key={t} className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1">{t}</span>
              ))}
            </p>
            <p className="mt-2 text-[11px] text-muted-foreground">Projected figures are illustrative targets, not guaranteed. Title documents, construction updates and exit estimates are added by the Truvi team.</p>
          </>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
              <PortfolioTile icon={<Wallet size={16} />} label="Total Invested" value="—" />
              <PortfolioTile icon={<TrendingUp size={16} />} label="Projected Exit Value" value="—" />
              <PortfolioTile icon={<LineChart size={16} />} label="Projected Gain" value="—" />
              <PortfolioTile icon={<Layers size={16} />} label="Active Investments" value="—" />
            </div>
            <p className="mt-3 text-xs text-muted-foreground">Invested capital, projected exit value, monthly income, capital-deployment progress, title documents and updates appear here after your first investment.</p>
          </>
        )}
      </Section>

      {/* ---------------------------------------------------- Investor Club */}
      <section id="investor-club" className="px-6 py-14 md:px-10">
        <div className="mx-auto max-w-3xl rounded-3xl border border-emerald-500/25 bg-emerald-950/10 p-6 md:p-10">
          <div className="text-center">
            <span className="inline-flex items-center gap-2 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-300"><Crown size={13} /> Investor Club</span>
            <h2 className="mt-3 font-display text-2xl font-semibold md:text-3xl">Join the Truvi Investor Club</h2>
            <p className="mt-2 text-sm text-muted-foreground">Tell us how you invest. After you join, our team completes your investor profile, KYC and mandate — then shares matched, verified opportunities.</p>
          </div>
          <InvestorClubForm />
          <div className="mt-8">
            <p className="text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">The Investor Journey</p>
            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {INVESTOR_FUNNEL.map((step, i) => (
                <div key={step} className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.03] p-2.5">
                  <span className={`grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-bold ${i === 0 ? "bg-emerald-500 text-white" : "bg-white/10 text-white/70"}`}>{i + 1}</span>
                  <span className={`text-xs font-medium ${i === 0 ? "text-emerald-300" : "text-white/80"}`}>{step}</span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-center text-[11px] text-muted-foreground">You start at step 1 — the Truvi team guides you through the rest. Capital is deployed only after your approval and the signed investment agreement.</p>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------- Compliance note */}
      <section className="px-6 pb-16 md:px-10">
        <div className="mx-auto max-w-4xl rounded-2xl border border-white/10 bg-white/[0.02] p-5 text-xs leading-relaxed text-muted-foreground">
          <p className="flex items-center gap-2 font-semibold text-foreground/80"><Info size={14} /> Important disclosure</p>
          <p className="mt-2">
            Truvi is a technology, verification and investor-management platform — not a financial adviser and not a guarantor of returns. All figures shown (including the return simulator, the investment example and any scores) are <b>illustrative projections</b>, not assured returns. Real-estate investments carry risk, including loss of capital. Any pooled, fund, SPV or fractional investment structure — including the collection of capital from multiple investors for deployment — will be launched only under the applicable legal and regulatory framework (which may include SEBI AIF and Companies Act requirements), with the exact structure, eligibility, pooling mechanism and solicitation model validated by qualified legal / regulatory counsel first. Please review each project&apos;s title, approvals and risk disclosures, and seek independent advice before investing.
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

/* ------------------------------------------------- Investment example (illustrative) */
function InvestmentExample() {
  // Reconciled, pool-based example: one investor's ₹25L is a share of a ₹1 Cr
  // investor pool, which is deployed into a ₹5 Cr project. Deployment percentages
  // are of the ₹1 Cr POOL, and the rupee amounts add up exactly — so nothing is
  // confusing or unexplained.
  const POOL = 1_00_00_000; // ₹1 Cr
  const YOU = 25_00_000; // ₹25 L
  const alloc = [
    { label: "Land / Acquisition", pct: 40, tone: "bg-emerald-400" },
    { label: "Development", pct: 35, tone: "bg-teal-400" },
    { label: "Infrastructure", pct: 15, tone: "bg-sky-400" },
    { label: "Project costs", pct: 10, tone: "bg-violet-400" },
  ];
  const sharePct = Math.round((YOU / POOL) * 100);
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {/* Top-line: your ticket vs the pool vs the project */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.07] p-4">
          <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground"><Wallet size={13} /> Your Investment</p>
          <p className="mt-1 font-display text-xl font-bold text-emerald-300">{formatINR(YOU)}</p>
          <p className="text-[11px] text-muted-foreground">{sharePct}% of the investor pool</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground"><Layers size={13} /> Total Investor Pool</p>
          <p className="mt-1 font-display text-xl font-bold">{formatINR(POOL)}</p>
          <p className="text-[11px] text-muted-foreground">Capital from all investors in this deal</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground"><Building2 size={13} /> Selected Project</p>
          <p className="mt-1 font-display text-xl font-bold">₹5 Cr</p>
          <p className="text-[11px] text-muted-foreground">Verified, evaluated opportunity</p>
        </div>
      </div>

      {/* Deployment of the ₹1 Cr pool — %s and ₹ that add up to the pool */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Deployment of the {formatINR(POOL)} investor pool</p>
        <div className="mt-3 flex h-3 overflow-hidden rounded-full">
          {alloc.map((a) => <div key={a.label} className={a.tone} style={{ width: `${a.pct}%` }} />)}
        </div>
        <div className="mt-3 divide-y divide-white/5">
          {alloc.map((a) => (
            <div key={a.label} className="flex items-center justify-between py-2 text-sm">
              <span className="flex items-center gap-2 text-muted-foreground"><span className={`size-2.5 rounded-full ${a.tone}`} /> {a.label}</span>
              <span className="flex items-center gap-3">
                <span className="w-10 text-right tabular-nums text-muted-foreground">{a.pct}%</span>
                <span className="w-20 text-right font-semibold tabular-nums">{formatINR((POOL * a.pct) / 100)}</span>
              </span>
            </div>
          ))}
          <div className="flex items-center justify-between py-2 text-sm font-semibold">
            <span>Total deployed</span>
            <span className="tabular-nums text-emerald-300">{formatINR(POOL)}</span>
          </div>
        </div>
      </div>

      {/* Then: revenue → distribution, pro-rata to your share */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground"><TrendingUp size={13} /> Project Revenue / Exit</p>
          <p className="mt-1 text-sm text-white/90">Value from sale, appreciation, rental income or project exit.</p>
        </div>
        <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.06] p-4">
          <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground"><PieChart size={13} /> Investor Distribution</p>
          <p className="mt-1 text-sm text-white/90">Returns shared per the agreed structure — pro-rata to your <b className="text-emerald-300">{formatINR(YOU)}</b> ({sharePct}%) share of the pool.</p>
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground">Illustrative example with round numbers. Actual pool size, allocation %, exit value and profit-sharing are defined per project in the investment agreement, under the applicable legal structure — no fixed promise.</p>
    </div>
  );
}

/* ------------------------------------------- Truvi Investment Score™ (framework) */
function InvestmentScoreCard() {
  const factors: { label: string; score: number }[] = [
    { label: "Title & Legal", score: 95 },
    { label: "Location", score: 82 },
    { label: "Infrastructure", score: 88 },
    { label: "Demand", score: 76 },
    { label: "Developer", score: 74 },
    { label: "Project Economics", score: 81 },
    { label: "Exit Potential", score: 79 },
  ];
  const overall = Math.round(factors.reduce((a, f) => a + f.score, 0) / factors.length);
  const bar = (s: number) => (s >= 85 ? "bg-emerald-400" : s >= 75 ? "bg-amber-400" : "bg-rose-400");
  return (
    <div className="grid grid-cols-1 gap-5 rounded-2xl border border-white/10 bg-white/[0.03] p-5 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sample scorecard</p>
        <div className="mt-3 space-y-2">
          {factors.map((f) => (
            <div key={f.label} className="flex items-center gap-3">
              <span className="w-36 shrink-0 text-sm text-muted-foreground">{f.label}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10"><div className={`h-full ${bar(f.score)}`} style={{ width: `${f.score}%` }} /></div>
              <span className="w-8 shrink-0 text-right text-sm font-semibold tabular-nums">{f.score}</span>
            </div>
          ))}
          <div className="flex items-center gap-3 pt-1">
            <span className="w-36 shrink-0 text-sm text-muted-foreground">Risk</span>
            <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-semibold text-amber-300">Medium</span>
          </div>
        </div>
      </div>
      <div className="flex flex-col justify-between gap-4 rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.06] p-5">
        <div className="text-center">
          <p className="text-xs text-muted-foreground">Truvi Investment Score™</p>
          <p className="font-display text-5xl font-bold text-emerald-300">{overall}<span className="text-lg text-white/40">/100</span></p>
          <span className="mt-2 inline-flex rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-200">Investment Grade: A−</span>
        </div>
        <div className="space-y-1 text-xs text-muted-foreground">
          <p><b className="text-white/80">Expected holding:</b> 24–36 months</p>
          <p><b className="text-white/80">Primary return driver:</b> Development + appreciation</p>
          <p><b className="text-white/80">Exit strategy:</b> Plot sales</p>
        </div>
        <p className="text-[10px] text-muted-foreground">Illustrative sample. Each live opportunity carries its own scorecard and recommendation.</p>
      </div>
    </div>
  );
}

/* ---------------------------------------------------- Capital transparency */
function CapitalTransparency() {
  const milestones = [
    { label: "Land Acquisition", pct: 100 },
    { label: "Approvals", pct: 80 },
    { label: "Infrastructure", pct: 45 },
    { label: "Sales", pct: 32 },
    { label: "Exit Progress", pct: 20 },
  ];
  const stages = [
    { t: "Capital Received", icon: <Wallet size={14} /> },
    { t: "Capital Deployed", icon: <Coins size={14} /> },
    { t: "Project Milestones", icon: <Workflow size={14} /> },
    { t: "Asset Value", icon: <TrendingUp size={14} /> },
    { t: "Income / Sales", icon: <PieChart size={14} /> },
    { t: "Exit", icon: <CheckCircle2 size={14} /> },
  ];
  return (
    <div className="grid grid-cols-1 gap-5 rounded-2xl border border-white/10 bg-white/[0.03] p-5 lg:grid-cols-2">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Live project progress (illustrative)</p>
        <div className="mt-3 space-y-3">
          {milestones.map((m) => (
            <div key={m.label}>
              <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">{m.label}</span><span className="tabular-nums font-medium">{m.pct}%</span></div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-emerald-400" style={{ width: `${m.pct}%` }} /></div>
            </div>
          ))}
          <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-sm"><span className="text-muted-foreground">Collections to date</span><span className="font-semibold text-emerald-300">₹4.2 Cr</span></div>
        </div>
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Your capital, tracked end-to-end</p>
        <div className="mt-3 space-y-2">
          {stages.map((s, i) => (
            <div key={s.t}>
              <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-2.5">
                <span className="grid size-8 place-items-center rounded-lg bg-emerald-500/15 text-emerald-300">{s.icon}</span>
                <span className="text-sm font-medium">{s.t}</span>
              </div>
              {i < stages.length - 1 && <p className="text-center text-[10px] leading-3 text-white/25">↓</p>}
            </div>
          ))}
        </div>
      </div>
    </div>
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
            <MiniTerm label="Horizon" value={`${opp.tenureMonths} mo`} />
            <MiniTerm label="Monthly income" value={opp.monthlyPayoutPercent ? `${opp.monthlyPayoutPercent}%` : "—"} />
          </div>
          <label className="mt-4 block"><span className="mb-1 block text-xs text-muted-foreground">Investment amount (₹) · min {formatINR(opp.minAmount)}</span>
            <input type="number" className={field} value={amount} onChange={(e) => setAmount(e.target.value)} min={opp.minAmount} />
          </label>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <ProjOut label="Projected exit" value={formatINR(proj.maturity)} />
            <ProjOut label="Projected gain" value={formatINR(proj.gain)} />
            <ProjOut label="Monthly income" value={proj.monthly ? formatINR(proj.monthly) : "—"} />
          </div>
          <label className="mt-4 flex items-start gap-2 text-xs text-muted-foreground">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5" />
            <span>I understand this is a real-estate investment carrying risk (including loss of capital). Returns shown are <b>targeted / projected, not guaranteed</b>, and I have reviewed the project&apos;s disclosures.</span>
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

/* ------------------------------------------------- Investment Return Simulator */
const SIM_STRUCTURES = ["Profit Share", "Fixed Return Structure", "Equity Participation", "Project-linked Return"];
const SIM_TYPES: { label: string; annual: number; risk: "Low" | "Medium" | "High" }[] = [
  { label: "Land Acquisition", annual: 0.22, risk: "High" },
  { label: "Plotted Development", annual: 0.18, risk: "Medium" },
  { label: "Residential", annual: 0.14, risk: "Medium" },
  { label: "Commercial", annual: 0.13, risk: "Medium" },
  { label: "Rental Asset", annual: 0.10, risk: "Low" },
];

function ReturnSimulator() {
  const [amount, setAmount] = useState("1000000");
  const [structure, setStructure] = useState(SIM_STRUCTURES[0]);
  const [typeLabel, setTypeLabel] = useState(SIM_TYPES[1].label);
  const [months, setMonths] = useState("36");

  const r = useMemo(() => {
    const P = Math.max(0, Number(amount) || 0);
    const type = SIM_TYPES.find((t) => t.label === typeLabel) ?? SIM_TYPES[1];
    const years = Math.max(0, Number(months) || 0) / 12;
    // Illustrative project gross growth by type over the horizon.
    const exitValue = P * Math.pow(1 + type.annual, years);
    const projectProfit = exitValue - P;
    // Illustrative investor share of the project profit by structure.
    const share = structure === "Fixed Return Structure" ? 0.6
      : structure === "Equity Participation" ? 0.85
      : structure === "Project-linked Return" ? 0.7
      : 0.75; // Profit Share default
    const investorProfit = Math.max(0, projectProfit * share);
    const investorReturn = P + investorProfit;
    const irr = P > 0 && years > 0 ? (Math.pow(investorReturn / P, 1 / years) - 1) * 100 : 0;
    return { P, exitValue, projectProfit, investorProfit, investorReturn, irr, risk: type.risk };
  }, [amount, structure, typeLabel, months]);

  const field = "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400/50";
  return (
    <div className="grid grid-cols-1 gap-5 rounded-2xl border border-white/10 bg-white/[0.03] p-5 lg:grid-cols-2">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block sm:col-span-2"><span className="mb-1 block text-xs text-muted-foreground">Investment amount (₹)</span><input type="number" className={field} value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
        <label className="block"><span className="mb-1 block text-xs text-muted-foreground">Investment structure</span>
          <select className={field} value={structure} onChange={(e) => setStructure(e.target.value)}>{SIM_STRUCTURES.map((s) => <option key={s} value={s} className="bg-[#0a0d14]">{s}</option>)}</select>
        </label>
        <label className="block"><span className="mb-1 block text-xs text-muted-foreground">Project type</span>
          <select className={field} value={typeLabel} onChange={(e) => setTypeLabel(e.target.value)}>{SIM_TYPES.map((t) => <option key={t.label} value={t.label} className="bg-[#0a0d14]">{t.label}</option>)}</select>
        </label>
        <label className="block sm:col-span-2"><span className="mb-1 block text-xs text-muted-foreground">Holding period</span>
          <select className={field} value={months} onChange={(e) => setMonths(e.target.value)}>{["12", "24", "36", "60"].map((m) => <option key={m} value={m} className="bg-[#0a0d14]">{m} months</option>)}</select>
        </label>
        <p className="text-[11px] text-muted-foreground sm:col-span-2">Fixed / Equity structures are subject to legal structuring and eligibility. Percentages are illustrative modelling assumptions, not offers.</p>
      </div>
      <div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[11px] font-semibold text-amber-300"><Info size={12} /> Illustrative Scenario</span>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <RoiOut label="Invested capital" value={formatINR(Math.round(r.P))} />
          <RoiOut label="Projected exit value" value={formatINR(Math.round(r.exitValue))} />
          <RoiOut label="Illustrative Investor Proceeds" value={formatINR(Math.round(r.investorReturn))} accent />
          <RoiOut label="Illustrative profit share" value={formatINR(Math.round(r.investorProfit))} accent />
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3"><p className="text-[11px] text-muted-foreground">Risk level</p><p className={`mt-0.5 font-display text-lg font-semibold ${r.risk === "Low" ? "text-emerald-300" : r.risk === "Medium" ? "text-amber-300" : "text-rose-300"}`}>{r.risk}</p></div>
          <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.08] p-3 text-center"><p className="text-[11px] text-muted-foreground">Illustrative IRR</p><p className="font-display text-2xl font-bold text-emerald-300">{r.irr.toFixed(1)}%</p></div>
        </div>
        <p className="mt-3 rounded-lg border border-amber-500/25 bg-amber-500/[0.06] p-2.5 text-[11px] font-medium text-amber-200/90">
          Not an offer, guarantee or assured return. Actual outcomes depend on project performance, costs, holding period and investment structure.
        </p>
      </div>
    </div>
  );
}

function MemoLine({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-right text-sm font-semibold ${accent ? "text-emerald-300" : "text-white/90"}`}>{value}</span>
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
const CLUB_RANGES = ["₹10L – ₹25L", "₹25L – ₹50L", "₹50L – ₹1Cr", "₹1Cr – ₹5Cr", "₹5Cr+"];
const CLUB_STRATEGIES = ["Capital Appreciation", "Development Projects", "Rental Income", "Land Opportunities", "Diversified Portfolio"];
const CLUB_HORIZONS = ["< 2 years", "2–3 years", "3–5 years", "5+ years"];
const CLUB_RISK = ["Conservative", "Balanced", "Growth"];

function InvestorClubForm() {
  const [form, setForm] = useState({ name: "", email: "", phone: "", range: CLUB_RANGES[1], horizon: CLUB_HORIZONS[1], risk: CLUB_RISK[1], message: "" });
  const [strategies, setStrategies] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const h = (e: Event) => { const d = (e as CustomEvent).detail as string; if (d) setForm((f) => ({ ...f, message: `Interested in: ${d}` })); };
    window.addEventListener("invest:prefill", h);
    return () => window.removeEventListener("invest:prefill", h);
  }, []);

  const toggleStrategy = (s: string) => setStrategies((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]);

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
      const parts = [
        `Range: ${form.range}`,
        `Horizon: ${form.horizon}`,
        `Risk: ${form.risk}`,
        strategies.length ? `Strategy: ${strategies.join(", ")}` : "",
        form.phone ? `Phone: ${form.phone}` : "",
        form.message ? form.message : "",
      ].filter(Boolean);
      fd.append("message", `[Investor Club] ${parts.join(" · ")}`);
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
  const chip = (active: boolean) => `rounded-full px-3 py-1.5 text-xs font-semibold transition ${active ? "bg-emerald-500 text-white" : "border border-white/15 text-white/70 hover:bg-white/10"}`;

  if (done) {
    return (
      <div className="mt-6 rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.08] p-6 text-center">
        <BadgeCheck size={28} className="mx-auto text-emerald-300" />
        <p className="mt-2 font-semibold">You&apos;re on the list!</p>
        <p className="mt-1 text-sm text-muted-foreground">Our investment team will complete your investor profile, KYC and mandate, then share matched verified opportunities.</p>
      </div>
    );
  }
  return (
    <form onSubmit={submit} className="mt-6 space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block"><span className="mb-1 block text-xs text-muted-foreground">Full name *</span><input className={field} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Your name" /></label>
        <label className="block"><span className="mb-1 block text-xs text-muted-foreground">Email *</span><input type="email" className={field} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@example.com" /></label>
        <label className="block"><span className="mb-1 block text-xs text-muted-foreground">Phone</span><input className={field} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="10-digit mobile" /></label>
        <label className="block"><span className="mb-1 block text-xs text-muted-foreground">Investment range</span>
          <select className={field} value={form.range} onChange={(e) => setForm({ ...form, range: e.target.value })}>{CLUB_RANGES.map((r) => <option key={r} value={r} className="bg-[#0a0d14]">{r}</option>)}</select>
        </label>
      </div>

      <div>
        <span className="mb-1.5 block text-xs text-muted-foreground">Preferred strategy (select any)</span>
        <div className="flex flex-wrap gap-1.5">
          {CLUB_STRATEGIES.map((s) => <button type="button" key={s} onClick={() => toggleStrategy(s)} className={chip(strategies.includes(s))}>{s}</button>)}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <span className="mb-1.5 block text-xs text-muted-foreground">Preferred horizon</span>
          <div className="flex flex-wrap gap-1.5">{CLUB_HORIZONS.map((h) => <button type="button" key={h} onClick={() => setForm({ ...form, horizon: h })} className={chip(form.horizon === h)}>{h}</button>)}</div>
        </div>
        <div>
          <span className="mb-1.5 block text-xs text-muted-foreground">Risk preference</span>
          <div className="flex flex-wrap gap-1.5">{CLUB_RISK.map((rk) => <button type="button" key={rk} onClick={() => setForm({ ...form, risk: rk })} className={chip(form.risk === rk)}>{rk}</button>)}</div>
        </div>
      </div>

      <label className="block"><span className="mb-1 block text-xs text-muted-foreground">Message (optional)</span><input className={field} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder="Anything specific you're looking for?" /></label>

      <button type="submit" disabled={saving} className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-emerald-500 to-teal-600 px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60">
        {saving ? <Loader2 size={16} className="animate-spin" /> : <Crown size={16} />} Join Investor Club
      </button>
      <p className="text-center text-[11px] text-muted-foreground">Joining the club is an expression of interest only — not an investment or a commitment to invest.</p>
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
