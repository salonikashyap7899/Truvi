import { createPortal } from "react-dom";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Gift, Loader2, Pencil, Plus, Power, Sparkles, Trash2, X } from "lucide-react";
import { api } from "@/lib/api";
import { useBodyScrollLock } from "@/lib/useBodyScrollLock";
import { formatDate, istToday, ROLE_LABEL } from "@/components/leads/inventoryLeadShared";

/**
 * Admin → Offers. Create, edit, switch on/off and delete incentive offers
 * shown on inventory cards (e.g. Paradise Town: "For every 1,000 sq ft sold,
 * earn ₹1,00,000"). Nothing is hard-coded: area per block, amount, project,
 * unit, period and who is eligible are all set here. Rewards are calculated
 * on the server; the preview below uses the same rule.
 */

type RewardType = "INCENTIVE" | "BONUS_COMMISSION" | "GIFT" | "DISCOUNT";
type CalcBasis = "PER_AREA_BLOCK" | "PER_UNIT" | "PERCENT_OF_VALUE" | "FIXED";
type EligibleRole = "CP" | "AMBASSADOR" | "BUYER";

interface Offer {
  _id: string;
  name: string;
  projectId: string;
  projectName: string | null;
  unitId: string | null;
  unitNumber: string | null;
  description: string | null;
  badgeText: string | null;
  terms: string | null;
  rewardType: RewardType;
  calcBasis: CalcBasis;
  basisQuantity: number | null;
  amount: number;
  prorate: boolean;
  eligibleRoles: EligibleRole[];
  startDate: string | null;
  endDate: string | null;
  isActive: boolean;
  badge: string;
  live: boolean;
  examples: { label: string; reward: number }[];
}

interface Draft {
  _id?: string;
  name: string;
  projectId: string;
  unitId: string;
  description: string;
  badgeText: string;
  terms: string;
  rewardType: RewardType;
  calcBasis: CalcBasis;
  basisQuantity: string;
  amount: string;
  prorate: boolean;
  eligibleRoles: EligibleRole[];
  startDate: string;
  endDate: string;
  isActive: boolean;
}

const BLANK: Draft = {
  name: "", projectId: "", unitId: "", description: "", badgeText: "", terms: "",
  rewardType: "INCENTIVE", calcBasis: "PER_AREA_BLOCK", basisQuantity: "1000", amount: "",
  prorate: false, eligibleRoles: ["CP", "AMBASSADOR"], startDate: istToday(), endDate: "", isActive: true,
};

/** Paradise Town-style preset: ₹1,00,000 for every 1,000 sq ft sold. */
const PARADISE_PRESET: Partial<Draft> = {
  name: "Paradise Town Sales Bonus",
  rewardType: "INCENTIVE",
  calcBasis: "PER_AREA_BLOCK",
  basisQuantity: "1000",
  amount: "100000",
  prorate: false,
  eligibleRoles: ["CP", "AMBASSADOR"],
  description: "For every 1,000 sq ft sold in this project, earn ₹1,00,000. 1,000 sq ft → ₹1 Lakh, 2,000 sq ft → ₹2 Lakh, 3,000 sq ft → ₹3 Lakh.",
};

const REWARD_LABEL: Record<RewardType, string> = {
  INCENTIVE: "Cash incentive", BONUS_COMMISSION: "Bonus commission", GIFT: "Gift", DISCOUNT: "Buyer discount",
};
const BASIS_LABEL: Record<CalcBasis, string> = {
  PER_AREA_BLOCK: "Per sq ft block sold", PER_UNIT: "Per unit sold", PERCENT_OF_VALUE: "% of booking value", FIXED: "Fixed amount",
};

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const field =
  "w-full rounded-xl border border-white/12 bg-white/[0.04] px-3 py-2 text-sm text-white placeholder:text-white/35 outline-none focus:border-sky-500 [&>option]:bg-[#0a0d14] [color-scheme:dark]";

function offerState(o: Offer): { label: string; tone: string } {
  const today = istToday();
  if (!o.isActive) return { label: "Off", tone: "border-white/15 bg-white/5 text-white/60" };
  if (o.startDate && today < o.startDate) return { label: "Scheduled", tone: "border-sky-400/30 bg-sky-500/10 text-sky-200" };
  if (o.endDate && today > o.endDate) return { label: "Ended", tone: "border-rose-400/30 bg-rose-500/10 text-rose-200" };
  return { label: "Live", tone: "border-emerald-400/30 bg-emerald-500/10 text-emerald-200" };
}

export default function AdminOffersPage() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  function load() {
    api
      .get("/offers")
      .then((r) => setOffers(r.data.offers ?? []))
      .catch((err) => toast.error(err?.response?.data?.error || "Couldn't load offers"))
      .finally(() => setLoading(false));
  }
  useEffect(load, []);

  async function toggle(o: Offer) {
    setBusy(o._id);
    try {
      await api.patch(`/offers/${o._id}`, { isActive: !o.isActive });
      toast.success(o.isActive ? "Offer switched off" : "Offer switched on");
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Couldn't update the offer");
    } finally {
      setBusy(null);
    }
  }

  async function remove(o: Offer) {
    if (!window.confirm(`Delete the offer "${o.name}"? It will disappear from inventory.`)) return;
    setBusy(o._id);
    try {
      await api.delete(`/offers/${o._id}`);
      toast.success("Offer deleted");
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Couldn't delete the offer");
    } finally {
      setBusy(null);
    }
  }

  function edit(o: Offer) {
    setEditing({
      _id: o._id, name: o.name, projectId: o.projectId, unitId: o.unitId ?? "", description: o.description ?? "",
      badgeText: o.badgeText ?? "", terms: o.terms ?? "", rewardType: o.rewardType, calcBasis: o.calcBasis,
      basisQuantity: o.basisQuantity ? String(o.basisQuantity) : "", amount: String(o.amount), prorate: o.prorate,
      eligibleRoles: o.eligibleRoles, startDate: o.startDate ?? "", endDate: o.endDate ?? "", isActive: o.isActive,
    });
  }

  return (
    <main className="min-h-screen p-4 text-white sm:p-6 md:p-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold"><Gift size={22} className="text-amber-300" /> Offers</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Incentives shown as a “Special Offer” badge on inventory to the people you choose. Rewards are always calculated by the server.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setEditing({ ...BLANK, ...PARADISE_PRESET })} className="inline-flex items-center gap-1.5 rounded-xl border border-amber-400/35 bg-amber-500/10 px-3.5 py-2 text-sm font-semibold text-amber-100 hover:bg-amber-500/20">
            <Sparkles size={14} /> Paradise Town preset
          </button>
          <button onClick={() => setEditing({ ...BLANK })} className="inline-flex items-center gap-1.5 rounded-xl bg-sky-600 px-3.5 py-2 text-sm font-semibold hover:bg-sky-500">
            <Plus size={15} /> New offer
          </button>
        </div>
      </div>

      {loading ? (
        <p className="mt-8 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 size={15} className="animate-spin" /> Loading offers…</p>
      ) : offers.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-white/15 p-8 text-center text-sm text-muted-foreground">
          No offers yet. Use <b className="text-white">Paradise Town preset</b> for “₹1 Lakh per 1,000 sq ft”, or create your own.
        </div>
      ) : (
        <div className="mt-6 grid gap-3 lg:grid-cols-2">
          {offers.map((o) => {
            const st = offerState(o);
            return (
              <div key={o._id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{o.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{o.projectName ?? "—"}{o.unitNumber ? ` · Unit ${o.unitNumber}` : " · whole project"}</p>
                  </div>
                  <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${st.tone}`}>{st.label}</span>
                </div>
                <p className="mt-3 inline-flex max-w-full items-center gap-1.5 rounded-lg border border-amber-400/30 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-100">
                  <Gift size={12} className="shrink-0" /> <span className="truncate">Special Offer – {o.badge}</span>
                </p>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>{REWARD_LABEL[o.rewardType]} · {BASIS_LABEL[o.calcBasis]}</span>
                  <span>For: {o.eligibleRoles.map((r) => ROLE_LABEL[r] ?? r).join(", ")}</span>
                  <span>
                    {o.startDate ? formatDate(o.startDate, { day: "numeric", month: "short" }) : "Now"} – {o.endDate ? formatDate(o.endDate, { day: "numeric", month: "short", year: "numeric" }) : "no end date"}
                  </span>
                </div>
                {o.examples.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {o.examples.map((e) => (
                      <span key={e.label} className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[11px] text-white/70">{e.label} → <b className="text-emerald-300">{inr(e.reward)}</b></span>
                    ))}
                  </div>
                )}
                <div className="mt-3 flex flex-wrap gap-2 border-t border-white/8 pt-3">
                  <button onClick={() => edit(o)} className="inline-flex items-center gap-1 rounded-lg border border-white/15 px-3 py-1.5 text-xs hover:bg-white/10"><Pencil size={12} /> Edit</button>
                  <button onClick={() => toggle(o)} disabled={busy === o._id} className={`inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs disabled:opacity-40 ${o.isActive ? "border-white/15 hover:bg-white/10" : "border-emerald-500/40 text-emerald-200 hover:bg-emerald-500/10"}`}>
                    <Power size={12} /> {o.isActive ? "Deactivate" : "Activate"}
                  </button>
                  <button onClick={() => remove(o)} disabled={busy === o._id} className="ml-auto inline-flex items-center gap-1 rounded-lg border border-rose-500/30 px-3 py-1.5 text-xs text-rose-200 hover:bg-rose-500/10 disabled:opacity-40"><Trash2 size={12} /> Delete</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && <OfferForm draft={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </main>
  );
}

function previewReward(d: Draft, input: { area?: number; units?: number; value?: number }): number {
  const amount = Number(d.amount) || 0;
  if (d.calcBasis === "PER_AREA_BLOCK") {
    const block = Number(d.basisQuantity) || 0;
    if (!block || !input.area) return 0;
    return Math.round((d.prorate ? input.area / block : Math.floor(input.area / block)) * amount);
  }
  if (d.calcBasis === "PER_UNIT") return Math.round((input.units ?? 1) * amount);
  if (d.calcBasis === "PERCENT_OF_VALUE") return Math.round(((input.value ?? 0) * amount) / 100);
  return Math.round(amount);
}

function OfferForm({ draft, onClose, onSaved }: { draft: Draft; onClose: () => void; onSaved: () => void }) {
  useBodyScrollLock(true);
  const [d, setD] = useState<Draft>(draft);
  const [projects, setProjects] = useState<{ _id: string; name: string; approvalStatus?: string }[]>([]);
  const [units, setUnits] = useState<{ _id: string; unitNumber: string; type: string; areaSqft: number }[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));

  useEffect(() => {
    api.get("/admin/projects").then((r) => setProjects(r.data.projects ?? [])).catch(() => {});
  }, []);
  useEffect(() => {
    if (!d.projectId) { setUnits([]); return; }
    api.get("/units", { params: { projectId: d.projectId } }).then((r) => setUnits(r.data.units ?? [])).catch(() => setUnits([]));
  }, [d.projectId]);

  const examples = useMemo(() => {
    if (d.calcBasis === "PER_AREA_BLOCK") {
      const b = Number(d.basisQuantity) || 0;
      return b ? [1, 2, 3].map((k) => ({ label: `${(b * k).toLocaleString("en-IN")} sq ft`, reward: previewReward(d, { area: b * k }) })) : [];
    }
    if (d.calcBasis === "PER_UNIT") return [1, 2, 3].map((k) => ({ label: `${k} unit${k > 1 ? "s" : ""}`, reward: previewReward(d, { units: k }) }));
    if (d.calcBasis === "PERCENT_OF_VALUE") return [5e6, 1e7].map((v) => ({ label: `${inr(v)} booking`, reward: previewReward(d, { value: v }) }));
    return [{ label: "Per sale", reward: previewReward(d, {}) }];
  }, [d]);

  async function save() {
    setError(null);
    if (d.name.trim().length < 2) return setError("Give the offer a name");
    if (!d.projectId) return setError("Choose a project");
    if (!(Number(d.amount) > 0)) return setError("Enter the reward amount");
    if (d.calcBasis === "PER_AREA_BLOCK" && !(Number(d.basisQuantity) > 0)) return setError("Enter the sq ft per reward block");
    if (!d.eligibleRoles.length) return setError("Pick who can see this offer");
    if (d.startDate && d.endDate && d.endDate < d.startDate) return setError("The end date must be on or after the start date");
    const body = {
      name: d.name.trim(),
      projectId: d.projectId,
      unitId: d.unitId || null,
      description: d.description.trim() || null,
      badgeText: d.badgeText.trim() || null,
      terms: d.terms.trim() || null,
      rewardType: d.rewardType,
      calcBasis: d.calcBasis,
      basisQuantity: d.calcBasis === "PER_AREA_BLOCK" ? Number(d.basisQuantity) : null,
      amount: Number(d.amount),
      prorate: d.prorate,
      eligibleRoles: d.eligibleRoles,
      startDate: d.startDate || null,
      endDate: d.endDate || null,
      isActive: d.isActive,
    };
    setSaving(true);
    try {
      if (d._id) await api.patch(`/offers/${d._id}`, body);
      else await api.post("/offers", body);
      toast.success(d._id ? "Offer updated" : "Offer created");
      onSaved();
    } catch (err: any) {
      setError(err?.response?.data?.error || "Couldn't save the offer");
    } finally {
      setSaving(false);
    }
  }

  const label = "mb-1 block text-xs font-medium text-white/70";
  const amountLabel = d.calcBasis === "PERCENT_OF_VALUE" ? "Percentage (%)" : "Amount (₹)";

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Offer">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-white/10 bg-[#0a0d14] text-white shadow-2xl sm:rounded-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-5 py-3.5">
          <p className="font-semibold">{d._id ? "Edit offer" : "New offer"}</p>
          <button onClick={onClose} aria-label="Close" className="grid size-8 place-items-center rounded-full border border-white/15 hover:bg-white/10"><X size={16} /></button>
        </div>
        <div className="flex-1 space-y-3.5 overflow-y-auto px-5 py-4">
          <div>
            <label className={label}>Offer name</label>
            <input className={field} value={d.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Paradise Town Sales Bonus" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={label}>Project</label>
              <select className={field} value={d.projectId} onChange={(e) => set({ projectId: e.target.value, unitId: "" })}>
                <option value="">Choose a project…</option>
                {projects.map((p) => <option key={p._id} value={p._id}>{p.name}{p.approvalStatus && p.approvalStatus !== "APPROVED" ? ` (${p.approvalStatus.toLowerCase()})` : ""}</option>)}
              </select>
            </div>
            <div>
              <label className={label}>Inventory <span className="text-white/40">(optional)</span></label>
              <select className={field} value={d.unitId} onChange={(e) => set({ unitId: e.target.value })} disabled={!d.projectId}>
                <option value="">Whole project</option>
                {units.map((u) => <option key={u._id} value={u._id}>{u.unitNumber} · {u.type} · {Math.round(u.areaSqft)} sq ft</option>)}
              </select>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={label}>Incentive / reward type</label>
              <select className={field} value={d.rewardType} onChange={(e) => set({ rewardType: e.target.value as RewardType })}>
                {(Object.keys(REWARD_LABEL) as RewardType[]).map((k) => <option key={k} value={k}>{REWARD_LABEL[k]}</option>)}
              </select>
            </div>
            <div>
              <label className={label}>Calculation basis</label>
              <select className={field} value={d.calcBasis} onChange={(e) => set({ calcBasis: e.target.value as CalcBasis })}>
                {(Object.keys(BASIS_LABEL) as CalcBasis[]).map((k) => <option key={k} value={k}>{BASIS_LABEL[k]}</option>)}
              </select>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {d.calcBasis === "PER_AREA_BLOCK" && (
              <div>
                <label className={label}>For every … sq ft sold</label>
                <input className={field} type="number" min={1} value={d.basisQuantity} onChange={(e) => set({ basisQuantity: e.target.value })} placeholder="1000" />
              </div>
            )}
            <div>
              <label className={label}>{amountLabel}</label>
              <input className={field} type="number" min={0} value={d.amount} onChange={(e) => set({ amount: e.target.value })} placeholder={d.calcBasis === "PERCENT_OF_VALUE" ? "1" : "100000"} />
            </div>
          </div>
          {d.calcBasis === "PER_AREA_BLOCK" && (
            <label className="flex items-center gap-2 text-xs text-white/75">
              <input type="checkbox" checked={d.prorate} onChange={(e) => set({ prorate: e.target.checked })} />
              Pay part blocks pro-rata (e.g. 1,500 sq ft → 1.5×). Off = only complete blocks count.
            </label>
          )}
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Preview</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {examples.map((e) => (
                <span key={e.label} className="rounded-md border border-white/10 px-2 py-0.5 text-xs">{e.label} → <b className="text-emerald-300">{inr(e.reward)}</b></span>
              ))}
            </div>
          </div>
          <div>
            <label className={label}>Who can see and earn it</label>
            <div className="flex flex-wrap gap-2">
              {(["CP", "AMBASSADOR", "BUYER"] as EligibleRole[]).map((r) => {
                const on = d.eligibleRoles.includes(r);
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => set({ eligibleRoles: on ? d.eligibleRoles.filter((x) => x !== r) : [...d.eligibleRoles, r] })}
                    className={`rounded-full border px-3 py-1 text-xs ${on ? "border-sky-500/60 bg-sky-500/15 text-sky-100" : "border-white/15 text-white/60"}`}
                  >
                    {ROLE_LABEL[r]}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={label}>Start date</label>
              <input className={field} type="date" value={d.startDate} onChange={(e) => set({ startDate: e.target.value })} />
            </div>
            <div>
              <label className={label}>End date <span className="text-white/40">(optional)</span></label>
              <input className={field} type="date" value={d.endDate} min={d.startDate || undefined} onChange={(e) => set({ endDate: e.target.value })} />
            </div>
          </div>
          <div>
            <label className={label}>Description</label>
            <textarea className={`${field} min-h-[70px]`} value={d.description} onChange={(e) => set({ description: e.target.value })} maxLength={2000} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={label}>Badge text <span className="text-white/40">(optional)</span></label>
              <input className={field} value={d.badgeText} onChange={(e) => set({ badgeText: e.target.value })} maxLength={80} placeholder="Auto: Earn ₹1 Lakh per 1,000 sq ft" />
            </div>
            <div>
              <label className={label}>Terms <span className="text-white/40">(optional)</span></label>
              <input className={field} value={d.terms} onChange={(e) => set({ terms: e.target.value })} maxLength={2000} placeholder="Paid after registration…" />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={d.isActive} onChange={(e) => set({ isActive: e.target.checked })} /> Active
          </label>
          {error && <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200" role="alert">{error}</p>}
        </div>
        <div className="flex shrink-0 justify-end gap-2 border-t border-white/10 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button onClick={onClose} className="rounded-xl border border-white/15 px-4 py-2 text-sm hover:bg-white/10">Cancel</button>
          <button onClick={save} disabled={saving} className="inline-flex items-center gap-1.5 rounded-xl bg-sky-600 px-5 py-2 text-sm font-semibold hover:bg-sky-500 disabled:opacity-50">
            {saving && <Loader2 size={14} className="animate-spin" />} {d._id ? "Save changes" : "Create offer"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
