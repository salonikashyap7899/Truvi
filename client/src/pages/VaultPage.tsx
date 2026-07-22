import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { useAuthStore } from "@/store/authStore";
import { StatCard } from "@/components/ui/stat";
import {
  ArrowLeft, FolderLock, Search, RefreshCw, FileText, Scale, Receipt,
  FolderOpen, GraduationCap, ShieldCheck, Download, Upload,
} from "lucide-react";

const UPLOAD_CATEGORIES = [
  { value: "BROCHURE", label: "Brochure" },
  { value: "FLOOR_PLAN", label: "Floor plan" },
  { value: "MASTER_PLAN", label: "Master plan" },
  { value: "TECHNICAL_DOC", label: "Technical document" },
  { value: "PROGRESS_UPDATE", label: "Progress update" },
  { value: "APPROVAL_DOC", label: "Legal / Approval (shows after admin verify)" },
];
import UserMenu from "@/components/UserMenu";

interface VaultDoc {
  id: string;
  category: "LEGAL" | "PROJECT_ASSET" | "SHARED" | "INVOICE" | "LEARNING";
  title: string;
  fileName?: string | null;
  url: string;
  project?: string | null;
  verified?: boolean | null;
  uploadedAt: string;
}

const CATEGORIES: { key: VaultDoc["category"] | "ALL"; label: string; icon: React.ReactNode }[] = [
  { key: "ALL", label: "All", icon: <FolderOpen size={13} /> },
  { key: "LEGAL", label: "Legal", icon: <Scale size={13} /> },
  { key: "PROJECT_ASSET", label: "Project Files", icon: <FileText size={13} /> },
  { key: "SHARED", label: "Shared", icon: <FolderOpen size={13} /> },
  { key: "INVOICE", label: "Invoices", icon: <Receipt size={13} /> },
  { key: "LEARNING", label: "Learning", icon: <GraduationCap size={13} /> },
];

const CAT_TONE: Record<VaultDoc["category"], string> = {
  LEGAL: "bg-amber-500/15 text-amber-300",
  PROJECT_ASSET: "bg-sky-500/15 text-sky-300",
  SHARED: "bg-violet-500/15 text-violet-300",
  INVOICE: "bg-emerald-500/15 text-emerald-300",
  LEARNING: "bg-blue-500/15 text-blue-300",
};

export default function VaultPage() {
  const user = useAuthStore((s) => s.user);
  const [docs, setDocs] = useState<VaultDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [cat, setCat] = useState<VaultDoc["category"] | "ALL">("ALL");
  const [query, setQuery] = useState("");

  // Upload (developers/admins can add project documents that appear in the vault).
  const canUpload = user?.role === "DEVELOPER" || user?.role === "ADMIN";
  const [showUpload, setShowUpload] = useState(false);
  const [projects, setProjects] = useState<{ _id: string; name: string }[]>([]);
  const [up, setUp] = useState({ projectId: "", category: "BROCHURE", title: "" });
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  function openUpload() {
    setShowUpload(true);
    if (projects.length === 0) {
      api.get("/projects").then((r) => {
        const list = (r.data.projects ?? []).map((p: { _id: string; name: string }) => ({ _id: p._id, name: p.name }));
        setProjects(list);
        setUp((u) => ({ ...u, projectId: list[0]?._id ?? "" }));
      }).catch(() => {});
    }
  }

  async function submitUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!up.projectId || !file || !up.title.trim()) {
      toast.error("Pick a project, enter a title and choose a file");
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("category", up.category);
      fd.append("title", up.title.trim());
      await api.post(`/presentation/${up.projectId}/assets`, fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success("Document uploaded to the vault");
      setShowUpload(false);
      setFile(null);
      setUp((u) => ({ ...u, title: "" }));
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function load() {
    setLoading(true);
    try {
      const res = await api.get("/vault");
      setDocs(res.data.docs ?? []);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to load the vault");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return docs.filter((d) => {
      if (cat !== "ALL" && d.category !== cat) return false;
      if (!q) return true;
      return `${d.title} ${d.fileName ?? ""} ${d.project ?? ""}`.toLowerCase().includes(q);
    });
  }, [docs, cat, query]);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of docs) m.set(d.category, (m.get(d.category) ?? 0) + 1);
    return m;
  }, [docs]);

  const backTo = user?.role === "CP" ? "/cp/dashboard" : user?.role === "DEVELOPER" ? "/developer/dashboard" : "/admin/dashboard";

  return (
    <main className="min-h-screen p-6 text-white md:p-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link to={backTo} className="text-muted-foreground transition-colors hover:text-white">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold">
              <FolderLock size={22} className="text-sky-300" /> Document Vault
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Every document you're allowed to see — legal papers, project files, invoices and learning material, in one place.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canUpload && (
            <button onClick={openUpload} className="inline-flex items-center gap-1.5 rounded-full bg-violet-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-500">
              <Upload size={14} /> Upload Document
            </button>
          )}
          <button onClick={load} className="rounded-full border border-white/10 bg-white/5 p-2 text-white/70 transition hover:bg-white/10" title="Refresh">
            <RefreshCw size={14} />
          </button>
          <UserMenu />
        </div>
      </div>

      {showUpload && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={() => setShowUpload(false)}>
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0b0d14] p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="flex items-center gap-2 text-lg font-semibold"><Upload size={17} className="text-violet-300" /> Upload document</h3>
            <p className="mt-1 text-xs text-muted-foreground">Add a document to one of your projects — it appears in the vault instantly.</p>
            <form onSubmit={submitUpload} className="mt-4 space-y-3">
              <div>
                <label className="text-xs text-muted-foreground">Project</label>
                <select value={up.projectId} onChange={(e) => setUp({ ...up, projectId: e.target.value })} className="mt-1 w-full rounded-lg border border-white/15 bg-card px-3 py-2 text-sm text-white">
                  {projects.length === 0 ? <option value="">No projects found</option> : projects.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Category</label>
                <select value={up.category} onChange={(e) => setUp({ ...up, category: e.target.value })} className="mt-1 w-full rounded-lg border border-white/15 bg-card px-3 py-2 text-sm text-white">
                  {UPLOAD_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Title</label>
                <input value={up.title} onChange={(e) => setUp({ ...up, title: e.target.value })} placeholder="e.g. Brochure v2" className="mt-1 w-full rounded-lg border border-white/15 bg-card px-3 py-2 text-sm text-white placeholder:text-muted-foreground" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">File</label>
                <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="mt-1 w-full text-sm text-white/80 file:mr-3 file:rounded-md file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-white" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowUpload(false)} className="rounded-lg border border-white/15 px-4 py-2 text-sm text-white/70 hover:bg-white/5">Cancel</button>
                <button type="submit" disabled={uploading} className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-500 disabled:opacity-60">{uploading ? "Uploading…" : "Upload"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Documents" value={docs.length} icon={<FolderLock size={16} />} tone="violet" delay={0} />
        <StatCard label="Legal Docs" value={counts.get("LEGAL") ?? 0} icon={<Scale size={16} />} tone="amber" delay={60} />
        <StatCard label="Project Files" value={(counts.get("PROJECT_ASSET") ?? 0) + (counts.get("SHARED") ?? 0)} icon={<FileText size={16} />} tone="sky" delay={120} />
        <StatCard label="Invoices" value={counts.get("INVOICE") ?? 0} icon={<Receipt size={16} />} tone="emerald" delay={180} />
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            onClick={() => setCat(c.key)}
            className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition ${cat === c.key ? "bg-violet-500 text-white" : "border border-white/10 text-white/60 hover:bg-white/10"}`}
          >
            {c.icon} {c.label}
            {c.key !== "ALL" && <span className="opacity-60">({counts.get(c.key) ?? 0})</span>}
          </button>
        ))}
        <div className="relative ml-auto">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search documents…"
            className="w-64 rounded-full border border-white/10 bg-white/5 py-1.5 pl-9 pr-3 text-xs text-white outline-none focus:border-violet-400/50"
          />
        </div>
      </div>

      {loading ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="tv-skeleton h-28 rounded-2xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-white/10 glass p-10 text-center text-sm text-muted-foreground">
          {docs.length === 0
            ? "No documents yet. Legal docs, project files, invoices and learning PDFs will appear here as they're uploaded."
            : "No documents match this filter."}
        </div>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((d, i) => (
            <div key={d.id} style={{ animationDelay: `${Math.min(i, 12) * 40}ms` }} className="tv-fade-up tv-lift flex flex-col rounded-2xl border border-white/10 glass p-4">
              <div className="flex items-start justify-between gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${CAT_TONE[d.category]}`}>
                  {CATEGORIES.find((c) => c.key === d.category)?.label ?? d.category}
                </span>
                {d.verified && (
                  <span className="inline-flex items-center gap-1 text-[10px] text-emerald-300"><ShieldCheck size={11} /> Verified</span>
                )}
              </div>
              <p className="mt-2 line-clamp-2 text-sm font-semibold text-white">{d.title}</p>
              {d.project && <p className="mt-0.5 text-xs text-muted-foreground">{d.project}</p>}
              <div className="mt-auto flex items-center justify-between pt-3">
                <span className="text-[10px] text-white/35">
                  {new Date(d.uploadedAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                </span>
                <a
                  href={d.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1 text-[11px] font-medium text-sky-300 transition hover:bg-sky-500/20"
                >
                  <Download size={11} /> Open
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
