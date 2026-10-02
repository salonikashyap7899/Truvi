import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { FileText, Upload, Trash2, Eye, Loader2, RefreshCw, BarChart3, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import BrochureViewer from "@/components/BrochureViewer";

interface Analytics { views: number; downloads: number; lastViewed: string | null; lastDownloaded: string | null }
interface BrochureMeta {
  exists: boolean;
  fileName?: string;
  sizeBytes?: number;
  uploadedAt?: string | null;
  updatedAt?: string | null;
  analytics?: Analytics;
}

const MAX_MB = 25;

function fmtSize(bytes?: number) {
  if (!bytes) return "";
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}
function fmtDate(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

/**
 * Admin brochure management for a single project — upload / replace / delete a
 * PDF brochure, preview it, and see view/download analytics. Admin-only actions
 * are enforced again on the server.
 */
export default function BrochureManager({ projectId, projectName }: { projectId: string; projectName: string }) {
  const [meta, setMeta] = useState<BrochureMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await api.get(`/projects/${projectId}/brochure`);
      setMeta(res.data);
    } catch {
      setMeta({ exists: false });
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [projectId]);

  async function upload(file: File) {
    if (file.type !== "application/pdf") { toast.error("Only PDF files are allowed."); return; }
    if (file.size > MAX_MB * 1024 * 1024) { toast.error(`File too large — max ${MAX_MB} MB.`); return; }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      await api.post(`/admin/projects/${projectId}/brochure`, fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success(meta?.exists ? "Brochure replaced." : "Brochure uploaded.");
      await load();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Upload failed.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function remove() {
    if (!confirm("Delete this brochure? This cannot be undone.")) return;
    setBusy(true);
    try {
      await api.delete(`/admin/projects/${projectId}/brochure`);
      toast.success("Brochure deleted.");
      await load();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Delete failed.");
    } finally {
      setBusy(false);
    }
  }

  const a = meta?.analytics;

  return (
    <section className="rounded-2xl border border-white/10 glass p-5 text-white">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><FileText size={16} className="text-sky-300" /> Project Brochure</h3>
        {meta?.exists && (
          <button onClick={load} className="grid size-7 place-items-center rounded-full border border-white/15 text-white/70 hover:bg-white/10" title="Refresh"><RefreshCw size={13} /></button>
        )}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">Upload a PDF brochure — buyers and channel partners can view and download it on the listing. PDF only, up to {MAX_MB} MB.</p>

      {loading ? (
        <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 size={14} className="animate-spin" /> Loading…</div>
      ) : meta?.exists ? (
        <div className="mt-4 space-y-4">
          {/* Current brochure */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-rose-500/15 text-rose-300"><FileText size={18} /></span>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{meta.fileName}</p>
                <p className="text-[11px] text-muted-foreground">{fmtSize(meta.sizeBytes)} · Uploaded {fmtDate(meta.uploadedAt)}</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button onClick={() => setPreview(true)} className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold hover:bg-white/10"><Eye size={13} /> View</button>
              <button onClick={() => fileRef.current?.click()} disabled={busy} className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold hover:bg-white/10 disabled:opacity-50"><RefreshCw size={13} /> Replace</button>
              <button onClick={remove} disabled={busy} className="inline-flex items-center gap-1.5 rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-500/20 disabled:opacity-50"><Trash2 size={13} /> Delete</button>
            </div>
          </div>

          {/* Analytics */}
          {a && (
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-white/60"><BarChart3 size={12} /> Brochure analytics</p>
              <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div><p className="text-lg font-semibold">{a.views}</p><p className="text-[11px] text-muted-foreground">Views</p></div>
                <div><p className="text-lg font-semibold">{a.downloads}</p><p className="text-[11px] text-muted-foreground">Downloads</p></div>
                <div><p className="text-sm font-semibold">{fmtDate(a.lastViewed)}</p><p className="text-[11px] text-muted-foreground">Last viewed</p></div>
                <div><p className="text-sm font-semibold">{fmtDate(a.lastDownloaded)}</p><p className="text-[11px] text-muted-foreground">Last downloaded</p></div>
              </div>
            </div>
          )}
        </div>
      ) : (
        // Empty state
        <label className={`mt-4 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/20 p-6 text-center transition hover:border-sky-500/50 ${busy ? "pointer-events-none opacity-60" : ""}`}>
          {busy ? <Loader2 size={22} className="animate-spin text-sky-300" /> : <Upload size={22} className="text-white/50" />}
          <p className="text-sm font-medium">{busy ? "Uploading…" : "Upload brochure PDF"}</p>
          <p className="text-[11px] text-muted-foreground">Click to choose a PDF (max {MAX_MB} MB)</p>
          <input ref={fileRef} type="file" accept="application/pdf,.pdf" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }} />
        </label>
      )}

      {/* Hidden input for Replace */}
      {meta?.exists && (
        <input ref={fileRef} type="file" accept="application/pdf,.pdf" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }} />
      )}

      {meta?.exists && !loading && (
        <p className="mt-3 flex items-center gap-1.5 text-[11px] text-emerald-300/80"><CheckCircle2 size={12} /> Live on the listing — buyers &amp; channel partners can view and download it.</p>
      )}

      {preview && <BrochureViewer projectId={projectId} projectName={projectName} onClose={() => setPreview(false)} />}
    </section>
  );
}
