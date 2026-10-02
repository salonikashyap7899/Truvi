import { useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { History, Loader2, Plus, Save, Trash2, TrendingUp } from "lucide-react";
import { Label } from "@/components/ui/primitives";
import type { Project, OwnerHistoryEntry, AppreciationForecast } from "@/types";

interface OwnershipGrowthEditorProps {
  project: Project;
  onUpdated?: (project: Project) => void;
}

type OutlookValue = "" | "Strong" | "Moderate" | "Stable";

/**
 * Admin-only editor for a project's Truvi-verified ownership history and
 * appreciation forecast. Both persist on the project and drive the public
 * intelligence cards. Clearing everything stores null (empty state on the card).
 */
export default function OwnershipGrowthEditor({ project, onUpdated }: OwnershipGrowthEditorProps) {
  const [owners, setOwners] = useState<OwnerHistoryEntry[]>(
    project.ownerHistory ? project.ownerHistory.map((o) => ({ ...o })) : [],
  );
  const [pct, setPct] = useState<string>(
    project.appreciationForecast ? String(project.appreciationForecast.fiveYearPct) : "",
  );
  const [outlook, setOutlook] = useState<OutlookValue>(project.appreciationForecast?.outlook ?? "");
  const [note, setNote] = useState<string>(project.appreciationForecast?.note ?? "");
  const [saving, setSaving] = useState(false);

  function updateOwner(i: number, patch: Partial<OwnerHistoryEntry>) {
    setOwners((prev) => prev.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }
  function addOwner() {
    setOwners((prev) => [...prev, { ownerLabel: "", startYear: new Date().getFullYear(), endYear: null }]);
  }
  function removeOwner(i: number) {
    setOwners((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function save() {
    // Owner history: keep only rows with a label and a valid start year.
    const cleanedOwners = owners
      .map((o) => ({
        ownerLabel: o.ownerLabel.trim(),
        startYear: Number(o.startYear),
        endYear: o.endYear === null || String(o.endYear) === "" ? null : Number(o.endYear),
      }))
      .filter((o) => o.ownerLabel && Number.isFinite(o.startYear) && o.startYear > 1900);

    // Appreciation: only send a forecast when a numeric percentage is entered.
    const pctNum = pct.trim() === "" ? null : Number(pct);
    let forecast: AppreciationForecast | null = null;
    if (pctNum !== null) {
      if (!Number.isFinite(pctNum)) {
        toast.error("Enter a valid appreciation percentage");
        return;
      }
      forecast = { fiveYearPct: pctNum, ...(outlook ? { outlook } : {}), ...(note.trim() ? { note: note.trim() } : {}) };
    }

    setSaving(true);
    try {
      const res = await api.patch(`/projects/${project._id}`, {
        ownerHistory: cleanedOwners,
        appreciationForecast: forecast,
      });
      onUpdated?.(res.data.project);
      toast.success("Ownership & growth saved");
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mt-8 rounded-2xl border border-white/10 glass p-5">
      <h2 className="text-lg font-medium">Ownership &amp; Growth</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Truvi-verified ownership history and appreciation forecast shown to buyers. Leave blank to show an empty state.
      </p>

      {/* Owner history */}
      <div className="mt-4">
        <div className="flex items-center gap-2">
          <History size={15} className="text-indigo-400" />
          <span className="text-sm font-medium text-foreground/90">Ownership history</span>
        </div>
        <div className="mt-2 space-y-2">
          {owners.length === 0 && (
            <p className="text-xs text-muted-foreground">No records yet — add each owner with the years they held the property.</p>
          )}
          {owners.map((row, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-card/50 p-2">
              <input
                value={row.ownerLabel}
                onChange={(e) => updateOwner(i, { ownerLabel: e.target.value })}
                placeholder="Owner label (e.g. Current Owner)"
                className="h-8 min-w-0 flex-1 rounded-md border border-white/15 bg-card px-2 text-xs text-white outline-none focus:border-indigo-500"
              />
              <input
                type="number"
                value={row.startYear}
                onChange={(e) => updateOwner(i, { startYear: Number(e.target.value) })}
                placeholder="From"
                className="h-8 w-20 rounded-md border border-white/15 bg-card px-2 text-xs text-white outline-none focus:border-indigo-500"
              />
              <input
                type="number"
                value={row.endYear ?? ""}
                onChange={(e) => updateOwner(i, { endYear: e.target.value === "" ? null : Number(e.target.value) })}
                placeholder="To (blank = present)"
                className="h-8 w-36 rounded-md border border-white/15 bg-card px-2 text-xs text-white outline-none focus:border-indigo-500"
              />
              <button
                onClick={() => removeOwner(i)}
                className="rounded-md p-1.5 text-red-400/70 hover:bg-red-500/10 hover:text-red-400"
                title="Remove"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
          <button
            onClick={addOwner}
            className="inline-flex items-center gap-1 rounded-lg border border-dashed border-white/20 px-3 py-1.5 text-xs text-muted-foreground hover:border-indigo-500/50 hover:text-indigo-300"
          >
            <Plus size={13} /> Add owner
          </button>
        </div>
      </div>

      {/* Appreciation forecast */}
      <div className="mt-6">
        <div className="flex items-center gap-2">
          <TrendingUp size={15} className="text-emerald-400" />
          <span className="text-sm font-medium text-foreground/90">Appreciation forecast</span>
        </div>
        <div className="mt-2 grid gap-4 sm:grid-cols-3">
          <div>
            <Label htmlFor="pct">5-year appreciation (%)</Label>
            <input
              id="pct"
              type="number"
              value={pct}
              onChange={(e) => setPct(e.target.value)}
              placeholder="e.g. 38"
              className="mt-1 h-10 w-full rounded-md border border-white/15 bg-card px-2 text-sm text-white outline-none focus:border-emerald-500"
            />
          </div>
          <div>
            <Label htmlFor="outlook">Outlook</Label>
            <select
              id="outlook"
              value={outlook}
              onChange={(e) => setOutlook(e.target.value as OutlookValue)}
              className="mt-1 h-10 w-full rounded-md border border-white/15 bg-card px-2 text-sm text-white outline-none focus:border-emerald-500"
            >
              <option value="">—</option>
              <option value="Strong">Strong</option>
              <option value="Moderate">Moderate</option>
              <option value="Stable">Stable</option>
            </select>
          </div>
          <div>
            <Label htmlFor="note">Note (optional)</Label>
            <input
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Short context"
              className="mt-1 h-10 w-full rounded-md border border-white/15 bg-card px-2 text-sm text-white outline-none focus:border-emerald-500"
            />
          </div>
        </div>
      </div>

      <button
        onClick={save}
        disabled={saving}
        className="mt-5 inline-flex items-center gap-1.5 rounded-full border border-emerald-700/60 px-4 py-2 text-sm font-medium text-emerald-300 hover:bg-emerald-900/20 disabled:opacity-50"
      >
        {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save ownership &amp; growth
      </button>
    </section>
  );
}
