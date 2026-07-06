import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/primitives";
import { toast } from "sonner";
import { Upload, Trash2, FileText, Loader2, ExternalLink, Save } from "lucide-react";
import { ASSET_SECTIONS, ALL_CATEGORIES, categoryLabel, PROJECT_TYPE_LABELS } from "@/lib/assetCategories";
import type { Project, ProjectAsset } from "@/types";

interface Props {
  project: Project;
  onProjectUpdated: (p: Project) => void;
}

const LIST_FIELDS = [
  ["amenities", "Amenities & Facilities", "Clubhouse, Swimming Pool, Gym, Kids Play Area…"],
  ["securityFeatures", "Security (Biometric / CCTV / Smart)", "Biometric entry, 24×7 CCTV surveillance, Boom barriers…"],
  ["smartHomeFeatures", "Smart Home Features", "Video door phone, App-controlled lighting, Smart locks…"],
  ["fireSafetySystems", "Fire Safety Systems", "Sprinklers, Smoke detectors, Fire exits on every floor…"],
  ["greenBuildingFeatures", "Green Building Features", "Rainwater harvesting, Solar panels, EV charging…"],
] as const;

type ListField = (typeof LIST_FIELDS)[number][0];

export default function PresentationManager({ project, onProjectUpdated }: Props) {
  const [assets, setAssets] = useState<ProjectAsset[]>([]);
  const [uploading, setUploading] = useState(false);
  const [savingInfo, setSavingInfo] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Upload form
  const [category, setCategory] = useState(ALL_CATEGORIES[0].value);
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);

  // Info form
  const [projectType, setProjectType] = useState(project.projectType ?? "");
  const [lists, setLists] = useState<Record<ListField, string>>(() => {
    const init = {} as Record<ListField, string>;
    for (const [field] of LIST_FIELDS) {
      init[field] = (project.presentationInfo?.[field] ?? []).join(", ");
    }
    return init;
  });
  const [connectivity, setConnectivity] = useState(project.presentationInfo?.connectivityNotes ?? "");
  const [progressNote, setProgressNote] = useState(project.presentationInfo?.constructionProgressNote ?? "");

  useEffect(() => {
    api
      .get(`/presentation/${project._id}`)
      .then((res) => setAssets(res.data.assets))
      .catch(() => {});
  }, [project._id]);

  async function uploadAsset(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !title.trim()) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("category", category);
      form.append("title", title.trim());
      const res = await api.post(`/presentation/${project._id}/assets`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setAssets((prev) => [res.data.asset, ...prev]);
      setTitle("");
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      toast.success("Asset uploaded");
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function deleteAsset(asset: ProjectAsset) {
    if (!confirm(`Delete "${asset.title}"?`)) return;
    setDeletingId(asset._id);
    try {
      await api.delete(`/presentation/${project._id}/assets/${asset._id}`);
      setAssets((prev) => prev.filter((a) => a._id !== asset._id));
      toast.success("Asset deleted");
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Delete failed");
    } finally {
      setDeletingId(null);
    }
  }

  async function saveInfo() {
    setSavingInfo(true);
    try {
      const payload: Record<string, unknown> = {
        connectivityNotes: connectivity,
        constructionProgressNote: progressNote,
      };
      if (projectType) payload.projectType = projectType;
      for (const [field] of LIST_FIELDS) {
        payload[field] = lists[field]
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
      }
      const res = await api.put(`/presentation/${project._id}/info`, payload);
      onProjectUpdated(res.data.project);
      toast.success("Presentation details saved");
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Save failed");
    } finally {
      setSavingInfo(false);
    }
  }

  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-medium">Presentation & Technical Information</h2>
        <Link
          to={`/inventory/${project._id}/presentation`}
          className="inline-flex items-center gap-1.5 text-sm text-blue-400 hover:underline"
        >
          Preview public presentation <ExternalLink size={13} />
        </Link>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Everything a buyer sees on your project's digital showcase: plans, drawings, 3D views, gallery,
        documents, security systems, and amenities.
      </p>

      {/* ── Structured details ── */}
      <div className="mt-4 rounded-lg border border-white/10 glass p-4 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label className="text-foreground/90">Project Type</Label>
            <select
              value={projectType}
              onChange={(e) => setProjectType(e.target.value)}
              className="mt-1 h-9 w-full rounded-lg border border-white/15 bg-card px-3 text-sm text-white outline-none focus:border-blue-500"
            >
              <option value="">— Select —</option>
              {Object.entries(PROJECT_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <div>
            <Label className="text-foreground/90">Location & Connectivity Notes</Label>
            <Input
              placeholder="5 min from metro, 20 min from airport…"
              value={connectivity}
              onChange={(e) => setConnectivity(e.target.value)}
              className="border-white/15 bg-card text-white"
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {LIST_FIELDS.map(([field, label, placeholder]) => (
            <div key={field}>
              <Label className="text-foreground/90">{label} <span className="text-muted-foreground">(comma-separated)</span></Label>
              <Input
                placeholder={placeholder}
                value={lists[field]}
                onChange={(e) => setLists((prev) => ({ ...prev, [field]: e.target.value }))}
                className="border-white/15 bg-card text-white"
              />
            </div>
          ))}
          <div>
            <Label className="text-foreground/90">Latest Construction Progress Note</Label>
            <Input
              placeholder="Tower A slab work complete, finishing underway…"
              value={progressNote}
              onChange={(e) => setProgressNote(e.target.value)}
              className="border-white/15 bg-card text-white"
            />
          </div>
        </div>

        <Button size="sm" onClick={saveInfo} disabled={savingInfo}>
          {savingInfo ? <Loader2 size={13} className="animate-spin mr-1.5" /> : <Save size={13} className="mr-1.5" />}
          Save Details
        </Button>
      </div>

      {/* ── Upload ── */}
      <form onSubmit={uploadAsset} className="mt-4 rounded-lg border border-white/10 glass p-4">
        <p className="text-sm font-medium text-white mb-3">Upload Asset</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label className="text-foreground/90">Category</Label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="mt-1 h-9 w-full rounded-lg border border-white/15 bg-card px-3 text-sm text-white outline-none focus:border-blue-500"
            >
              {ASSET_SECTIONS.map((section) => (
                <optgroup key={section.key} label={section.title}>
                  {section.categories.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <div>
            <Label className="text-foreground/90">Title</Label>
            <Input
              required
              placeholder="e.g. Tower A — 3BHK Floor Plan"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="border-white/15 bg-card text-white"
            />
          </div>
          <div>
            <Label className="text-foreground/90">File</Label>
            <label className="mt-1 flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-dashed border-white/20 px-3 text-sm text-muted-foreground hover:border-blue-500/50 hover:text-blue-300 transition-colors">
              <Upload size={14} className="shrink-0" />
              <span className="truncate">{file ? file.name : "Choose file"}</span>
              <input
                ref={fileRef}
                type="file"
                required
                accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,.svg,.mp4,.webm,.mov,.ppt,.pptx,.doc,.docx,.xls,.xlsx,.dwg,.dxf,.zip"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f && f.size > 50 * 1024 * 1024) {
                    toast.error("File too large — max 50 MB");
                    e.target.value = "";
                    return;
                  }
                  setFile(f || null);
                }}
              />
            </label>
          </div>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Drawings, CAD files (DWG/DXF), PDFs, images, videos, presentations, reports & certificates — up to 50 MB.
        </p>
        <Button type="submit" size="sm" className="mt-3" disabled={uploading || !file || !title.trim()}>
          {uploading ? <><Loader2 size={13} className="animate-spin mr-1.5" /> Uploading…</> : "Upload"}
        </Button>
      </form>

      {/* ── Asset list ── */}
      <div className="mt-4 space-y-2">
        {assets.map((asset) => (
          <div key={asset._id} className="flex items-center gap-3 rounded-lg border border-white/10 glass px-4 py-2.5">
            {asset.mimeType.startsWith("image/") ? (
              <img src={asset.fileUrl} alt="" className="size-10 rounded-md object-cover shrink-0" />
            ) : (
              <FileText size={18} className="text-blue-400 shrink-0" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm text-white truncate">{asset.title}</p>
              <p className="text-[11px] text-muted-foreground truncate">
                {categoryLabel(asset.category)} · {asset.fileName}
              </p>
            </div>
            <a href={asset.fileUrl} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-white shrink-0" title="Open">
              <ExternalLink size={14} />
            </a>
            <button
              onClick={() => deleteAsset(asset)}
              disabled={deletingId === asset._id}
              className="text-red-400/70 hover:text-red-400 shrink-0"
              title="Delete"
            >
              {deletingId === asset._id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            </button>
          </div>
        ))}
        {assets.length === 0 && (
          <p className="text-sm text-muted-foreground">No presentation assets uploaded yet.</p>
        )}
      </div>
    </section>
  );
}
