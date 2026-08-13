import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PieChart, Pie, Cell, ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { formatCompactINR, formatINR, formatDate } from "@/lib/utils";
import { useSocketEvent } from "@/lib/socket";
import { toast } from "sonner";
import { TeamPage, MarketingPage, LandBankPage, InvestorPage, CustomerExperiencePage } from "@/pages/dashboard/FounderModules";
import { FinancialsPage, FinancialCards, MonthlyCostingPage, useCommandFinance, type FinSection } from "@/pages/dashboard/CommandCenterFinance";
import { EmployerManagementPage, TotalEmployerCard } from "@/pages/dashboard/EmployerManagement";
import ProfileSettingsModal from "@/components/ProfileSettingsModal";
import "@/styles/founder-os.css";

/* ------------------------------------------------------------------ types */
export interface Overview {
  generatedAt: string;
  executive: { totalRevenue: number; gmv: number; totalDevelopers: number; totalCPs: number; totalBuyers: number; activeListings: number; todaysBookings: number; pendingActions: number };
  companyHealth: { revenueToday: number; revenueMTD: number; revenueYTD: number; activeProjects: number; healthScore: number; mrr: number };
  sales: { leadsToday: number; qualifiedLeads: number; siteVisits: number; bookings: number; agreements: number; registrations: number; conversionRate: number; funnel: { stage: string; count: number }[]; revenueByProject: { project: string; value: number }[] };
  projects: { total: number; approved: number; verified: number; pending: number; rows: { id: string; name: string; city: string; approvalStatus: string; verified: boolean; listingTier: string; constructionStatus: string | null; constructionProgress: number | null }[] };
  crm: { newCustomers: number; activeCustomers: number; followUpsDue: number; enquiries: number };
  verification: { pendingProjects: number; pendingLegal: number; pendingKyc: number };
  kpi: { totalRevenue: number; gmv: number; mrr: number; conversionRate: number; healthScore: number; totalUnits: number; soldUnits: number };
  metrics?: { avgDealSize: number; dealCount: number; revenuePerDeveloper: number; revenuePerCP: number; revenueThisMonth: number; revenueLastMonth: number; revenueGrowthMoM: number | null; arr: number };
  efficiency?: { cac: number | null; ltv: number | null; marketingSpend: number; avgSalesCycleDays: number | null; lostDeals: number; winRate: number | null; lostByReason: { reason: string; count: number }[]; lostReasonsTracked: boolean };
  marketplace?: { activeDevelopers: number; activeCPs: number; activeBuyers: number; activeProjects: number; verifiedProjects: number; suspendedProjects: number; newBuyers30d: number; returningBuyers: number };
  salesTeam?: { leaderboard: { name: string; leads: number; conversions: number; conversionRate: number; revenue: number }[]; avgResponseHours: number | null; respondedCount: number; tracked: boolean };
  operations?: { siteVisitsToday: number; siteVisitsCompleted: number; kycPending: number; verificationPending: number; legalPending: number; agreementPending: number; registrationPending: number; followUpsDue: number };
  activeUsers?: { dau: number; mau: number; tracked: boolean };
  cx?: { nps: number | null; avgRating: number | null; responses: number; complaintsOpen: number; complaintsResolved: number; avgResolutionHours: number | null; tracked: boolean };
  notifications?: { tone: string; icon: string; text: string }[];
  investor?: { mrr: number; arr: number; gmv: number; totalRevenue: number; growthMoM: number | null; payingAccounts: number; totalCustomers: number; mau: number; dau: number; activeUsersTracked: boolean };
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
  check: "M20 6L9 17l-5-5",
  alert: "M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01",
  trendUp: "M23 6l-9.5 9.5-5-5L1 18M17 6h6v6",
  cog: "M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V15z",
};
export const Ic = ({ n }: { n: string }) => P(ICONS[n] || ICONS.grid);

/* --------------------------------------------------------------- helpers */
type Tone = "blue" | "green" | "amber" | "red";
export function Kpi({ icon, tone, label, value, foot, trend, onClick }: { icon: string; tone: Tone; label: string; value: string; foot?: string; trend?: { text: string; up?: boolean }; onClick?: () => void }) {
  return (
    <div
      className={`card kpi-card tone-${tone}${onClick ? " kpi-clickable" : ""}`}
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
export function Panel({ title, sub, action, icon, iconTone, children }: { title: string; sub?: string; action?: React.ReactNode; icon?: string; iconTone?: Tone; children: React.ReactNode }) {
  return (
    <div className="card panel">
      <div className="panel-head">
        <div className="panel-head-l">
          {icon && <div className={`kpi-icon ${iconTone || "blue"} panel-icon`}><Ic n={icon} /></div>}
          <div><div className="panel-title">{title}</div>{sub && <div className="panel-sub">{sub}</div>}</div>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}
const initials = (s: string) => s.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

/* =============================================================== the shell */
export type Page = "overview" | "sales" | "partners" | "commissions" | "developers" | "projects" | "inventory" | "bookings" | "crm" | "finance" | "financials" | "costing" | "employers" | "legal" | "support" | "operations" | "reports" | "verification" | "kpi" | "insights" | "analytics" | "team" | "marketing" | "land" | "investor" | "cx";

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
  /** Whether the Command Center financial cards + Financials page are shown (Founder-only). */
  showFinancials?: boolean;
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [finSection, setFinSection] = useState<FinSection>("investment");

  async function load() {
    // founder-overview drives the whole dashboard (nav + pages), so it's the
    // only blocking call. Finance is secondary — loaded independently so a
    // finance hiccup never blanks the command center.
    try {
      const ov = await api.get("/admin/founder-overview");
      setD(ov.data);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to load dashboard");
    } finally { setLoading(false); }
    api.get("/finance/summary").then((fs) => setFin(fs.data)).catch(() => {});
  }
  async function reloadFinance() { try { setFin((await api.get("/finance/summary")).data); } catch { /* keep */ } }
  useEffect(() => { load(); }, []);
  useSocketEvent("finance:update", reloadFinance);

  function go(p: Page) { setPage(p); setNavOpen(false); }
  function openFinancials(section: FinSection) { setFinSection(section); setPage("financials"); setNavOpen(false); }
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
            <button className="icon-btn" title="Profile settings" onClick={() => setSettingsOpen(true)}><Ic n="cog" /></button>
            <div className="divider-v" />
            <button className="profile-btn" onClick={() => setSettingsOpen(true)} title="Edit profile">
              <div className="avatar">
                {user?.avatarUrl ? <img src={user.avatarUrl} alt="" /> : initials(user?.name || config.fallbackName)}
              </div>
              <div><div className="profile-name">{user?.name || config.fallbackName}</div><div className="profile-role">{config.roleLabel}</div></div>
            </button>
          </div>
        </header>

        <div className="content">
          {current === "overview" && <OverviewPage d={d} fin={fin} go={go} openFinancials={config.showFinancials ? openFinancials : undefined} navigate={navigate} title={config.overviewTitle} sub={config.overviewSub} />}
          {current === "sales" && <SalesPage d={d} />}
          {current === "partners" && <ChannelPartnersPage />}
          {current === "commissions" && <CommissionsPage />}
          {current === "developers" && <DevelopersPage />}
          {current === "projects" && <ProjectsPage d={d} navigate={navigate} />}
          {current === "inventory" && <InventoryDashPage />}
          {current === "bookings" && <BookingsDashPage />}
          {current === "crm" && <CrmPage d={d} navigate={navigate} />}
          {current === "finance" && <FinancePage fin={fin} navigate={navigate} />}
          {current === "financials" && <FinancialsPage initialSection={finSection} />}
          {current === "costing" && <MonthlyCostingPage />}
          {current === "employers" && <EmployerManagementPage />}
          {current === "legal" && <LegalDashPage navigate={navigate} />}
          {current === "support" && <SupportDashPage navigate={navigate} />}
          {current === "operations" && <OperationsDashPage navigate={navigate} />}
          {current === "reports" && <ReportsDashPage d={d} fin={fin} />}
          {current === "verification" && <VerificationPage d={d} navigate={navigate} />}
          {current === "kpi" && <KpiPage d={d} fin={fin} />}
          {current === "insights" && <InsightsPage d={d} fin={fin} />}
          {current === "analytics" && <AnalyticsPage />}
          {current === "team" && <TeamPage over={d} />}
          {current === "marketing" && <MarketingPage />}
          {current === "land" && <LandBankPage />}
          {current === "investor" && <InvestorPage over={d} fin={fin} />}
          {current === "cx" && <CustomerExperiencePage />}
        </div>
      </div>

      {/* AI Copilot — Founder-only per RBAC */}
      {config.showCopilot && <Copilot open={copilotOpen} setOpen={setCopilotOpen} />}

      <ProfileSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
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

/* ------------------------------------------------ command centre hero */
function priorityLine(d: Overview, fin: FinanceSummary | null): string {
  const bits: string[] = [];
  if (d.sales.qualifiedLeads) bits.push(`call ${d.sales.qualifiedLeads} qualified lead${d.sales.qualifiedLeads === 1 ? "" : "s"}`);
  if (d.verification.pendingKyc) bits.push(`approve ${d.verification.pendingKyc} Partner KYC`);
  if (d.verification.pendingProjects) bits.push(`verify ${d.verification.pendingProjects} project${d.verification.pendingProjects === 1 ? "" : "s"}`);
  if (d.crm.followUpsDue) bits.push(`clear ${d.crm.followUpsDue} overdue follow-up${d.crm.followUpsDue === 1 ? "" : "s"}`);
  if (d.verification.pendingLegal) bits.push(`review ${d.verification.pendingLegal} legal doc${d.verification.pendingLegal === 1 ? "" : "s"}`);
  if (fin?.hasData && fin.upcomingPayments?.length) bits.push(`action ${fin.upcomingPayments.length} upcoming payment${fin.upcomingPayments.length === 1 ? "" : "s"}`);
  if (bits.length === 0) return "All queues are clear — focus on growth: nurture your qualified leads and onboard new CPs & developers.";
  return "Today's priority: " + bits.slice(0, 3).join(", ") + ".";
}

function CommandHero({ d, fin, go }: { d: Overview; fin: FinanceSummary | null; go: (p: Page) => void }) {
  const ch = d.companyHealth;
  const health = ch.healthScore;
  const healthTone: Tone = health >= 70 ? "green" : health >= 40 ? "amber" : "red";
  const tiles: { icon: string; tone: Tone; label: string; value: string; foot?: string; onClick?: () => void }[] = [
    { icon: "wallet", tone: "blue", label: "Bank Balance", value: fin?.hasData ? formatCompactINR(fin.bankBalance) : "—", foot: fin?.hasData ? (fin.runwayMonths === null ? "Cash-flow positive" : `${fin.runwayMonths} mo runway`) : "Connect finance ledger", onClick: () => go("finance") },
    { icon: "chart", tone: "green", label: "Today's Revenue", value: formatINR(ch.revenueToday) },
    { icon: "building", tone: "blue", label: "Active Projects", value: String(d.projects.approved), foot: `${d.projects.verified} verified`, onClick: () => go("projects") },
    { icon: "target", tone: "amber", label: "Today's Bookings", value: String(d.executive.todaysBookings), onClick: () => go("bookings") },
    { icon: "trophy", tone: healthTone, label: "Business Health", value: String(health), foot: health >= 70 ? "Healthy" : health >= 40 ? "Watch" : "Critical" },
  ];
  return (
    <>
      <div className="hero-grid">
        {tiles.map((t) => (
          <div key={t.label} className={`card hero-tile tone-${t.tone}${t.onClick ? " kpi-clickable" : ""}`} onClick={t.onClick} role={t.onClick ? "button" : undefined} tabIndex={t.onClick ? 0 : undefined}
            onKeyDown={t.onClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); t.onClick!(); } } : undefined}>
            <div className={`kpi-icon ${t.tone} hero-icon`}><Ic n={t.icon} /></div>
            <div className="hero-label">{t.label}</div>
            <div className="hero-value">{t.value}</div>
            {t.foot && <div className="hero-foot">{t.foot}</div>}
          </div>
        ))}
      </div>
      <div className="card hero-priority">
        <div className="kpi-icon blue hero-icon"><Ic n="spark" /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="hero-priority-label">AI Founder Priority</div>
          <div className="hero-priority-text">{priorityLine(d, fin)}</div>
        </div>
      </div>
    </>
  );
}

function QuickActions({ navigate, go }: { navigate: ReturnType<typeof useNavigate>; go: (p: Page) => void }) {
  const actions: { icon: string; label: string; onClick: () => void }[] = [
    { icon: "building", label: "Add Project", onClick: () => navigate("/admin/listings") },
    { icon: "users", label: "Add CP", onClick: () => navigate("/admin/users") },
    { icon: "building", label: "Add Developer", onClick: () => navigate("/admin/users") },
    { icon: "spark", label: "Add Lead", onClick: () => navigate("/crm/pipeline") },
    { icon: "wallet", label: "Record Payment", onClick: () => navigate("/admin/finance") },
    { icon: "book", label: "Reports", onClick: () => go("reports") },
  ];
  return (
    <div className="qa-row">
      {actions.map((a) => (
        <button key={a.label} className="qa-btn" onClick={a.onClick}><Ic n={a.icon} /><span>{a.label}</span></button>
      ))}
    </div>
  );
}

/* ---------------------------------------------------- Daily Founder Brief */
type BriefLine = { icon: string; tone: Tone; text: string; page?: Page };

/**
 * Synthesises a plain-language "Daily Founder Brief" from live data — the
 * proactive daily strategy briefing. Fully transparent: every sentence is
 * derived from real platform numbers, no black-box ML.
 */
function buildBrief(d: Overview, fin: FinanceSummary | null): { headline: string; lines: BriefLine[] } {
  const lines: BriefLine[] = [];
  const ch = d.companyHealth;

  // Health headline
  const health = ch.healthScore;
  const healthWord = health >= 70 ? "healthy" : health >= 40 ? "steady, watch a few areas" : "under pressure";
  const headline = `Business health is ${health}/100 — ${healthWord}.`;

  // Revenue pulse
  lines.push({
    icon: "wallet", tone: "blue", page: "finance",
    text: `Revenue today ${formatINR(ch.revenueToday)} · ${formatINR(ch.revenueMTD)} MTD · ${formatINR(ch.revenueYTD)} YTD${ch.mrr > 0 ? ` · ${formatINR(ch.mrr)} recurring MRR` : ""}.`,
  });

  // Sales pulse
  lines.push({
    icon: "spark", tone: "green", page: "sales",
    text: `${d.sales.leadsToday} lead${d.sales.leadsToday === 1 ? "" : "s"} today, ${d.sales.qualifiedLeads} qualified in pipeline · ${d.executive.todaysBookings} booking${d.executive.todaysBookings === 1 ? "" : "s"} today · ${d.sales.conversionRate}% conversion.`,
  });

  // Biggest risk (first material one)
  const risk = topRisk(d, fin);
  if (risk) lines.push({ icon: "alert", tone: "red", text: risk.text, page: risk.page });

  // Biggest opportunity
  const opp = topOpportunity(d);
  if (opp) lines.push({ icon: "trendUp", tone: "green", text: opp });

  // Pending actions / focus
  if (d.executive.pendingActions > 0) {
    lines.push({
      icon: "bell", tone: "amber", page: "verification",
      text: `${d.executive.pendingActions} action${d.executive.pendingActions === 1 ? "" : "s"} awaiting you — approvals, KYC, legal and enquiries.`,
    });
  } else {
    lines.push({ icon: "check", tone: "green", text: "No pending approvals, KYC, legal or enquiries — queues are clear." });
  }

  // Runway note when finance is live
  if (fin?.hasData) {
    if (fin.runwayMonths === null) {
      lines.push({ icon: "target", tone: "green", page: "finance", text: `Cash-flow positive — bank balance ${formatINR(fin.bankBalance)}, no burn.` });
    } else {
      const tone: Tone = fin.runwayMonths >= 12 ? "green" : fin.runwayMonths >= 6 ? "amber" : "red";
      lines.push({ icon: "target", tone, page: "finance", text: `Runway ${fin.runwayMonths} month${fin.runwayMonths === 1 ? "" : "s"} at ${formatINR(fin.burnRate)}/mo burn · ${formatINR(fin.bankBalance)} in bank.` });
    }
  }

  return { headline, lines };
}

function topRisk(d: Overview, fin: FinanceSummary | null): { text: string; page: Page } | null {
  if (fin?.hasData && fin.runwayMonths !== null && fin.runwayMonths < 6)
    return { text: `Runway is only ${fin.runwayMonths} month(s) — tighten burn or accelerate collections.`, page: "finance" };
  if (d.verification.pendingProjects)
    return { text: `${d.verification.pendingProjects} project(s) awaiting verification — unverified listings erode buyer trust.`, page: "verification" };
  if (d.crm.followUpsDue)
    return { text: `${d.crm.followUpsDue} CP follow-up(s) overdue — hot leads may be going cold.`, page: "crm" };
  if (d.sales.conversionRate < 5 && d.projects.approved > 0)
    return { text: `Lead→booking conversion is ${d.sales.conversionRate}% — the pipeline is leaking before booking.`, page: "sales" };
  return null;
}

function topOpportunity(d: Overview): string | null {
  const top = d.sales.revenueByProject[0];
  if (top) return `${top.project} is your top GMV driver (${formatCompactINR(top.value)}) — worth featuring and doubling down.`;
  if (d.companyHealth.mrr > 0) return `${formatINR(d.companyHealth.mrr)} recurring MRR — expand the CP-Pro upsell to compound it.`;
  if (d.crm.newCustomers > 0) return `${d.crm.newCustomers} new buyer(s) in 30 days — nurture them toward site visits.`;
  return null;
}

function DailyBrief({ d, fin, go }: { d: Overview; fin: FinanceSummary | null; go: (p: Page) => void }) {
  const { headline, lines } = buildBrief(d, fin);
  const today = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  return (
    <div className="card brief-card">
      <div className="brief-head">
        <div className="brief-icon"><Ic n="spark" /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="brief-title">Daily Founder Brief</div>
          <div className="brief-date">{greeting} · {today}</div>
        </div>
        <span className="brief-tag"><Ic n="bolt" /> AI · live data</span>
      </div>
      <div className="brief-headline">{headline}</div>
      <div className="brief-lines">
        {lines.map((l, i) => (
          <div
            className={`brief-line${l.page ? " clickable" : ""}`}
            key={i}
            onClick={l.page ? () => go(l.page!) : undefined}
            role={l.page ? "button" : undefined}
            tabIndex={l.page ? 0 : undefined}
            onKeyDown={l.page ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(l.page!); } } : undefined}
          >
            <div className={`kpi-icon ${l.tone} brief-line-icon`}><Ic n={l.icon} /></div>
            <span>{l.text}</span>
            {l.page && <span className="brief-line-open"><Ic n="arrow" /></span>}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------- Notifications feed */
function NotificationsFeed({ items }: { items?: { tone: string; icon: string; text: string }[] }) {
  const toneClass = (t: string): Tone => (t === "red" || t === "amber" || t === "green" ? (t as Tone) : "blue");
  return (
    <Panel title="Notifications" sub="What needs your attention now" icon="bell" iconTone="amber">
      {!items || items.length === 0 ? (
        <p style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--ink-500)" }}>
          <span className="status-dot green" /> You're all caught up — nothing needs attention right now.
        </p>
      ) : (
        <div>
          {items.map((n, i) => (
            <div className="brief-line" key={i}>
              <div className={`kpi-icon ${toneClass(n.tone)} brief-line-icon`}><Ic n={n.icon} /></div>
              <span>{n.text}</span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

function OverviewPage({ d, fin, go, openFinancials, navigate, title, sub }: { d: Overview; fin: FinanceSummary | null; go: (p: Page) => void; openFinancials?: (s: FinSection) => void; navigate: ReturnType<typeof useNavigate>; title: string; sub: string }) {
  const ex = d.executive;
  const { summary: finSummary } = useCommandFinance();
  return (
    <section className="page">
      <div className="page-header">
        <div><div className="page-title">{title}</div><div className="page-sub">{sub}</div></div>
      </div>

      <QuickActions navigate={navigate} go={go} />
      <CommandHero d={d} fin={fin} go={go} />
      {openFinancials && <FinancialCards summary={finSummary} onOpen={openFinancials} />}
      {openFinancials && <TotalEmployerCard onOpen={() => go("employers")} />}
      <div className="grid-2">
        <DailyBrief d={d} fin={fin} go={go} />
        <NotificationsFeed items={d.notifications} />
      </div>

      {d.metrics && (
        <>
          <div className="section-label" style={{ margin: "4px 0 12px", fontSize: 12, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", color: "var(--ink-500)" }}>Founder metrics</div>
          <div className="kpi-grid">
            <Kpi icon="target" tone="blue" label="Avg Deal Size" value={d.metrics.dealCount ? formatCompactINR(d.metrics.avgDealSize) : "—"} foot={`${d.metrics.dealCount} closed deal${d.metrics.dealCount === 1 ? "" : "s"}`} />
            <Kpi icon="building" tone="green" label="Revenue / Developer" value={d.executive.totalDevelopers ? formatCompactINR(d.metrics.revenuePerDeveloper) : "—"} foot={`${d.executive.totalDevelopers} developers`} />
            <Kpi icon="users" tone="amber" label="Revenue / Channel Partner" value={d.executive.totalCPs ? formatCompactINR(d.metrics.revenuePerCP) : "—"} foot={`${d.executive.totalCPs} CPs`} />
            <Kpi icon="trendUp" tone={d.metrics.revenueGrowthMoM === null ? "blue" : d.metrics.revenueGrowthMoM >= 0 ? "green" : "red"} label="Revenue Growth (MoM)" value={d.metrics.revenueGrowthMoM === null ? "—" : `${d.metrics.revenueGrowthMoM >= 0 ? "+" : ""}${d.metrics.revenueGrowthMoM}%`} foot={`${formatCompactINR(d.metrics.revenueThisMonth)} this month`} />
            <Kpi icon="wallet" tone="blue" label="Recurring (ARR)" value={d.metrics.arr ? formatCompactINR(d.metrics.arr) : "—"} foot={`${formatCompactINR(d.companyHealth.mrr)} MRR`} />
            <Kpi icon="chart" tone="green" label="Units Sold" value={String(d.kpi.soldUnits)} foot={`of ${d.kpi.totalUnits} tracked`} />
          </div>
        </>
      )}

      {d.efficiency && (
        <>
          <div className="section-label" style={{ margin: "4px 0 12px", fontSize: 12, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", color: "var(--ink-500)" }}>Efficiency &amp; growth</div>
          <div className="kpi-grid">
            <Kpi icon="target" tone="blue" label="CAC" value={d.efficiency.cac === null ? "—" : formatCompactINR(d.efficiency.cac)} foot={d.efficiency.cac === null ? "Log ad-spend in Marketing" : "Ad spend ÷ new customers"} onClick={() => go("marketing")} />
            <Kpi icon="trophy" tone="green" label="LTV" value={d.efficiency.ltv === null ? "—" : formatCompactINR(d.efficiency.ltv)} foot={d.efficiency.ltv === null ? "No paying customers yet" : "Revenue ÷ paying customers"} />
            <Kpi icon="spark" tone={d.efficiency.cac && d.efficiency.ltv ? (d.efficiency.ltv / d.efficiency.cac >= 3 ? "green" : "amber") : "blue"} label="LTV : CAC" value={d.efficiency.cac && d.efficiency.ltv ? `${(d.efficiency.ltv / d.efficiency.cac).toFixed(1)}x` : "—"} foot="Healthy ≥ 3x" />
            <Kpi icon="refresh" tone="blue" label="Avg Sales Cycle" value={d.efficiency.avgSalesCycleDays === null ? "—" : `${d.efficiency.avgSalesCycleDays}d`} foot="Lead → booking" />
            <Kpi icon="check" tone={d.efficiency.winRate === null ? "blue" : d.efficiency.winRate >= 50 ? "green" : "amber"} label="Win Rate" value={d.efficiency.winRate === null ? "—" : `${d.efficiency.winRate}%`} foot={`${d.efficiency.lostDeals} lost deal${d.efficiency.lostDeals === 1 ? "" : "s"}`} />
            <Kpi icon="alert" tone={d.efficiency.lostDeals ? "red" : "green"} label="Lost Deals" value={String(d.efficiency.lostDeals)} foot={d.efficiency.lostReasonsTracked ? "Reasons tracked below" : "Add reasons in CRM"} onClick={() => go("sales")} />
          </div>
          {d.efficiency.lostReasonsTracked && d.efficiency.lostByReason.length > 0 && (
            <Panel title="Why deals are lost" sub="Captured when a lead is marked Lost in the CRM" icon="alert" iconTone="red">
              {(() => {
                const max = Math.max(1, ...d.efficiency.lostByReason.map((r) => r.count));
                return d.efficiency.lostByReason.map((r) => (
                  <div style={{ marginBottom: 12 }} key={r.reason}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 5 }}><span style={{ fontWeight: 600, color: "var(--ink-700)" }}>{r.reason}</span><b>{r.count}</b></div>
                    <div className="progress-bar"><div className="progress-fill" style={{ width: `${Math.max(4, Math.round((r.count / max) * 100))}%`, background: "var(--red-500)" }} /></div>
                  </div>
                ));
              })()}
            </Panel>
          )}
        </>
      )}

      {d.marketplace && (
        <>
          <div className="section-label" style={{ margin: "4px 0 12px", fontSize: 12, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", color: "var(--ink-500)" }}>Marketplace health</div>
          <div className="kpi-grid">
            <Kpi icon="building" tone="blue" label="Active Developers" value={String(d.marketplace.activeDevelopers)} onClick={() => go("developers")} />
            <Kpi icon="users" tone="green" label="Active Channel Partners" value={String(d.marketplace.activeCPs)} onClick={() => go("partners")} />
            <Kpi icon="team" tone="blue" label="Active Buyers" value={String(d.marketplace.activeBuyers)} foot={`${d.marketplace.newBuyers30d} new in 30d`} />
            <Kpi icon="grid" tone="green" label="Active Projects" value={String(d.marketplace.activeProjects)} foot={`${d.marketplace.verifiedProjects} verified`} onClick={() => go("projects")} />
            <Kpi icon="shield" tone="blue" label="Verified Projects" value={String(d.marketplace.verifiedProjects)} />
            <Kpi icon="refresh" tone="green" label="Returning Buyers" value={String(d.marketplace.returningBuyers)} foot="Enquired more than once" />
            <Kpi icon="alert" tone={d.marketplace.suspendedProjects ? "red" : "green"} label="Suspended / Rejected" value={String(d.marketplace.suspendedProjects)} />
          </div>
        </>
      )}

      {d.operations && (
        <>
          <div className="section-label" style={{ margin: "4px 0 12px", fontSize: 12, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", color: "var(--ink-500)" }}>Operations queues</div>
          <div className="kpi-grid">
            <Kpi icon="target" tone="blue" label="Site Visits Today" value={String(d.operations.siteVisitsToday)} foot={`${d.operations.siteVisitsCompleted} completed all-time`} onClick={() => go("operations")} />
            <Kpi icon="users" tone={d.operations.kycPending ? "amber" : "green"} label="KYC Pending" value={String(d.operations.kycPending)} onClick={() => go("verification")} />
            <Kpi icon="shield" tone={d.operations.verificationPending ? "amber" : "green"} label="Verification Pending" value={String(d.operations.verificationPending)} onClick={() => go("verification")} />
            <Kpi icon="book" tone={d.operations.legalPending ? "amber" : "green"} label="Legal Review Pending" value={String(d.operations.legalPending)} onClick={() => go("legal")} />
            <Kpi icon="check" tone={d.operations.agreementPending ? "amber" : "green"} label="Agreement Pending" value={String(d.operations.agreementPending)} foot="Booked, awaiting agreement" onClick={() => go("bookings")} />
            <Kpi icon="cog" tone={d.operations.registrationPending ? "amber" : "green"} label="Registration Pending" value={String(d.operations.registrationPending)} onClick={() => go("bookings")} />
          </div>
        </>
      )}

      <div className="kpi-grid">
        <Kpi icon="wallet" tone="blue" label="Total Revenue" value={formatCompactINR(ex.totalRevenue)} foot="Platform fee + leads + payments" />
        <Kpi icon="chart" tone="green" label="Total GMV" value={formatCompactINR(ex.gmv)} foot="Booking value routed" />
        <Kpi icon="building" tone="amber" label="Active Listings" value={String(ex.activeListings)} foot={`${d.projects.verified} verified`} />
        <Kpi icon="users" tone="blue" label="Channel Partners" value={String(ex.totalCPs)} foot={`${ex.totalDevelopers} developers · ${ex.totalBuyers} buyers`} />
        <Kpi icon="target" tone="green" label="Today's Bookings" value={String(ex.todaysBookings)} />
        <Kpi icon="bell" tone={ex.pendingActions ? "red" : "green"} label="Pending Actions" value={String(ex.pendingActions)} foot="Approvals · KYC · legal · enquiries" />
      </div>

      <div className="section-label" style={{ margin: "4px 0 12px", fontSize: 12, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", color: "var(--ink-500)" }}>Today at a glance</div>
      <div className="kpi-grid">
        <Kpi icon="spark" tone="blue" label="Leads Today" value={String(d.sales.leadsToday)} foot={`${d.sales.qualifiedLeads} qualified`} />
        <Kpi icon="target" tone="green" label="Bookings Today" value={String(ex.todaysBookings)} foot={`${d.sales.siteVisits} site visits`} />
        <Kpi icon="wallet" tone="blue" label="Revenue Today" value={formatINR(d.companyHealth.revenueToday)} />
        <Kpi icon="users" tone={d.verification.pendingKyc ? "amber" : "green"} label="Pending Partner KYC" value={String(d.verification.pendingKyc)} onClick={() => go("verification")} />
        <Kpi icon="shield" tone={d.verification.pendingProjects ? "amber" : "green"} label="Site Verification Pending" value={String(d.verification.pendingProjects)} onClick={() => go("verification")} />
        <Kpi icon="bell" tone={d.crm.enquiries ? "amber" : "green"} label="Open Enquiries" value={String(d.crm.enquiries)} onClick={() => go("crm")} />
      </div>

      <div className="grid-2">
        <Panel title="Revenue" sub="Today · Month-to-date · Year-to-date" icon="wallet" iconTone="blue">
          <div className="kpi-grid" style={{ marginBottom: 0 }}>
            <div><div className="kpi-label">Today</div><div className="kpi-value">{formatINR(d.companyHealth.revenueToday)}</div></div>
            <div><div className="kpi-label">MTD</div><div className="kpi-value">{formatINR(d.companyHealth.revenueMTD)}</div></div>
            <div><div className="kpi-label">YTD</div><div className="kpi-value">{formatINR(d.companyHealth.revenueYTD)}</div></div>
            <div><div className="kpi-label">MRR</div><div className="kpi-value">{formatINR(d.companyHealth.mrr)}</div></div>
          </div>
        </Panel>
        <Panel title="Business Health Score" sub="Composite of verified listings, conversion, activity & revenue" icon="target" iconTone="green">
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

      <div className="grid-2-even">
        <Panel title="Marketplace Mix" sub="Developers · channel partners · buyers" icon="users" iconTone="blue">
          <Donut centerLabel="Members" data={[
            { name: "Developers", value: ex.totalDevelopers, color: "#5D87FF" },
            { name: "Channel Partners", value: ex.totalCPs, color: "#7C5CFF" },
            { name: "Buyers", value: ex.totalBuyers, color: "#14C79A" },
          ]} />
        </Panel>
        <Panel title="Listings Status" sub="Verification pipeline across projects" icon="building" iconTone="green">
          <Donut centerLabel="Projects" data={[
            { name: "Verified", value: d.projects.verified, color: "#14C79A" },
            { name: "Approved", value: Math.max(0, d.projects.approved - d.projects.verified), color: "#5D87FF" },
            { name: "Pending", value: d.projects.pending, color: "#F5A524" },
          ]} />
        </Panel>
      </div>

      <div className="grid-2">
        <Panel title="Sales Funnel" sub="Live pipeline by stage" icon="chart" iconTone="blue">
          <Funnel funnel={d.sales.funnel} />
        </Panel>
        <Panel title="Top Priorities" sub="From live queues" icon="bolt" iconTone="amber">
          {priorities(d).length === 0
            ? <p style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--ink-500)" }}><span className="status-dot green" /> All clear — no pending approvals, KYC, legal or enquiries.</p>
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
function Donut({ data, centerLabel }: { data: { name: string; value: number; color: string }[]; centerLabel: string }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const shown = total === 0 ? [{ name: "No data", value: 1, color: "var(--border)" }] : data.filter((d) => d.value > 0);
  return (
    <div className="donut-wrap">
      <div className="donut-chart">
        <ResponsiveContainer width="100%" height={168}>
          <PieChart>
            <Pie data={shown} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={54} outerRadius={78} paddingAngle={total === 0 ? 0 : 3} strokeWidth={0} startAngle={90} endAngle={-270}>
              {shown.map((d, i) => <Cell key={i} fill={d.color} />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="donut-center"><b>{total}</b><span>{centerLabel}</span></div>
      </div>
      <div className="donut-legend">
        {data.map((d) => (
          <div className="donut-leg-row" key={d.name}>
            <span className="donut-dot" style={{ background: d.color }} />
            <span className="donut-leg-name">{d.name}</span>
            <b>{d.value}</b>
          </div>
        ))}
      </div>
    </div>
  );
}
function priorities(d: Overview): { text: string; page: Page }[] {
  const out: { text: string; page: Page }[] = [];
  if (d.verification.pendingProjects) out.push({ text: `Approve / verify ${d.verification.pendingProjects} pending project(s)`, page: "verification" });
  if (d.verification.pendingKyc) out.push({ text: `Review ${d.verification.pendingKyc} Partner KYC submission(s)`, page: "verification" });
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
        <Panel title="Sales Funnel" sub="Live pipeline by stage" icon="chart" iconTone="blue"><Funnel funnel={d.sales.funnel} /></Panel>
        <Panel title="Revenue by Project" sub="GMV contribution" icon="wallet" iconTone="green">
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
            <thead><tr><th>Project</th><th>City</th><th>Approval</th><th>Verified</th><th>Construction</th><th>Tier</th></tr></thead>
            <tbody>
              {d.projects.rows.map((p) => (
                <tr key={p.id}>
                  <td><div className="name-cell"><div className="mini-avatar">{initials(p.name)}</div>{p.name}</div></td>
                  <td>{p.city}</td>
                  <td><span className={`badge ${p.approvalStatus === "APPROVED" ? "green" : p.approvalStatus === "PENDING" ? "amber" : "red"}`}>{p.approvalStatus}</span></td>
                  <td>{p.verified ? <span className="badge green">Yes</span> : <span className="badge">No</span>}</td>
                  <td>
                    {p.constructionProgress == null && !p.constructionStatus ? (
                      <span className="badge">Not reported</span>
                    ) : (
                      <div style={{ minWidth: 120 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 3 }}>
                          <span style={{ textTransform: "capitalize", opacity: 0.8 }}>{(p.constructionStatus ?? "").toLowerCase() || "—"}</span>
                          <span style={{ fontWeight: 600 }}>{p.constructionProgress ?? 0}%</span>
                        </div>
                        <div style={{ height: 6, borderRadius: 999, background: "rgba(255,255,255,0.1)", overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${Math.min(100, Math.max(0, p.constructionProgress ?? 0))}%`, borderRadius: 999, background: "linear-gradient(90deg,#f59e0b,#10b981)" }} />
                        </div>
                      </div>
                    )}
                  </td>
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

function CrmPage({ d, navigate }: { d: Overview; navigate: ReturnType<typeof useNavigate> }) {
  return (
    <section className="page">
      <div className="page-header">
        <div><div className="page-title">Customers &amp; CRM</div><div className="page-sub">Buyers, follow-ups &amp; enquiries</div></div>
        <div className="header-actions">
          <button className="btn" onClick={() => navigate("/crm/pipeline")}><Ic n="grid" /> Pipeline</button>
          <button className="btn" onClick={() => navigate("/bookings")}><Ic n="target" /> Bookings</button>
          <button className="btn" onClick={() => navigate("/vault")}><Ic n="book" /> Vault</button>
          <button className="btn btn-primary" onClick={() => navigate("/admin/audit-logs")}><Ic n="shield" /> Audit Logs</button>
        </div>
      </div>
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
        <Kpi icon="users" tone={d.verification.pendingKyc ? "amber" : "green"} label="Partner KYC Pending" value={String(d.verification.pendingKyc)} />
        <Kpi icon="target" tone="green" label="Verified Projects" value={String(d.projects.verified)} />
      </div>
      <PartnerKycPanel navigate={navigate} />
      <Panel title="Note" sub="Compliance register">
        <p style={{ fontSize: 12.5, color: "var(--ink-500)", lineHeight: 1.6 }}>ROC filings, GST returns, court cases and agreement-expiry alerts need a compliance register. Project-level RERA/legal verification counts above are live from the verification engine.</p>
      </Panel>
    </section>
  );
}

interface KycRecord { _id: string; name: string; email: string; role: string; kycStatus: "PENDING" | "APPROVED" | "REJECTED" | "NOT_SUBMITTED"; submittedAt: string | null; }
interface KycCounts { total: number; approved: number; pending: number; rejected: number; notSubmitted: number; }
const KYC_BADGE: Record<KycRecord["kycStatus"], { cls: string; label: string }> = {
  APPROVED: { cls: "green", label: "Verified" },
  PENDING: { cls: "amber", label: "Pending" },
  REJECTED: { cls: "red", label: "Rejected" },
  NOT_SUBMITTED: { cls: "", label: "Not submitted" },
};

function PartnerKycPanel({ navigate }: { navigate: ReturnType<typeof useNavigate> }) {
  const [records, setRecords] = useState<KycRecord[]>([]);
  const [counts, setCounts] = useState<KycCounts | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api.get("/admin/kyc/records")
      .then((r) => { setRecords(r.data.records ?? []); setCounts(r.data.counts ?? null); })
      .catch((e: any) => toast.error(e?.response?.data?.error || "Failed to load KYC"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Panel title="Channel Partner & Ambassador KYC" sub="Every partner's identity status — verified, pending, rejected & not submitted" icon="users" iconTone="blue"
      action={<button className="btn" onClick={() => navigate("/admin/kyc")}><Ic n="shield" /> Review docs</button>}>
      {counts && (
        <div className="kpi-grid" style={{ marginBottom: 12 }}>
          <Kpi icon="users" tone="blue" label="Total Partners" value={String(counts.total)} />
          <Kpi icon="shield" tone="green" label="Verified" value={String(counts.approved)} />
          <Kpi icon="bell" tone={counts.pending ? "amber" : "green"} label="Awaiting Review" value={String(counts.pending)} onClick={() => navigate("/admin/kyc")} />
          <Kpi icon="target" tone={counts.rejected ? "red" : "green"} label="Rejected" value={String(counts.rejected)} />
          <Kpi icon="grid" tone={counts.notSubmitted ? "amber" : "green"} label="Not Submitted" value={String(counts.notSubmitted)} />
        </div>
      )}
      {loading ? <p style={{ fontSize: 12.5, color: "var(--ink-500)" }}>Loading…</p>
        : records.length === 0 ? <p style={{ fontSize: 12.5, color: "var(--ink-500)" }}>No Channel Partners or Ambassadors yet.</p>
        : <div className="table-wrap"><table>
            <thead><tr><th>Partner</th><th>Role</th><th>KYC Status</th><th>Submitted</th><th></th></tr></thead>
            <tbody>{records.map((r) => {
              const b = KYC_BADGE[r.kycStatus];
              return (
                <tr key={r._id}>
                  <td><div className="name-cell"><div className="mini-avatar">{initials(r.name)}</div><div>{r.name}<div style={{ fontSize: 11, color: "var(--ink-500)" }}>{r.email}</div></div></div></td>
                  <td>{r.role}</td>
                  <td><span className={`badge ${b.cls}`}>{b.label}</span></td>
                  <td>{r.submittedAt ? new Date(r.submittedAt).toLocaleDateString("en-IN") : "—"}</td>
                  <td style={{ textAlign: "right" }}><button className="btn" onClick={() => navigate(`/admin/users/${r._id}`)}>View</button></td>
                </tr>
              );
            })}</tbody>
          </table></div>}
    </Panel>
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
        <Panel title="Biggest risks today" icon="alert" iconTone="red">
          {risks.length ? risks.map((r, i) => <div className="feed-item" key={i}><div className="feed-dot" style={{ background: "var(--red-100)", color: "var(--red-500)" }}><Ic n="bell" /></div><div><div className="feed-title">{r}</div></div></div>) : <p style={{ fontSize: 12.5, color: "var(--ink-500)" }}>No material risk signals.</p>}
        </Panel>
        <Panel title="Biggest opportunities" icon="trendUp" iconTone="green">
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

/* ------------------------------------------------------ channel partners */
const TIER_BADGE: Record<string, string> = { DIAMOND: "blue", PLATINUM: "blue", GOLD: "amber", SILVER: "" };
const TIER_COLOR: Record<string, string> = { DIAMOND: "#5D87FF", PLATINUM: "#7C5CFF", GOLD: "#F5A524", SILVER: "#8A94A8" };

interface CpData {
  summary: { total: number; active: number; pendingKyc: number; totalEarned: number; totalGmv: number; byTier: { tier: string; count: number }[] };
  partners: { id: string; name: string; email: string; tier: string; kycStatus: string; leads: number; bookings: number; gmv: number; earned: number }[];
}
function ChannelPartnersPage() {
  const navigate = useNavigate();
  const [d, setD] = useState<CpData | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { api.get("/admin/cp-performance").then((r) => setD(r.data)).catch((e: any) => toast.error(e?.response?.data?.error || "Failed to load")).finally(() => setLoading(false)); }, []);
  if (loading) return <section className="page"><p style={{ color: "var(--ink-500)", padding: 20 }}>Loading channel partners…</p></section>;
  if (!d) return <section className="page"><p style={{ padding: 20 }}>Could not load.</p></section>;
  const s = d.summary;
  return (
    <section className="page">
      <div className="page-header">
        <div><div className="page-title">Channel Partners</div><div className="page-sub">CP network performance, commissions &amp; KYC</div></div>
        <div className="header-actions"><button className="btn btn-primary" onClick={() => navigate("/admin/kyc")}><Ic n="users" /> KYC queue</button></div>
      </div>
      <div className="kpi-grid">
        <Kpi icon="users" tone="blue" label="Total CPs" value={String(s.total)} foot={`${s.active} with bookings`} />
        <Kpi icon="target" tone="green" label="Active" value={String(s.active)} />
        <Kpi icon="bell" tone={s.pendingKyc ? "amber" : "green"} label="Pending KYC" value={String(s.pendingKyc)} onClick={() => navigate("/admin/kyc")} />
        <Kpi icon="wallet" tone="blue" label="Commissions Paid" value={formatCompactINR(s.totalEarned)} />
        <Kpi icon="chart" tone="green" label="GMV Routed" value={formatCompactINR(s.totalGmv)} />
      </div>
      <div className="grid-2-even">
        <Panel title="CP Leaderboard" sub="Top partners by commission earned" icon="trophy" iconTone="amber">
          {d.partners.length === 0 ? <p style={{ fontSize: 12.5, color: "var(--ink-500)" }}>No channel partners yet.</p>
            : <div className="table-wrap"><table>
                <thead><tr><th>#</th><th>Partner</th><th>Tier</th><th>Bookings</th><th>Earned</th><th>KYC</th></tr></thead>
                <tbody>{d.partners.map((p, i) => (
                  <tr key={p.id}>
                    <td>{i + 1}</td>
                    <td><div className="name-cell"><div className="mini-avatar">{initials(p.name)}</div>{p.name}</div></td>
                    <td><span className={`badge ${TIER_BADGE[p.tier] || ""}`}>{p.tier}</span></td>
                    <td>{p.bookings}</td>
                    <td><b>{formatCompactINR(p.earned)}</b></td>
                    <td>{p.kycStatus === "APPROVED" ? <span className="badge green">Verified</span> : p.kycStatus === "PENDING" ? <span className="badge amber">Pending</span> : <span className="badge red">{p.kycStatus}</span>}</td>
                  </tr>
                ))}</tbody>
              </table></div>}
        </Panel>
        <Panel title="Tier distribution" sub="CPs by performance tier" icon="trophy" iconTone="blue">
          <Donut centerLabel="CPs" data={s.byTier.map((t) => ({ name: t.tier[0] + t.tier.slice(1).toLowerCase(), value: t.count, color: TIER_COLOR[t.tier] || "#8A94A8" }))} />
        </Panel>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------- commissions */
type CommMode = "BANK_TRANSFER" | "UPI" | "CASH" | "CHEQUE" | "OTHER";
interface CommPayoutDetails { accountHolderName?: string; accountNumber?: string; ifsc?: string; bankName?: string; upiId?: string; method?: "BANK_TRANSFER" | "UPI"; updatedAt?: string; }
interface CommPartner {
  id: string; name: string; email: string; role: string;
  developerCommission: number; saleCommission: number; referralCommission: number;
  referredDevelopers: number; referredChannelPartners: number;
  total: number; paid: number; pending: number; nextPayable: number;
  payoutDetails: CommPayoutDetails | null;
}
type CommFilter = "ALL" | "AMBASSADOR" | "CP" | "ACTIVE" | "TOP" | "PENDING" | "PAID";

function CommissionsPage() {
  const [partners, setPartners] = useState<CommPartner[]>([]);
  const [loading, setLoading] = useState(true);
  const [payTarget, setPayTarget] = useState<CommPartner | null>(null);
  const [filter, setFilter] = useState<CommFilter>("ALL");

  useEffect(() => {
    api.get("/admin/commissions/partners")
      .then((r) => setPartners(r.data.partners ?? []))
      .catch((e: any) => toast.error(e?.response?.data?.error || "Failed to load commissions"))
      .finally(() => setLoading(false));
  }, []);

  const t = partners.reduce(
    (a, p) => ({ dev: a.dev + p.developerCommission, ref: a.ref + p.referralCommission, sale: a.sale + p.saleCommission, total: a.total + p.total, paid: a.paid + p.paid, pending: a.pending + p.pending }),
    { dev: 0, ref: 0, sale: 0, total: 0, paid: 0, pending: 0 },
  );

  const isActive = (p: CommPartner) => p.total > 0 || p.referredDevelopers > 0 || p.referredChannelPartners > 0;
  let shown = partners.filter((p) => {
    if (filter === "AMBASSADOR") return p.role === "AMBASSADOR";
    if (filter === "CP") return p.role === "CP";
    if (filter === "ACTIVE") return isActive(p);
    if (filter === "PENDING") return p.pending > 0;
    if (filter === "PAID") return p.paid > 0;
    return true;
  });
  if (filter === "TOP") shown = [...shown].sort((a, b) => b.total - a.total).slice(0, 5);
  const FILTERS: { key: CommFilter; label: string }[] = [
    { key: "ALL", label: "All" }, { key: "AMBASSADOR", label: "Ambassadors" }, { key: "CP", label: "Channel Partners" },
    { key: "ACTIVE", label: "Active" }, { key: "TOP", label: "Top Performing" },
    { key: "PENDING", label: "Pending Payment" }, { key: "PAID", label: "Paid" },
  ];

  if (loading) return <section className="page"><p style={{ color: "var(--ink-500)", padding: 20 }}>Loading commissions…</p></section>;
  return (
    <section className="page">
      <div className="page-header">
        <div><div className="page-title">Partner &amp; Ambassador Commissions</div><div className="page-sub">Developer 2% + referral 2% on sales &amp; bonuses + property-sale commission · one ledger, same numbers the partner sees</div></div>
      </div>
      <div className="kpi-grid">
        <Kpi icon="building" tone="blue" label="Developer (2%)" value={formatINR(t.dev)} />
        <Kpi icon="users" tone="blue" label="Referral (2%+Bonus)" value={formatINR(t.ref)} />
        <Kpi icon="chart" tone="blue" label="Sale Commission" value={formatINR(t.sale)} />
        <Kpi icon="wallet" tone="green" label="Total Earned" value={formatINR(t.total)} />
        <Kpi icon="target" tone="green" label="Paid Out" value={formatINR(t.paid)} />
        <Kpi icon="bell" tone={t.pending ? "amber" : "green"} label="Pending" value={formatINR(t.pending)} />
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "0 0 12px" }}>
        {FILTERS.map((f) => (
          <button key={f.key} className={`btn ${filter === f.key ? "btn-primary" : ""}`} style={{ fontSize: 12, padding: "6px 12px" }} onClick={() => setFilter(f.key)}>{f.label}</button>
        ))}
      </div>
      <Panel title="Partner payouts" sub="Developer + referral + sale commission, paid, pending &amp; bank / UPI details · click a partner for the full referral breakdown" icon="wallet" iconTone="green">
        {shown.length === 0 ? <p style={{ fontSize: 12.5, color: "var(--ink-500)" }}>No partners match this filter.</p> :
          <div className="table-wrap"><table>
            <thead><tr><th>Partner</th><th>Developer</th><th>Referral</th><th>Sale</th><th>Total</th><th>Paid</th><th>Pending</th><th>Payout To</th><th></th></tr></thead>
            <tbody>{shown.map((p) => (
              <tr key={p.id} style={{ cursor: "pointer" }} onClick={() => setPayTarget(p)}>
                <td><div className="name-cell"><div className="mini-avatar">{initials(p.name)}</div><div>{p.name}<div style={{ fontSize: 11, color: "var(--ink-500)" }}>{p.email} · {p.role}{(p.referredDevelopers > 0 || p.referredChannelPartners > 0) ? ` · ${p.referredDevelopers} dev / ${p.referredChannelPartners} CP referred` : ""}</div></div></div></td>
                <td>{formatINR(p.developerCommission)}</td>
                <td>{formatINR(p.referralCommission)}</td>
                <td>{formatINR(p.saleCommission)}</td>
                <td><b>{formatINR(p.total)}</b></td>
                <td>{formatINR(p.paid)}</td>
                <td><b style={{ color: "#E0A73B" }}>{formatINR(p.pending)}</b></td>
                <td>{p.payoutDetails && (p.payoutDetails.accountNumber || p.payoutDetails.upiId)
                  ? <span style={{ fontSize: 11.5 }}>{p.payoutDetails.method === "UPI" ? p.payoutDetails.upiId : `••••${(p.payoutDetails.accountNumber || "").slice(-4)}`}</span>
                  : <span className="badge amber">Not added</span>}</td>
                <td><button className="btn btn-primary" disabled={p.pending <= 0} onClick={(e) => { e.stopPropagation(); setPayTarget(p); }}><Ic n="wallet" /> Mark Paid</button></td>
              </tr>
            ))}</tbody>
          </table></div>}
      </Panel>
      {payTarget && <CommissionPayModal partner={payTarget} onClose={() => setPayTarget(null)} onPaid={(u) => { setPartners((prev) => prev.map((x) => (x.id === u.id ? u : x))); setPayTarget(null); }} />}
    </section>
  );
}

interface CommReferralRow { _id: string; name: string; totalTransactions?: number; totalSalesValue?: number; cpCommission?: number; saleCommission?: number; percentEarned: number; firstTxnBonus?: number; incentiveEarned: number; }
interface CommReferral { counts: { developers: number; channelPartners: number; buyers: number; others: number; total: number }; buyerRatePercent?: number; developers: CommReferralRow[]; channelPartners: CommReferralRow[]; buyers: CommReferralRow[]; }

function CommissionPayModal({ partner, onClose, onPaid }: { partner: CommPartner; onClose: () => void; onPaid: (p: CommPartner) => void }) {
  const [amount, setAmount] = useState(String(partner.pending || ""));
  const [mode, setMode] = useState<CommMode>(partner.payoutDetails?.method ?? "BANK_TRANSFER");
  const [transactionId, setTransactionId] = useState("");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [referral, setReferral] = useState<CommReferral | null>(null);
  const [payments, setPayments] = useState<{ _id: string; amount: number; mode: string; transactionId: string | null; paymentDate: string; notes: string | null }[]>([]);
  const pd = partner.payoutDetails;

  useEffect(() => {
    api.get(`/admin/commissions/partners/${partner.id}`)
      .then((r) => { setReferral(r.data.detail?.wallet?.referral ?? null); setPayments(r.data.detail?.wallet?.payments ?? []); })
      .catch(() => { setReferral(null); setPayments([]); });
  }, [partner.id]);

  async function submit() {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) { toast.error("Enter a valid amount"); return; }
    if (amt > partner.pending + 0.5) { toast.error(`Amount exceeds pending ${formatINR(partner.pending)}`); return; }
    setSaving(true);
    try {
      const res = await api.post("/admin/commissions/pay", { cpId: partner.id, amount: amt, mode, transactionId: transactionId.trim() || undefined, paymentDate, notes: notes.trim() || undefined });
      const w = res.data.wallet;
      toast.success(`Recorded ${formatINR(amt)} payout to ${partner.name}`);
      onPaid({ ...partner, paid: w.paid, pending: w.pending, nextPayable: w.nextPayable, total: w.totalEarnings, developerCommission: w.developerCommission, saleCommission: w.saleCommission, referralCommission: w.referralCommission ?? partner.referralCommission });
    } catch (e: any) {
      toast.error(e?.response?.data?.error || "Failed to record payout");
    } finally { setSaving(false); }
  }

  const selStyle: React.CSSProperties = { width: "100%", border: "1px solid var(--border-strong)", background: "var(--bg)", color: "var(--ink-900)", borderRadius: 10, padding: "10px 12px", fontSize: 13, fontFamily: "inherit" };
  return (
    <div className="ps-overlay" onClick={onClose}>
      <div className="ps-modal card" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Record payout">
        <div className="ps-head">
          <div><div className="ps-title">Record Payout</div><div className="ps-sub">{partner.name} · {partner.email}</div></div>
          <button className="ps-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, margin: "4px 0 14px" }}>
          <MiniBox label="Total" value={formatINR(partner.total)} />
          <MiniBox label="Paid" value={formatINR(partner.paid)} />
          <MiniBox label="Next Payable" value={formatINR(partner.nextPayable)} amber />
        </div>
        <div className="card" style={{ padding: 12, marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--ink-500)", marginBottom: 6 }}>Payout Details</div>
          {pd && (pd.accountNumber || pd.upiId) ? (
            <div style={{ fontSize: 12.5, display: "grid", gap: 3 }}>
              {pd.accountHolderName && <div>Holder: <b>{pd.accountHolderName}</b></div>}
              {pd.bankName && <div>Bank: <b>{pd.bankName}</b></div>}
              {pd.accountNumber && <div>A/C: <b>{pd.accountNumber}</b></div>}
              {pd.ifsc && <div>IFSC: <b>{pd.ifsc}</b></div>}
              {pd.upiId && <div>UPI: <b>{pd.upiId}</b></div>}
              {pd.method && <div>Preferred: <b>{pd.method === "UPI" ? "UPI" : "Bank Transfer"}</b></div>}
            </div>
          ) : <div style={{ fontSize: 12, color: "#E0A73B" }}>This partner hasn't added bank / UPI details yet.</div>}
        </div>
        {referral && referral.counts.total > 0 && (
          <div className="card" style={{ padding: 12, marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--ink-500)", marginBottom: 6 }}>
              Referrals · {referral.counts.developers} Developers · {referral.counts.channelPartners} Channel Partners · {referral.counts.buyers} Buyers{referral.counts.others > 0 ? ` · ${referral.counts.others} Others` : ""}
            </div>
            {referral.developers.length > 0 && (
              <div className="table-wrap" style={{ marginTop: 4 }}><table style={{ fontSize: 12 }}>
                <thead><tr><th>Developer</th><th>Txns</th><th>Sales value</th><th>2% + bonus</th></tr></thead>
                <tbody>{referral.developers.map((r) => (
                  <tr key={r._id}><td>{r.name}</td><td>{r.totalTransactions ?? 0}</td><td>{formatINR(r.totalSalesValue ?? 0)}</td><td><b>{formatINR(r.incentiveEarned)}</b></td></tr>
                ))}</tbody>
              </table></div>
            )}
            {referral.channelPartners.length > 0 && (
              <div className="table-wrap" style={{ marginTop: 8 }}><table style={{ fontSize: 12 }}>
                <thead><tr><th>Channel Partner</th><th>Their commission</th><th>2% + bonus</th></tr></thead>
                <tbody>{referral.channelPartners.map((r) => (
                  <tr key={r._id}><td>{r.name}</td><td>{formatINR(r.cpCommission ?? 0)}</td><td><b>{formatINR(r.incentiveEarned)}</b></td></tr>
                ))}</tbody>
              </table></div>
            )}
            {referral.buyers.length > 0 && (
              <div className="table-wrap" style={{ marginTop: 8 }}><table style={{ fontSize: 12 }}>
                <thead><tr><th>Buyer</th><th>Bookings</th><th>Sale commission</th><th>{referral.buyerRatePercent ?? 35}% earned</th></tr></thead>
                <tbody>{referral.buyers.map((r) => (
                  <tr key={r._id}><td>{r.name}</td><td>{r.totalTransactions ?? 0}</td><td>{formatINR(r.saleCommission ?? 0)}</td><td><b>{formatINR(r.incentiveEarned)}</b></td></tr>
                ))}</tbody>
              </table></div>
            )}
          </div>
        )}
        {payments.length > 0 && (
          <div className="card" style={{ padding: 12, marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--ink-500)", marginBottom: 6 }}>
              Payment History · last {formatDate(payments[0].paymentDate)}
            </div>
            <div className="table-wrap"><table style={{ fontSize: 12 }}>
              <thead><tr><th>Date</th><th>Amount</th><th>Mode</th><th>Ref</th></tr></thead>
              <tbody>{payments.map((p) => (
                <tr key={p._id}><td>{formatDate(p.paymentDate)}</td><td><b>{formatINR(p.amount)}</b></td><td>{p.mode.replace(/_/g, " ")}</td><td>{p.transactionId || "—"}</td></tr>
              ))}</tbody>
            </table></div>
          </div>
        )}
        <div className="ps-field"><label>Amount (₹)</label><input type="number" min="1" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
        <div className="ps-field"><label>Payment Mode</label>
          <select value={mode} onChange={(e) => setMode(e.target.value as CommMode)} style={selStyle}>
            <option value="BANK_TRANSFER">Bank Transfer</option><option value="UPI">UPI</option><option value="CASH">Cash</option><option value="CHEQUE">Cheque</option><option value="OTHER">Other</option>
          </select>
        </div>
        <div className="ps-field"><label>Transaction ID / UTR</label><input value={transactionId} onChange={(e) => setTransactionId(e.target.value)} placeholder="UTR / UPI ref / cheque no." /></div>
        <div className="ps-field"><label>Payment Date</label><input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} /></div>
        <div className="ps-field"><label>Notes</label><input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" /></div>
        <div className="ps-actions"><button className="btn" onClick={onClose} disabled={saving}>Cancel</button><button className="btn btn-primary" onClick={submit} disabled={saving}>{saving ? "Saving…" : "Confirm Payout"}</button></div>
      </div>
    </div>
  );
}

function MiniBox({ label, value, amber }: { label: string; value: string; amber?: boolean }) {
  return (
    <div className="card" style={{ padding: "8px 10px", textAlign: "center" }}>
      <div style={{ fontSize: 10, textTransform: "uppercase", color: "var(--ink-500)" }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: amber ? "#E0A73B" : "var(--ink-900)" }}>{value}</div>
    </div>
  );
}

/* ----------------------------------------------------------- developers */
interface DevData {
  summary: { total: number; totalProjects: number; verified: number; pending: number };
  developers: { id: string; name: string; email: string; company: string; rera: string | null; status: string; total: number; approved: number; verified: number; pending: number }[];
}
function DevelopersPage() {
  const navigate = useNavigate();
  const [d, setD] = useState<DevData | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { api.get("/admin/developer-performance").then((r) => setD(r.data)).catch((e: any) => toast.error(e?.response?.data?.error || "Failed to load")).finally(() => setLoading(false)); }, []);
  if (loading) return <section className="page"><p style={{ color: "var(--ink-500)", padding: 20 }}>Loading developers…</p></section>;
  if (!d) return <section className="page"><p style={{ padding: 20 }}>Could not load.</p></section>;
  const s = d.summary;
  return (
    <section className="page">
      <div className="page-header">
        <div><div className="page-title">Developers</div><div className="page-sub">Builder network, project health &amp; approvals</div></div>
        <div className="header-actions"><button className="btn btn-primary" onClick={() => navigate("/admin/listings")}><Ic n="building" /> Manage listings</button></div>
      </div>
      <div className="kpi-grid">
        <Kpi icon="building" tone="blue" label="Developers" value={String(s.total)} />
        <Kpi icon="grid" tone="green" label="Total Projects" value={String(s.totalProjects)} />
        <Kpi icon="shield" tone="green" label="Verified Projects" value={String(s.verified)} />
        <Kpi icon="bell" tone={s.pending ? "amber" : "green"} label="Pending Approval" value={String(s.pending)} onClick={() => navigate("/admin/verification")} />
      </div>
      <Panel title="Developer Network" sub="Projects, verification &amp; approval status" icon="building" iconTone="blue">
        {d.developers.length === 0 ? <p style={{ fontSize: 12.5, color: "var(--ink-500)" }}>No developers yet.</p>
          : <div className="table-wrap"><table>
              <thead><tr><th>Developer</th><th>RERA</th><th>Projects</th><th>Approved</th><th>Verified</th><th>Pending</th><th>Status</th></tr></thead>
              <tbody>{d.developers.map((v) => (
                <tr key={v.id}>
                  <td><div className="name-cell"><div className="mini-avatar">{initials(v.company)}</div>{v.company}</div></td>
                  <td>{v.rera || <span style={{ color: "var(--ink-400)" }}>—</span>}</td>
                  <td><b>{v.total}</b></td>
                  <td>{v.approved}</td>
                  <td>{v.verified ? <span className="badge green">{v.verified}</span> : "0"}</td>
                  <td>{v.pending ? <span className="badge amber">{v.pending}</span> : "0"}</td>
                  <td><span className={`badge ${v.status === "APPROVED" ? "green" : v.status === "PENDING" ? "amber" : "red"}`}>{v.status}</span></td>
                </tr>
              ))}</tbody>
            </table></div>}
      </Panel>
    </section>
  );
}

/* -------------------------------------------------------------- analytics */
interface Analytics {
  revenueTrend: { month: string; revenue: number; gmv: number; bookings: number }[];
  leadsBySource: { source: string; count: number }[];
  conversionBySource: { source: string; leads: number; converted: number; rate: number }[];
  revenueByCity: { city: string; gmv: number; bookings: number }[];
  inventoryByStatus: { status: string; count: number }[];
  totalUnits: number;
}
const CHART_COLORS = ["#5D87FF", "#7C5CFF", "#14C79A", "#F5A524", "#F4574A", "#A855F7"];
const chartTooltip = {
  contentStyle: { background: "var(--surface)", border: "1px solid var(--border-strong)", borderRadius: 10, fontSize: 12, color: "var(--ink-900)" },
  labelStyle: { color: "var(--ink-500)" },
} as const;

function AnalyticsPage() {
  const [a, setA] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api.get("/admin/founder-analytics").then((r) => setA(r.data)).catch((e: any) => toast.error(e?.response?.data?.error || "Failed to load analytics")).finally(() => setLoading(false));
  }, []);
  if (loading) return <section className="page"><p style={{ color: "var(--ink-500)", padding: 20 }}>Loading analytics…</p></section>;
  if (!a) return <section className="page"><p style={{ padding: 20 }}>Could not load analytics.</p></section>;

  const invColors: Record<string, string> = { AVAILABLE: "#14C79A", RESERVED: "#F5A524", LOCKED: "#7C5CFF", SOLD: "#5D87FF" };
  const maxCity = Math.max(1, ...a.revenueByCity.map((c) => c.gmv));

  return (
    <section className="page">
      <div className="page-header"><div><div className="page-title">Analytics</div><div className="page-sub">Live trends across revenue, demand &amp; inventory · from real platform data</div></div></div>

      <div className="grid-2-even">
        <Panel title="Revenue trend" sub="Platform revenue · last 6 months" icon="chart" iconTone="blue">
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={a.revenueTrend} margin={{ top: 8, right: 8, left: -6, bottom: 0 }}>
              <defs><linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#5D87FF" stopOpacity={0.5} /><stop offset="100%" stopColor="#5D87FF" stopOpacity={0} /></linearGradient></defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="month" tick={{ fill: "var(--ink-500)", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "var(--ink-500)", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => formatCompactINR(Number(v))} width={56} />
              <Tooltip {...chartTooltip} formatter={(v) => [formatINR(Number(v)), "Revenue"]} />
              <Area type="monotone" dataKey="revenue" stroke="#5D87FF" strokeWidth={2.5} fill="url(#revGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </Panel>
        <Panel title="Bookings per month" sub="Closed bookings · last 6 months" icon="target" iconTone="green">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={a.revenueTrend} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="month" tick={{ fill: "var(--ink-500)", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "var(--ink-500)", fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} width={30} />
              <Tooltip {...chartTooltip} />
              <Bar dataKey="bookings" fill="#14C79A" radius={[6, 6, 0, 0]} maxBarSize={44} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      <div className="grid-2-even">
        <Panel title="Leads by source" sub="Where demand comes from" icon="spark" iconTone="blue">
          <Donut centerLabel="Leads" data={a.leadsBySource.map((s, i) => ({ name: s.source, value: s.count, color: CHART_COLORS[i % CHART_COLORS.length] }))} />
        </Panel>
        <Panel title="Inventory status" sub={`${a.totalUnits} total units`} icon="building" iconTone="green">
          <Donut centerLabel="Units" data={a.inventoryByStatus.map((s) => ({ name: s.status[0] + s.status.slice(1).toLowerCase(), value: s.count, color: invColors[s.status] || "#8A94A8" }))} />
        </Panel>
      </div>

      <Panel title="Conversion by source" sub="Which lead sources actually close" icon="target" iconTone="blue">
        {a.conversionBySource.length === 0 ? <p style={{ fontSize: 12.5, color: "var(--ink-500)" }}>No leads recorded yet.</p>
          : a.conversionBySource.map((s) => (
            <div style={{ marginBottom: 12 }} key={s.source}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 5 }}>
                <span style={{ fontWeight: 600, color: "var(--ink-700)" }}>{s.source}</span>
                <b>{s.rate}% · {s.converted}/{s.leads}</b>
              </div>
              <div className="progress-bar"><div className="progress-fill" style={{ width: `${Math.max(3, s.rate)}%`, background: s.rate >= 30 ? "var(--green-600)" : s.rate >= 10 ? "var(--amber-500)" : "var(--red-500)" }} /></div>
            </div>
          ))}
      </Panel>

      <Panel title="Revenue by city" sub="GMV routed by project location" icon="land" iconTone="amber">
        {a.revenueByCity.length === 0 ? <p style={{ fontSize: 12.5, color: "var(--ink-500)" }}>No bookings recorded yet.</p>
          : a.revenueByCity.map((c) => (
            <div style={{ marginBottom: 12 }} key={c.city}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 5 }}><span style={{ fontWeight: 600, color: "var(--ink-700)" }}>{c.city}</span><b>{formatCompactINR(c.gmv)} · {c.bookings} bookings</b></div>
              <div className="progress-bar"><div className="progress-fill" style={{ width: `${Math.max(3, Math.round((c.gmv / maxCity) * 100))}%` }} /></div>
            </div>
          ))}
      </Panel>
    </section>
  );
}

/* ------------------------------------------------ inventory / bookings / etc */
function useFetch<T>(url: string): { data: T | null; loading: boolean } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let live = true;
    api.get(url).then((r) => { if (live) setData(r.data); }).catch((e: any) => toast.error(e?.response?.data?.error || "Failed to load")).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [url]);
  return { data, loading };
}
const Loading = ({ what }: { what: string }) => <section className="page"><p style={{ color: "var(--ink-500)", padding: 20 }}>Loading {what}…</p></section>;
const unitBadge = (s: string) => s === "AVAILABLE" ? "green" : s === "SOLD" ? "blue" : s === "RESERVED" ? "amber" : "";
const bookingBadge = (s: string) => s === "PAID" ? "green" : s === "PENDING" ? "amber" : "blue";

interface InvData { summary: { total: number; available: number; reserved: number; locked: number; sold: number; totalValue: number; soldValue: number }; byProject: { project: string; city: string; total: number; available: number; sold: number; value: number }[]; units: { id: string; project: string; unitNumber: string; type: string; areaSqft: number; price: number; status: string }[]; }
function InventoryDashPage() {
  const { data: d, loading } = useFetch<InvData>("/admin/inventory-overview");
  if (loading) return <Loading what="inventory" />;
  if (!d) return <section className="page"><p style={{ padding: 20 }}>Could not load.</p></section>;
  const s = d.summary;
  return (
    <section className="page">
      <div className="page-header"><div><div className="page-title">Property Inventory</div><div className="page-sub">Live stock across all listed projects</div></div></div>
      <div className="kpi-grid">
        <Kpi icon="building" tone="blue" label="Total Units" value={String(s.total)} foot={formatCompactINR(s.totalValue)} />
        <Kpi icon="check" tone="green" label="Available" value={String(s.available)} />
        <Kpi icon="target" tone="amber" label="Reserved" value={String(s.reserved)} />
        <Kpi icon="shield" tone="blue" label="Locked" value={String(s.locked)} />
        <Kpi icon="trophy" tone="green" label="Sold" value={String(s.sold)} foot={formatCompactINR(s.soldValue)} />
      </div>
      <div className="grid-2-even">
        <Panel title="Inventory by status" sub={`${s.total} total units`} icon="building" iconTone="blue">
          <Donut centerLabel="Units" data={[
            { name: "Available", value: s.available, color: "#14C79A" },
            { name: "Reserved", value: s.reserved, color: "#F5A524" },
            { name: "Locked", value: s.locked, color: "#7C5CFF" },
            { name: "Sold", value: s.sold, color: "#5D87FF" },
          ]} />
        </Panel>
        <Panel title="Stock by project" sub="Units & value per development" icon="land" iconTone="green">
          {d.byProject.length === 0 ? <p style={{ fontSize: 12.5, color: "var(--ink-500)" }}>No inventory yet.</p>
            : d.byProject.map((p) => {
              const max = Math.max(1, ...d.byProject.map((x) => x.total));
              return (
                <div style={{ marginBottom: 12 }} key={p.project}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 5 }}><span style={{ fontWeight: 600, color: "var(--ink-700)" }}>{p.project}</span><b>{p.available}/{p.total} avail · {formatCompactINR(p.value)}</b></div>
                  <div className="progress-bar"><div className="progress-fill" style={{ width: `${Math.max(4, Math.round((p.total / max) * 100))}%` }} /></div>
                </div>
              );
            })}
        </Panel>
      </div>
      <Panel title="Units" sub="Live stock" icon="grid" iconTone="blue">
        <div className="table-wrap"><table>
          <thead><tr><th>Unit</th><th>Project</th><th>Type</th><th>Area</th><th>Price</th><th>Status</th></tr></thead>
          <tbody>{d.units.map((u) => (
            <tr key={u.id}><td><b>{u.unitNumber}</b></td><td>{u.project}</td><td>{u.type}</td><td>{u.areaSqft} sqft</td><td>{formatCompactINR(u.price)}</td><td><span className={`badge ${unitBadge(u.status)}`}>{u.status}</span></td></tr>
          ))}</tbody>
        </table></div>
      </Panel>
    </section>
  );
}

interface BkData { summary: { total: number; totalGmv: number; totalCommission: number; paid: number; pending: number; byStatus: { status: string; count: number }[] }; bookings: { id: string; date: string; project: string; client: string; cp: string; bookingValue: number; commission: number; status: string; milestones: number; released: number }[]; }
function BookingsDashPage() {
  const { data: d, loading } = useFetch<BkData>("/admin/bookings-overview");
  if (loading) return <Loading what="bookings" />;
  if (!d) return <section className="page"><p style={{ padding: 20 }}>Could not load.</p></section>;
  const s = d.summary;
  return (
    <section className="page">
      <div className="page-header"><div><div className="page-title">Bookings</div><div className="page-sub">Live booking activity across the platform</div></div></div>
      <div className="kpi-grid">
        <Kpi icon="target" tone="blue" label="Total Bookings" value={String(s.total)} />
        <Kpi icon="chart" tone="green" label="GMV" value={formatCompactINR(s.totalGmv)} />
        <Kpi icon="wallet" tone="blue" label="CP Commission" value={formatCompactINR(s.totalCommission)} />
        <Kpi icon="check" tone="green" label="Paid" value={String(s.paid)} />
        <Kpi icon="bell" tone={s.pending ? "amber" : "green"} label="In Progress" value={String(s.pending)} />
      </div>
      <Panel title="Recent bookings" sub="Newest first" icon="target" iconTone="blue">
        {d.bookings.length === 0 ? <p style={{ fontSize: 12.5, color: "var(--ink-500)" }}>No bookings recorded yet.</p>
          : <div className="table-wrap"><table>
              <thead><tr><th>Date</th><th>Project</th><th>Client</th><th>CP</th><th>Value</th><th>Commission</th><th>Milestones</th><th>Status</th></tr></thead>
              <tbody>{d.bookings.map((b) => (
                <tr key={b.id}>
                  <td>{new Date(b.date).toLocaleDateString("en-IN")}</td>
                  <td>{b.project}</td><td>{b.client}</td><td>{b.cp}</td>
                  <td><b>{formatCompactINR(b.bookingValue)}</b></td><td>{formatCompactINR(b.commission)}</td>
                  <td>{b.milestones ? `${b.released}/${b.milestones}` : "—"}</td>
                  <td><span className={`badge ${bookingBadge(b.status)}`}>{b.status.replace(/_/g, " ")}</span></td>
                </tr>
              ))}</tbody>
            </table></div>}
      </Panel>
    </section>
  );
}

interface LgData { summary: { total: number; verified: number; pending: number; byType: { type: string; count: number }[] }; docs: { id: string; project: string; title: string; docType: string; verified: boolean; date: string }[]; }
function LegalDashPage({ navigate }: { navigate: ReturnType<typeof useNavigate> }) {
  const { data: d, loading } = useFetch<LgData>("/admin/legal-overview");
  if (loading) return <Loading what="legal documents" />;
  if (!d) return <section className="page"><p style={{ padding: 20 }}>Could not load.</p></section>;
  const s = d.summary;
  return (
    <section className="page">
      <div className="page-header">
        <div><div className="page-title">Legal</div><div className="page-sub">Document register, verification &amp; compliance</div></div>
        <div className="header-actions"><button className="btn btn-primary" onClick={() => navigate("/admin/verification")}><Ic n="shield" /> Verification queue</button></div>
      </div>
      <div className="kpi-grid">
        <Kpi icon="book" tone="blue" label="Legal Documents" value={String(s.total)} />
        <Kpi icon="check" tone="green" label="Verified" value={String(s.verified)} />
        <Kpi icon="alert" tone={s.pending ? "amber" : "green"} label="Pending Review" value={String(s.pending)} />
      </div>
      <Panel title="Document register" sub="All legal documents by project" icon="book" iconTone="blue">
        {d.docs.length === 0 ? <p style={{ fontSize: 12.5, color: "var(--ink-500)" }}>No legal documents uploaded yet.</p>
          : <div className="table-wrap"><table>
              <thead><tr><th>Document</th><th>Project</th><th>Type</th><th>Uploaded</th><th>Status</th></tr></thead>
              <tbody>{d.docs.map((doc) => (
                <tr key={doc.id}>
                  <td><b>{doc.title}</b></td><td>{doc.project}</td><td>{doc.docType.replace(/_/g, " ")}</td>
                  <td>{new Date(doc.date).toLocaleDateString("en-IN")}</td>
                  <td>{doc.verified ? <span className="badge green">Verified</span> : <span className="badge amber">Pending</span>}</td>
                </tr>
              ))}</tbody>
            </table></div>}
      </Panel>
    </section>
  );
}

interface SpData { summary: { total: number; thisWeek: number; byPurpose: { purpose: string; count: number }[] }; tickets: { id: string; name: string; email: string; purpose: string; project: string | null; message: string | null; date: string }[]; }
function SupportDashPage({ navigate }: { navigate: ReturnType<typeof useNavigate> }) {
  const { data: d, loading } = useFetch<SpData>("/admin/support-overview");
  if (loading) return <Loading what="support tickets" />;
  if (!d) return <section className="page"><p style={{ padding: 20 }}>Could not load.</p></section>;
  const s = d.summary;
  return (
    <section className="page">
      <div className="page-header">
        <div><div className="page-title">Customer Support</div><div className="page-sub">Enquiries, complaints &amp; resolution</div></div>
        <div className="header-actions"><button className="btn btn-primary" onClick={() => navigate("/admin/enquiries")}><Ic n="bell" /> Manage enquiries</button></div>
      </div>
      <div className="kpi-grid">
        <Kpi icon="bell" tone="blue" label="Total Tickets" value={String(s.total)} />
        <Kpi icon="spark" tone="amber" label="This Week" value={String(s.thisWeek)} />
        <Kpi icon="grid" tone="green" label="Categories" value={String(s.byPurpose.length)} />
      </div>
      <div className="grid-2">
        <Panel title="Support queue" sub="Newest enquiries first" icon="bell" iconTone="blue">
          {d.tickets.length === 0 ? <p style={{ fontSize: 12.5, color: "var(--ink-500)" }}>No enquiries yet.</p>
            : <div className="table-wrap"><table>
                <thead><tr><th>From</th><th>Purpose</th><th>Project</th><th>Date</th></tr></thead>
                <tbody>{d.tickets.map((t) => (
                  <tr key={t.id}>
                    <td><b>{t.name}</b><div style={{ fontSize: 11, color: "var(--ink-500)" }}>{t.email}</div></td>
                    <td><span className="badge blue">{t.purpose.replace(/_/g, " ")}</span></td>
                    <td>{t.project || "—"}</td><td>{new Date(t.date).toLocaleDateString("en-IN")}</td>
                  </tr>
                ))}</tbody>
              </table></div>}
        </Panel>
        <Panel title="By category" sub="Enquiry purpose mix" icon="chart" iconTone="green">
          <Donut centerLabel="Tickets" data={s.byPurpose.map((p, i) => ({ name: p.purpose.replace(/_/g, " "), value: p.count, color: CHART_COLORS[i % CHART_COLORS.length] }))} />
        </Panel>
      </div>
    </section>
  );
}

interface OpData { summary: { siteTasks: number; siteTasksOpen: number; followUpsPending: number; followUpsOverdue: number; crmTasksOpen: number; pendingApprovals: number; pendingLegal: number; byTaskStatus: { status: string; count: number }[] }; siteVisitTasks: { id: string; title: string; status: string; deadline: string }[]; }
function OperationsDashPage({ navigate }: { navigate: ReturnType<typeof useNavigate> }) {
  const { data: d, loading } = useFetch<OpData>("/admin/ops-overview");
  if (loading) return <Loading what="operations" />;
  if (!d) return <section className="page"><p style={{ padding: 20 }}>Could not load.</p></section>;
  const s = d.summary;
  return (
    <section className="page">
      <div className="page-header">
        <div><div className="page-title">Operations</div><div className="page-sub">Site tasks, approvals &amp; follow-ups</div></div>
        <div className="header-actions"><button className="btn btn-primary" onClick={() => navigate("/admin/ambassador-tasks")}><Ic n="grid" /> Site tasks</button></div>
      </div>
      <div className="kpi-grid">
        <Kpi icon="grid" tone="blue" label="Site Tasks" value={String(s.siteTasks)} foot={`${s.siteTasksOpen} open`} />
        <Kpi icon="bell" tone={s.followUpsOverdue ? "red" : s.followUpsPending ? "amber" : "green"} label="Follow-ups Due" value={String(s.followUpsPending)} foot={`${s.followUpsOverdue} overdue`} />
        <Kpi icon="target" tone={s.crmTasksOpen ? "amber" : "green"} label="CRM Tasks Open" value={String(s.crmTasksOpen)} />
        <Kpi icon="building" tone={s.pendingApprovals ? "amber" : "green"} label="Pending Approvals" value={String(s.pendingApprovals)} onClick={() => navigate("/admin/verification")} />
        <Kpi icon="shield" tone={s.pendingLegal ? "amber" : "green"} label="Legal Pending" value={String(s.pendingLegal)} />
      </div>
      <Panel title="Site verification tasks" sub="By deadline" icon="shield" iconTone="blue">
        {d.siteVisitTasks.length === 0 ? <p style={{ fontSize: 12.5, color: "var(--ink-500)" }}>No site tasks scheduled.</p>
          : <div className="table-wrap"><table>
              <thead><tr><th>Task</th><th>Deadline</th><th>Status</th></tr></thead>
              <tbody>{d.siteVisitTasks.map((t) => (
                <tr key={t.id}><td><b>{t.title}</b></td><td>{new Date(t.deadline).toLocaleDateString("en-IN")}</td><td><span className={`badge ${t.status === "COMPLETED" ? "green" : t.status === "LOCKED" ? "amber" : "blue"}`}>{t.status}</span></td></tr>
              ))}</tbody>
            </table></div>}
      </Panel>
    </section>
  );
}

function ReportsDashPage({ d, fin }: { d: Overview; fin: FinanceSummary | null }) {
  function downloadCsv() {
    const rows: [string, string | number][] = [
      ["Report", "Truvi Founder Snapshot"],
      ["Generated", new Date().toLocaleString("en-IN")],
      ["", ""],
      ["Total Revenue", d.executive.totalRevenue],
      ["Total GMV", d.executive.gmv],
      ["MRR", d.companyHealth.mrr],
      ["Health Score", d.companyHealth.healthScore],
      ["Developers", d.executive.totalDevelopers],
      ["Channel Partners", d.executive.totalCPs],
      ["Buyers", d.executive.totalBuyers],
      ["Active Listings", d.executive.activeListings],
      ["Leads Today", d.sales.leadsToday],
      ["Qualified Leads", d.sales.qualifiedLeads],
      ["Bookings", d.sales.bookings],
      ["Conversion %", d.sales.conversionRate],
      ["Verified Projects", d.projects.verified],
      ["Pending Approvals", d.verification.pendingProjects],
    ];
    if (fin?.hasData) {
      rows.push(["Net Cash Flow", fin.netCashFlow], ["Bank Balance", fin.bankBalance], ["Receivables", fin.receivables], ["Payables", fin.payables], ["Net Profit", fin.netProfit]);
    }
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `truvi-report-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success("Report exported");
  }
  return (
    <section className="page">
      <div className="page-header">
        <div><div className="page-title">Reports</div><div className="page-sub">Founder-ready snapshots from live data</div></div>
        <div className="header-actions">
          <button className="btn" onClick={() => window.print()}><Ic n="book" /> Print</button>
          <button className="btn btn-primary" onClick={downloadCsv}><Ic n="arrow" /> Export CSV</button>
        </div>
      </div>
      <div className="kpi-grid">
        <Kpi icon="wallet" tone="blue" label="Total Revenue" value={formatCompactINR(d.executive.totalRevenue)} />
        <Kpi icon="chart" tone="green" label="Total GMV" value={formatCompactINR(d.executive.gmv)} />
        <Kpi icon="spark" tone="blue" label="MRR" value={formatINR(d.companyHealth.mrr)} />
        <Kpi icon="target" tone="green" label="Conversion" value={`${d.sales.conversionRate}%`} />
        <Kpi icon="trophy" tone="blue" label="Health Score" value={`${d.companyHealth.healthScore}/100`} />
        <Kpi icon="users" tone="blue" label="Network" value={String(d.executive.totalCPs + d.executive.totalDevelopers)} foot={`${d.executive.totalCPs} CPs · ${d.executive.totalDevelopers} devs`} />
      </div>
      <Panel title="Executive summary" sub="Snapshot exported by the buttons above" icon="grid" iconTone="blue">
        <div className="table-wrap"><table>
          <tbody>
            <tr><td>Revenue (all-time)</td><td><b>{formatINR(d.executive.totalRevenue)}</b></td></tr>
            <tr><td>GMV routed</td><td><b>{formatINR(d.executive.gmv)}</b></td></tr>
            <tr><td>Active listings</td><td><b>{d.executive.activeListings}</b> ({d.projects.verified} verified)</td></tr>
            <tr><td>Sales pipeline</td><td><b>{d.sales.qualifiedLeads}</b> qualified · {d.sales.bookings} bookings · {d.sales.conversionRate}% conversion</td></tr>
            <tr><td>Network</td><td><b>{d.executive.totalCPs}</b> CPs · {d.executive.totalDevelopers} developers · {d.executive.totalBuyers} buyers</td></tr>
            {fin?.hasData && <tr><td>Cash position</td><td><b>{formatINR(fin.bankBalance)}</b> bank · {formatINR(fin.netCashFlow)} net flow</td></tr>}
          </tbody>
        </table></div>
      </Panel>
    </section>
  );
}

/* -------------------------------------------------------------- copilot */
function Copilot({ open, setOpen }: { open: boolean; setOpen: (v: boolean) => void }) {
  const suggestions = [
    "Show today's revenue",
    "Top performing project batao",
    "Pending approvals kitne hain?",
    "Is month ka profit kitna hua?",
    "Cash flow risk hai kya?",
    "Kaunsa project slow chal raha hai?",
    "Agle 90 din ki revenue prediction dikhao",
    "Top CP kaun hai?",
  ];
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
