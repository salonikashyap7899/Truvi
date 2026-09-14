import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, Upload, FileText } from "lucide-react";

/** The seven RAG data categories the ingestion API accepts. */
const CATEGORIES = [
  { value: "government_legal", label: "Government & Legal (RERA, approvals, title)" },
  { value: "infrastructure", label: "Infrastructure" },
  { value: "location_intelligence", label: "Location Intelligence" },
  { value: "market_intelligence", label: "Market Intelligence" },
  { value: "environmental_data", label: "Environmental Data" },
  { value: "satellite_gis", label: "Satellite / GIS" },
  { value: "community_intelligence", label: "Community Intelligence" },
] as const;

interface ProjectOpt {
  _id: string;
  name: string;
  city?: string | null;
}

interface IngestResult {
  successCount: number;
  errors: { row: number; error: string }[];
}

/**
 * Admin/verifier data-ingestion panel. Uploads a CSV/JSON/GeoJSON file to
 * POST /api/ingest/:category through the app's authenticated session — so the
 * RAG assistant (Ask Truvi) can answer from it. When a project is selected, the
 * chosen project's id is injected into every JSON row before upload, so a data
 * file with a placeholder project_id "just works".
 */
export default function DataIngestPanel() {
  const [projects, setProjects] = useState<ProjectOpt[]>([]);
  const [projectId, setProjectId] = useState("");
  const [category, setCategory] = useState<string>(CATEGORIES[0].value);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<IngestResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api
      .get("/admin/projects")
      .then((res) => {
        const list: ProjectOpt[] = (res.data.projects ?? []).map((p: any) => ({ _id: p._id, name: p.name, city: p.city }));
        list.sort((a, b) => a.name.localeCompare(b.name));
        setProjects(list);
      })
      .catch(() => {});
  }, []);

  const selectedName = useMemo(() => projects.find((p) => p._id === projectId)?.name ?? "", [projects, projectId]);

  /** Build the upload body: inject the chosen project_id into JSON rows when a
   *  project is selected (leaves GeoJSON FeatureCollections and CSV untouched). */
  async function buildUploadFile(src: File): Promise<File> {
    if (!projectId) return src; // no project chosen → rows must carry their own id
    const lower = src.name.toLowerCase();
    if (!lower.endsWith(".json") && !lower.endsWith(".geojson")) return src; // CSV → pass through
    try {
      const text = await src.text();
      const json = JSON.parse(text);
      if (json && json.type === "FeatureCollection") return src; // don't rewrite GeoJSON shape
      const inject = (row: any) => {
        if (row && typeof row === "object") {
          row.project_id = projectId;
          delete row.projectId;
        }
        return row;
      };
      const next = Array.isArray(json) ? json.map(inject) : inject(json);
      return new File([JSON.stringify(next)], src.name.replace(/\.geojson$/i, ".json"), { type: "application/json" });
    } catch {
      return src; // not parseable as JSON → let the server report the error
    }
  }

  async function upload() {
    if (!file) return toast.error("Choose a file first");
    if (!projectId) {
      const ok = window.confirm(
        "No project selected — each row in the file must already contain a valid project_id, or the upload will fail. Continue?",
      );
      if (!ok) return;
    }
    setBusy(true);
    setResult(null);
    try {
      const toSend = await buildUploadFile(file);
      const form = new FormData();
      form.append("file", toSend);
      const { data } = await api.post(`/ingest/${category}`, form);
      const r: IngestResult = { successCount: data.successCount ?? 0, errors: data.errors ?? [] };
      setResult(r);
      if (r.successCount > 0 && r.errors.length === 0) {
        toast.success(`Ingested ${r.successCount} row(s) into ${category}`);
      } else if (r.successCount > 0) {
        toast.warning(`Ingested ${r.successCount} row(s), ${r.errors.length} failed`);
      } else {
        toast.error(`Nothing ingested — ${r.errors.length} row(s) failed`);
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div className="rounded-2xl border border-white/10 glass p-5">
        <h2 className="text-sm font-semibold">Upload property data</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Load CSV / JSON / GeoJSON into a data category. Ask Truvi AI answers from this data and cites it. Rows upsert by
          (project, data key), so re-uploading updates existing rows.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-xs">
            <span className="mb-1 block text-muted-foreground">Project</span>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="w-full rounded-lg border border-white/15 bg-card px-3 py-2 text-sm text-white outline-none"
            >
              <option value="">— use project_id from file —</option>
              {projects.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.name}{p.city ? ` · ${p.city}` : ""}
                </option>
              ))}
            </select>
          </label>

          <label className="text-xs">
            <span className="mb-1 block text-muted-foreground">Category</span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-lg border border-white/15 bg-card px-3 py-2 text-sm text-white outline-none"
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-3">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.json,.geojson,application/json,text/csv"
            onChange={(e) => { setFile(e.target.files?.[0] ?? null); setResult(null); }}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex w-full items-center gap-2 rounded-lg border border-dashed border-white/20 px-3 py-3 text-sm text-muted-foreground hover:border-white/40 hover:text-white"
          >
            <FileText size={15} className="shrink-0" />
            {file ? <span className="truncate text-white">{file.name}</span> : "Choose a CSV / JSON / GeoJSON file…"}
          </button>
        </div>

        {projectId && (
          <p className="mt-2 text-[11px] text-emerald-300/80">
            project_id will be set to “{selectedName}” for every JSON row in this file.
          </p>
        )}

        <div className="mt-4">
          <Button onClick={upload} disabled={busy || !file}>
            {busy ? <Loader2 size={15} className="mr-1 animate-spin" /> : <Upload size={15} className="mr-1" />}
            Ingest data
          </Button>
        </div>
      </div>

      {result && (
        <div className="rounded-2xl border border-white/10 glass p-5 text-sm">
          <p className="font-semibold">
            Result: <span className="text-emerald-300">{result.successCount} ingested</span>
            {result.errors.length > 0 && <span className="text-rose-300"> · {result.errors.length} failed</span>}
          </p>
          {result.errors.length > 0 && (
            <ul className="mt-2 space-y-1 text-xs text-rose-200/90">
              {result.errors.slice(0, 20).map((e, i) => (
                <li key={i}>Row {e.row}: {e.error}</li>
              ))}
              {result.errors.length > 20 && <li>…and {result.errors.length - 20} more</li>}
            </ul>
          )}
          {result.successCount > 0 && (
            <p className="mt-3 text-xs text-muted-foreground">
              Now run verification for this project (the “Run &amp; Inspect” tab) so scores and fraud flags refresh, then ask
              Ask Truvi a question to confirm the data is answerable.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
