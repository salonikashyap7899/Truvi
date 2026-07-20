import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { NotificationBell } from "@/components/NotificationBell";
import UserMenu from "@/components/UserMenu";
import { formatINR } from "@/lib/utils";
import { useSocketEvent } from "@/lib/socket";
import { toast } from "sonner";

/* ------------------------------------------------------------------ types */
type Dir = "INFLOW" | "OUTFLOW";
const CATEGORIES = [
  "SALES", "COMMISSION_PAYOUT", "DEVELOPER_PAYMENT", "SUBSCRIPTION",
  "OPERATING_EXPENSE", "SALARY", "MARKETING", "TAX", "REFUND", "OTHER",
] as const;

interface Entry {
  _id: string; direction: Dir; category: string; description: string; party: string | null;
  amountPaise: number; gstPaise: number; tdsPaise: number; settled: boolean;
  dueDate: string | null; createdAt: string;
}
interface Account { _id: string; name: string; balancePaise: number }
interface Loan {
  _id: string; lender: string; principalPaise: number; outstandingPaise: number;
  emiPaise: number; nextDueDate: string | null; status: "ACTIVE" | "CLOSED";
}

const toPaise = (rupees: string) => Math.round((parseFloat(rupees) || 0) * 100);

/* ------------------------------------------------------------------ shared */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] uppercase tracking-wide text-white/45">{label}</span>
      {children}
    </label>
  );
}
const inputCls = "w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-violet-400/50 focus:outline-none";

/* ------------------------------------------------------------------- page */
export default function AdminFinancePage() {
  const [tab, setTab] = useState<"entries" | "accounts" | "loans">("entries");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadAll() {
    try {
      const [e, a, l] = await Promise.all([
        api.get("/finance"), api.get("/finance/accounts"), api.get("/finance/loans"),
      ]);
      setEntries(e.data.entries); setAccounts(a.data.accounts); setLoans(l.data.loans);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to load finance data");
    } finally { setLoading(false); }
  }
  useEffect(() => { loadAll(); }, []);
  // Real-time: reflect writes from any admin session instantly.
  useSocketEvent("finance:update", loadAll);

  const bankBalance = accounts.reduce((s, a) => s + a.balancePaise, 0);
  const receivables = entries.filter((e) => e.direction === "INFLOW" && !e.settled).reduce((s, e) => s + e.amountPaise, 0);
  const payables = entries.filter((e) => e.direction === "OUTFLOW" && !e.settled).reduce((s, e) => s + e.amountPaise, 0);

  if (loading) return <div className="min-h-screen p-10 text-white">Loading finance workspace…</div>;

  return (
    <main className="min-h-screen p-4 text-white md:p-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-widest text-violet-300/70">Truvi · Finance</p>
          <h1 className="mt-1 text-2xl font-semibold md:text-3xl">Finance Workspace</h1>
          <p className="mt-1 text-xs text-white/40">Live ledger · updates the Founder Dashboard in real time</p>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/founder/dashboard" className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-white/70 hover:bg-white/10">← Founder Dashboard</Link>
          <NotificationBell /><UserMenu />
        </div>
      </div>

      <div className="mt-6 grid grid-cols-3 gap-3">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <p className="text-[11px] uppercase tracking-wide text-white/45">Bank Balance</p>
          <p className="mt-1 text-xl font-semibold">{formatINR(bankBalance / 100)}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <p className="text-[11px] uppercase tracking-wide text-white/45">Receivables</p>
          <p className="mt-1 text-xl font-semibold text-emerald-300">{formatINR(receivables / 100)}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <p className="text-[11px] uppercase tracking-wide text-white/45">Payables</p>
          <p className="mt-1 text-xl font-semibold text-amber-300">{formatINR(payables / 100)}</p>
        </div>
      </div>

      <div className="mt-6 flex gap-2">
        {(["entries", "accounts", "loans"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`rounded-full px-4 py-1.5 text-sm capitalize ${tab === t ? "bg-violet-500 text-white" : "border border-white/10 text-white/60 hover:bg-white/10"}`}>{t}</button>
        ))}
      </div>

      <div className="mt-5">
        {tab === "entries" && <EntriesTab entries={entries} onChange={loadAll} />}
        {tab === "accounts" && <AccountsTab accounts={accounts} onChange={loadAll} />}
        {tab === "loans" && <LoansTab loans={loans} onChange={loadAll} />}
      </div>
    </main>
  );
}

/* --------------------------------------------------------------- entries */
function EntriesTab({ entries, onChange }: { entries: Entry[]; onChange: () => void }) {
  const [f, setF] = useState({ direction: "INFLOW" as Dir, category: "SALES", description: "", party: "", amount: "", gst: "", tds: "", dueDate: "", settled: true });
  const [saving, setSaving] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!f.description.trim() || !f.amount) return toast.error("Description and amount are required");
    setSaving(true);
    try {
      await api.post("/finance", {
        direction: f.direction, category: f.category, description: f.description.trim(),
        party: f.party.trim() || null, amountPaise: toPaise(f.amount), gstPaise: toPaise(f.gst), tdsPaise: toPaise(f.tds),
        settled: f.settled, dueDate: f.dueDate ? new Date(f.dueDate).toISOString() : null,
      });
      setF({ ...f, description: "", party: "", amount: "", gst: "", tds: "", dueDate: "" });
      toast.success("Entry added"); onChange();
    } catch (err: any) { toast.error(err?.response?.data?.error || "Failed to add"); }
    finally { setSaving(false); }
  }
  async function toggle(en: Entry) {
    try { await api.patch(`/finance/${en._id}`, { settled: !en.settled }); onChange(); }
    catch (err: any) { toast.error(err?.response?.data?.error || "Failed"); }
  }
  async function remove(id: string) {
    try { await api.delete(`/finance/${id}`); onChange(); }
    catch (err: any) { toast.error(err?.response?.data?.error || "Failed"); }
  }

  return (
    <div className="space-y-5">
      <form onSubmit={add} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <p className="mb-3 text-sm font-semibold">Add finance entry</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Direction">
            <select value={f.direction} onChange={(e) => setF({ ...f, direction: e.target.value as Dir })} className={inputCls}>
              <option value="INFLOW">Inflow (money in)</option><option value="OUTFLOW">Outflow (money out)</option>
            </select>
          </Field>
          <Field label="Category">
            <select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} className={inputCls}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}
            </select>
          </Field>
          <Field label="Description"><input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} className={inputCls} placeholder="e.g. Booking — Prime Estate" /></Field>
          <Field label="Party (optional)"><input value={f.party} onChange={(e) => setF({ ...f, party: e.target.value })} className={inputCls} placeholder="Customer / vendor" /></Field>
          <Field label="Amount (₹)"><input type="number" min="0" step="0.01" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} className={inputCls} placeholder="0.00" /></Field>
          <Field label="GST (₹)"><input type="number" min="0" step="0.01" value={f.gst} onChange={(e) => setF({ ...f, gst: e.target.value })} className={inputCls} placeholder="0.00" /></Field>
          <Field label="TDS (₹)"><input type="number" min="0" step="0.01" value={f.tds} onChange={(e) => setF({ ...f, tds: e.target.value })} className={inputCls} placeholder="0.00" /></Field>
          <Field label="Due date (if unsettled)"><input type="date" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} className={inputCls} /></Field>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <label className="flex items-center gap-2 text-xs text-white/70">
            <input type="checkbox" checked={f.settled} onChange={(e) => setF({ ...f, settled: e.target.checked })} />
            Settled (unchecked = receivable/payable)
          </label>
          <button disabled={saving} className="rounded-full bg-violet-500 px-5 py-2 text-sm font-medium disabled:opacity-50 hover:bg-violet-400">{saving ? "Saving…" : "Add entry"}</button>
        </div>
      </form>

      <div className="overflow-x-auto rounded-2xl border border-white/10">
        <table className="w-full min-w-[720px] text-left text-xs">
          <thead className="bg-white/5 text-white/50">
            <tr>
              <th className="p-3 font-medium">Dir</th><th className="p-3 font-medium">Category</th>
              <th className="p-3 font-medium">Description</th><th className="p-3 font-medium">Party</th>
              <th className="p-3 text-right font-medium">Amount</th><th className="p-3 text-right font-medium">GST</th>
              <th className="p-3 text-right font-medium">TDS</th><th className="p-3 font-medium">Status</th><th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 && <tr><td colSpan={9} className="p-6 text-center text-white/40">No entries yet. Add your first above.</td></tr>}
            {entries.map((en) => (
              <tr key={en._id} className="border-t border-white/5">
                <td className="p-3"><span className={en.direction === "INFLOW" ? "text-emerald-300" : "text-amber-300"}>{en.direction === "INFLOW" ? "▲ In" : "▼ Out"}</span></td>
                <td className="p-3 text-white/60">{en.category.replace(/_/g, " ")}</td>
                <td className="p-3 text-white/85">{en.description}</td>
                <td className="p-3 text-white/60">{en.party || "—"}</td>
                <td className="p-3 text-right text-white/90">{formatINR(en.amountPaise / 100)}</td>
                <td className="p-3 text-right text-white/60">{formatINR(en.gstPaise / 100)}</td>
                <td className="p-3 text-right text-white/60">{formatINR(en.tdsPaise / 100)}</td>
                <td className="p-3">
                  <button onClick={() => toggle(en)} className={`rounded-full px-2 py-0.5 text-[11px] ${en.settled ? "bg-emerald-500/20 text-emerald-200" : "bg-amber-500/20 text-amber-200"}`}>
                    {en.settled ? "Settled" : "Pending"}
                  </button>
                </td>
                <td className="p-3 text-right"><button onClick={() => remove(en._id)} className="text-white/30 hover:text-red-300">✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- accounts */
function AccountsTab({ accounts, onChange }: { accounts: Account[]; onChange: () => void }) {
  const [name, setName] = useState("");
  const [balance, setBalance] = useState("");

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return toast.error("Account name required");
    try { await api.post("/finance/accounts", { name: name.trim(), balancePaise: toPaise(balance) }); setName(""); setBalance(""); toast.success("Account added"); onChange(); }
    catch (err: any) { toast.error(err?.response?.data?.error || "Failed"); }
  }
  async function edit(a: Account) {
    const v = prompt(`Update balance for ${a.name} (₹)`, String(a.balancePaise / 100));
    if (v === null) return;
    try { await api.patch(`/finance/accounts/${a._id}`, { balancePaise: toPaise(v) }); onChange(); }
    catch (err: any) { toast.error(err?.response?.data?.error || "Failed"); }
  }
  async function remove(id: string) {
    try { await api.delete(`/finance/accounts/${id}`); onChange(); }
    catch (err: any) { toast.error(err?.response?.data?.error || "Failed"); }
  }

  return (
    <div className="space-y-5">
      <form onSubmit={add} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <p className="mb-3 text-sm font-semibold">Add bank / cash account</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Account name"><input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="HDFC Current A/C" /></Field>
          <Field label="Current balance (₹)"><input type="number" step="0.01" value={balance} onChange={(e) => setBalance(e.target.value)} className={inputCls} placeholder="0.00" /></Field>
          <div className="flex items-end"><button className="w-full rounded-full bg-violet-500 px-5 py-2 text-sm font-medium hover:bg-violet-400">Add account</button></div>
        </div>
      </form>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {accounts.length === 0 && <p className="text-sm text-white/40">No accounts yet.</p>}
        {accounts.map((a) => (
          <div key={a._id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-start justify-between">
              <p className="text-sm font-medium text-white/85">{a.name}</p>
              <button onClick={() => remove(a._id)} className="text-white/30 hover:text-red-300">✕</button>
            </div>
            <p className="mt-2 text-xl font-semibold">{formatINR(a.balancePaise / 100)}</p>
            <button onClick={() => edit(a)} className="mt-2 text-xs text-violet-300 hover:underline">Update balance</button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- loans */
function LoansTab({ loans, onChange }: { loans: Loan[]; onChange: () => void }) {
  const [f, setF] = useState({ lender: "", principal: "", outstanding: "", emi: "", nextDueDate: "" });

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!f.lender.trim()) return toast.error("Lender required");
    try {
      await api.post("/finance/loans", {
        lender: f.lender.trim(), principalPaise: toPaise(f.principal), outstandingPaise: toPaise(f.outstanding),
        emiPaise: toPaise(f.emi), nextDueDate: f.nextDueDate ? new Date(f.nextDueDate).toISOString() : null,
      });
      setF({ lender: "", principal: "", outstanding: "", emi: "", nextDueDate: "" });
      toast.success("Loan added"); onChange();
    } catch (err: any) { toast.error(err?.response?.data?.error || "Failed"); }
  }
  async function close(l: Loan) {
    try { await api.patch(`/finance/loans/${l._id}`, { status: l.status === "ACTIVE" ? "CLOSED" : "ACTIVE" }); onChange(); }
    catch (err: any) { toast.error(err?.response?.data?.error || "Failed"); }
  }
  async function remove(id: string) {
    try { await api.delete(`/finance/loans/${id}`); onChange(); }
    catch (err: any) { toast.error(err?.response?.data?.error || "Failed"); }
  }

  return (
    <div className="space-y-5">
      <form onSubmit={add} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <p className="mb-3 text-sm font-semibold">Add loan / EMI</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="Lender"><input value={f.lender} onChange={(e) => setF({ ...f, lender: e.target.value })} className={inputCls} placeholder="SBI" /></Field>
          <Field label="Principal (₹)"><input type="number" step="0.01" value={f.principal} onChange={(e) => setF({ ...f, principal: e.target.value })} className={inputCls} placeholder="0.00" /></Field>
          <Field label="Outstanding (₹)"><input type="number" step="0.01" value={f.outstanding} onChange={(e) => setF({ ...f, outstanding: e.target.value })} className={inputCls} placeholder="0.00" /></Field>
          <Field label="EMI / mo (₹)"><input type="number" step="0.01" value={f.emi} onChange={(e) => setF({ ...f, emi: e.target.value })} className={inputCls} placeholder="0.00" /></Field>
          <Field label="Next due date"><input type="date" value={f.nextDueDate} onChange={(e) => setF({ ...f, nextDueDate: e.target.value })} className={inputCls} /></Field>
        </div>
        <div className="mt-3 text-right"><button className="rounded-full bg-violet-500 px-5 py-2 text-sm font-medium hover:bg-violet-400">Add loan</button></div>
      </form>
      <div className="overflow-x-auto rounded-2xl border border-white/10">
        <table className="w-full min-w-[640px] text-left text-xs">
          <thead className="bg-white/5 text-white/50">
            <tr><th className="p-3 font-medium">Lender</th><th className="p-3 text-right font-medium">Outstanding</th><th className="p-3 text-right font-medium">EMI</th><th className="p-3 font-medium">Next due</th><th className="p-3 font-medium">Status</th><th className="p-3" /></tr>
          </thead>
          <tbody>
            {loans.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-white/40">No loans yet.</td></tr>}
            {loans.map((l) => (
              <tr key={l._id} className="border-t border-white/5">
                <td className="p-3 text-white/85">{l.lender}</td>
                <td className="p-3 text-right text-white/90">{formatINR(l.outstandingPaise / 100)}</td>
                <td className="p-3 text-right text-white/60">{formatINR(l.emiPaise / 100)}</td>
                <td className="p-3 text-white/60">{l.nextDueDate ? new Date(l.nextDueDate).toLocaleDateString("en-IN") : "—"}</td>
                <td className="p-3"><button onClick={() => close(l)} className={`rounded-full px-2 py-0.5 text-[11px] ${l.status === "ACTIVE" ? "bg-emerald-500/20 text-emerald-200" : "bg-white/10 text-white/50"}`}>{l.status}</button></td>
                <td className="p-3 text-right"><button onClick={() => remove(l._id)} className="text-white/30 hover:text-red-300">✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
