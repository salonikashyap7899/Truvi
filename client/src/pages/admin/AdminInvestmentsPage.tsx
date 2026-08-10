import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { formatINR } from "@/lib/utils";
import { TrendingUp, Search, X, Loader2, Settings2, CheckCircle2, Circle } from "lucide-react";

interface Terms {
  isOpen: boolean;
  minAmount: number;
  maxAmount: number | null;
  targetAnnualReturnPercent: number;
  tenureMonths: number;
  monthlyPayoutPercent: number | null;
  notes: string | null;
}
interface ProjectRow {
  _id: string;
  name: string;
  city: string | null;
  approvalStatus: string;
  terms: Terms | null;
}
interface InvestmentRow {
  _id: string;
  investorName: string;
  investorEmail: string;
  projectName: string;
  amount: number;
  status: string;
  targetAnnualReturnPercent: number;
  tenureMonths: number;
  razorpayPaymentId: string | null;
  createdAt: string;
}

export default function AdminInvestmentsPage() {
  const [tab, setTab] = useState<"terms" | "investments">("terms");
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [investments, setInvestments] = useState<InvestmentRow[]>([]);
  const [query, setQuery] = useState("");
  const [edit, setEdit] = useState<ProjectRow | null>(null);
  const [loading, setLoading] = useState(true);

  function load() {
    api.get("/invest/admin/list").then((r) => setProjects(r.data.projects ?? [])).catch(() => setProjects([])).finally(() => setLoading(false));
    api.get("/invest/admin/investments").then((r) => setInvestments(r.data.investments ?? [])).catch(() => setInvestments([]));
  }
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return projects.filter((p) => !q || [p.name, p.city].some((f) => f?.toLowerCase().includes(q)));
  }, [projects, query]);

  const openCount = projects.filter((p) => p.terms?.isOpen).length;
  const totalRaised = investments.filter((i) => i.status === "PAID").reduce((a, i) => a + i.amount, 0);

  return (
    <main className="min-h-screen bg-background p-6 text-white md:p-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 font-display text-2xl font-semibold"><TrendingUp size={22} className="text-emerald-400" /> Truvi Invest</h1>
          <p className="mt-1 text-sm text-muted-foreground">Set per-project investment terms and track investments. Returns are targeted, never guaranteed — open a project only when its legal/compliance is ready.</p>
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Kpi label="Projects Open" value={String(openCount)} />
        <Kpi label="Investments (paid)" value={String(investments.filter((i) => i.status === "PAID").length)} />
        <Kpi label="Total Raised" value={formatINR(totalRaised)} />
      </div>

      <div className="mt-6 flex gap-2">
        <button onClick={() => setTab("terms")} className={`rounded-full px-4 py-1.5 text-sm font-medium ${tab === "terms" ? "bg-emerald-500 text-white" : "border border-white/10 text-white/60 hover:bg-white/10"}`}>Investment Terms</button>
        <button onClick={() => setTab("investments")} className={`rounded-full px-4 py-1.5 text-sm font-medium ${tab === "investments" ? "bg-emerald-500 text-white" : "border border-white/10 text-white/60 hover:bg-white/10"}`}>Investments ({investments.length})</button>
      </div>

      {tab === "terms" ? (
        <>
          <div className="mt-4 relative w-72">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search project…" className="w-full rounded-full border border-white/10 bg-white/5 py-1.5 pl-9 pr-3 text-xs text-white outline-none focus:border-emerald-400/50" />
          </div>
          <div className="mt-4 overflow-x-auto rounded-lg border border-white/10">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="glass text-muted-foreground"><tr>
                <th className="p-3 text-left">Project</th><th className="p-3 text-left">Status</th><th className="p-3 text-right">Target/yr</th><th className="p-3 text-right">Tenure</th><th className="p-3 text-right">Monthly</th><th className="p-3 text-right">Min</th><th className="p-3 text-right">Action</th>
              </tr></thead>
              <tbody>
                {loading ? <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Loading…</td></tr>
                  : filtered.length === 0 ? <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">No projects.</td></tr>
                  : filtered.map((p) => (
                    <tr key={p._id} className="border-t border-white/10">
                      <td className="p-3"><div className="font-medium">{p.name}</div><div className="text-xs text-muted-foreground">{p.city ?? ""}</div></td>
                      <td className="p-3">{p.terms?.isOpen ? <span className="inline-flex items-center gap-1 text-emerald-300"><CheckCircle2 size={13} /> Open</span> : <span className="inline-flex items-center gap-1 text-white/40"><Circle size={13} /> Closed</span>}</td>
                      <td className="p-3 text-right tabular-nums">{p.terms ? `${p.terms.targetAnnualReturnPercent}%` : "—"}</td>
                      <td className="p-3 text-right tabular-nums">{p.terms ? `${p.terms.tenureMonths} mo` : "—"}</td>
                      <td className="p-3 text-right tabular-nums">{p.terms?.monthlyPayoutPercent ? `${p.terms.monthlyPayoutPercent}%` : "—"}</td>
                      <td className="p-3 text-right tabular-nums">{p.terms ? formatINR(p.terms.minAmount) : "—"}</td>
                      <td className="p-3 text-right"><button onClick={() => setEdit(p)} className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold hover:bg-white/10"><Settings2 size={13} /> Configure</button></td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-lg border border-white/10">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="glass text-muted-foreground"><tr>
              <th className="p-3 text-left">Investor</th><th className="p-3 text-left">Project</th><th className="p-3 text-right">Amount</th><th className="p-3 text-right">Target/yr</th><th className="p-3 text-left">Status</th><th className="p-3 text-left">Payment ID</th><th className="p-3 text-left">Date</th>
            </tr></thead>
            <tbody>
              {investments.length === 0 ? <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">No investments yet.</td></tr>
                : investments.map((i) => (
                  <tr key={i._id} className="border-t border-white/10">
                    <td className="p-3"><div className="font-medium">{i.investorName}</div><div className="text-xs text-muted-foreground">{i.investorEmail}</div></td>
                    <td className="p-3">{i.projectName}</td>
                    <td className="p-3 text-right font-medium tabular-nums">{formatINR(i.amount)}</td>
                    <td className="p-3 text-right tabular-nums text-emerald-300">{i.targetAnnualReturnPercent}%</td>
                    <td className="p-3"><span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${i.status === "PAID" ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"}`}>{i.status}</span></td>
                    <td className="p-3 font-mono text-xs text-muted-foreground">{i.razorpayPaymentId || "—"}</td>
                    <td className="p-3 text-muted-foreground">{new Date(i.createdAt).toLocaleDateString("en-IN")}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {edit && <TermsModal project={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
    </main>
  );
}

function TermsModal({ project, onClose, onSaved }: { project: ProjectRow; onClose: () => void; onSaved: () => void }) {
  const t = project.terms;
  const [isOpen, setIsOpen] = useState(t?.isOpen ?? false);
  const [minAmount, setMinAmount] = useState(String(t?.minAmount ?? 100000));
  const [maxAmount, setMaxAmount] = useState(t?.maxAmount != null ? String(t.maxAmount) : "");
  const [ret, setRet] = useState(String(t?.targetAnnualReturnPercent ?? 12));
  const [tenure, setTenure] = useState(String(t?.tenureMonths ?? 12));
  const [monthly, setMonthly] = useState(t?.monthlyPayoutPercent != null ? String(t.monthlyPayoutPercent) : "");
  const [notes, setNotes] = useState(t?.notes ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await api.put(`/invest/admin/terms/${project._id}`, {
        isOpen,
        minAmount: Number(minAmount) || 0,
        maxAmount: maxAmount ? Number(maxAmount) : null,
        targetAnnualReturnPercent: Number(ret) || 0,
        tenureMonths: Number(tenure) || 12,
        monthlyPayoutPercent: monthly ? Number(monthly) : null,
        notes: notes.trim() || null,
      });
      toast.success("Investment terms saved");
      onSaved();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to save");
    } finally { setSaving(false); }
  }

  const field = "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400/50";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#0e1116] p-6 text-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div><h2 className="text-lg font-semibold">Investment Terms</h2><p className="text-sm text-muted-foreground">{project.name}</p></div>
          <button onClick={onClose} className="rounded-full p-1 text-white/60 hover:bg-white/10 hover:text-white"><X size={18} /></button>
        </div>

        <button onClick={() => setIsOpen((v) => !v)} className={`mt-4 flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-sm font-semibold ${isOpen ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-white/10 bg-white/5 text-white/70"}`}>
          <span>{isOpen ? "Open for investment" : "Closed (not accepting)"}</span>
          {isOpen ? <CheckCircle2 size={18} /> : <Circle size={18} />}
        </button>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="block"><span className="mb-1 block text-xs text-muted-foreground">Target return (% / yr)</span><input type="number" className={field} value={ret} onChange={(e) => setRet(e.target.value)} /></label>
          <label className="block"><span className="mb-1 block text-xs text-muted-foreground">Tenure (months)</span><input type="number" className={field} value={tenure} onChange={(e) => setTenure(e.target.value)} /></label>
          <label className="block"><span className="mb-1 block text-xs text-muted-foreground">Monthly payout (% / mo)</span><input type="number" className={field} value={monthly} onChange={(e) => setMonthly(e.target.value)} placeholder="optional" /></label>
          <label className="block"><span className="mb-1 block text-xs text-muted-foreground">Min amount (₹)</span><input type="number" className={field} value={minAmount} onChange={(e) => setMinAmount(e.target.value)} /></label>
          <label className="block"><span className="mb-1 block text-xs text-muted-foreground">Max amount (₹)</span><input type="number" className={field} value={maxAmount} onChange={(e) => setMaxAmount(e.target.value)} placeholder="optional" /></label>
        </div>
        <label className="mt-3 block"><span className="mb-1 block text-xs text-muted-foreground">Notes (shown to investors)</span><input className={field} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" /></label>

        <p className="mt-3 rounded-lg border border-amber-500/25 bg-amber-500/[0.06] p-2 text-[11px] text-amber-200/90">Only open a project once its legal/regulatory framework is in place. Returns are always shown to investors as “targeted / projected”, never guaranteed.</p>

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-full border border-white/10 px-4 py-2 text-sm text-white/70 hover:bg-white/10">Cancel</button>
          <button onClick={save} disabled={saving} className="inline-flex items-center gap-2 rounded-full bg-emerald-500 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-400 disabled:opacity-60">{saving && <Loader2 size={14} className="animate-spin" />} Save Terms</button>
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-xl font-semibold">{value}</p>
    </div>
  );
}
