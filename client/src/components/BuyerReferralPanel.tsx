import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { formatINR, formatDate } from "@/lib/utils";
import { Card, Badge } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { Home, BadgePercent, Users, Activity, TrendingUp, Share2, Copy } from "lucide-react";

/**
 * Buyer Referral panel (Ambassador + CP dashboards). Refer a buyer with your
 * code; when they book a property you earn a revenue share of Truvi's sale
 * commission — 35% for an Ambassador, 45% for a Channel Partner.
 */
interface BuyerRow {
  _id: string;
  name: string;
  email: string | null;
  status: "ACTIVE" | "PENDING";
  totalTransactions: number;
  totalSalesValue: number;
  saleCommission: number;
  percentEarned: number;
  incentiveEarned: number;
  lastTransactionAt: string | null;
  createdAt: string;
}
interface BuyerRefData {
  referralCode: string | null;
  ratePercent: number;
  referredBuyers: BuyerRow[];
  summary: { referredCount: number; active: number; totalTransactions: number; totalEarnings: number };
}

type Period = "all" | "this_month" | "last_month";
const PERIODS: { key: Period; label: string }[] = [
  { key: "this_month", label: "This Month" },
  { key: "last_month", label: "Last Month" },
  { key: "all", label: "All Time" },
];

export default function BuyerReferralPanel({ className = "" }: { className?: string }) {
  const [data, setData] = useState<BuyerRefData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>("all");

  useEffect(() => {
    setLoading(true);
    api.get(`/onboarding/buyer-referrals?period=${period}`).then((r) => setData(r.data)).catch(() => setData(null)).finally(() => setLoading(false));
  }, [period]);

  const rate = data?.ratePercent ?? 35;
  const inviteLink = data?.referralCode ? `${window.location.origin}/signup?ref=${data.referralCode}` : "";
  const s = data?.summary ?? { referredCount: 0, active: 0, totalTransactions: 0, totalEarnings: 0 };
  const rows = data?.referredBuyers ?? [];

  async function copyLink() {
    if (!inviteLink) return;
    try { await navigator.clipboard.writeText(inviteLink); toast.success("Buyer invite link copied"); } catch { /* ignore */ }
  }
  async function shareLink() {
    if (!inviteLink || !data?.referralCode) return;
    const text = `Find your dream home on Truvi with my referral code ${data.referralCode}.\n${inviteLink}`;
    if (typeof navigator !== "undefined" && navigator.share) {
      try { await navigator.share({ title: "Buy on Truvi", text, url: inviteLink }); return; }
      catch (err) { if ((err as Error)?.name === "AbortError") return; }
    }
    try { await navigator.clipboard.writeText(text); toast.success("Invite copied — share it anywhere"); } catch { /* ignore */ }
  }

  return (
    <Card className={`border-amber-500/25 bg-amber-950/10 text-white ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex flex-wrap items-center gap-2 font-display text-lg font-semibold">
            <Home size={18} className="text-amber-300" /> Buyer Referral
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-300"><BadgePercent size={12} /> {rate}% of sale commission</span>
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Refer a buyer with your code. When they book a property, you earn <b className="text-emerald-300">{rate}%</b> of Truvi&apos;s sale commission on that booking.
          </p>
        </div>
      </div>

      {/* Code + invite */}
      <div className="mt-4 flex flex-col gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-amber-300/80">Your referral code</p>
          <div className="mt-1 flex items-center gap-3">
            <span className="font-display text-2xl font-bold tracking-wider">{data?.referralCode ?? "…"}</span>
            <button onClick={copyLink} title="Copy invite link" className="rounded-lg border border-white/15 bg-white/5 p-2 text-white/70 hover:bg-white/10"><Copy size={15} /></button>
          </div>
          {inviteLink && <p className="mt-2 break-all text-[11px] text-muted-foreground">{inviteLink}</p>}
        </div>
        <Button onClick={shareLink} className="shrink-0 gap-2"><Share2 size={15} /> Refer a buyer</Button>
      </div>

      {/* Period filter */}
      <div className="mt-4 flex flex-wrap items-center gap-1.5">
        {PERIODS.map((p) => (
          <button
            key={p.key}
            onClick={() => setPeriod(p.key)}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition ${period === p.key ? "bg-amber-500 text-white" : "border border-white/10 text-white/60 hover:bg-white/10"}`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Summary */}
      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <PanelTile icon={<Users size={15} />} label="Referred Buyers" value={String(s.referredCount)} />
        <PanelTile icon={<Activity size={15} />} label="Bookings" value={String(s.totalTransactions)} />
        <PanelTile icon={<BadgePercent size={15} />} label="Your Rate" value={`${rate}%`} tone="text-emerald-300" />
        <PanelTile icon={<TrendingUp size={15} />} label="Total Earnings" value={formatINR(s.totalEarnings)} tone="text-emerald-300" />
      </div>

      {/* Per-buyer breakdown */}
      <div className="mt-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-foreground/80">Your Referred Buyers</h3>
        {loading ? (
          <p className="mt-2 text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No buyers have joined with your code yet. Share your invite link above to start earning.</p>
        ) : (
          <div className="mt-2 overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-white/[0.03] text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Buyer</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Bookings</th>
                  <th className="px-4 py-3 text-right">Booking value</th>
                  <th className="px-4 py-3 text-right">Sale commission</th>
                  <th className="px-4 py-3 text-right">Your {rate}%</th>
                  <th className="px-4 py-3 text-right">Last booking</th>
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
                    <td className="px-4 py-3 text-right tabular-nums">{formatINR(r.saleCommission)}</td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-emerald-300">{formatINR(r.incentiveEarned)}</td>
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
