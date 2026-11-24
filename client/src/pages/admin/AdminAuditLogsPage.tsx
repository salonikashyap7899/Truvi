import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { useSocketEvent } from "@/lib/socket";
import { ScrollText, Search, Download, RefreshCw, X, ChevronRight } from "lucide-react";
import SectionInfoTooltip from "@/components/admin/SectionInfoTooltip";

interface AuditLog {
  _id: string;
  userId: string | null;
  action: string;
  resourceType?: string | null;
  resourceId?: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  actor?: { _id: string; name: string; email: string; role: string } | null;
}

const areaOf = (action: string) => action.split(".")[0];

const AREA_DOT_COLOR: Record<string, string> = {
  project: "bg-sky-400",
  user: "bg-violet-400",
  kyc: "bg-amber-400",
  finance: "bg-emerald-400",
  commission: "bg-emerald-400",
  lead: "bg-fuchsia-400",
  settings: "bg-rose-400",
  employee: "bg-indigo-400",
  compliance: "bg-teal-400",
  academy: "bg-blue-400",
  ai: "bg-purple-400",
};

export default function AdminAuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [area, setArea] = useState("ALL");
  const [live, setLive] = useState(0);
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await api.get("/admin/audit-logs", { params: { limit: 500 } });
      setLogs(res.data.logs ?? []);
      setLive(0);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to load audit logs");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  useSocketEvent<AuditLog>("audit:new", (row) => {
    setLogs((prev) => (prev.some((l) => l._id === row._id) ? prev : [row, ...prev].slice(0, 800)));
    setLive((n) => n + 1);
  });

  const areas = useMemo(() => ["ALL", ...Array.from(new Set(logs.map((l) => areaOf(l.action)))).sort()], [logs]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return logs.filter((l) => {
      if (area !== "ALL" && areaOf(l.action) !== area) return false;
      if (!q) return true;
      const hay = `${l.action} ${l.resourceType ?? ""} ${l.resourceId ?? ""} ${l.actor?.name ?? ""} ${l.actor?.email ?? ""} ${JSON.stringify(l.metadata)}`.toLowerCase();
      return hay.includes(q);
    });
  }, [logs, query, area]);

  const today = useMemo(
    () => logs.filter((l) => new Date(l.createdAt).toDateString() === new Date().toDateString()).length,
    [logs]
  );

  function exportCsv() {
    const header = ["Timestamp", "Actor Name", "Actor Role", "Action", "Resource Type", "Resource ID", "Metadata"];
    const lines = filtered.map((l) => [
      new Date(l.createdAt).toLocaleString("en-IN"),
      l.actor?.name ?? "System",
      l.actor?.role ?? "SYSTEM",
      l.action,
      l.resourceType ?? "",
      l.resourceId ?? "",
      JSON.stringify(l.metadata ?? {}),
    ]);
    const csv = [header, ...lines].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `truvi-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="min-h-screen p-4 sm:p-6 lg:p-8 text-foreground max-w-[1600px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold sm:text-3xl flex items-center gap-2.5">
              <ScrollText size={24} className="text-amber-400" />
              Activity &amp; Audit Logs
            </h1>
            <SectionInfoTooltip
              title="Immutable System Audit Stream"
              content="Real-time chronological ledger of sensitive platform operations: listing approvals, role modifications, KYC reviews, payroll disbursements, and permission adjustments."
            />
          </div>
          <p className="mt-1 text-xs text-muted-foreground flex items-center gap-2">
            <span>Every sensitive action recorded across the entire platform.</span>
            {live > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400 border border-emerald-500/20">
                <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                +{live} live events
              </span>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={exportCsv}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 px-3.5 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-white/5 transition"
          >
            <Download size={13} /> Export Audit CSV
          </button>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 px-3.5 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-white/5 transition disabled:opacity-50"
            title="Refresh logs"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-white/10 bg-card p-4 space-y-1">
          <p className="text-xs text-muted-foreground font-medium">Audit Events Retained</p>
          <p className="text-2xl font-bold tracking-tight text-foreground tabular-nums">{logs.length}</p>
          <p className="text-[11px] text-muted-foreground">Streaming socket connected</p>
        </div>

        <div className="rounded-xl border border-white/10 bg-card p-4 space-y-1">
          <p className="text-xs text-muted-foreground font-medium">Logged Today</p>
          <p className="text-2xl font-bold tracking-tight text-emerald-400 tabular-nums">{today}</p>
          <p className="text-[11px] text-muted-foreground">Live operations recorded</p>
        </div>

        <div className="rounded-xl border border-white/10 bg-card p-4 space-y-1">
          <p className="text-xs text-muted-foreground font-medium">Active Subsystems</p>
          <p className="text-2xl font-bold tracking-tight text-sky-400 tabular-nums">{Math.max(areas.length - 1, 0)}</p>
          <p className="text-[11px] text-muted-foreground">Monitored action domains</p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
        {/* Module Subsystem Pills */}
        <div className="flex flex-wrap gap-1.5">
          {areas.map((a) => {
            const isSelected = area === a;
            const dot = AREA_DOT_COLOR[a] || "bg-sky-400";
            return (
              <button
                key={a}
                type="button"
                onClick={() => setArea(a)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  isSelected
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                }`}
              >
                {a !== "ALL" && <span className={`size-1.5 rounded-full ${dot}`} />}
                <span>{a === "ALL" ? "All Subsystems" : a.charAt(0).toUpperCase() + a.slice(1)}</span>
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-80">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search action, actor, resource ID…"
            className="w-full rounded-xl border border-white/10 bg-white/[0.03] py-2 pl-9 pr-3 text-xs placeholder:text-muted-foreground outline-none focus:border-sky-500 transition"
          />
        </div>
      </div>

      {/* Main Table */}
      {loading ? (
        <div className="flex items-center justify-center p-16 text-muted-foreground gap-3">
          <RefreshCw size={18} className="animate-spin text-amber-400" />
          <span>Synchronizing live audit stream…</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-card p-12 text-center text-sm text-muted-foreground">
          No audit records found matching your filters.
        </div>
      ) : (
        <div className="rounded-xl border border-white/10 bg-card overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[950px] text-left text-sm">
              <thead className="border-b border-white/10 bg-white/[0.02] text-xs text-muted-foreground">
                <tr>
                  <th className="p-3.5">Timestamp</th>
                  <th className="p-3.5">Action &amp; Domain</th>
                  <th className="p-3.5">Actor</th>
                  <th className="p-3.5">Target Resource</th>
                  <th className="p-3.5">Summary / Metadata</th>
                  <th className="p-3.5 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filtered.map((l) => {
                  const areaKey = areaOf(l.action);
                  const dot = AREA_DOT_COLOR[areaKey] || "bg-sky-400";
                  return (
                    <tr
                      key={l._id}
                      onClick={() => setSelectedLog(l)}
                      className="cursor-pointer transition hover:bg-white/[0.02]"
                    >
                      <td className="p-3.5 whitespace-nowrap text-xs font-mono text-muted-foreground">
                        {new Date(l.createdAt).toLocaleString("en-IN", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </td>

                      <td className="p-3.5">
                        <div className="flex items-center gap-2">
                          <span className={`size-1.5 rounded-full ${dot} shrink-0`} />
                          <span className="font-semibold text-xs text-foreground font-mono">
                            {l.action}
                          </span>
                        </div>
                      </td>

                      <td className="p-3.5">
                        <div className="text-xs">
                          <span className="font-medium text-foreground">{l.actor?.name || "System"}</span>
                          <span className="block text-[11px] text-muted-foreground font-mono">
                            {l.actor?.email || l.actor?.role || "SYSTEM_WORKER"}
                          </span>
                        </div>
                      </td>

                      <td className="p-3.5">
                        <div className="text-xs font-mono">
                          <span className="text-muted-foreground uppercase text-[10px] block">
                            {l.resourceType || "N/A"}
                          </span>
                          <span className="text-foreground truncate max-w-[140px] block">
                            {l.resourceId || "—"}
                          </span>
                        </div>
                      </td>

                      <td className="p-3.5">
                        <p className="text-xs text-muted-foreground truncate max-w-xs font-mono">
                          {Object.keys(l.metadata || {}).length > 0
                            ? JSON.stringify(l.metadata)
                            : "No metadata logged"}
                        </p>
                      </td>

                      <td className="p-3.5 text-right">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedLog(l);
                          }}
                          className="rounded-lg border border-white/10 px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground hover:border-white/20 transition inline-flex items-center gap-1"
                        >
                          Inspect <ChevronRight size={12} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Slide-over Inspection Drawer */}
      {selectedLog && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedLog(null);
          }}
        >
          <div className="w-full max-w-lg bg-card border-l border-white/10 p-6 shadow-2xl flex flex-col justify-between overflow-y-auto animate-in slide-in-from-right duration-200">
            <div className="space-y-5">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div>
                  <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">
                    Audit Event Payload
                  </span>
                  <h2 className="text-base font-bold font-mono mt-0.5">{selectedLog.action}</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedLog(null)}
                  className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-white/5 transition"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/5">
                  <div>
                    <span className="text-muted-foreground text-[11px] block">Timestamp</span>
                    <strong className="text-foreground font-mono">
                      {new Date(selectedLog.createdAt).toLocaleString("en-IN")}
                    </strong>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-[11px] block">Event ID</span>
                    <strong className="text-foreground font-mono text-[11px] truncate block">
                      {selectedLog._id}
                    </strong>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-[11px] block">Actor</span>
                    <strong className="text-foreground">
                      {selectedLog.actor?.name || "System"} ({selectedLog.actor?.role || "AUTO"})
                    </strong>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-[11px] block">Actor Email</span>
                    <strong className="text-foreground truncate block">
                      {selectedLog.actor?.email || "internal@truvi.ai"}
                    </strong>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-[11px] block">Target Resource</span>
                    <strong className="text-foreground uppercase font-mono">
                      {selectedLog.resourceType || "N/A"}
                    </strong>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-[11px] block">Resource ID</span>
                    <strong className="text-foreground font-mono truncate block">
                      {selectedLog.resourceId || "None"}
                    </strong>
                  </div>
                </div>

                <div>
                  <p className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wider mb-2">
                    Metadata &amp; State Diff (JSON)
                  </p>
                  <pre className="p-3.5 rounded-xl border border-white/10 bg-black/40 text-[11px] font-mono text-muted-foreground whitespace-pre-wrap break-all max-h-96 overflow-y-auto">
                    {JSON.stringify(selectedLog.metadata || {}, null, 2)}
                  </pre>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-white/10">
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="w-full rounded-xl bg-white/5 py-2.5 text-xs font-semibold hover:bg-white/10 transition"
              >
                Close Drawer
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
