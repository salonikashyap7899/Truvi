import { useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Loader2, Save, ShieldCheck } from "lucide-react";
import { Label } from "@/components/ui/primitives";
import type { Project } from "@/types";

type RiskLevel = "LOW" | "MEDIUM" | "HIGH";
type RiskValue = RiskLevel | ""; // "" = not assessed

interface RiskAssessmentEditorProps {
  project: Project;
  onUpdated?: (project: Project) => void;
}

const FIELDS: { key: "legalRiskLevel" | "floodRiskLevel" | "crimeIndexLevel"; label: string; hint: string }[] = [
  { key: "legalRiskLevel", label: "Legal Risk", hint: "Title, litigation and RERA compliance" },
  { key: "floodRiskLevel", label: "Flood Risk", hint: "Elevation, drainage and flooding history" },
  { key: "crimeIndexLevel", label: "Crime Index", hint: "Locality safety and reported incidents" },
];

const OPTIONS: { value: RiskValue; label: string }[] = [
  { value: "", label: "Not assessed" },
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
];

/**
 * Admin-only editor for a project's Truvi-verified risk assessment. The values
 * are persisted on the project (legal/flood/crime risk) and drive the public
 * intelligence cards + the intelligence engine. Selecting "Not assessed"
 * clears the value back to null.
 */
export default function RiskAssessmentEditor({ project, onUpdated }: RiskAssessmentEditorProps) {
  const [values, setValues] = useState<Record<string, RiskValue>>({
    legalRiskLevel: project.legalRiskLevel ?? "",
    floodRiskLevel: project.floodRiskLevel ?? "",
    crimeIndexLevel: project.crimeIndexLevel ?? "",
  });
  const [saving, setSaving] = useState(false);

  const dirty = FIELDS.some((f) => (values[f.key] || "") !== (project[f.key] ?? ""));

  async function save() {
    setSaving(true);
    try {
      const payload = {
        legalRiskLevel: values.legalRiskLevel || null,
        floodRiskLevel: values.floodRiskLevel || null,
        crimeIndexLevel: values.crimeIndexLevel || null,
      };
      const res = await api.patch(`/projects/${project._id}`, payload);
      onUpdated?.(res.data.project);
      toast.success("Risk assessment saved");
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to save risk assessment");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mt-8 rounded-2xl border border-white/10 glass p-5">
      <div className="flex items-center gap-2">
        <ShieldCheck size={16} className="text-emerald-400" />
        <h2 className="text-lg font-medium">Risk Assessment</h2>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Truvi-verified risk levels shown to buyers. Leave a field as “Not assessed” until it has been reviewed.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        {FIELDS.map((f) => (
          <div key={f.key}>
            <Label htmlFor={f.key}>{f.label}</Label>
            <select
              id={f.key}
              value={values[f.key]}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value as RiskValue }))}
              className="mt-1 h-10 w-full rounded-md border border-white/15 bg-card px-2 text-sm text-white outline-none focus:border-emerald-500"
            >
              {OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-muted-foreground">{f.hint}</p>
          </div>
        ))}
      </div>

      <button
        onClick={save}
        disabled={saving || !dirty}
        className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-emerald-700/60 px-4 py-2 text-sm font-medium text-emerald-300 hover:bg-emerald-900/20 disabled:opacity-50"
      >
        {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save assessment
      </button>
    </section>
  );
}
