import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { ArrowLeft, FileText, ExternalLink, Loader2, Search, CheckCircle2 } from "lucide-react";

type DocStatus = "APPROVED" | "PENDING" | "REJECTED";
type DocSource = "BUYER" | "LEGAL" | "ASSET" | "SHARED";

interface AdminDocument {
  _id: string;
  source: DocSource;
  category: string;
  fileName: string;
  fileUrl: string;
  status: DocStatus;
  approvable: boolean;
  uploader: { name: string; role: string } | null;
  project: { name: string } | null;
  createdAt: string | null;
}

const SOURCE_LABEL: Record<DocSource, string> = {
  BUYER: "Buyer KYC",
  LEGAL: "Legal doc",
  ASSET: "Project asset",
  SHARED: "Shared file",
};

const SOURCE_FILTERS: (DocSource | "ALL")[] = ["ALL", "BUYER", "LEGAL", "ASSET", "SHARED"];
const STATUS_FILTERS: (DocStatus | "ALL")[] = ["ALL", "PENDING", "APPROVED", "REJECTED"];

function statusBadge(status: DocStatus) {
  if (status === "APPROVED") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  if (status === "REJECTED") return "border-rose-500/30 bg-rose-500/10 text-rose-300";
  return "border-amber-500/30 bg-amber-500/10 text-amber-300";
}

export default function AdminDocumentsPage() {
  const [docs, setDocs] = useState<AdminDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<DocSource | "ALL">("ALL");
  const [statusFilter, setStatusFilter] = useState<DocStatus | "ALL">("ALL");

  async function load() {
    try {
      const res = await api.get("/admin/documents");
      setDocs(res.data.documents || []);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to load documents");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  async function decide(doc: AdminDocument, status: DocStatus) {
    setBusyId(doc._id);
    try {
      await api.patch(`/admin/documents/${doc.source}/${doc._id}`, { status });
      setDocs((prev) => prev.map((d) => (d._id === doc._id ? { ...d, status } : d)));
      toast.success(status === "APPROVED" ? "Document approved" : "Document rejected");
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Action failed");
    } finally {
      setBusyId(null);
    }
  }

  const counts = useMemo(() => ({
    total: docs.length,
    pending: docs.filter((d) => d.status === "PENDING" && d.approvable).length,
  }), [docs]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return docs.filter((d) => {
      if (sourceFilter !== "ALL" && d.source !== sourceFilter) return false;
      if (statusFilter !== "ALL" && d.status !== statusFilter) return false;
      if (!q) return true;
      return (
        d.fileName.toLowerCase().includes(q) ||
        d.category.toLowerCase().includes(q) ||
        (d.uploader?.name || "").toLowerCase().includes(q) ||
        (d.project?.name || "").toLowerCase().includes(q)
      );
    });
  }, [docs, query, sourceFilter, statusFilter]);

  return (
    <main className="min-h-screen p-6 text-white md:p-10">
      <Link to="/admin/dashboard" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-white">
        <ArrowLeft size={15} /> Back to dashboard
      </Link>
      <h1 className="mt-3 flex items-center gap-2 text-2xl font-semibold">
        <FileText size={22} className="text-[var(--trust)]" /> Documents
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Every document uploaded across the platform — buyer KYC, project legal docs, vault assets and shared files.
        {counts.pending > 0 ? ` ${counts.pending} awaiting your review.` : " All reviewed."} {counts.total} total.
      </p>

      {/* Filters */}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by file, type, uploader or project…"
            className="h-10 w-full rounded-md border border-white/15 bg-card pl-9 pr-3 text-sm text-white outline-none focus:border-white/30"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {SOURCE_FILTERS.map((s) => (
            <button
              key={s}
              onClick={() => setSourceFilter(s)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                sourceFilter === s ? "border-blue-500/60 bg-blue-500/15 text-blue-200" : "border-white/15 text-muted-foreground hover:bg-white/5"
              }`}
            >
              {s === "ALL" ? "All types" : SOURCE_LABEL[s]}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
              statusFilter === s ? "border-blue-500/60 bg-blue-500/15 text-blue-200" : "border-white/15 text-muted-foreground hover:bg-white/5"
            }`}
          >
            {s === "ALL" ? "All statuses" : s.charAt(0) + s.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="mt-10 text-sm text-muted-foreground">Loading documents…</p>
      ) : filtered.length === 0 ? (
        <p className="mt-10 text-sm text-muted-foreground">No documents match your filters.</p>
      ) : (
        <div className="mt-5 space-y-2.5">
          {filtered.map((d) => {
            const busy = busyId === d._id;
            return (
              <div key={`${d.source}-${d._id}`} className="flex flex-col gap-3 rounded-2xl border border-white/10 glass p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-medium">{d.fileName}</span>
                    <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[11px] text-foreground/80">{SOURCE_LABEL[d.source]}</span>
                    <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] uppercase tracking-wide text-muted-foreground">{d.category}</span>
                    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusBadge(d.status)}`}>
                      {d.status.charAt(0) + d.status.slice(1).toLowerCase()}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {d.uploader ? `${d.uploader.name} · ${d.uploader.role}` : "Unknown uploader"}
                    {d.project ? ` · ${d.project.name}` : ""}
                    {d.createdAt ? ` · ${new Date(d.createdAt).toLocaleDateString("en-IN")}` : ""}
                  </p>
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <a
                    href={d.fileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-2 text-sm font-medium text-white hover:bg-white/5"
                  >
                    Open <ExternalLink size={13} />
                  </a>
                  {d.approvable ? (
                    <>
                      <button
                        onClick={() => decide(d, "APPROVED")}
                        disabled={busy || d.status === "APPROVED"}
                        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-60 ${
                          d.status === "APPROVED"
                            ? "bg-emerald-600 text-white"
                            : "border border-emerald-600/60 text-emerald-300 hover:bg-emerald-600/15"
                        }`}
                      >
                        {busy && <Loader2 size={14} className="animate-spin" />}
                        {d.status === "APPROVED" && <CheckCircle2 size={13} />}
                        {d.status === "APPROVED" ? "Approved" : "Approve"}
                      </button>
                      <button
                        onClick={() => decide(d, "REJECTED")}
                        disabled={busy || d.status === "REJECTED"}
                        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-60 ${
                          d.status === "REJECTED"
                            ? "bg-rose-700 text-white"
                            : "border border-rose-700/60 text-rose-300 hover:bg-rose-900/25"
                        }`}
                      >
                        {d.status === "REJECTED" ? "Rejected" : "Reject"}
                      </button>
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground">No approval needed</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
