import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { formatINR, nameOf } from "@/lib/utils";
import { toast } from "sonner";
import { Ic, Kpi, Panel } from "@/pages/dashboard/DashboardOS";
import { NotificationBell } from "@/components/NotificationBell";
import UserMenu from "@/components/UserMenu";
import type { Project } from "@/types";
import "@/styles/founder-os.css";

/**
 * Admin Dashboard — the SAME founder-style OS interface (sidebar, top bar,
 * KPI cards, panels), but wrapping the admin panel's own existing features:
 * platform stats, live investor/SaaS metrics, pending project approvals with
 * approve/reject, and quick links into the admin workspaces. Nothing about the
 * admin feature set changes — only the UI is brought in line with the Founder
 * dashboard. Founder-only sections are not shown here.
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

/** Growth badge for a KPI card ("↑ 27% this month"), or flat when no growth. */
function trendBadge(pct?: number): { text: string; up?: boolean } | undefined {
  if (pct === undefined) return undefined;
  return pct > 0 ? { text: `↑ ${pct}% this month`, up: true } : { text: "flat this month", up: false };
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

/** Sidebar links map to the admin panel's real workspaces (existing features). */
const WORKSPACES: { label: string; icon: string; path: string }[] = [
  { label: "Users", icon: "users", path: "/admin/users" },
  { label: "Listings", icon: "building", path: "/admin/listings" },
  { label: "Enquiries", icon: "spark", path: "/admin/enquiries" },
  { label: "Verification", icon: "shield", path: "/admin/verification" },
  { label: "CP KYC", icon: "users", path: "/admin/kyc" },
  { label: "Referral Leads", icon: "users", path: "/admin/referral-leads" },
  { label: "Documents", icon: "verification", path: "/admin/documents" },
  { label: "Revenue", icon: "wallet", path: "/admin/revenue" },
  { label: "Finance", icon: "chart", path: "/admin/finance" },
  { label: "Payments", icon: "target", path: "/admin/payments" },
  { label: "Ambassador Tasks", icon: "trophy", path: "/admin/ambassador-tasks" },
  { label: "Learning Hub", icon: "book", path: "/admin/academy" },
  { label: "Settings", icon: "grid", path: "/admin/settings" },
];

export default function AdminOsDashboardPage() {
  const navigate = useNavigate();
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const [pendingProjects, setPendingProjects] = useState<Project[]>([]);
  const [stats, setStats] = useState({ totalUsers: 0, totalProjects: 0, platformFees: 0, leadRevenue: 0 });
  const [investor, setInvestor] = useState<InvestorMetrics | null>(null);
  const [overview, setOverview] = useState<OpsOverview | null>(null);
  const [activity, setActivity] = useState<ActivityLog[]>([]);
  const [trends, setTrends] = useState<KpiTrends | null>(null);
  const [light, setLight] = useState(false);
  const [navOpen, setNavOpen] = useState(false);

  // Each section loads independently and resiliently — the dashboard renders
  // instantly (no blocking spinner) and one slow/failed endpoint never blanks
  // the rest or throws a scary "failed to load" for the whole page.
  function load() {
    api.get("/admin/projects", { params: { approvalStatus: "PENDING" } })
      .then((res) => setPendingProjects(res.data.projects)).catch(() => {});
    api.get("/admin/users")
      .then((res) => setStats((s) => ({ ...s, totalUsers: res.data.users.length }))).catch(() => {});
    api.get("/admin/projects")
      .then((res) => setStats((s) => ({ ...s, totalProjects: res.data.projects.length }))).catch(() => {});
    api.get("/revenue")
      .then((res) => setStats((s) => ({ ...s, platformFees: res.data.platformFeeRevenue, leadRevenue: res.data.leadServiceRevenue }))).catch(() => {});
    api.get("/admin/investor-metrics").then((res) => setInvestor(res.data.metrics)).catch(() => {});
    api.get("/admin/founder-overview").then((res) => setOverview(res.data)).catch(() => {});
    api.get("/admin/audit-logs", { params: { limit: 8 } }).then((res) => setActivity(res.data.logs)).catch(() => {});
    api.get("/admin/kpi-trends").then((res) => setTrends(res.data.trends)).catch(() => {});
  }
  useEffect(() => { load(); }, []);

  async function approveProject(projectId: string, approvalStatus: "APPROVED" | "REJECTED") {
    try {
      await api.patch("/admin/projects", { projectId, approvalStatus });
      toast.success(`Project ${approvalStatus.toLowerCase()}`);
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Action failed");
    }
  }

  function doLogout() { clearAuth(); navigate("/login"); }
  function goto(path: string) { setNavOpen(false); navigate(path); }

  return (
    <div className={`founder-os ${light ? "light" : ""}`}>
      <div className={`os-overlay ${navOpen ? "show" : ""}`} onClick={() => setNavOpen(false)} />

      {/* Sidebar */}
      <aside className={`sidebar ${navOpen ? "open" : ""}`}>
        <div className="brand">
          <div className="brand-mark">T</div>
          <div><div className="brand-text">Truvi</div><div className="brand-sub">Admin OS</div></div>
        </div>
        <nav className="nav-scroll">
          <div>
            <div className="nav-group-label">Command</div>
            <button className="nav-item active"><Ic n="grid" /><span>Dashboard</span></button>
          </div>
          <div>
            <div className="nav-group-label">Workspaces</div>
            {WORKSPACES.map((w) => (
              <button key={w.path} className="nav-item" onClick={() => goto(w.path)}>
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
          <div className="search-wrap"><Ic n="search" /><input placeholder="Search projects, CPs, leads…" /></div>
          <div className="top-actions">
            <button className="theme-toggle" onClick={() => setLight((v) => !v)} aria-label="Toggle theme"><span className="knob"><Ic n="sun" /></span></button>
            <button className="icon-btn" onClick={load} title="Refresh"><Ic n="refresh" /></button>
            <NotificationBell />
            <div className="divider-v" />
            <UserMenu />
          </div>
        </header>

        <div className="content">
          <section className="page">
            <div className="page-header">
              <div><div className="page-title">Admin Command Center</div><div className="page-sub">Platform-wide oversight: listings, verification &amp; revenue · Live data</div></div>
              <div className="header-actions">
                <button className="btn" onClick={() => navigate("/admin/listings")}><Ic n="building" /> Manage listings</button>
                <button className="btn btn-primary" onClick={() => navigate("/developer/projects/new")}><Ic n="bolt" /> Add new project</button>
              </div>
            </div>

            {/* Platform stats */}
            <div className="kpi-grid">
              <Kpi icon="users" tone="blue" label="Total Users" value={String(stats.totalUsers)} trend={trendBadge(trends?.users)} foot="Manage · remove · cancel plans" onClick={() => navigate("/admin/users")} />
              <Kpi icon="building" tone="amber" label="Total Projects" value={String(stats.totalProjects)} trend={trendBadge(trends?.projects)} foot="Open listings" onClick={() => navigate("/admin/listings")} />
              <Kpi icon="wallet" tone="green" label="Platform Fee Revenue" value={formatINR(stats.platformFees)} trend={trendBadge(trends?.platformFeeRevenue)} foot="Open revenue" onClick={() => navigate("/admin/revenue")} />
              <Kpi icon="chart" tone="blue" label="Lead Marketplace Revenue" value={formatINR(stats.leadRevenue)} trend={trendBadge(trends?.leadRevenue)} foot="Open revenue" onClick={() => navigate("/admin/revenue")} />
            </div>

            {/* Operations today — live counts (from founder-overview) */}
            {overview && (
              <div className="kpi-grid">
                <Kpi icon="wallet" tone="green" label="Revenue Today" value={formatINR(overview.companyHealth.revenueToday)} foot="All sources · since 12am" onClick={() => navigate("/admin/revenue")} />
                <Kpi icon="spark" tone="blue" label="Leads Today" value={String(overview.sales.leadsToday)} foot="New leads captured" />
                <Kpi icon="target" tone="amber" label="Bookings Today" value={String(overview.executive.todaysBookings)} foot="Moved to booking" />
                <Kpi icon="users" tone="blue" label="Pending CP KYC" value={String(overview.verification.pendingKyc)} foot="Review identities" onClick={() => navigate("/admin/kyc")} />
                <Kpi icon="shield" tone="amber" label="Pending Verification" value={String(overview.verification.pendingProjects + overview.verification.pendingLegal)} foot="Projects + legal docs" onClick={() => navigate("/admin/verification")} />
              </div>
            )}

            {/* Investor / SaaS metrics — admin's existing live numbers */}
            {investor && (
              <Panel title="Platform metrics" sub="Live SaaS + marketplace numbers">
                <div className="kpi-grid" style={{ marginBottom: 0 }}>
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
                <p style={{ marginTop: 12, fontSize: 11.5, color: "var(--ink-500)" }}>GMV (booking value routed through Truvi): {paise(investor.gmvPaise)}</p>
              </Panel>
            )}

            {/* Pending project approvals — admin's existing action */}
            <Panel title={`Pending project approvals (${pendingProjects.length})`} sub="Approve or reject new listings">
              {pendingProjects.length === 0
                ? <p style={{ fontSize: 12.5, color: "var(--ink-500)" }}>🟢 Nothing pending.</p>
                : pendingProjects.map((p) => (
                    <div className="list-row" key={p._id}>
                      <div className="mini-avatar">{initials(p.name)}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink-700)" }}>{p.name}</div>
                        <div style={{ fontSize: 11.5, color: "var(--ink-500)" }}>{p.city} · by {nameOf(p.developerId)}</div>
                      </div>
                      <button className="chip" onClick={() => navigate(`/admin/listings/${p._id}`)}>Edit</button>
                      <button className="btn btn-primary" onClick={() => approveProject(p._id, "APPROVED")}>Approve</button>
                      <button className="chip" style={{ color: "var(--red-500)", borderColor: "var(--red-100)" }} onClick={() => approveProject(p._id, "REJECTED")}>Reject</button>
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

            {/* Quick links to the admin workspaces */}
            <Panel title="Workspaces" sub="Jump into any admin module">
              <div className="workspace-links">
                {WORKSPACES.map((w) => (
                  <button key={w.path} className="workspace-link" onClick={() => navigate(w.path)}>
                    <Ic n={w.icon} /><span>{w.label}</span><Ic n="arrow" />
                  </button>
                ))}
              </div>
            </Panel>
          </section>
        </div>
      </div>
    </div>
  );
}
