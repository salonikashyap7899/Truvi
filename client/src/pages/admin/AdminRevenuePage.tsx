import { useEffect, useMemo, useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, AreaChart, Area, XAxis, YAxis, CartesianGrid } from "recharts";
import { Wallet, TrendingUp, Star, Users, Building2, Download } from "lucide-react";
import { api } from "@/lib/api";
import { formatINR, formatCompactINR } from "@/lib/utils";
import { StatCard, StatSkeletonGrid } from "@/components/ui/stat";

interface RevenueData {
  platformFeeRevenue: number;
  leadServiceRevenue: number;
  leadPurchaseCount: number;
  premiumRevenue: number;
  premiumCount: number;
  featuredRevenueEstimate: number;
  featuredCount: number;
  totalRevenue: number;
  target: { platformFee: number; featuredListings: number; leadAsAService: number; premiumMembership: number; referralOther: number };
  monthlyTrend: { month: string; revenue: number }[];
  topDevelopers: { name: string; revenue: number }[];
}

const SOURCE_COLORS = ["#8B5CF6", "#F5B33F", "#38BDF8", "#14C79A", "#F472B6"];

export default function AdminRevenuePage() {
  const [data, setData] = useState<RevenueData | null>(null);

  useEffect(() => {
    api.get("/revenue").then((res) => setData(res.data));
  }, []);

  const sources = useMemo(() => {
    if (!data) return [];
    return [
      { key: "platformFee", label: "Platform Fee", value: data.platformFeeRevenue, target: data.target.platformFee, meta: "Developer commission-linked" },
      { key: "featured", label: "Featured Listings", value: data.featuredRevenueEstimate, target: data.target.featuredListings, meta: `${data.featuredCount} featured projects` },
      { key: "leads", label: "Lead-as-a-Service", value: data.leadServiceRevenue, target: data.target.leadAsAService, meta: `${data.leadPurchaseCount} leads purchased` },
      { key: "premium", label: "Premium Membership", value: data.premiumRevenue, target: data.target.premiumMembership, meta: `${data.premiumCount} Premium CPs` },
    ];
  }, [data]);

  const pieData = useMemo(() => sources.filter((s) => s.value > 0).map((s) => ({ name: s.label, value: s.value })), [sources]);

  function exportCsv() {
    if (!data) return;
    const rows = [["Revenue Source", "Amount (INR)", "Share %", "Target %"]];
    for (const s of sources) {
      const pct = data.totalRevenue > 0 ? Math.round((s.value / data.totalRevenue) * 100) : 0;
      rows.push([s.label, String(s.value), String(pct), String(s.target)]);
    }
    rows.push(["Total", String(data.totalRevenue), "100", ""]);
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `truvi-revenue-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="min-h-screen p-6 text-white md:p-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-widest text-violet-300/70">Truvi · Founder</p>
          <h1 className="mt-1 text-2xl font-semibold md:text-3xl">Revenue Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">Ecosystem revenue, computed live from the database.</p>
        </div>
        {data && (
          <button onClick={exportCsv} className="inline-flex items-center gap-2 self-start rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80 transition hover:bg-white/10">
            <Download size={15} /> Export CSV
          </button>
        )}
      </div>

      {!data ? (
        <div className="mt-6"><StatSkeletonGrid count={4} /></div>
      ) : (
        <>
          {/* KPI strip */}
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Total Revenue" value={data.totalRevenue} format={formatCompactINR} icon={<Wallet size={16} />} tone="violet" foot="All sources · live" delay={0} />
            <StatCard label="Platform Fee" value={data.platformFeeRevenue} format={formatCompactINR} icon={<TrendingUp size={16} />} tone="emerald" foot="Commission-linked" delay={60} />
            <StatCard label="Featured Listings" value={data.featuredRevenueEstimate} format={formatCompactINR} icon={<Star size={16} />} tone="amber" foot={`${data.featuredCount} projects`} delay={120} />
            <StatCard label="Premium CPs" value={data.premiumRevenue} format={formatCompactINR} icon={<Users size={16} />} tone="sky" foot={`${data.premiumCount} members`} delay={180} />
          </div>

          <div className="mt-6 grid gap-5 lg:grid-cols-5">
            {/* Revenue mix donut */}
            <section className="tv-fade-up rounded-2xl border border-white/10 glass p-5 lg:col-span-2">
              <h2 className="text-sm font-semibold">Revenue Mix</h2>
              <p className="text-xs text-muted-foreground">Contribution by stream</p>
              {pieData.length === 0 ? (
                <div className="grid h-56 place-items-center text-sm text-muted-foreground">No revenue recorded yet.</div>
              ) : (
                <div className="relative mt-2 h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={64} outerRadius={92} paddingAngle={2} stroke="none">
                        {pieData.map((_, i) => <Cell key={i} fill={SOURCE_COLORS[i % SOURCE_COLORS.length]} />)}
                      </Pie>
                      <Tooltip
                        contentStyle={{ background: "#12101a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 12 }}
                        formatter={(v) => formatINR(Number(v))}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 grid place-items-center">
                    <div className="text-center">
                      <p className="text-[10px] uppercase tracking-wide text-white/40">Total</p>
                      <p className="font-display text-lg font-semibold">{formatCompactINR(data.totalRevenue)}</p>
                    </div>
                  </div>
                </div>
              )}
              <div className="mt-3 space-y-1.5">
                {sources.filter((s) => s.value > 0).map((s, i) => (
                  <div key={s.key} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-2 text-white/70">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: SOURCE_COLORS[i % SOURCE_COLORS.length] }} />
                      {s.label}
                    </span>
                    <span className="font-medium">{formatINR(s.value)}</span>
                  </div>
                ))}
              </div>
            </section>

            {/* Source breakdown vs target */}
            <section className="tv-fade-up rounded-2xl border border-white/10 glass p-5 lg:col-span-3">
              <h2 className="text-sm font-semibold">Revenue by Source</h2>
              <p className="text-xs text-muted-foreground">Actual contribution vs. target mix</p>
              <div className="mt-4 space-y-4">
                {sources.map((s, i) => {
                  const pct = data.totalRevenue > 0 ? Math.round((s.value / data.totalRevenue) * 100) : 0;
                  return (
                    <div key={s.key}>
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium">{s.label}</span>
                        <span className="tabular-nums">{formatINR(s.value)}</span>
                      </div>
                      <div className="relative mt-2 h-2.5 w-full overflow-hidden rounded-full bg-white/10">
                        <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(pct, 100)}%`, background: SOURCE_COLORS[i % SOURCE_COLORS.length] }} />
                        <div className="absolute top-1/2 h-3.5 w-0.5 -translate-y-1/2 bg-white/40" style={{ left: `${Math.min(s.target, 100)}%` }} title={`Target ${s.target}%`} />
                      </div>
                      <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>{s.meta}</span>
                        <span>{pct}% of total · target {s.target}%</span>
                      </div>
                    </div>
                  );
                })}
                <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 opacity-70">
                  <div className="flex items-center gap-2 text-sm font-medium"><Building2 size={14} /> Referral / Other <span className="text-xs text-muted-foreground">(Home Loan &amp; Insurance)</span></div>
                  <p className="mt-1 text-[11px] text-muted-foreground">Target {data.target.referralOther}% — not yet active, placeholder line only.</p>
                </div>
              </div>
            </section>
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-5">
            {/* Monthly revenue trend */}
            <section className="tv-fade-up rounded-2xl border border-white/10 glass p-5 lg:col-span-3">
              <h2 className="text-sm font-semibold">Monthly Revenue</h2>
              <p className="text-xs text-muted-foreground">Platform fee + lead marketplace · last 6 months</p>
              <div className="mt-3 h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.monthlyTrend} margin={{ top: 6, right: 8, bottom: 0, left: -12 }}>
                    <defs>
                      <linearGradient id="revGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#8B5CF6" stopOpacity={0.5} />
                        <stop offset="100%" stopColor="#8B5CF6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                    <XAxis dataKey="month" tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={(v) => formatCompactINR(Number(v))} tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 11 }} axisLine={false} tickLine={false} width={56} />
                    <Tooltip
                      contentStyle={{ background: "#12101a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 12 }}
                      formatter={(v) => [formatINR(Number(v)), "Revenue"]}
                    />
                    <Area type="monotone" dataKey="revenue" stroke="#8B5CF6" strokeWidth={2} fill="url(#revGradient)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </section>

            {/* Top paying developers */}
            <section className="tv-fade-up rounded-2xl border border-white/10 glass p-5 lg:col-span-2">
              <h2 className="text-sm font-semibold">Top Paying Developers</h2>
              <p className="text-xs text-muted-foreground">By platform fee generated</p>
              {data.topDevelopers.length === 0 ? (
                <div className="grid h-56 place-items-center text-center text-sm text-muted-foreground">No developer revenue yet.</div>
              ) : (
                <div className="mt-4 space-y-2.5">
                  {data.topDevelopers.map((d, i) => (
                    <div key={d.name} className="flex items-center gap-3">
                      <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold ${i === 0 ? "bg-amber-500/20 text-amber-300" : "bg-white/10 text-white/60"}`}>{i + 1}</span>
                      <span className="min-w-0 flex-1 truncate text-sm text-white/90">{d.name}</span>
                      <span className="shrink-0 text-sm font-medium tabular-nums">{formatINR(d.revenue)}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </>
      )}
    </main>
  );
}
