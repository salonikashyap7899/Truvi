import { Suspense, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { formatINR, nameOf } from "@/lib/utils";
import { toast } from "sonner";
import { NotificationBell } from "@/components/NotificationBell";
import UserMenu from "@/components/UserMenu";
import ProfileSettingsModal from "@/components/ProfileSettingsModal";
import { useTheme, ThemeToggle } from "@/components/theme/ThemeProvider";
import { DashboardSkeleton } from "@/components/ui/PageSkeleton";
import type { Project } from "@/types";
import { InNavbarContext, useNavChrome } from "@/lib/navChrome";
import {
  LayoutDashboard,
  Users,
  UserCheck,
  Building2,
  Target,
  Wallet,
  ShieldCheck,
  TrendingUp,
  CreditCard,
  Megaphone,
  Bell,
  Trophy,
  Settings,
  LogOut,
  Search,
  RefreshCw,
  Calendar,
  ChevronRight,
  ArrowRight,
  CheckCircle2,
  Clock,
  Eye,
  Plus,
  PhoneCall,
  Compass,
  FileCheck,
  FolderOpen,
  ShieldAlert,
  Home,
  BarChart3,
  Contact,
  UserPlus,
  ClipboardList,
  BadgePercent,
  MessageSquare,
  Landmark,
  Ticket,
  PiggyBank,
  Users2,
  BookMarked,
  GraduationCap,
  Check,
  X,
  Activity,
  Menu,
  Inbox,
} from "lucide-react";
import "@/styles/founder-os.css";

/**
 * Admin OS — Clean, crisp, minimal Desktop Admin Command Center.
 * Removed all decorative pill badges, sparkles, AI buzzwords, and extra fluff lines.
 */

interface InvestorMetrics {
  totalBuyers: number;
  totalDevelopers: number;
  totalCPs: number;
  activeUsers: number;
  newUsers30d: number;
  mrrPaise: number;
  arrPaise: number;
  totalRevenuePaise: number;
  ltvPaise: number;
  cacPaise: number;
  churnPercent: number;
  conversionPercent: number;
  payingUsers: number;
  gmvPaise: number;
}

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

function trendBadge(pct?: number): { text: string; up?: boolean } | undefined {
  if (pct === undefined) return undefined;
  return pct > 0 ? { text: `+${pct}%`, up: true } : { text: "0%", up: false };
}

const paise = (p: number) => formatINR(Math.round(p / 100));
const initials = (s: string) =>
  s
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

function activityText(a: ActivityLog): string {
  const m = a.metadata || {};
  switch (a.action) {
    case "project.update":
      if (m.approvalStatus === "APPROVED") return "approved a listing";
      if (m.approvalStatus === "REJECTED") return "rejected a listing";
      if (m.isVerified === true) return "marked a project verified";
      return "updated a project";
    case "project.delete":
      return `deleted project ${m.name ?? ""}`.trim();
    case "project.score.adjust":
      return `set score adjustment of ${m.name ?? "project"} to ${Number(m.to) > 0 ? "+" : ""}${m.to ?? 0}`;
    case "kyc.approve":
      return "approved CP KYC";
    case "kyc.reject":
      return "rejected CP KYC";
    case "user.disable":
      return `deactivated ${m.name ?? "a user"}`;
    case "user.enable":
      return `reactivated ${m.name ?? "a user"}`;
    case "lead.stage.update":
      return `moved lead to ${String(m.to ?? "").toLowerCase().replace(/_/g, " ")}`.trim();
    case "commission.milestone.release":
      return "released commission milestone";
    case "finance.entry.create":
      return "added finance entry";
    case "finance.entry.delete":
      return "removed finance entry";
    case "settings.platform_fee.update":
      return "updated platform fee";
    case "academy.content.create":
      return "added learning content";
    case "academy.content.delete":
      return "removed learning content";
    case "ai.ask":
      return "used search/ask";
    default:
      return a.action.replace(/[._]/g, " ");
  }
}

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
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

interface WorkspaceLink {
  label: string;
  icon: any;
  path: string;
  group: "Governance" | "Inventory" | "Pipeline" | "Capital" | "Network";
}

const WORKSPACES: WorkspaceLink[] = [
  // Governance & Core
  { label: "Users", icon: Users, path: "/admin/users", group: "Governance" },
  { label: "Employee Management", icon: UserCheck, path: "/admin/employees", group: "Governance" },
  { label: "Verification", icon: ShieldCheck, path: "/admin/verification", group: "Governance" },
  { label: "CP KYC", icon: FileCheck, path: "/admin/kyc", group: "Governance" },
  { label: "Documents", icon: FolderOpen, path: "/admin/documents", group: "Governance" },
  { label: "Compliance Centre", icon: ShieldAlert, path: "/admin/compliance", group: "Governance" },
  { label: "Settings", icon: Settings, path: "/admin/settings", group: "Governance" },

  // Inventory & Quality
  { label: "Listings", icon: Building2, path: "/admin/listings", group: "Inventory" },
  { label: "Habitat", icon: Home, path: "/admin/habitat", group: "Inventory" },
  { label: "Truvi Scores", icon: BarChart3, path: "/admin/scores", group: "Inventory" },

  // Pipeline & Deals
  { label: "Leads", icon: Target, path: "/admin/leads", group: "Pipeline" },
  { label: "Buyer CRM", icon: Contact, path: "/admin/buyer-crm", group: "Pipeline" },
  { label: "Referral Leads", icon: UserPlus, path: "/admin/referral-leads", group: "Pipeline" },
  { label: "Requirements", icon: ClipboardList, path: "/admin/requirements", group: "Pipeline" },
  { label: "Offers", icon: BadgePercent, path: "/admin/offers", group: "Pipeline" },
  { label: "Meetings", icon: Calendar, path: "/admin/meetings", group: "Pipeline" },
  { label: "Enquiries", icon: MessageSquare, path: "/admin/enquiries", group: "Pipeline" },
  { label: "Call Management", icon: PhoneCall, path: "/admin/calls", group: "Pipeline" },

  // Capital & Growth
  { label: "Revenue", icon: TrendingUp, path: "/admin/revenue", group: "Capital" },
  { label: "Finance", icon: Landmark, path: "/admin/finance", group: "Capital" },
  { label: "Payments", icon: CreditCard, path: "/admin/payments", group: "Capital" },
  { label: "Commissions", icon: Wallet, path: "/admin/commissions", group: "Capital" },
  { label: "Vouchers", icon: Ticket, path: "/admin/vouchers", group: "Capital" },
  { label: "Investments", icon: PiggyBank, path: "/admin/investments", group: "Capital" },
  { label: "Marketing OS", icon: Compass, path: "/admin/marketing-os", group: "Capital" },
  { label: "Marketing", icon: Megaphone, path: "/admin/marketing", group: "Capital" },
  { label: "Notifications", icon: Bell, path: "/admin/notifications", group: "Capital" },

  // Community & Learning
  { label: "Ambassador Tasks", icon: Trophy, path: "/admin/ambassador-tasks", group: "Network" },
  { label: "Ambassador OS", icon: Users2, path: "/admin/ambassador-operating-system", group: "Network" },
  { label: "Ambassador Hub", icon: BookMarked, path: "/admin/ambassador-knowledge", group: "Network" },
  { label: "Learning Hub", icon: GraduationCap, path: "/admin/academy", group: "Network" },
];

/**
 * Persistent admin shell: Left Sidebar + Sticky Topbar around child modules.
 */
export function AdminOsLayout() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const user = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [allUsers, setAllUsers] = useState<
    Array<{ _id: string; name: string; email?: string; phone?: string; role?: string }>
  >([]);
  const [searchLoaded, setSearchLoaded] = useState(false);
  const [q, setQ] = useState("");
  const { theme } = useTheme();
  const [navOpen, setNavOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const mountNav = useNavChrome((s) => s.mount);
  const unmountNav = useNavChrome((s) => s.unmount);

  useLayoutEffect(() => {
    mountNav(false);
    return () => unmountNav(false);
  }, [mountNav, unmountNav]);

  const isHome = pathname === "/admin/dashboard";

  function doLogout() {
    clearAuth();
    navigate("/login");
  }

  function goto(path: string) {
    setNavOpen(false);
    setQ("");
    navigate(path);
  }

  function ensureSearchData() {
    if (searchLoaded) return;
    setSearchLoaded(true);
    api.get("/admin/projects").then((res) => setAllProjects(res.data.projects ?? [])).catch(() => {});
    api.get("/admin/users").then((res) => setAllUsers(res.data.users ?? [])).catch(() => {});
  }

  const query = q.trim().toLowerCase();
  const results =
    query.length >= 2
      ? [
          ...allProjects
            .filter((p) => `${p.name} ${p.city ?? ""} ${p.location ?? ""}`.toLowerCase().includes(query))
            .slice(0, 5)
            .map((p) => ({
              key: `p${p._id}`,
              kind: "Project",
              title: p.name,
              sub: [p.city, p.location].filter(Boolean).join(", "),
              href: `/admin/listings/${p._id}`,
            })),
          ...allUsers
            .filter((u) => `${u.name} ${u.email ?? ""} ${u.phone ?? ""}`.toLowerCase().includes(query))
            .slice(0, 5)
            .map((u) => ({
              key: `u${u._id}`,
              kind: u.role ? u.role.charAt(0) + u.role.slice(1).toLowerCase() : "User",
              title: u.name,
              sub: [u.email, u.phone].filter(Boolean).join(" · "),
              href: `/admin/users/${u._id}`,
            })),
        ].slice(0, 8)
      : [];

  const isActive = (path: string) => pathname === path || pathname.startsWith(`${path}/`);

  const groupedWorkspaces = useMemo(() => {
    const groups: Record<string, WorkspaceLink[]> = {
      Governance: [],
      Inventory: [],
      Pipeline: [],
      Capital: [],
      Network: [],
    };
    for (const w of WORKSPACES) {
      groups[w.group].push(w);
    }
    return groups;
  }, []);

  return (
    <div className={`founder-os admin-os-shell ${theme === "light" ? "light" : ""}`}>
      {/* Mobile Backdrop Overlay */}
      <div
        className={`fixed inset-0 bg-black/60 backdrop-blur-sm z-40 transition-opacity duration-300 md:hidden ${
          navOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        onClick={() => setNavOpen(false)}
      />

      {/* ======================================================== */}
      {/* LEFT SIDEBAR NAVIGATION (264px Fixed Glass Container)    */}
      {/* ======================================================== */}
      <aside
        className={`fixed top-0 bottom-0 left-0 w-[264px] bg-[#070B15]/95 backdrop-blur-2xl border-r border-white/10 z-50 flex flex-col justify-between transition-transform duration-300 ease-in-out md:translate-x-0 ${
          navOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full"
        }`}
      >
        {/* Brand Header */}
        <div className="h-[68px] px-5 flex items-center justify-between border-b border-white/10 flex-shrink-0 bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center shadow-md flex-shrink-0">
              <img src="/brand/icon.png" alt="Truvi" className="w-5 h-5 object-contain" />
            </div>
            <div className="flex flex-col">
              <span className="font-bold tracking-tight text-white text-[17px] font-sans">TRUVI</span>
              <span className="text-[10px] uppercase tracking-wider text-slate-400 font-medium">Admin OS</span>
            </div>
          </div>
        </div>

        {/* Navigation Scrollable Body */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5 scrollbar-thin scrollbar-thumb-white/10">
          {/* Command Section */}
          <div className="space-y-1">
            <div className="px-3 text-[10px] uppercase tracking-wider text-slate-400 font-bold">Command</div>
            <button
              onClick={() => goto("/admin/dashboard")}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all ${
                isHome
                  ? "bg-violet-600 text-white font-semibold shadow-md"
                  : "text-slate-300 hover:text-white hover:bg-white/5"
              }`}
            >
              <LayoutDashboard className={`w-4 h-4 ${isHome ? "text-white" : "text-violet-400"}`} />
              <span className="flex-1 text-left">Dashboard</span>
              <ChevronRight className={`w-3.5 h-3.5 ${isHome ? "text-white/80" : "text-slate-500"}`} />
            </button>
          </div>

          {/* Categorized Workspaces */}
          {Object.entries(groupedWorkspaces).map(([groupTitle, links]) => (
            <div key={groupTitle} className="space-y-1">
              <div className="px-3 text-[10px] uppercase tracking-wider text-slate-400 font-bold">{groupTitle}</div>
              <div className="space-y-0.5">
                {links.map((w) => {
                  const Icon = w.icon;
                  const active = isActive(w.path);
                  return (
                    <button
                      key={w.path}
                      onClick={() => goto(w.path)}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-[12.5px] font-medium transition-all ${
                        active
                          ? "bg-white/10 text-violet-300 border border-violet-500/30 font-semibold shadow-sm"
                          : "text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]"
                      }`}
                    >
                      <Icon className={`w-4 h-4 flex-shrink-0 ${active ? "text-violet-400" : "text-slate-400"}`} />
                      <span className="flex-1 text-left truncate">{w.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Sidebar Footer User Box */}
        <div className="p-3 border-t border-white/10 bg-black/20 flex-shrink-0">
          <div className="flex items-center justify-between p-2 rounded-xl bg-white/[0.03] border border-white/5 hover:bg-white/[0.06] transition-colors">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-violet-600/30 text-violet-300 border border-violet-500/30 flex items-center justify-center font-bold text-xs flex-shrink-0">
                {initials(user?.name || "Admin")}
              </div>
              <div className="flex flex-col truncate">
                <span className="text-xs font-semibold text-slate-200 truncate">{user?.name || "Admin"}</span>
                <span className="text-[10px] text-slate-400 truncate">{user?.role || "Administrator"}</span>
              </div>
            </div>
            <button
              onClick={doLogout}
              className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* ======================================================== */}
      {/* MAIN CONTAINER (Sticky Header + Embedded View / Content) */}
      {/* ======================================================== */}
      <div className="os-main md:ml-[264px] min-h-screen flex flex-col bg-[#070B15]">
        {/* Sticky Topbar */}
        <header className="sticky top-0 z-40 h-[68px] bg-[#070B15]/80 backdrop-blur-xl border-b border-white/10 px-5 sm:px-7 flex items-center justify-between gap-4">
          {/* Mobile Menu Toggle */}
          <button
            onClick={() => setNavOpen(true)}
            className="md:hidden p-2 text-slate-400 hover:text-white rounded-lg hover:bg-white/5"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Quick Omnisearch Input */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={q}
              onFocus={ensureSearchData}
              onChange={(e) => {
                ensureSearchData();
                setQ(e.target.value);
              }}
              placeholder="Search projects, users, leads..."
              onKeyDown={(e) => {
                if (e.key === "Enter" && results[0]) goto(results[0].href);
              }}
              className="w-full pl-9 pr-14 py-2 bg-white/[0.04] border border-white/10 hover:border-white/20 rounded-xl text-xs text-white placeholder-slate-400 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/40 transition-all font-sans"
            />
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-[10px] font-mono text-slate-400">
              ⌘K
            </span>

            {/* Live Autocomplete Results */}
            {results.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-[#0F172A] border border-white/15 rounded-xl shadow-2xl overflow-hidden z-50 max-h-80 overflow-y-auto">
                {results.map((r) => (
                  <button
                    key={r.key}
                    onMouseDown={() => goto(r.href)}
                    className="w-full text-left px-4 py-2.5 border-b border-white/5 hover:bg-white/5 flex flex-col transition-colors"
                  >
                    <span className="text-xs font-semibold text-white">{r.title}</span>
                    <span className="text-[11px] text-slate-400">
                      {r.kind} {r.sub ? `· ${r.sub}` : ""}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Right Action Controls */}
          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
            {/* Refresh Live Telemetry */}
            <button
              onClick={() => setRefreshKey((k) => k + 1)}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/5 border border-transparent hover:border-white/10 transition-all"
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </button>

            {/* Theme Toggle */}
            <ThemeToggle showLabel={false} />

            {/* Profile Settings Gear */}
            <button
              onClick={() => setSettingsOpen(true)}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/5 border border-transparent hover:border-white/10 transition-all"
              title="Settings"
            >
              <Settings className="w-4 h-4" />
            </button>

            {/* Notification Bell */}
            <NotificationBell />

            <div className="w-px h-5 bg-white/10 hidden sm:block mx-1" />

            {/* User Profile Menu */}
            <InNavbarContext.Provider value={true}>
              <UserMenu />
            </InNavbarContext.Provider>
          </div>
        </header>

        {/* Content View */}
        <main className="flex-1 px-4 sm:px-7 py-6">
          <Suspense fallback={<DashboardSkeleton variant="content" />}>
            <div key={`${pathname}:${refreshKey}`} className={isHome ? undefined : "os-embedded"}>
              <Outlet />
            </div>
          </Suspense>
        </main>
      </div>

      <ProfileSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}

/**
 * Admin Command Center Home Page:
 * Minimal, crisp, professional layout without AI pill badges, sparkles, or text fluff.
 */
export default function AdminOsDashboardPage() {
  const navigate = useNavigate();
  const [pendingProjects, setPendingProjects] = useState<Project[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [stats, setStats] = useState({ totalUsers: 0, totalProjects: 0, platformFees: 0, leadRevenue: 0 });
  const [platformUsers, setPlatformUsers] = useState<DashboardUserAddition[]>([]);
  const [platformProjects, setPlatformProjects] = useState<DashboardProjectAddition[]>([]);
  const [platformUsersStatus, setPlatformUsersStatus] = useState<"loading" | "loaded" | "error">("loading");
  const [platformProjectsStatus, setPlatformProjectsStatus] = useState<"loading" | "loaded" | "error">("loading");
  const [investor, setInvestor] = useState<InvestorMetrics | null>(null);
  const [overview, setOverview] = useState<OpsOverview | null>(null);
  const [activity, setActivity] = useState<ActivityLog[]>([]);
  const [trends, setTrends] = useState<KpiTrends | null>(null);
  const [leadStats, setLeadStats] = useState<{
    total: number;
    new: number;
    visitsScheduled: number;
    visitsCompleted: number;
    converted: number;
  } | null>(null);

  function load() {
    setPlatformUsersStatus("loading");
    setPlatformProjectsStatus("loading");
    const requests: Promise<unknown>[] = [
      api
        .get("/admin/projects", { params: { approvalStatus: "PENDING" } })
        .then((res) => setPendingProjects(res.data.projects))
        .catch(() => {}),
      api
        .get("/admin/users", { params: { all: "true" } })
        .then((res) => {
          const users = (res.data.users ?? []) as DashboardUserAddition[];
          setPlatformUsers(users);
          setStats((s) => ({ ...s, totalUsers: users.length }));
          setPlatformUsersStatus("loaded");
        })
        .catch(() => setPlatformUsersStatus("error")),
      api
        .get("/admin/projects")
        .then((res) => {
          const projects = (res.data.projects ?? []) as DashboardProjectAddition[];
          setPlatformProjects(projects);
          setStats((s) => ({ ...s, totalProjects: projects.length }));
          setPlatformProjectsStatus("loaded");
        })
        .catch(() => setPlatformProjectsStatus("error")),
      api
        .get("/revenue")
        .then((res) =>
          setStats((s) => ({
            ...s,
            platformFees: res.data.platformFeeRevenue,
            leadRevenue: res.data.leadServiceRevenue,
          })),
        )
        .catch(() => {}),
      api
        .get("/admin/investor-metrics")
        .then((res) => setInvestor(res.data.metrics))
        .catch(() => {}),
      api
        .get("/admin/founder-overview")
        .then((res) => setOverview(res.data))
        .catch(() => {}),
      api
        .get("/admin/audit-logs", { params: { limit: 8 } })
        .then((res) => setActivity(res.data.logs))
        .catch(() => {}),
      api
        .get("/admin/kpi-trends")
        .then((res) => setTrends(res.data.trends))
        .catch(() => {}),
      api
        .get("/leads/admin/stats")
        .then((res) => setLeadStats(res.data.totals))
        .catch(() => {}),
    ];
    void Promise.all(requests).finally(() => setInitialLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  const growthDays = useMemo(
    () => buildGrowthDays(platformUsers, platformProjects),
    [platformUsers, platformProjects],
  );

  const latestUsers = useMemo(
    () =>
      [...platformUsers]
        .filter((user) => createdAtMs(user.createdAt) !== null)
        .sort((a, b) => (createdAtMs(b.createdAt) ?? 0) - (createdAtMs(a.createdAt) ?? 0))
        .slice(0, 3),
    [platformUsers],
  );

  const latestProjects = useMemo(
    () =>
      [...platformProjects]
        .filter((project) => createdAtMs(project.createdAt) !== null)
        .sort((a, b) => (createdAtMs(b.createdAt) ?? 0) - (createdAtMs(a.createdAt) ?? 0))
        .slice(0, 3),
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

  if (initialLoading) return <DashboardSkeleton variant="content" />;

  return (
    <section className="space-y-6 max-w-[1840px] mx-auto text-slate-100 font-sans pb-16">
      {/* ======================================================== */}
      {/* 1. HEADER SECTION                                        */}
      {/* ======================================================== */}
      <section className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Admin Dashboard</h1>
        </div>

        {/* Quick Actions */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => navigate("/admin/listings")}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] hover:text-white border border-white/10 text-xs font-semibold text-slate-300 transition-all"
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>Manage Listings</span>
          </button>

          <button
            onClick={() => navigate("/developer/projects/new")}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold shadow-md transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Add Project</span>
          </button>
        </div>
      </section>

      {/* ======================================================== */}
      {/* 2. ROW 1: PLATFORM STATS (4-COL GRID)                    */}
      {/* ======================================================== */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* Total Users */}
        <div
          onClick={() => navigate("/admin/users")}
          className="group p-5 rounded-2xl bg-[#0F172A]/70 backdrop-blur-xl border border-white/10 hover:border-violet-500/40 transition-all shadow-xl flex flex-col justify-between cursor-pointer"
        >
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">Total Users</span>
              {trends?.users !== undefined && (
                <span className="text-emerald-400 text-xs font-semibold">{trendBadge(trends.users)?.text}</span>
              )}
            </div>
            <div className="mt-3 text-3xl font-bold tracking-tight text-white">{stats.totalUsers}</div>
            <p className="mt-1 text-xs text-slate-400">Buyers, CPs & Developers</p>
          </div>
          <div className="mt-5 pt-3 border-t border-white/5 flex items-center justify-between text-xs text-violet-400 font-medium group-hover:text-violet-300">
            <span>Manage accounts</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
          </div>
        </div>

        {/* Total Projects */}
        <div
          onClick={() => navigate("/admin/listings")}
          className="group p-5 rounded-2xl bg-[#0F172A]/70 backdrop-blur-xl border border-white/10 hover:border-amber-500/40 transition-all shadow-xl flex flex-col justify-between cursor-pointer"
        >
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">Total Projects</span>
              {trends?.projects !== undefined && (
                <span className="text-amber-400 text-xs font-semibold">{trendBadge(trends.projects)?.text}</span>
              )}
            </div>
            <div className="mt-3 text-3xl font-bold tracking-tight text-white">{stats.totalProjects}</div>
            <p className="mt-1 text-xs text-slate-400">Approved listings</p>
          </div>
          <div className="mt-5 pt-3 border-t border-white/5 flex items-center justify-between text-xs text-amber-400 font-medium group-hover:text-amber-300">
            <span>View listings</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
          </div>
        </div>

        {/* Platform Fee Revenue */}
        <div
          onClick={() => navigate("/admin/revenue")}
          className="group p-5 rounded-2xl bg-[#0F172A]/70 backdrop-blur-xl border border-white/10 hover:border-emerald-500/40 transition-all shadow-xl flex flex-col justify-between cursor-pointer"
        >
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">Platform Fees</span>
              {trends?.platformFeeRevenue !== undefined && (
                <span className="text-emerald-400 text-xs font-semibold">
                  {trendBadge(trends.platformFeeRevenue)?.text}
                </span>
              )}
            </div>
            <div className="mt-3 text-3xl font-bold tracking-tight text-white">{formatINR(stats.platformFees)}</div>
            <p className="mt-1 text-xs text-slate-400">Transaction fees</p>
          </div>
          <div className="mt-5 pt-3 border-t border-white/5 flex items-center justify-between text-xs text-emerald-400 font-medium group-hover:text-emerald-300">
            <span>View revenue</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
          </div>
        </div>

        {/* Lead Marketplace Revenue */}
        <div
          onClick={() => navigate("/admin/revenue")}
          className="group p-5 rounded-2xl bg-[#0F172A]/70 backdrop-blur-xl border border-white/10 hover:border-cyan-500/40 transition-all shadow-xl flex flex-col justify-between cursor-pointer"
        >
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">Lead Revenue</span>
              {trends?.leadRevenue !== undefined && (
                <span className="text-cyan-400 text-xs font-semibold">{trendBadge(trends.leadRevenue)?.text}</span>
              )}
            </div>
            <div className="mt-3 text-3xl font-bold tracking-tight text-white">{formatINR(stats.leadRevenue)}</div>
            <p className="mt-1 text-xs text-slate-400">Marketplace revenue</p>
          </div>
          <div className="mt-5 pt-3 border-t border-white/5 flex items-center justify-between text-xs text-cyan-400 font-medium group-hover:text-cyan-300">
            <span>View leads</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
          </div>
        </div>
      </section>

      {/* ======================================================== */}
      {/* 3. ROW 2: LEAD PIPELINE (5 STAGES)                       */}
      {/* ======================================================== */}
      {leadStats && (
        <section className="space-y-3">
          <div className="flex items-center gap-2 px-1">
            <Target className="w-4 h-4 text-violet-400" />
            <h2 className="text-sm font-semibold tracking-tight text-white">Lead Pipeline</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
            {/* Stage 1 */}
            <div
              onClick={() => navigate("/admin/leads")}
              className="p-4 rounded-xl bg-[#0F172A]/70 backdrop-blur-md border border-white/10 hover:border-violet-500/40 transition-all cursor-pointer flex flex-col justify-between"
            >
              <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Total Leads</span>
              <div className="my-2">
                <div className="text-2xl font-bold text-white">{leadStats.total}</div>
                <span className="text-[11px] text-slate-400">All captured</span>
              </div>
              <div className="w-full bg-white/5 h-1 rounded-full overflow-hidden">
                <div className="bg-violet-500 h-full w-full" />
              </div>
            </div>

            {/* Stage 2 */}
            <div
              onClick={() => navigate("/admin/leads?status=NEW")}
              className="p-4 rounded-xl bg-[#0F172A]/70 backdrop-blur-md border border-white/10 hover:border-amber-500/40 transition-all cursor-pointer flex flex-col justify-between"
            >
              <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">New Leads</span>
              <div className="my-2">
                <div className="text-2xl font-bold text-white">{leadStats.new}</div>
                <span className="text-[11px] text-amber-400">Needs contact</span>
              </div>
              <div className="w-full bg-white/5 h-1 rounded-full overflow-hidden">
                <div
                  className="bg-amber-500 h-full"
                  style={{ width: `${leadStats.total ? Math.min(100, (leadStats.new / leadStats.total) * 100) : 0}%` }}
                />
              </div>
            </div>

            {/* Stage 3 */}
            <div
              onClick={() => navigate("/admin/leads?status=SITE_VISIT_SCHEDULED")}
              className="p-4 rounded-xl bg-[#0F172A]/70 backdrop-blur-md border border-white/10 hover:border-blue-500/40 transition-all cursor-pointer flex flex-col justify-between"
            >
              <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Scheduled Visits</span>
              <div className="my-2">
                <div className="text-2xl font-bold text-white">{leadStats.visitsScheduled}</div>
                <span className="text-[11px] text-blue-400">Upcoming visits</span>
              </div>
              <div className="w-full bg-white/5 h-1 rounded-full overflow-hidden">
                <div
                  className="bg-blue-500 h-full"
                  style={{
                    width: `${leadStats.total ? Math.min(100, (leadStats.visitsScheduled / leadStats.total) * 100) : 0}%`,
                  }}
                />
              </div>
            </div>

            {/* Stage 4 */}
            <div
              onClick={() => navigate("/admin/leads?status=SITE_VISIT_COMPLETED")}
              className="p-4 rounded-xl bg-[#0F172A]/70 backdrop-blur-md border border-white/10 hover:border-cyan-500/40 transition-all cursor-pointer flex flex-col justify-between"
            >
              <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Completed Visits</span>
              <div className="my-2">
                <div className="text-2xl font-bold text-white">{leadStats.visitsCompleted}</div>
                <span className="text-[11px] text-cyan-400">Visits done</span>
              </div>
              <div className="w-full bg-white/5 h-1 rounded-full overflow-hidden">
                <div
                  className="bg-cyan-500 h-full"
                  style={{
                    width: `${leadStats.total ? Math.min(100, (leadStats.visitsCompleted / leadStats.total) * 100) : 0}%`,
                  }}
                />
              </div>
            </div>

            {/* Stage 5 */}
            <div
              onClick={() => navigate("/admin/leads?status=CONVERTED")}
              className="p-4 rounded-xl bg-[#0F172A]/70 backdrop-blur-md border border-white/10 hover:border-emerald-500/40 transition-all cursor-pointer flex flex-col justify-between"
            >
              <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Converted</span>
              <div className="my-2">
                <div className="text-2xl font-bold text-emerald-400">{leadStats.converted}</div>
                <span className="text-[11px] text-emerald-400">Booked units</span>
              </div>
              <div className="w-full bg-white/5 h-1 rounded-full overflow-hidden">
                <div className="bg-emerald-500 h-full w-full" />
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ======================================================== */}
      {/* 4. ROW 3: OPERATIONS TODAY (5 METRICS)                   */}
      {/* ======================================================== */}
      {overview && (
        <section className="p-4 rounded-2xl bg-[#0F172A]/80 backdrop-blur-xl border border-white/10 shadow-lg">
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3 divide-y sm:divide-y-0 sm:divide-x divide-white/10">
            {/* Metric 1 */}
            <div
              onClick={() => navigate("/admin/revenue")}
              className="flex items-center gap-3 px-3 py-1 cursor-pointer hover:opacity-80 transition-opacity"
            >
              <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 flex-shrink-0">
                <Wallet className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[10px] uppercase text-slate-400 font-bold">Revenue Today</span>
                <div className="text-sm font-bold text-white">{formatINR(overview.companyHealth.revenueToday)}</div>
              </div>
            </div>

            {/* Metric 2 */}
            <div className="flex items-center gap-3 px-3 py-1">
              <div className="w-9 h-9 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400 flex-shrink-0">
                <Inbox className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[10px] uppercase text-slate-400 font-bold">Leads Today</span>
                <div className="text-sm font-bold text-white">{overview.sales.leadsToday} New</div>
              </div>
            </div>

            {/* Metric 3 */}
            <div className="flex items-center gap-3 px-3 py-1">
              <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 flex-shrink-0">
                <Target className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[10px] uppercase text-slate-400 font-bold">Bookings Today</span>
                <div className="text-sm font-bold text-white">{overview.executive.todaysBookings} Units</div>
              </div>
            </div>

            {/* Metric 4 */}
            <div
              onClick={() => navigate("/admin/kyc")}
              className="flex items-center gap-3 px-3 py-1 cursor-pointer hover:opacity-80 transition-opacity"
            >
              <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 flex-shrink-0">
                <Users className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[10px] uppercase text-slate-400 font-bold">Pending CP KYC</span>
                <div className="text-sm font-bold text-white">{overview.verification.pendingKyc}</div>
              </div>
            </div>

            {/* Metric 5 */}
            <div
              onClick={() => navigate("/admin/verification")}
              className="flex items-center gap-3 px-3 py-1 cursor-pointer hover:opacity-80 transition-opacity"
            >
              <div className="w-9 h-9 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 flex-shrink-0">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[10px] uppercase text-slate-400 font-bold">Pending Verification</span>
                <div className="text-sm font-bold text-rose-400">
                  {overview.verification.pendingProjects + overview.verification.pendingLegal}
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ======================================================== */}
      {/* 5. ROW 4: PLATFORM GROWTH & 7-DAY MATRIX (DUAL LAYOUT)   */}
      {/* ======================================================== */}
      <section className="p-5 sm:p-6 rounded-2xl bg-[#0F172A]/70 backdrop-blur-xl border border-white/10 shadow-xl">
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Left Panel: 1/3 Summary Metrics & Quick Dossiers */}
          <div className="w-full lg:w-1/3 flex flex-col justify-between space-y-4 border-b lg:border-b-0 lg:border-r border-white/10 lg:pr-6 pb-6 lg:pb-0">
            <div>
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-violet-400" />
                <h3 className="text-base font-bold tracking-tight text-white">Platform Growth</h3>
              </div>
            </div>

            {/* 7-Day Metrics Grid */}
            <div className="grid grid-cols-2 gap-3">
              <div
                onClick={() => navigate("/admin/users")}
                className="p-3.5 rounded-xl bg-white/[0.03] border border-white/10 hover:border-violet-500/40 transition-all cursor-pointer"
              >
                <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Users Added</span>
                <div className="mt-1 text-2xl font-bold text-white">
                  {platformUsersStatus === "loaded" ? usersAddedIn7Days : "—"}
                </div>
                <span className="text-[10px] text-violet-400 font-medium inline-flex items-center gap-0.5 mt-1">
                  View users →
                </span>
              </div>

              <div
                onClick={() => navigate("/admin/listings")}
                className="p-3.5 rounded-xl bg-white/[0.03] border border-white/10 hover:border-amber-500/40 transition-all cursor-pointer"
              >
                <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Projects Added</span>
                <div className="mt-1 text-2xl font-bold text-white">
                  {platformProjectsStatus === "loaded" ? projectsAddedIn7Days : "—"}
                </div>
                <span className="text-[10px] text-amber-400 font-medium inline-flex items-center gap-0.5 mt-1">
                  View listings →
                </span>
              </div>
            </div>

            {/* Latest User Onboarded */}
            <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-full bg-violet-600/30 text-violet-300 border border-violet-500/30 flex items-center justify-center font-bold text-xs flex-shrink-0">
                  {latestUsers[0] ? initials(latestUsers[0].name) : "U"}
                </div>
                <div className="flex flex-col truncate">
                  <span className="text-xs font-semibold text-white truncate">
                    {latestUsers[0]?.name || "No new accounts"}
                  </span>
                  <span className="text-[10px] text-slate-400 truncate">
                    {latestUsers[0]?.role || "User"} · {formatIndiaDateTime(latestUsers[0]?.createdAt)}
                  </span>
                </div>
              </div>
            </div>

            {/* Latest Project Listed */}
            <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-300 border border-amber-500/20 flex items-center justify-center font-bold text-xs flex-shrink-0">
                  <Building2 className="w-4 h-4" />
                </div>
                <div className="flex flex-col truncate">
                  <span className="text-xs font-semibold text-white truncate">
                    {latestProjects[0]?.name || "No recent projects"}
                  </span>
                  <span className="text-[10px] text-slate-400 truncate">
                    {latestProjects[0]?.city || "Location not set"} · {formatIndiaDateTime(latestProjects[0]?.createdAt)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Panel: 2/3 Interactive 7-Day Activity Chart */}
          <div className="w-full lg:w-2/3 flex flex-col justify-between space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h4 className="text-sm font-bold text-white tracking-tight">Daily Additions (Last 7 Days)</h4>
              <div className="flex items-center gap-4 text-xs font-medium">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded bg-violet-500" />
                  <span className="text-slate-300">Users</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded bg-amber-400" />
                  <span className="text-slate-300">Projects</span>
                </div>
              </div>
            </div>

            {/* 7-Day Chart Bars */}
            <div className="pt-6 pb-2">
              <div className="grid grid-cols-7 gap-2 sm:gap-3 items-end h-44">
                {growthDays.map((day) => (
                  <div key={day.key} className="flex flex-col items-center gap-2 h-full justify-end group">
                    <span className="text-[10px] font-mono text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity">
                      {day.users + day.projects}
                    </span>
                    <div className="w-full flex items-end justify-center gap-1 h-32 bg-white/[0.02] p-1 rounded-xl border border-white/5">
                      {/* User Bar */}
                      <div
                        className="w-1/2 bg-violet-500 rounded-lg transition-all duration-300 group-hover:bg-violet-400"
                        style={{
                          height: day.users ? `${Math.max(12, (day.users / maxGrowthCount) * 100)}%` : "4px",
                        }}
                        title={`${day.users} new users on ${day.label}`}
                      />
                      {/* Project Bar */}
                      <div
                        className="w-1/2 bg-amber-400 rounded-lg transition-all duration-300 group-hover:bg-amber-300"
                        style={{
                          height: day.projects ? `${Math.max(12, (day.projects / maxGrowthCount) * 100)}%` : "4px",
                        }}
                        title={`${day.projects} new projects on ${day.label}`}
                      />
                    </div>
                    <span className="text-[10px] font-medium text-slate-400 group-hover:text-white transition-colors">
                      {day.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ======================================================== */}
      {/* 6. ROW 5: INVESTOR & PLATFORM STATS STRIP                */}
      {/* ======================================================== */}
      {investor && (
        <section className="p-4 rounded-xl bg-[#0F172A]/80 backdrop-blur-md border border-white/10 shadow-sm">
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3 text-center divide-x-0 xl:divide-x divide-white/10">
            <div className="px-2">
              <span className="text-[10px] uppercase text-slate-400 font-bold">ARR</span>
              <div className="text-base font-bold text-emerald-400 mt-0.5">{paise(investor.arrPaise)}</div>
            </div>
            <div className="px-2">
              <span className="text-[10px] uppercase text-slate-400 font-bold">MRR</span>
              <div className="text-base font-bold text-white mt-0.5">{paise(investor.mrrPaise)}</div>
            </div>
            <div className="px-2">
              <span className="text-[10px] uppercase text-slate-400 font-bold">LTV / CAC</span>
              <div className="text-base font-bold text-violet-400 mt-0.5">
                {paise(investor.ltvPaise)} / {paise(investor.cacPaise)}
              </div>
            </div>
            <div className="px-2">
              <span className="text-[10px] uppercase text-slate-400 font-bold">Churn</span>
              <div className="text-base font-bold text-white mt-0.5">{investor.churnPercent}%</div>
            </div>
            <div className="px-2">
              <span className="text-[10px] uppercase text-slate-400 font-bold">Conversion</span>
              <div className="text-base font-bold text-white mt-0.5">{investor.conversionPercent}%</div>
            </div>
            <div className="px-2">
              <span className="text-[10px] uppercase text-slate-400 font-bold">Paying Users</span>
              <div className="text-base font-bold text-white mt-0.5">{investor.payingUsers}</div>
            </div>
            <div className="px-2">
              <span className="text-[10px] uppercase text-slate-400 font-bold">Network</span>
              <div className="text-base font-bold text-white mt-0.5">
                {investor.totalBuyers}B · {investor.totalCPs}CP
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ======================================================== */}
      {/* 7. ROW 6: APPROVALS & RECENT ACTIVITY                     */}
      {/* ======================================================== */}
      <section className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Left Column: Pending Project Approvals (Queue) */}
        <div className="p-5 sm:p-6 rounded-2xl bg-[#0F172A]/70 backdrop-blur-xl border border-white/10 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center gap-2.5">
                <Clock className="w-5 h-5 text-amber-400" />
                <h3 className="text-base font-bold text-white tracking-tight">Pending Project Approvals</h3>
              </div>
              <span className="text-xs text-amber-400 font-semibold">{pendingProjects.length} pending</span>
            </div>

            <div className="mt-4 divide-y divide-white/5">
              {pendingProjects.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2 opacity-80" />
                  All developer project approvals are up to date.
                </div>
              ) : (
                pendingProjects.map((p) => (
                  <div key={p._id} className="py-3.5 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-violet-600/20 border border-violet-500/30 text-violet-300 font-bold text-xs flex items-center justify-center flex-shrink-0">
                        {initials(p.name)}
                      </div>
                      <div className="flex flex-col min-w-0 truncate">
                        <span className="text-xs font-bold text-white truncate">{p.name}</span>
                        <span className="text-[11px] text-slate-400 truncate">
                          {p.city} · by {nameOf(p.developerId)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => navigate(`/admin/listings/${p._id}`)}
                        className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] font-semibold text-slate-300 transition-all flex items-center gap-1"
                      >
                        <Eye className="w-3 h-3" />
                        <span>Inspect</span>
                      </button>
                      <button
                        onClick={() => approveProject(p._id, "APPROVED")}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-semibold shadow-sm transition-all flex items-center gap-1"
                      >
                        <Check className="w-3 h-3" />
                        <span>Approve</span>
                      </button>
                      <button
                        onClick={() => approveProject(p._id, "REJECTED")}
                        className="px-2.5 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-[11px] font-semibold text-rose-400 transition-all flex items-center gap-1"
                      >
                        <X className="w-3 h-3" />
                        <span>Reject</span>
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-white/5 text-right">
            <button
              onClick={() => navigate("/admin/listings")}
              className="text-xs text-violet-400 hover:text-violet-300 font-medium inline-flex items-center gap-1"
            >
              <span>View all projects</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Right Column: Recent Activity */}
        <div className="p-5 sm:p-6 rounded-2xl bg-[#0F172A]/70 backdrop-blur-xl border border-white/10 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center gap-2.5">
                <Activity className="w-5 h-5 text-emerald-400" />
                <h3 className="text-base font-bold text-white tracking-tight">Recent Platform Activity</h3>
              </div>
            </div>

            <div className="mt-4 divide-y divide-white/5">
              {activity.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">No recent activity recorded.</div>
              ) : (
                activity.map((a, i) => (
                  <div key={i} className="py-3 flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-white/5 border border-white/10 text-slate-300 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                      {a.actor?.name ? initials(a.actor.name) : "•"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-slate-200">
                        <strong className="text-white font-semibold">{a.actor?.name ?? "System"}</strong>{" "}
                        <span className="text-slate-300">{activityText(a)}</span>
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        {a.actor?.role ? `${a.actor.role} · ` : ""}
                        {timeAgo(a.createdAt)}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-white/5 text-right">
            <button
              onClick={() => navigate("/admin/audit-logs")}
              className="text-xs text-violet-400 hover:text-violet-300 font-medium inline-flex items-center gap-1"
            >
              <span>Explore audit logs</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </section>
    </section>
  );
}
