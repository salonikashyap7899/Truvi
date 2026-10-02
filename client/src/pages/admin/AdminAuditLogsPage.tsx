import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { useSocketEvent } from "@/lib/socket";
import { StatCard } from "@/components/ui/stat";
import { ArrowLeft, ScrollText, Search, Download, RefreshCw, ShieldCheck, Users, Wallet } from "lucide-react";
import UserMenu from "@/components/UserMenu";

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

/** Everything before the first dot groups actions into areas (project.update → project). */
const areaOf = (action: string) => action.split(".")[0];

const AREA_TONE: Record<string, string> = {
  project: "bg-sky-500/15 text-sky-300",
  user: "bg-violet-500/15 text-violet-300",
  kyc: "bg-amber-500/15 text-amber-300",
  finance: "bg-emerald-500/15 text-emerald-300",
  commission: "bg-emerald-500/15 text-emerald-300",
  lead: "bg-fuchsia-500/15 text-fuchsia-300",
  settings: "bg-rose-500/15 text-rose-300",
  academy: "bg-blue-500/15 text-blue-300",
  ai: "bg-purple-500/15 text-purple-300",
};

export default function AdminAuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [area, setArea] = useState("ALL");
  const [live, setLive] = useState(0); // count of entries that arrived via socket

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

  // Real-time: every logAudit on the server pushes audit:new to admins.
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
    [logs],
  );

  function exportCsv() {
    const header = ["Time", "Actor", "Role", "Action", "Resource", "Resource ID", "Details"];
    const lines = filtered.map((l) => [
      new Date(l.createdAt).toLocaleString("en-IN"),
      l.actor?.name ?? "system",
      l.actor?.role ?? "",
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

  function describe(l: AuditLog): string {
    const m = l.metadata ?? {};
    const bits: string[] = [];
    for (const key of ["name", "title", "client", "milestone", "from", "to", "reason", "category"]) {
      if (m[key] !== undefined && m[key] !== null) bits.push(`${key}: ${String(m[key])}`);
    }
    return bits.join(" · ");
  }

  return (
    <main className="min-h-screen p-6 text-white md:p-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link to="/admin/dashboard" className="text-muted-foreground transition-colors hover:text-white">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold">
              <ScrollText size={22} className="text-amber-300" /> Audit Logs
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Every sensitive action, recorded and streamed live.
              {live > 0 && <span className="ml-2 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">+{live} live</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={exportCsv} className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-xs text-white/80 transition hover:bg-white/10">
            <Download size={13} /> Export CSV
          </button>
          <button onClick={load} className="rounded-full border border-white/10 bg-white/5 p-2 text-white/70 transition hover:bg-white/10" title="Refresh">
            <RefreshCw size={14} />
          </button>
          <UserMenu />
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <StatCard label="Entries Loaded" value={logs.length} icon={<ScrollText size={16} />} tone="violet" delay={0} />
        <StatCard label="Actions Today" value={today} icon={<ShieldCheck size={16} />} tone="emerald" delay={60} />
        <StatCard label="Distinct Areas" value={Math.max(areas.length - 1, 0)} icon={<Wallet size={16} />} tone="sky" delay={120} />
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        {areas.map((a) => (
          <button
            key={a}
            onClick={() => setArea(a)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-medium capitalize transition ${area === a ? "bg-violet-500 text-white" : "border border-white/10 text-white/60 hover:bg-white/10"}`}
          >
            {a === "ALL" ? "All areas" : a}
          </button>
        ))}
        <div className="relative ml-auto">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search action, user, resource…"
            className="w-64 rounded-full border border-white/10 bg-white/5 py-1.5 pl-9 pr-3 text-xs text-white outline-none focus:border-violet-400/50"
          />
        </div>
      </div>

      <div className="mt-4 overflow-x-auto rounded-2xl border border-white/10">
        <table className="w-full min-w-[820px] text-left text-xs">
          <thead className="bg-white/5 text-white/50">
            <tr>
              <th className="p-3 font-medium">Time</th>
              <th className="p-3 font-medium">Actor</th>
              <th className="p-3 font-medium">Action</th>
              <th className="p-3 font-medium">Resource</th>
              <th className="p-3 font-medium">Details</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">
                {logs.length === 0 ? "No audit entries yet — actions will appear here as the team works." : "No entries match this filter."}
              </td></tr>
            ) : (
              filtered.map((l) => (
                <tr key={l._id} className="border-t border-white/5 transition hover:bg-white/[0.03]">
                  <td className="whitespace-nowrap p-3 text-white/60">{new Date(l.createdAt).toLocaleString("en-IN")}</td>
                  <td className="p-3">
                    {l.actor ? (
                      <div className="flex items-center gap-2">
                        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-violet-500/20 text-[10px] font-bold text-violet-300">
                          {l.actor.name.charAt(0).toUpperCase()}
                        </span>
                        <div>
                          <p className="font-medium text-white/85">{l.actor.name}</p>
                          <p className="text-[10px] text-white/40">{l.actor.role}</p>
                        </div>
                      </div>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-white/40"><Users size={12} /> system</span>
                    )}
                  </td>
                  <td className="p-3">
                    <span className={`rounded-full px-2 py-0.5 font-mono text-[10px] ${AREA_TONE[areaOf(l.action)] ?? "bg-white/10 text-white/60"}`}>
                      {l.action}
                    </span>
                  </td>
                  <td className="p-3 text-white/60">
                    {l.resourceType ?? "—"}
                    {l.resourceId && <span className="block max-w-[140px] truncate font-mono text-[9px] text-white/30">{l.resourceId}</span>}
                  </td>
                  <td className="max-w-[300px] p-3 text-white/60">{describe(l) || "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
