import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Download, FileJson, Loader2, RefreshCw, Search, Archive } from "lucide-react";

const CATEGORIES = [
  { value: "government_legal", label: "Government & Legal" },
  { value: "infrastructure", label: "Infrastructure" },
  { value: "location_intelligence", label: "Location Intelligence" },
  { value: "market_intelligence", label: "Market Intelligence" },
  { value: "environmental_data", label: "Environmental Data" },
  { value: "satellite_gis", label: "Satellite / GIS" },
  { value: "community_intelligence", label: "Community Intelligence" },
] as const;

interface ProjectOption {
  _id: string;
  name: string;
  city?: string | null;
}

interface UploadRecord {
  _id: string;
  projectId: string | null;
  projectIds: string[];
  category: string;
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  rowCount: number;
  successCount: number;
  failedCount: number;
  uploadedById: string | null;
  uploaderName: string | null;
  createdAt: string;
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "—";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Unknown date"
    : date.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** Searchable archive of uploaded JSON/GeoJSON source snapshots. */
export default function ProjectDataVault() {
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [uploads, setUploads] = useState<UploadRecord[]>([]);
  const [projectId, setProjectId] = useState("");
  const [category, setCategory] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);

  async function loadUploads() {
    setLoading(true);
    try {
      const { data } = await api.get("/ingest/uploads", {
        params: { ...(projectId ? { projectId } : {}), ...(category ? { category } : {}) },
      });
      setUploads(data.uploads ?? []);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Could not load the project data archive");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    api.get("/ingest/projects")
      .then(({ data }) => {
        const list: ProjectOption[] = (data.projects ?? []);
        list.sort((a, b) => a.name.localeCompare(b.name));
        setProjects(list);
      })
      .catch(() => toast.error("Could not load project names"));
  }, []);

  useEffect(() => {
    void loadUploads();
  }, [projectId, category]);

  const projectNames = useMemo(() => new Map(projects.map((p) => [p._id, p.name])), [projects]);
  const filteredUploads = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return uploads;
    return uploads.filter((u) =>
      [u.fileName, u.category, u.uploaderName ?? "", ...(u.projectIds ?? []).map((id) => projectNames.get(id) ?? id)]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [uploads, query, projectNames]);

  async function download(record: UploadRecord) {
    setDownloading(record._id);
    try {
      const response = await api.get(`/ingest/uploads/${record._id}/download`, { responseType: "blob" });
      const blobUrl = window.URL.createObjectURL(response.data);
      const anchor = document.createElement("a");
      anchor.href = blobUrl;
      const safeName = record.fileName.replace(/[^a-zA-Z0-9._-]+/g, "_");
      anchor.download = /\.(json|geojson)$/i.test(safeName)
        ? safeName
        : safeName.replace(/\.[^.]+$/, "") + ".json";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => window.URL.revokeObjectURL(blobUrl), 1_000);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Could not download this JSON file");
    } finally {
      setDownloading(null);
    }
  }

  const totalRows = uploads.reduce((sum, item) => sum + item.successCount, 0);
  const totalSize = uploads.reduce((sum, item) => sum + item.fileSizeBytes, 0);

  return (
    <div className="max-w-6xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-sky-400/20 bg-sky-500/[0.06] p-5">
        <div className="flex gap-3">
          <div className="grid size-11 shrink-0 place-items-center rounded-xl border border-sky-300/20 bg-sky-400/10 text-sky-200">
            <Archive size={20} />
          </div>
          <div>
            <h2 className="text-base font-semibold text-white">Project Data Vault</h2>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-white/60">
              Every new successful JSON / GeoJSON ingest is archived in Supabase PostgreSQL. The live category tables
              continue to power Truvi intelligence; this vault preserves each source upload as a downloadable snapshot.
            </p>
          </div>
        </div>
        <Button variant="outline" onClick={() => void loadUploads()} disabled={loading} className="border-white/15 bg-white/5 text-white hover:bg-white/10">
          {loading ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <RefreshCw size={14} className="mr-1.5" />}
          Refresh
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-[11px] uppercase tracking-wider text-white/45">Archived uploads</p>
          <p className="mt-1 font-display text-2xl font-semibold text-white">{uploads.length}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-[11px] uppercase tracking-wider text-white/45">Rows ingested (listed)</p>
          <p className="mt-1 font-display text-2xl font-semibold text-white">{totalRows.toLocaleString("en-IN")}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-[11px] uppercase tracking-wider text-white/45">Source archive size (listed)</p>
          <p className="mt-1 font-display text-2xl font-semibold text-white">{formatBytes(totalSize)}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 rounded-2xl border border-white/10 bg-white/[0.025] p-4">
        <label className="min-w-[220px] flex-1 text-xs">
          <span className="mb-1.5 block text-white/55">Project</span>
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="w-full rounded-lg border border-white/15 bg-[#101923] px-3 py-2.5 text-sm text-white outline-none focus:border-sky-400">
            <option value="">All projects</option>
            {projects.map((p) => <option key={p._id} value={p._id}>{p.name}{p.city ? ` · ${p.city}` : ""}</option>)}
          </select>
        </label>
        <label className="min-w-[220px] flex-1 text-xs">
          <span className="mb-1.5 block text-white/55">Data category</span>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full rounded-lg border border-white/15 bg-[#101923] px-3 py-2.5 text-sm text-white outline-none focus:border-sky-400">
            <option value="">All categories</option>
            {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </label>
        <label className="min-w-[220px] flex-[1.4] text-xs">
          <span className="mb-1.5 block text-white/55">Search archive</span>
          <span className="flex items-center gap-2 rounded-lg border border-white/15 bg-[#101923] px-3">
            <Search size={14} className="text-white/40" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filename, project or uploader…" className="min-w-0 flex-1 bg-transparent py-2.5 text-sm text-white outline-none placeholder:text-white/35" />
          </span>
        </label>
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025]">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold text-white">Upload history</h3>
            <p className="mt-0.5 text-[11px] text-white/45">Showing the latest 200 archived JSON / GeoJSON files.</p>
          </div>
          <span className="text-xs tabular-nums text-white/50">{filteredUploads.length} shown</span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 px-4 py-12 text-sm text-white/50">
            <Loader2 size={16} className="animate-spin" /> Loading archive…
          </div>
        ) : filteredUploads.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <FileJson size={28} className="mx-auto text-white/25" />
            <p className="mt-3 text-sm font-medium text-white/75">No archived uploads found</p>
            <p className="mt-1 text-xs text-white/45">
              New JSON / GeoJSON uploads through the Ingest Data tab will appear here after at least one row is ingested.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {filteredUploads.map((record) => {
              const ids = record.projectIds ?? [];
              const names = ids.map((id) => projectNames.get(id) ?? "Project");
              const categoryName = CATEGORIES.find((c) => c.value === record.category)?.label ?? record.category;
              return (
                <div key={record._id} className="flex flex-col gap-3 px-4 py-4 md:flex-row md:items-center md:justify-between">
                  <div className="flex min-w-0 gap-3">
                    <div className="grid size-10 shrink-0 place-items-center rounded-lg border border-emerald-400/15 bg-emerald-400/[0.07] text-emerald-200">
                      <FileJson size={18} />
                    </div>
                    <div className="min-w-0">
                      <p className="break-all text-sm font-medium text-white">{record.fileName}</p>
                      <p className="mt-1 text-xs text-white/55">
                        {categoryName} · {ids.length === 1 ? (names[0] ?? "1 project") : `${ids.length} projects`}
                      </p>
                      <p className="mt-1 text-[11px] text-white/40">
                        {formatDate(record.createdAt)} · {formatBytes(record.fileSizeBytes)} · {record.rowCount} source rows · {record.uploaderName ?? "Former user"}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 md:justify-end">
                    <span className="text-xs text-emerald-300">{record.successCount.toLocaleString("en-IN")} ingested</span>
                    {record.failedCount > 0 && <span className="text-xs text-amber-300">{record.failedCount} failed</span>}
                    <Button size="sm" onClick={() => void download(record)} disabled={downloading === record._id} className="bg-sky-600 text-white hover:bg-sky-500">
                      {downloading === record._id ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <Download size={14} className="mr-1.5" />}
                      Download JSON
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <p className="text-[11px] leading-relaxed text-white/40">
        Existing uploads made before this archive feature are not automatically reconstructed as original files. Their ingested records remain available in the seven category tables; this vault archives new JSON / GeoJSON uploads from this release onward.
      </p>
    </div>
  );
}
