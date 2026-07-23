import { useEffect, useMemo, useState } from "react";
import { Card, Badge, Input, Label, Textarea } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { CpHubNav } from "@/components/CpHubNav";
import { NotificationBell } from "@/components/NotificationBell";
import UserMenu from "@/components/UserMenu";
import { api } from "@/lib/api";
import { formatINR, cn } from "@/lib/utils";
import { toast } from "sonner";
import { Filter, Flame, ShieldCheck, Snowflake, Star, Plus, X, Loader2 } from "lucide-react";
import type { Project, Unit } from "@/types";

const LEAD_PRICES = { BASIC: 300, QUALIFIED: 1000, SITE_VISIT: 3000 } as const;

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

const EMPTY_LEAD = { clientName: "", clientPhone: "", clientEmail: "", source: "", projectId: "", budget: "", location: "", notes: "" };

export default function MarketplacePage() {
  const [loading, setLoading] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [unitsByProject, setUnitsByProject] = useState<Record<string, Unit[]>>({});

  // Add-lead form
  const [showAddLead, setShowAddLead] = useState(false);
  const [leadForm, setLeadForm] = useState({ ...EMPTY_LEAD });
  const [submittingLead, setSubmittingLead] = useState(false);

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

  async function submitLead(e: React.FormEvent) {
    e.preventDefault();
    const f = leadForm;
    if (f.clientName.trim().length < 2 || !/^[6-9]\d{9}$/.test(f.clientPhone.trim()) || !f.source.trim() || !f.projectId) {
      toast.error("Enter a name, valid 10-digit mobile, lead source and the interested project.");
      return;
    }
    // Budget & location aren't columns on the lead — fold them into the notes so
    // nothing the CP entered is lost, then the lead lands in the system for admin.
    const extra = [
      f.budget.trim() && `Budget: ${f.budget.trim()}`,
      f.location.trim() && `Location: ${f.location.trim()}`,
      f.notes.trim(),
    ].filter(Boolean).join("\n");

    setSubmittingLead(true);
    try {
      await api.post("/leads", {
        projectId: f.projectId,
        clientName: f.clientName.trim(),
        clientPhone: f.clientPhone.trim(),
        clientEmail: f.clientEmail.trim() || undefined,
        source: f.source.trim(),
        notes: extra || undefined,
        confirmDuplicate: true,
      });
      toast.success("Lead added — it's now in the system for the admin/CRM.");
      setLeadForm({ ...EMPTY_LEAD });
      setShowAddLead(false);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Couldn't add the lead — try again.");
    } finally {
      setSubmittingLead(false);
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
          <h1 className="text-2xl font-semibold">Lead Management</h1>
          <p className="mt-1 text-sm text-muted-foreground">Add, track and manage your buyer leads — filter by budget, city and quality.</p>
        </div>
        <div className="flex items-center gap-3">
          <Button size="sm" onClick={() => setShowAddLead(true)} className="gap-1.5"><Plus size={15} /> Add Lead</Button>
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

      {/* Add Lead modal */}
      {showAddLead && (
        <div className="fixed inset-0 z-[120] grid place-items-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowAddLead(false)} />
          <form
            onSubmit={submitLead}
            className="relative z-10 w-full max-w-lg rounded-2xl border border-white/10 bg-[#0d1117] p-6 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">New Lead</h2>
              <button type="button" onClick={() => setShowAddLead(false)} className="rounded-full p-1.5 text-muted-foreground hover:bg-white/10 hover:text-white"><X size={16} /></button>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">The lead is saved to the system and visible to the admin/CRM.</p>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Lead name *</Label>
                <Input value={leadForm.clientName} onChange={(e) => setLeadForm({ ...leadForm, clientName: e.target.value })} placeholder="e.g. Priya Sharma" className="border-white/15 bg-card text-white" />
              </div>
              <div>
                <Label>Mobile number *</Label>
                <Input value={leadForm.clientPhone} onChange={(e) => setLeadForm({ ...leadForm, clientPhone: e.target.value })} placeholder="10-digit mobile" className="border-white/15 bg-card text-white" />
              </div>
              <div>
                <Label>Email</Label>
                <Input type="email" value={leadForm.clientEmail} onChange={(e) => setLeadForm({ ...leadForm, clientEmail: e.target.value })} placeholder="you@example.com" className="border-white/15 bg-card text-white" />
              </div>
              <div>
                <Label>Lead source *</Label>
                <Input value={leadForm.source} onChange={(e) => setLeadForm({ ...leadForm, source: e.target.value })} placeholder="e.g. Referral, Walk-in, Facebook" className="border-white/15 bg-card text-white" />
              </div>
              <div className="sm:col-span-2">
                <Label>Interested inventory / project *</Label>
                <select
                  value={leadForm.projectId}
                  onChange={(e) => setLeadForm({ ...leadForm, projectId: e.target.value })}
                  className="mt-1 h-10 w-full rounded-lg border border-white/15 bg-card px-3 text-sm text-white outline-none focus:border-[var(--trust)]"
                >
                  <option value="" className="bg-[#0d1117]">— Select a project —</option>
                  {projects.map((p) => (
                    <option key={p._id} value={p._id} className="bg-[#0d1117]">{p.name} · {p.city}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Budget</Label>
                <Input value={leadForm.budget} onChange={(e) => setLeadForm({ ...leadForm, budget: e.target.value })} placeholder="e.g. ₹80L – ₹1Cr" className="border-white/15 bg-card text-white" />
              </div>
              <div>
                <Label>Location</Label>
                <Input value={leadForm.location} onChange={(e) => setLeadForm({ ...leadForm, location: e.target.value })} placeholder="Preferred area" className="border-white/15 bg-card text-white" />
              </div>
              <div className="sm:col-span-2">
                <Label>Remarks / notes</Label>
                <Textarea rows={2} value={leadForm.notes} onChange={(e) => setLeadForm({ ...leadForm, notes: e.target.value })} placeholder="Anything the sales team should know…" className="border-white/15 bg-card text-white" />
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setShowAddLead(false)}>Cancel</Button>
              <Button type="submit" disabled={submittingLead} className="gap-1.5">
                {submittingLead ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Add Lead
              </Button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}
