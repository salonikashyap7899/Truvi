import { useMemo, useState } from "react";
import {
  Megaphone, Share2, Search, LayoutTemplate, PhoneCall, FileText, Rocket, Check,
} from "lucide-react";
import { Card, CardTitle, CardValue, Badge } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "@/components/NotificationBell";
import { DevHubNav } from "@/components/DevHubNav";
import { DevUpsellModal } from "@/components/DevUpsellModal";
import UserMenu from "@/components/UserMenu";
import { useDeveloperData } from "@/lib/useDeveloperData";
import { useDeveloperEntitlement } from "@/lib/devEntitlements";
import { campaignRoi, avgUnitPrice } from "@/lib/devIntel";
import { formatCompactINR, formatINR } from "@/lib/utils";

// Budget range a developer can model the projection against.
const MIN_SPEND = 10000;
const MAX_SPEND = 10000000;

// A stable split of a campaign's leads across the managed channels.
const CHANNELS = [
  { key: "Meta Ads", icon: Share2, share: 0.4, tone: "text-sky-400" },
  { key: "Google Ads", icon: Search, share: 0.35, tone: "text-emerald-400" },
  { key: "Landing Pages", icon: LayoutTemplate, share: 0.15, tone: "text-violet-400" },
  { key: "Call Tracking", icon: PhoneCall, share: 0.1, tone: "text-amber-400" },
];

const INCLUDED = [
  "Meta (Facebook + Instagram) ad campaigns",
  "Google Search & Display ad campaigns",
  "Custom high-converting landing pages",
  "Call tracking & lead attribution",
  "Live lead dashboard, synced to your CRM",
  "Weekly performance reports & optimisation",
];

export default function DeveloperMarketingPage() {
  const { units, leads } = useDeveloperData();
  const { entitlement } = useDeveloperEntitlement();
  const [upsellOpen, setUpsellOpen] = useState(false);
  // Editable campaign budget the projection is modelled against. When a
  // campaign is live the cost is fixed at the ₹1L product price.
  const [spend, setSpend] = useState(100000);

  const active = !!entitlement?.campaign;
  const avgDeal = avgUnitPrice(units);
  // No loading gate — the projection renders instantly from current funnel
  // ratios (with sensible defaults when leads haven't loaded yet) and simply
  // refines itself the moment real data arrives.
  const clampedSpend = Math.min(MAX_SPEND, Math.max(MIN_SPEND, spend || MIN_SPEND));
  const roi = useMemo(
    () => campaignRoi(leads, avgDeal, active, active ? 100000 : clampedSpend),
    [leads, avgDeal, active, clampedSpend],
  );

  return (
    <main className="min-h-screen p-6 text-white md:p-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold"><Megaphone size={22} className="text-orange-400" /> Marketing Campaigns</h1>
          <p className="mt-1 text-sm text-muted-foreground">Generate better leads — a fully-managed campaign that fills your pipeline.</p>
        </div>
        <div className="flex items-center gap-3">
          <NotificationBell />
          <UserMenu />
        </div>
      </div>
      <DevHubNav />

      {/* ROI hero */}
      <section className="mt-6 rounded-2xl border border-orange-500/30 bg-gradient-to-br from-orange-950/40 via-[#0d1117] to-[#0d1117] p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 shadow-lg shadow-orange-900/40"><Rocket size={16} className="text-white" /></span>
            <div>
              <h2 className="text-lg font-semibold">{active ? "Your Campaign Performance" : "What a campaign returns"}</h2>
              <p className="text-xs text-muted-foreground">{active ? "Live funnel driven by your managed campaign." : `Projected for a ${formatINR(spend)} campaign at your current conversion rates.`}</p>
            </div>
          </div>
          <Badge variant="featured">{active ? "" : "Approx "}{roi.roi}X ROI</Badge>
        </div>

        {!active && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <label htmlFor="campaign-budget" className="text-xs text-muted-foreground">Campaign budget</label>
            <div className="flex items-center rounded-lg border border-white/15 bg-white/[0.03] px-2.5 focus-within:border-orange-500/60">
              <span className="text-sm text-muted-foreground">₹</span>
              <input
                id="campaign-budget"
                type="number"
                min={MIN_SPEND}
                max={MAX_SPEND}
                step={10000}
                value={spend}
                onChange={(e) => setSpend(Math.max(0, Math.round(Number(e.target.value) || 0)))}
                onBlur={() => setSpend(clampedSpend)}
                className="w-28 bg-transparent px-1.5 py-1.5 text-sm text-white outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
              />
            </div>
            <span className="text-xs text-muted-foreground">edit to re-project the funnel &amp; ROI instantly</span>
          </div>
        )}

        <div className="mt-5 grid grid-cols-2 gap-4 md:grid-cols-6">
          <Stat label="Campaign Cost" value={formatCompactINR(roi.cost)} />
          <Stat label="Leads Generated" value={String(roi.leads)} />
          <Stat label="Qualified" value={String(roi.qualified)} />
          <Stat label="Site Visits" value={String(roi.siteVisits)} />
          <Stat label="Bookings" value={String(roi.bookings)} />
          <Stat label="Revenue" value={formatCompactINR(roi.revenue)} tone="text-emerald-400" />
        </div>

        {!active && (
          <Button className="mt-5" size="lg" onClick={() => setUpsellOpen(true)}>
            <Megaphone size={15} /> Launch a campaign
          </Button>
        )}
      </section>

      {/* Channel performance */}
      <section className="mt-10">
        <h2 className="text-lg font-medium">Channel performance</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {CHANNELS.map((c) => {
            const chLeads = Math.round(roi.leads * c.share);
            const chBookings = Math.round(roi.bookings * c.share);
            return (
              <Card key={c.key} className="border-white/10 glass text-white">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-muted-foreground">{c.key}</CardTitle>
                  <c.icon size={16} className={c.tone} />
                </div>
                <CardValue>{chLeads}</CardValue>
                <p className="mt-0.5 text-xs text-muted-foreground">leads · {chBookings} bookings</p>
              </Card>
            );
          })}
        </div>
      </section>

      {/* What's included — managed service */}
      <section className="mt-10">
        <h2 className="text-lg font-medium">Fully managed — what's included</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {INCLUDED.map((item) => (
            <div key={item} className="flex items-center gap-3 rounded-xl border border-white/10 glass px-4 py-3 text-sm">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/15">
                <Check size={13} className="text-emerald-400" />
              </span>
              {item}
            </div>
          ))}
        </div>
        {active ? (
          <div className="mt-4 flex items-center gap-3 rounded-xl border border-emerald-800 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-300">
            <FileText size={16} /> Your weekly performance report is prepared by your account manager every Monday.
          </div>
        ) : (
          <Button className="mt-4" onClick={() => setUpsellOpen(true)}>
            <Rocket size={15} /> Get started — ₹1,00,000
          </Button>
        )}
      </section>

      <DevUpsellModal open={upsellOpen} onClose={() => setUpsellOpen(false)} plan="campaign" feature="Marketing Campaign" />
    </main>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-0.5 font-display text-lg font-semibold ${tone ?? "text-white"}`}>{value}</p>
    </div>
  );
}
