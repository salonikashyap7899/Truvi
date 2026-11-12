import { Suspense, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { formatINR, nameOf } from "@/lib/utils";
import { toast } from "sonner";
import { Ic, Kpi, Panel } from "@/pages/dashboard/DashboardOS";
import { NotificationBell } from "@/components/NotificationBell";
import UserMenu from "@/components/UserMenu";
import ProfileSettingsModal from "@/components/ProfileSettingsModal";
import type { Project } from "@/types";
import { InNavbarContext, useNavChrome } from "@/lib/navChrome";
import "@/styles/founder-os.css";

/**
 * Admin OS — the SAME founder-style interface (sidebar, top bar, KPI cards,
 * panels) wrapping the admin panel's own existing features. It works like a
 * single-page app (think Gmail): `AdminOsLayout` stays on screen for every
 * /admin route, and choosing a module in the sidebar swaps only the content
 * area (`<Outlet />`), without leaving the dashboard. `AdminOsDashboardPage`
 * is the home view (stats, approvals, activity). Founder-only sections are
 * not shown here.
 */

interface InvestorMetrics {
  totalBuyers: number; totalDevelopers: number; totalCPs: number; activeUsers: number; newUsers30d: number;
  mrrPaise: number; arrPaise: number; totalRevenuePaise: number; ltvPaise: number; cacPaise: number;
  churnPercent: number; conversionPercent: number; payingUsers: number; gmvPaise: number;
}

/** Subset of /admin/founder-overview used for the live "operations today" row. */
interface OpsOverview {
  companyHealth: { revenueToday: number };
  sales: { leadsToday: number };
  executive: { todaysBookings: number };
  verification: { pendingProjects: number; pendingLegal: number; pendingKyc: number };
}

interface ActivityLog {
  action: string;
  metadata: Record<string, any> | null;
  createdAt: string;
  actor: { name: string; role: string } | null;
}

interface KpiTrends {
  users: number;
  projects: number;
  platformFeeRevenue: number;
  leadRevenue: number;
}

interface DashboardUserAddition {
  _id: string;
  name: string;
  role?: string;
  createdAt?: string | null;
}

type DashboardProjectAddition = Project & { createdAt?: string | null };

interface GrowthDay {
  key: string;
  label: string;
  users: number;
  projects: number;
}

/** Growth badge for a KPI card ("↑ 27% this month"), or flat when no growth. */
function trendBadge(pct?: number): { text: string; up?: boolean } | undefined {
  if (pct === undefined) return undefined;
  return pct > 0 ? { text: `↑ ${pct}%`, up: true } : { text: "Flat", up: false };
}

const paise = (p: number) => formatINR(Math.round(p / 100));
const initials = (s: string) => s.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

/** Human-readable one-liner for an audit-log entry, for the activity feed. */
function activityText(a: ActivityLog): string {
  const m = a.metadata || {};
  switch (a.action) {
    case "project.update":
      if (m.approvalStatus === "APPROVED") return "approved a listing";
      if (m.approvalStatus === "REJECTED") return "rejected a listing";
      if (m.isVerified === true) return "marked a project verified";
      return "updated a project";
    case "project.delete": return `deleted project ${m.name ?? ""}`.trim();
    case "project.score.adjust": return `set the Truvi Score adjustment of ${m.name ?? "a project"} to ${Number(m.to) > 0 ? "+" : ""}${m.to ?? 0}`;
    case "kyc.approve": return "approved a CP's KYC";
    case "kyc.reject": return "rejected a CP's KYC";
    case "user.disable": return `deactivated ${m.name ?? "a user"}`;
    case "user.enable": return `reactivated ${m.name ?? "a user"}`;
    case "lead.stage.update": return `moved a lead to ${String(m.to ?? "").toLowerCase().replace(/_/g, " ")}`.trim();
    case "commission.milestone.release": return "released a commission milestone";
    case "finance.entry.create": return "added a finance entry";
    case "finance.entry.delete": return "removed a finance entry";
    case "settings.platform_fee.update": return "updated the platform fee";
    case "academy.content.create": return "added learning content";
    case "academy.content.delete": return "removed learning content";
    case "ai.ask": return "used Ask Truvi AI";
    default: return a.action.replace(/[._]/g, " ");
  }
}

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function createdAtMs(value?: string | null): number | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function indiaDayKey(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function formatIndiaDateTime(value?: string | null): string {
  const timestamp = createdAtMs(value);
  if (timestamp === null) return "Date not recorded";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function buildGrowthDays(
  users: DashboardUserAddition[],
  projects: DashboardProjectAddition[],
  now = new Date(),
): GrowthDay[] {
  const todayParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(now);
  const dateParts = Object.fromEntries(todayParts.map((part) => [part.type, part.value]));
  const todayUtc = Date.UTC(Number(dateParts.year), Number(dateParts.month) - 1, Number(dateParts.day));

  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(todayUtc + (index - 6) * 86_400_000 + 12 * 60 * 60 * 1000);
    return {
      key: indiaDayKey(date),
      label: new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short" }).format(date),
      users: 0,
      projects: 0,
    };
  });
  const dayByKey = new Map(days.map((day) => [day.key, day]));

  for (const user of users) {
    const timestamp = createdAtMs(user.createdAt);
    if (timestamp === null) continue;
    const day = dayByKey.get(indiaDayKey(new Date(timestamp)));
    if (day) day.users += 1;
  }
  for (const project of projects) {
    const timestamp = createdAtMs(project.createdAt);
    if (timestamp === null) continue;
    const day = dayByKey.get(indiaDayKey(new Date(timestamp)));
    if (day) day.projects += 1;
  }
  return days;
}

/** Sidebar links map to the admin panel's real workspaces (existing features). */
const WORKSPACES: { label: string; icon: string; path: string }[] = [
  { label: "Users", icon: "users", path: "/admin/users" },
  { label: "Employee Management", icon: "users", path: "/admin/employees" },
  { label: "Listings", icon: "building", path: "/admin/listings" },
  { label: "Habitat", icon: "building", path: "/admin/habitat" },
  { label: "Truvi Scores", icon: "chart", path: "/admin/scores" },
  { label: "Leads", icon: "target", path: "/admin/leads" },
  { label: "Offers", icon: "wallet", path: "/admin/offers" },
  { label: "Meetings", icon: "users", path: "/admin/meetings" },
  { label: "Enquiries", icon: "spark", path: "/admin/enquiries" },
  { label: "Call Management", icon: "spark", path: "/admin/calls" },
  { label: "Verification", icon: "shield", path: "/admin/verification" },
  { label: "CP KYC", icon: "users", path: "/admin/kyc" },
  { label: "Referral Leads", icon: "users", path: "/admin/referral-leads" },
  { label: "Documents", icon: "verification", path: "/admin/documents" },
  { label: "Revenue", icon: "wallet", path: "/admin/revenue" },
  { label: "Vouchers", icon: "wallet", path: "/admin/vouchers" },
  { label: "Finance", icon: "chart", path: "/admin/finance" },
  { label: "Payments", icon: "target", path: "/admin/payments" },
  { label: "Marketing", icon: "spark", path: "/admin/marketing" },
  { label: "Marketing OS", icon: "chart", path: "/admin/marketing-os" },
  { label: "Notifications", icon: "spark", path: "/admin/notifications" },
  { label: "Requirements", icon: "target", path: "/admin/requirements" },
  { label: "Commissions", icon: "wallet", path: "/admin/commissions" },
  { label: "Investments", icon: "chart", path: "/admin/investments" },
  { label: "Ambassador Tasks", icon: "trophy", path: "/admin/ambassador-tasks" },
  { label: "Ambassador OS", icon: "users", path: "/admin/ambassador-operating-system" },
  { label: "Learning Hub", icon: "book", path: "/admin/academy" },
  { label: "Compliance Centre", icon: "shield", path: "/admin/compliance" },
  { label: "Ambassador Hub", icon: "book", path: "/admin/ambassador-knowledge" },
  { label: "Settings", icon: "grid", path: "/admin/settings" },
];

/** Persistent admin shell: sidebar + top bar around the current module. */
export function AdminOsLayout() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [allUsers, setAllUsers] = useState<Array<{ _id: string; name: string; email?: string; phone?: string; role?: string }>>([]);
  const [searchLoaded, setSearchLoaded] = useState(false);
  const [q, setQ] = useState("");
  const [light, setLight] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Bumped by the refresh button to reload whichever module is open.
  const [refreshKey, setRefreshKey] = useState(0);
  const mountNav = useNavChrome((s) => s.mount);
  const unmountNav = useNavChrome((s) => s.unmount);

  // The shell's top bar carries the account menu, so a module's own header
  // copy of it hides (same mechanism as the site navbar).
  useLayoutEffect(() => {
    mountNav(false);
    return () => unmountNav(false);
  }, [mountNav, unmountNav]);

  const isHome = pathname === "/admin/dashboard";

  function doLogout() { clearAuth(); navigate("/login"); }
  function goto(path: string) { setNavOpen(false); setQ(""); navigate(path); }

  // Search data is fetched the first time someone types in the search box.
  function ensureSearchData() {
    if (searchLoaded) return;
    setSearchLoaded(true);
    api.get("/admin/projects").then((res) => setAllProjects(res.data.projects ?? [])).catch(() => {});
    api.get("/admin/users").then((res) => setAllUsers(res.data.users ?? [])).catch(() => {});
  }

  // Live search over projects + users; results open the right admin module.
  // Needs ≥2 chars so it doesn't flash on a single keystroke.
  const query = q.trim().toLowerCase();
  const results = query.length >= 2
    ? [
        ...allProjects
          .filter((p) => `${p.name} ${p.city ?? ""} ${p.location ?? ""}`.toLowerCase().includes(query))
          .slice(0, 5)
          .map((p) => ({ key: `p${p._id}`, kind: "Project", title: p.name, sub: [p.city, p.location].filter(Boolean).join(", "), href: `/admin/listings/${p._id}` })),
        ...allUsers
          .filter((u) => `${u.name} ${u.email ?? ""} ${u.phone ?? ""}`.toLowerCase().includes(query))
          .slice(0, 5)
          .map((u) => ({ key: `u${u._id}`, kind: u.role ? u.role.charAt(0) + u.role.slice(1).toLowerCase() : "User", title: u.name, sub: [u.email, u.phone].filter(Boolean).join(" · "), href: `/admin/users/${u._id}` })),
      ].slice(0, 8)
    : [];

  const isActive = (path: string) => pathname === path || pathname.startsWith(`${path}/`);

  return (
    // Light mode only restyles the home view; modules keep their dark design.
    <div className={`founder-os admin-os-shell ${light && isHome ? "light" : ""}`}>
      <div className={`os-overlay ${navOpen ? "show" : ""}`} onClick={() => setNavOpen(false)} />

      {/* Sidebar */}
      <aside className={`sidebar ${navOpen ? "open" : ""}`}>
        <div className="brand">
          <div className="brand-mark"><img src="/brand/icon.png" alt="" /></div>
          <div className="brand-copy">
            <div className="brand-text">Truvi</div>
            <div className="brand-sub">Admin OS</div>
          </div>
        </div>
        <nav className="nav-scroll">
          <div>
            <div className="nav-group-label">Command</div>
            <button className={`nav-item ${isHome ? "active" : ""}`} onClick={() => goto("/admin/dashboard")}><Ic n="grid" /><span>Dashboard</span></button>
          </div>
          <div>
            <div className="nav-group-label">Workspaces</div>
            {WORKSPACES.map((w) => (
              <button key={w.path} className={`nav-item ${isActive(w.path) ? "active" : ""}`} onClick={() => goto(w.path)}>
                <Ic n={w.icon} /><span>{w.label}</span>
              </button>
            ))}
          </div>
        </nav>
        <div className="sidebar-foot">
          <button className="logout-btn" onClick={doLogout}><Ic n="logout" /> Sign out</button>
        </div>
      </aside>

      {/* Main */}
      <div className="os-main">
        <header className="topbar">
          <button className="menu-toggle" onClick={() => setNavOpen(true)}><Ic n="grid" /></button>
          <div className="search-wrap">
            <Ic n="search" />
            <input
              value={q}
              onFocus={ensureSearchData}
              onChange={(e) => { ensureSearchData(); setQ(e.target.value); }}
              placeholder="Search projects, users…"
              onKeyDown={(e) => { if (e.key === "Enter" && results[0]) goto(results[0].href); }}
            />
            {results.length > 0 && (
              <div className="search-results">
                {results.map((r) => (
                  <button key={r.key} className="search-result" onMouseDown={() => goto(r.href)}>
                    <span className="sr-title">{r.title}</span>
                    <span className="sr-sub">{r.kind}{r.sub ? ` · ${r.sub}` : ""}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="top-actions">
            {isHome && (
              <button className="theme-toggle" onClick={() => setLight((v) => !v)} aria-label="Toggle theme"><span className="knob"><Ic n="sun" /></span></button>
            )}
            <button className="icon-btn" onClick={() => setRefreshKey((k) => k + 1)} title="Refresh"><Ic n="refresh" /></button>
            <button className="icon-btn" title="Profile settings" onClick={() => setSettingsOpen(true)}><Ic n="cog" /></button>
            <NotificationBell />
            <div className="divider-v" />
            <InNavbarContext.Provider value={true}>
              <UserMenu />
            </InNavbarContext.Provider>
          </div>
        </header>

        <div className="content">
          {/* Only this area changes when a module is picked — the shell stays. */}
          <Suspense fallback={<p className="os-loading">Loading…</p>}>
            <div key={`${pathname}:${refreshKey}`} className={isHome ? undefined : "os-embedded"}>
              <Outlet />
            </div>
          </Suspense>
        </div>
      </div>

      <ProfileSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}

/** Admin home: platform stats, live metrics, pending approvals and activity. */
export default function AdminOsDashboardPage() {
  const navigate = useNavigate();
  const [pendingProjects, setPendingProjects] = useState<Project[]>([]);
  const [stats, setStats] = useState({ totalUsers: 0, totalProjects: 0, platformFees: 0, leadRevenue: 0 });
  const [platformUsers, setPlatformUsers] = useState<DashboardUserAddition[]>([]);
  const [platformProjects, setPlatformProjects] = useState<DashboardProjectAddition[]>([]);
  const [investor, setInvestor] = useState<InvestorMetrics | null>(null);
  const [overview, setOverview] = useState<OpsOverview | null>(null);
  const [activity, setActivity] = useState<ActivityLog[]>([]);
  const [trends, setTrends] = useState<KpiTrends | null>(null);
  const [leadStats, setLeadStats] = useState<{ total: number; new: number; visitsScheduled: number; visitsCompleted: number; converted: number } | null>(null);

  // Each section loads independently and resiliently — the dashboard renders
  // instantly (no blocking spinner) and one slow/failed endpoint never blanks
  // the rest or throws a scary "failed to load" for the whole page.
  function load() {
    api.get("/admin/projects", { params: { approvalStatus: "PENDING" } })
      .then((res) => setPendingProjects(res.data.projects)).catch(() => {});
    api.get("/admin/users", { params: { all: "true" } })
      .then((res) => {
        const users = (res.data.users ?? []) as DashboardUserAddition[];
        setPlatformUsers(users);
        setStats((s) => ({ ...s, totalUsers: users.length }));
      }).catch(() => {});
    api.get("/admin/projects")
      .then((res) => {
        const projects = (res.data.projects ?? []) as DashboardProjectAddition[];
        setPlatformProjects(projects);
        setStats((s) => ({ ...s, totalProjects: projects.length }));
      }).catch(() => {});
    api.get("/revenue")
      .then((res) => setStats((s) => ({ ...s, platformFees: res.data.platformFeeRevenue, leadRevenue: res.data.leadServiceRevenue }))).catch(() => {});
    api.get("/admin/investor-metrics").then((res) => setInvestor(res.data.metrics)).catch(() => {});
    api.get("/admin/founder-overview").then((res) => setOverview(res.data)).catch(() => {});
    api.get("/admin/audit-logs", { params: { limit: 8 } }).then((res) => setActivity(res.data.logs)).catch(() => {});
    api.get("/admin/kpi-trends").then((res) => setTrends(res.data.trends)).catch(() => {});
    api.get("/leads/admin/stats").then((res) => setLeadStats(res.data.totals)).catch(() => {});
  }
  useEffect(() => { load(); }, []);

  const growthDays = useMemo(() => buildGrowthDays(platformUsers, platformProjects), [platformUsers, platformProjects]);
  const latestUsers = useMemo(
    () => [...platformUsers].filter((user) => createdAtMs(user.createdAt) !== null)
      .sort((a, b) => (createdAtMs(b.createdAt) ?? 0) - (createdAtMs(a.createdAt) ?? 0)).slice(0, 3),
    [platformUsers],
  );
  const latestProjects = useMemo(
    () => [...platformProjects].filter((project) => createdAtMs(project.createdAt) !== null)
      .sort((a, b) => (createdAtMs(b.createdAt) ?? 0) - (createdAtMs(a.createdAt) ?? 0)).slice(0, 3),
    [platformProjects],
  );
  const usersAddedIn7Days = growthDays.reduce((total, day) => total + day.users, 0);
  const projectsAddedIn7Days = growthDays.reduce((total, day) => total + day.projects, 0);
  const maxGrowthCount = Math.max(1, ...growthDays.map((day) => Math.max(day.users, day.projects)));

  async function approveProject(projectId: string, approvalStatus: "APPROVED" | "REJECTED") {
    try {
      await api.patch("/admin/projects", { projectId, approvalStatus });
      toast.success(`Project ${approvalStatus.toLowerCase()}`);
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Action failed");
    }
  }

  return (
    <section className="page admin-command-center">
      <div className="page-header">
        <div><div className="page-title">Admin Command Center</div></div>
        <div className="header-actions">
          <button className="btn" onClick={() => navigate("/admin/listings")}><Ic n="building" /> Manage listings</button>
          <button className="btn btn-primary" onClick={() => navigate("/developer/projects/new")}><Ic n="bolt" /> Add new project</button>
        </div>
      </div>

      {/* Platform stats */}
      <div className="kpi-grid">
        <Kpi icon="users" tone="blue" label="Total Users" value={String(stats.totalUsers)} trend={trendBadge(trends?.users)} foot="Manage · remove · cancel users" onClick={() => navigate("/admin/users")} />
        <Kpi icon="building" tone="amber" label="Total Projects" value={String(stats.totalProjects)} trend={trendBadge(trends?.projects)} foot="Open listings" onClick={() => navigate("/admin/listings")} />
        <Kpi icon="wallet" tone="green" label="Platform Fee Revenue" value={formatINR(stats.platformFees)} trend={trendBadge(trends?.platformFeeRevenue)} foot="Open revenue" onClick={() => navigate("/admin/revenue")} />
        <Kpi icon="chart" tone="blue" label="Lead Marketplace Revenue" value={formatINR(stats.leadRevenue)} trend={trendBadge(trends?.leadRevenue)} foot="Open revenue" onClick={() => navigate("/admin/revenue")} />
      </div>

      {/* Lead management — inventory + pipeline leads (opens the Leads module) */}
      {leadStats && (
        <div className="kpi-grid admin-five-column-grid">
          <Kpi icon="target" tone="blue" label="Total Leads" value={String(leadStats.total)} foot="Open lead management" onClick={() => navigate("/admin/leads")} />
          <Kpi icon="spark" tone="amber" label="New Leads" value={String(leadStats.new)} foot="Waiting to be contacted" onClick={() => navigate("/admin/leads?status=NEW")} />
          <Kpi icon="building" tone="blue" label="Visits Scheduled" value={String(leadStats.visitsScheduled)} foot="Upcoming site visits" onClick={() => navigate("/admin/leads?status=SITE_VISIT_SCHEDULED")} />
          <Kpi icon="shield" tone="green" label="Visits Completed" value={String(leadStats.visitsCompleted)} foot="Site visits done" onClick={() => navigate("/admin/leads?status=SITE_VISIT_COMPLETED")} />
          <Kpi icon="wallet" tone="green" label="Converted" value={String(leadStats.converted)} foot="Booked leads" onClick={() => navigate("/admin/leads?status=CONVERTED")} />
        </div>
      )}

      {/* Live account/project creation activity — derived from actual createdAt timestamps. */}
      <Panel title="Platform growth & recent additions" sub="New accounts and projects recorded by Truvi · dates shown in IST" icon="chart" iconTone="blue">
        <div className="admin-growth-summary">
          <div className="admin-growth-highlight">
            <div className="admin-growth-highlight__label">Users added · last 7 days</div>
            <div className="admin-growth-highlight__value">{usersAddedIn7Days}</div>
            <div className="admin-growth-highlight__detail">
              {latestUsers[0]
                ? `Latest: ${latestUsers[0].name} · ${latestUsers[0].role ?? "User"} · ${formatIndiaDateTime(latestUsers[0].createdAt)}`
                : "No user creation timestamp is available yet."}
            </div>
            <button type="button" className="admin-growth-link" onClick={() => navigate("/admin/users")}>View users <span aria-hidden="true">→</span></button>
          </div>
          <div className="admin-growth-highlight">
            <div className="admin-growth-highlight__label">Projects added · last 7 days</div>
            <div className="admin-growth-highlight__value">{projectsAddedIn7Days}</div>
            <div className="admin-growth-highlight__detail">
              {latestProjects[0]
                ? `Latest: ${latestProjects[0].name} · ${latestProjects[0].city || latestProjects[0].location || "Location not set"} · ${formatIndiaDateTime(latestProjects[0].createdAt)}`
                : "No project creation timestamp is available yet."}
            </div>
            <button type="button" className="admin-growth-link" onClick={() => navigate("/admin/listings")}>View listings <span aria-hidden="true">→</span></button>
          </div>
        </div>

        <div className="admin-growth-chart-card">
          <div className="admin-growth-chart-head">
            <div>
              <div className="admin-growth-chart-title">Daily additions</div>
              <div className="admin-growth-chart-subtitle">New users and projects · last 7 days</div>
            </div>
            <div className="admin-growth-legend">
              <span><i className="is-users" /> Users</span>
              <span><i className="is-projects" /> Projects</span>
            </div>
          </div>
          <div className="admin-growth-chart" role="img" aria-label="Daily new users and project additions for the last seven days">
            {growthDays.map((day) => (
              <div className="admin-growth-day" key={day.key}>
                <div className="admin-growth-day-total">{day.users + day.projects}</div>
                <div className="admin-growth-bars">
                  <div className="admin-growth-bar-track" title={`${day.users} new users`}>
                    <span className="is-users" style={{ height: day.users ? `${Math.max(8, (day.users / maxGrowthCount) * 100)}%` : "2px" }} />
                  </div>
                  <div className="admin-growth-bar-track" title={`${day.projects} new projects`}>
                    <span className="is-projects" style={{ height: day.projects ? `${Math.max(8, (day.projects / maxGrowthCount) * 100)}%` : "2px" }} />
                  </div>
                </div>
                <div className="admin-growth-day-label">{day.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="admin-growth-recent-grid">
          <section>
            <div className="admin-growth-list-title">Latest user accounts</div>
            {latestUsers.length === 0
              ? <p className="admin-growth-empty">No user creation dates available.</p>
              : latestUsers.map((user) => (
                <div className="admin-growth-list-row" key={user._id}>
                  <div className="admin-growth-list-avatar">{initials(user.name || "User")}</div>
                  <div className="admin-growth-list-copy">
                    <strong>{user.name || "Unnamed account"}</strong>
                    <span>{user.role ?? "User"}</span>
                  </div>
                  <time>{formatIndiaDateTime(user.createdAt)}</time>
                </div>
              ))}
          </section>
          <section>
            <div className="admin-growth-list-title">Latest projects added</div>
            {latestProjects.length === 0
              ? <p className="admin-growth-empty">No project creation dates available.</p>
              : latestProjects.map((project) => (
                <div className="admin-growth-list-row" key={project._id}>
                  <div className="admin-growth-list-avatar is-project">{initials(project.name || "Project")}</div>
                  <div className="admin-growth-list-copy">
                    <strong>{project.name || "Unnamed project"}</strong>
                    <span>{[project.city, project.location].filter(Boolean).join(" · ") || "Location not set"}</span>
                  </div>
                  <time>{formatIndiaDateTime(project.createdAt)}</time>
                </div>
              ))}
          </section>
        </div>
      </Panel>

      {/* Operations today — live counts (from founder-overview) */}
      {overview && (
        <div className="kpi-grid admin-five-column-grid">
          <Kpi icon="wallet" tone="green" label="Revenue Today" value={formatINR(overview.companyHealth.revenueToday)} foot="All sources · since 12am" onClick={() => navigate("/admin/revenue")} />
          <Kpi icon="spark" tone="blue" label="Leads Today" value={String(overview.sales.leadsToday)} foot="New leads captured" />
          <Kpi icon="target" tone="amber" label="Bookings Today" value={String(overview.executive.todaysBookings)} foot="Moved to booking" />
          <Kpi icon="users" tone="blue" label="Pending CP KYC" value={String(overview.verification.pendingKyc)} foot="Review identities" onClick={() => navigate("/admin/kyc")} />
          <Kpi icon="shield" tone="amber" label="Pending Verification" value={String(overview.verification.pendingProjects + overview.verification.pendingLegal)} foot="Projects + legal docs" onClick={() => navigate("/admin/verification")} />
        </div>
      )}

      {/* Investor / SaaS metrics — admin's existing live numbers */}
      {investor && (
        <Panel title="Platform metrics">
          <div className="kpi-grid admin-platform-metrics" style={{ marginBottom: 0 }}>
            <div><div className="kpi-label">Total Buyers</div><div className="kpi-value">{investor.totalBuyers}</div></div>
            <div><div className="kpi-label">Total Developers</div><div className="kpi-value">{investor.totalDevelopers}</div></div>
            <div><div className="kpi-label">Total CPs</div><div className="kpi-value">{investor.totalCPs}</div></div>
            <div><div className="kpi-label">Active Users</div><div className="kpi-value">{investor.activeUsers}</div></div>
            <div><div className="kpi-label">Paying Users</div><div className="kpi-value">{investor.payingUsers}</div></div>
            <div><div className="kpi-label">New Users (30d)</div><div className="kpi-value">{investor.newUsers30d}</div></div>
            <div><div className="kpi-label">MRR</div><div className="kpi-value" style={{ color: "var(--green-600)" }}>{paise(investor.mrrPaise)}</div></div>
            <div><div className="kpi-label">ARR</div><div className="kpi-value" style={{ color: "var(--green-600)" }}>{paise(investor.arrPaise)}</div></div>
            <div><div className="kpi-label">Total Revenue</div><div className="kpi-value">{paise(investor.totalRevenuePaise)}</div></div>
            <div><div className="kpi-label">LTV / CAC</div><div className="kpi-value">{paise(investor.ltvPaise)} / {paise(investor.cacPaise)}</div></div>
            <div><div className="kpi-label">Churn</div><div className="kpi-value">{investor.churnPercent}%</div></div>
            <div><div className="kpi-label">Conversion</div><div className="kpi-value">{investor.conversionPercent}%</div></div>
          </div>
        </Panel>
      )}

      {/* Pending project approvals — admin's existing action */}
      <Panel title={`Pending project approvals (${pendingProjects.length})`} sub="Approve or reject new listings">
        {pendingProjects.length === 0
          ? <p style={{ fontSize: 12.5, color: "var(--ink-500)" }}>🟢 Nothing pending.</p>
          : pendingProjects.map((p) => (
              <div className="list-row" key={p._id}>
                <div className="mini-avatar">{initials(p.name)}</div>
                <div style={{ flex: 1, minWidth: 140 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink-700)" }}>{p.name}</div>
                  <div style={{ fontSize: 11.5, color: "var(--ink-500)" }}>{p.city} · by {nameOf(p.developerId)}</div>
                </div>
                <div className="row-actions">
                  <button className="chip" onClick={() => navigate(`/admin/listings/${p._id}`)}>Edit</button>
                  <button className="btn btn-primary" onClick={() => approveProject(p._id, "APPROVED")}>Approve</button>
                  <button className="chip" style={{ color: "var(--red-500)", borderColor: "var(--red-100)" }} onClick={() => approveProject(p._id, "REJECTED")}>Reject</button>
                </div>
              </div>
            ))}
      </Panel>

      {/* Recent activity — live audit trail across the platform */}
      <Panel title="Recent activity" sub="Latest actions across the platform">
        {activity.length === 0
          ? <p style={{ fontSize: 12.5, color: "var(--ink-500)" }}>No recent activity yet.</p>
          : activity.map((a, i) => (
              <div className="list-row" key={i}>
                <div className="mini-avatar">{a.actor?.name ? initials(a.actor.name) : "•"}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, color: "var(--ink-700)" }}>
                    <b>{a.actor?.name ?? "Someone"}</b> {activityText(a)}
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--ink-500)" }}>
                    {a.actor?.role ? `${a.actor.role} · ` : ""}{timeAgo(a.createdAt)}
                  </div>
                </div>
              </div>
            ))}
      </Panel>
    </section>
  );
}
