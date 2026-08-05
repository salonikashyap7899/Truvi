import { useEffect, useMemo, useState } from "react";
import { Wallet, Building2, Handshake, Clock, CheckCircle2, Search, X, Loader2, IndianRupee, Settings2, Plus, Trash2, Check, Users2, MapPin, CalendarCheck2 } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { formatINR, formatDate } from "@/lib/utils";

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

export default function AdminCommissionsPage() {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [manageId, setManageId] = useState<string | null>(null);

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
                      onClick={() => setManageId(p.id)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/10"
                    >
                      <Settings2 size={13} /> Manage &amp; Pay
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {manageId && (
        <PartnerDetailModal
          partnerId={manageId}
          onClose={() => setManageId(null)}
          onChanged={load}
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

interface ManualCommission {
  _id: string;
  label: string | null;
  bookingValue: number | null;
  percent: number | null;
  amount: number;
  status: "PENDING" | "APPROVED" | "PAID";
  paidAmount: number | null;
  paymentDate: string | null;
  transactionRef: string | null;
  paymentMode: string | null;
  notes: string | null;
  createdAt: string;
}
interface PartnerDetail {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  payoutDetails: PayoutDetails | null;
  stats: { totalLeads: number; siteVisits: number; bookings: number };
  wallet: { developerCommission: number; saleCommission: number; totalEarnings: number; paid: number; pending: number; nextPayable: number };
  manualCommissions: ManualCommission[];
}

const STATUS_STYLES: Record<ManualCommission["status"], string> = {
  PENDING: "bg-amber-500/15 text-amber-300",
  APPROVED: "bg-sky-500/15 text-sky-300",
  PAID: "bg-emerald-500/15 text-emerald-300",
};

function PartnerDetailModal({ partnerId, onClose, onChanged }: { partnerId: string; onClose: () => void; onChanged: () => void }) {
  const [d, setD] = useState<PartnerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ label: "", bookingValue: "", percent: "", amount: "", notes: "" });
  const [payFor, setPayFor] = useState<string | null>(null);
  const [payForm, setPayForm] = useState({ paidAmount: "", paymentDate: new Date().toISOString().slice(0, 10), transactionRef: "", paymentMode: "BANK_TRANSFER", notes: "" });

  async function load() {
    try {
      const res = await api.get(`/admin/commissions/partners/${partnerId}`);
      setD(res.data.detail);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to load partner");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [partnerId]);

  // A ready-made amount hint when admin enters booking value + %.
  const suggested = (() => {
    const bv = Number(form.bookingValue), pct = Number(form.percent);
    return bv > 0 && pct > 0 ? Math.round(bv * pct) / 100 : null;
  })();

  async function addCommission(e: React.FormEvent) {
    e.preventDefault();
    const amount = Number(form.amount || suggested || 0);
    if (!(amount > 0)) { toast.error("Enter the commission amount"); return; }
    setBusy("add");
    try {
      const res = await api.post("/admin/commissions/manual", {
        cpId: partnerId,
        amount,
        percent: form.percent ? Number(form.percent) : undefined,
        bookingValue: form.bookingValue ? Number(form.bookingValue) : undefined,
        label: form.label.trim() || undefined,
        notes: form.notes.trim() || undefined,
      });
      setD(res.data.detail);
      setForm({ label: "", bookingValue: "", percent: "", amount: "", notes: "" });
      setShowAdd(false);
      onChanged();
      toast.success("Commission added");
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to add");
    } finally { setBusy(null); }
  }

  async function act(id: string, path: string, body?: any, okMsg?: string) {
    setBusy(id);
    try {
      const res = await api.post(`/admin/commissions/manual/${id}/${path}`, body ?? {});
      setD(res.data.detail);
      onChanged();
      if (okMsg) toast.success(okMsg);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Action failed");
    } finally { setBusy(null); }
  }

  async function removeCommission(id: string) {
    if (!window.confirm("Delete this commission?")) return;
    setBusy(id);
    try {
      const res = await api.delete(`/admin/commissions/manual/${id}`);
      setD(res.data.detail);
      onChanged();
      toast.success("Deleted");
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to delete");
    } finally { setBusy(null); }
  }

  async function submitPay(id: string, amount: number) {
    const paidAmount = Number(payForm.paidAmount || amount);
    if (!(paidAmount > 0)) { toast.error("Enter a valid amount"); return; }
    await act(id, "pay", {
      paidAmount,
      paymentDate: payForm.paymentDate,
      transactionRef: payForm.transactionRef.trim() || undefined,
      paymentMode: payForm.paymentMode,
      notes: payForm.notes.trim() || undefined,
    }, "Marked as paid");
    setPayFor(null);
    setPayForm({ paidAmount: "", paymentDate: new Date().toISOString().slice(0, 10), transactionRef: "", paymentMode: "BANK_TRANSFER", notes: "" });
  }

  const input = "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-[var(--trust)]/50";
  const pd = d?.payoutDetails;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0e1116] text-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {loading || !d ? (
          <div className="grid h-40 place-items-center text-muted-foreground"><Loader2 size={20} className="animate-spin" /></div>
        ) : (
          <>
            <div className="flex items-start justify-between border-b border-white/10 px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold">{d.name} <span className="ml-1 rounded-full bg-white/10 px-2 py-0.5 text-[11px]">{d.role}</span></h2>
                <p className="mt-0.5 text-sm text-muted-foreground">{d.email}{d.phone ? ` · ${d.phone}` : ""}</p>
              </div>
              <button onClick={onClose} className="rounded-full p-1 text-white/60 hover:bg-white/10 hover:text-white"><X size={18} /></button>
            </div>
            <div className="overflow-y-auto px-6 py-5">

            {/* CRM stats */}
            <div className="mt-4 grid grid-cols-3 gap-3">
              <StatBox icon={<Users2 size={15} />} label="Total Leads" value={String(d.stats.totalLeads)} />
              <StatBox icon={<MapPin size={15} />} label="Site Visits" value={String(d.stats.siteVisits)} />
              <StatBox icon={<CalendarCheck2 size={15} />} label="Bookings" value={String(d.stats.bookings)} />
            </div>

            {/* Wallet totals */}
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              <MiniStat label="Developer 2%" value={formatINR(d.wallet.developerCommission)} />
              <MiniStat label="Sale Commission" value={formatINR(d.wallet.saleCommission)} />
              <MiniStat label="Total Earned" value={formatINR(d.wallet.totalEarnings)} />
              <MiniStat label="Paid" value={formatINR(d.wallet.paid)} tone="emerald" />
              <MiniStat label="Pending" value={formatINR(d.wallet.pending)} tone="amber" />
              <MiniStat label="Next Payable" value={formatINR(d.wallet.nextPayable)} tone="amber" />
            </div>

            {/* Bank details */}
            <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.03] p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Bank / UPI Details</p>
              {pd && (pd.accountNumber || pd.upiId) ? (
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                  {pd.accountHolderName && <Row label="Account Holder" value={pd.accountHolderName} />}
                  {pd.bankName && <Row label="Bank" value={pd.bankName} />}
                  {pd.accountNumber && <Row label="Account No." value={pd.accountNumber} mono />}
                  {pd.ifsc && <Row label="IFSC" value={pd.ifsc} mono />}
                  {pd.upiId && <Row label="UPI ID" value={pd.upiId} mono />}
                  {pd.method && <Row label="Preferred" value={pd.method === "UPI" ? "UPI" : "Bank Transfer"} />}
                </dl>
              ) : <p className="mt-1.5 text-xs text-amber-300/80">This partner hasn't added bank / UPI details yet.</p>}
            </div>

            {/* Commissions */}
            <div className="mt-5 flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-foreground/80">Commissions</h3>
              <button onClick={() => setShowAdd((v) => !v)} className="inline-flex items-center gap-1.5 rounded-full bg-[var(--trust)] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90">
                <Plus size={13} /> Add Commission
              </button>
            </div>

            {showAdd && (
              <form onSubmit={addCommission} className="mt-3 grid grid-cols-1 gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4 sm:grid-cols-2">
                <Field label="Label / Booking"><input className={input} value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="e.g. Green Valley — A-101" /></Field>
                <Field label="Booking Value (₹)"><input type="number" className={input} value={form.bookingValue} onChange={(e) => setForm({ ...form, bookingValue: e.target.value })} placeholder="Optional" /></Field>
                <Field label="Commission %"><input type="number" className={input} value={form.percent} onChange={(e) => setForm({ ...form, percent: e.target.value })} placeholder="e.g. 40" /></Field>
                <Field label="Commission Amount (₹)"><input type="number" className={input} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder={suggested ? String(suggested) : "Amount to pay CP"} /></Field>
                <div className="sm:col-span-2"><Field label="Notes"><input className={input} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional" /></Field></div>
                <div className="flex items-center gap-3 sm:col-span-2">
                  <button type="submit" disabled={busy === "add"} className="inline-flex items-center gap-2 rounded-full bg-emerald-500 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-400 disabled:opacity-60">
                    {busy === "add" && <Loader2 size={14} className="animate-spin" />} Save Commission
                  </button>
                  {suggested && !form.amount && <span className="text-xs text-muted-foreground">Suggested: {formatINR(suggested)} ({form.percent}% × {formatINR(Number(form.bookingValue))})</span>}
                </div>
              </form>
            )}

            <div className="mt-3 space-y-2">
              {d.manualCommissions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No commissions added yet. When a lead reaches <b>Booking Confirmed</b>, add the commission here.</p>
              ) : d.manualCommissions.map((c) => (
                <div key={c._id} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">{c.label || "Sale commission"} <span className={`ml-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLES[c.status]}`}>{c.status}</span></p>
                      <p className="text-xs text-muted-foreground">
                        {formatINR(c.amount)}
                        {c.percent ? ` · ${c.percent}%` : ""}{c.bookingValue ? ` of ${formatINR(c.bookingValue)}` : ""} · added {formatDate(c.createdAt)}
                        {c.status === "PAID" && c.paymentDate ? ` · paid ${formatDate(c.paymentDate)}${c.transactionRef ? ` (Ref ${c.transactionRef})` : ""}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {c.status === "PENDING" && (
                        <button onClick={() => act(c._id, "approve", {}, "Approved")} disabled={busy === c._id} className="inline-flex items-center gap-1 rounded-lg border border-sky-400/40 px-2.5 py-1.5 text-xs font-semibold text-sky-300 hover:bg-sky-500/10 disabled:opacity-60"><Check size={12} /> Approve</button>
                      )}
                      {c.status !== "PAID" && (
                        <button onClick={() => { setPayFor(payFor === c._id ? null : c._id); setPayForm((f) => ({ ...f, paidAmount: String(c.amount) })); }} disabled={busy === c._id} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"><IndianRupee size={12} /> Mark Paid</button>
                      )}
                      {c.status !== "PAID" && (
                        <button onClick={() => removeCommission(c._id)} disabled={busy === c._id} title="Delete" className="rounded-lg border border-rose-400/40 p-1.5 text-rose-300 hover:bg-rose-500/10 disabled:opacity-60"><Trash2 size={12} /></button>
                      )}
                    </div>
                  </div>

                  {payFor === c._id && c.status !== "PAID" && (
                    <div className="mt-3 grid grid-cols-1 gap-2 border-t border-white/10 pt-3 sm:grid-cols-2">
                      <Field label="Amount Paid (₹)"><input type="number" className={input} value={payForm.paidAmount} onChange={(e) => setPayForm({ ...payForm, paidAmount: e.target.value })} /></Field>
                      <Field label="Payment Date"><input type="date" className={input} value={payForm.paymentDate} onChange={(e) => setPayForm({ ...payForm, paymentDate: e.target.value })} /></Field>
                      <Field label="Transaction Ref / UTR"><input className={input} value={payForm.transactionRef} onChange={(e) => setPayForm({ ...payForm, transactionRef: e.target.value })} placeholder="UTR / UPI ref" /></Field>
                      <Field label="Payment Mode">
                        <select className={input} value={payForm.paymentMode} onChange={(e) => setPayForm({ ...payForm, paymentMode: e.target.value })}>
                          {MODES.map((m) => <option key={m} value={m} className="bg-[#0e1116]">{m.replace(/_/g, " ")}</option>)}
                        </select>
                      </Field>
                      <div className="flex justify-end gap-2 sm:col-span-2">
                        <button onClick={() => setPayFor(null)} className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-white/70 hover:bg-white/10">Cancel</button>
                        <button onClick={() => submitPay(c._id, c.amount)} disabled={busy === c._id} className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-400 disabled:opacity-60">{busy === c._id && <Loader2 size={12} className="animate-spin" />} Confirm Payment</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function StatBox({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">{icon} {label}</p>
      <p className="mt-1 font-display text-xl font-semibold">{value}</p>
    </div>
  );
}
