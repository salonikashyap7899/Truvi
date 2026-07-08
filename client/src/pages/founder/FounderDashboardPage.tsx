import { useEffect, useState } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import {
  IndianRupee, TrendingUp, TrendingDown, Users, Building2, Filter, AlertTriangle,
  Trophy, ShieldCheck, LogOut, RefreshCw, Info,
} from "lucide-react";

/**
 * Founder OS — Phase 1 dashboard.
 *
 * A Founder Operating System, not an admin panel: the complete health of
 * the company in one screen — KPIs, revenue trend, lead funnel, project
 * performance, CP leaderboard, ambassador ops, and an alerts rail where
 * every problem carries a recommended action. Every number is queried
 * live from /api/founder/overview.
 *
 * Brand: navy #0B1F3A canvas, antique-gold accents, Cormorant Garamond
 * display + Lora body — scoped to Founder OS via inline font styles so
 * the rest of the app's theme is untouched.
 */

/* ── Palette ──────────────────────────────────────────────────────────────── */
const NAVY = "#0B1F3A";
const NAVY_CARD = "#0F2747";
const NAVY_LINE = "rgba(197,160,89,0.18)";
const GOLD = "#C5A059";
const GOLD_SOFT = "rgba(197,160,89,0.12)";
const serif = { fontFamily: "'Cormorant Garamond', Georgia, serif" };
const body = { fontFamily: "'Lora', Georgia, serif" };

/* ── Types (mirror the /overview payload) ─────────────────────────────────── */
interface Overview {
  generatedAt: string;
  kpis: {
    totalRevenue: number; revenueThisMonth: number; momChangePct: number | null;
    gmv: number; cpCommissionsPaid: number; bookings: number;
    activeDevelopers: number; totalDevelopers: number; totalCps: number; totalBuyers: number;
    pendingApprovals: number; liveProjects: number; pendingProjects: number;
    totalLeads: number; conversionPct: number; enquiries7d: number;
    unitsAvailable: number; unitsSold: number;
  };
  revenueSeries: { month: string; revenue: number; gmv: number; bookings: number }[];
  funnel: { stage: string; count: number }[];
  projects: {
    _id: string; name: string; city: string; developer: string; isPrimeListing: boolean;
    totalUnits: number; soldUnits: number; soldPct: number; salesValue: number;
    leads: number; wonLeads: number; health: "GREEN" | "AMBER" | "RED";
  }[];
  cpLeaderboard: {
    cpId: string; name: string; tier: string; bookings: number;
    commissionEarned: number; platformFees: number; gmv: number; conversionRatio: number;
  }[];
  ambassadors: { activeAmbassadors: number; tasks: Record<string, number> };
  alerts: { id: string; severity: "HIGH" | "MEDIUM" | "LOW"; title: string; detail: string; action: string }[];
}

/* ── Helpers ──────────────────────────────────────────────────────────────── */
function inr(n: number): string {
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(2)} L`;
  if (n >= 1e3) return `₹${(n / 1e3).toFixed(1)}K`;
  return `₹${n}`;
}
function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleString("en-IN", { month: "short" });
}

const STAGE_LABEL: Record<string, string> = {
  GENERATED: "Generated", ASSIGNED: "Assigned", CONTACTED: "Contacted", SITE_VISIT: "Site Visit",
  NEGOTIATION: "Negotiation", BOOKING: "Booking", REGISTRATION: "Registration", LOST: "Lost",
};

const HEALTH_META: Record<string, { label: string; cls: string }> = {
  GREEN: { label: "Healthy", cls: "text-emerald-300 bg-emerald-500/10 border-emerald-400/25" },
  AMBER: { label: "Watch", cls: "text-amber-300 bg-amber-500/10 border-amber-400/25" },
  RED: { label: "At risk", cls: "text-red-300 bg-red-500/10 border-red-400/25" },
};

const SEVERITY_META: Record<string, { cls: string; dot: string }> = {
  HIGH: { cls: "border-red-400/30 bg-red-500/[0.06]", dot: "bg-red-400" },
  MEDIUM: { cls: "border-amber-400/30 bg-amber-500/[0.06]", dot: "bg-amber-400" },
  LOW: { cls: "border-sky-400/30 bg-sky-500/[0.06]", dot: "bg-sky-400" },
};

/* ── Small UI atoms ───────────────────────────────────────────────────────── */
function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl p-5 ${className}`} style={{ background: NAVY_CARD, border: `1px solid ${NAVY_LINE}` }}>
      {children}
    </div>
  );
}

function KpiCard({ icon, label, value, sub, trend }: {
  icon: React.ReactNode; label: string; value: string; sub?: string; trend?: number | null;
}) {
  return (
    <Card>
      <div className="flex items-start justify-between">
        <span className="grid size-9 place-items-center rounded-lg" style={{ background: GOLD_SOFT, color: GOLD }}>{icon}</span>
        {trend !== undefined && trend !== null && (
          <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${trend >= 0 ? "text-emerald-300" : "text-red-300"}`}>
            {trend >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
            {trend >= 0 ? "+" : ""}{trend}%
          </span>
        )}
      </div>
      <p className="mt-4 text-2xl font-semibold text-white md:text-[1.7rem]" style={serif}>{value}</p>
      <p className="mt-0.5 text-[11px] uppercase tracking-[0.15em] text-white/45">{label}</p>
      {sub && <p className="mt-1 text-xs text-white/55" style={body}>{sub}</p>}
    </Card>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────────── */
export default function FounderDashboardPage() {
  const { user, logout } = useAuth();
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    setRefreshing(true);
    try {
      const res = await api.get("/founder/overview");
      setData(res.data);
      setError(null);
    } catch (err: any) {
      setError(err?.response?.data?.error || "Failed to load Founder OS");
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    document.title = "TRUVI — Founder OS";
    load();
  }, []);

  if (error) {
    return (
      <main className="grid min-h-screen place-items-center px-6" style={{ background: NAVY }}>
        <p className="text-red-300" style={body}>{error}</p>
      </main>
    );
  }
  if (!data) {
    return (
      <main className="grid min-h-screen place-items-center" style={{ background: NAVY }}>
        <div className="flex flex-col items-center gap-3 text-white/60">
          <div className="size-8 animate-spin rounded-full border-2 border-white/15" style={{ borderTopColor: GOLD }} />
          <p style={body}>Reading the company…</p>
        </div>
      </main>
    );
  }

  const k = data.kpis;
  const maxFunnel = Math.max(...data.funnel.map((f) => f.count), 1);

  return (
    <main className="relative z-10 min-h-screen text-white" style={{ background: NAVY }}>
      {/* Header */}
      <header className="sticky top-0 z-20 border-b px-5 py-4 backdrop-blur md:px-8" style={{ borderColor: NAVY_LINE, background: "rgba(11,31,58,0.85)" }}>
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center overflow-hidden rounded-lg bg-white p-1">
              <img src="/brand/icon.png" alt="Truvi" className="h-full w-full object-contain" />
            </span>
            <div>
              <p className="text-lg font-semibold leading-none" style={serif}>Founder OS</p>
              <p className="text-[11px] uppercase tracking-[0.2em] text-white/45">Truvi Ventures · Company health</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={load}
              disabled={refreshing}
              className="grid size-9 place-items-center rounded-lg border text-white/70 transition hover:text-white"
              style={{ borderColor: NAVY_LINE }}
              title="Refresh"
            >
              <RefreshCw size={15} className={refreshing ? "animate-spin" : ""} />
            </button>
            <button
              onClick={() => logout()}
              className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs text-white/70 transition hover:text-white"
              style={{ borderColor: NAVY_LINE }}
            >
              <LogOut size={13} /> Sign out
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-6 px-5 py-6 md:px-8 md:py-8">
        {/* Greeting */}
        <div>
          <h1 className="text-3xl font-semibold md:text-4xl" style={serif}>
            Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening"}, {user?.name?.split(" ")[0] ?? "Founder"}.
          </h1>
          <p className="mt-1 text-white/55" style={body}>
            Here's the whole company as of {new Date(data.generatedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}.
          </p>
        </div>

        {/* KPI grid */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <KpiCard icon={<IndianRupee size={17} />} label="Total platform revenue" value={inr(k.totalRevenue)} sub={`${inr(k.revenueThisMonth)} this month`} trend={k.momChangePct} />
          <KpiCard icon={<TrendingUp size={17} />} label="Gross booking value" value={inr(k.gmv)} sub={`${k.bookings} bookings · ${inr(k.cpCommissionsPaid)} CP payouts`} />
          <KpiCard icon={<Building2 size={17} />} label="Live projects" value={String(k.liveProjects)} sub={`${k.pendingProjects} pending approval`} />
          <KpiCard icon={<Users size={17} />} label="Active developers" value={`${k.activeDevelopers}/${k.totalDevelopers}`} sub={`${k.totalCps} CPs · ${k.totalBuyers} buyers`} />
          <KpiCard icon={<Filter size={17} />} label="Lead → booking conversion" value={`${k.conversionPct}%`} sub={`${k.totalLeads} leads in pipeline`} />
          <KpiCard icon={<ShieldCheck size={17} />} label="Units sold / available" value={`${k.unitsSold} / ${k.unitsAvailable}`} sub="Across all live inventory" />
          <KpiCard icon={<Info size={17} />} label="Enquiries (7 days)" value={String(k.enquiries7d)} sub="New inbound interest" />
          <KpiCard icon={<AlertTriangle size={17} />} label="Needs your attention" value={String(k.pendingApprovals)} sub="Approvals waiting" />
        </div>

        {/* Revenue + Funnel */}
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold" style={serif}>Revenue — last 12 months</h2>
              <span className="text-xs text-white/45" style={body}>Platform fees + lead sales</span>
            </div>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={data.revenueSeries.map((r) => ({ ...r, label: monthLabel(r.month) }))} margin={{ left: -8, right: 8, top: 4 }}>
                <defs>
                  <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={GOLD} stopOpacity={0.5} />
                    <stop offset="100%" stopColor={GOLD} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(v) => inr(Number(v))} tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 11 }} axisLine={false} tickLine={false} width={64} />
                <Tooltip
                  contentStyle={{ background: NAVY, border: `1px solid ${NAVY_LINE}`, borderRadius: 12, color: "#fff" }}
                  formatter={(v) => [inr(Number(v)), "Revenue"] as [string, string]}
                  labelStyle={{ color: GOLD }}
                />
                <Area type="monotone" dataKey="revenue" stroke={GOLD} strokeWidth={2} fill="url(#rev)" />
              </AreaChart>
            </ResponsiveContainer>
          </Card>

          <Card>
            <h2 className="mb-4 text-lg font-semibold" style={serif}>Lead pipeline</h2>
            <div className="space-y-2.5">
              {data.funnel.map((f) => (
                <div key={f.stage}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="text-white/70" style={body}>{STAGE_LABEL[f.stage] ?? f.stage}</span>
                    <span className="font-semibold text-white">{f.count}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${(f.count / maxFunnel) * 100}%`, background: f.stage === "LOST" ? "rgba(248,113,113,0.6)" : GOLD }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Alerts rail — the "what needs attention" panel */}
        <Card>
          <div className="mb-4 flex items-center gap-2">
            <AlertTriangle size={17} style={{ color: GOLD }} />
            <h2 className="text-lg font-semibold" style={serif}>What needs your attention</h2>
            <span className="ml-auto rounded-full px-2.5 py-0.5 text-xs font-semibold" style={{ background: GOLD_SOFT, color: GOLD }}>
              {data.alerts.length} {data.alerts.length === 1 ? "signal" : "signals"}
            </span>
          </div>
          {data.alerts.length === 0 ? (
            <p className="py-4 text-center text-sm text-emerald-300" style={body}>All clear — no operational problems detected right now.</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {data.alerts.map((a) => {
                const s = SEVERITY_META[a.severity];
                return (
                  <div key={a.id} className={`rounded-xl border p-4 ${s.cls}`}>
                    <div className="flex items-start gap-2">
                      <span className={`mt-1.5 size-2 shrink-0 rounded-full ${s.dot}`} />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white">{a.title}</p>
                        <p className="mt-1 text-xs text-white/60" style={body}>{a.detail}</p>
                        <p className="mt-2 flex items-start gap-1.5 text-xs" style={{ ...body, color: GOLD }}>
                          <span className="font-semibold uppercase tracking-wide">Do:</span>
                          <span className="text-white/80">{a.action}</span>
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Projects + CP leaderboard */}
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2 overflow-hidden">
            <h2 className="mb-4 text-lg font-semibold" style={serif}>Project performance</h2>
            <div className="-mx-5 overflow-x-auto px-5">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-[0.12em] text-white/40">
                    <th className="pb-2 pr-3 font-medium">Project</th>
                    <th className="pb-2 px-3 font-medium">Sold</th>
                    <th className="pb-2 px-3 font-medium">Sales</th>
                    <th className="pb-2 px-3 font-medium">Leads</th>
                    <th className="pb-2 pl-3 font-medium">Health</th>
                  </tr>
                </thead>
                <tbody>
                  {data.projects.map((p) => (
                    <tr key={p._id} className="border-t" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                      <td className="py-3 pr-3">
                        <p className="font-medium text-white">{p.name}</p>
                        <p className="text-xs text-white/45">{p.city} · {p.developer}</p>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className="text-white/80">{p.soldUnits}/{p.totalUnits}</span>
                        <span className="ml-1 text-xs text-white/40">({p.soldPct}%)</span>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-white/80">{inr(p.salesValue)}</td>
                      <td className="px-3 py-3 text-white/80">{p.leads}</td>
                      <td className="py-3 pl-3">
                        <span className={`inline-block rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${HEALTH_META[p.health].cls}`}>
                          {HEALTH_META[p.health].label}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {data.projects.length === 0 && (
                    <tr><td colSpan={5} className="py-6 text-center text-white/40" style={body}>No live projects yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          <Card>
            <div className="mb-4 flex items-center gap-2">
              <Trophy size={16} style={{ color: GOLD }} />
              <h2 className="text-lg font-semibold" style={serif}>Channel Partner leaderboard</h2>
            </div>
            <div className="space-y-3">
              {data.cpLeaderboard.map((cp, i) => (
                <div key={cp.cpId} className="flex items-center gap-3">
                  <span className="grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold"
                    style={{ background: i === 0 ? GOLD : GOLD_SOFT, color: i === 0 ? NAVY : GOLD }}>
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white">{cp.name}</p>
                    <p className="text-[11px] text-white/45">{cp.tier} · {cp.bookings} bookings</p>
                  </div>
                  <p className="shrink-0 text-sm font-semibold" style={{ color: GOLD }}>{inr(cp.commissionEarned)}</p>
                </div>
              ))}
              {data.cpLeaderboard.length === 0 && (
                <p className="py-4 text-center text-sm text-white/40" style={body}>No commissions booked yet.</p>
              )}
            </div>
          </Card>
        </div>

        {/* Ambassador ops strip */}
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <ShieldCheck size={17} style={{ color: GOLD }} />
              <h2 className="text-lg font-semibold" style={serif}>Ambassador field ops</h2>
            </div>
            <div className="flex flex-wrap gap-6 text-sm">
              <div><span className="text-2xl font-semibold" style={{ ...serif, color: GOLD }}>{data.ambassadors.activeAmbassadors}</span><span className="ml-2 text-white/55" style={body}>active ambassadors</span></div>
              <div><span className="text-2xl font-semibold" style={serif}>{data.ambassadors.tasks.GREEN ?? 0}</span><span className="ml-2 text-emerald-300/80" style={body}>available</span></div>
              <div><span className="text-2xl font-semibold" style={serif}>{data.ambassadors.tasks.YELLOW ?? 0}</span><span className="ml-2 text-amber-300/80" style={body}>in progress</span></div>
              <div><span className="text-2xl font-semibold" style={serif}>{data.ambassadors.tasks.RED ?? 0}</span><span className="ml-2 text-white/55" style={body}>completed</span></div>
            </div>
          </div>
        </Card>

        <p className="pt-2 text-center text-xs text-white/30" style={body}>
          Founder OS · Phase 1 — Core Visibility & Control. AI Founder Brief and Ask-Anything decision engine follow in Phases 2 & 3.
        </p>
      </div>
    </main>
  );
}
