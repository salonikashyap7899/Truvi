import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Flame, CalendarCheck, TrendingUp, Boxes, Activity, Megaphone, BrainCircuit,
  ShieldCheck, Zap, ArrowRight, Sparkles, Pencil,
} from "lucide-react";
import { Card, CardTitle, CardValue, Badge } from "@/components/ui/primitives";
import { NotificationBell } from "@/components/NotificationBell";
import { MyPlans } from "@/components/MyPlans";
import { DevHubNav } from "@/components/DevHubNav";
import { DevProGate } from "@/components/DevProGate";
import { DevUpsellModal, type DevUpsellPlan } from "@/components/DevUpsellModal";
import UserMenu from "@/components/UserMenu";
import { useDeveloperData } from "@/lib/useDeveloperData";
import { useDeveloperEntitlement, DEV_TIER_LABELS } from "@/lib/devEntitlements";
import {
  pipelineStats, inventoryHeatMap, inventoryHealth, leadQuality, campaignRoi,
  salesIntelligence, avgUnitPrice, BOOKED_STAGES,
} from "@/lib/devIntel";
import { formatCompactINR } from "@/lib/utils";

const isToday = (d: string | Date) => {
  const x = new Date(d);
  const n = new Date();
  return x.getFullYear() === n.getFullYear() && x.getMonth() === n.getMonth() && x.getDate() === n.getDate();
};
const isThisMonth = (d: string | Date) => {
  const x = new Date(d);
  const n = new Date();
  return x.getFullYear() === n.getFullYear() && x.getMonth() === n.getMonth();
};

export default function DeveloperDashboardPage() {
  const { projects, units, unitsByProject, leads, siteVisits, avgPriceByProject, loading } = useDeveloperData();
  const { entitlement } = useDeveloperEntitlement();
  const [upsell, setUpsell] = useState<{ plan: DevUpsellPlan; feature?: string } | null>(null);

  if (loading) return <div className="min-h-screen p-10 text-white">Loading your business dashboard…</div>;

  const aiUnlocked = !!entitlement?.ai;
  const tierLabel = entitlement ? DEV_TIER_LABELS[entitlement.tier] : "Free";

  // ── Business KPIs (spec PART 4) ──────────────────────────────────────────
  const todaysLeads = leads.filter((l) => isToday(l.createdAt)).length;
  const quality = leadQuality(leads);
  const siteVisitsToday = siteVisits.filter((v) => isToday(v.scheduledAt)).length;
  const bookingsThisMonth = leads.filter((l) => BOOKED_STAGES.includes(l.stage) && isThisMonth(l.updatedAt)).length;
  const revenueThisMonth = leads
    .filter((l) => BOOKED_STAGES.includes(l.stage) && isThisMonth(l.updatedAt))
    .reduce((s, l) => {
      const pid = typeof l.projectId === "string" ? l.projectId : l.projectId?._id;
      return s + ((pid && avgPriceByProject[pid]) || 0);
    }, 0);
  const unsoldUnits = units.filter((u) => u.status === "AVAILABLE");
  const unsoldValue = unsoldUnits.reduce((s, u) => s + u.price, 0);
  const health = inventoryHealth(units);
  const avgDeal = avgUnitPrice(units);
  const roi = campaignRoi(leads, avgDeal, !!entitlement?.campaign);

  const pipeline = pipelineStats(leads, avgPriceByProject);
  const heat = inventoryHeatMap(units);

  const KPIS = [
    { label: "Today's Leads", value: String(todaysLeads), icon: Activity, tone: "text-sky-400" },
    { label: "Hot Leads", value: String(quality.hot), icon: Flame, tone: "text-orange-400" },
    { label: "Site Visits Today", value: String(siteVisitsToday), icon: CalendarCheck, tone: "text-emerald-400" },
    { label: "Bookings This Month", value: String(bookingsThisMonth), icon: TrendingUp, tone: "text-violet-400" },
    { label: "Revenue This Month", value: formatCompactINR(revenueThisMonth), icon: TrendingUp, tone: "text-emerald-400" },
    { label: "Unsold Inventory", value: `${unsoldUnits.length}`, sub: formatCompactINR(unsoldValue), icon: Boxes, tone: "text-amber-400" },
    { label: "Inventory Health", value: `${health.score}`, sub: health.label, icon: Activity, tone: "text-sky-400" },
    { label: "Campaign ROI", value: `${roi.roi}X`, sub: roi.live ? "live" : "projected", icon: Megaphone, tone: "text-fuchsia-400" },
  ];

  return (
    <main className="min-h-screen p-6 text-white md:p-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            Business Dashboard
            {entitlement && (
              <Badge variant={entitlement.pro ? "featured" : entitlement.tier === "FREE" ? "default" : "info"}>
                {tierLabel}
              </Badge>
            )}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Your sales, marketing and analytics — one operating system, live.</p>
        </div>
        <div className="flex items-center gap-3">
          <NotificationBell />
          <UserMenu />
          <Link to="/developer/projects/new">
            <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium hover:bg-blue-700">+ New Project</button>
          </Link>
        </div>
      </div>

      <DevHubNav />

      {/* Growth-engine banner for developers who haven't unlocked the paid OS */}
      {entitlement && !entitlement.pro && (
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {!entitlement.verified && (
            <UpsellCard
              icon={ShieldCheck}
              title="Get Verified — 3x Visibility"
              body="Verified badge, prime listing & higher buyer trust."
              cta="₹999"
              onClick={() => setUpsell({ plan: "verified" })}
            />
          )}
          {!entitlement.crm && (
            <UpsellCard
              icon={Zap}
              title="Close 30% More Sales"
              body="Developer CRM — pipeline, team, follow-ups & finance."
              cta="₹49/mo"
              onClick={() => setUpsell({ plan: "crm" })}
            />
          )}
          {!entitlement.ai && (
            <UpsellCard
              icon={BrainCircuit}
              title="Predict Sales Before They Happen"
              body="AI demand, pricing, competitor & revenue forecasts."
              cta="₹999"
              onClick={() => setUpsell({ plan: "ai" })}
            />
          )}
        </div>
      )}

      {/* Business KPI grid (spec PART 4) */}
      <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        {KPIS.map((k) => (
          <Card key={k.label} className="border-white/10 glass text-white">
            <div className="flex items-center justify-between">
              <CardTitle className="text-muted-foreground">{k.label}</CardTitle>
              <k.icon size={15} className={k.tone} />
            </div>
            <CardValue>{k.value}</CardValue>
            {k.sub && <p className="mt-0.5 text-xs text-muted-foreground">{k.sub}</p>}
          </Card>
        ))}
      </div>

      {/* Live booking pipeline — count + value at every stage (spec PART 5.6) */}
      <section className="mt-10">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Live booking pipeline</h2>
          <Link to="/developer/crm" className="flex items-center gap-1 text-xs text-sky-300 hover:underline">
            Manage in CRM <ArrowRight size={12} />
          </Link>
        </div>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-2">
          {pipeline.map((s) => (
            <div key={s.stage} className="min-w-[120px] shrink-0 rounded-xl border border-white/10 glass px-3 py-3 text-center">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{s.label}</p>
              <p className="mt-1 text-xl font-semibold">{s.count}</p>
              <p className="mt-0.5 text-[11px] text-emerald-300">{formatCompactINR(s.value)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Inventory heat map (spec PART 5.2) */}
      {heat.length > 0 && (
        <section className="mt-10">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium">Inventory heat map</h2>
            <Link to="/developer/inventory" className="flex items-center gap-1 text-xs text-sky-300 hover:underline">
              Open inventory <ArrowRight size={12} />
            </Link>
          </div>
          <div className="mt-3 space-y-2">
            {heat.slice(0, 6).map((b) => (
              <div key={b.label} className="flex items-center gap-3">
                <span className="w-16 shrink-0 text-sm text-muted-foreground">Tower {b.label}</span>
                <div className="h-3 flex-1 overflow-hidden rounded-full bg-white/5">
                  <div
                    className={`h-full rounded-full ${b.soldPercent >= 80 ? "bg-emerald-500" : b.soldPercent >= 50 ? "bg-amber-500" : "bg-sky-500"}`}
                    style={{ width: `${Math.max(4, b.soldPercent)}%` }}
                  />
                </div>
                <span className="w-24 shrink-0 text-right text-sm">
                  {b.soldPercent}% <span className="text-xs text-muted-foreground">({b.sold}/{b.total})</span>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* AI Sales Intelligence preview — gated (spec PART 5.1) */}
      <section className="mt-10">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-medium">
            <Sparkles size={16} className="text-purple-400" /> AI Sales Intelligence
          </h2>
          <Link to="/developer/analytics" className="flex items-center gap-1 text-xs text-sky-300 hover:underline">
            Full analytics <ArrowRight size={12} />
          </Link>
        </div>
        {projects.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">Add a project to unlock sales intelligence.</p>
        ) : (
          <DevProGate
            unlocked={aiUnlocked}
            feature="AI Sales Intelligence"
            plan="ai"
            badge="AI"
            hook="Predict sales before they happen"
            className="mt-3"
          >
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {projects.slice(0, 3).map((p) => {
                const si = salesIntelligence(p, unitsByProject[p._id] ?? [], leads.filter((l) => {
                  const pid = typeof l.projectId === "string" ? l.projectId : l.projectId?._id;
                  return pid === p._id;
                }));
                return (
                  <Card key={p._id} className="border-purple-500/20 bg-purple-950/10 text-white">
                    <p className="text-sm font-medium">{p.name}</p>
                    <div className="mt-3 space-y-1.5 text-xs">
                      <Row label="Closing probability" value={`${si.closingProbability}%`} tone="text-emerald-400" />
                      <Row label="Expected revenue" value={formatCompactINR(si.expectedRevenue)} tone="text-amber-300" />
                      <Row label="Expected units sold" value={String(si.expectedUnitsSold)} />
                      <Row label="Recommended discount" value={`${si.recommendedDiscount}%`} />
                      <Row label="Best selling" value={si.bestSellingType ?? "—"} tone="text-emerald-300" />
                      <Row label="Worst selling" value={si.worstSellingType ?? "—"} tone="text-rose-300" />
                    </div>
                  </Card>
                );
              })}
            </div>
          </DevProGate>
        )}
      </section>

      {/* My projects */}
      <section className="mt-10">
        <h2 className="text-lg font-medium">My projects</h2>
        <div className="mt-3 space-y-3">
          {projects.length === 0 && <p className="text-sm text-muted-foreground">No projects yet — create your first one.</p>}
          {projects.map((p) => (
            <Card key={p._id} className="flex items-center justify-between gap-3 border-white/10 glass text-white hover:border-blue-600">
              <Link to={`/developer/projects/${p._id}`} className="min-w-0 flex-1">
                <p className="font-medium">
                  {p.name}{" "}
                  <Badge variant={p.approvalStatus === "APPROVED" ? "success" : p.approvalStatus === "PENDING" ? "warning" : "danger"}>
                    {p.approvalStatus}
                  </Badge>
                  {p.isVerified && <Badge variant="info" className="ml-1">Verified</Badge>}
                </p>
                <p className="text-sm text-muted-foreground">
                  {p.city} · {(unitsByProject[p._id] ?? []).length} units · {p.leadCount ?? 0} leads · {(p.viewCount ?? 0).toLocaleString("en-IN")} views
                </p>
              </Link>
              <Link
                to={`/developer/projects/${p._id}#edit-project`}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-blue-700/60 px-3 py-1.5 text-sm font-medium text-blue-300 hover:bg-blue-900/20"
              >
                <Pencil size={13} /> Edit
              </Link>
            </Card>
          ))}
        </div>
      </section>

      <MyPlans />
      <DevUpsellModal open={!!upsell} onClose={() => setUpsell(null)} plan={upsell?.plan} feature={upsell?.feature} />
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

function UpsellCard({
  icon: Icon, title, body, cta, onClick,
}: { icon: typeof ShieldCheck; title: string; body: string; cta: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-start justify-between gap-3 rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-transparent px-4 py-4 text-left transition-colors hover:border-amber-400/50"
    >
      <div>
        <p className="flex items-center gap-1.5 text-sm font-semibold text-white">
          <Icon size={14} className="text-amber-400" /> {title}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">{body}</p>
      </div>
      <span className="shrink-0 rounded-full bg-gradient-to-r from-amber-400 to-orange-500 px-3 py-1 text-xs font-semibold text-white">{cta}</span>
    </button>
  );
}
