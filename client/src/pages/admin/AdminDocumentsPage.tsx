import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { FileText, ExternalLink, Loader2, Search, LayoutGrid, List, Building2, User } from "lucide-react";
import SectionInfoTooltip from "@/components/admin/SectionInfoTooltip";

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
  LEGAL: "Legal Document",
  ASSET: "Project Collateral",
  SHARED: "Shared File",
};

const SOURCE_FILTERS: (DocSource | "ALL")[] = ["ALL", "BUYER", "LEGAL", "ASSET", "SHARED"];
const STATUS_FILTERS: (DocStatus | "ALL")[] = ["ALL", "PENDING", "APPROVED", "REJECTED"];

export default function AdminDocumentsPage() {
  const [docs, setDocs] = useState<AdminDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<DocSource | "ALL">("ALL");
  const [statusFilter, setStatusFilter] = useState<DocStatus | "ALL">("ALL");
  const [viewMode, setViewMode] = useState<"table" | "grid">("table");

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
    <main className="min-h-screen p-4 sm:p-6 lg:p-8 text-foreground max-w-[1600px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold sm:text-3xl flex items-center gap-2.5">
              <FileText size={24} className="text-sky-400" />
              Document Management
            </h1>
            <SectionInfoTooltip
              title="Central Document Repository"
              content="Search, preview, and verify uploaded legal documents, title deeds, buyer KYC proofs, and project collateral across all listings with inline previews and audit trails."
            />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Audit file approvals, review legal title submissions, and verify uploaded assets.
          </p>
        </div>

        {/* View Toggle & Search */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center border border-white/10 rounded-lg p-0.5 bg-white/[0.02]">
            <button
              type="button"
              onClick={() => setViewMode("table")}
              className={`p-1.5 rounded-md transition ${viewMode === "table" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              title="List View"
            >
              <List size={15} />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              className={`p-1.5 rounded-md transition ${viewMode === "grid" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              title="Grid View"
            >
              <LayoutGrid size={15} />
            </button>
          </div>

          <div className="relative w-full sm:w-72">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search documents, projects…"
              className="w-full rounded-xl border border-white/10 bg-white/[0.03] py-2 pl-9 pr-3 text-xs placeholder:text-muted-foreground outline-none focus:border-sky-500 transition"
            />
          </div>
        </div>
      </div>

      {/* Filter Bars */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
        {/* Source Categories */}
        <div className="flex flex-wrap gap-1.5">
          {SOURCE_FILTERS.map((s) => (
            <button
              key={s}
              onClick={() => setSourceFilter(s)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                sourceFilter === s
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
              }`}
            >
              {s === "ALL" ? "All Sources" : SOURCE_LABEL[s]}
            </button>
          ))}
        </div>

        {/* Status Filter */}
        <div className="flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium border transition ${
                statusFilter === s
                  ? "border-sky-500/50 bg-sky-500/10 text-sky-300"
                  : "border-white/10 bg-background text-muted-foreground hover:text-foreground"
              }`}
            >
              {s === "ALL" ? "All Statuses" : s.charAt(0) + s.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-16 text-muted-foreground gap-3">
          <Loader2 size={18} className="animate-spin text-sky-400" />
          <span>Loading central document repository…</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-card p-12 text-center text-sm text-muted-foreground">
          No documents match your query or filters.
        </div>
      ) : viewMode === "table" ? (
        /* High-Density Data Table View */
        <div className="rounded-xl border border-white/10 bg-card overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[950px] text-left text-sm">
              <thead className="border-b border-white/10 bg-white/[0.02] text-xs text-muted-foreground">
                <tr>
                  <th className="p-3.5">Document Name</th>
                  <th className="p-3.5">Source &amp; Category</th>
                  <th className="p-3.5">Project / Listing</th>
                  <th className="p-3.5">Uploader</th>
                  <th className="p-3.5">Status</th>
                  <th className="p-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filtered.map((d) => {
                  const busy = busyId === d._id;
                  const isApproved = d.status === "APPROVED";
                  const isPending = d.status === "PENDING";
                  return (
                    <tr key={`${d.source}-${d._id}`} className="transition hover:bg-white/[0.02]">
                      <td className="p-3.5">
                        <div className="flex items-center gap-2.5">
                          <FileText size={16} className="text-sky-400 shrink-0" />
                          <div className="min-w-0">
                            <a
                              href={d.fileUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="font-medium text-xs text-foreground hover:underline truncate max-w-xs block"
                            >
                              {d.fileName}
                            </a>
                            {d.createdAt && (
                              <p className="text-[11px] text-muted-foreground">
                                {new Date(d.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="p-3.5">
                        <span className="text-xs font-semibold text-foreground">{SOURCE_LABEL[d.source]}</span>
                        <p className="text-[11px] text-muted-foreground capitalize">{d.category.replaceAll("_", " ")}</p>
                      </td>

                      <td className="p-3.5">
                        {d.project ? (
                          <div className="flex items-center gap-1.5 text-xs text-foreground">
                            <Building2 size={13} className="text-muted-foreground shrink-0" />
                            <span className="truncate max-w-[180px]">{d.project.name}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>

                      <td className="p-3.5">
                        {d.uploader ? (
                          <div className="flex items-center gap-1.5 text-xs text-foreground">
                            <User size={13} className="text-muted-foreground shrink-0" />
                            <div>
                              <span>{d.uploader.name}</span>
                              <span className="block text-[10px] text-muted-foreground uppercase">{d.uploader.role}</span>
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">System</span>
                        )}
                      </td>

                      <td className="p-3.5">
                        <div className="flex items-center gap-1.5 text-xs font-semibold">
                          <span
                            className={`size-1.5 rounded-full ${
                              isApproved ? "bg-emerald-400" : isPending ? "bg-amber-400 animate-pulse" : "bg-rose-400"
                            }`}
                          />
                          <span className={isApproved ? "text-emerald-400" : isPending ? "text-amber-400" : "text-rose-400"}>
                            {d.status.charAt(0) + d.status.slice(1).toLowerCase()}
                          </span>
                        </div>
                      </td>

                      <td className="p-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <a
                            href={d.fileUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-lg border border-white/10 px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground transition inline-flex items-center gap-1"
                          >
                            Inspect <ExternalLink size={11} />
                          </a>

                          {d.approvable && (
                            <>
                              {d.status !== "APPROVED" && (
                                <button
                                  type="button"
                                  onClick={() => decide(d, "APPROVED")}
                                  disabled={busy}
                                  className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20 transition disabled:opacity-50"
                                >
                                  Approve
                                </button>
                              )}
                              {d.status !== "REJECTED" && (
                                <button
                                  type="button"
                                  onClick={() => decide(d, "REJECTED")}
                                  disabled={busy}
                                  className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-2 py-1 text-xs font-semibold text-rose-300 hover:bg-rose-500/20 transition disabled:opacity-50"
                                >
                                  Reject
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Grid Card View */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((d) => {
            const busy = busyId === d._id;
            const isApproved = d.status === "APPROVED";
            const isPending = d.status === "PENDING";
            return (
              <div key={`${d.source}-${d._id}`} className="rounded-xl border border-white/10 bg-card p-4 space-y-3 flex flex-col justify-between shadow-sm">
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[10px] font-bold tracking-wider text-sky-400 uppercase">
                      {SOURCE_LABEL[d.source]}
                    </span>
                    <div className="flex items-center gap-1.5 text-xs font-semibold">
                      <span className={`size-1.5 rounded-full ${isApproved ? "bg-emerald-400" : isPending ? "bg-amber-400 animate-pulse" : "bg-rose-400"}`} />
                      <span className={isApproved ? "text-emerald-400" : isPending ? "text-amber-400" : "text-rose-400"}>
                        {d.status.charAt(0) + d.status.slice(1).toLowerCase()}
                      </span>
                    </div>
                  </div>

                  <h3 className="font-semibold text-sm mt-1 truncate" title={d.fileName}>
                    {d.fileName}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5 capitalize">
                    {d.category.replaceAll("_", " ")}
                  </p>

                  {d.project && (
                    <div className="mt-2 text-xs text-muted-foreground flex items-center gap-1">
                      <Building2 size={12} /> {d.project.name}
                    </div>
                  )}
                </div>

                <div className="pt-2 border-t border-white/5 flex items-center justify-between gap-2">
                  <a
                    href={d.fileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-sky-400 hover:underline"
                  >
                    View Document <ExternalLink size={11} />
                  </a>

                  {d.approvable && (
                    <div className="flex gap-1">
                      {d.status !== "APPROVED" && (
                        <button
                          type="button"
                          onClick={() => decide(d, "APPROVED")}
                          disabled={busy}
                          className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20 transition disabled:opacity-50"
                        >
                          Approve
                        </button>
                      )}
                      {d.status !== "REJECTED" && (
                        <button
                          type="button"
                          onClick={() => decide(d, "REJECTED")}
                          disabled={busy}
                          className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-xs font-semibold text-rose-300 hover:bg-rose-500/20 transition disabled:opacity-50"
                        >
                          Reject
                        </button>
                      )}
                    </div>
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
