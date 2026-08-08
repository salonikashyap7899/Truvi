import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { formatINR, formatDate } from "@/lib/utils";
import { Card, Badge } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { Handshake, BadgePercent, IndianRupee, Users, Activity, TrendingUp, Share2, Copy } from "lucide-react";

/**
 * Channel Partner Referral panel (Ambassador page). Onboard a Channel Partner
 * with your code and earn a one-time ₹75 first-transaction bonus + 2% lifetime
 * on that CP's own commission earnings.
 */
interface CpRow {
  _id: string;
  name: string;
  email: string | null;
  status: "ACTIVE" | "PENDING";
  totalTransactions: number;
  cpCommission: number;
  percentEarned: number;
  firstTxnBonus: number;
  incentiveEarned: number;
  lastTransactionAt: string | null;
  createdAt: string;
}
interface CpRefData {
  referralCode: string | null;
  firstTxnBonus: number;
  referredPartners: CpRow[];
  summary: { referredCount: number; active: number; totalTransactions: number; totalBonus: number; totalEarnings: number };
}

export default function CpReferralPanel({ className = "" }: { className?: string }) {
  const [data, setData] = useState<CpRefData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/onboarding/cp-referrals").then((r) => setData(r.data)).catch(() => setData(null)).finally(() => setLoading(false));
  }, []);

  const bonus = data?.firstTxnBonus ?? 75;
  const inviteLink = data?.referralCode ? `${window.location.origin}/signup?ref=${data.referralCode}` : "";
  const s = data?.summary ?? { referredCount: 0, active: 0, totalTransactions: 0, totalBonus: 0, totalEarnings: 0 };
  const rows = data?.referredPartners ?? [];

  async function copyLink() {
    if (!inviteLink) return;
    try { await navigator.clipboard.writeText(inviteLink); toast.success("Channel Partner invite link copied"); } catch { /* ignore */ }
  }
  async function shareLink() {
    if (!inviteLink || !data?.referralCode) return;
    const text = `Join Truvi as a Channel Partner with my referral code ${data.referralCode}.\n${inviteLink}`;
    if (typeof navigator !== "undefined" && navigator.share) {
      try { await navigator.share({ title: "Join Truvi as a Channel Partner", text, url: inviteLink }); return; }
      catch (err) { if ((err as Error)?.name === "AbortError") return; }
    }
    try { await navigator.clipboard.writeText(text); toast.success("Invite copied — share it anywhere"); } catch { /* ignore */ }
  }

  return (
    <Card className={`border-violet-500/25 bg-violet-950/10 text-white ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex flex-wrap items-center gap-2 font-display text-lg font-semibold">
            <Handshake size={18} className="text-violet-300" /> Channel Partner Referral
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-semibold text-amber-300"><IndianRupee size={12} /> ₹{bonus} on 1st transaction</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-300"><BadgePercent size={12} /> + 2% lifetime</span>
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Onboard a Channel Partner with your code. You earn a one-time <b className="text-amber-300">₹{bonus} bonus</b> on their first transaction, plus <b className="text-emerald-300">2% for lifetime</b> on every commission they earn.
          </p>
        </div>
      </div>

      {/* Code + invite */}
      <div className="mt-4 flex flex-col gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-violet-300/80">Your referral code</p>
          <div className="mt-1 flex items-center gap-3">
            <span className="font-display text-2xl font-bold tracking-wider">{data?.referralCode ?? "…"}</span>
            <button onClick={copyLink} title="Copy invite link" className="rounded-lg border border-white/15 bg-white/5 p-2 text-white/70 hover:bg-white/10"><Copy size={15} /></button>
          </div>
          {inviteLink && <p className="mt-2 break-all text-[11px] text-muted-foreground">{inviteLink}</p>}
        </div>
        <Button onClick={shareLink} className="shrink-0 gap-2"><Share2 size={15} /> Refer a Channel Partner</Button>
      </div>

      {/* Summary */}
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <PanelTile icon={<Users size={15} />} label="Referred CPs" value={String(s.referredCount)} />
        <PanelTile icon={<Handshake size={15} />} label="Active" value={String(s.active)} tone="text-emerald-300" />
        <PanelTile icon={<Activity size={15} />} label="Transactions" value={String(s.totalTransactions)} />
        <PanelTile icon={<IndianRupee size={15} />} label="1st-txn Bonus" value={formatINR(s.totalBonus)} tone="text-amber-300" />
        <PanelTile icon={<TrendingUp size={15} />} label="Total Earnings" value={formatINR(s.totalEarnings)} tone="text-emerald-300" />
      </div>

      {/* Per-CP breakdown */}
      <div className="mt-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-foreground/80">Your Referred Channel Partners</h3>
        {loading ? (
          <p className="mt-2 text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No channel partners have joined with your code yet. Share your invite link above to start earning.</p>
        ) : (
          <div className="mt-2 overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-white/[0.03] text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Channel Partner</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Transactions</th>
                  <th className="px-4 py-3 text-right">Their commission</th>
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
                    <td className="px-4 py-3 text-right tabular-nums">{formatINR(r.cpCommission)}</td>
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
