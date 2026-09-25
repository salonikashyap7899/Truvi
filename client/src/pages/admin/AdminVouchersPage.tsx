import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Ticket, Plus, Trash2, ArrowLeft, Loader2, Power } from "lucide-react";

interface Voucher {
  id: string;
  code: string;
  description: string | null;
  discountType: "PERCENT" | "FIXED";
  discountValue: number; // percent, or paise for FIXED
  maxDiscountPaise: number | null;
  category: string | null;
  maxRedemptions: number | null;
  redeemedCount: number;
  minAmountPaise: number;
  active: boolean;
  expiresAt: string | null;
  createdAt: string | null;
}

const inr = (paise: number) => "₹" + (paise / 100).toLocaleString("en-IN");

function discountLabel(v: Voucher) {
  if (v.discountType === "PERCENT") return `${v.discountValue}% off${v.maxDiscountPaise ? ` (max ${inr(v.maxDiscountPaise)})` : ""}`;
  return `${inr(v.discountValue)} off`;
}

const BLANK = {
  code: "",
  description: "",
  discountType: "PERCENT" as "PERCENT" | "FIXED",
  discountValue: "",
  maxDiscountRupees: "",
  category: "" as "" | "BUYER" | "CP" | "DEVELOPER",
  maxRedemptions: "",
  minAmountRupees: "",
  expiresAt: "",
};

export default function AdminVouchersPage() {
  const [rows, setRows] = useState<Voucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ ...BLANK });

  async function load() {
    setLoading(true);
    try {
      const res = await api.get("/admin/vouchers");
      setRows(res.data.vouchers ?? []);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to load vouchers");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        code: form.code.trim().toUpperCase(),
        discountType: form.discountType,
        discountValue: Number(form.discountValue),
      };
      if (form.description.trim()) payload.description = form.description.trim();
      if (form.discountType === "PERCENT" && form.maxDiscountRupees) payload.maxDiscountRupees = Number(form.maxDiscountRupees);
      if (form.category) payload.category = form.category;
      if (form.maxRedemptions) payload.maxRedemptions = Number(form.maxRedemptions);
      if (form.minAmountRupees) payload.minAmountRupees = Number(form.minAmountRupees);
      if (form.expiresAt) payload.expiresAt = new Date(form.expiresAt).toISOString();

      const res = await api.post("/admin/vouchers", payload);
      setRows((r) => [res.data.voucher, ...r]);
      setForm({ ...BLANK });
      toast.success("Voucher created");
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Couldn't create the voucher");
    } finally {
      setSaving(false);
    }
  }

  async function toggle(v: Voucher) {
    try {
      const res = await api.patch(`/admin/vouchers/${v.id}`, { active: !v.active });
      setRows((r) => r.map((x) => (x.id === v.id ? res.data.voucher : x)));
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Couldn't update the voucher");
    }
  }

  async function remove(v: Voucher) {
    if (!confirm(`Delete voucher ${v.code}? This can't be undone.`)) return;
    try {
      await api.delete(`/admin/vouchers/${v.id}`);
      setRows((r) => r.filter((x) => x.id !== v.id));
      toast.success("Voucher deleted");
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Couldn't delete the voucher");
    }
  }

  const field = "h-10 rounded-lg border border-white/12 bg-white/[0.04] px-3 text-sm text-white placeholder:text-white/30 outline-none focus:border-[var(--trust)]/60 [&>option]:bg-[#0a0d14]";

  return (
    <main className="min-h-screen p-4 text-white sm:p-6 md:p-10">
      <Link to="/admin/dashboard" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-white"><ArrowLeft size={13} /> Admin Dashboard</Link>
      <h1 className="mt-2 flex items-center gap-2 text-2xl font-semibold"><Ticket size={20} className="text-emerald-300" /> Vouchers</h1>
      <p className="mt-1 text-sm text-muted-foreground">Create discount codes buyers, CPs and developers can apply at checkout. Discounts are validated and applied on the server.</p>

      {/* Create */}
      <form onSubmit={create} className="mt-5 rounded-2xl border border-white/10 glass p-4">
        <p className="flex items-center gap-2 text-sm font-semibold"><Plus size={15} /> New voucher</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <input required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="CODE e.g. LAUNCH50" className={`${field} uppercase`} />
          <select value={form.discountType} onChange={(e) => setForm({ ...form, discountType: e.target.value as "PERCENT" | "FIXED" })} className={field}>
            <option value="PERCENT">Percentage off</option>
            <option value="FIXED">Flat ₹ off</option>
          </select>
          <input required type="number" min={1} value={form.discountValue} onChange={(e) => setForm({ ...form, discountValue: e.target.value })} placeholder={form.discountType === "PERCENT" ? "% e.g. 50" : "₹ off e.g. 500"} className={field} />
          {form.discountType === "PERCENT" && (
            <input type="number" min={0} value={form.maxDiscountRupees} onChange={(e) => setForm({ ...form, maxDiscountRupees: e.target.value })} placeholder="Max ₹ discount (optional)" className={field} />
          )}
          <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as typeof form.category })} className={field}>
            <option value="">All roles</option>
            <option value="BUYER">Buyers only</option>
            <option value="CP">Channel Partners only</option>
            <option value="DEVELOPER">Developers only</option>
          </select>
          <input type="number" min={1} value={form.maxRedemptions} onChange={(e) => setForm({ ...form, maxRedemptions: e.target.value })} placeholder="Usage limit (optional)" className={field} />
          <input type="number" min={0} value={form.minAmountRupees} onChange={(e) => setForm({ ...form, minAmountRupees: e.target.value })} placeholder="Min order ₹ (optional)" className={field} />
          <input type="date" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} className={field} />
          <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Label (optional)" className={`${field} lg:col-span-2`} />
        </div>
        <button type="submit" disabled={saving} className="mt-3 inline-flex items-center gap-2 rounded-full bg-[var(--trust)] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[var(--trust)]/85 disabled:opacity-60">
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} Create voucher
        </button>
      </form>

      {/* List */}
      <div className="mt-6 overflow-x-auto rounded-2xl border border-white/10 glass">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left text-[11px] uppercase tracking-wide text-white/50">
              <th className="px-4 py-3">Code</th>
              <th className="px-4 py-3">Discount</th>
              <th className="px-4 py-3">Scope</th>
              <th className="px-4 py-3">Used</th>
              <th className="px-4 py-3">Expires</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center"><Loader2 size={18} className="mx-auto animate-spin" /></td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">No vouchers yet — create one above.</td></tr>
            ) : (
              rows.map((v) => (
                <tr key={v.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                  <td className="px-4 py-3">
                    <span className="font-mono font-semibold text-white">{v.code}</span>
                    {v.description && <span className="block text-[11px] text-white/50">{v.description}</span>}
                  </td>
                  <td className="px-4 py-3 text-white/85">{discountLabel(v)}</td>
                  <td className="px-4 py-3 text-white/70">
                    {v.category ?? "All roles"}
                    {v.minAmountPaise > 0 && <span className="block text-[11px] text-white/45">min {inr(v.minAmountPaise)}</span>}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-white/85">{v.redeemedCount}{v.maxRedemptions != null ? ` / ${v.maxRedemptions}` : ""}</td>
                  <td className="px-4 py-3 text-white/70">{v.expiresAt ? new Date(v.expiresAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${v.active ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-300" : "border-white/15 bg-white/5 text-white/50"}`}>
                      {v.active ? "Active" : "Off"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => toggle(v)} title={v.active ? "Deactivate" : "Activate"} className="grid size-8 place-items-center rounded-full border border-white/15 text-white/70 hover:bg-white/10"><Power size={13} /></button>
                      <button onClick={() => remove(v)} title="Delete" className="grid size-8 place-items-center rounded-full border border-red-400/25 text-red-300 hover:bg-red-500/10"><Trash2 size={13} /></button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
