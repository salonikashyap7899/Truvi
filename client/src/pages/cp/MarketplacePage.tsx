import { useEffect, useMemo, useState } from "react";
import { Card, Badge } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { CpHubNav } from "@/components/CpHubNav";
import { NotificationBell } from "@/components/NotificationBell";
import UserMenu from "@/components/UserMenu";
import { api } from "@/lib/api";
import { formatINR, cn } from "@/lib/utils";
import { toast } from "sonner";
import { useAuthStore } from "@/store/authStore";
import { Filter, Flame, ShieldCheck, Snowflake, Star } from "lucide-react";
import type { Project, Unit } from "@/types";

const LEAD_PRICES = { BASIC: 300, QUALIFIED: 1000, SITE_VISIT: 3000 } as const;
const CP_PREMIUM_MONTHLY_PRICE = 1999;

type LeadType = keyof typeof LEAD_PRICES;

interface MarketLead {
  id: string;
  project: Project;
  budget: number;
  city: string;
  locality: string;
  hot: boolean;
  exclusive: boolean;
  verified: boolean;
  leadType: LeadType;
}

const BUDGET_BANDS = [
  { label: "Any budget", min: 0, max: Infinity },
  { label: "Under ₹50L", min: 0, max: 5_000_000 },
  { label: "₹50L – ₹1Cr", min: 5_000_000, max: 10_000_000 },
  { label: "₹1Cr – ₹3Cr", min: 10_000_000, max: 30_000_000 },
  { label: "₹3Cr+", min: 30_000_000, max: Infinity },
];

export default function MarketplacePage() {
  const user = useAuthStore((s) => s.user);
  const [loading, setLoading] = useState<string | null>(null);
  const [premium, setPremium] = useState(user?.cpProfile?.isPremium || false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [unitsByProject, setUnitsByProject] = useState<Record<string, Unit[]>>({});

  // Filters (Amazon-style)
  const [city, setCity] = useState("ALL");
  const [budgetBand, setBudgetBand] = useState(0);
  const [locality, setLocality] = useState("ALL");
  const [flags, setFlags] = useState({ hot: false, cold: false, exclusive: false, verified: false });

  useEffect(() => {
    api.get("/projects").then(async (res) => {
      const list: Project[] = res.data.projects;
      setProjects(list);
      const unitLists = await Promise.all(list.map((p) => api.get("/units", { params: { projectId: p._id } })));
      const map: Record<string, Unit[]> = {};
      list.forEach((p, i) => (map[p._id] = unitLists[i].data.units));
      setUnitsByProject(map);
    }).catch(() => {});
  }, []);

  // Curated lead shelf derived from live inventory: one buyer-lead card per
  // project/quality band, purchasable through the real payment flow.
  const marketLeads = useMemo<MarketLead[]>(() => {
    return projects.flatMap((p) => {
      const units = unitsByProject[p._id] || [];
      const available = units.filter((u) => u.status === "AVAILABLE");
      if (available.length === 0 && units.length === 0) return [];
      const prices = (available.length ? available : units).map((u) => u.price);
      const budget = prices.length ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : 0;
      const seed = p._id.charCodeAt(0) + p._id.charCodeAt(p._id.length - 1);
      const types: LeadType[] = ["BASIC", "QUALIFIED", "SITE_VISIT"];
      return types.slice(0, 1 + (seed % 3)).map((leadType, i) => ({
        id: `${p._id}-${leadType}`,
        project: p,
        budget,
        city: p.city,
        locality: p.location,
        hot: leadType !== "BASIC" && (seed + i) % 2 === 0,
        exclusive: leadType === "SITE_VISIT",
        verified: p.isVerified || leadType !== "BASIC",
        leadType,
      }));
    });
  }, [projects, unitsByProject]);

  const cities = useMemo(() => [...new Set(marketLeads.map((l) => l.city))], [marketLeads]);
  const localities = useMemo(
    () => [...new Set(marketLeads.filter((l) => city === "ALL" || l.city === city).map((l) => l.locality))],
    [marketLeads, city]
  );

  const filtered = marketLeads.filter((l) => {
    if (city !== "ALL" && l.city !== city) return false;
    if (locality !== "ALL" && l.locality !== locality) return false;
    const band = BUDGET_BANDS[budgetBand];
    if (l.budget && (l.budget < band.min || l.budget > band.max)) return false;
    if (flags.hot && !l.hot) return false;
    if (flags.cold && l.hot) return false;
    if (flags.exclusive && !l.exclusive) return false;
    if (flags.verified && !l.verified) return false;
    return true;
  });

  async function purchase(leadType: LeadType, label?: string) {
    setLoading(label || leadType);
    try {
      const orderRes = await api.post("/marketplace/create-order", { leadType });
      const { order, keyId } = orderRes.data;

      if (order.simulated || !keyId) {
        await api.post("/marketplace/confirm", { leadType });
        toast.success("Lead purchased and assigned to you! (simulated payment — no live Razorpay keys configured)");
        setLoading(null);
        return;
      }

      const options = {
        key: keyId,
        amount: order.amount,
        currency: order.currency,
        order_id: order.id,
        name: "Truvi",
        description: `${leadType} lead purchase`,
        handler: async (response: any) => {
          await api.post("/marketplace/confirm", {
            leadType,
            razorpayOrderId: response.razorpay_order_id,
            razorpayPaymentId: response.razorpay_payment_id,
            razorpaySignature: response.razorpay_signature,
          });
          toast.success("Payment confirmed — lead assigned to you!");
        },
      };
      const rzp = new (window as any).Razorpay(options);
      rzp.open();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Purchase failed");
    } finally {
      setLoading(null);
    }
  }

  async function togglePremium() {
    setLoading("premium");
    try {
      if (premium) {
        await api.delete("/premium/subscribe");
        setPremium(false);
        toast.success("Premium cancelled");
      } else {
        await api.post("/premium/subscribe");
        setPremium(true);
        toast.success("Welcome to Premium!");
      }
    } catch {
      toast.error("Action failed");
    } finally {
      setLoading(null);
    }
  }

  const flagBtn = (key: keyof typeof flags, label: string, icon: React.ReactNode) => (
    <button
      onClick={() => setFlags((f) => ({ ...f, [key]: !f[key] }))}
      className={cn(
        "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors",
        flags[key] ? "border-[var(--trust)]/60 bg-[var(--trust)]/15 text-white" : "border-white/10 bg-white/[0.03] text-muted-foreground hover:text-white"
      )}
    >
      {icon} {label}
    </button>
  );

  return (
    <main className="min-h-screen p-6 text-white md:p-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Lead Marketplace</h1>
          <p className="mt-1 text-sm text-muted-foreground">Shop verified buyer leads — filter by budget, city and quality.</p>
        </div>
        <div className="flex items-center gap-3">
          <NotificationBell />
          <UserMenu />
        </div>
      </div>
      <CpHubNav />

      {/* Filter bar */}
      <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><Filter size={13} /> Filters</span>
          <select value={city} onChange={(e) => { setCity(e.target.value); setLocality("ALL"); }} className="h-8 rounded-lg border border-white/10 bg-white/[0.04] px-2 text-xs text-white outline-none">
            <option value="ALL" className="bg-[#0d1117]">All cities</option>
            {cities.map((c) => <option key={c} value={c} className="bg-[#0d1117]">{c}</option>)}
          </select>
          <select value={locality} onChange={(e) => setLocality(e.target.value)} className="h-8 rounded-lg border border-white/10 bg-white/[0.04] px-2 text-xs text-white outline-none">
            <option value="ALL" className="bg-[#0d1117]">All localities</option>
            {localities.map((l) => <option key={l} value={l} className="bg-[#0d1117]">{l}</option>)}
          </select>
          <select value={budgetBand} onChange={(e) => setBudgetBand(Number(e.target.value))} className="h-8 rounded-lg border border-white/10 bg-white/[0.04] px-2 text-xs text-white outline-none">
            {BUDGET_BANDS.map((b, i) => <option key={b.label} value={i} className="bg-[#0d1117]">{b.label}</option>)}
          </select>
          {flagBtn("hot", "Hot Lead", <Flame size={12} className="text-orange-400" />)}
          {flagBtn("cold", "Cold Lead", <Snowflake size={12} className="text-sky-300" />)}
          {flagBtn("exclusive", "Exclusive", <Star size={12} className="text-amber-300" />)}
          {flagBtn("verified", "Verified", <ShieldCheck size={12} className="text-emerald-400" />)}
        </div>
      </section>

      {/* Lead shelf */}
      <section className="mt-5">
        <p className="text-xs text-muted-foreground">{filtered.length} lead{filtered.length === 1 ? "" : "s"} available</p>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((l) => (
            <Card key={l.id} className="border-white/10 glass">
              <div className="flex flex-wrap items-center gap-1.5">
                {l.hot ? <Badge variant="danger"><Flame size={10} className="mr-1 inline" />Hot</Badge> : <Badge variant="info">Cold</Badge>}
                {l.exclusive && <Badge variant="featured">Exclusive</Badge>}
                {l.verified && <Badge variant="success"><ShieldCheck size={10} className="mr-1 inline" />Verified</Badge>}
                <Badge>{l.leadType.replace("_", " ")}</Badge>
              </div>
              <p className="mt-3 text-sm font-medium">Buyer interested in {l.project.name}</p>
              <p className="text-xs text-muted-foreground">{l.locality}, {l.city}{l.budget ? ` · Budget ~ ${formatINR(l.budget)}` : ""}</p>
              <div className="mt-3 flex items-center justify-between">
                <p className="text-lg font-semibold">{formatINR(LEAD_PRICES[l.leadType])}</p>
                <Button size="sm" disabled={loading === l.id} onClick={() => purchase(l.leadType, l.id)}>
                  {loading === l.id ? "Processing…" : "Buy lead"}
                </Button>
              </div>
            </Card>
          ))}
          {filtered.length === 0 && (
            <p className="col-span-full text-sm text-muted-foreground">No leads match these filters — try widening the budget or clearing quality flags.</p>
          )}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-medium">CP Premium Membership</h2>
        <Card className="mt-3 max-w-md border-white/10 glass text-white">
          <p className="text-2xl font-semibold">{formatINR(CP_PREMIUM_MONTHLY_PRICE)}<span className="text-sm text-muted-foreground">/month</span></p>
          <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
            <li>· Priority badge on the leaderboard</li>
            <li>· Priority placement in lead-assignment queue</li>
            <li>· Premium tag on your profile</li>
          </ul>
          <Button className="mt-4 w-full" variant={premium ? "outline" : "primary"} disabled={loading === "premium"} onClick={togglePremium}>
            {loading === "premium" ? "…" : premium ? "Cancel Premium" : "Subscribe to Premium"}
          </Button>
        </Card>
      </section>
    </main>
  );
}
