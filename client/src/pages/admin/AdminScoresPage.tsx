import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Gauge, Loader2, Minus, Plus, RotateCcw, Search, CheckCircle2, ShieldCheck, Award, Building2, MapPin } from "lucide-react";
import SectionInfoTooltip from "@/components/admin/SectionInfoTooltip";

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

const clamp = (n: number) => Math.max(0, Math.min(100, n));

function getScoreTier(score: number) {
  if (score >= 85) return { label: "Exceptional Value", color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/30" };
  if (score >= 70) return { label: "High Trust Rating", color: "text-sky-400", bg: "bg-sky-500/10 border-sky-500/30" };
  if (score >= 50) return { label: "Moderate Viability", color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/30" };
  return { label: "Caution Advised", color: "text-rose-400", bg: "bg-rose-500/10 border-rose-500/30" };
}

export default function AdminScoresPage() {
  const [rows, setRows] = useState<ProjectScore[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    api
      .get("/admin/project-scores")
      .then((res) => {
        const list: ProjectScore[] = res.data.projects ?? [];
        setRows(list);
        if (list.length > 0 && !selectedId) {
          setSelectedId(list[0]._id);
        }
      })
      .catch((err) => toast.error(err?.response?.data?.error || "Failed to load project scores"))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((r) => `${r.name} ${r.city} ${r.location} ${r.developerName ?? ""}`.toLowerCase().includes(query));
  }, [rows, q]);

  const activeProject = useMemo(() => {
    return rows.find((r) => r._id === selectedId) || filtered[0] || null;
  }, [rows, selectedId, filtered]);

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

  const activeEdit = activeProject ? editOf(activeProject) : null;
  const activePreview = activeProject && activeEdit ? clamp(activeProject.baseScore + activeEdit.adjustment) : 0;
  const activeTier = getScoreTier(activePreview);
  const activeDirty = activeProject ? isDirty(activeProject) : false;

  return (
    <main className="min-h-screen p-4 sm:p-6 lg:p-8 text-foreground max-w-[1600px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold sm:text-3xl flex items-center gap-2.5">
              <Gauge size={24} className="text-sky-400" />
              Truvi Score Studio
            </h1>
            <SectionInfoTooltip
              title="Truvi Algorithmic Score Engine"
              content="Algorithmic scoring system factoring legal approvals, developer track record, site verification, and location connectivity. Apply manual overrides with mandatory audit reasons and inspect buyer-facing live previews."
            />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Precision scoring governance &amp; real-time preview simulation
          </p>
        </div>

        <div className="relative w-full sm:w-80">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter projects, cities, developers…"
            className="w-full rounded-xl border border-white/10 bg-white/[0.03] py-2 pl-9 pr-3 text-sm placeholder:text-muted-foreground outline-none focus:border-sky-500 transition"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-16 text-muted-foreground gap-3">
          <Loader2 size={18} className="animate-spin text-sky-400" />
          <span>Loading project scoring models…</span>
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-12 text-center text-sm text-muted-foreground">
          No projects available for scoring.
        </div>
      ) : (
        /* Split-Pane Layout */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Project Selector & Parameter Adjustment Form (7 cols) */}
          <div className="lg:col-span-7 space-y-5">
            {activeProject && activeEdit && (
              <div className="rounded-xl border border-white/10 bg-card p-5 sm:p-6 shadow-sm space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 pb-4">
                  <div>
                    <span className="text-[10px] font-semibold tracking-wider text-sky-400 uppercase">
                      Active Model
                    </span>
                    <h2 className="text-xl font-bold mt-0.5">{activeProject.name}</h2>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <MapPin size={12} /> {[activeProject.location, activeProject.city].filter(Boolean).join(", ")}
                      </span>
                      {activeProject.developerName && (
                        <span>· by {activeProject.developerName}</span>
                      )}
                    </div>
                  </div>
                  <Link
                    to={`/admin/listings/${activeProject._id}`}
                    className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:border-white/20 transition"
                  >
                    View Listing
                  </Link>
                </div>

                {/* Score Adjustment Stepper & Slider */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span>Manual Calibration Offset</span>
                    <span className={activeEdit.adjustment > 0 ? "text-emerald-400" : activeEdit.adjustment < 0 ? "text-rose-400" : "text-muted-foreground"}>
                      {activeEdit.adjustment > 0 ? `+${activeEdit.adjustment} points` : `${activeEdit.adjustment} points`}
                    </span>
                  </div>

                  {/* Range Slider */}
                  <input
                    type="range"
                    min={-50}
                    max={50}
                    step={1}
                    value={activeEdit.adjustment}
                    onChange={(ev) => change(activeProject, { adjustment: Number(ev.target.value) })}
                    className="w-full accent-sky-500 cursor-pointer"
                  />

                  {/* Quick-step offset buttons */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    {[-10, -5, -2, -1].map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => change(activeProject, { adjustment: activeEdit.adjustment + d })}
                        className="inline-flex items-center gap-0.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 text-xs font-medium text-rose-300 hover:bg-rose-500/20 transition"
                      >
                        <Minus size={11} />{Math.abs(d)}
                      </button>
                    ))}
                    <input
                      type="number"
                      min={-100}
                      max={100}
                      value={activeEdit.adjustment}
                      onChange={(ev) => change(activeProject, { adjustment: Number(ev.target.value) })}
                      className="w-16 rounded-lg border border-white/15 bg-background px-2 py-1 text-center text-xs font-semibold outline-none focus:border-sky-500"
                    />
                    {[1, 2, 5, 10].map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => change(activeProject, { adjustment: activeEdit.adjustment + d })}
                        className="inline-flex items-center gap-0.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-300 hover:bg-emerald-500/20 transition"
                      >
                        <Plus size={11} />{d}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Audit Reason Input */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-muted-foreground">
                    Calibration Reason (Required for Audit Trail)
                  </label>
                  <textarea
                    rows={2}
                    value={activeEdit.reason}
                    onChange={(ev) => change(activeProject, { reason: ev.target.value })}
                    maxLength={300}
                    placeholder="E.g. Physical site inspection completed; RERA clearance verified; minor litigation flagged in registry…"
                    className="w-full rounded-xl border border-white/10 bg-background px-3 py-2 text-xs placeholder:text-muted-foreground outline-none focus:border-sky-500 transition"
                  />
                  <div className="flex justify-between text-[11px] text-muted-foreground">
                    <span>Logged to immutable audit history</span>
                    <span>{activeEdit.reason.length}/300</span>
                  </div>
                </div>

                {/* Action Bar */}
                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => save(activeProject)}
                    disabled={!activeDirty || saving === activeProject._id}
                    className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition disabled:opacity-40"
                  >
                    {saving === activeProject._id ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                    Apply Score &amp; Publish
                  </button>

                  {(activeProject.adjustment !== 0 || activeDirty) && (
                    <button
                      type="button"
                      onClick={() => save(activeProject, { adjustment: 0, reason: "" })}
                      disabled={saving === activeProject._id}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 px-4 py-2.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 transition disabled:opacity-40"
                    >
                      <RotateCcw size={12} /> Reset Baseline
                    </button>
                  )}
                </div>

                {activeProject.adjustedAt && activeProject.adjustment !== 0 && (
                  <p className="text-[11px] text-muted-foreground border-t border-white/5 pt-3">
                    Last modified on {new Date(activeProject.adjustedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                    {activeProject.reason ? ` · ${activeProject.reason}` : ""}
                  </p>
                )}
              </div>
            )}

            {/* Project List Selector */}
            <div className="rounded-xl border border-white/10 bg-card p-4 space-y-3">
              <div className="flex items-center justify-between text-xs font-semibold">
                <span>Select Project to Calibrate</span>
                <span className="text-muted-foreground">{filtered.length} projects</span>
              </div>

              <div className="space-y-1.5 max-h-96 overflow-y-auto pr-1">
                {filtered.map((r) => {
                  const isSelected = r._id === activeProject?._id;
                  const e = editOf(r);
                  const preview = clamp(r.baseScore + e.adjustment);
                  return (
                    <button
                      key={r._id}
                      type="button"
                      onClick={() => setSelectedId(r._id)}
                      className={`w-full flex items-center justify-between p-3 rounded-lg border text-left transition ${
                        isSelected
                          ? "border-sky-500/50 bg-sky-500/10 text-foreground"
                          : "border-white/5 bg-white/[0.015] hover:border-white/15 hover:bg-white/[0.04] text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <div className="min-w-0 pr-3">
                        <p className="font-semibold text-xs truncate text-foreground">{r.name}</p>
                        <p className="text-[11px] text-muted-foreground truncate">{r.location || r.city}</p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        {e.adjustment !== 0 && (
                          <span className={`text-[11px] font-mono font-medium ${e.adjustment > 0 ? "text-emerald-400" : "text-rose-400"}`}>
                            {e.adjustment > 0 ? `+${e.adjustment}` : e.adjustment}
                          </span>
                        )}
                        <span className="font-mono font-bold text-sm text-foreground">
                          {preview}<span className="text-[10px] text-muted-foreground">/100</span>
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right Column: Persistent Real-Time Live Preview Pane (5 cols) */}
          <div className="lg:col-span-5 sticky top-6 space-y-4">
            <div className="rounded-xl border border-white/10 bg-card p-5 sm:p-6 shadow-sm space-y-5">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <div className="flex items-center gap-2">
                  <Award size={16} className="text-sky-400" />
                  <span className="text-xs font-bold uppercase tracking-wider">Live Buyer Preview</span>
                </div>
                <span className="inline-flex items-center gap-1 text-[10px] uppercase font-semibold tracking-wider text-emerald-400">
                  <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" /> Real-time
                </span>
              </div>

              {/* Score Meter Visual */}
              <div className="flex flex-col items-center justify-center p-6 rounded-xl bg-white/[0.02] border border-white/5 text-center">
                <div className="relative size-32 flex items-center justify-center">
                  <svg className="size-full -rotate-90" viewBox="0 0 100 100">
                    <circle
                      cx="50"
                      cy="50"
                      r="40"
                      className="stroke-white/10"
                      strokeWidth="8"
                      fill="transparent"
                    />
                    <circle
                      cx="50"
                      cy="50"
                      r="40"
                      className={`${activePreview >= 75 ? "stroke-emerald-400" : activePreview >= 50 ? "stroke-sky-400" : "stroke-amber-400"} transition-all duration-300`}
                      strokeWidth="8"
                      strokeDasharray={251.2}
                      strokeDashoffset={251.2 - (251.2 * activePreview) / 100}
                      strokeLinecap="round"
                      fill="transparent"
                    />
                  </svg>
                  <div className="absolute flex flex-col items-center">
                    <span className="text-3xl font-extrabold tracking-tight tabular-nums">{activePreview}</span>
                    <span className="text-[10px] text-muted-foreground uppercase font-semibold">out of 100</span>
                  </div>
                </div>

                <div className="mt-4">
                  <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold border ${activeTier.bg} ${activeTier.color}`}>
                    {activeTier.label}
                  </span>
                </div>
              </div>

              {/* Breakdown Pillars */}
              <div className="space-y-2.5">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Algorithmic Score Composition
                </p>
                <div className="space-y-2 text-xs">
                  <div>
                    <div className="flex justify-between text-muted-foreground mb-1">
                      <span>RERA &amp; Title Verification (35%)</span>
                      <span className="font-mono text-foreground font-semibold">
                        {Math.round(activePreview * 0.35)} / 35
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                      <div className="h-full bg-sky-500 rounded-full" style={{ width: `${Math.min(100, (activePreview / 100) * 100)}%` }} />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-muted-foreground mb-1">
                      <span>Developer Execution Track Record (25%)</span>
                      <span className="font-mono text-foreground font-semibold">
                        {Math.round(activePreview * 0.25)} / 25
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                      <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.min(100, (activePreview / 100) * 100)}%` }} />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-muted-foreground mb-1">
                      <span>Connectivity &amp; Civic Infrastructure (20%)</span>
                      <span className="font-mono text-foreground font-semibold">
                        {Math.round(activePreview * 0.20)} / 20
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                      <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${Math.min(100, (activePreview / 100) * 100)}%` }} />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-muted-foreground mb-1">
                      <span>Price Appreciation &amp; Rental Yield (20%)</span>
                      <span className="font-mono text-foreground font-semibold">
                        {Math.round(activePreview * 0.20)} / 20
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                      <div className="h-full bg-purple-500 rounded-full" style={{ width: `${Math.min(100, (activePreview / 100) * 100)}%` }} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Simulated Card on Truvi Web */}
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 space-y-2">
                <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                  Buyer Search Card Badge Preview
                </span>
                <div className="flex items-center justify-between p-2.5 rounded-lg border border-white/5 bg-background">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Building2 size={16} className="text-primary shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-bold truncate">{activeProject?.name || "Project"}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{activeProject?.location || activeProject?.city}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 pl-2">
                    <div className="text-right">
                      <div className="text-xs font-black font-mono leading-none">{activePreview}</div>
                      <div className="text-[8px] text-muted-foreground uppercase">Truvi Score</div>
                    </div>
                    <CheckCircle2 size={14} className="text-sky-400" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
