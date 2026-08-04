import { useEffect, useMemo, useState } from "react";
import { Wallet, Building2, Handshake, Clock, CheckCircle2, Search, X, Loader2, IndianRupee } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { formatINR } from "@/lib/utils";

interface PayoutDetails {
  accountHolderName?: string;
  accountNumber?: string;
  ifsc?: string;
  bankName?: string;
  upiId?: string;
  method?: "BANK_TRANSFER" | "UPI";
  updatedAt?: string;
}

interface Partner {
  id: string;
  name: string;
  email: string;
  role: string;
  developerCommission: number;
  saleCommission: number;
  total: number;
  paid: number;
  pending: number;
  nextPayable: number;
  payoutDetails: PayoutDetails | null;
}

const MODES = ["BANK_TRANSFER", "UPI", "CASH", "CHEQUE", "OTHER"] as const;
type Mode = (typeof MODES)[number];

export default function AdminCommissionsPage() {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [payTarget, setPayTarget] = useState<Partner | null>(null);

  async function load() {
    try {
      const res = await api.get("/admin/commissions/partners");
      setPartners(res.data.partners ?? []);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to load commissions");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const totals = useMemo(() => {
    return partners.reduce(
      (acc, p) => ({
        developer: acc.developer + p.developerCommission,
        sale: acc.sale + p.saleCommission,
        total: acc.total + p.total,
        paid: acc.paid + p.paid,
        pending: acc.pending + p.pending,
      }),
      { developer: 0, sale: 0, total: 0, paid: 0, pending: 0 },
    );
  }, [partners]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return partners;
    return partners.filter((p) => [p.name, p.email, p.role].some((f) => f?.toLowerCase().includes(q)));
  }, [partners, query]);

  return (
    <main className="min-h-screen bg-background p-6 text-white md:p-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 font-display text-2xl font-semibold">
            <Wallet size={22} className="text-emerald-400" /> Channel Partner Commissions
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Developer onboarding (2% recurring) + property-sale commission, in one ledger. Pay out and pending updates instantly.
          </p>
        </div>
      </div>

      {/* KPI strip */}
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi icon={<Building2 size={16} />} label="Developer Commission" value={formatINR(totals.developer)} tone="sky" />
        <Kpi icon={<Handshake size={16} />} label="Sale Commission" value={formatINR(totals.sale)} tone="violet" />
        <Kpi icon={<Wallet size={16} />} label="Total Earned" value={formatINR(totals.total)} tone="emerald" />
        <Kpi icon={<CheckCircle2 size={16} />} label="Paid Out" value={formatINR(totals.paid)} tone="emerald" />
        <Kpi icon={<Clock size={16} />} label="Pending" value={formatINR(totals.pending)} tone="amber" />
      </div>

      {/* Search */}
      <div className="mt-6 flex items-center gap-2">
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search partner name, email…"
            className="w-72 rounded-full border border-white/10 bg-white/5 py-1.5 pl-9 pr-3 text-xs text-white outline-none focus:border-emerald-400/50"
          />
        </div>
        <span className="ml-auto text-xs text-muted-foreground">{filtered.length} partner{filtered.length === 1 ? "" : "s"}</span>
      </div>

      <div className="mt-4 overflow-x-auto rounded-lg border border-white/10">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="glass text-muted-foreground">
            <tr>
              <th className="p-3 text-left">Partner</th>
              <th className="p-3 text-right">Developer (2%)</th>
              <th className="p-3 text-right">Sale</th>
              <th className="p-3 text-right">Total</th>
              <th className="p-3 text-right">Paid</th>
              <th className="p-3 text-right">Pending</th>
              <th className="p-3 text-left">Payout To</th>
              <th className="p-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">No channel partners found.</td></tr>
            ) : (
              filtered.map((p) => (
                <tr key={p.id} className="border-t border-white/10 transition hover:bg-white/[0.03]">
                  <td className="p-3">
                    <div className="font-medium text-white">{p.name}</div>
                    <div className="text-xs text-muted-foreground">{p.email} · {p.role}</div>
                  </td>
                  <td className="p-3 text-right tabular-nums text-sky-300">{formatINR(p.developerCommission)}</td>
                  <td className="p-3 text-right tabular-nums text-violet-300">{formatINR(p.saleCommission)}</td>
                  <td className="p-3 text-right font-medium tabular-nums">{formatINR(p.total)}</td>
                  <td className="p-3 text-right tabular-nums text-emerald-300">{formatINR(p.paid)}</td>
                  <td className="p-3 text-right font-semibold tabular-nums text-amber-300">{formatINR(p.pending)}</td>
                  <td className="p-3">
                    {p.payoutDetails && (p.payoutDetails.accountNumber || p.payoutDetails.upiId) ? (
                      <div className="text-xs">
                        <div className="text-white/80">{p.payoutDetails.method === "UPI" ? "UPI" : "Bank"}</div>
                        <div className="font-mono text-muted-foreground">
                          {p.payoutDetails.method === "UPI"
                            ? p.payoutDetails.upiId
                            : p.payoutDetails.accountNumber ? `••••${p.payoutDetails.accountNumber.slice(-4)}` : "—"}
                        </div>
                      </div>
                    ) : (
                      <span className="text-xs text-amber-300/70">Not added</span>
                    )}
                  </td>
                  <td className="p-3 text-right">
                    <button
                      onClick={() => setPayTarget(p)}
                      disabled={p.pending <= 0}
                      className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/90 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/40"
                    >
                      <IndianRupee size={13} /> Mark as Paid
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {payTarget && (
        <PayModal
          partner={payTarget}
          onClose={() => setPayTarget(null)}
          onPaid={(updated) => {
            setPartners((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
            setPayTarget(null);
          }}
        />
      )}
    </main>
  );
}

function Kpi({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: "sky" | "violet" | "emerald" | "amber" }) {
  const toneCls = {
    sky: "text-sky-300",
    violet: "text-violet-300",
    emerald: "text-emerald-300",
    amber: "text-amber-300",
  }[tone];
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">{icon} {label}</p>
      <p className={`mt-1 font-display text-xl font-semibold ${toneCls}`}>{value}</p>
    </div>
  );
}

function PayModal({ partner, onClose, onPaid }: { partner: Partner; onClose: () => void; onPaid: (p: Partner) => void }) {
  const [amount, setAmount] = useState<string>(String(partner.pending || ""));
  const [mode, setMode] = useState<Mode>(partner.payoutDetails?.method ?? "BANK_TRANSFER");
  const [transactionId, setTransactionId] = useState("");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    if (amt > partner.pending + 0.5) {
      toast.error(`Amount exceeds pending balance of ${formatINR(partner.pending)}`);
      return;
    }
    setSaving(true);
    try {
      const res = await api.post("/admin/commissions/pay", {
        cpId: partner.id,
        amount: amt,
        mode,
        transactionId: transactionId.trim() || undefined,
        paymentDate,
        notes: notes.trim() || undefined,
      });
      const w = res.data.wallet;
      toast.success(`Recorded ${formatINR(amt)} payout to ${partner.name}`);
      onPaid({
        ...partner,
        paid: w.paid,
        pending: w.pending,
        nextPayable: w.nextPayable,
        total: w.totalEarnings,
        developerCommission: w.developerCommission,
        saleCommission: w.saleCommission,
      });
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to record payout");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0e1116] p-6 text-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold">Record Payout</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">{partner.name} · {partner.email}</p>
          </div>
          <button onClick={onClose} className="rounded-full p-1 text-white/60 hover:bg-white/10 hover:text-white"><X size={18} /></button>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <MiniStat label="Total" value={formatINR(partner.total)} />
          <MiniStat label="Paid" value={formatINR(partner.paid)} tone="emerald" />
          <MiniStat label="Next Payable" value={formatINR(partner.nextPayable)} tone="amber" />
        </div>

        {/* Payout details — the admin reviews these before releasing money. */}
        <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.03] p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Payout Details</p>
          {partner.payoutDetails && (partner.payoutDetails.accountNumber || partner.payoutDetails.upiId) ? (
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
              {partner.payoutDetails.accountHolderName && <Row label="Account Holder" value={partner.payoutDetails.accountHolderName} />}
              {partner.payoutDetails.bankName && <Row label="Bank" value={partner.payoutDetails.bankName} />}
              {partner.payoutDetails.accountNumber && <Row label="Account No." value={partner.payoutDetails.accountNumber} mono />}
              {partner.payoutDetails.ifsc && <Row label="IFSC" value={partner.payoutDetails.ifsc} mono />}
              {partner.payoutDetails.upiId && <Row label="UPI ID" value={partner.payoutDetails.upiId} mono />}
              {partner.payoutDetails.method && <Row label="Preferred" value={partner.payoutDetails.method === "UPI" ? "UPI" : "Bank Transfer"} />}
            </dl>
          ) : (
            <p className="mt-1.5 text-xs text-amber-300/80">This partner hasn't added bank / UPI details yet.</p>
          )}
        </div>

        <form onSubmit={submit} className="mt-4 space-y-3">
          <Field label="Amount (₹)">
            <input
              type="number"
              min="1"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-emerald-400/50"
            />
          </Field>
          <Field label="Payment Mode">
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as Mode)}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-emerald-400/50"
            >
              {MODES.map((m) => (
                <option key={m} value={m} className="bg-[#0e1116]">{m.replace(/_/g, " ")}</option>
              ))}
            </select>
          </Field>
          <Field label="Transaction ID">
            <input
              value={transactionId}
              onChange={(e) => setTransactionId(e.target.value)}
              placeholder="UTR / UPI ref / cheque no."
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-emerald-400/50"
            />
          </Field>
          <Field label="Payment Date">
            <input
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-emerald-400/50"
            />
          </Field>
          <Field label="Notes">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Optional"
              className="w-full resize-none rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-emerald-400/50"
            />
          </Field>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="rounded-full border border-white/10 px-4 py-2 text-sm text-white/70 hover:bg-white/10">Cancel</button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-full bg-emerald-500 px-5 py-2 text-sm font-semibold text-white transition hover:bg-emerald-400 disabled:opacity-60"
            >
              {saving && <Loader2 size={14} className="animate-spin" />} Confirm Payout
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={`text-right text-white/90 ${mono ? "font-mono" : ""}`}>{value}</dd>
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone?: "emerald" | "amber" }) {
  const cls = tone === "emerald" ? "text-emerald-300" : tone === "amber" ? "text-amber-300" : "text-white";
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-0.5 text-sm font-semibold ${cls}`}>{value}</p>
    </div>
  );
}
