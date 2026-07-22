import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { CpHubNav } from "@/components/CpHubNav";
import { Card, Input, Label, Textarea, Badge } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Building2, BadgePercent, ShieldCheck, Users, TrendingUp } from "lucide-react";
import { formatDate } from "@/lib/utils";

interface Referral {
  _id: string;
  developerName: string;
  companyName: string | null;
  phone: string;
  city: string | null;
  status: "PENDING" | "CONTACTED" | "ONBOARDED" | "REJECTED";
  incentivePercent: number;
  createdAt: string;
}

const STATUS_VARIANT: Record<Referral["status"], "warning" | "info" | "success" | "danger"> = {
  PENDING: "warning",
  CONTACTED: "info",
  ONBOARDED: "success",
  REJECTED: "danger",
};

const EMPTY = { developerName: "", companyName: "", phone: "", email: "", city: "", landDetails: "", notes: "" };

export default function OnboardDevelopersPage() {
  const [form, setForm] = useState({ ...EMPTY });
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [submitting, setSubmitting] = useState(false);

  function load() {
    api.get("/onboarding/developers").then((r) => setReferrals(r.data.referrals)).catch(() => {});
  }
  useEffect(() => { load(); }, []);

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
      toast.success("Developer submitted — our team will onboard them. Your +10% incentive is locked to you.");
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
      <h1 className="flex items-center gap-2 text-2xl font-semibold">
        <Building2 size={22} className="text-emerald-400" /> Onboard Developers
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-300">
          <BadgePercent size={13} /> +10% incentive
        </span>
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Bring a developer or landowner who wants to list their land — earn a permanent <b className="text-emerald-300">+10% commission</b> on every sale from their inventory.
      </p>

      <CpHubNav />

      {/* How the incentive works */}
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Card className="border-emerald-500/20 bg-emerald-950/10 text-white">
          <ShieldCheck size={18} className="text-emerald-400" />
          <p className="mt-2 text-sm font-semibold">You're the verified onboarder</p>
          <p className="mt-1 text-xs text-muted-foreground">List a developer's land under your name — you stay recorded as the partner who brought them.</p>
        </Card>
        <Card className="border-white/10 glass text-white">
          <TrendingUp size={18} className="text-sky-400" />
          <p className="mt-2 text-sm font-semibold">Sell it yourself → full commission</p>
          <p className="mt-1 text-xs text-muted-foreground">If you close a sale on their inventory, you earn your normal commission — plus the onboarding credit.</p>
        </Card>
        <Card className="border-white/10 glass text-white">
          <Users size={18} className="text-violet-400" />
          <p className="mt-2 text-sm font-semibold">Anyone else sells → you still earn +10%</p>
          <p className="mt-1 text-xs text-muted-foreground">Even when another partner sells from the developer you onboarded, you get an extra 10% commission on that sale.</p>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* Onboarding form */}
        <Card className="border-white/10 glass text-white">
          <h2 className="font-display text-lg font-semibold">Refer a developer / landowner</h2>
          <p className="mt-1 text-sm text-muted-foreground">Share their details — our team verifies and onboards them, and your +10% incentive is locked to you.</p>
          <form onSubmit={submit} className="mt-4 grid gap-4 sm:grid-cols-2">
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
              <Label>Email (optional)</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="developer@example.com" className="border-white/15 bg-card text-white" />
            </div>
            <div>
              <Label>City / area</Label>
              <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="e.g. Lucknow" className="border-white/15 bg-card text-white" />
            </div>
            <div>
              <Label>Land / project details</Label>
              <Input value={form.landDetails} onChange={(e) => setForm({ ...form, landDetails: e.target.value })} placeholder="e.g. 5-acre plotted land, Kasmandi" className="border-white/15 bg-card text-white" />
            </div>
            <div className="sm:col-span-2">
              <Label>Notes (optional)</Label>
              <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Anything our team should know…" className="border-white/15 bg-card text-white" />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={submitting}>{submitting ? "Submitting…" : "Submit for onboarding"}</Button>
            </div>
          </form>
        </Card>

        {/* Their referrals */}
        <Card className="h-fit border-white/10 glass text-white">
          <h2 className="font-display text-lg font-semibold">Your onboardings</h2>
          {referrals.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">No developers onboarded yet. Refer your first one to lock in a +10% incentive.</p>
          ) : (
            <div className="mt-3 space-y-3">
              {referrals.map((r) => (
                <div key={r._id} className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="min-w-0 truncate text-sm font-medium">{r.developerName}</p>
                    <Badge variant={STATUS_VARIANT[r.status]}>{r.status}</Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {[r.companyName, r.city].filter(Boolean).join(" · ") || r.phone}
                  </p>
                  <p className="mt-1 text-[11px] text-emerald-300">+{r.incentivePercent}% incentive · {formatDate(r.createdAt)}</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </main>
  );
}
