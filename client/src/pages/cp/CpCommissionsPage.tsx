import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { formatINR, formatDate } from "@/lib/utils";
import { CpHubNav } from "@/components/CpHubNav";
import UserMenu from "@/components/UserMenu";
import { Wallet, Building2, Handshake, Clock, CheckCircle2, Receipt } from "lucide-react";

interface Wallet {
  developerCommission: number;
  saleCommission: number;
  totalEarnings: number;
  paid: number;
  pending: number;
  history: { _id: string; type: "DEVELOPER_ONBOARDING" | "PROPERTY_SALE"; amount: number; date: string; description: string; status: string }[];
  payments: { _id: string; amount: number; mode: string; transactionId: string | null; paymentDate: string; notes: string | null }[];
}

export default function CpCommissionsPage() {
  const [w, setW] = useState<Wallet | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get("/commissions/wallet");
        setW(res.data);
      } catch (err: any) {
        toast.error(err?.response?.data?.error || "Failed to load commissions");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <main className="min-h-screen p-6 text-white md:p-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold"><Wallet size={22} className="text-[var(--trust)]" /> Commission Wallet</h1>
          <p className="mt-1 text-sm text-muted-foreground">Developer onboarding (2% recurring) + property-sale commission — in one ledger.</p>
        </div>
        <UserMenu />
      </div>
      <CpHubNav />

      {loading ? (
        <p className="mt-10 text-sm text-muted-foreground">Loading…</p>
      ) : !w ? (
        <p className="mt-10 text-sm text-muted-foreground">No commission data yet.</p>
      ) : (
        <>
          {/* Summary tiles */}
          <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-3">
            <Tile icon={<Wallet size={16} />} label="Total Earnings" value={formatINR(w.totalEarnings)} accent />
            <Tile icon={<Building2 size={16} />} label="Developer Commission" value={formatINR(w.developerCommission)} sub="2% recurring" />
            <Tile icon={<Handshake size={16} />} label="Sale Commission" value={formatINR(w.saleCommission)} />
            <Tile icon={<Clock size={16} />} label="Pending" value={formatINR(w.pending)} tone="amber" />
            <Tile icon={<CheckCircle2 size={16} />} label="Paid" value={formatINR(w.paid)} tone="emerald" />
          </div>

          {/* Earnings history */}
          <section className="mt-8">
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-foreground/80"><Receipt size={15} /> Commission History</h2>
            {w.history.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">No commission earned yet.</p>
            ) : (
              <div className="mt-3 overflow-x-auto rounded-2xl border border-white/10">
                <table className="w-full min-w-[560px] text-sm">
                  <thead className="bg-white/[0.03] text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3">Description</th>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {w.history.map((h) => (
                      <tr key={h._id}>
                        <td className="px-4 py-3">
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${h.type === "DEVELOPER_ONBOARDING" ? "bg-blue-500/15 text-blue-300" : "bg-emerald-500/15 text-emerald-300"}`}>
                            {h.type === "DEVELOPER_ONBOARDING" ? "Developer 2%" : "Property Sale"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-foreground/90">{h.description}</td>
                        <td className="px-4 py-3 text-muted-foreground">{formatDate(h.date)}</td>
                        <td className="px-4 py-3 text-right font-semibold">{formatINR(h.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Payments received */}
          <section className="mt-8">
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-foreground/80"><CheckCircle2 size={15} /> Payments Received</h2>
            {w.payments.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">No payouts yet. Pending commission is paid out by the Truvi team.</p>
            ) : (
              <div className="mt-3 overflow-x-auto rounded-2xl border border-white/10">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="bg-white/[0.03] text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3 text-right">Amount</th>
                      <th className="px-4 py-3">Mode</th>
                      <th className="px-4 py-3">Transaction ID</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {w.payments.map((p) => (
                      <tr key={p._id}>
                        <td className="px-4 py-3 text-muted-foreground">{formatDate(p.paymentDate)}</td>
                        <td className="px-4 py-3 text-right font-semibold">{formatINR(p.amount)}</td>
                        <td className="px-4 py-3">{p.mode.replace(/_/g, " ")}</td>
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{p.transactionId || "—"}</td>
                        <td className="px-4 py-3"><span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-300">Paid</span></td>
                        <td className="px-4 py-3 text-muted-foreground">{p.notes || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}

function Tile({ icon, label, value, sub, accent, tone }: { icon: React.ReactNode; label: string; value: string; sub?: string; accent?: boolean; tone?: "amber" | "emerald" }) {
  const valueCls = tone === "amber" ? "text-amber-300" : tone === "emerald" ? "text-emerald-300" : accent ? "text-gradient-trust" : "text-white";
  return (
    <div className={`rounded-2xl border p-5 ${accent ? "border-[var(--trust)]/30 bg-[var(--trust)]/[0.06]" : "border-white/10 bg-white/[0.03]"}`}>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">{icon} {label}</p>
      <p className={`mt-1 font-display text-2xl font-semibold ${valueCls}`}>{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}
