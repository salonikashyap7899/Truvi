import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Gauge, Loader2, Minus, Plus, RotateCcw, Search } from "lucide-react";

/**
 * Admin → Truvi Scores. Every project's Truvi Score is computed from its data
 * (approvals, site visit, market, location …). Here the admin can raise or
 * lower any project's score by a number of points after review, with an
 * internal reason. The adjusted score is what buyers see on listing cards and
 * in the score breakdown; it always stays within 0–100.
 */

interface ProjectScore {
  _id: string;
  name: string;
  city: string;
  location: string;
  approvalStatus: string;
  developerName: string | null;
  baseScore: number;
  adjustment: number;
  finalScore: number;
  reason: string | null;
  adjustedAt: string | null;
}

interface Edit {
  adjustment: number;
  reason: string;
}

const STATUS_TONE: Record<string, string> = {
  APPROVED: "text-emerald-300 bg-emerald-900/30 border-emerald-700/50",
  PENDING: "text-amber-300 bg-amber-900/30 border-amber-700/50",
  DRAFT: "text-muted-foreground bg-white/5 border-white/15",
  REJECTED: "text-rose-300 bg-rose-900/30 border-rose-700/50",
};

const clamp = (n: number) => Math.max(0, Math.min(100, n));

function scoreTone(score: number): string {
  if (score >= 80) return "text-emerald-400";
  if (score >= 60) return "text-sky-400";
  if (score >= 40) return "text-amber-400";
  return "text-rose-400";
}

export default function AdminScoresPage() {
  const [rows, setRows] = useState<ProjectScore[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    api
      .get("/admin/project-scores")
      .then((res) => setRows(res.data.projects ?? []))
      .catch((err) => toast.error(err?.response?.data?.error || "Failed to load project scores"))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((r) => `${r.name} ${r.city} ${r.location} ${r.developerName ?? ""}`.toLowerCase().includes(query));
  }, [rows, q]);

  const editOf = (r: ProjectScore): Edit => edits[r._id] ?? { adjustment: r.adjustment, reason: r.reason ?? "" };
  const isDirty = (r: ProjectScore) => {
    const e = edits[r._id];
    return !!e && (e.adjustment !== r.adjustment || e.reason !== (r.reason ?? ""));
  };

  function change(r: ProjectScore, patch: Partial<Edit>) {
    const cur = editOf(r);
    const next = { ...cur, ...patch };
    next.adjustment = Math.max(-100, Math.min(100, Math.round(next.adjustment) || 0));
    setEdits((m) => ({ ...m, [r._id]: next }));
  }

  async function save(r: ProjectScore, override?: Edit) {
    const e = override ?? editOf(r);
    setSaving(r._id);
    try {
      const res = await api.patch(`/admin/projects/${r._id}/score`, {
        adjustment: e.adjustment,
        reason: e.reason.trim() || undefined,
      });
      const s = res.data.score;
      setRows((list) => list.map((x) => (x._id === r._id ? { ...x, ...s } : x)));
      setEdits((m) => {
        const { [r._id]: _done, ...rest } = m;
        return rest;
      });
      toast.success(`${r.name}: Truvi Score is now ${s.finalScore}`);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Couldn't save the score");
    } finally {
      setSaving(null);
    }
  }

  return (
    <main className="min-h-screen p-6 text-white md:p-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold"><Gauge size={22} className="text-sky-400" /> Truvi Scores</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Each score is calculated from the project's data. Increase or decrease it after review — buyers see the
            adjusted score on listings (always between 0 and 100). The reason is internal and only visible to admins.
          </p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search projects, city, developer…"
            className="w-full rounded-xl border border-white/15 bg-white/[0.04] py-2 pl-9 pr-3 text-sm text-white placeholder:text-muted-foreground outline-none focus:border-sky-500"
          />
        </div>
      </div>

      {loading ? (
        <p className="mt-8 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 size={15} className="animate-spin" /> Loading scores…</p>
      ) : filtered.length === 0 ? (
        <p className="mt-8 text-sm text-muted-foreground">{rows.length === 0 ? "No projects yet." : "No projects match your search."}</p>
      ) : (
        <div className="mt-6 space-y-3">
          {filtered.map((r) => {
            const e = editOf(r);
            const preview = clamp(r.baseScore + e.adjustment);
            const dirty = isDirty(r);
            return (
              <div key={r._id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <Link to={`/admin/listings/${r._id}`} className="font-medium text-white hover:underline">{r.name}</Link>
                    <span className={`ml-2 rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATUS_TONE[r.approvalStatus] ?? STATUS_TONE.DRAFT}`}>
                      {r.approvalStatus === "PENDING" ? "In review" : r.approvalStatus.charAt(0) + r.approvalStatus.slice(1).toLowerCase()}
                    </span>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {[r.location, r.city].filter(Boolean).join(", ")}{r.developerName ? ` · by ${r.developerName}` : ""}
                    </p>
                  </div>

                  {/* Calculated → adjustment → final */}
                  <div className="flex items-center gap-4 text-center">
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Calculated</p>
                      <p className="text-lg font-semibold text-white/80">{r.baseScore}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Adjustment</p>
                      <p className={`text-lg font-semibold ${e.adjustment > 0 ? "text-emerald-400" : e.adjustment < 0 ? "text-rose-400" : "text-white/60"}`}>
                        {e.adjustment > 0 ? `+${e.adjustment}` : e.adjustment}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Truvi Score</p>
                      <p className={`text-2xl font-bold ${scoreTone(preview)}`}>{preview}<span className="text-xs text-white/40">/100</span></p>
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1">
                    {[-10, -5, -1].map((d) => (
                      <button key={d} type="button" onClick={() => change(r, { adjustment: e.adjustment + d })}
                        className="inline-flex items-center gap-0.5 rounded-lg border border-rose-700/50 bg-rose-900/20 px-2.5 py-1.5 text-xs font-semibold text-rose-200 hover:bg-rose-900/40">
                        <Minus size={11} />{Math.abs(d)}
                      </button>
                    ))}
                    <input
                      type="number"
                      min={-100}
                      max={100}
                      value={e.adjustment}
                      onChange={(ev) => change(r, { adjustment: Number(ev.target.value) })}
                      aria-label={`Adjustment for ${r.name}`}
                      className="w-16 rounded-lg border border-white/15 bg-white/[0.04] px-2 py-1.5 text-center text-sm text-white outline-none focus:border-sky-500"
                    />
                    {[1, 5, 10].map((d) => (
                      <button key={d} type="button" onClick={() => change(r, { adjustment: e.adjustment + d })}
                        className="inline-flex items-center gap-0.5 rounded-lg border border-emerald-700/50 bg-emerald-900/20 px-2.5 py-1.5 text-xs font-semibold text-emerald-200 hover:bg-emerald-900/40">
                        <Plus size={11} />{d}
                      </button>
                    ))}
                  </div>
                  <input
                    value={e.reason}
                    onChange={(ev) => change(r, { reason: ev.target.value })}
                    maxLength={300}
                    placeholder="Reason (internal) — e.g. site visit confirmed, litigation found…"
                    className="min-w-[200px] flex-1 rounded-lg border border-white/15 bg-white/[0.04] px-3 py-1.5 text-sm text-white placeholder:text-muted-foreground outline-none focus:border-sky-500"
                  />
                  <button
                    type="button"
                    onClick={() => save(r)}
                    disabled={!dirty || saving === r._id}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {saving === r._id && <Loader2 size={13} className="animate-spin" />} Save
                  </button>
                  {(r.adjustment !== 0 || dirty) && (
                    <button
                      type="button"
                      onClick={() => save(r, { adjustment: 0, reason: "" })}
                      disabled={saving === r._id}
                      title="Remove the adjustment and use the calculated score"
                      className="inline-flex items-center gap-1 rounded-lg border border-white/15 px-3 py-1.5 text-xs text-muted-foreground hover:bg-white/10 hover:text-white disabled:opacity-40"
                    >
                      <RotateCcw size={12} /> Reset
                    </button>
                  )}
                </div>
                {r.adjustedAt && r.adjustment !== 0 && (
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Adjusted {new Date(r.adjustedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                    {r.reason ? ` · ${r.reason}` : ""}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
