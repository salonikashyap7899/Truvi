import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Phone, Search, Loader2, Play, Pause, ArrowLeft, RefreshCw } from "lucide-react";
import { toast } from "sonner";

interface CallRow {
  id: string;
  projectId: string;
  projectName: string | null;
  developerName: string | null;
  cpName: string | null;
  status: string;
  virtualNumber: string | null;
  durationSec: number | null;
  startedAt: string | null;
  endedAt: string | null;
  hasRecording: boolean;
  createdAt: string | null;
}

const STATUSES = ["", "CONNECTED", "COMPLETED", "IN_PROGRESS", "RINGING", "INITIATED", "MISSED", "NO_ANSWER", "BUSY", "FAILED", "CANCELED"];

function fmtDuration(sec: number | null) {
  if (!sec || sec <= 0) return "—";
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
function fmtDateTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function statusTone(s: string) {
  if (["CONNECTED", "COMPLETED", "IN_PROGRESS"].includes(s)) return "border-emerald-400/30 bg-emerald-500/10 text-emerald-300";
  if (["RINGING", "INITIATED"].includes(s)) return "border-sky-400/30 bg-sky-500/10 text-sky-300";
  if (["MISSED", "NO_ANSWER", "BUSY"].includes(s)) return "border-amber-400/30 bg-amber-500/10 text-amber-300";
  return "border-red-400/30 bg-red-500/10 text-red-300";
}

export default function AdminCallsPage() {
  const [rows, setRows] = useState<CallRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [loadingRec, setLoadingRec] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  async function load() {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (status) params.status = status;
      if (from) params.from = from;
      if (to) params.to = to;
      const res = await api.get("/admin/calls", { params });
      setRows(res.data.calls ?? []);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to load calls");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [status, from, to]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => [r.projectName, r.developerName, r.cpName].some((n) => (n ?? "").toLowerCase().includes(q)));
  }, [rows, search]);

  async function playRecording(id: string) {
    if (playingId === id && audioRef.current) {
      audioRef.current.pause();
      setPlayingId(null);
      return;
    }
    setLoadingRec(id);
    try {
      const res = await api.get(`/admin/calls/${id}/recording`, { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      if (audioRef.current) { audioRef.current.pause(); }
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => { setPlayingId(null); URL.revokeObjectURL(url); };
      await audio.play();
      setPlayingId(id);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Couldn't play the recording");
    } finally {
      setLoadingRec(null);
    }
  }

  const connected = rows.filter((r) => ["CONNECTED", "COMPLETED", "IN_PROGRESS"].includes(r.status)).length;
  const missed = rows.filter((r) => ["MISSED", "NO_ANSWER", "BUSY"].includes(r.status)).length;
  const failed = rows.filter((r) => ["FAILED", "CANCELED"].includes(r.status)).length;

  return (
    <main className="min-h-screen p-4 text-white sm:p-6 md:p-10">
      <Link to="/admin/dashboard" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-white"><ArrowLeft size={13} /> Admin Dashboard</Link>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-semibold"><Phone size={20} className="text-emerald-300" /> Call Management</h1>
        <button onClick={load} className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold hover:bg-white/10"><RefreshCw size={13} /> Refresh</button>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">Masked CP → Developer calls. Real numbers are never shown; recordings are available to admins only.</p>

      {/* Stats */}
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Total calls", value: rows.length, tone: "text-white" },
          { label: "Connected", value: connected, tone: "text-emerald-300" },
          { label: "Missed / no-answer", value: missed, tone: "text-amber-300" },
          { label: "Failed", value: failed, tone: "text-red-300" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-white/10 glass p-3">
            <p className={`text-2xl font-semibold ${s.tone}`}>{s.value}</p>
            <p className="text-[11px] text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search project / CP / developer" className="h-9 w-64 rounded-full border border-white/12 bg-white/[0.04] pl-9 pr-3 text-sm text-white placeholder:text-white/30 outline-none" />
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-9 rounded-full border border-white/12 bg-white/[0.04] px-3 text-sm text-white [&>option]:bg-[#0a0d14]">
          {STATUSES.map((s) => <option key={s} value={s}>{s || "All statuses"}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-xs text-white/60">From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 rounded-lg border border-white/12 bg-white/[0.04] px-2 text-sm text-white" /></label>
        <label className="flex items-center gap-1.5 text-xs text-white/60">To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 rounded-lg border border-white/12 bg-white/[0.04] px-2 text-sm text-white" /></label>
      </div>

      {/* Table */}
      <div className="mt-4 overflow-x-auto rounded-2xl border border-white/10 glass">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left text-[11px] uppercase tracking-wide text-white/50">
              <th className="px-4 py-3">Project</th>
              <th className="px-4 py-3">Channel Partner</th>
              <th className="px-4 py-3">Developer</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Duration</th>
              <th className="px-4 py-3">Started</th>
              <th className="px-4 py-3">Recording</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-muted-foreground"><Loader2 size={18} className="mx-auto animate-spin" /></td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-muted-foreground">No calls found.</td></tr>
            ) : (
              filtered.map((r) => (
                <tr key={r.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                  <td className="px-4 py-3">
                    {r.projectName ? <Link to={`/admin/listings/${r.projectId}`} className="font-medium text-white hover:text-sky-300">{r.projectName}</Link> : <span className="text-white/50">—</span>}
                  </td>
                  <td className="px-4 py-3 text-white/85">{r.cpName ?? "—"}</td>
                  <td className="px-4 py-3 text-white/85">{r.developerName ?? "—"}</td>
                  <td className="px-4 py-3"><span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${statusTone(r.status)}`}>{r.status}</span></td>
                  <td className="px-4 py-3 tabular-nums text-white/85">{fmtDuration(r.durationSec)}</td>
                  <td className="px-4 py-3 text-white/70">{fmtDateTime(r.startedAt ?? r.createdAt)}</td>
                  <td className="px-4 py-3">
                    {r.hasRecording ? (
                      <button onClick={() => playRecording(r.id)} disabled={loadingRec === r.id} className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold hover:bg-white/10 disabled:opacity-50">
                        {loadingRec === r.id ? <Loader2 size={12} className="animate-spin" /> : playingId === r.id ? <Pause size={12} /> : <Play size={12} />}
                        {playingId === r.id ? "Pause" : "Play"}
                      </button>
                    ) : <span className="text-xs text-white/40">—</span>}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
