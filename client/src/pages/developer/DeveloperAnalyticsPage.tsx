import { useEffect, useMemo, useState } from "react";
import {
  BrainCircuit, Sparkles, TrendingUp, TrendingDown, Minus, Gauge, AlertTriangle,
  Users, Target, Megaphone, Building2,
} from "lucide-react";
import { Card, CardValue, Badge } from "@/components/ui/primitives";
import { NotificationBell } from "@/components/NotificationBell";
import { DevHubNav } from "@/components/DevHubNav";
import { DevProGate } from "@/components/DevProGate";
import UserMenu from "@/components/UserMenu";
import { api } from "@/lib/api";
import { useDeveloperData } from "@/lib/useDeveloperData";
import { useDeveloperEntitlement } from "@/lib/devEntitlements";
import {
  salesIntelligence, forecast, inventoryHealth, buyerAnalytics, competitorAnalysis,
  campaignRoi, leadQuality, avgUnitPrice, type Distribution,
} from "@/lib/devIntel";
import { formatINR, formatCompactINR, cn } from "@/lib/utils";
import type { Project } from "@/types";

export default function DeveloperAnalyticsPage() {
  const { projects, units, unitsByProject, leads, loading } = useDeveloperData();
  const { entitlement } = useDeveloperEntitlement();
  const [selectedProject, setSelectedProject] = useState<string>("");
  // Public market listings (all approved projects) — real competitor comparables.
  const [market, setMarket] = useState<Project[]>([]);

  useEffect(() => {
    api.get("/inventory").then((r) => setMarket(r.data.projects ?? [])).catch(() => setMarket([]));
  }, []);

  const aiUnlocked = !!entitlement?.ai;
  const avgDeal = avgUnitPrice(units);

  const leadsFor = (pid: string) =>
    leads.filter((l) => (typeof l.projectId === "string" ? l.projectId : l.projectId?._id) === pid);

  const health = inventoryHealth(units);
  const fc = useMemo(() => forecast(leads, avgDeal), [leads, avgDeal]);
  const buyers = useMemo(() => buyerAnalytics(units, projects, leads), [units, projects, leads]);
  const quality = useMemo(() => leadQuality(leads), [leads]);
  const roi = useMemo(() => campaignRoi(leads, avgDeal, !!entitlement?.campaign), [leads, avgDeal, entitlement]);

  const activeProject = projects.find((p) => p._id === selectedProject) ?? projects[0];
  // Compare against same-city market listings, excluding the developer's own projects.
  const ownIds = new Set(projects.map((p) => p._id));
  const peers = market.filter((p) => !ownIds.has(p._id));
  const competitor = activeProject
    ? competitorAnalysis(activeProject, unitsByProject[activeProject._id] ?? [], peers)
    : null;

  if (loading) return <div className="min-h-screen p-10 text-white">Loading AI analytics…</div>;

  const TrendIcon = fc.trend === "up" ? TrendingUp : fc.trend === "down" ? TrendingDown : Minus;

  return (
    <main className="min-h-screen p-6 text-white md:p-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold"><BrainCircuit size={22} className="text-purple-400" /> AI Analytics</h1>
          <p className="mt-1 text-sm text-muted-foreground">Predict sales before they happen — demand, pricing, buyers and competitors.</p>
        </div>
        <div className="flex items-center gap-3">
          <NotificationBell />
          <UserMenu />
        </div>
      </div>
      <DevHubNav />

      {projects.length === 0 ? (
        <p className="mt-8 text-sm text-muted-foreground">Add a project to unlock AI analytics.</p>
      ) : (
        <>
          {/* Top forecast band — always the hero */}
          <section className="mt-6 rounded-2xl border border-purple-500/30 bg-gradient-to-br from-purple-950/40 via-[#0d1117] to-[#0d1117] p-6">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 to-fuchsia-600 shadow-lg shadow-purple-900/40"><Sparkles size={16} /></span>
              <div>
                <h2 className="text-lg font-semibold">Sales &amp; Revenue Forecast</h2>
                <p className="text-xs text-muted-foreground">Projected from your live lead velocity and inventory.</p>
              </div>
            </div>
            <DevProGate unlocked={aiUnlocked} feature="Sales Forecast" plan="ai" badge="AI" hook="Predict sales before they happen" className="mt-4">
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <ForecastTile label="Demand (next 30d)" value={`${fc.demandNext30} leads`} icon={<TrendIcon size={15} className={fc.trend === "down" ? "text-rose-400" : "text-emerald-400"} />} />
                <ForecastTile label="Bookings (next 30d)" value={`${fc.bookingsNext30}`} icon={<Target size={15} className="text-violet-400" />} />
                <ForecastTile label="Revenue (next 90d)" value={formatCompactINR(fc.revenueNext90)} icon={<TrendingUp size={15} className="text-emerald-400" />} />
                <ForecastTile label="Lead Quality Score" value={`${quality.qualityScore}/100`} icon={<Gauge size={15} className="text-sky-400" />} />
              </div>
            </DevProGate>
          </section>

          {/* Per-project AI Sales Intelligence */}
          <section className="mt-10">
            <h2 className="flex items-center gap-2 text-lg font-medium"><Sparkles size={16} className="text-purple-400" /> AI Sales Intelligence</h2>
            <DevProGate unlocked={aiUnlocked} feature="Sales Intelligence" plan="ai" badge="AI" hook="Closing odds & pricing per project" className="mt-3">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                {projects.map((p) => {
                  const si = salesIntelligence(p, unitsByProject[p._id] ?? [], leadsFor(p._id));
                  return (
                    <Card key={p._id} className="border-purple-500/20 bg-purple-950/10 text-white">
                      <p className="text-sm font-medium">{p.name}</p>
                      <div className="mt-3 space-y-1.5 text-xs">
                        <Row label="Closing probability" value={`${si.closingProbability}%`} tone="text-emerald-400" />
                        <Row label="Expected revenue" value={formatCompactINR(si.expectedRevenue)} tone="text-amber-300" />
                        <Row label="Expected units sold" value={String(si.expectedUnitsSold)} />
                        <Row label="Recommended discount" value={`${si.recommendedDiscount}%`} />
                        <Row label="Best selling unit" value={si.bestSellingType ?? "—"} tone="text-emerald-300" />
                        <Row label="Worst selling unit" value={si.worstSellingType ?? "—"} tone="text-rose-300" />
                      </div>
                      <p className="mt-3 border-t border-white/10 pt-2 text-[11px] text-purple-200">{si.velocityNote}</p>
                    </Card>
                  );
                })}
              </div>
            </DevProGate>
          </section>

          {/* Inventory health + unsold risk */}
          <section className="mt-10 grid gap-6 lg:grid-cols-2">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-medium"><Gauge size={16} className="text-sky-400" /> Inventory Health Score</h2>
              <DevProGate unlocked={aiUnlocked} feature="Inventory Health" plan="ai" badge="AI" className="mt-3">
                <Card className="border-white/10 glass text-white">
                  <div className="flex items-end justify-between">
                    <CardValue className="text-4xl">{health.score}<span className="text-lg text-muted-foreground">/100</span></CardValue>
                    <Badge variant={health.score >= 75 ? "success" : health.score >= 50 ? "info" : health.score >= 30 ? "warning" : "danger"}>{health.label}</Badge>
                  </div>
                  <div className="mt-4 space-y-2 text-xs">
                    <Meter label="Sold" pct={health.soldPercent} tone="bg-emerald-500" />
                    <Meter label="Locked / active" pct={health.lockedPercent} tone="bg-amber-500" />
                    <Meter label="Available" pct={health.availablePercent} tone="bg-sky-500" />
                  </div>
                </Card>
              </DevProGate>
            </div>
            <div>
              <h2 className="flex items-center gap-2 text-lg font-medium"><AlertTriangle size={16} className="text-amber-400" /> Unsold Inventory Risk</h2>
              <DevProGate unlocked={aiUnlocked} feature="Unsold Inventory Risk" plan="ai" badge="AI" className="mt-3">
                <Card className="border-white/10 glass text-white">
                  {(() => {
                    const avail = units.filter((u) => u.status === "AVAILABLE");
                    const value = avail.reduce((s, u) => s + u.price, 0);
                    const ratio = units.length ? avail.length / units.length : 0;
                    const risk = ratio > 0.7 ? "HIGH" : ratio > 0.45 ? "MEDIUM" : "LOW";
                    return (
                      <>
                        <div className="flex items-end justify-between">
                          <CardValue>{formatCompactINR(value)}</CardValue>
                          <Badge variant={risk === "HIGH" ? "danger" : risk === "MEDIUM" ? "warning" : "success"}>{risk} RISK</Badge>
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">{avail.length} of {units.length} units unsold — {Math.round(ratio * 100)}% of inventory is tied-up capital.</p>
                        <p className="mt-3 text-[11px] text-amber-200">
                          {risk === "HIGH" ? "Launch a campaign or offer to accelerate absorption." : risk === "MEDIUM" ? "Watch velocity — a targeted push can de-risk this." : "Absorption is healthy — hold pricing."}
                        </p>
                      </>
                    );
                  })()}
                </Card>
              </DevProGate>
            </div>
          </section>

          {/* Competitor tracking */}
          <section className="mt-10">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-lg font-medium"><Building2 size={16} className="text-teal-400" /> Competitor Price Tracking</h2>
              <select
                value={activeProject?._id ?? ""}
                onChange={(e) => setSelectedProject(e.target.value)}
                className="h-9 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-sm text-white outline-none"
              >
                {projects.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
              </select>
            </div>
            <DevProGate unlocked={aiUnlocked} feature="Competitor Analytics" plan="ai" badge="AI" hook="Price against the market" className="mt-3">
              {competitor ? (
                <Card className="border-white/10 glass text-white">
                  <div className="space-y-2">
                    {competitor.rows.map((r) => {
                      const max = Math.max(...competitor.rows.map((x) => x.ratePerSqft), 1);
                      return (
                        <div key={r.name} className="flex items-center gap-3">
                          <span className={cn("w-40 shrink-0 truncate text-sm", r.isYou ? "font-semibold text-sky-300" : "text-muted-foreground")}>{r.name}</span>
                          <div className="h-3 flex-1 overflow-hidden rounded-full bg-white/5">
                            <div className={cn("h-full rounded-full", r.isYou ? "bg-sky-500" : "bg-white/25")} style={{ width: `${(r.ratePerSqft / max) * 100}%` }} />
                          </div>
                          <span className="w-24 shrink-0 text-right text-sm">{formatINR(r.ratePerSqft)}/sqft</span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-6 border-t border-white/10 pt-3 text-xs">
                    <span className="text-muted-foreground">Your rate: <span className="text-white">{formatINR(competitor.yourRate)}/sqft</span></span>
                    <span className="text-muted-foreground">Market avg: <span className="text-white">{formatINR(competitor.marketAvg)}/sqft</span></span>
                    <span className="text-muted-foreground">Recommended: <span className="font-semibold text-emerald-400">{formatINR(competitor.recommendedRate)}/sqft</span></span>
                  </div>
                </Card>
              ) : (
                <p className="text-sm text-muted-foreground">Add unit pricing to enable competitor tracking.</p>
              )}
            </DevProGate>
          </section>

          {/* Buyer analytics + heatmap */}
          <section className="mt-10">
            <h2 className="flex items-center gap-2 text-lg font-medium"><Users size={16} className="text-fuchsia-400" /> Buyer Behaviour Analytics</h2>
            <DevProGate unlocked={aiUnlocked} feature="Buyer Analytics" plan="ai" badge="AI" hook="Know who's buying" className="mt-3">
              <div className="grid gap-4 md:grid-cols-3">
                <DistCard title="Budget distribution" data={buyers.budgetBands} />
                <DistCard title="Preferred unit size" data={buyers.preferredSizes} />
                <DistCard title="Top localities" data={buyers.topLocalities} />
              </div>
              <Card className="mt-4 border-white/10 glass text-white">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Loan requirement</p>
                    <p className="text-xs text-muted-foreground">Share of buyers likely to need home-loan assistance.</p>
                  </div>
                  <CardValue className="text-emerald-400">{buyers.loanRequirementPercent}%</CardValue>
                </div>
              </Card>
            </DevProGate>
          </section>

          {/* Campaign ROI */}
          <section className="mt-10">
            <h2 className="flex items-center gap-2 text-lg font-medium"><Megaphone size={16} className="text-orange-400" /> Campaign ROI</h2>
            <DevProGate unlocked={aiUnlocked} feature="Campaign ROI Analytics" plan="ai" badge="AI" className="mt-3">
              <Card className="border-white/10 glass text-white">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">{roi.live ? "From your live campaign funnel" : "Projected for a ₹1,00,000 campaign at your current conversion rates"}</p>
                  <Badge variant="featured">{roi.roi}X ROI</Badge>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-6">
                  <MiniStat label="Cost" value={formatCompactINR(roi.cost)} />
                  <MiniStat label="Leads" value={String(roi.leads)} />
                  <MiniStat label="Qualified" value={String(roi.qualified)} />
                  <MiniStat label="Site Visits" value={String(roi.siteVisits)} />
                  <MiniStat label="Bookings" value={String(roi.bookings)} />
                  <MiniStat label="Revenue" value={formatCompactINR(roi.revenue)} tone="text-emerald-400" />
                </div>
              </Card>
            </DevProGate>
          </section>
        </>
      )}
    </main>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={tone ?? "text-white"}>{value}</span>
    </div>
  );
}

function ForecastTile({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        {icon}
      </div>
      <p className="mt-1 font-display text-xl font-semibold">{value}</p>
    </div>
  );
}

function Meter({ label, pct, tone }: { label: string; pct: number; tone: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-28 shrink-0 text-muted-foreground">{label}</span>
      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/5">
        <div className={cn("h-full rounded-full", tone)} style={{ width: `${Math.max(2, pct)}%` }} />
      </div>
      <span className="w-10 shrink-0 text-right">{pct}%</span>
    </div>
  );
}

function DistCard({ title, data }: { title: string; data: Distribution[] }) {
  return (
    <Card className="border-white/10 glass text-white">
      <p className="text-sm font-medium">{title}</p>
      <div className="mt-3 space-y-2 text-xs">
        {data.length === 0 && <p className="text-muted-foreground">No data yet.</p>}
        {data.map((d) => (
          <div key={d.label} className="flex items-center gap-2">
            <span className="w-24 shrink-0 truncate text-muted-foreground">{d.label}</span>
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/5">
              <div className="h-full rounded-full bg-fuchsia-500" style={{ width: `${Math.max(3, d.percent)}%` }} />
            </div>
            <span className="w-8 shrink-0 text-right">{d.percent}%</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("mt-0.5 font-display text-lg font-semibold", tone)}>{value}</p>
    </div>
  );
}
