import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Wallet, TrendingDown, PiggyBank, Users, CalendarClock, Megaphone,
  CheckCircle2, Target, Plus,
} from "lucide-react";
import { api } from "@/lib/api";
import { SiteNav } from "@/components/SiteNav";
import { StatCard } from "@/components/ui/stat";
import { Badge, Card, Input, Label, Textarea } from "@/components/ui/primitives";
import { toast } from "sonner";

const inr = (paise: number) => "₹" + (paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 });
const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—");

interface Expense { _id: string; activity: string; amountPaise: number; status: string; spentAt: string; notes: string | null; }
interface Lead { _id: string; name: string; phone: string | null; email: string | null; source: string; status: string; valuePaise: number; createdAt: string; }
interface Campaign { _id: string; name: string; channel: string; status: string; spendPaise: number; leadsCount: number; startedAt: string | null; }
interface Dashboard {
  access: { packageName: string; status: string; validFrom: string | null; validUntil: string | null; budgetPaise: number } | null;
  cards: {
    totalSpendPaise: number; totalUsedPaise: number; remainingPaise: number;
    todaysLeads: number; totalLeads: number; leadsGenerated: number; campaigns: number;
    qualifiedLeads: number; convertedLeads: number; pendingLeads: number;
  };
  expenses: Expense[]; leads: Lead[]; campaigns: Campaign[];
}

const LEAD_VARIANT: Record<string, "success" | "warning" | "info" | "default"> = {
  CONVERTED: "success", QUALIFIED: "info", PENDING: "warning", NEW: "default",
};
const EXP_VARIANT: Record<string, "success" | "warning" | "info"> = {
  COMPLETED: "success", ACTIVE: "info", PLANNED: "warning",
};

export default function MarketingDashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", email: "", notes: "" });
  const [saving, setSaving] = useState(false);

  function load() {
    api.get("/marketing/dashboard")
      .then((res) => { setData(res.data); setDenied(false); })
      .catch((err) => { if (err?.response?.status === 403) setDenied(true); })
      .finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, []);

  async function addLead(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await api.post("/marketing/leads", {
        name: form.name.trim(),
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
        notes: form.notes.trim() || undefined,
      });
      toast.success("Lead added");
      setForm({ name: "", phone: "", email: "", notes: "" });
      setAddOpen(false);
      load();
    } catch {
      toast.error("Could not add lead");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#05070d] text-white">
      <SiteNav />
      <div className="mx-auto max-w-6xl px-4 pb-24 pt-6">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold sm:text-3xl">Marketing Dashboard</h1>
            <p className="mt-1 text-sm text-white/50">Track your marketing budget, campaigns and leads in one place.</p>
          </div>
          {data?.access && (
            <div className="text-right text-xs text-white/60">
              <div className="font-semibold text-white">{data.access.packageName}</div>
              <div>Valid till {fmtDate(data.access.validUntil)}</div>
            </div>
          )}
        </div>

        {loading && <p className="text-sm text-white/50">Loading…</p>}

        {denied && (
          <Card className="p-8 text-center">
            <Megaphone className="mx-auto mb-3 h-10 w-10 text-white/30" />
            <h2 className="text-lg font-semibold">No marketing access yet</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-white/50">
              The Marketing Dashboard is available to authorized partners. Contact the Truvi team to activate your marketing access.
            </p>
            <Link to="/about" className="mt-4 inline-block rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-400">
              Contact Truvi
            </Link>
          </Card>
        )}

        {data && !denied && (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              <StatCard label="Total Marketing Spend" value={inr(data.cards.totalSpendPaise)} icon={<Wallet size={18} />} tone="violet" />
              <StatCard label="Total Amount Used" value={inr(data.cards.totalUsedPaise)} icon={<TrendingDown size={18} />} tone="rose" />
              <StatCard label="Remaining Budget" value={inr(data.cards.remainingPaise)} icon={<PiggyBank size={18} />} tone="emerald" />
              <StatCard label="Marketing Campaigns" value={data.cards.campaigns} icon={<Megaphone size={18} />} tone="amber" />
              <StatCard label="Today's Leads" value={data.cards.todaysLeads} icon={<CalendarClock size={18} />} tone="sky" />
              <StatCard label="Total Leads" value={data.cards.totalLeads} icon={<Users size={18} />} tone="violet" />
              <StatCard label="Leads Generated" value={data.cards.leadsGenerated} icon={<Target size={18} />} tone="emerald" />
              <StatCard label="Qualified Leads" value={data.cards.qualifiedLeads} icon={<CheckCircle2 size={18} />} tone="sky" />
            </div>

            {/* Lead tracking breakdown */}
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <MiniStat label="Today's Lead" value={data.cards.todaysLeads} />
              <MiniStat label="Qualified" value={data.cards.qualifiedLeads} />
              <MiniStat label="Converted" value={data.cards.convertedLeads} />
              <MiniStat label="Pending" value={data.cards.pendingLeads} />
            </div>

            {/* Campaigns */}
            <Section title="Marketing Campaigns" icon={<Megaphone size={16} />}>
              {data.campaigns.length === 0 ? (
                <Empty text="No campaigns yet. The Truvi team will add your campaigns here." />
              ) : (
                <Table head={["Campaign", "Channel", "Spend", "Leads", "Status"]}>
                  {data.campaigns.map((c) => (
                    <tr key={c._id} className="border-t border-white/5">
                      <td className="px-3 py-2 font-medium">{c.name}</td>
                      <td className="px-3 py-2 text-white/60">{c.channel}</td>
                      <td className="px-3 py-2">{inr(c.spendPaise)}</td>
                      <td className="px-3 py-2">{c.leadsCount}</td>
                      <td className="px-3 py-2"><Badge variant={c.status === "ACTIVE" ? "success" : c.status === "PAUSED" ? "warning" : "info"}>{c.status}</Badge></td>
                    </tr>
                  ))}
                </Table>
              )}
            </Section>

            {/* Expenses */}
            <Section title="Marketing Expenses" icon={<TrendingDown size={16} />}>
              {data.expenses.length === 0 ? (
                <Empty text="No expenses tracked yet." />
              ) : (
                <Table head={["Activity", "Amount", "Date", "Status"]}>
                  {data.expenses.map((x) => (
                    <tr key={x._id} className="border-t border-white/5">
                      <td className="px-3 py-2 font-medium">{x.activity}</td>
                      <td className="px-3 py-2">{inr(x.amountPaise)}</td>
                      <td className="px-3 py-2 text-white/60">{fmtDate(x.spentAt)}</td>
                      <td className="px-3 py-2"><Badge variant={EXP_VARIANT[x.status] ?? "info"}>{x.status}</Badge></td>
                    </tr>
                  ))}
                </Table>
              )}
            </Section>

            {/* Leads */}
            <Section
              title="Leads"
              icon={<Users size={16} />}
              action={
                <button onClick={() => setAddOpen((o) => !o)} className="inline-flex items-center gap-1 rounded-lg bg-sky-500/90 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-400">
                  <Plus size={14} /> Add lead
                </button>
              }
            >
              {addOpen && (
                <form onSubmit={addLead} className="mb-3 grid gap-2 rounded-xl border border-white/10 bg-white/5 p-3 sm:grid-cols-2">
                  <div><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Lead name" /></div>
                  <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Phone" /></div>
                  <div><Label>Email</Label><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email" /></div>
                  <div className="sm:col-span-2"><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} /></div>
                  <div className="sm:col-span-2">
                    <button disabled={saving} className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-400 disabled:opacity-60">
                      {saving ? "Saving…" : "Save lead"}
                    </button>
                  </div>
                </form>
              )}
              {data.leads.length === 0 ? (
                <Empty text="No leads yet." />
              ) : (
                <Table head={["Name", "Contact", "Source", "Value", "Status", "Date"]}>
                  {data.leads.map((l) => (
                    <tr key={l._id} className="border-t border-white/5">
                      <td className="px-3 py-2 font-medium">{l.name}</td>
                      <td className="px-3 py-2 text-white/60">{l.phone || l.email || "—"}</td>
                      <td className="px-3 py-2 text-white/60">{l.source}</td>
                      <td className="px-3 py-2">{l.valuePaise ? inr(l.valuePaise) : "—"}</td>
                      <td className="px-3 py-2"><Badge variant={LEAD_VARIANT[l.status] ?? "default"}>{l.status}</Badge></td>
                      <td className="px-3 py-2 text-white/60">{fmtDate(l.createdAt)}</td>
                    </tr>
                  ))}
                </Table>
              )}
            </Section>
          </>
        )}
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-white/50">{label}</div>
    </div>
  );
}

function Section({ title, icon, action, children }: { title: string; icon: React.ReactNode; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mt-6">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-white/80">{icon} {title}</h2>
        {action}
      </div>
      <Card className="overflow-hidden p-0">{children}</Card>
    </div>
  );
}

function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="text-xs uppercase tracking-wide text-white/40">
            {head.map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="px-4 py-6 text-sm text-white/40">{text}</p>;
}
