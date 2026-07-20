import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { formatCompactINR, formatINR } from "@/lib/utils";
import { useSocketEvent } from "@/lib/socket";
import { toast } from "sonner";
import "@/styles/founder-os.css";

/* ------------------------------------------------------------------ types */
export interface Overview {
  generatedAt: string;
  executive: { totalRevenue: number; gmv: number; totalDevelopers: number; totalCPs: number; totalBuyers: number; activeListings: number; todaysBookings: number; pendingActions: number };
  companyHealth: { revenueToday: number; revenueMTD: number; revenueYTD: number; activeProjects: number; healthScore: number; mrr: number };
  sales: { leadsToday: number; qualifiedLeads: number; siteVisits: number; bookings: number; agreements: number; registrations: number; conversionRate: number; funnel: { stage: string; count: number }[]; revenueByProject: { project: string; value: number }[] };
  projects: { total: number; approved: number; verified: number; pending: number; rows: { id: string; name: string; city: string; approvalStatus: string; verified: boolean; listingTier: string }[] };
  crm: { newCustomers: number; activeCustomers: number; followUpsDue: number; enquiries: number };
  verification: { pendingProjects: number; pendingLegal: number; pendingKyc: number };
  kpi: { totalRevenue: number; gmv: number; mrr: number; conversionRate: number; healthScore: number; totalUnits: number; soldUnits: number };
}
export interface FinanceSummary {
  hasData: boolean; cashInflow: number; cashOutflow: number; netCashFlow: number; receivables: number; payables: number;
  gstCollected: number; gstPaid: number; gstNet: number; tdsWithheld: number; bankBalance: number; grossProfit: number; netProfit: number;
  burnRate: number; runwayMonths: number | null; totalLoanOutstanding: number; monthlyEmi: number; activeLoanCount: number;
  upcomingPayments: { kind: string; label: string; party: string | null; amount: number; dueDate: string }[]; entryCount: number;
}

/* --------------------------------------------------------------- icons */
const P = (d: string) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>;
const ICONS: Record<string, string> = {
  grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  chart: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  building: "M3 21h18M6 21V5a2 2 0 012-2h8a2 2 0 012 2v16M9 9h1M14 9h1M9 13h1M14 13h1",
  users: "M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8M23 21v-2a4 4 0 00-3-3.87",
  wallet: "M20 12V8H6a2 2 0 010-4h12v4M4 6v12a2 2 0 002 2h14v-4M18 12a2 2 0 000 4h4v-4z",
  shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  target: "M12 22a10 10 0 100-20 10 10 0 000 20zM12 18a6 6 0 100-12 6 6 0 000 12zM12 14a2 2 0 100-4 2 2 0 000 4z",
  spark: "M12 3v3M12 18v3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M3 12h3M18 12h3M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1",
  team: "M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8",
  mega: "M3 11l18-5v12L3 14v-3zM11.6 16.8a3 3 0 11-5.8-1.6",
  land: "M3 20h18L14 4l-4 8-3-3-4 11z",
  trophy: "M8 21h8M12 17v4M7 4h10v4a5 5 0 01-10 0V4zM5 8a2 2 0 01-2-2V5h2M19 8a2 2 0 002-2V5h-2",
  bell: "M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0",
  refresh: "M4 4v6h6M20 20v-6h-6M4 10a8 8 0 0114.6-4.4M20 14a8 8 0 01-14.6 4.4",
  search: "M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.3-4.3",
  logout: "M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9",
  sun: "M12 17a5 5 0 100-10 5 5 0 000 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4",
  send: "M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z",
  bolt: "M13 2L3 14h9l-1 8 10-12h-9l1-8z",
  arrow: "M5 12h14M13 6l6 6-6 6",
  book: "M4 19.5A2.5 2.5 0 016.5 17H20M4 19.5A2.5 2.5 0 006.5 22H20V2H6.5A2.5 2.5 0 004 4.5v15z",
};
export const Ic = ({ n }: { n: string }) => P(ICONS[n] || ICONS.grid);

/* --------------------------------------------------------------- helpers */
type Tone = "blue" | "green" | "amber" | "red";
export function Kpi({ icon, tone, label, value, foot, trend, onClick }: { icon: string; tone: Tone; label: string; value: string; foot?: string; trend?: { text: string; up?: boolean }; onClick?: () => void }) {
  return (
    <div
      className={`card kpi-card${onClick ? " kpi-clickable" : ""}`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } } : undefined}
    >
      <div className="kpi-top">
        <div className={`kpi-icon ${tone}`}><Ic n={icon} /></div>
        {trend && <div className={`kpi-trend ${trend.up ? "up" : "flat"}`}>{trend.text}</div>}
        {onClick && <div className="kpi-open"><Ic n="arrow" /></div>}
      </div>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {foot && <div className="kpi-foot">{foot}</div>}
    </div>
  );
}
export function Panel({ title, sub, action, children }: { title: string; sub?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="card panel">
      <div className="panel-head">
        <div><div className="panel-title">{title}</div>{sub && <div className="panel-sub">{sub}</div>}</div>
        {action}
      </div>
      {children}
    </div>
  );
}
const initials = (s: string) => s.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

/* =============================================================== the shell */
export type Page = "overview" | "sales" | "projects" | "crm" | "finance" | "verification" | "kpi" | "insights" | "team" | "marketing" | "land" | "investor";

interface NavItem { key: Page; label: string; icon: string; count?: number }
interface NavGroup { group: string; items: NavItem[] }

export interface DashboardOSConfig {
  /** Short badge shown under the brand mark, e.g. "CEO OS" or "Admin OS". */
  brandSub: string;
  /** Role name shown next to the avatar in the top bar. */
  roleLabel: string;
  /** Fallback display name if the signed-in user has none. */
  fallbackName: string;
  /** Title/subtitle for the landing overview page. */
  overviewTitle: string;
  overviewSub: string;
  /** Whether the AI Copilot chat FAB is mounted (Founder-only per RBAC). */
  showCopilot: boolean;
  /** Build the sidebar navigation from live data. Only listed pages are reachable. */
  buildNav: (d: Overview) => NavGroup[];
}

export default function DashboardOS({ config }: { config: DashboardOSConfig }) {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const [d, setD] = useState<Overview | null>(null);
  const [fin, setFin] = useState<FinanceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState<Page>("overview");
  const [light, setLight] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [copilotOpen, setCopilotOpen] = useState(false);

  async function load() {
    try {
      const [ov, fs] = await Promise.all([api.get("/admin/founder-overview"), api.get("/finance/summary")]);
      setD(ov.data); setFin(fs.data);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to load dashboard");
    } finally { setLoading(false); }
  }
  async function reloadFinance() { try { setFin((await api.get("/finance/summary")).data); } catch { /* keep */ } }
  useEffect(() => { load(); }, []);
  useSocketEvent("finance:update", reloadFinance);

  function go(p: Page) { setPage(p); setNavOpen(false); }
  function doLogout() { clearAuth(); navigate("/login"); }

  if (loading) return <div className="founder-os" style={{ padding: 40 }}><p style={{ color: "var(--ink-500)" }}>Loading command center…</p></div>;
  if (!d) return <div className="founder-os" style={{ padding: 40 }}><p>Could not load the dashboard. Please retry.</p></div>;

  const nav = config.buildNav(d);
  const reachable = new Set(nav.flatMap((g) => g.items.map((i) => i.key)));
  const current: Page = reachable.has(page) ? page : "overview";

  return (
    <div className={`founder-os ${light ? "light" : ""}`}>
      <div className={`os-overlay ${navOpen ? "show" : ""}`} onClick={() => setNavOpen(false)} />

      {/* Sidebar */}
      <aside className={`sidebar ${navOpen ? "open" : ""}`}>
        <div className="brand">
          <div className="brand-mark">T</div>
          <div>
            <div className="brand-text">Truvi</div>
            <div className="brand-sub">{config.brandSub}</div>
          </div>
        </div>
        <nav className="nav-scroll">
          {nav.map((g) => (
            <div key={g.group}>
              <div className="nav-group-label">{g.group}</div>
              {g.items.map((it) => (
                <button key={it.key} className={`nav-item ${current === it.key ? "active" : ""}`} onClick={() => go(it.key)}>
                  <Ic n={it.icon} />
                  <span>{it.label}</span>
                  {it.count ? <span className="count">{it.count}</span> : null}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-foot">
          <button className="logout-btn" onClick={doLogout}><Ic n="logout" /> Sign out</button>
        </div>
      </aside>

      {/* Main */}
      <div className="os-main">
        <header className="topbar">
          <button className="menu-toggle" onClick={() => setNavOpen(true)}><Ic n="grid" /></button>
          <div className="search-wrap"><Ic n="search" /><input placeholder="Search projects, CPs, leads…" /></div>
          <div className="top-actions">
            <button className="theme-toggle" onClick={() => setLight((v) => !v)} aria-label="Toggle theme">
              <span className="knob"><Ic n="sun" /></span>
            </button>
            <button className="icon-btn" onClick={load} title="Refresh"><Ic n="refresh" /></button>
            <button className="icon-btn" title="Notifications"><Ic n="bell" /></button>
            <div className="divider-v" />
            <button className="profile-btn">
              <div className="avatar">{initials(user?.name || config.fallbackName)}</div>
              <div><div className="profile-name">{user?.name || config.fallbackName}</div><div className="profile-role">{config.roleLabel}</div></div>
            </button>
          </div>
        </header>

        <div className="content">
          {current === "overview" && <OverviewPage d={d} go={go} title={config.overviewTitle} sub={config.overviewSub} />}
          {current === "sales" && <SalesPage d={d} />}
          {current === "projects" && <ProjectsPage d={d} navigate={navigate} />}
          {current === "crm" && <CrmPage d={d} />}
          {current === "finance" && <FinancePage fin={fin} navigate={navigate} />}
          {current === "verification" && <VerificationPage d={d} navigate={navigate} />}
          {current === "kpi" && <KpiPage d={d} fin={fin} />}
          {current === "insights" && <InsightsPage d={d} fin={fin} />}
          {current === "team" && <Placeholder title="Team Dashboard" what="Employees, attendance, productivity, hiring and performance ranking need an HR module." connect="Add an employees/attendance schema or connect an HRMS." />}
          {current === "marketing" && <Placeholder title="Marketing Dashboard" what="Website traffic, social growth, ad spend, cost-per-lead and campaign ROI need analytics + ad-platform integrations." connect="Connect GA4 and Meta/Google Ads, or add a campaigns table." />}
          {current === "land" && <Placeholder title="Land Bank" what="Total land, verified land, acquisition pipeline, valuation and due-diligence need a land-parcel register." connect="Add a land-parcels table (area, ownership, DD status, valuation)." />}
          {current === "investor" && <Placeholder title="Investor Dashboard" what="Valuation, fundraising, cap table and ESOP pool are founder-confidential and need a cap-table source." connect="Add a cap-table/fundraise schema. Valuation-driving KPIs are already live under KPIs." />}
        </div>
      </div>

      {/* AI Copilot — Founder-only per RBAC */}
      {config.showCopilot && <Copilot open={copilotOpen} setOpen={setCopilotOpen} />}
    </div>
  );
}

/* ================================================================ pages */
function HealthRing({ score }: { score: number }) {
  const C = 251; // 2πr, r=40
  const off = C - (Math.min(Math.max(score, 0), 100) / 100) * C;
  const label = score >= 70 ? "Healthy" : score >= 40 ? "Watch" : "Critical";
  return (
    <div className="ring">
      <svg width="96" height="96" viewBox="0 0 96 96">
        <circle className="ring-track" cx="48" cy="48" r="40" />
        <circle className="ring-fill" cx="48" cy="48" r="40" stroke="url(#osGrad)" strokeDasharray={C} strokeDashoffset={off} />
        <defs><linearGradient id="osGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#7C5CFF" /><stop offset="100%" stopColor="#A855F7" /></linearGradient></defs>
      </svg>
      <div className="ring-num"><b>{score}</b><span>{label}</span></div>
    </div>
  );
}

function OverviewPage({ d, go, title, sub }: { d: Overview; go: (p: Page) => void; title: string; sub: string }) {
  const ex = d.executive;
  return (
    <section className="page">
      <div className="page-header">
        <div><div className="page-title">{title}</div><div className="page-sub">{sub}</div></div>
        <div className="header-actions"><button className="btn btn-primary" onClick={() => go("finance")}><Ic n="wallet" /> Finance</button></div>
      </div>
      <div className="kpi-grid">
        <Kpi icon="wallet" tone="blue" label="Total Revenue" value={formatCompactINR(ex.totalRevenue)} foot="Platform fee + leads + payments" />
        <Kpi icon="chart" tone="green" label="Total GMV" value={formatCompactINR(ex.gmv)} foot="Booking value routed" />
        <Kpi icon="building" tone="amber" label="Active Listings" value={String(ex.activeListings)} foot={`${d.projects.verified} verified`} />
        <Kpi icon="users" tone="blue" label="Channel Partners" value={String(ex.totalCPs)} foot={`${ex.totalDevelopers} developers · ${ex.totalBuyers} buyers`} />
        <Kpi icon="target" tone="green" label="Today's Bookings" value={String(ex.todaysBookings)} />
        <Kpi icon="bell" tone={ex.pendingActions ? "red" : "green"} label="Pending Actions" value={String(ex.pendingActions)} foot="Approvals · KYC · legal · enquiries" />
      </div>

      <div className="grid-2">
        <Panel title="Revenue" sub="Today · Month-to-date · Year-to-date">
          <div className="kpi-grid" style={{ marginBottom: 0 }}>
            <div><div className="kpi-label">Today</div><div className="kpi-value">{formatINR(d.companyHealth.revenueToday)}</div></div>
            <div><div className="kpi-label">MTD</div><div className="kpi-value">{formatINR(d.companyHealth.revenueMTD)}</div></div>
            <div><div className="kpi-label">YTD</div><div className="kpi-value">{formatINR(d.companyHealth.revenueYTD)}</div></div>
            <div><div className="kpi-label">MRR</div><div className="kpi-value">{formatINR(d.companyHealth.mrr)}</div></div>
          </div>
        </Panel>
        <Panel title="Business Health Score" sub="Composite of verified listings, conversion, activity & revenue">
          <div className="ring-wrap">
            <HealthRing score={d.companyHealth.healthScore} />
            <div style={{ flex: 1 }}>
              <Meter label="Verified listings" val={d.projects.approved ? Math.round((d.projects.verified / d.projects.approved) * 100) : 0} />
              <Meter label="Conversion" val={Math.min(d.sales.conversionRate, 100)} />
              <Meter label="Active projects" val={d.projects.total ? Math.round((d.projects.approved / d.projects.total) * 100) : 0} />
            </div>
          </div>
        </Panel>
      </div>

      <div className="grid-2">
        <Panel title="Sales Funnel" sub="Live pipeline by stage">
          <Funnel funnel={d.sales.funnel} />
        </Panel>
        <Panel title="Top Priorities" sub="From live queues">
          {priorities(d).length === 0
            ? <p style={{ fontSize: 12.5, color: "var(--ink-500)" }}>🟢 All clear — no pending approvals, KYC, legal or enquiries.</p>
            : <div>{priorities(d).map((t, i) => (
                <div className="list-row" key={i}>
                  <div className="rank">{i + 1}</div>
                  <div style={{ flex: 1, fontSize: 12.5, fontWeight: 600, color: "var(--ink-700)" }}>{t.text}</div>
                  <button className="chip" onClick={() => go(t.page)}>Open</button>
                </div>
              ))}</div>}
        </Panel>
      </div>
    </section>
  );
}

function Meter({ label, val }: { label: string; val: number }) {
  const tone = val >= 70 ? "var(--green-600)" : val >= 40 ? "var(--amber-500)" : "var(--red-500)";
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, marginBottom: 6 }}>
        <span style={{ color: "var(--ink-500)" }}>{label}</span><b style={{ color: tone }}>{val}%</b>
      </div>
      <div className="progress-bar"><div className="progress-fill" style={{ width: `${Math.max(2, val)}%` }} /></div>
    </div>
  );
}
function Funnel({ funnel }: { funnel: { stage: string; count: number }[] }) {
  const max = Math.max(1, ...funnel.map((f) => f.count));
  const grads = ["#7C5CFF", "#8B5CF6", "#A855F7", "#C026D3", "#14C79A", "#F5B33F", "#F4574A"];
  return (
    <div>
      {funnel.map((f, i) => (
        <div className="funnel-row" key={f.stage}>
          <div className="funnel-label">{f.stage}</div>
          <div className="funnel-track">
            <div className="funnel-fill" style={{ width: `${Math.max(8, Math.round((f.count / max) * 100))}%`, background: grads[i % grads.length] }}>{f.count}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
function priorities(d: Overview): { text: string; page: Page }[] {
  const out: { text: string; page: Page }[] = [];
  if (d.verification.pendingProjects) out.push({ text: `Approve / verify ${d.verification.pendingProjects} pending project(s)`, page: "verification" });
  if (d.verification.pendingKyc) out.push({ text: `Review ${d.verification.pendingKyc} CP KYC submission(s)`, page: "verification" });
  if (d.verification.pendingLegal) out.push({ text: `Verify ${d.verification.pendingLegal} legal document(s)`, page: "verification" });
  if (d.crm.enquiries) out.push({ text: `Respond to ${d.crm.enquiries} open enquiry(ies)`, page: "crm" });
  if (d.crm.followUpsDue) out.push({ text: `${d.crm.followUpsDue} CP follow-up(s) overdue`, page: "crm" });
  return out.slice(0, 5);
}

function SalesPage({ d }: { d: Overview }) {
  const maxRev = Math.max(1, ...d.sales.revenueByProject.map((r) => r.value));
  return (
    <section className="page">
      <div className="page-header"><div><div className="page-title">Sales CRM</div><div className="page-sub">Lead funnel, conversions &amp; revenue by project</div></div></div>
      <div className="kpi-grid">
        <Kpi icon="spark" tone="blue" label="Leads Today" value={String(d.sales.leadsToday)} />
        <Kpi icon="users" tone="green" label="Qualified" value={String(d.sales.qualifiedLeads)} />
        <Kpi icon="building" tone="amber" label="Site Visits" value={String(d.sales.siteVisits)} />
        <Kpi icon="target" tone="blue" label="Bookings" value={String(d.sales.bookings)} />
        <Kpi icon="shield" tone="green" label="Registrations" value={String(d.sales.registrations)} />
        <Kpi icon="chart" tone="blue" label="Conversion" value={`${d.sales.conversionRate}%`} />
      </div>
      <div className="grid-2">
        <Panel title="Sales Funnel" sub="Live pipeline by stage"><Funnel funnel={d.sales.funnel} /></Panel>
        <Panel title="Revenue by Project" sub="GMV contribution">
          {d.sales.revenueByProject.length === 0 ? <p style={{ fontSize: 12.5, color: "var(--ink-500)" }}>No bookings recorded yet.</p>
            : d.sales.revenueByProject.map((r) => (
              <div style={{ marginBottom: 12 }} key={r.project}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 5 }}><span style={{ fontWeight: 600, color: "var(--ink-700)" }}>{r.project}</span><b>{formatCompactINR(r.value)}</b></div>
                <div className="progress-bar"><div className="progress-fill" style={{ width: `${Math.max(3, Math.round((r.value / maxRev) * 100))}%` }} /></div>
              </div>
            ))}
        </Panel>
      </div>
    </section>
  );
}

function ProjectsPage({ d, navigate }: { d: Overview; navigate: ReturnType<typeof useNavigate> }) {
  return (
    <section className="page">
      <div className="page-header">
        <div><div className="page-title">Projects</div><div className="page-sub">Listings, approval &amp; verification status</div></div>
        <div className="header-actions"><button className="btn btn-primary" onClick={() => navigate("/admin/listings")}><Ic n="building" /> Manage listings</button></div>
      </div>
      <div className="kpi-grid">
        <Kpi icon="building" tone="blue" label="Total Projects" value={String(d.projects.total)} />
        <Kpi icon="chart" tone="green" label="Approved / Live" value={String(d.projects.approved)} />
        <Kpi icon="shield" tone="green" label="Verified" value={String(d.projects.verified)} />
        <Kpi icon="bell" tone={d.projects.pending ? "amber" : "green"} label="Pending Approval" value={String(d.projects.pending)} />
      </div>
      <Panel title="Project Listings" sub="Most recent">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Project</th><th>City</th><th>Approval</th><th>Verified</th><th>Tier</th></tr></thead>
            <tbody>
              {d.projects.rows.map((p) => (
                <tr key={p.id}>
                  <td><div className="name-cell"><div className="mini-avatar">{initials(p.name)}</div>{p.name}</div></td>
                  <td>{p.city}</td>
                  <td><span className={`badge ${p.approvalStatus === "APPROVED" ? "green" : p.approvalStatus === "PENDING" ? "amber" : "red"}`}>{p.approvalStatus}</span></td>
                  <td>{p.verified ? <span className="badge green">Yes</span> : <span className="badge">No</span>}</td>
                  <td>{p.listingTier}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </section>
  );
}

function CrmPage({ d }: { d: Overview }) {
  return (
    <section className="page">
      <div className="page-header"><div><div className="page-title">Customers &amp; CRM</div><div className="page-sub">Buyers, follow-ups &amp; enquiries</div></div></div>
      <div className="kpi-grid">
        <Kpi icon="users" tone="blue" label="New Customers (30d)" value={String(d.crm.newCustomers)} />
        <Kpi icon="team" tone="green" label="Active Customers" value={String(d.crm.activeCustomers)} />
        <Kpi icon="bell" tone={d.crm.followUpsDue ? "amber" : "green"} label="Follow-ups Due" value={String(d.crm.followUpsDue)} />
        <Kpi icon="spark" tone="blue" label="Open Enquiries" value={String(d.crm.enquiries)} />
      </div>
      <Panel title="Note" sub="Roadmap">
        <p style={{ fontSize: 12.5, color: "var(--ink-500)", lineHeight: 1.6 }}>Complaints, CSAT &amp; referral-rate activate with the upcoming Support Ticketing module. Customer &amp; follow-up numbers above are live from the platform.</p>
      </Panel>
    </section>
  );
}

function FinancePage({ fin, navigate }: { fin: FinanceSummary | null; navigate: ReturnType<typeof useNavigate> }) {
  if (!fin?.hasData) {
    return (
      <section className="page">
        <div className="page-header"><div><div className="page-title">Finance</div><div className="page-sub">Cash flow, receivables, payables, GST &amp; runway</div></div></div>
        <div className="card placeholder">
          <h3>Finance ledger is empty</h3>
          <p>Every number here is driven by the live finance ledger — it just has no entries yet. Add a bank account, entry or loan and this dashboard fills in real time.</p>
          <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => navigate("/admin/finance")}><Ic n="wallet" /> Open Finance workspace</button>
        </div>
      </section>
    );
  }
  return (
    <section className="page">
      <div className="page-header">
        <div><div className="page-title">Finance</div><div className="page-sub">Live ledger · {formatCompactINR(fin.netCashFlow)} net cash flow</div></div>
        <div className="header-actions"><button className="btn btn-primary" onClick={() => navigate("/admin/finance")}><Ic n="wallet" /> Manage ledger</button></div>
      </div>
      <div className="kpi-grid">
        <Kpi icon="wallet" tone="green" label="Cash Inflow" value={formatINR(fin.cashInflow)} />
        <Kpi icon="arrow" tone="amber" label="Cash Outflow" value={formatINR(fin.cashOutflow)} />
        <Kpi icon="chart" tone={fin.netCashFlow >= 0 ? "green" : "red"} label="Net Cash Flow" value={formatINR(fin.netCashFlow)} />
        <Kpi icon="building" tone="blue" label="Bank Balance" value={formatINR(fin.bankBalance)} />
        <Kpi icon="users" tone="amber" label="Receivables" value={formatINR(fin.receivables)} />
        <Kpi icon="bell" tone="amber" label="Payables" value={formatINR(fin.payables)} />
        <Kpi icon="shield" tone="blue" label="GST (net)" value={formatINR(fin.gstNet)} />
        <Kpi icon="target" tone="blue" label="TDS Withheld" value={formatINR(fin.tdsWithheld)} />
        <Kpi icon="spark" tone="green" label="Gross Profit" value={formatINR(fin.grossProfit)} />
        <Kpi icon="chart" tone={fin.netProfit >= 0 ? "green" : "red"} label="Net Profit" value={formatINR(fin.netProfit)} />
        <Kpi icon="bolt" tone="amber" label="Burn / mo" value={formatINR(fin.burnRate)} />
        <Kpi icon="target" tone={fin.runwayMonths === null ? "green" : fin.runwayMonths >= 12 ? "green" : fin.runwayMonths >= 6 ? "amber" : "red"} label="Runway" value={fin.runwayMonths === null ? "∞" : `${fin.runwayMonths} mo`} />
      </div>
      <Panel title="Upcoming Payments" sub="Payables & EMIs by due date" action={<button className="chip" onClick={() => navigate("/admin/finance")}>Manage</button>}>
        {fin.upcomingPayments.length === 0 ? <p style={{ fontSize: 12.5, color: "var(--ink-500)" }}>No scheduled payables or EMIs.</p>
          : <div className="table-wrap"><table>
              <thead><tr><th>Type</th><th>Item</th><th>Party</th><th>Amount</th><th>Due</th></tr></thead>
              <tbody>{fin.upcomingPayments.map((u, i) => (
                <tr key={i}><td><span className="badge blue">{u.kind}</span></td><td>{u.label}</td><td>{u.party || "—"}</td><td><b>{formatINR(u.amount)}</b></td><td>{new Date(u.dueDate).toLocaleDateString("en-IN")}</td></tr>
              ))}</tbody>
            </table></div>}
      </Panel>
    </section>
  );
}

function VerificationPage({ d, navigate }: { d: Overview; navigate: ReturnType<typeof useNavigate> }) {
  return (
    <section className="page">
      <div className="page-header">
        <div><div className="page-title">Verification &amp; Legal</div><div className="page-sub">Trust queues across projects, KYC &amp; legal docs</div></div>
        <div className="header-actions">
          <button className="btn" onClick={() => navigate("/admin/kyc")}><Ic n="users" /> KYC queue</button>
          <button className="btn btn-primary" onClick={() => navigate("/admin/verification")}><Ic n="shield" /> Verification queue</button>
        </div>
      </div>
      <div className="kpi-grid">
        <Kpi icon="building" tone={d.verification.pendingProjects ? "amber" : "green"} label="Projects Pending" value={String(d.verification.pendingProjects)} />
        <Kpi icon="shield" tone={d.verification.pendingLegal ? "amber" : "green"} label="Legal Docs Pending" value={String(d.verification.pendingLegal)} />
        <Kpi icon="users" tone={d.verification.pendingKyc ? "amber" : "green"} label="CP KYC Pending" value={String(d.verification.pendingKyc)} />
        <Kpi icon="target" tone="green" label="Verified Projects" value={String(d.projects.verified)} />
      </div>
      <Panel title="Note" sub="Compliance register">
        <p style={{ fontSize: 12.5, color: "var(--ink-500)", lineHeight: 1.6 }}>ROC filings, GST returns, court cases and agreement-expiry alerts need a compliance register. Project-level RERA/legal verification counts above are live from the verification engine.</p>
      </Panel>
    </section>
  );
}

function KpiPage({ d, fin }: { d: Overview; fin: FinanceSummary | null }) {
  return (
    <section className="page">
      <div className="page-header"><div><div className="page-title">KPIs</div><div className="page-sub">Valuation-driving metrics, live</div></div></div>
      <div className="kpi-grid">
        <Kpi icon="wallet" tone="blue" label="Total Revenue" value={formatCompactINR(d.kpi.totalRevenue)} />
        <Kpi icon="chart" tone="green" label="GMV" value={formatCompactINR(d.kpi.gmv)} />
        <Kpi icon="spark" tone="blue" label="MRR" value={formatINR(d.kpi.mrr)} />
        <Kpi icon="target" tone="green" label="Conversion" value={`${d.kpi.conversionRate}%`} />
        <Kpi icon="building" tone="amber" label="Total Units" value={String(d.kpi.totalUnits)} />
        <Kpi icon="shield" tone="green" label="Sold Units" value={String(d.kpi.soldUnits)} />
        <Kpi icon="trophy" tone="blue" label="Health Score" value={`${d.kpi.healthScore}/100`} />
        {fin?.hasData && <Kpi icon="bolt" tone={fin.netProfit >= 0 ? "green" : "red"} label="Net Profit" value={formatCompactINR(fin.netProfit)} />}
      </div>
      <Panel title="Note" sub="Targets & NPS">
        <p style={{ fontSize: 12.5, color: "var(--ink-500)", lineHeight: 1.6 }}>Revenue targets, collections % and NPS activate once target-setting and NPS survey sources are connected.</p>
      </Panel>
    </section>
  );
}

function InsightsPage({ d, fin }: { d: Overview; fin: FinanceSummary | null }) {
  const risks: string[] = [];
  if (d.verification.pendingProjects) risks.push(`${d.verification.pendingProjects} project(s) awaiting verification — unverified listings erode buyer trust.`);
  if (d.sales.conversionRate < 5 && d.projects.approved > 0) risks.push(`Lead→booking conversion is ${d.sales.conversionRate}% — pipeline is leaking before booking.`);
  if (d.crm.followUpsDue) risks.push(`${d.crm.followUpsDue} CP follow-up(s) overdue — hot leads may go cold.`);
  if (fin?.hasData && fin.runwayMonths !== null && fin.runwayMonths < 6) risks.push(`Runway is ${fin.runwayMonths} months — watch burn closely.`);
  const opps: string[] = [];
  const top = d.sales.revenueByProject[0];
  if (top) opps.push(`${top.project} is the top GMV driver (${formatCompactINR(top.value)}) — consider featuring it.`);
  if (d.companyHealth.mrr > 0) opps.push(`${formatINR(d.companyHealth.mrr)} recurring MRR — expand CP-Pro upsell.`);
  if (d.crm.newCustomers > 0) opps.push(`${d.crm.newCustomers} new buyers in 30 days — nurture toward site visits.`);
  const day = new Date().getDate();
  const runRate = day > 0 ? Math.round((d.companyHealth.revenueMTD / day) * 30) : 0;
  return (
    <section className="page">
      <div className="page-header"><div><div className="page-title">AI Insights</div><div className="page-sub">Transparent signals derived from live data</div></div></div>
      <div className="grid-2-even">
        <Panel title="🔴 Biggest risks today">
          {risks.length ? risks.map((r, i) => <div className="feed-item" key={i}><div className="feed-dot" style={{ background: "var(--red-100)", color: "var(--red-500)" }}><Ic n="bell" /></div><div><div className="feed-title">{r}</div></div></div>) : <p style={{ fontSize: 12.5, color: "var(--ink-500)" }}>No material risk signals.</p>}
        </Panel>
        <Panel title="📈 Biggest opportunities">
          {opps.length ? opps.map((o, i) => <div className="feed-item" key={i}><div className="feed-dot" style={{ background: "var(--green-100)", color: "var(--green-600)" }}><Ic n="spark" /></div><div><div className="feed-title">{o}</div></div></div>) : <p style={{ fontSize: 12.5, color: "var(--ink-500)" }}>Add bookings &amp; subscriptions to surface opportunities.</p>}
        </Panel>
      </div>
      <div className="kpi-grid">
        <Kpi icon="chart" tone="blue" label="Revenue run-rate (mo.)" value={formatCompactINR(runRate)} foot="Linear projection, not ML" />
        <Kpi icon="spark" tone="green" label="MRR" value={formatINR(d.companyHealth.mrr)} />
        <Kpi icon="trophy" tone="blue" label="Health Score" value={`${d.companyHealth.healthScore}/100`} />
      </div>
    </section>
  );
}

function Placeholder({ title, what, connect }: { title: string; what: string; connect: string }) {
  return (
    <section className="page">
      <div className="page-header"><div><div className="page-title">{title}</div><div className="page-sub">Founder-only</div></div></div>
      <div className="card placeholder">
        <h3>Not yet tracked</h3>
        <p>{what}</p>
        <p style={{ marginTop: 10 }}><b style={{ color: "var(--ink-700)" }}>To activate:</b> {connect}</p>
        <p style={{ marginTop: 10, fontSize: 11.5 }}>Per Truvi&apos;s data-integrity rule, no fabricated numbers are shown until a real source is connected.</p>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------- copilot */
function Copilot({ open, setOpen }: { open: boolean; setOpen: (v: boolean) => void }) {
  const suggestions = ["Is month profit kitna hua?", "Lucknow project ki sales batao.", "Cash flow risk hai?", "Kaunsa project slow chal raha hai?", "Agle 90 din ki prediction dikhao."];
  const [msgs, setMsgs] = useState<{ role: "user" | "bot"; text: string }[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const session = useRef<string | undefined>(undefined);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, open]);

  async function ask(q: string) {
    const question = q.trim();
    if (!question || busy) return;
    setInput(""); setMsgs((m) => [...m, { role: "user", text: question }]); setBusy(true);
    try {
      const res = await api.post("/ask", { question, sessionId: session.current });
      session.current = res.data.sessionId || session.current;
      setMsgs((m) => [...m, { role: "bot", text: res.data.answer || "No answer returned." }]);
    } catch (err: any) {
      setMsgs((m) => [...m, { role: "bot", text: err?.response?.data?.error || "AI request failed." }]);
    } finally { setBusy(false); }
  }

  return (
    <>
      <button className="copilot-fab" onClick={() => setOpen(!open)} title="AI Copilot"><Ic n={open ? "arrow" : "spark"} /></button>
      {open && (
        <div className="copilot-panel">
          <div className="copilot-head"><Ic n="spark" /><div><b>Truvi AI Copilot</b><span>Hinglish · source-backed</span></div><button className="copilot-close" onClick={() => setOpen(false)}>✕</button></div>
          <div className="copilot-body">
            {msgs.length === 0 && <div className="msg bot">Namaste! Ask me about revenue, sales, projects or verification — Hinglish bhi chalega.</div>}
            {msgs.map((m, i) => <div key={i} className={`msg ${m.role}`}>{m.text}</div>)}
            {busy && <div className="msg bot">Thinking…</div>}
            <div ref={endRef} />
          </div>
          {msgs.length === 0 && <div className="suggest-row">{suggestions.map((s) => <button key={s} className="suggest-chip" onClick={() => ask(s)}>{s}</button>)}</div>}
          <form className="copilot-input" onSubmit={(e) => { e.preventDefault(); ask(input); }}>
            <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask Truvi AI…" />
            <button type="submit" disabled={busy}><Ic n="send" /></button>
          </form>
        </div>
      )}
    </>
  );
}
