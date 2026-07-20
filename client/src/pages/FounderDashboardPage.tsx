import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { NotificationBell } from "@/components/NotificationBell";
import UserMenu from "@/components/UserMenu";
import { formatCompactINR, formatINR } from "@/lib/utils";
import { useSocketEvent } from "@/lib/socket";
import { toast } from "sonner";

/* ------------------------------------------------------------------ types */
interface Overview {
  generatedAt: string;
  executive: {
    totalRevenue: number; gmv: number;
    totalDevelopers: number; totalCPs: number; totalBuyers: number;
    activeListings: number; todaysBookings: number; pendingActions: number;
  };
  companyHealth: {
    revenueToday: number; revenueMTD: number; revenueYTD: number;
    activeProjects: number; healthScore: number; mrr: number;
  };
  sales: {
    leadsToday: number; qualifiedLeads: number; siteVisits: number;
    bookings: number; agreements: number; registrations: number;
    conversionRate: number;
    funnel: { stage: string; count: number }[];
    revenueByProject: { project: string; value: number }[];
  };
  projects: {
    total: number; approved: number; verified: number; pending: number;
    rows: { id: string; name: string; city: string; approvalStatus: string; verified: boolean; listingTier: string }[];
  };
  crm: { newCustomers: number; activeCustomers: number; followUpsDue: number; enquiries: number };
  verification: { pendingProjects: number; pendingLegal: number; pendingKyc: number };
  kpi: { totalRevenue: number; gmv: number; mrr: number; conversionRate: number; healthScore: number; totalUnits: number; soldUnits: number };
}

interface FinanceSummary {
  hasData: boolean;
  cashInflow: number; cashOutflow: number; netCashFlow: number;
  mtdInflow: number; mtdOutflow: number;
  receivables: number; payables: number;
  gstCollected: number; gstPaid: number; gstNet: number; tdsWithheld: number;
  bankBalance: number; grossProfit: number; netProfit: number;
  burnRate: number; runwayMonths: number | null;
  totalLoanOutstanding: number; monthlyEmi: number; activeLoanCount: number;
  upcomingPayments: { kind: string; label: string; party: string | null; amount: number; dueDate: string }[];
  accounts: { id: string; name: string; balance: number }[];
  entryCount: number;
}

/* -------------------------------------------------------------- ui helpers */
type Health = "good" | "warn" | "crit";
const dot: Record<Health, string> = {
  good: "bg-emerald-400 shadow-[0_0_10px] shadow-emerald-400/50",
  warn: "bg-amber-400 shadow-[0_0_10px] shadow-amber-400/50",
  crit: "bg-red-400 shadow-[0_0_10px] shadow-red-400/50",
};
const scoreHealth = (s: number): Health => (s >= 70 ? "good" : s >= 40 ? "warn" : "crit");

function Stat({ label, value, sub, health }: { label: string; value: string; sub?: string; health?: Health }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-wide text-white/50">{label}</p>
        {health && <span className={`h-2 w-2 shrink-0 rounded-full ${dot[health]}`} />}
      </div>
      <p className="mt-2 text-2xl font-semibold leading-tight text-white">{value}</p>
      {sub && <p className="mt-1 text-xs text-white/40">{sub}</p>}
    </div>
  );
}

function Section({
  id, n, title, health, defaultOpen, children, subtitle,
}: {
  id: string; n: string; title: string; health?: Health; defaultOpen?: boolean;
  subtitle?: string; children: React.ReactNode;
}) {
  return (
    <details id={id} open={defaultOpen} className="group scroll-mt-24 rounded-3xl border border-white/10 bg-white/[0.03] backdrop-blur">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
        {health && <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dot[health]}`} />}
        <span className="text-xs font-mono text-white/40">{n}</span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold text-white">{title}</h2>
          {subtitle && <p className="truncate text-xs text-white/40">{subtitle}</p>}
        </div>
        <a
          href={`#${id}`}
          onClick={(e) => e.stopPropagation()}
          className="hidden text-white/30 hover:text-white/70 sm:block"
          title="Deep link"
        >#</a>
        <span className="text-white/40 transition group-open:rotate-180">▾</span>
      </summary>
      <div className="border-t border-white/10 px-5 py-5">{children}</div>
    </details>
  );
}

function Untracked({ what, connect }: { what: string; connect: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-5">
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-white/30" />
        <p className="text-sm font-medium text-white/70">Not yet tracked</p>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-white/45">
        {what} No data source is connected yet, so — per Truvi&apos;s strict data-integrity rule — this
        section shows no numbers rather than fabricated ones.
      </p>
      <p className="mt-2 text-xs text-white/40">
        <span className="font-medium text-white/60">To activate:</span> {connect}
      </p>
    </div>
  );
}

function Bar({ label, value, max, tint = "bg-violet-400" }: { label: string; value: number; max: number; tint?: string }) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="truncate text-white/70">{label}</span>
        <span className="ml-2 shrink-0 font-medium text-white/90">{value.toLocaleString("en-IN")}</span>
      </div>
      <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-white/10">
        <div className={`h-full rounded-full ${tint}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- page */
export default function FounderDashboardPage() {
  const [d, setD] = useState<Overview | null>(null);
  const [fin, setFin] = useState<FinanceSummary | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const [ov, fs] = await Promise.all([
        api.get("/admin/founder-overview"),
        api.get("/finance/summary"),
      ]);
      setD(ov.data);
      setFin(fs.data);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to load founder dashboard");
    } finally {
      setLoading(false);
    }
  }
  async function reloadFinance() {
    try { setFin((await api.get("/finance/summary")).data); } catch { /* keep last */ }
  }
  useEffect(() => { load(); }, []);
  // Real-time: any finance write (from any admin) refreshes the money numbers.
  useSocketEvent("finance:update", reloadFinance);

  if (loading) return <div className="min-h-screen p-10 text-white">Loading founder command center…</div>;
  if (!d) return <div className="min-h-screen p-10 text-white">Could not load the dashboard. Please retry.</div>;

  const ex = d.executive;
  const ch = d.companyHealth;
  const maxFunnel = Math.max(1, ...d.sales.funnel.map((f) => f.count));
  const maxRev = Math.max(1, ...d.sales.revenueByProject.map((r) => r.value));
  const chHealth = scoreHealth(ch.healthScore);

  return (
    <main className="min-h-screen p-4 text-white md:p-8">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-violet-300/70">Truvi · CEO Operating System</p>
          <h1 className="mt-1 text-2xl font-semibold md:text-3xl">Founder Dashboard</h1>
          <p className="mt-1 text-xs text-white/40">
            Live as of {new Date(d.generatedAt).toLocaleString("en-IN")} · every number is real platform data
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={load} className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-white/70 hover:bg-white/10">Refresh</button>
          <NotificationBell />
          <UserMenu />
        </div>
      </div>

      {/* Executive strip */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        <Stat label="Total Revenue" value={formatCompactINR(ex.totalRevenue)} />
        <Stat label="Total GMV" value={formatCompactINR(ex.gmv)} />
        <Stat label="Developers" value={String(ex.totalDevelopers)} />
        <Stat label="Channel Partners" value={String(ex.totalCPs)} />
        <Stat label="Buyers" value={String(ex.totalBuyers)} />
        <Stat label="Active Listings" value={String(ex.activeListings)} />
        <Stat label="Today's Bookings" value={String(ex.todaysBookings)} />
        <Stat label="Pending Actions" value={String(ex.pendingActions)} health={ex.pendingActions > 0 ? "warn" : "good"} />
      </div>

      {/* Quick nav */}
      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        {[
          ["health", "Health"], ["sales", "Sales"], ["projects", "Projects"], ["finance", "Finance"],
          ["legal", "Legal"], ["crm", "CRM"], ["team", "Team"], ["marketing", "Marketing"],
          ["ai-insights", "AI Insights"], ["land", "Land Bank"], ["investor", "Investor"],
          ["command", "Command Center"], ["kpi", "KPIs"], ["copilot", "AI Copilot"],
        ].map(([id, label]) => (
          <a key={id} href={`#${id}`} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-white/60 hover:bg-white/10 hover:text-white">{label}</a>
        ))}
      </div>

      <div className="mt-6 space-y-4">
        {/* 3.1 Company Health */}
        <Section id="health" n="3.1" title="Company Health" health={chHealth} defaultOpen
          subtitle={`Health score ${ch.healthScore}/100`}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <Stat label="Revenue Today" value={formatINR(ch.revenueToday)} />
            <Stat label="Revenue MTD" value={formatINR(ch.revenueMTD)} />
            <Stat label="Revenue YTD" value={formatINR(ch.revenueYTD)} />
            <Stat label="MRR" value={formatINR(ch.mrr)} />
            <Stat label="Active Projects" value={String(ch.activeProjects)} />
            <Stat label="Health Score" value={`${ch.healthScore}/100`} health={chHealth} />
          </div>
          {fin?.hasData ? (
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              <Stat label="Cash in Bank" value={formatINR(fin.bankBalance)} />
              <Stat label="Gross Profit" value={formatINR(fin.grossProfit)} health={fin.grossProfit >= 0 ? "good" : "crit"} />
              <Stat label="Net Profit" value={formatINR(fin.netProfit)} health={fin.netProfit >= 0 ? "good" : "crit"} />
              <Stat label="Burn Rate / mo" value={formatINR(fin.burnRate)} />
              <Stat label="Runway" value={fin.runwayMonths === null ? "∞" : `${fin.runwayMonths} mo`}
                health={fin.runwayMonths === null ? "good" : fin.runwayMonths >= 12 ? "good" : fin.runwayMonths >= 6 ? "warn" : "crit"} />
            </div>
          ) : (
            <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.02] p-4 text-xs text-white/45">
              <span className="font-medium text-white/60">Gross / Net profit, Cash in Bank, Burn Rate &amp; Runway</span> populate from the
              live finance ledger. <Link to="/admin/finance" className="text-violet-300 underline">Add finance entries</Link> to activate them.
            </div>
          )}
        </Section>

        {/* 3.2 Sales */}
        <Section id="sales" n="3.2" title="Sales Dashboard" health={d.sales.conversionRate >= 5 ? "good" : d.sales.bookings > 0 ? "warn" : "crit"}
          subtitle={`${d.sales.conversionRate}% conversion · ${d.sales.bookings} bookings`}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="Leads Today" value={String(d.sales.leadsToday)} />
            <Stat label="Qualified" value={String(d.sales.qualifiedLeads)} />
            <Stat label="Site Visits" value={String(d.sales.siteVisits)} />
            <Stat label="Bookings" value={String(d.sales.bookings)} />
            <Stat label="Registrations" value={String(d.sales.registrations)} />
            <Stat label="Conversion" value={`${d.sales.conversionRate}%`} />
          </div>
          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-white/50">Sales Funnel</p>
              <div className="space-y-2.5">
                {d.sales.funnel.map((f) => <Bar key={f.stage} label={f.stage} value={f.count} max={maxFunnel} />)}
              </div>
            </div>
            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-white/50">Revenue by Project (GMV)</p>
              {d.sales.revenueByProject.length === 0
                ? <p className="text-xs text-white/40">No bookings recorded yet.</p>
                : <div className="space-y-2.5">
                    {d.sales.revenueByProject.map((r) => (
                      <div key={r.project}>
                        <div className="flex items-center justify-between text-xs">
                          <span className="truncate text-white/70">{r.project}</span>
                          <span className="ml-2 shrink-0 font-medium text-white/90">{formatCompactINR(r.value)}</span>
                        </div>
                        <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-white/10">
                          <div className="h-full rounded-full bg-cyan-400" style={{ width: `${Math.max(2, Math.round((r.value / maxRev) * 100))}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>}
            </div>
          </div>
        </Section>

        {/* 3.3 Project */}
        <Section id="projects" n="3.3" title="Project Dashboard" health={d.projects.pending > 0 ? "warn" : "good"}
          subtitle={`${d.projects.verified}/${d.projects.approved} verified · ${d.projects.pending} pending`}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Total Projects" value={String(d.projects.total)} />
            <Stat label="Approved / Live" value={String(d.projects.approved)} />
            <Stat label="Verified" value={String(d.projects.verified)} health={d.projects.verified === d.projects.approved ? "good" : "warn"} />
            <Stat label="Pending Approval" value={String(d.projects.pending)} health={d.projects.pending > 0 ? "warn" : "good"} />
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-xs">
              <thead className="text-white/40">
                <tr className="border-b border-white/10">
                  <th className="py-2 pr-3 font-medium">Project</th><th className="py-2 pr-3 font-medium">City</th>
                  <th className="py-2 pr-3 font-medium">Approval</th><th className="py-2 pr-3 font-medium">Verified</th>
                  <th className="py-2 font-medium">Tier</th>
                </tr>
              </thead>
              <tbody>
                {d.projects.rows.map((p) => (
                  <tr key={p.id} className="border-b border-white/5">
                    <td className="py-2 pr-3 text-white/80">{p.name}</td>
                    <td className="py-2 pr-3 text-white/60">{p.city}</td>
                    <td className="py-2 pr-3">
                      <span className={p.approvalStatus === "APPROVED" ? "text-emerald-300" : p.approvalStatus === "PENDING" ? "text-amber-300" : "text-red-300"}>{p.approvalStatus}</span>
                    </td>
                    <td className="py-2 pr-3">{p.verified ? <span className="text-emerald-300">Yes</span> : <span className="text-white/40">No</span>}</td>
                    <td className="py-2 text-white/60">{p.listingTier}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-white/40">
            Construction %, Budget vs Actual, Delay alerts &amp; Milestones need a project-execution tracker (not yet connected).
          </p>
        </Section>

        {/* 3.4 Finance */}
        <Section id="finance" n="3.4" title="Finance Dashboard"
          health={!fin?.hasData ? undefined : fin.payables > fin.bankBalance ? "warn" : "good"}
          subtitle={fin?.hasData ? `${formatCompactINR(fin.netCashFlow)} net cash flow` : "Add entries to activate"}>
          {!fin?.hasData ? (
            <div className="space-y-3">
              <Untracked
                what="Cash flow, receivables, payables, GST, TDS, bank balance, upcoming payments and EMI/loan status are now driven by the live finance ledger — it just has no entries yet."
                connect="Open the Finance workspace and add your first bank account, entry or loan — every number here updates in real time."
              />
              <Link to="/admin/finance" className="inline-block rounded-full bg-violet-500 px-5 py-2 text-sm font-medium text-white hover:bg-violet-400">Open Finance workspace →</Link>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                <Stat label="Cash Inflow" value={formatINR(fin.cashInflow)} health="good" />
                <Stat label="Cash Outflow" value={formatINR(fin.cashOutflow)} />
                <Stat label="Net Cash Flow" value={formatINR(fin.netCashFlow)} health={fin.netCashFlow >= 0 ? "good" : "crit"} />
                <Stat label="Bank Balance" value={formatINR(fin.bankBalance)} />
                <Stat label="Receivables" value={formatINR(fin.receivables)} health={fin.receivables > 0 ? "warn" : "good"} />
                <Stat label="Payables" value={formatINR(fin.payables)} health={fin.payables > 0 ? "warn" : "good"} />
                <Stat label="GST (net payable)" value={formatINR(fin.gstNet)} />
                <Stat label="TDS Withheld" value={formatINR(fin.tdsWithheld)} />
                <Stat label="Loan Outstanding" value={formatINR(fin.totalLoanOutstanding)} sub={`${fin.activeLoanCount} active`} />
                <Stat label="Monthly EMI" value={formatINR(fin.monthlyEmi)} />
                <Stat label="Burn Rate / mo" value={formatINR(fin.burnRate)} />
                <Stat label="Runway" value={fin.runwayMonths === null ? "∞" : `${fin.runwayMonths} mo`}
                  health={fin.runwayMonths === null ? "good" : fin.runwayMonths >= 12 ? "good" : fin.runwayMonths >= 6 ? "warn" : "crit"} />
              </div>
              <div className="mt-5">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-white/50">Upcoming payments</p>
                  <Link to="/admin/finance" className="text-xs text-violet-300 hover:underline">Manage →</Link>
                </div>
                {fin.upcomingPayments.length === 0 ? (
                  <p className="text-xs text-white/40">No scheduled payables or EMIs.</p>
                ) : (
                  <div className="space-y-1.5">
                    {fin.upcomingPayments.map((u, i) => (
                      <div key={i} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs">
                        <div className="min-w-0">
                          <span className="mr-2 rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-white/60">{u.kind}</span>
                          <span className="text-white/80">{u.label}</span>
                        </div>
                        <div className="shrink-0 text-right">
                          <span className="font-medium text-white/90">{formatINR(u.amount)}</span>
                          <span className="ml-2 text-white/40">{new Date(u.dueDate).toLocaleDateString("en-IN")}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </Section>

        {/* 3.5 Legal & Compliance */}
        <Section id="legal" n="3.5" title="Legal &amp; Compliance" health={d.verification.pendingLegal > 0 ? "warn" : "good"}
          subtitle={`${d.verification.pendingLegal} legal docs pending verification`}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label="Legal Docs Pending" value={String(d.verification.pendingLegal)} health={d.verification.pendingLegal > 0 ? "warn" : "good"} />
            <Stat label="Verified Projects (RERA/Title)" value={String(d.projects.verified)} />
          </div>
          <div className="mt-4">
            <Untracked
              what="Company ROC filings, GST returns, court cases and agreement-expiry alerts need a compliance register."
              connect="Add a compliance/agreements table (filing type, due date, status) — the project-level RERA/legal verification above is already live from the verification engine."
            />
          </div>
        </Section>

        {/* 3.6 CRM */}
        <Section id="crm" n="3.6" title="CRM Dashboard" health={d.crm.followUpsDue > 0 ? "warn" : "good"}
          subtitle={`${d.crm.followUpsDue} follow-ups due · ${d.crm.enquiries} enquiries`}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="New Customers (30d)" value={String(d.crm.newCustomers)} />
            <Stat label="Active Customers" value={String(d.crm.activeCustomers)} />
            <Stat label="Follow-ups Due" value={String(d.crm.followUpsDue)} health={d.crm.followUpsDue > 0 ? "warn" : "good"} />
            <Stat label="Open Enquiries" value={String(d.crm.enquiries)} />
          </div>
          <p className="mt-3 text-xs text-white/40">
            Complaints, CSAT &amp; referral-rate need a support-ticketing module (see roadmap) — customer &amp; follow-up numbers above are live.
          </p>
        </Section>

        {/* 3.7 Team */}
        <Section id="team" n="3.7" title="Team Dashboard">
          <Untracked
            what="Employees, attendance, productivity, tasks pending, hiring status and performance ranking require an HR module."
            connect="Add an employees/attendance schema (or connect an HRMS) to populate headcount, attendance and productivity."
          />
        </Section>

        {/* 3.8 Marketing */}
        <Section id="marketing" n="3.8" title="Marketing Dashboard">
          <Untracked
            what="Website traffic, social growth, ad spend, cost-per-lead, ROI and campaign performance require analytics + ad-platform integrations."
            connect="Connect web analytics (GA4) and ad accounts (Meta/Google Ads), or add a campaigns table with spend + attribution."
          />
        </Section>

        {/* 3.9 AI Insights */}
        <AIInsights d={d} />

        {/* 3.10 Land Bank */}
        <Section id="land" n="3.10" title="Land Bank (Truvi Special)">
          <Untracked
            what="Total land (acres/bigha), verified land, acquisition pipeline, land value, pending due-diligence and high-priority opportunities need a land-bank register."
            connect="Add a land-parcels table (area, ownership, DD status, valuation). Note: Truvi is a marketplace and does not own land — this tracks acquisition pipeline only."
          />
        </Section>

        {/* 3.11 Investor */}
        <Section id="investor" n="3.11" title="Investor Dashboard">
          <Untracked
            what="Company valuation, fundraising progress, investor updates, cap table and ESOP pool are founder-confidential and need a captable source."
            connect="Add a captable/fundraise schema (or connect a cap-table tool). Live KPIs that drive valuation — revenue, GMV, MRR, users — are already in the KPI section."
          />
        </Section>

        {/* 3.12 Command Center */}
        <Section id="command" n="3.12" title="Founder Command Center" health={ex.pendingActions > 0 ? "warn" : "good"} defaultOpen
          subtitle={`${ex.pendingActions} pending action${ex.pendingActions === 1 ? "" : "s"}`}>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-white/50">Top priorities (from live queues)</p>
          <ul className="space-y-2 text-sm">
            {[
              d.verification.pendingProjects > 0 && { t: `Approve / verify ${d.verification.pendingProjects} pending project${d.verification.pendingProjects === 1 ? "" : "s"}`, to: "/admin/listings" },
              d.verification.pendingKyc > 0 && { t: `Review ${d.verification.pendingKyc} CP KYC submission${d.verification.pendingKyc === 1 ? "" : "s"}`, to: "/admin/kyc" },
              d.verification.pendingLegal > 0 && { t: `Verify ${d.verification.pendingLegal} legal document${d.verification.pendingLegal === 1 ? "" : "s"}`, to: "/admin/verification" },
              d.crm.enquiries > 0 && { t: `Respond to ${d.crm.enquiries} open enquir${d.crm.enquiries === 1 ? "y" : "ies"}`, to: "/admin/enquiries" },
              d.crm.followUpsDue > 0 && { t: `${d.crm.followUpsDue} CP follow-up${d.crm.followUpsDue === 1 ? "" : "s"} overdue`, to: "/admin/dashboard" },
            ].filter(Boolean).slice(0, 5).map((item: any, i) => (
              <li key={i}>
                <Link to={item.to} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 hover:bg-white/10">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-500/20 text-xs text-violet-200">{i + 1}</span>
                  <span className="flex-1 text-white/85">{item.t}</span>
                  <span className="text-white/30">→</span>
                </Link>
              </li>
            ))}
            {ex.pendingActions === 0 && <li className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/50">🟢 All clear — no pending approvals, KYC, legal or enquiries.</li>}
          </ul>
          <p className="mt-3 text-xs text-white/40">
            Meetings, documents awaiting e-signature &amp; emergency alerts need calendar / e-sign integrations (not yet connected).
          </p>
        </Section>

        {/* 3.13 KPI */}
        <Section id="kpi" n="3.13" title="KPI Section" health={scoreHealth(d.kpi.healthScore)}
          subtitle="Live valuation-driving metrics">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <Stat label="Total Revenue" value={formatCompactINR(d.kpi.totalRevenue)} />
            <Stat label="GMV" value={formatCompactINR(d.kpi.gmv)} />
            <Stat label="MRR" value={formatINR(d.kpi.mrr)} />
            <Stat label="Conversion Rate" value={`${d.kpi.conversionRate}%`} />
            <Stat label="Total Units" value={String(d.kpi.totalUnits)} />
            <Stat label="Sold Units" value={String(d.kpi.soldUnits)} />
            <Stat label="Health Score" value={`${d.kpi.healthScore}/100`} health={scoreHealth(d.kpi.healthScore)} />
          </div>
          <p className="mt-3 text-xs text-white/40">
            Revenue targets, collections %, project-completion % &amp; NPS activate once finance and NPS survey sources are connected.
          </p>
        </Section>

        {/* 3.14 AI Copilot */}
        <AICopilot />
      </div>

      <p className="mt-8 text-center text-xs text-white/30">
        Truvi CEO Operating System · Phase 1 · Founder-only sections gate to real data — no fabricated numbers anywhere.
      </p>
    </main>
  );
}

/* ---------------------------------------------------------- 3.9 AI Insights */
function AIInsights({ d }: { d: Overview }) {
  // Heuristic insights derived from REAL data (clearly labelled — not an ML model).
  const risks: string[] = [];
  if (d.verification.pendingProjects > 0) risks.push(`${d.verification.pendingProjects} project(s) awaiting verification — unverified listings erode buyer trust.`);
  if (d.sales.conversionRate < 5 && d.projects.approved > 0) risks.push(`Lead→booking conversion is ${d.sales.conversionRate}% — pipeline is leaking before booking.`);
  if (d.crm.followUpsDue > 0) risks.push(`${d.crm.followUpsDue} CP follow-up(s) overdue — hot leads may go cold.`);
  const opps: string[] = [];
  const topProj = d.sales.revenueByProject[0];
  if (topProj) opps.push(`${topProj.project} is the top GMV driver (${formatCompactINR(topProj.value)}) — consider featuring it.`);
  if (d.companyHealth.mrr > 0) opps.push(`${formatINR(d.companyHealth.mrr)} recurring MRR — subscription upsell is working; expand CP-Pro.`);
  if (d.crm.newCustomers > 0) opps.push(`${d.crm.newCustomers} new buyers in 30 days — nurture them toward site visits.`);

  // Arithmetic run-rate projection (NOT a forecast model).
  const day = new Date().getDate();
  const runRateMonth = day > 0 ? Math.round((d.companyHealth.revenueMTD / day) * 30) : 0;

  return (
    <Section id="ai-insights" n="3.9" title="AI Insights" health={risks.length > 1 ? "warn" : "good"}
      subtitle="Signals derived from live data">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-red-400/20 bg-red-400/[0.04] p-4">
          <p className="text-sm font-semibold text-red-200">🔴 Biggest risks today</p>
          <ul className="mt-2 space-y-1.5 text-xs text-white/70">
            {risks.length ? risks.map((r, i) => <li key={i}>• {r}</li>) : <li>No material risk signals in the current data.</li>}
          </ul>
        </div>
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.04] p-4">
          <p className="text-sm font-semibold text-emerald-200">📈 Biggest opportunities</p>
          <ul className="mt-2 space-y-1.5 text-xs text-white/70">
            {opps.length ? opps.map((o, i) => <li key={i}>• {o}</li>) : <li>Add bookings &amp; subscriptions to surface opportunities.</li>}
          </ul>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Revenue run-rate (this mo.)" value={formatCompactINR(runRateMonth)} sub="Linear projection, not ML" />
        <Stat label="MRR" value={formatINR(d.companyHealth.mrr)} />
        <Stat label="Health Score" value={`${d.companyHealth.healthScore}/100`} health={scoreHealth(d.companyHealth.healthScore)} />
      </div>
      <p className="mt-3 text-xs text-white/40">
        Full revenue/cash <span className="text-white/60">forecast models</span> and the automated <span className="text-white/60">Daily Founder Brief</span> run
        through the AI Copilot below once an ML forecast model is plugged in. The insights above are transparent heuristics over real data.
      </p>
    </Section>
  );
}

/* --------------------------------------------------------- 3.14 AI Copilot */
function AICopilot() {
  const suggestions = [
    "Is month profit kitna hua?",
    "Lucknow project ki sales batao.",
    "Cash flow risk hai?",
    "Kaunsa project slow chal raha hai?",
    "Agle 90 din ki prediction dikhao.",
  ];
  const [msgs, setMsgs] = useState<{ role: "you" | "ai"; text: string }[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const sessionRef = useRef<string | undefined>(undefined);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  async function ask(q: string) {
    const question = q.trim();
    if (!question || busy) return;
    setInput("");
    setMsgs((m) => [...m, { role: "you", text: question }]);
    setBusy(true);
    try {
      const res = await api.post("/ask", { question, sessionId: sessionRef.current });
      sessionRef.current = res.data.sessionId || sessionRef.current;
      setMsgs((m) => [...m, { role: "ai", text: res.data.answer || "No answer returned." }]);
    } catch (err: any) {
      setMsgs((m) => [...m, { role: "ai", text: err?.response?.data?.error || "AI request failed." }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section id="copilot" n="3.14" title="AI Copilot (Chat Assistant)" health="good"
      subtitle="Hinglish supported · source-backed answers">
      {msgs.length === 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <button key={s} onClick={() => ask(s)} className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/70 hover:bg-white/10">{s}</button>
          ))}
        </div>
      )}
      {msgs.length > 0 && (
        <div className="mb-3 max-h-72 space-y-2 overflow-y-auto rounded-2xl border border-white/10 bg-black/20 p-3">
          {msgs.map((m, i) => (
            <div key={i} className={m.role === "you" ? "text-right" : "text-left"}>
              <span className={`inline-block max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-xs ${m.role === "you" ? "bg-violet-500/25 text-white" : "bg-white/10 text-white/85"}`}>{m.text}</span>
            </div>
          ))}
          {busy && <p className="text-xs text-white/40">Truvi AI is thinking…</p>}
          <div ref={endRef} />
        </div>
      )}
      <form onSubmit={(e) => { e.preventDefault(); ask(input); }} className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about revenue, sales, projects, verification…"
          className="flex-1 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white placeholder:text-white/30 focus:border-violet-400/50 focus:outline-none"
        />
        <button disabled={busy} className="rounded-full bg-violet-500 px-5 py-2 text-sm font-medium text-white disabled:opacity-50 hover:bg-violet-400">Ask</button>
      </form>
      <p className="mt-2 text-xs text-white/35">Answers are source-backed by Truvi&apos;s verified data. Not legal or financial advice.</p>
    </Section>
  );
}
