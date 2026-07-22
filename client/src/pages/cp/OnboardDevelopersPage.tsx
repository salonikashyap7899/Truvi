import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { CpHubNav } from "@/components/CpHubNav";
import { Card, Input, Label, Textarea, Badge } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Building2, BadgePercent, ShieldCheck, Users, TrendingUp, IndianRupee, Activity } from "lucide-react";
import { formatINR, formatCompactINR, formatDate } from "@/lib/utils";

interface Referral {
  _id: string;
  developerName: string;
  companyName: string | null;
  phone: string;
  city: string | null;
  status: "PENDING" | "VERIFIED" | "ACTIVE" | "REJECTED";
  incentivePercent: number;
  // Populated once the referred developer's inventory starts transacting.
  propertiesListed?: number;
  totalTransactions?: number;
  totalSalesValue?: number;
  incentiveEarned?: number;
  lastTransactionAt?: string | null;
  createdAt: string;
}

const STATUS_VARIANT: Record<Referral["status"], "warning" | "info" | "success" | "danger"> = {
  PENDING: "warning",
  VERIFIED: "info",
  ACTIVE: "success",
  REJECTED: "danger",
};

const EMPTY = { developerName: "", companyName: "", phone: "", email: "", city: "", landDetails: "", notes: "" };

export default function OnboardDevelopersPage() {
  const isCp = useAuthStore((s) => s.user?.role) === "CP";
  const [form, setForm] = useState({ ...EMPTY });
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [submitting, setSubmitting] = useState(false);

  function load() {
    api.get("/onboarding/developers").then((r) => setReferrals(r.data.referrals)).catch(() => {});
  }
  useEffect(() => { load(); }, []);

  const summary = useMemo(() => ({
    enrolled: referrals.length,
    active: referrals.filter((r) => r.status === "ACTIVE").length,
    transactions: referrals.reduce((s, r) => s + (r.totalTransactions ?? 0), 0),
    incentive: referrals.reduce((s, r) => s + (r.incentiveEarned ?? 0), 0),
  }), [referrals]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (form.developerName.trim().length < 2 || !/^[6-9]\d{9}$/.test(form.phone.trim())) {
      toast.error("Enter the developer's name and a valid 10-digit mobile number");
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/onboarding/developers", {
        developerName: form.developerName.trim(),
        companyName: form.companyName.trim() || undefined,
        phone: form.phone.trim(),
        email: form.email.trim() || undefined,
        city: form.city.trim() || undefined,
        landDetails: form.landDetails.trim() || undefined,
        notes: form.notes.trim() || undefined,
      });
      toast.success("Developer enrolled — your 2% incentive is now locked to you.");
      setForm({ ...EMPTY });
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Could not submit — try again");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen p-6 text-white md:p-10">
      <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold">
        <Building2 size={22} className="text-emerald-400" /> Developer Enrollment
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-300">
          <BadgePercent size={13} /> Earn 2% on every transaction
        </span>
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Enroll a developer or landowner who wants to list their land — earn <b className="text-emerald-300">2% on every transaction</b> by your referred developer, forever.
      </p>

      {isCp && <CpHubNav />}

      {/* Summary cards */}
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard icon={<Users size={16} />} tone="text-sky-400" label="Developers Enrolled" value={String(summary.enrolled)} />
        <SummaryCard icon={<ShieldCheck size={16} />} tone="text-emerald-400" label="Active Developers" value={String(summary.active)} />
        <SummaryCard icon={<Activity size={16} />} tone="text-violet-400" label="Total Transactions" value={String(summary.transactions)} />
        <SummaryCard icon={<IndianRupee size={16} />} tone="text-amber-400" label="Incentive Earned (2%)" value={formatCompactINR(summary.incentive)} />
      </div>

      {/* How the incentive works */}
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Card className="border-emerald-500/20 bg-emerald-950/10 text-white">
          <ShieldCheck size={18} className="text-emerald-400" />
          <p className="mt-2 text-sm font-semibold">You're the verified onboarder</p>
          <p className="mt-1 text-xs text-muted-foreground">Enroll a developer's land under your name — you stay the recorded partner who brought them.</p>
        </Card>
        <Card className="border-white/10 glass text-white">
          <TrendingUp size={18} className="text-sky-400" />
          <p className="mt-2 text-sm font-semibold">Sell it yourself → full commission</p>
          <p className="mt-1 text-xs text-muted-foreground">Close a sale on their inventory and you earn your normal commission — plus the enrollment credit.</p>
        </Card>
        <Card className="border-white/10 glass text-white">
          <Users size={18} className="text-violet-400" />
          <p className="mt-2 text-sm font-semibold">Anyone else sells → you still earn 2%</p>
          <p className="mt-1 text-xs text-muted-foreground">On every transaction from the developer you enrolled — even by another partner — you earn 2%.</p>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[360px_1fr]">
        {/* Enrollment form */}
        <Card className="h-fit border-white/10 glass text-white">
          <h2 className="font-display text-lg font-semibold">Enroll a developer</h2>
          <p className="mt-1 text-sm text-muted-foreground">Share their details — our team verifies and onboards them, and your 2% incentive is locked to you.</p>
          <form onSubmit={submit} className="mt-4 space-y-3">
            <div>
              <Label>Developer / landowner name *</Label>
              <Input value={form.developerName} onChange={(e) => setForm({ ...form, developerName: e.target.value })} placeholder="e.g. Rakesh Verma" className="border-white/15 bg-card text-white" />
            </div>
            <div>
              <Label>Company (optional)</Label>
              <Input value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} placeholder="e.g. Verma Estates" className="border-white/15 bg-card text-white" />
            </div>
            <div>
              <Label>Mobile number *</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="10-digit mobile" className="border-white/15 bg-card text-white" />
            </div>
            <div>
              <Label>City / area</Label>
              <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="e.g. Lucknow" className="border-white/15 bg-card text-white" />
            </div>
            <div>
              <Label>Land / project details</Label>
              <Input value={form.landDetails} onChange={(e) => setForm({ ...form, landDetails: e.target.value })} placeholder="e.g. 5-acre plotted land, Kasmandi" className="border-white/15 bg-card text-white" />
            </div>
            <div>
              <Label>Notes (optional)</Label>
              <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Anything our team should know…" className="border-white/15 bg-card text-white" />
            </div>
            <Button type="submit" disabled={submitting} className="w-full">{submitting ? "Enrolling…" : "Enroll developer"}</Button>
          </form>
        </Card>

        {/* Enrolled-developers dashboard table */}
        <Card className="border-white/10 glass text-white">
          <h2 className="font-display text-lg font-semibold">Your enrolled developers</h2>
          {referrals.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">No developers enrolled yet — enroll your first one to start earning 2% on every transaction.</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Developer</th>
                    <th className="py-2 px-3 font-medium">Status</th>
                    <th className="py-2 px-3 text-right font-medium">Properties</th>
                    <th className="py-2 px-3 text-right font-medium">Transactions</th>
                    <th className="py-2 px-3 text-right font-medium">Sales value</th>
                    <th className="py-2 px-3 text-right font-medium">2% earned</th>
                    <th className="py-2 pl-3 text-right font-medium">Last txn</th>
                  </tr>
                </thead>
                <tbody>
                  {referrals.map((r) => (
                    <tr key={r._id} className="border-b border-white/5">
                      <td className="py-2.5 pr-3">
                        <p className="font-medium">{r.developerName}</p>
                        <p className="text-[11px] text-muted-foreground">{[r.companyName, r.city].filter(Boolean).join(" · ") || r.phone}</p>
                      </td>
                      <td className="py-2.5 px-3"><Badge variant={STATUS_VARIANT[r.status]}>{r.status}</Badge></td>
                      <td className="py-2.5 px-3 text-right tabular-nums">{r.propertiesListed ?? 0}</td>
                      <td className="py-2.5 px-3 text-right tabular-nums">{r.totalTransactions ?? 0}</td>
                      <td className="py-2.5 px-3 text-right tabular-nums">{formatINR(r.totalSalesValue ?? 0)}</td>
                      <td className="py-2.5 px-3 text-right tabular-nums text-emerald-300">{formatINR(r.incentiveEarned ?? 0)}</td>
                      <td className="py-2.5 pl-3 text-right text-muted-foreground">{r.lastTransactionAt ? formatDate(r.lastTransactionAt) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-3 text-[11px] text-muted-foreground">Transactions, sales value and 2% earnings update live as your enrolled developers' inventory sells.</p>
            </div>
          )}
        </Card>
      </div>
    </main>
  );
}

function SummaryCard({ icon, tone, label, value }: { icon: React.ReactNode; tone: string; label: string; value: string }) {
  return (
    <Card className="border-white/10 glass text-white">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className={tone}>{icon}</span>
      </div>
      <p className="mt-1 font-display text-2xl font-semibold">{value}</p>
    </Card>
  );
}
