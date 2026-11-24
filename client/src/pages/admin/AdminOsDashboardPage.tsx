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
  ScrollText,
} from "lucide-react";
import SectionInfoTooltip from "@/components/admin/SectionInfoTooltip";
import "@/styles/founder-os.css";

/**
 * Admin OS — High-performance, minimal, accessible Desktop Admin Command Center.
 * Seamless, full-fidelity support for both Light Mode and Dark Mode across all
 * components, typography, metrics, and brand assets.
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
 * Fully responsive to Light and Dark mode.
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

  const isLight = theme === "light";

  return (
    <div className={`founder-os admin-os-shell ${isLight ? "light" : ""}`}>
      {/* Mobile Backdrop Overlay */}
      <div
        className={`fixed inset-0 bg-black/60 backdrop-blur-sm z-40 transition-opacity duration-300 md:hidden ${
          navOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        onClick={() => setNavOpen(false)}
      />

      {/* ======================================================== */}
      {/* LEFT SIDEBAR NAVIGATION (264px Fixed Container)          */}
      {/* ======================================================== */}
      <aside
        className={`fixed top-0 bottom-0 left-0 w-[264px] z-50 flex flex-col justify-between transition-all duration-300 ease-in-out md:translate-x-0 ${
          isLight
            ? "bg-white border-r border-slate-200 text-slate-800 shadow-md"
            : "bg-[#070B15]/95 backdrop-blur-2xl border-r border-white/10 text-slate-200"
        } ${navOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full"}`}
      >
        {/* Brand Header */}
        <div
          className={`h-[68px] px-5 flex items-center justify-between border-b flex-shrink-0 transition-colors ${
            isLight ? "bg-slate-50/80 border-slate-200" : "bg-white/[0.02] border-white/10"
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-all ${
                isLight
                  ? "bg-white border border-slate-200 shadow-sm"
                  : "bg-gradient-to-br from-violet-600 to-indigo-600 shadow-[0_0_16px_rgba(124,92,255,0.35)]"
              }`}
            >
              <img
                src={isLight ? "/brand/icon.png" : "/brand/icon-white.png"}
                alt="Truvi"
                className="w-5 h-5 object-contain"
              />
            </div>
            <div className="flex flex-col">
              <span
                className={`font-bold tracking-tight text-[17px] font-sans ${
                  isLight ? "text-slate-900" : "text-white"
                }`}
              >
                TRUVI
              </span>
              <span
                className={`text-[10px] uppercase tracking-wider font-semibold ${
                  isLight ? "text-slate-500" : "text-slate-400"
                }`}
              >
                Admin OS
              </span>
            </div>
          </div>
        </div>

        {/* Navigation Scrollable Body */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5 scrollbar-thin">
          {/* Command Section */}
          <div className="space-y-1">
            <div
              className={`px-3 text-[10px] uppercase tracking-wider font-bold ${
                isLight ? "text-slate-400" : "text-slate-500"
              }`}
            >
              Command
            </div>
            <button
              onClick={() => goto("/admin/dashboard")}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all ${
                isHome
                  ? "bg-violet-600 text-white font-semibold shadow-md"
                  : isLight
                    ? "text-slate-700 hover:text-slate-900 hover:bg-slate-100"
                    : "text-slate-300 hover:text-white hover:bg-white/5"
              }`}
            >
              <LayoutDashboard
                className={`w-4 h-4 ${isHome ? "text-white" : isLight ? "text-violet-600" : "text-violet-400"}`}
              />
              <span className="flex-1 text-left">Dashboard</span>
              <ChevronRight
                className={`w-3.5 h-3.5 ${isHome ? "text-white/80" : isLight ? "text-slate-400" : "text-slate-500"}`}
              />
            </button>
          </div>

          {/* Categorized Workspaces */}
          {Object.entries(groupedWorkspaces).map(([groupTitle, links]) => (
            <div key={groupTitle} className="space-y-1">
              <div
                className={`px-3 text-[10px] uppercase tracking-wider font-bold ${
                  isLight ? "text-slate-400" : "text-slate-500"
                }`}
              >
                {groupTitle}
              </div>
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
                          ? isLight
                            ? "bg-violet-50 text-violet-700 border border-violet-200 font-semibold shadow-xs"
                            : "bg-white/10 text-violet-300 border border-violet-500/30 font-semibold shadow-sm"
                          : isLight
                            ? "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                            : "text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]"
                      }`}
                    >
                      <Icon
                        className={`w-4 h-4 flex-shrink-0 ${
                          active
                            ? isLight
                              ? "text-violet-600"
                              : "text-violet-400"
                            : isLight
                              ? "text-slate-400"
                              : "text-slate-500"
                        }`}
                      />
                      <span className="flex-1 text-left truncate">{w.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Sidebar Footer User Box */}
        <div
          className={`p-3 border-t flex-shrink-0 transition-colors ${
            isLight ? "border-slate-200 bg-slate-50/60" : "border-white/10 bg-black/20"
          }`}
        >
          <div
            className={`flex items-center justify-between p-2 rounded-xl border transition-colors ${
              isLight
                ? "bg-white border-slate-200 hover:bg-slate-50 shadow-xs"
                : "bg-white/[0.03] border-white/5 hover:bg-white/[0.06]"
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs flex-shrink-0 ${
                  isLight
                    ? "bg-violet-100 text-violet-700 border border-violet-200"
                    : "bg-violet-600/30 text-violet-300 border border-violet-500/30"
                }`}
              >
                {initials(user?.name || "Admin")}
              </div>
              <div className="flex flex-col truncate">
                <span
                  className={`text-xs font-semibold truncate ${
                    isLight ? "text-slate-900" : "text-slate-200"
                  }`}
                >
                  {user?.name || "Admin"}
                </span>
                <span
                  className={`text-[10px] truncate ${
                    isLight ? "text-slate-500" : "text-slate-400"
                  }`}
                >
                  {user?.role || "Administrator"}
                </span>
              </div>
            </div>
            <button
              onClick={doLogout}
              className={`p-1.5 rounded-lg transition-colors ${
                isLight
                  ? "text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                  : "text-slate-400 hover:text-rose-400 hover:bg-rose-500/10"
              }`}
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
      <div
        className={`os-main md:ml-[264px] min-h-screen flex flex-col transition-colors ${
          isLight ? "bg-[#F8FAFC] text-slate-900" : "bg-[#070B15] text-slate-100"
        }`}
      >
        {/* Sticky Topbar */}
        <header
          className={`sticky top-0 z-40 h-[68px] backdrop-blur-xl border-b px-5 sm:px-7 flex items-center justify-between gap-4 transition-colors ${
            isLight
              ? "bg-white/85 border-slate-200 shadow-xs"
              : "bg-[#070B15]/80 border-white/10"
          }`}
        >
          {/* Mobile Menu Toggle */}
          <button
            onClick={() => setNavOpen(true)}
            className={`md:hidden p-2 rounded-lg ${
              isLight ? "text-slate-600 hover:bg-slate-100" : "text-slate-400 hover:bg-white/5"
            }`}
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Quick Omnisearch Input */}
          <div className="relative flex-1 max-w-md">
            <Search
              className={`w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 ${
                isLight ? "text-slate-400" : "text-slate-400"
              }`}
            />
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
              className={`w-full pl-9 pr-14 py-2 rounded-xl text-xs transition-all font-sans ${
                isLight
                  ? "bg-slate-100 border border-slate-200 text-slate-900 placeholder-slate-400 focus:bg-white focus:border-violet-600 focus:ring-1 focus:ring-violet-600/30"
                  : "bg-white/[0.04] border border-white/10 text-white placeholder-slate-400 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/40"
              }`}
            />
            <span
              className={`absolute right-2.5 top-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded text-[10px] font-mono ${
                isLight
                  ? "bg-white border border-slate-200 text-slate-500 shadow-xs"
                  : "bg-white/5 border border-white/10 text-slate-400"
              }`}
            >
              ⌘K
            </span>

            {/* Live Autocomplete Results */}
            {results.length > 0 && (
              <div
                className={`absolute top-full left-0 right-0 mt-2 border rounded-xl shadow-xl overflow-hidden z-50 max-h-80 overflow-y-auto ${
                  isLight ? "bg-white border-slate-200 text-slate-900" : "bg-[#0F172A] border-white/15 text-white"
                }`}
              >
                {results.map((r) => (
                  <button
                    key={r.key}
                    onMouseDown={() => goto(r.href)}
                    className={`w-full text-left px-4 py-2.5 border-b flex flex-col transition-colors ${
                      isLight
                        ? "border-slate-100 hover:bg-slate-50 text-slate-900"
                        : "border-white/5 hover:bg-white/5 text-white"
                    }`}
                  >
                    <span className="text-xs font-semibold">{r.title}</span>
                    <span className={`text-[11px] ${isLight ? "text-slate-500" : "text-slate-400"}`}>
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
              className={`p-2 rounded-xl border transition-all ${
                isLight
                  ? "text-slate-600 hover:text-slate-900 hover:bg-slate-100 border-transparent hover:border-slate-200"
                  : "text-slate-400 hover:text-white hover:bg-white/5 border-transparent hover:border-white/10"
              }`}
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </button>

            {/* Theme Toggle */}
            <ThemeToggle showLabel={false} />

            {/* Profile Settings Gear */}
            <button
              onClick={() => setSettingsOpen(true)}
              className={`p-2 rounded-xl border transition-all ${
                isLight
                  ? "text-slate-600 hover:text-slate-900 hover:bg-slate-100 border-transparent hover:border-slate-200"
                  : "text-slate-400 hover:text-white hover:bg-white/5 border-transparent hover:border-white/10"
              }`}
              title="Settings"
            >
              <Settings className="w-4 h-4" />
            </button>

            {/* Notification Bell */}
            <NotificationBell />

            <div className={`w-px h-5 hidden sm:block mx-1 ${isLight ? "bg-slate-200" : "bg-white/10"}`} />

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
 * Minimal, crisp, professional layout.
 * 100% responsive for Light and Dark modes.
 */
export default function AdminOsDashboardPage() {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const isLight = theme === "light";

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
    <section className={`space-y-6 max-w-[1840px] mx-auto pb-16 font-sans ${isLight ? "text-slate-800" : "text-slate-100"}`}>
      {/* ======================================================== */}
      {/* 1. HEADER SECTION                                        */}
      {/* ======================================================== */}
      <section
        className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-5 transition-colors ${
          isLight ? "border-slate-200" : "border-white/10"
        }`}
      >
        <div className="flex items-center gap-2">
          <h1 className={`text-2xl font-bold tracking-tight ${isLight ? "text-slate-900" : "text-white"}`}>
            Admin Dashboard
          </h1>
          <SectionInfoTooltip
            title="Admin Command Center"
            content="Executive platform telemetry, active lead funnels, operational throughput, and system audit logs."
          />
        </div>

        {/* Quick Actions */}
        <div className="flex items-center gap-2.5">
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
          className={`group p-5 rounded-2xl border transition-all flex flex-col justify-between cursor-pointer ${
            isLight
              ? "bg-white border-slate-200 hover:border-violet-300 shadow-sm hover:shadow-md"
              : "bg-[#0F172A]/70 backdrop-blur-xl border-white/10 hover:border-violet-500/40 shadow-xl"
          }`}
        >
          <div>
            <div className="flex items-center justify-between">
              <span className={`text-[11px] uppercase tracking-wider font-semibold ${isLight ? "text-slate-500" : "text-slate-400"}`}>
                Total Users
              </span>
              {trends?.users !== undefined && (
                <span className="text-emerald-500 text-xs font-semibold">{trendBadge(trends.users)?.text}</span>
              )}
            </div>
            <div className={`mt-3 text-3xl font-bold tracking-tight ${isLight ? "text-slate-900" : "text-white"}`}>
              {stats.totalUsers}
            </div>
            <p className={`mt-1 text-xs ${isLight ? "text-slate-500" : "text-slate-400"}`}>Buyers, CPs & Developers</p>
          </div>
          <div
            className={`mt-5 pt-3 border-t flex items-center justify-between text-xs font-medium transition-colors ${
              isLight ? "border-slate-100 text-violet-600 group-hover:text-violet-700" : "border-white/5 text-violet-400 group-hover:text-violet-300"
            }`}
          >
            <span>Manage accounts</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
          </div>
        </div>

        {/* Total Projects */}
        <div
          onClick={() => navigate("/admin/listings")}
          className={`group p-5 rounded-2xl border transition-all flex flex-col justify-between cursor-pointer ${
            isLight
              ? "bg-white border-slate-200 hover:border-amber-300 shadow-sm hover:shadow-md"
              : "bg-[#0F172A]/70 backdrop-blur-xl border-white/10 hover:border-amber-500/40 shadow-xl"
          }`}
        >
          <div>
            <div className="flex items-center justify-between">
              <span className={`text-[11px] uppercase tracking-wider font-semibold ${isLight ? "text-slate-500" : "text-slate-400"}`}>
                Total Projects
              </span>
              {trends?.projects !== undefined && (
                <span className="text-amber-500 text-xs font-semibold">{trendBadge(trends.projects)?.text}</span>
              )}
            </div>
            <div className={`mt-3 text-3xl font-bold tracking-tight ${isLight ? "text-slate-900" : "text-white"}`}>
              {stats.totalProjects}
            </div>
            <p className={`mt-1 text-xs ${isLight ? "text-slate-500" : "text-slate-400"}`}>Approved listings</p>
          </div>
          <div
            className={`mt-5 pt-3 border-t flex items-center justify-between text-xs font-medium transition-colors ${
              isLight ? "border-slate-100 text-amber-600 group-hover:text-amber-700" : "border-white/5 text-amber-400 group-hover:text-amber-300"
            }`}
          >
            <span>View & Manage Listings</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
          </div>
        </div>

        {/* Unified Financial Summary (Platform Fees + Lead Revenue Merged) */}
        <div
          onClick={() => navigate("/admin/revenue")}
          className={`group p-5 rounded-2xl border transition-all flex flex-col justify-between cursor-pointer ${
            isLight
              ? "bg-white border-slate-200 hover:border-emerald-300 shadow-sm hover:shadow-md"
              : "bg-[#0F172A]/70 backdrop-blur-xl border-white/10 hover:border-emerald-500/40 shadow-xl"
          }`}
        >
          <div>
            <div className="flex items-center justify-between">
              <span className={`text-[11px] uppercase tracking-wider font-semibold ${isLight ? "text-slate-500" : "text-slate-400"}`}>
                Total Revenue & Fees
              </span>
              {(trends?.platformFeeRevenue !== undefined || trends?.leadRevenue !== undefined) && (
                <span className="text-emerald-500 text-xs font-semibold">
                  {trendBadge(trends?.platformFeeRevenue ?? trends?.leadRevenue ?? 0)?.text}
                </span>
              )}
            </div>
            <div className={`mt-3 text-3xl font-bold tracking-tight ${isLight ? "text-slate-900" : "text-white"}`}>
              {formatINR((stats.platformFees || 0) + (stats.leadRevenue || 0))}
            </div>
            <p className={`mt-1 text-xs ${isLight ? "text-slate-500" : "text-slate-400"}`}>
              Fees: {formatINR(stats.platformFees || 0)} · Leads: {formatINR(stats.leadRevenue || 0)}
            </p>
          </div>
          <div
            className={`mt-5 pt-3 border-t flex items-center justify-between text-xs font-medium transition-colors ${
              isLight ? "border-slate-100 text-emerald-600 group-hover:text-emerald-700" : "border-white/5 text-emerald-400 group-hover:text-emerald-300"
            }`}
          >
            <span>View Financials</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
          </div>
        </div>

        {/* Live System Logs (New Card in freed slot) */}
        <div
          onClick={() => navigate("/admin/audit-logs")}
          className={`group p-5 rounded-2xl border transition-all flex flex-col justify-between cursor-pointer ${
            isLight
              ? "bg-white border-slate-200 hover:border-sky-300 shadow-sm hover:shadow-md"
              : "bg-[#0F172A]/70 backdrop-blur-xl border-white/10 hover:border-sky-500/40 shadow-xl"
          }`}
        >
          <div>
            <div className="flex items-center justify-between">
              <span className={`text-[11px] uppercase tracking-wider font-semibold flex items-center gap-1.5 ${isLight ? "text-slate-500" : "text-slate-400"}`}>
                <ScrollText className="w-3 h-3 text-sky-500" />
                Live System Logs
              </span>
              <span className="flex items-center gap-1 text-[11px] font-semibold text-sky-500">
                <span className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-pulse" />
                Live
              </span>
            </div>
            <div className={`mt-3 text-3xl font-bold tracking-tight ${isLight ? "text-slate-900" : "text-white"}`}>
              {activity.length > 0 ? `${activity.length} Events` : "Active"}
            </div>
            <p className={`mt-1 text-xs truncate max-w-[220px] ${isLight ? "text-slate-500" : "text-slate-400"}`}>
              {activity[0] ? activity[0].action.replace(/_/g, " ") : "Real-time audit log stream"}
            </p>
          </div>
          <div
            className={`mt-5 pt-3 border-t flex items-center justify-between text-xs font-medium transition-colors ${
              isLight ? "border-slate-100 text-sky-600 group-hover:text-sky-700" : "border-white/5 text-sky-400 group-hover:text-sky-300"
            }`}
          >
            <span>View Activity Logs</span>
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
            <Target className="w-4 h-4 text-violet-500" />
            <h2 className={`text-sm font-semibold tracking-tight ${isLight ? "text-slate-900" : "text-white"}`}>
              Lead Pipeline
            </h2>
            <SectionInfoTooltip
              title="Lead Pipeline Funnel"
              content="Real-time multi-stage buyer funnel from raw capture to booking token. Click any stage to open and filter leads."
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
            {/* Stage 1 */}
            <div
              onClick={() => navigate("/admin/leads")}
              className={`p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                isLight
                  ? "bg-white border-slate-200 shadow-xs hover:border-slate-300"
                  : "bg-[#0F172A]/70 backdrop-blur-md border-white/10 hover:border-violet-500/40"
              }`}
            >
              <span className={`text-[10px] uppercase tracking-wider font-bold ${isLight ? "text-slate-500" : "text-slate-400"}`}>
                Total Leads
              </span>
              <div className="my-2">
                <div className={`text-2xl font-bold ${isLight ? "text-slate-900" : "text-white"}`}>{leadStats.total}</div>
                <span className={`text-[11px] ${isLight ? "text-slate-500" : "text-slate-400"}`}>All captured</span>
              </div>
              <div className={`w-full h-1 rounded-full overflow-hidden ${isLight ? "bg-slate-100" : "bg-white/5"}`}>
                <div className="bg-violet-500 h-full w-full" />
              </div>
            </div>

            {/* Stage 2 */}
            <div
              onClick={() => navigate("/admin/leads?status=NEW")}
              className={`p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                isLight
                  ? "bg-white border-slate-200 shadow-xs hover:border-slate-300"
                  : "bg-[#0F172A]/70 backdrop-blur-md border-white/10 hover:border-amber-500/40"
              }`}
            >
              <span className={`text-[10px] uppercase tracking-wider font-bold ${isLight ? "text-slate-500" : "text-slate-400"}`}>
                New Leads
              </span>
              <div className="my-2">
                <div className={`text-2xl font-bold ${isLight ? "text-slate-900" : "text-white"}`}>{leadStats.new}</div>
                <span className="text-[11px] text-amber-500 font-medium">Needs contact</span>
              </div>
              <div className={`w-full h-1 rounded-full overflow-hidden ${isLight ? "bg-slate-100" : "bg-white/5"}`}>
                <div
                  className="bg-amber-500 h-full"
                  style={{ width: `${leadStats.total ? Math.min(100, (leadStats.new / leadStats.total) * 100) : 0}%` }}
                />
              </div>
            </div>

            {/* Stage 3 */}
            <div
              onClick={() => navigate("/admin/leads?status=SITE_VISIT_SCHEDULED")}
              className={`p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                isLight
                  ? "bg-white border-slate-200 shadow-xs hover:border-slate-300"
                  : "bg-[#0F172A]/70 backdrop-blur-md border-white/10 hover:border-blue-500/40"
              }`}
            >
              <span className={`text-[10px] uppercase tracking-wider font-bold ${isLight ? "text-slate-500" : "text-slate-400"}`}>
                Scheduled Visits
              </span>
              <div className="my-2">
                <div className={`text-2xl font-bold ${isLight ? "text-slate-900" : "text-white"}`}>{leadStats.visitsScheduled}</div>
                <span className="text-[11px] text-blue-500 font-medium">Upcoming visits</span>
              </div>
              <div className={`w-full h-1 rounded-full overflow-hidden ${isLight ? "bg-slate-100" : "bg-white/5"}`}>
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
              className={`p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                isLight
                  ? "bg-white border-slate-200 shadow-xs hover:border-slate-300"
                  : "bg-[#0F172A]/70 backdrop-blur-md border-white/10 hover:border-cyan-500/40"
              }`}
            >
              <span className={`text-[10px] uppercase tracking-wider font-bold ${isLight ? "text-slate-500" : "text-slate-400"}`}>
                Completed Visits
              </span>
              <div className="my-2">
                <div className={`text-2xl font-bold ${isLight ? "text-slate-900" : "text-white"}`}>{leadStats.visitsCompleted}</div>
                <span className="text-[11px] text-cyan-500 font-medium">Visits done</span>
              </div>
              <div className={`w-full h-1 rounded-full overflow-hidden ${isLight ? "bg-slate-100" : "bg-white/5"}`}>
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
              className={`p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                isLight
                  ? "bg-emerald-50/60 border-emerald-200 shadow-xs hover:border-emerald-300"
                  : "bg-[#0F172A]/70 backdrop-blur-md border-white/10 hover:border-emerald-500/40"
              }`}
            >
              <span className={`text-[10px] uppercase tracking-wider font-bold ${isLight ? "text-emerald-700" : "text-emerald-400"}`}>
                Converted
              </span>
              <div className="my-2">
                <div className={`text-2xl font-bold ${isLight ? "text-emerald-700" : "text-emerald-400"}`}>{leadStats.converted}</div>
                <span className={`text-[11px] font-medium ${isLight ? "text-emerald-600" : "text-emerald-400"}`}>Booked units</span>
              </div>
              <div className={`w-full h-1 rounded-full overflow-hidden ${isLight ? "bg-emerald-100" : "bg-white/5"}`}>
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
        <section
          className={`p-4 rounded-2xl border transition-colors ${
            isLight
              ? "bg-white border-slate-200 shadow-sm"
              : "bg-[#0F172A]/80 backdrop-blur-xl border-white/10 shadow-lg"
          }`}
        >
          <div className={`flex items-center gap-2 mb-3 pb-2 border-b ${isLight ? "border-slate-100" : "border-white/5"}`}>
            <Activity className="w-3.5 h-3.5 text-violet-500" />
            <span className={`text-xs font-bold tracking-tight uppercase tracking-wider ${isLight ? "text-slate-700" : "text-slate-300"}`}>
              Operations Today
            </span>
            <SectionInfoTooltip
              title="Daily Operations"
              content="Real-time operational velocity tracking today's booking revenues, new lead intakes, physical site visits, and active CP broker activations."
            />
          </div>
          <div
            className={`grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3 divide-y sm:divide-y-0 sm:divide-x ${
              isLight ? "divide-slate-200" : "divide-white/10"
            }`}
          >
            {/* Metric 1 */}
            <div
              onClick={() => navigate("/admin/revenue")}
              className="flex items-center gap-3 px-3 py-1 cursor-pointer hover:opacity-80 transition-opacity"
            >
              <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500 flex-shrink-0">
                <Wallet className="w-4 h-4" />
              </div>
              <div>
                <span className={`text-[10px] uppercase font-bold ${isLight ? "text-slate-500" : "text-slate-400"}`}>
                  Revenue Today
                </span>
                <div className={`text-sm font-bold ${isLight ? "text-slate-900" : "text-white"}`}>
                  {formatINR(overview.companyHealth.revenueToday)}
                </div>
              </div>
            </div>

            {/* Metric 2 */}
            <div className="flex items-center gap-3 px-3 py-1">
              <div className="w-9 h-9 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-500 flex-shrink-0">
                <Inbox className="w-4 h-4" />
              </div>
              <div>
                <span className={`text-[10px] uppercase font-bold ${isLight ? "text-slate-500" : "text-slate-400"}`}>
                  Leads Today
                </span>
                <div className={`text-sm font-bold ${isLight ? "text-slate-900" : "text-white"}`}>
                  {overview.sales.leadsToday} New
                </div>
              </div>
            </div>

            {/* Metric 3 */}
            <div className="flex items-center gap-3 px-3 py-1">
              <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 flex-shrink-0">
                <Target className="w-4 h-4" />
              </div>
              <div>
                <span className={`text-[10px] uppercase font-bold ${isLight ? "text-slate-500" : "text-slate-400"}`}>
                  Bookings Today
                </span>
                <div className={`text-sm font-bold ${isLight ? "text-slate-900" : "text-white"}`}>
                  {overview.executive.todaysBookings} Units
                </div>
              </div>
            </div>

            {/* Metric 4 */}
            <div
              onClick={() => navigate("/admin/kyc")}
              className="flex items-center gap-3 px-3 py-1 cursor-pointer hover:opacity-80 transition-opacity"
            >
              <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-500 flex-shrink-0">
                <Users className="w-4 h-4" />
              </div>
              <div>
                <span className={`text-[10px] uppercase font-bold ${isLight ? "text-slate-500" : "text-slate-400"}`}>
                  Pending CP KYC
                </span>
                <div className={`text-sm font-bold ${isLight ? "text-slate-900" : "text-white"}`}>
                  {overview.verification.pendingKyc}
                </div>
              </div>
            </div>

            {/* Metric 5 */}
            <div
              onClick={() => navigate("/admin/verification")}
              className="flex items-center gap-3 px-3 py-1 cursor-pointer hover:opacity-80 transition-opacity"
            >
              <div className="w-9 h-9 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-500 flex-shrink-0">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div>
                <span className={`text-[10px] uppercase font-bold ${isLight ? "text-slate-500" : "text-slate-400"}`}>
                  Pending Verification
                </span>
                <div className="text-sm font-bold text-rose-500">
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
      <section
        className={`p-5 sm:p-6 rounded-2xl border transition-colors ${
          isLight
            ? "bg-white border-slate-200 shadow-sm"
            : "bg-[#0F172A]/70 backdrop-blur-xl border-white/10 shadow-xl"
        }`}
      >
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Left Panel: 1/3 Summary Metrics & Quick Dossiers */}
          <div
            className={`w-full lg:w-1/3 flex flex-col justify-between space-y-4 border-b lg:border-b-0 lg:border-r lg:pr-6 pb-6 lg:pb-0 ${
              isLight ? "border-slate-200" : "border-white/10"
            }`}
          >
            <div>
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-violet-500" />
                <h3 className={`text-base font-bold tracking-tight ${isLight ? "text-slate-900" : "text-white"}`}>
                  Platform Growth
                </h3>
                <SectionInfoTooltip
                  title="Platform Growth"
                  content="Weekly telemetry tracking new user registrations, approved developer inventory additions, and 7-day velocity."
                />
              </div>
            </div>

            {/* 7-Day Metrics Grid */}
            <div className="grid grid-cols-2 gap-3">
              <div
                onClick={() => navigate("/admin/users")}
                className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                  isLight
                    ? "bg-slate-50 border-slate-200 hover:border-violet-300"
                    : "bg-white/[0.03] border-white/10 hover:border-violet-500/40"
                }`}
              >
                <span className={`text-[10px] uppercase tracking-wider font-semibold ${isLight ? "text-slate-500" : "text-slate-400"}`}>
                  Users Added
                </span>
                <div className={`mt-1 text-2xl font-bold ${isLight ? "text-slate-900" : "text-white"}`}>
                  {platformUsersStatus === "loaded" ? usersAddedIn7Days : "—"}
                </div>
                <span className="text-[10px] text-violet-600 dark:text-violet-400 font-medium inline-flex items-center gap-0.5 mt-1">
                  View users →
                </span>
              </div>

              <div
                onClick={() => navigate("/admin/listings")}
                className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                  isLight
                    ? "bg-slate-50 border-slate-200 hover:border-amber-300"
                    : "bg-white/[0.03] border-white/10 hover:border-amber-500/40"
                }`}
              >
                <span className={`text-[10px] uppercase tracking-wider font-semibold ${isLight ? "text-slate-500" : "text-slate-400"}`}>
                  Projects Added
                </span>
                <div className={`mt-1 text-2xl font-bold ${isLight ? "text-slate-900" : "text-white"}`}>
                  {platformProjectsStatus === "loaded" ? projectsAddedIn7Days : "—"}
                </div>
                <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium inline-flex items-center gap-0.5 mt-1">
                  View listings →
                </span>
              </div>
            </div>

            {/* Latest User Onboarded */}
            <div
              className={`p-3 rounded-xl border flex items-center justify-between ${
                isLight ? "bg-slate-50/70 border-slate-200/60" : "bg-white/[0.02] border-white/5"
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0 ${
                    isLight
                      ? "bg-violet-100 text-violet-700 border border-violet-200"
                      : "bg-violet-600/30 text-violet-300 border border-violet-500/30"
                  }`}
                >
                  {latestUsers[0] ? initials(latestUsers[0].name) : "U"}
                </div>
                <div className="flex flex-col truncate">
                  <span className={`text-xs font-semibold truncate ${isLight ? "text-slate-900" : "text-white"}`}>
                    {latestUsers[0]?.name || "No new accounts"}
                  </span>
                  <span className={`text-[10px] truncate ${isLight ? "text-slate-500" : "text-slate-400"}`}>
                    {latestUsers[0]?.role || "User"} · {formatIndiaDateTime(latestUsers[0]?.createdAt)}
                  </span>
                </div>
              </div>
            </div>

            {/* Latest Project Listed */}
            <div
              className={`p-3 rounded-xl border flex items-center justify-between ${
                isLight ? "bg-slate-50/70 border-slate-200/60" : "bg-white/[0.02] border-white/5"
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs flex-shrink-0 ${
                    isLight
                      ? "bg-amber-100 text-amber-700 border border-amber-200"
                      : "bg-amber-500/10 text-amber-300 border border-amber-500/20"
                  }`}
                >
                  <Building2 className="w-4 h-4" />
                </div>
                <div className="flex flex-col truncate">
                  <span className={`text-xs font-semibold truncate ${isLight ? "text-slate-900" : "text-white"}`}>
                    {latestProjects[0]?.name || "No recent projects"}
                  </span>
                  <span className={`text-[10px] truncate ${isLight ? "text-slate-500" : "text-slate-400"}`}>
                    {latestProjects[0]?.city || "Location not set"} · {formatIndiaDateTime(latestProjects[0]?.createdAt)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Panel: 2/3 Interactive 7-Day Activity Chart */}
          <div className="w-full lg:w-2/3 flex flex-col justify-between space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h4 className={`text-sm font-bold tracking-tight ${isLight ? "text-slate-900" : "text-white"}`}>
                Daily Additions (Last 7 Days)
              </h4>
              <div className="flex items-center gap-4 text-xs font-medium">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded bg-violet-500" />
                  <span className={isLight ? "text-slate-700" : "text-slate-300"}>Users</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded bg-amber-400" />
                  <span className={isLight ? "text-slate-700" : "text-slate-300"}>Projects</span>
                </div>
              </div>
            </div>

            {/* 7-Day Chart Bars */}
            <div className="pt-6 pb-2">
              <div className="grid grid-cols-7 gap-2 sm:gap-3 items-end h-44">
                {growthDays.map((day) => (
                  <div key={day.key} className="flex flex-col items-center gap-2 h-full justify-end group">
                    <span
                      className={`text-[10px] font-mono opacity-0 group-hover:opacity-100 transition-opacity ${
                        isLight ? "text-slate-600" : "text-slate-400"
                      }`}
                    >
                      {day.users + day.projects}
                    </span>
                    <div
                      className={`w-full flex items-end justify-center gap-1 h-32 p-1 rounded-xl border ${
                        isLight ? "bg-slate-100 border-slate-200" : "bg-white/[0.02] border-white/5"
                      }`}
                    >
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
                    <span
                      className={`text-[10px] font-medium transition-colors ${
                        isLight ? "text-slate-500 group-hover:text-slate-900" : "text-slate-400 group-hover:text-white"
                      }`}
                    >
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
        <section
          className={`p-4 rounded-xl border shadow-sm transition-colors ${
            isLight ? "bg-white border-slate-200" : "bg-[#0F172A]/80 backdrop-blur-md border-white/10"
          }`}
        >
          <div className={`flex items-center gap-2 mb-3 pb-2 border-b ${isLight ? "border-slate-100" : "border-white/5"}`}>
            <Landmark className="w-3.5 h-3.5 text-emerald-500" />
            <span className={`text-xs font-bold tracking-tight uppercase tracking-wider ${isLight ? "text-slate-700" : "text-slate-300"}`}>
              Investor Intelligence
            </span>
            <SectionInfoTooltip
              title="Investor Telemetry"
              content="Key financial benchmarks: ARR, MRR, GMV, Customer Lifetime Value (LTV), Customer Acquisition Cost (CAC), and paying subscriber counts."
            />
          </div>
          <div
            className={`grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3 text-center divide-y-0 xl:divide-x ${
              isLight ? "divide-slate-200" : "divide-white/10"
            }`}
          >
            <div className="px-2">
              <span className={`text-[10px] uppercase font-bold ${isLight ? "text-slate-500" : "text-slate-400"}`}>
                ARR
              </span>
              <div className="text-base font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                {paise(investor.arrPaise)}
              </div>
            </div>
            <div className="px-2">
              <span className={`text-[10px] uppercase font-bold ${isLight ? "text-slate-500" : "text-slate-400"}`}>
                MRR
              </span>
              <div className={`text-base font-bold mt-0.5 ${isLight ? "text-slate-900" : "text-white"}`}>
                {paise(investor.mrrPaise)}
              </div>
            </div>
            <div className="px-2">
              <span className={`text-[10px] uppercase font-bold ${isLight ? "text-slate-500" : "text-slate-400"}`}>
                LTV / CAC
              </span>
              <div className="text-base font-bold text-violet-600 dark:text-violet-400 mt-0.5">
                {paise(investor.ltvPaise)} / {paise(investor.cacPaise)}
              </div>
            </div>
            <div className="px-2">
              <span className={`text-[10px] uppercase font-bold ${isLight ? "text-slate-500" : "text-slate-400"}`}>
                Churn
              </span>
              <div className={`text-base font-bold mt-0.5 ${isLight ? "text-slate-900" : "text-white"}`}>
                {investor.churnPercent}%
              </div>
            </div>
            <div className="px-2">
              <span className={`text-[10px] uppercase font-bold ${isLight ? "text-slate-500" : "text-slate-400"}`}>
                Conversion
              </span>
              <div className={`text-base font-bold mt-0.5 ${isLight ? "text-slate-900" : "text-white"}`}>
                {investor.conversionPercent}%
              </div>
            </div>
            <div className="px-2">
              <span className={`text-[10px] uppercase font-bold ${isLight ? "text-slate-500" : "text-slate-400"}`}>
                Paying Users
              </span>
              <div className={`text-base font-bold mt-0.5 ${isLight ? "text-slate-900" : "text-white"}`}>
                {investor.payingUsers}
              </div>
            </div>
            <div className="px-2">
              <span className={`text-[10px] uppercase font-bold ${isLight ? "text-slate-500" : "text-slate-400"}`}>
                Network
              </span>
              <div className={`text-base font-bold mt-0.5 ${isLight ? "text-slate-900" : "text-white"}`}>
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
        <div
          className={`p-5 sm:p-6 rounded-2xl border transition-colors flex flex-col justify-between ${
            isLight
              ? "bg-white border-slate-200 shadow-sm"
              : "bg-[#0F172A]/70 backdrop-blur-xl border-white/10 shadow-xl"
          }`}
        >
          <div>
            <div
              className={`flex items-center justify-between border-b pb-4 ${
                isLight ? "border-slate-200" : "border-white/10"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Clock className="w-5 h-5 text-amber-500" />
                <h3 className={`text-base font-bold tracking-tight ${isLight ? "text-slate-900" : "text-white"}`}>
                  Pending Project Approvals
                </h3>
                <SectionInfoTooltip
                  title="Project Moderation Queue"
                  content="Real-time queue of projects submitted by developers requiring admin verification, legal checks, and publishing approval."
                />
              </div>
              <span className="text-xs text-amber-600 dark:text-amber-400 font-semibold">{pendingProjects.length} pending</span>
            </div>

            <div className={`mt-4 divide-y ${isLight ? "divide-slate-100" : "divide-white/5"}`}>
              {pendingProjects.length === 0 ? (
                <div className={`py-8 text-center text-xs ${isLight ? "text-slate-500" : "text-slate-400"}`}>
                  <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2 opacity-80" />
                  All developer project approvals are up to date.
                </div>
              ) : (
                pendingProjects.map((p) => (
                  <div key={p._id} className="py-3.5 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-9 h-9 rounded-xl font-bold text-xs flex items-center justify-center flex-shrink-0 ${
                          isLight
                            ? "bg-violet-100 text-violet-700 border border-violet-200"
                            : "bg-violet-600/20 border border-violet-500/30 text-violet-300"
                        }`}
                      >
                        {initials(p.name)}
                      </div>
                      <div className="flex flex-col min-w-0 truncate">
                        <span className={`text-xs font-bold truncate ${isLight ? "text-slate-900" : "text-white"}`}>
                          {p.name}
                        </span>
                        <span className={`text-[11px] truncate ${isLight ? "text-slate-500" : "text-slate-400"}`}>
                          {p.city} · by {nameOf(p.developerId)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => navigate(`/admin/listings/${p._id}`)}
                        className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold transition-all flex items-center gap-1 ${
                          isLight
                            ? "bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700"
                            : "bg-white/5 hover:bg-white/10 border-white/10 text-slate-300"
                        }`}
                      >
                        <Eye className="w-3 h-3" />
                        <span>Inspect</span>
                      </button>
                      <button
                        onClick={() => approveProject(p._id, "APPROVED")}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-semibold shadow-xs transition-all flex items-center gap-1"
                      >
                        <Check className="w-3 h-3" />
                        <span>Approve</span>
                      </button>
                      <button
                        onClick={() => approveProject(p._id, "REJECTED")}
                        className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold transition-all flex items-center gap-1 ${
                          isLight
                            ? "bg-rose-50 hover:bg-rose-100 border-rose-200 text-rose-700"
                            : "bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400"
                        }`}
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

          <div className={`mt-4 pt-3 border-t text-right ${isLight ? "border-slate-100" : "border-white/5"}`}>
            <button
              onClick={() => navigate("/admin/listings")}
              className="text-xs text-violet-600 dark:text-violet-400 hover:underline font-medium inline-flex items-center gap-1"
            >
              <span>View all projects</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Right Column: Recent Activity */}
        <div
          className={`p-5 sm:p-6 rounded-2xl border transition-colors flex flex-col justify-between ${
            isLight
              ? "bg-white border-slate-200 shadow-sm"
              : "bg-[#0F172A]/70 backdrop-blur-xl border-white/10 shadow-xl"
          }`}
        >
          <div>
            <div
              className={`flex items-center justify-between border-b pb-4 ${
                isLight ? "border-slate-200" : "border-white/10"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Activity className="w-5 h-5 text-emerald-500" />
                <h3 className={`text-base font-bold tracking-tight ${isLight ? "text-slate-900" : "text-white"}`}>
                  Recent Platform Activity
                </h3>
                <SectionInfoTooltip
                  title="Audit Stream"
                  content="Real-time chronological audit trail of user logins, role upgrades, project updates, and KYC verification milestones."
                />
              </div>
            </div>

            <div className={`mt-4 divide-y ${isLight ? "divide-slate-100" : "divide-white/5"}`}>
              {activity.length === 0 ? (
                <div className={`py-8 text-center text-xs ${isLight ? "text-slate-500" : "text-slate-400"}`}>
                  No recent activity recorded.
                </div>
              ) : (
                activity.map((a, i) => (
                  <div key={i} className="py-3 flex items-start gap-3">
                    <div
                      className={`w-8 h-8 rounded-full border text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5 ${
                        isLight
                          ? "bg-slate-100 border-slate-200 text-slate-700"
                          : "bg-white/5 border-white/10 text-slate-300"
                      }`}
                    >
                      {a.actor?.name ? initials(a.actor.name) : "•"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs">
                        <strong className={`font-semibold ${isLight ? "text-slate-900" : "text-white"}`}>
                          {a.actor?.name ?? "System"}
                        </strong>{" "}
                        <span className={isLight ? "text-slate-600" : "text-slate-300"}>
                          {activityText(a)}
                        </span>
                      </div>
                      <div className={`text-[10px] mt-0.5 ${isLight ? "text-slate-400" : "text-slate-500"}`}>
                        {a.actor?.role ? `${a.actor.role} · ` : ""}
                        {timeAgo(a.createdAt)}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className={`mt-4 pt-3 border-t text-right ${isLight ? "border-slate-100" : "border-white/5"}`}>
            <button
              onClick={() => navigate("/admin/audit-logs")}
              className="text-xs text-violet-600 dark:text-violet-400 hover:underline font-medium inline-flex items-center gap-1"
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
