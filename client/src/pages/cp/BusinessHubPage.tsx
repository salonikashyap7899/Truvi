import { useEffect, useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from "recharts";
import { api } from "@/lib/api";
import { Card, CardTitle, CardValue } from "@/components/ui/primitives";
import { CpHubNav } from "@/components/CpHubNav";
import { ProGate } from "@/components/ProGate";
import { NotificationBell } from "@/components/NotificationBell";
import UserMenu from "@/components/UserMenu";
import { useEntitlement } from "@/lib/entitlements";
import { scoreLead } from "@/lib/crmAi";
import { formatINR, cn } from "@/lib/utils";
import { BarChart3, PhoneCall, CalendarClock, MapPin, Handshake, IndianRupee, Target } from "lucide-react";
import type { CrmSummary, Lead } from "@/types";

// Validated 2-series palette for the dark surface (earned vs paid).
const SERIES = { earned: "#4f8ef7", paid: "#c07f2a" };

/** Demo numbers shown blurred to free users — sells the analytics layer. */
const DEMO_SUMMARY: CrmSummary = {
  today: { calls: 18, whatsapp: 12, followUpsDue: 7, followUpsPending: 11, siteVisits: 2, closings: 1, earnings: 22000 },
  kpis: {
    totalLeads: 64, activeLeads: 23, conversionPercent: 17, siteVisitPercent: 42, avgDealSize: 8125000,
    lifetimeEarnings: 325000, pendingCommission: 105000, paidCommission: 220000, ltvGenerated: 65000000,
  },
  monthlyEarnings: [
    { month: "Feb 26", earned: 30000, paid: 25000 },
    { month: "Mar 26", earned: 45000, paid: 30000 },
    { month: "Apr 26", earned: 38000, paid: 38000 },
    { month: "May 26", earned: 72000, paid: 50000 },
    { month: "Jun 26", earned: 58000, paid: 42000 },
    { month: "Jul 26", earned: 82000, paid: 35000 },
  ],
};

const DAILY_TARGETS = { calls: 25, followUps: 10, siteVisits: 3, closings: 1 };
const MONTHLY_EARNINGS_TARGET = 100000;

export default function BusinessHubPage() {
  const { entitlement, loading: entLoading } = useEntitlement();
  const [summary, setSummary] = useState<CrmSummary | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);

  const unlocked = !!entitlement?.analytics;

  useEffect(() => {
    if (entLoading) return;
    api.get("/leads").then((res) => setLeads(res.data.leads)).catch(() => {});
    if (unlocked) {
      api.get("/crm/summary").then((res) => setSummary(res.data)).catch(() => setSummary(DEMO_SUMMARY));
    } else {
      setSummary(DEMO_SUMMARY);
    }
  }, [entLoading, unlocked]);

  const leadQuality = useMemo(() => {
    const active = leads.filter((l) => l.stage !== "LOST");
    if (active.length === 0) return 0;
    return Math.round(active.reduce((s, l) => s + scoreLead(l).score, 0) / active.length);
  }, [leads]);

  if (entLoading || !summary) {
    return (
      <main className="min-h-screen p-6 text-white md:p-10">
        <h1 className="text-2xl font-semibold">Business Hub</h1>
        <CpHubNav />
        <p className="mt-10 text-sm text-muted-foreground">Loading analytics…</p>
      </main>
    );
  }

  const { today, kpis, monthlyEarnings } = summary;
  const thisMonth = monthlyEarnings[monthlyEarnings.length - 1]?.earned ?? 0;
  const achievementPct = Math.min(100, Math.round((thisMonth / MONTHLY_EARNINGS_TARGET) * 100));
  const aiPerf = Math.min(100, Math.round(kpis.conversionPercent * 2 + leadQuality / 2));

  const targets = [
    { label: "Today's Calls", value: today.calls, target: DAILY_TARGETS.calls, icon: PhoneCall, color: "text-sky-400" },
    { label: "Today's Follow-ups", value: today.followUpsDue, target: DAILY_TARGETS.followUps, icon: CalendarClock, color: "text-amber-400" },
    { label: "Today's Site Visits", value: today.siteVisits, target: DAILY_TARGETS.siteVisits, icon: MapPin, color: "text-emerald-400" },
    { label: "Today's Closings", value: today.closings, target: DAILY_TARGETS.closings, icon: Handshake, color: "text-purple-400" },
  ];

  return (
    <main className="min-h-screen p-6 text-white md:p-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold"><BarChart3 size={22} className="text-sky-400" /> Business Hub</h1>
          <p className="mt-1 text-sm text-muted-foreground">Earnings · Analytics · KPIs · Targets — your results, measured.</p>
        </div>
        <div className="flex items-center gap-3">
          <NotificationBell />
          <UserMenu />
        </div>
      </div>
      <CpHubNav />

      <ProGate unlocked={unlocked} feature="Performance Analytics" badge="CRM" className="mt-6">
        <div>
          {/* Top-of-dashboard metrics */}
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Card className="border-white/10 glass"><CardTitle>Lifetime Earnings</CardTitle><CardValue className="text-lg">{formatINR(kpis.lifetimeEarnings)}</CardValue></Card>
            <Card className="border-white/10 glass"><CardTitle>LTV Generated</CardTitle><CardValue className="text-lg">{formatINR(kpis.ltvGenerated)}</CardValue></Card>
            <Card className="border-white/10 glass"><CardTitle>Avg Deal Size</CardTitle><CardValue className="text-lg">{kpis.avgDealSize ? formatINR(kpis.avgDealSize) : "—"}</CardValue></Card>
            <Card className="border-white/10 glass"><CardTitle>Conversion</CardTitle><CardValue className="text-lg">{kpis.conversionPercent}%</CardValue></Card>
            <Card className="border-white/10 glass"><CardTitle>Lead Quality Score</CardTitle><CardValue className="text-lg">{leadQuality || "—"}</CardValue></Card>
            <Card className="border-white/10 glass"><CardTitle>AI Performance</CardTitle><CardValue className="text-lg">{aiPerf}</CardValue></Card>
          </section>

          {/* Daily Target Dashboard */}
          <section className="mt-8">
            <h2 className="flex items-center gap-2 text-lg font-medium"><Target size={16} className="text-emerald-400" /> Daily Targets</h2>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {targets.map(({ label, value, target, icon: Icon, color }) => {
                const pct = Math.min(100, Math.round((value / target) * 100));
                return (
                  <Card key={label} className="border-white/10 glass">
                    <div className="flex items-center justify-between">
                      <CardTitle>{label}</CardTitle>
                      <Icon size={14} className={color} />
                    </div>
                    <CardValue className="text-xl">{value}<span className="text-sm text-muted-foreground">/{target}</span></CardValue>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                      <div className={cn("h-full rounded-full transition-all", pct >= 100 ? "bg-emerald-400" : "bg-[var(--trust)]")} style={{ width: `${pct}%` }} />
                    </div>
                  </Card>
                );
              })}
              <Card className="border-white/10 glass">
                <div className="flex items-center justify-between">
                  <CardTitle>Today's Earnings</CardTitle>
                  <IndianRupee size={14} className="text-amber-400" />
                </div>
                <CardValue className="text-xl">{formatINR(today.earnings)}</CardValue>
                <p className="mt-2 text-[10px] text-muted-foreground">{today.whatsapp} WhatsApp touches today</p>
              </Card>
            </div>
          </section>

          {/* Earnings analytics — graphs, not ₹0 text */}
          <section className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Card className="border-white/10 glass lg:col-span-2">
              <h2 className="text-sm font-medium">Monthly Earnings — earned vs paid (last 6 months)</h2>
              <div className="mt-3 h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyEarnings} barGap={2}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                    <XAxis dataKey="month" tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => (v >= 100000 ? `${(v / 100000).toFixed(1)}L` : v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
                    <Tooltip
                      formatter={(value, name) => [formatINR(Number(value ?? 0)), name === "earned" ? "Earned" : "Paid out"]}
                      contentStyle={{ background: "#11161f", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, fontSize: 12 }}
                      labelStyle={{ color: "rgba(255,255,255,0.7)" }}
                      cursor={{ fill: "rgba(255,255,255,0.04)" }}
                    />
                    <Legend formatter={(v: string) => <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 12 }}>{v === "earned" ? "Earned" : "Paid out"}</span>} />
                    <Bar dataKey="earned" fill={SERIES.earned} radius={[4, 4, 0, 0]} maxBarSize={28} />
                    <Bar dataKey="paid" fill={SERIES.paid} radius={[4, 4, 0, 0]} maxBarSize={28} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <div className="space-y-4">
              <Card className="border-white/10 glass">
                <CardTitle>Target vs Achievement (this month)</CardTitle>
                <CardValue className="text-xl">{achievementPct}%</CardValue>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                  <div className={cn("h-full rounded-full", achievementPct >= 100 ? "bg-emerald-400" : "bg-[var(--trust)]")} style={{ width: `${achievementPct}%` }} />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{formatINR(thisMonth)} of {formatINR(MONTHLY_EARNINGS_TARGET)} target</p>
              </Card>
              <Card className="border-white/10 glass">
                <CardTitle>Pending Commission</CardTitle>
                <CardValue className="text-xl text-amber-300">{formatINR(kpis.pendingCommission)}</CardValue>
              </Card>
              <Card className="border-white/10 glass">
                <CardTitle>Paid Commission</CardTitle>
                <CardValue className="text-xl text-emerald-400">{formatINR(kpis.paidCommission)}</CardValue>
              </Card>
            </div>
          </section>

          {/* KPI dashboard */}
          <section className="mt-8">
            <h2 className="text-lg font-medium">CP KPI Dashboard</h2>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Card className="border-white/10 glass"><CardTitle>Total Leads</CardTitle><CardValue className="text-lg">{kpis.totalLeads}</CardValue></Card>
              <Card className="border-white/10 glass"><CardTitle>Active Leads</CardTitle><CardValue className="text-lg">{kpis.activeLeads}</CardValue></Card>
              <Card className="border-white/10 glass"><CardTitle>Site Visit %</CardTitle><CardValue className="text-lg">{kpis.siteVisitPercent}%</CardValue></Card>
              <Card className="border-white/10 glass"><CardTitle>Booking %</CardTitle><CardValue className="text-lg">{kpis.conversionPercent}%</CardValue></Card>
            </div>
          </section>
        </div>
      </ProGate>
    </main>
  );
}
