import { createPortal } from "react-dom";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  CalendarDays, ChevronLeft, ChevronRight, Clock, Gift, History, Inbox, Loader2, Phone, Search, Users, X,
} from "lucide-react";
import { api } from "@/lib/api";
import { useBodyScrollLock } from "@/lib/useBodyScrollLock";
import {
  formatDate, formatTime, LEAD_STATUS_LABEL, LEAD_STATUS_TONE, ROLE_LABEL, timeSlots,
} from "@/components/leads/inventoryLeadShared";

/**
 * Admin → Lead Management. Every lead on the platform (inventory leads from
 * Buyers, Channel Partners and Ambassadors, plus existing CP pipeline leads),
 * with filters, dashboard counts, breakdowns, status updates and the full
 * history of each lead. All data comes from admin-only APIs.
 */

interface LeadRow {
  _id: string;
  leadId: string;
  clientName: string;
  clientPhone: string;
  requirement: string | null;
  notes: string | null;
  visitDate: string | null;
  visitTime: string | null;
  status: string;
  sourceRole: string | null;
  createdAt: string;
  project: { _id: string; name: string } | null;
  unit: { _id: string; unitNumber: string; type: string } | null;
  creator: { _id: string; name: string } | null;
  offerName: string | null;
}

interface Stats {
  totals: { total: number; new: number; visitsScheduled: number; visitsCompleted: number; converted: number; lost: number; today: number };
  byRole: { role: string | null; count: number }[];
  byProject: { _id: string; name: string; count: number }[];
  byInventory: { _id: string; unitNumber: string; type: string; project: string; count: number }[];
  byCreator: { _id: string; name: string; role: string | null; count: number }[];
}

interface FilterOptions {
  projects: { _id: string; name: string }[];
  units: { _id: string; unitNumber: string; projectId: string }[];
  creators: { _id: string; name: string; role: string | null }[];
}

interface Filters {
  q: string;
  status: string;
  projectId: string;
  unitId: string;
  role: string;
  creatorId: string;
  visitFrom: string;
  visitTo: string;
}

const EMPTY: Filters = { q: "", status: "", projectId: "", unitId: "", role: "", creatorId: "", visitFrom: "", visitTo: "" };
const STATUSES = Object.keys(LEAD_STATUS_LABEL);
const LIMIT = 25;
const sel =
  "min-w-0 rounded-xl border border-white/12 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none focus:border-sky-500 [&>option]:bg-[#0a0d14] [color-scheme:dark]";

function StatusChip({ status }: { status: string }) {
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${LEAD_STATUS_TONE[status] ?? "border-white/15 text-white/70"}`}>
      {LEAD_STATUS_LABEL[status] ?? status}
    </span>
  );
}

function visitText(d: string | null, t: string | null) {
  if (!d) return "—";
  return `${formatDate(d, { day: "numeric", month: "short", year: "numeric" })}${t ? ` · ${formatTime(t)}` : ""}`;
}

export default function AdminLeadsPage() {
  const [params, setParams] = useSearchParams();
  const [filters, setFilters] = useState<Filters>(() => ({ ...EMPTY, status: params.get("status") ?? "" }));
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<LeadRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Stats | null>(null);
  const [options, setOptions] = useState<FilterOptions>({ projects: [], units: [], creators: [] });
  const [showBreakdown, setShowBreakdown] = useState(false);
  const openId = params.get("lead");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    api.get("/leads/admin/stats").then((r) => setStats(r.data)).catch(() => {});
    api.get("/leads/admin/filters").then((r) => setOptions(r.data)).catch(() => {});
  }, [reloadKey]);

  // Debounced search box.
  useEffect(() => {
    const t = setTimeout(() => setFilters((f) => (f.q === q ? f : { ...f, q })), 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => setPage(1), [filters]);

  useEffect(() => {
    setLoading(true);
    const p: Record<string, string | number> = { page, limit: LIMIT };
    for (const [k, v] of Object.entries(filters)) if (v) p[k] = v;
    api
      .get("/leads/admin/list", { params: p })
      .then((r) => { setRows(r.data.leads); setTotal(r.data.total); })
      .catch((err) => toast.error(err?.response?.data?.error || "Couldn't load leads"))
      .finally(() => setLoading(false));
  }, [filters, page, reloadKey]);

  const set = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }));
  const activeFilters = Object.entries(filters).filter(([k, v]) => k !== "q" && v).length;
  const units = options.units.filter((u) => !filters.projectId || u.projectId === filters.projectId);
  const creators = options.creators.filter((c) => !filters.role || c.role === filters.role);
  const pages = Math.max(1, Math.ceil(total / LIMIT));

  function openLead(id: string | null) {
    const next = new URLSearchParams(params);
    if (id) next.set("lead", id);
    else next.delete("lead");
    setParams(next, { replace: true });
  }

  const t = stats?.totals;
  const kpis: { label: string; value: number | undefined; status?: string; tone: string }[] = [
    { label: "Total leads", value: t?.total, tone: "text-white" },
    { label: "New", value: t?.new, status: "NEW", tone: "text-sky-300" },
    { label: "Visits scheduled", value: t?.visitsScheduled, status: "SITE_VISIT_SCHEDULED", tone: "text-amber-300" },
    { label: "Visits completed", value: t?.visitsCompleted, status: "SITE_VISIT_COMPLETED", tone: "text-teal-300" },
    { label: "Converted", value: t?.converted, status: "CONVERTED", tone: "text-emerald-300" },
  ];

  return (
    <main className="min-h-screen p-4 text-white sm:p-6 md:p-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold"><Inbox size={22} className="text-sky-400" /> Lead Management</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Every lead from inventory (Buyers, Channel Partners, Ambassadors) and the CP pipeline — with the site visit, status and full history.
          </p>
        </div>
        {t && <p className="text-xs text-muted-foreground">{t.today} new today</p>}
      </div>

      {/* Dashboard counts */}
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {kpis.map((k) => (
          <button
            key={k.label}
            onClick={() => set({ status: k.status ?? "" })}
            className={`rounded-2xl border p-3.5 text-left transition hover:bg-white/[0.06] ${filters.status === (k.status ?? "") && (k.status || !filters.status) ? "border-sky-500/50 bg-sky-500/[0.07]" : "border-white/10 bg-white/[0.03]"}`}
          >
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{k.label}</p>
            <p className={`mt-1 text-2xl font-bold ${k.tone}`}>{k.value ?? "—"}</p>
          </button>
        ))}
      </div>

      {/* Breakdowns */}
      {stats && (
        <div className="mt-3">
          <button onClick={() => setShowBreakdown((v) => !v)} className="text-xs font-medium text-sky-300 hover:underline">
            {showBreakdown ? "Hide" : "Show"} leads by Buyer · CP · Ambassador · Project · Inventory
          </button>
          {showBreakdown && <Breakdown stats={stats} onPick={set} />}
        </div>
      )}

      {/* Filters */}
      <div className="mt-5 space-y-2.5 rounded-2xl border border-white/10 bg-white/[0.02] p-3">
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, mobile or Lead ID…" className={`${sel} w-full pl-9`} />
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
          <select aria-label="Status" value={filters.status} onChange={(e) => set({ status: e.target.value })} className={sel}>
            <option value="">All statuses</option>
            {STATUSES.map((s) => <option key={s} value={s}>{LEAD_STATUS_LABEL[s]}</option>)}
          </select>
          <select aria-label="Project" value={filters.projectId} onChange={(e) => set({ projectId: e.target.value, unitId: "" })} className={sel}>
            <option value="">All projects</option>
            {options.projects.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
          </select>
          <select aria-label="Inventory" value={filters.unitId} onChange={(e) => set({ unitId: e.target.value })} className={sel}>
            <option value="">All inventory</option>
            {units.map((u) => <option key={u._id} value={u._id}>{u.unitNumber}</option>)}
          </select>
          <select aria-label="Source" value={filters.role} onChange={(e) => set({ role: e.target.value, creatorId: "" })} className={sel}>
            <option value="">All sources</option>
            <option value="BUYER">Buyer</option>
            <option value="CP">Channel Partner</option>
            <option value="AMBASSADOR">Ambassador</option>
          </select>
          <select aria-label="Added by" value={filters.creatorId} onChange={(e) => set({ creatorId: e.target.value })} className={sel}>
            <option value="">Anyone</option>
            {creators.map((c) => <option key={`${c._id}${c.role}`} value={c._id}>{c.name}{c.role ? ` (${ROLE_LABEL[c.role] ?? c.role})` : ""}</option>)}
          </select>
          <input type="date" aria-label="Visit from" title="Site visit from" value={filters.visitFrom} onChange={(e) => set({ visitFrom: e.target.value })} className={sel} />
          <input type="date" aria-label="Visit to" title="Site visit to" value={filters.visitTo} onChange={(e) => set({ visitTo: e.target.value })} className={sel} />
        </div>
        {(activeFilters > 0 || q) && (
          <button onClick={() => { setQ(""); setFilters(EMPTY); }} className="text-xs text-muted-foreground hover:text-white">Clear all filters</button>
        )}
      </div>

      {/* List */}
      <div className="mt-4">
        {loading ? (
          <p className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 size={15} className="animate-spin" /> Loading leads…</p>
        ) : rows.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">No leads match these filters.</p>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden overflow-hidden rounded-2xl border border-white/10 lg:block">
              <table className="w-full text-left text-sm">
                <thead className="bg-white/[0.04] text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2.5">Lead</th>
                    <th className="px-3 py-2.5">Customer</th>
                    <th className="px-3 py-2.5">Project · Inventory</th>
                    <th className="px-3 py-2.5">Source</th>
                    <th className="px-3 py-2.5">Site visit</th>
                    <th className="px-3 py-2.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/8">
                  {rows.map((r) => (
                    <tr key={r._id} onClick={() => openLead(r._id)} className="cursor-pointer hover:bg-white/[0.04]">
                      <td className="px-3 py-2.5">
                        <p className="font-mono text-xs text-white/80">{r.leadId}</p>
                        <p className="text-[11px] text-muted-foreground">{new Date(r.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</p>
                      </td>
                      <td className="px-3 py-2.5">
                        <p className="font-medium">{r.clientName}</p>
                        <p className="text-xs text-muted-foreground">{r.clientPhone}</p>
                      </td>
                      <td className="max-w-[220px] px-3 py-2.5">
                        <p className="truncate">{r.project?.name ?? "—"}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {r.unit ? `${r.unit.unitNumber} · ${r.unit.type}` : "Whole project"}
                          {r.offerName && <span className="ml-1 text-amber-300">· 🎁 {r.offerName}</span>}
                        </p>
                      </td>
                      <td className="px-3 py-2.5">
                        <p>{ROLE_LABEL[r.sourceRole ?? ""] ?? "—"}</p>
                        <p className="text-xs text-muted-foreground">{r.creator?.name}</p>
                      </td>
                      <td className="px-3 py-2.5 text-xs">{visitText(r.visitDate, r.visitTime)}</td>
                      <td className="px-3 py-2.5"><StatusChip status={r.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="space-y-2.5 lg:hidden">
              {rows.map((r) => (
                <button key={r._id} onClick={() => openLead(r._id)} className="w-full rounded-2xl border border-white/10 bg-white/[0.03] p-3.5 text-left">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{r.clientName}</p>
                      <p className="text-xs text-muted-foreground">{r.clientPhone} · <span className="font-mono">{r.leadId}</span></p>
                    </div>
                    <StatusChip status={r.status} />
                  </div>
                  <p className="mt-2 truncate text-xs text-white/75">{r.project?.name ?? "—"}{r.unit ? ` · ${r.unit.unitNumber}` : ""}</p>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                    <span>{ROLE_LABEL[r.sourceRole ?? ""] ?? "—"} · {r.creator?.name}</span>
                    <span className="flex items-center gap-1"><CalendarDays size={11} /> {visitText(r.visitDate, r.visitTime)}</span>
                  </div>
                </button>
              ))}
            </div>

            <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
              <span>{total} lead{total === 1 ? "" : "s"}</span>
              <div className="flex items-center gap-2">
                <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="grid size-8 place-items-center rounded-lg border border-white/15 disabled:opacity-30" aria-label="Previous page"><ChevronLeft size={15} /></button>
                <span>Page {page} of {pages}</span>
                <button disabled={page >= pages} onClick={() => setPage((p) => p + 1)} className="grid size-8 place-items-center rounded-lg border border-white/15 disabled:opacity-30" aria-label="Next page"><ChevronRight size={15} /></button>
              </div>
            </div>
          </>
        )}
      </div>

      {openId && <LeadDrawer id={openId} onClose={() => openLead(null)} onChanged={() => setReloadKey((k) => k + 1)} />}
    </main>
  );
}

function Breakdown({ stats, onPick }: { stats: Stats; onPick: (f: Partial<Filters>) => void }) {
  const roleCount = (r: string) => stats.byRole.find((x) => x.role === r)?.count ?? 0;
  const groups = useMemo(
    () => (["BUYER", "CP", "AMBASSADOR"] as const).map((role) => ({ role, people: stats.byCreator.filter((c) => c.role === role).slice(0, 5) })),
    [stats],
  );
  const box = "rounded-2xl border border-white/10 bg-white/[0.03] p-3.5";
  return (
    <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
      {groups.map((g) => (
        <div key={g.role} className={box}>
          <button onClick={() => onPick({ role: g.role, creatorId: "" })} className="flex w-full items-center justify-between text-left">
            <span className="flex items-center gap-1.5 text-xs font-semibold"><Users size={13} /> By {ROLE_LABEL[g.role]}</span>
            <span className="text-lg font-bold">{roleCount(g.role)}</span>
          </button>
          <div className="mt-2 space-y-1">
            {g.people.length === 0 && <p className="text-[11px] text-muted-foreground">No leads yet</p>}
            {g.people.map((p) => (
              <button key={p._id} onClick={() => onPick({ role: g.role, creatorId: p._id })} className="flex w-full justify-between gap-2 text-left text-xs text-white/75 hover:text-white">
                <span className="truncate">{p.name}</span><span>{p.count}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
      <div className={box}>
        <p className="text-xs font-semibold">By project</p>
        <div className="mt-2 space-y-1">
          {stats.byProject.length === 0 && <p className="text-[11px] text-muted-foreground">No leads yet</p>}
          {stats.byProject.map((p) => (
            <button key={p._id} onClick={() => onPick({ projectId: p._id, unitId: "" })} className="flex w-full justify-between gap-2 text-left text-xs text-white/75 hover:text-white">
              <span className="truncate">{p.name}</span><span>{p.count}</span>
            </button>
          ))}
        </div>
      </div>
      <div className={box}>
        <p className="text-xs font-semibold">By inventory</p>
        <div className="mt-2 space-y-1">
          {stats.byInventory.length === 0 && <p className="text-[11px] text-muted-foreground">No unit-level leads yet</p>}
          {stats.byInventory.map((u) => (
            <button key={u._id} onClick={() => onPick({ unitId: u._id })} className="flex w-full justify-between gap-2 text-left text-xs text-white/75 hover:text-white">
              <span className="truncate">{u.unitNumber} · {u.project}</span><span>{u.count}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Lead detail drawer: everything about one lead + status update ────────── */

interface LeadDetail {
  lead: {
    _id: string; leadId: string; status: string; stage: string; sourceRole: string | null;
    clientName: string; clientPhone: string; clientEmail: string | null; requirement: string | null; notes: string | null;
    visitDate: string | null; visitTime: string | null; referralCode: string | null; lostReason: string | null; createdAt: string; source: string;
  };
  project: { _id: string; name: string; city: string; location: string } | null;
  unit: { _id: string; unitNumber: string; type: string; areaSqft: number; price: number; status: string } | null;
  creator: { _id: string; name: string; email: string; phone: string | null; role: string; referralCode: string | null } | null;
  assignee: { _id: string; name: string } | null;
  referral: { level: number; user: { _id: string; name: string; role: string; referralCode: string | null } | null }[];
  offer: { name: string; badge: string; estimatedReward: number | null } | null;
  visits: { _id: string; scheduledAt: string; timeSlot: string | null; status: string }[];
  activities: { _id: string; type: string; content: string; createdAt: string; by: string | null }[];
}

const SLOTS = timeSlots("08:00", "20:00");

function LeadDrawer({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  useBodyScrollLock(true);
  const [d, setD] = useState<LeadDetail | null>(null);
  const [status, setStatus] = useState("");
  const [note, setNote] = useState("");
  const [visitDate, setVisitDate] = useState("");
  const [visitTime, setVisitTime] = useState("");
  const [saving, setSaving] = useState(false);

  function load() {
    api
      .get(`/leads/admin/${id}`)
      .then((r) => {
        setD(r.data);
        setStatus(r.data.lead.status);
        setVisitDate(r.data.lead.visitDate ?? "");
        setVisitTime(r.data.lead.visitTime ?? "");
      })
      .catch((err) => { toast.error(err?.response?.data?.error || "Couldn't open this lead"); onClose(); });
  }
  useEffect(load, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const rescheduled = !!d && status === "SITE_VISIT_SCHEDULED" && (visitDate !== (d.lead.visitDate ?? "") || visitTime !== (d.lead.visitTime ?? ""));
  const dirty = !!d && (status !== d.lead.status || rescheduled || !!note.trim());

  async function save() {
    if (!d) return;
    setSaving(true);
    try {
      await api.patch(`/leads/admin/${id}/status`, {
        status,
        note: note.trim() || undefined,
        ...(rescheduled && visitDate && visitTime ? { visitDate, visitTime } : {}),
      });
      toast.success(`Status set to ${LEAD_STATUS_LABEL[status]}`);
      setNote("");
      load();
      onChanged();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Couldn't update the lead");
    } finally {
      setSaving(false);
    }
  }

  const row = (label: string, value: React.ReactNode) => (
    <div className="flex justify-between gap-3 py-1.5 text-sm">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 text-right">{value}</span>
    </div>
  );
  const section = "rounded-2xl border border-white/10 bg-white/[0.03] p-4";

  return createPortal(
    <div className="fixed inset-0 z-[100] flex justify-end" role="dialog" aria-modal="true" aria-label="Lead details">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-xl flex-col bg-[#0a0d14] text-white shadow-2xl sm:border-l sm:border-white/10">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-white/10 px-5 py-4 pt-[max(1rem,env(safe-area-inset-top))]">
          <div className="min-w-0">
            <p className="font-mono text-xs text-sky-300">{d?.lead.leadId ?? "…"}</p>
            <p className="truncate text-lg font-semibold">{d?.lead.clientName ?? "Loading…"}</p>
            {d && <div className="mt-1"><StatusChip status={d.lead.status} /></div>}
          </div>
          <button onClick={onClose} aria-label="Close" className="grid size-9 shrink-0 place-items-center rounded-full border border-white/15 hover:bg-white/10"><X size={16} /></button>
        </div>

        {!d ? (
          <p className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 size={15} className="animate-spin" /> Loading…</p>
        ) : (
          <div className="flex-1 space-y-3 overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <div className={section}>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Customer</p>
              {row("Name", d.lead.clientName)}
              {row("Mobile", <a href={`tel:${d.lead.clientPhone}`} className="inline-flex items-center gap-1 text-sky-300 hover:underline"><Phone size={12} /> {d.lead.clientPhone}</a>)}
              {d.lead.clientEmail && row("Email", d.lead.clientEmail)}
              {row("Requirement", d.lead.requirement || "—")}
              {d.lead.notes && row("Notes", <span className="whitespace-pre-line">{d.lead.notes}</span>)}
              {d.lead.lostReason && row("Lost reason", d.lead.lostReason)}
            </div>

            <div className={section}>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Project & inventory</p>
              {row("Project", d.project ? `${d.project.name}${d.project.city ? `, ${d.project.city}` : ""}` : "—")}
              {row("Inventory", d.unit ? `${d.unit.unitNumber} · ${d.unit.type} · ${Math.round(d.unit.areaSqft).toLocaleString("en-IN")} sq ft` : "Whole project")}
              {d.unit && d.unit.price > 0 && row("Price", `₹${Math.round(d.unit.price).toLocaleString("en-IN")}`)}
              {d.offer && row("Offer", (
                <span className="inline-flex items-center gap-1 text-amber-200"><Gift size={12} /> {d.offer.badge}
                  {d.offer.estimatedReward != null && <b className="ml-1 text-emerald-300">≈ ₹{d.offer.estimatedReward.toLocaleString("en-IN")}</b>}
                </span>
              ))}
            </div>

            <div className={section}>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Source</p>
              {row("Added by", d.creator ? `${d.creator.name} · ${ROLE_LABEL[d.lead.sourceRole ?? ""] ?? d.creator.role}` : "—")}
              {d.creator?.phone && row("Their mobile", d.creator.phone)}
              {d.creator?.email && row("Their email", d.creator.email)}
              {d.lead.referralCode && row(d.lead.sourceRole === "AMBASSADOR" ? "Ambassador ID" : "Referral code", <span className="font-mono">{d.lead.referralCode}</span>)}
              {d.referral.map((l) => row(`Referral L${l.level}`, l.user ? `${l.user.name} (${ROLE_LABEL[l.user.role] ?? l.user.role})` : "—"))}
              {d.assignee && row("Working it", d.assignee.name)}
              {row("Created", new Date(d.lead.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }))}
            </div>

            <div className={section}>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Site visit</p>
              {row("Requested", visitText(d.lead.visitDate, d.lead.visitTime))}
              {d.visits.map((v) => row(
                new Date(v.scheduledAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }),
                <span className="text-xs">{v.timeSlot ?? ""} · {v.status.replace("_", " ").toLowerCase()}</span>,
              ))}
            </div>

            {/* Status update */}
            <div className={`${section} border-sky-500/25`}>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Update status</p>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                {STATUSES.map((s) => (
                  <button
                    key={s}
                    onClick={() => setStatus(s)}
                    className={`rounded-lg border px-2 py-1.5 text-[11px] font-medium transition ${status === s ? LEAD_STATUS_TONE[s] : "border-white/10 text-white/60 hover:bg-white/[0.05]"}`}
                  >
                    {LEAD_STATUS_LABEL[s]}
                  </button>
                ))}
              </div>
              {status === "SITE_VISIT_SCHEDULED" && (
                <div className="mt-2.5 grid grid-cols-2 gap-2">
                  <label className="text-[11px] text-muted-foreground">
                    <span className="mb-1 flex items-center gap-1"><CalendarDays size={11} /> Visit date</span>
                    <input type="date" value={visitDate} onChange={(e) => setVisitDate(e.target.value)} className={`${sel} w-full`} />
                  </label>
                  <label className="text-[11px] text-muted-foreground">
                    <span className="mb-1 flex items-center gap-1"><Clock size={11} /> Time</span>
                    <select value={visitTime} onChange={(e) => setVisitTime(e.target.value)} className={`${sel} w-full`}>
                      <option value="">—</option>
                      {SLOTS.map((t) => <option key={t} value={t}>{formatTime(t)}</option>)}
                    </select>
                  </label>
                </div>
              )}
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={500}
                placeholder={status === "LOST" ? "Why was it lost? (optional)" : "Note for the history (optional)"}
                className={`${sel} mt-2.5 w-full`}
              />
              <button
                onClick={save}
                disabled={!dirty || saving}
                className="mt-2.5 inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-sky-600 py-2.5 text-sm font-semibold hover:bg-sky-500 disabled:opacity-40"
              >
                {saving && <Loader2 size={14} className="animate-spin" />} Save
              </button>
            </div>

            <div className={section}>
              <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"><History size={12} /> History</p>
              {d.activities.length === 0 ? (
                <p className="text-xs text-muted-foreground">No activity yet.</p>
              ) : (
                <ol className="relative space-y-3 border-l border-white/10 pl-4">
                  {d.activities.map((a) => (
                    <li key={a._id} className="text-xs">
                      <span className="absolute -left-[4.5px] mt-1 size-2 rounded-full bg-sky-400" />
                      <p className="text-white/85">{a.content}</p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">
                        {new Date(a.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}{a.by ? ` · ${a.by}` : ""}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        )}
      </aside>
    </div>,
    document.body,
  );
}
