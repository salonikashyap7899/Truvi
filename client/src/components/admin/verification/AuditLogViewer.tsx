import { useEffect, useState } from "react";
import { api } from "@/lib/api";

interface Log { _id: string; userId?: string | null; action: string; resourceType?: string | null; resourceId?: string | null; metadata: Record<string, unknown>; createdAt: string; }

/** Read-only audit trail viewer (admin actions, KYC access, verification runs). */
export default function AuditLogViewer() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => { api.get("/admin/audit-logs?limit=200").then((r) => setLogs(r.data.logs)).catch(() => {}).finally(() => setLoaded(true)); }, []);

  return (
    <div className="overflow-x-auto rounded-2xl border border-white/10">
      <table className="w-full text-sm">
        <thead className="glass text-muted-foreground">
          <tr><th className="p-3 text-left">Time</th><th className="p-3 text-left">Action</th><th className="p-3 text-left">Resource</th><th className="p-3 text-left">Details</th></tr>
        </thead>
        <tbody>
          {!loaded ? <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">Loading…</td></tr>
            : logs.length === 0 ? <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">No audit entries yet.</td></tr>
            : logs.map((l) => (
              <tr key={l._id} className="border-t border-white/10">
                <td className="whitespace-nowrap p-3 text-muted-foreground">{new Date(l.createdAt).toLocaleString("en-IN")}</td>
                <td className="p-3 font-medium text-white">{l.action}</td>
                <td className="p-3 text-muted-foreground">{l.resourceType}{l.resourceId ? ` · ${l.resourceId.slice(0, 8)}…` : ""}</td>
                <td className="p-3 font-mono text-[11px] text-muted-foreground">{JSON.stringify(l.metadata)}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}
