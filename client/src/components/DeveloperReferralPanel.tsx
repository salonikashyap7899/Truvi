import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { formatINR, formatDate } from "@/lib/utils";
import { Card, Badge } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { Building2, BadgePercent, IndianRupee, Users, ShieldCheck, Activity, TrendingUp, Share2, Copy } from "lucide-react";

/**
 * Developer Referral panel — shared by the CP and Ambassador dashboards.
 * Onboard a developer with your code and earn a one-time first-transaction
 * bonus (role-based: ₹100 for a Developer referrer, ₹75 for a Channel Partner /
 * Ambassador) plus 2% for lifetime on their every transaction. The bonus amount
 * comes straight from the API, so each role sees their correct figure.
 */
interface DevRefRow {
  _id: string;
  name: string;
  email: string | null;
  status: "ACTIVE" | "PENDING";
  totalTransactions: number;
  totalSalesValue: number;
  percentEarned: number;
  firstTxnBonus: number;
  incentiveEarned: number;
  lastTransactionAt: string | null;
  createdAt: string;
}
interface DevRefData {
  referralCode: string | null;
  firstTxnBonus: number;
  referredDevelopers: DevRefRow[];
  summary: { referredCount: number; active: number; totalTransactions: number; totalBonus: number; totalEarnings: number };
}

type Period = "all" | "this_month" | "last_month";
const PERIODS: { key: Period; label: string }[] = [
  { key: "this_month", label: "This Month" },
  { key: "last_month", label: "Last Month" },
  { key: "all", label: "All Time" },
];

export default function DeveloperReferralPanel({ className = "" }: { className?: string }) {
  const [data, setData] = useState<DevRefData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>("all");

  useEffect(() => {
    setLoading(true);
    api.get(`/onboarding/referral?period=${period}`).then((r) => setData(r.data)).catch(() => setData(null)).finally(() => setLoading(false));
  }, [period]);

  const bonus = data?.firstTxnBonus ?? 100;
  const inviteLink = data?.referralCode ? `${window.location.origin}/signup?ref=${data.referralCode}` : "";
  const s = data?.summary ?? { referredCount: 0, active: 0, totalTransactions: 0, totalBonus: 0, totalEarnings: 0 };
  const rows = data?.referredDevelopers ?? [];

  async function copyLink() {
    if (!inviteLink) return;
    try { await navigator.clipboard.writeText(inviteLink); toast.success("Developer invite link copied"); } catch { /* ignore */ }
  }
  async function shareLink() {
    if (!inviteLink || !data?.referralCode) return;
    const text = `List your properties on Truvi with my referral code ${data.referralCode}.\n${inviteLink}`;
    if (typeof navigator !== "undefined" && navigator.share) {
      try { await navigator.share({ title: "Join Truvi", text, url: inviteLink }); return; }
      catch (err) { if ((err as Error)?.name === "AbortError") return; }
    }
    try { await navigator.clipboard.writeText(text); toast.success("Invite copied — share it anywhere"); } catch { /* ignore */ }
  }

  return (
    <Card className={`border-sky-500/25 bg-sky-950/10 text-white ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex flex-wrap items-center gap-2 font-display text-lg font-semibold">
            <Building2 size={18} className="text-sky-300" /> Developer Referral
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-semibold text-amber-300"><IndianRupee size={12} /> ₹{bonus} on 1st transaction</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-300"><BadgePercent size={12} /> + 2% lifetime</span>
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Onboard a developer with your code. You earn a one-time <b className="text-amber-300">₹{bonus} bonus</b> on their first transaction, plus <b className="text-emerald-300">2% for lifetime</b> on every transaction from their inventory.
          </p>
        </div>
      </div>

      {/* Code + invite */}
      <div className="mt-4 flex flex-col gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-sky-300/80">Your developer referral code</p>
          <div className="mt-1 flex items-center gap-3">
            <span className="font-display text-2xl font-bold tracking-wider">{data?.referralCode ?? "…"}</span>
            <button onClick={copyLink} title="Copy invite link" className="rounded-lg border border-white/15 bg-white/5 p-2 text-white/70 hover:bg-white/10"><Copy size={15} /></button>
          </div>
          {inviteLink && <p className="mt-2 break-all text-[11px] text-muted-foreground">{inviteLink}</p>}
        </div>
        <Button onClick={shareLink} className="shrink-0 gap-2"><Share2 size={15} /> Refer a developer</Button>
      </div>

      {/* Period filter */}
      <div className="mt-4 flex flex-wrap items-center gap-1.5">
        {PERIODS.map((p) => (
          <button
            key={p.key}
            onClick={() => setPeriod(p.key)}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition ${period === p.key ? "bg-sky-500 text-white" : "border border-white/10 text-white/60 hover:bg-white/10"}`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Summary */}
      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <PanelTile icon={<Users size={15} />} label="Referred Developers" value={String(s.referredCount)} />
        <PanelTile icon={<ShieldCheck size={15} />} label="Active" value={String(s.active)} tone="text-emerald-300" />
        <PanelTile icon={<Activity size={15} />} label="Transactions" value={String(s.totalTransactions)} />
        <PanelTile icon={<IndianRupee size={15} />} label="1st-txn Bonus" value={formatINR(s.totalBonus)} tone="text-amber-300" />
        <PanelTile icon={<TrendingUp size={15} />} label="Total Earnings" value={formatINR(s.totalEarnings)} tone="text-emerald-300" />
      </div>

      {/* Per-developer breakdown */}
      <div className="mt-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-foreground/80">Your Referred Developers</h3>
        {loading ? (
          <p className="mt-2 text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No developers have joined with your code yet. Share your invite link above to start earning.</p>
        ) : (
          <div className="mt-2 overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-white/[0.03] text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Developer</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Transactions</th>
                  <th className="px-4 py-3 text-right">Sales value</th>
                  <th className="px-4 py-3 text-right">2% lifetime</th>
                  <th className="px-4 py-3 text-right">1st-txn bonus</th>
                  <th className="px-4 py-3 text-right">Total earned</th>
                  <th className="px-4 py-3 text-right">Last txn</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {rows.map((r) => (
                  <tr key={r._id}>
                    <td className="px-4 py-3">
                      <p className="font-medium">{r.name}</p>
                      <p className="text-[11px] text-muted-foreground">{r.email ?? `Joined ${formatDate(r.createdAt)}`}</p>
                    </td>
                    <td className="px-4 py-3"><Badge variant={r.status === "ACTIVE" ? "success" : "warning"}>{r.status}</Badge></td>
                    <td className="px-4 py-3 text-right tabular-nums">{r.totalTransactions}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatINR(r.totalSalesValue)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-emerald-300">{formatINR(r.percentEarned)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{r.firstTxnBonus > 0 ? <span className="text-amber-300">{formatINR(r.firstTxnBonus)}</span> : <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatINR(r.incentiveEarned)}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{r.lastTransactionAt ? formatDate(r.lastTransactionAt) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Card>
  );
}

function PanelTile({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">{icon} {label}</p>
      <p className={`mt-1 font-display text-lg font-semibold ${tone ?? "text-white"}`}>{value}</p>
    </div>
  );
}
