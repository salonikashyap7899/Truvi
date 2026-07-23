import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { CpHubNav } from "@/components/CpHubNav";
import { Card, Input, Label, Textarea, Badge } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Building2, BadgePercent, ShieldCheck, Users, TrendingUp, IndianRupee, Activity, Share2, Copy } from "lucide-react";
import { formatINR, formatCompactINR, formatDate } from "@/lib/utils";

interface ReferredDev {
  _id: string;
  name: string;
  email: string | null;
  status: "ACTIVE" | "PENDING";
  propertiesListed: number;
  totalTransactions: number;
  totalSalesValue: number;
  incentiveEarned: number;
  lastTransactionAt: string | null;
  createdAt: string;
}
interface ReferralData {
  referralCode: string | null;
  referredDevelopers: ReferredDev[];
  summary: { referredCount: number; active: number; totalTransactions: number; totalEarnings: number };
}

const EMPTY = { developerName: "", companyName: "", phone: "", email: "", city: "", landDetails: "", notes: "" };

export default function OnboardDevelopersPage() {
  const role = useAuthStore((s) => s.user?.role);
  const isCp = role === "CP";
  const isReferrer = role === "CP" || role === "AMBASSADOR";

  const [referral, setReferral] = useState<ReferralData | null>(null);
  const [form, setForm] = useState({ ...EMPTY });
  const [submitting, setSubmitting] = useState(false);

  function load() {
    if (isReferrer) api.get("/onboarding/referral").then((r) => setReferral(r.data)).catch(() => {});
  }
  useEffect(() => { load(); }, []);

  const registrationLink = referral?.referralCode
    ? `${window.location.origin}/signup?ref=${referral.referralCode}`
    : "";

  const summary = useMemo(() => referral?.summary ?? { referredCount: 0, active: 0, totalTransactions: 0, totalEarnings: 0 }, [referral]);

  async function copyCode() {
    if (!referral?.referralCode) return;
    try { await navigator.clipboard.writeText(referral.referralCode); toast.success("Referral code copied"); } catch { /* ignore */ }
  }

  async function shareReferral() {
    if (!referral?.referralCode) return;
    const text = `Join Truvi with my referral code ${referral.referralCode} and list your properties.\n${registrationLink}`;
    if (typeof navigator !== "undefined" && navigator.share) {
      try { await navigator.share({ title: "Join Truvi", text, url: registrationLink }); return; }
      catch (err) { if ((err as Error)?.name === "AbortError") return; }
    }
    try { await navigator.clipboard.writeText(text); toast.success("Referral link copied — share it anywhere"); } catch { /* ignore */ }
  }

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
      toast.success("Developer submitted — your 2% incentive is locked to you.");
      setForm({ ...EMPTY });
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Could not submit — try again");
    } finally {
      setSubmitting(false);
    }
  }

  const referred = referral?.referredDevelopers ?? [];

  return (
    <main className="min-h-screen p-6 text-white md:p-10">
      <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold">
        <Building2 size={22} className="text-emerald-400" /> Developer Referral
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-300">
          <BadgePercent size={13} /> Earn 2% on every transaction
        </span>
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Share your referral code — every developer who joins with it is linked to you, and you earn <b className="text-emerald-300">2% on every transaction</b> from their inventory.
      </p>

      {isCp && <CpHubNav />}

      {/* Referral code card (CP / Ambassador) */}
      {isReferrer && (
        <Card className="mt-6 border-emerald-500/25 bg-emerald-950/10 text-white">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-emerald-300/80">Your referral code</p>
              <div className="mt-1 flex items-center gap-3">
                <span className="font-display text-3xl font-bold tracking-wider text-white">{referral?.referralCode ?? "…"}</span>
                <button onClick={copyCode} title="Copy code" className="rounded-lg border border-white/15 bg-white/5 p-2 text-white/70 transition hover:bg-white/10"><Copy size={15} /></button>
              </div>
              {registrationLink && <p className="mt-2 break-all text-[11px] text-muted-foreground">{registrationLink}</p>}
            </div>
            <Button onClick={shareReferral} className="shrink-0 gap-2"><Share2 size={15} /> Share referral code</Button>
          </div>
        </Card>
      )}

      {/* Summary cards */}
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard icon={<Users size={16} />} tone="text-sky-400" label="Referred Developers" value={String(summary.referredCount)} />
        <SummaryCard icon={<ShieldCheck size={16} />} tone="text-emerald-400" label="Active Developers" value={String(summary.active)} />
        <SummaryCard icon={<Activity size={16} />} tone="text-violet-400" label="Total Transactions" value={String(summary.totalTransactions)} />
        <SummaryCard icon={<IndianRupee size={16} />} tone="text-amber-400" label="Referral Earnings (2%)" value={formatCompactINR(summary.totalEarnings)} />
      </div>

      {/* How it works */}
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Card className="border-white/10 glass text-white">
          <ShieldCheck size={18} className="text-emerald-400" />
          <p className="mt-2 text-sm font-semibold">Share your code</p>
          <p className="mt-1 text-xs text-muted-foreground">Send your code to any developer/landowner — they sign up with it and get linked to you.</p>
        </Card>
        <Card className="border-white/10 glass text-white">
          <TrendingUp size={18} className="text-sky-400" />
          <p className="mt-2 text-sm font-semibold">They list & transact</p>
          <p className="mt-1 text-xs text-muted-foreground">Every eligible transaction from your referred developers is tracked automatically.</p>
        </Card>
        <Card className="border-white/10 glass text-white">
          <BadgePercent size={18} className="text-violet-400" />
          <p className="mt-2 text-sm font-semibold">You earn 2%</p>
          <p className="mt-1 text-xs text-muted-foreground">You automatically earn a 2% referral incentive on every one of their transactions.</p>
        </Card>
      </div>

      {/* Referred-developers dashboard */}
      <Card className="mt-6 border-white/10 glass text-white">
        <h2 className="font-display text-lg font-semibold">Your referred developers</h2>
        {referred.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No developers have joined with your code yet. Share it above to start earning 2%.</p>
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
                {referred.map((r) => (
                  <tr key={r._id} className="border-b border-white/5">
                    <td className="py-2.5 pr-3">
                      <p className="font-medium">{r.name}</p>
                      <p className="text-[11px] text-muted-foreground">{r.email ?? `Joined ${formatDate(r.createdAt)}`}</p>
                    </td>
                    <td className="py-2.5 px-3"><Badge variant={r.status === "ACTIVE" ? "success" : "warning"}>{r.status}</Badge></td>
                    <td className="py-2.5 px-3 text-right tabular-nums">{r.propertiesListed}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums">{r.totalTransactions}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums">{formatINR(r.totalSalesValue)}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums text-emerald-300">{formatINR(r.incentiveEarned)}</td>
                    <td className="py-2.5 pl-3 text-right text-muted-foreground">{r.lastTransactionAt ? formatDate(r.lastTransactionAt) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-[11px] text-muted-foreground">Transactions, sales value and 2% earnings update live as your referred developers' inventory sells.</p>
          </div>
        )}
      </Card>

      {/* Optional: add a developer manually (our team invites them) */}
      <Card className="mt-6 border-white/10 glass text-white">
        <h2 className="font-display text-lg font-semibold">Or enroll a developer manually</h2>
        <p className="mt-1 text-sm text-muted-foreground">Don't have them on a call? Share their details and our team invites them under your referral.</p>
        <form onSubmit={submit} className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Developer / landowner name *</Label>
            <Input value={form.developerName} onChange={(e) => setForm({ ...form, developerName: e.target.value })} placeholder="e.g. Rakesh Verma" className="border-white/15 bg-card text-white" />
          </div>
          <div>
            <Label>Mobile number *</Label>
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="10-digit mobile" className="border-white/15 bg-card text-white" />
          </div>
          <div>
            <Label>Company (optional)</Label>
            <Input value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} placeholder="e.g. Verma Estates" className="border-white/15 bg-card text-white" />
          </div>
          <div>
            <Label>City / area</Label>
            <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="e.g. Lucknow" className="border-white/15 bg-card text-white" />
          </div>
          <div className="sm:col-span-2">
            <Label>Notes (optional)</Label>
            <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Anything our team should know…" className="border-white/15 bg-card text-white" />
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={submitting}>{submitting ? "Submitting…" : "Submit for enrollment"}</Button>
          </div>
        </form>
      </Card>
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
