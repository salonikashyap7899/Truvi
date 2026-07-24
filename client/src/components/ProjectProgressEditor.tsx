import { useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { HardHat, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { Label } from "@/components/ui/primitives";
import type { Project, ConstructionStatus, ProjectMilestone } from "@/types";

interface ProjectProgressEditorProps {
  project: Project;
  onUpdated?: (project: Project) => void;
}

const STATUSES: { value: ConstructionStatus; label: string }[] = [
  { value: "PLANNING", label: "Planning" },
  { value: "EXCAVATION", label: "Excavation" },
  { value: "FOUNDATION", label: "Foundation" },
  { value: "STRUCTURE", label: "Structure" },
  { value: "FINISHING", label: "Finishing" },
  { value: "COMPLETED", label: "Completed" },
];

/** ISO datetime → yyyy-mm-dd for a date input. */
function toDateInput(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

/**
 * Developer/admin editor for construction progress: phase, percent complete and
 * a milestone checklist. Persisted on the project and shown on the project and
 * founder dashboards. Empty progress stores null (honest "not reported" state).
 */
export default function ProjectProgressEditor({ project, onUpdated }: ProjectProgressEditorProps) {
  const [status, setStatus] = useState<ConstructionStatus | "">(project.constructionStatus ?? "");
  const [progress, setProgress] = useState<string>(
    typeof project.constructionProgress === "number" ? String(project.constructionProgress) : "",
  );
  const [milestones, setMilestones] = useState<ProjectMilestone[]>(
    project.milestones ? project.milestones.map((m) => ({ ...m })) : [],
  );
  const [saving, setSaving] = useState(false);

  function updateMs(i: number, patch: Partial<ProjectMilestone>) {
    setMilestones((prev) => prev.map((m, idx) => (idx === i ? { ...m, ...patch } : m)));
  }
  function addMs() {
    setMilestones((prev) => [...prev, { label: "", targetDate: null, done: false }]);
  }
  function removeMs(i: number) {
    setMilestones((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function save() {
    const progressNum = progress.trim() === "" ? null : Number(progress);
    if (progressNum !== null && (!Number.isFinite(progressNum) || progressNum < 0 || progressNum > 100)) {
      toast.error("Progress must be between 0 and 100");
      return;
    }
    const cleanedMs = milestones
      .map((m) => ({
        label: m.label.trim(),
        targetDate: m.targetDate ? new Date(m.targetDate).toISOString() : null,
        done: Boolean(m.done),
      }))
      .filter((m) => m.label);

    setSaving(true);
    try {
      const res = await api.patch(`/projects/${project._id}`, {
        constructionStatus: status || null,
        constructionProgress: progressNum,
        milestones: cleanedMs,
      });
      onUpdated?.(res.data.project);
      toast.success("Construction progress saved");
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to save progress");
    } finally {
      setSaving(false);
    }
  }

  const doneCount = milestones.filter((m) => m.done).length;

  return (
    <section className="mt-8 rounded-2xl border border-white/10 glass p-5">
      <div className="flex items-center gap-2">
        <HardHat size={16} className="text-amber-400" />
        <h2 className="text-lg font-medium">Construction Progress</h2>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Report the construction phase, percent complete and milestones. Shown to buyers and on the founder dashboard.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="cstatus">Construction phase</Label>
          <select
            id="cstatus"
            value={status}
            onChange={(e) => setStatus(e.target.value as ConstructionStatus | "")}
            className="mt-1 h-10 w-full rounded-md border border-white/15 bg-card px-2 text-sm text-white outline-none focus:border-amber-500"
          >
            <option value="">Not reported</option>
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="cprogress">Percent complete (0–100)</Label>
          <input
            id="cprogress"
            type="number"
            min={0}
            max={100}
            value={progress}
            onChange={(e) => setProgress(e.target.value)}
            placeholder="e.g. 45"
            className="mt-1 h-10 w-full rounded-md border border-white/15 bg-card px-2 text-sm text-white outline-none focus:border-amber-500"
          />
        </div>
      </div>

      {/* Progress bar preview */}
      {progress.trim() !== "" && Number.isFinite(Number(progress)) && (
        <div className="mt-3">
          <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-amber-500 to-emerald-500"
              style={{ width: `${Math.min(100, Math.max(0, Number(progress)))}%` }}
            />
          </div>
        </div>
      )}

      {/* Milestones */}
      <div className="mt-5">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-foreground/90">Milestones</span>
          {milestones.length > 0 && (
            <span className="text-xs text-muted-foreground">{doneCount}/{milestones.length} done</span>
          )}
        </div>
        <div className="mt-2 space-y-2">
          {milestones.length === 0 && (
            <p className="text-xs text-muted-foreground">No milestones yet — add key stages with target dates.</p>
          )}
          {milestones.map((m, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-card/50 p-2">
              <input
                type="checkbox"
                checked={m.done}
                onChange={(e) => updateMs(i, { done: e.target.checked })}
                className="h-4 w-4 accent-emerald-500"
                title="Mark done"
              />
              <input
                value={m.label}
                onChange={(e) => updateMs(i, { label: e.target.value })}
                placeholder="Milestone (e.g. Foundation complete)"
                className="h-8 min-w-0 flex-1 rounded-md border border-white/15 bg-card px-2 text-xs text-white outline-none focus:border-amber-500"
              />
              <input
                type="date"
                value={toDateInput(m.targetDate)}
                onChange={(e) => updateMs(i, { targetDate: e.target.value || null })}
                className="h-8 w-40 rounded-md border border-white/15 bg-card px-2 text-xs text-white outline-none focus:border-amber-500"
              />
              <button
                onClick={() => removeMs(i)}
                className="rounded-md p-1.5 text-red-400/70 hover:bg-red-500/10 hover:text-red-400"
                title="Remove"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
          <button
            onClick={addMs}
            className="inline-flex items-center gap-1 rounded-lg border border-dashed border-white/20 px-3 py-1.5 text-xs text-muted-foreground hover:border-amber-500/50 hover:text-amber-300"
          >
            <Plus size={13} /> Add milestone
          </button>
        </div>
      </div>

      <button
        onClick={save}
        disabled={saving}
        className="mt-5 inline-flex items-center gap-1.5 rounded-full border border-amber-700/60 px-4 py-2 text-sm font-medium text-amber-300 hover:bg-amber-900/20 disabled:opacity-50"
      >
        {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save progress
      </button>
    </section>
  );
}
