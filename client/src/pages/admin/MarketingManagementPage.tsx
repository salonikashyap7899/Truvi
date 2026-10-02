import { useEffect, useMemo, useState } from "react";
import { Megaphone, Search, Plus, ShieldCheck, Ban, Trash2, Receipt, X } from "lucide-react";
import { api } from "@/lib/api";
import { Badge, Card, Input, Label, Textarea } from "@/components/ui/primitives";
import { toast } from "sonner";

const inr = (paise: number) => "₹" + (paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 });
const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—");

interface AccessRow {
  _id: string; userId: string; status: "ACTIVE" | "INACTIVE"; packageName: string;
  budgetPaise: number; validFrom: string | null; validUntil: string | null; notes: string | null;
  user: { name: string | null; email: string | null; role: string | null };
}
interface PaymentRow {
  _id: string; userId: string; partnerName: string; packageName: string;
  amountPaise: number; gstPercent: number; gstPaise: number; totalPaise: number;
  method: string; reference: string | null; status: string; paidAt: string; createdAt: string;
  user: { name: string | null; email: string | null };
}
interface UserRow { _id: string; name: string; email: string; role: string; }

export default function MarketingManagementPage() {
  const [access, setAccess] = useState<AccessRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [tab, setTab] = useState<"access" | "payments">("access");
  const [grantOpen, setGrantOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [query, setQuery] = useState("");

  function load() {
    api.get("/admin/marketing/access").then((r) => setAccess(r.data.access ?? [])).catch(() => {});
    api.get("/admin/marketing/payments").then((r) => setPayments(r.data.payments ?? [])).catch(() => {});
    api.get("/admin/users").then((r) => setUsers(r.data.users ?? [])).catch(() => {});
  }
  useEffect(() => { load(); }, []);

  const totals = useMemo(() => {
    const activeGrants = access.filter((a) => a.status === "ACTIVE").length;
    const budget = access.reduce((s, a) => s + a.budgetPaise, 0);
    const collected = payments.filter((p) => p.status === "VERIFIED").reduce((s, p) => s + p.totalPaise, 0);
    const gst = payments.filter((p) => p.status === "VERIFIED").reduce((s, p) => s + p.gstPaise, 0);
    return { activeGrants, budget, collected, gst };
  }, [access, payments]);

  async function setStatus(row: AccessRow, status: "ACTIVE" | "INACTIVE") {
    try { await api.patch(`/admin/marketing/access/${row.userId}`, { status }); toast.success(status === "ACTIVE" ? "Activated" : "Deactivated"); load(); }
    catch { toast.error("Failed"); }
  }
  async function revoke(row: AccessRow) {
    if (!confirm(`Revoke marketing access for ${row.user.name || row.user.email}? This is immediate.`)) return;
    try { await api.delete(`/admin/marketing/access/${row.userId}`); toast.success("Access revoked"); load(); }
    catch { toast.error("Failed"); }
  }

  const filtered = access.filter((a) => {
    const q = query.toLowerCase();
    return !q || (a.user.name || "").toLowerCase().includes(q) || (a.user.email || "").toLowerCase().includes(q);
  });

  return (
    <div className="min-h-screen bg-[#05070d] text-white">
      <div className="mx-auto max-w-6xl px-4 pb-24 pt-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold sm:text-3xl"><Megaphone /> Marketing Management</h1>
            <p className="mt-1 text-sm text-white/50">Grant marketing access, record direct/offline payments (GST charged), and manage partner budgets, leads &amp; campaigns.</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setGrantOpen(true)} className="inline-flex items-center gap-1 rounded-lg bg-sky-500 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-400"><Plus size={16} /> Grant access</button>
            <button onClick={() => setPayOpen(true)} className="inline-flex items-center gap-1 rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-400"><Receipt size={16} /> Record payment</button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Mini label="Active grants" value={String(totals.activeGrants)} />
          <Mini label="Total budget" value={inr(totals.budget)} />
          <Mini label="Payments collected" value={inr(totals.collected)} />
          <Mini label="GST collected" value={inr(totals.gst)} />
        </div>

        <div className="mt-6 flex gap-2">
          <Tab active={tab === "access"} onClick={() => setTab("access")}>Access ({access.length})</Tab>
          <Tab active={tab === "payments"} onClick={() => setTab("payments")}>Payments ({payments.length})</Tab>
        </div>

        {tab === "access" && (
          <>
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3">
              <Search size={16} className="text-white/40" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search partner…" className="h-10 w-full bg-transparent text-sm outline-none placeholder:text-white/40" />
            </div>
            <Card className="mt-3 overflow-hidden p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead><tr className="text-xs uppercase tracking-wide text-white/40">
                    {["Partner", "Package", "Budget", "Valid till", "Status", ""].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {filtered.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-white/40">No access grants yet.</td></tr>}
                    {filtered.map((a) => (
                      <tr key={a._id} className="border-t border-white/5">
                        <td className="px-3 py-2">
                          <div className="font-medium">{a.user.name || "—"}</div>
                          <div className="text-xs text-white/40">{a.user.email} · {a.user.role}</div>
                        </td>
                        <td className="px-3 py-2 text-white/70">{a.packageName}</td>
                        <td className="px-3 py-2">{inr(a.budgetPaise)}</td>
                        <td className="px-3 py-2 text-white/60">{fmtDate(a.validUntil)}</td>
                        <td className="px-3 py-2"><Badge variant={a.status === "ACTIVE" ? "success" : "warning"}>{a.status}</Badge></td>
                        <td className="px-3 py-2">
                          <div className="flex justify-end gap-1">
                            {a.status === "ACTIVE" ? (
                              <button onClick={() => setStatus(a, "INACTIVE")} title="Deactivate" className="rounded-md p-1.5 text-amber-300 hover:bg-white/10"><Ban size={15} /></button>
                            ) : (
                              <button onClick={() => setStatus(a, "ACTIVE")} title="Activate" className="rounded-md p-1.5 text-emerald-300 hover:bg-white/10"><ShieldCheck size={15} /></button>
                            )}
                            <button onClick={() => revoke(a)} title="Revoke" className="rounded-md p-1.5 text-red-300 hover:bg-white/10"><Trash2 size={15} /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        )}

        {tab === "payments" && (
          <Card className="mt-3 overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead><tr className="text-xs uppercase tracking-wide text-white/40">
                  {["Partner", "Package", "Base", "GST", "Total", "Method", "Status", "Date"].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}
                </tr></thead>
                <tbody>
                  {payments.length === 0 && <tr><td colSpan={8} className="px-3 py-6 text-white/40">No payments recorded yet.</td></tr>}
                  {payments.map((p) => (
                    <tr key={p._id} className="border-t border-white/5">
                      <td className="px-3 py-2"><div className="font-medium">{p.partnerName}</div><div className="text-xs text-white/40">{p.user?.email}</div></td>
                      <td className="px-3 py-2 text-white/70">{p.packageName}</td>
                      <td className="px-3 py-2">{inr(p.amountPaise)}</td>
                      <td className="px-3 py-2 text-white/60">{inr(p.gstPaise)} <span className="text-xs text-white/40">({p.gstPercent}%)</span></td>
                      <td className="px-3 py-2 font-semibold">{inr(p.totalPaise)}</td>
                      <td className="px-3 py-2 text-white/60">{p.method}</td>
                      <td className="px-3 py-2"><Badge variant={p.status === "VERIFIED" ? "success" : p.status === "PENDING" ? "warning" : "danger"}>{p.status}</Badge></td>
                      <td className="px-3 py-2 text-white/60">{fmtDate(p.paidAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>

      {grantOpen && <GrantModal users={users} onClose={() => setGrantOpen(false)} onDone={() => { setGrantOpen(false); load(); }} />}
      {payOpen && <PaymentModal users={users} onClose={() => setPayOpen(false)} onDone={() => { setPayOpen(false); load(); }} />}
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3"><div className="text-xl font-bold">{value}</div><div className="text-xs text-white/50">{label}</div></div>;
}
function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${active ? "bg-white/15 text-white" : "text-white/50 hover:bg-white/5"}`}>{children}</button>;
}

function UserPicker({ users, value, onChange }: { users: UserRow[]; value: string; onChange: (id: string) => void }) {
  const [q, setQ] = useState("");
  const list = users.filter((u) => {
    const s = q.toLowerCase();
    return !s || u.name.toLowerCase().includes(s) || u.email.toLowerCase().includes(s);
  }).slice(0, 8);
  const selected = users.find((u) => u._id === value);
  return (
    <div>
      <Label>Partner *</Label>
      {selected ? (
        <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm">
          <span>{selected.name} <span className="text-white/40">· {selected.email}</span></span>
          <button type="button" onClick={() => onChange("")} className="text-white/40 hover:text-white"><X size={14} /></button>
        </div>
      ) : (
        <>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or email…" />
          {q && (
            <div className="mt-1 max-h-48 overflow-y-auto rounded-lg border border-white/10 bg-[#0a0d14]">
              {list.length === 0 && <p className="px-3 py-2 text-xs text-white/40">No match</p>}
              {list.map((u) => (
                <button key={u._id} type="button" onClick={() => { onChange(u._id); setQ(""); }} className="block w-full px-3 py-2 text-left text-sm hover:bg-white/10">
                  {u.name} <span className="text-white/40">· {u.email} · {u.role}</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm">
      <div className="mt-10 w-full max-w-lg rounded-2xl border border-white/10 bg-[#0a0d14] p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded-md p-1 text-white/40 hover:bg-white/10 hover:text-white"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function GrantModal({ users, onClose, onDone }: { users: UserRow[]; onClose: () => void; onDone: () => void }) {
  const [userId, setUserId] = useState("");
  const [packageName, setPackageName] = useState("Marketing Access");
  const [budgetRupees, setBudgetRupees] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!userId) return toast.error("Select a partner");
    setSaving(true);
    try {
      await api.post("/admin/marketing/access", {
        userId, packageName: packageName.trim() || "Marketing Access",
        budgetRupees: budgetRupees ? Number(budgetRupees) : 0,
        validUntil: validUntil || null, notes: notes.trim() || undefined,
      });
      toast.success("Access granted");
      onDone();
    } catch { toast.error("Failed to grant"); } finally { setSaving(false); }
  }

  return (
    <Modal title="Grant marketing access" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <UserPicker users={users} value={userId} onChange={setUserId} />
        <div><Label>Package name</Label><Input value={packageName} onChange={(e) => setPackageName(e.target.value)} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Budget (₹)</Label><Input type="number" min="0" value={budgetRupees} onChange={(e) => setBudgetRupees(e.target.value)} placeholder="e.g. 50000" /></div>
          <div><Label>Valid until</Label><Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} /></div>
        </div>
        <div><Label>Notes</Label><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        <button disabled={saving} className="w-full rounded-lg bg-sky-500 py-2.5 text-sm font-semibold text-white hover:bg-sky-400 disabled:opacity-60">{saving ? "Saving…" : "Grant access"}</button>
      </form>
    </Modal>
  );
}

const GST_DEFAULT = 18;
function PaymentModal({ users, onClose, onDone }: { users: UserRow[]; onClose: () => void; onDone: () => void }) {
  const [userId, setUserId] = useState("");
  const [partnerName, setPartnerName] = useState("");
  const [amountRupees, setAmountRupees] = useState("");
  const [gstPercent, setGstPercent] = useState(String(GST_DEFAULT));
  const [method, setMethod] = useState("BANK_TRANSFER");
  const [reference, setReference] = useState("");
  const [status, setStatus] = useState("VERIFIED");
  const [addToBudget, setAddToBudget] = useState(true);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const base = Number(amountRupees) || 0;
  const gst = Math.round((base * (Number(gstPercent) || 0)) / 100);
  const total = base + gst;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!userId) return toast.error("Select a partner");
    if (!partnerName.trim()) return toast.error("Partner name required");
    setSaving(true);
    try {
      await api.post("/admin/marketing/payments", {
        userId, partnerName: partnerName.trim(),
        amountRupees: base, gstPercent: Number(gstPercent) || 0,
        method, reference: reference.trim() || undefined, status,
        addToBudget, notes: notes.trim() || undefined,
      });
      toast.success("Payment recorded");
      onDone();
    } catch { toast.error("Failed to record payment"); } finally { setSaving(false); }
  }

  return (
    <Modal title="Record direct / offline payment" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <UserPicker users={users} value={userId} onChange={(id) => { setUserId(id); const u = users.find((x) => x._id === id); if (u && !partnerName) setPartnerName(u.name); }} />
        <div><Label>Partner name *</Label><Input value={partnerName} onChange={(e) => setPartnerName(e.target.value)} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Amount (₹, excl. GST) *</Label><Input type="number" min="0" value={amountRupees} onChange={(e) => setAmountRupees(e.target.value)} /></div>
          <div><Label>GST %</Label><Input type="number" min="0" step="0.01" value={gstPercent} onChange={(e) => setGstPercent(e.target.value)} /></div>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm">
          <div className="flex justify-between text-white/60"><span>Base</span><span>{inr(base * 100)}</span></div>
          <div className="flex justify-between text-white/60"><span>GST ({gstPercent || 0}%)</span><span>{inr(gst * 100)}</span></div>
          <div className="mt-1 flex justify-between border-t border-white/10 pt-1 font-semibold"><span>Total</span><span>{inr(total * 100)}</span></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Method</Label>
            <select value={method} onChange={(e) => setMethod(e.target.value)} className="h-10 w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 text-sm outline-none">
              {["BANK_TRANSFER", "UPI", "CASH", "CHEQUE", "CARD", "OTHER"].map((m) => <option key={m} value={m} className="bg-[#0a0d14]">{m.replace("_", " ")}</option>)}
            </select>
          </div>
          <div>
            <Label>Status</Label>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-10 w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 text-sm outline-none">
              {["VERIFIED", "PENDING", "FAILED", "REFUNDED"].map((s) => <option key={s} value={s} className="bg-[#0a0d14]">{s}</option>)}
            </select>
          </div>
        </div>
        <div><Label>Reference (txn / cheque no.)</Label><Input value={reference} onChange={(e) => setReference(e.target.value)} /></div>
        <label className="flex items-center gap-2 text-sm text-white/70">
          <input type="checkbox" checked={addToBudget} onChange={(e) => setAddToBudget(e.target.checked)} /> Add base amount to partner's marketing budget
        </label>
        <div><Label>Notes</Label><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        <button disabled={saving} className="w-full rounded-lg bg-emerald-500 py-2.5 text-sm font-semibold text-white hover:bg-emerald-400 disabled:opacity-60">{saving ? "Saving…" : "Record payment"}</button>
      </form>
    </Modal>
  );
}
