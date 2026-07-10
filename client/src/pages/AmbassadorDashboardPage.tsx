import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { formatINR } from "@/lib/utils";
import { Card, Badge } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/store/authStore";
import { AmbassadorOnboarding } from "@/components/AmbassadorOnboarding";
import {
  MapPin, Clock, CheckCircle2, Camera, Navigation, Wifi, Loader2,
  IndianRupee, FileText, ExternalLink, Lock, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

/* Truvi Ambassador SOP dashboard:
   GREEN  = Available  (anyone can accept)
   YELLOW = Locked     (mine for 6 hours — checklist + documents + complete)
   RED    = Completed  (₹ payout earned)                                    */

interface TaskDoc { fileName: string; fileUrl: string; uploadedAt: string }
interface Checklist { gpsOn: boolean; internetOn: boolean; liveLat: number | null; liveLng: number | null; completedAt: string | null }
interface AmbassadorTask {
  _id: string;
  title: string;
  address: string;
  mapUrl?: string | null;
  deadline: string;
  payoutAmount: number;
  instructions?: string | null;
  status: "AVAILABLE" | "LOCKED" | "COMPLETED";
  colour: "GREEN" | "YELLOW" | "RED";
  isMine: boolean;
  lockExpiresAt?: string | null;
  checklist?: Checklist | null;
  documents: TaskDoc[];
  completedAt?: string | null;
}
interface Earnings { completedCount: number; totalEarned: number; totalPaid: number; pendingPayout: number }

const COLOUR_STYLES: Record<string, string> = {
  GREEN: "border-emerald-400/30 bg-emerald-500/10 text-emerald-300",
  YELLOW: "border-amber-400/30 bg-amber-500/10 text-amber-300",
  RED: "border-red-400/30 bg-red-500/10 text-red-300",
};
const COLOUR_LABEL: Record<string, string> = {
  GREEN: "Available",
  YELLOW: "Locked (in progress)",
  RED: "Completed",
};

function timeLeft(iso?: string | null): string {
  if (!iso) return "";
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "expired";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return `${h}h ${m}m left`;
}

export default function AmbassadorDashboardPage() {
  const user = useAuthStore((s) => s.user);
  const [tasks, setTasks] = useState<AmbassadorTask[]>([]);
  const [earnings, setEarnings] = useState<Earnings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const uploadTargetRef = useRef<string | null>(null);

  const verified = Boolean(user?.onboardingVerified);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [tasksRes, earningsRes] = await Promise.all([
        api.get("/ambassador-tasks"),
        api.get("/ambassador-tasks/earnings"),
      ]);
      setTasks(tasksRes.data.tasks);
      setEarnings(earningsRes.data);
    } catch (err: any) {
      setError(err?.response?.data?.error || "Failed to load ambassador tasks");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    if (!verified) {
      // SOP step 0: no listings visible until verification is complete.
      setTasks([]);
      setLoading(false);
      return;
    }
    load();
  }, [user, verified, load]);

  async function acceptTask(taskId: string) {
    setBusyTaskId(taskId);
    try {
      const res = await api.post(`/ambassador-tasks/${taskId}/accept`);
      toast.success(`Task accepted — it's yours for ${res.data.lockHours} hours`);
      setExpandedId(taskId);
      await load();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Could not accept task");
    } finally {
      setBusyTaskId(null);
    }
  }

  /** SOP step 3: GPS ON + Internet ON + live location capture. */
  async function runChecklist(taskId: string) {
    setBusyTaskId(taskId);
    try {
      if (!navigator.onLine) {
        toast.error("Internet is OFF — connect and try again");
        return;
      }
      if (!("geolocation" in navigator)) {
        toast.error("GPS not available on this device");
        return;
      }
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15000 })
      );
      await api.post(`/ambassador-tasks/${taskId}/checklist`, {
        gpsOn: true,
        internetOn: true,
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
      });
      toast.success("Site-visit checklist complete — live location captured");
      await load();
    } catch (err: any) {
      if (err?.code === 1) toast.error("Location permission denied — enable GPS to continue");
      else toast.error(err?.response?.data?.error || "Checklist failed — ensure GPS is ON");
    } finally {
      setBusyTaskId(null);
    }
  }

  function pickDocument(taskId: string) {
    uploadTargetRef.current = taskId;
    fileInputRef.current?.click();
  }

  async function onFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    const taskId = uploadTargetRef.current;
    e.target.value = "";
    if (!file || !taskId) return;
    setBusyTaskId(taskId);
    try {
      const form = new FormData();
      form.append("file", file);
      await api.post(`/ambassador-tasks/${taskId}/documents`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      toast.success("Document uploaded");
      await load();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Upload failed");
    } finally {
      setBusyTaskId(null);
    }
  }

  async function completeTask(taskId: string) {
    setBusyTaskId(taskId);
    try {
      const res = await api.post(`/ambassador-tasks/${taskId}/complete`);
      toast.success(res.data.message || "Task completed!");
      await load();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Could not complete task");
    } finally {
      setBusyTaskId(null);
    }
  }

  const sorted = useMemo(() => {
    // Mine-in-progress first, then available, completed last.
    const rank = (t: AmbassadorTask) => (t.status === "LOCKED" && t.isMine ? 0 : t.status === "AVAILABLE" ? 1 : t.status === "LOCKED" ? 2 : 3);
    return [...tasks].sort((a, b) => rank(a) - rank(b));
  }, [tasks]);

  if (!user) return null;

  return (
    <main className="min-h-screen p-6 text-white md:p-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Ambassador Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Accept site-visit tasks, complete the checklist, upload proof — earn per completed task.
          </p>
        </div>
        {verified && (
          <Button variant="outline" onClick={() => { setLoading(true); load(); }} className="gap-2">
            <RefreshCw size={14} /> Refresh
          </Button>
        )}
      </div>

      {/* SOP step 0 — verification gate */}
      {!verified && (
        <>
          <div className="mt-6 rounded-3xl border border-amber-500/20 bg-amber-950/20 p-5">
            <div className="flex items-center gap-3">
              <Lock size={20} className="text-amber-400" />
              <div>
                <p className="font-semibold text-amber-200">Verification required</p>
                <p className="text-sm text-amber-100/70">
                  Complete phone OTP, email OTP and Aadhaar upload below. Task listings unlock when all three are done.
                </p>
              </div>
            </div>
          </div>
          <AmbassadorOnboarding />
        </>
      )}

      {verified && (
        <>
          {/* Earnings summary (SOP step 7 — payment per completed task) */}
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <Card className="border-white/10 glass p-5">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Completed tasks</p>
              <p className="mt-1 text-2xl font-semibold">{earnings?.completedCount ?? 0}</p>
            </Card>
            <Card className="border-white/10 glass p-5">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Total earned</p>
              <p className="mt-1 flex items-center text-2xl font-semibold text-emerald-300">
                <IndianRupee size={20} />{(earnings?.totalEarned ?? 0).toLocaleString("en-IN")}
              </p>
            </Card>
            <Card className="border-white/10 glass p-5">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Pending payout</p>
              <p className="mt-1 flex items-center text-2xl font-semibold text-amber-300">
                <IndianRupee size={20} />{(earnings?.pendingPayout ?? 0).toLocaleString("en-IN")}
              </p>
            </Card>
          </div>

          {/* Colour legend (SOP step 2) */}
          <div className="mt-6 flex flex-wrap gap-2 text-xs">
            {(["GREEN", "YELLOW", "RED"] as const).map((c) => (
              <span key={c} className={`rounded-full border px-3 py-1 ${COLOUR_STYLES[c]}`}>
                {c} — {COLOUR_LABEL[c]}
              </span>
            ))}
          </div>

          {error && <p className="mt-6 rounded-xl border border-red-500/25 bg-red-950/40 px-4 py-3 text-sm text-red-300">{error}</p>}
          {loading && <p className="mt-6 text-sm text-muted-foreground">Loading tasks…</p>}
          {!loading && sorted.length === 0 && !error && (
            <Card className="mt-6 border-white/10 glass p-8 text-center text-muted-foreground">
              No tasks posted yet. Check back soon — new site-visit tasks appear here.
            </Card>
          )}

          {/* Task listing (SOP step 1) */}
          <div className="mt-4 space-y-4">
            {sorted.map((task) => {
              const expanded = expandedId === task._id;
              const busy = busyTaskId === task._id;
              const mineInProgress = task.status === "LOCKED" && task.isMine;
              const checklistDone = Boolean(task.checklist?.completedAt);
              const hasDocs = (task.documents?.length ?? 0) > 0;

              return (
                <Card key={task._id} className="border-white/10 glass overflow-hidden">
                  <button
                    className="flex w-full flex-wrap items-center justify-between gap-3 p-5 text-left"
                    onClick={() => setExpandedId(expanded ? null : task._id)}
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold">{task.title}</p>
                        <Badge className={`border ${COLOUR_STYLES[task.colour]}`}>{task.colour}</Badge>
                        {mineInProgress && (
                          <span className="flex items-center gap-1 text-xs text-amber-300">
                            <Clock size={12} /> {timeLeft(task.lockExpiresAt)}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
                        <MapPin size={13} /> {task.address}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <span className="flex items-center font-semibold text-emerald-300">
                        <IndianRupee size={14} />{task.payoutAmount.toLocaleString("en-IN")}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Deadline {new Date(task.deadline).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                      </span>
                    </div>
                  </button>

                  {expanded && (
                    <div className="border-t border-white/10 p-5">
                      <div className="flex flex-wrap gap-4 text-sm">
                        {task.mapUrl && (
                          <a href={task.mapUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-sky-300 underline-offset-4 hover:underline">
                            <ExternalLink size={13} /> Google Map location
                          </a>
                        )}
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <Clock size={13} /> Deadline: {new Date(task.deadline).toLocaleString("en-IN")}
                        </span>
                      </div>
                      {task.instructions && <p className="mt-3 text-sm text-muted-foreground">{task.instructions}</p>}

                      {/* GREEN: accept (SOP step 2) */}
                      {task.status === "AVAILABLE" && (
                        <Button onClick={() => acceptTask(task._id)} disabled={busy} className="mt-4 gap-2">
                          {busy ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                          Accept task (locks it for you — 6 hours)
                        </Button>
                      )}

                      {/* YELLOW someone else's */}
                      {task.status === "LOCKED" && !task.isMine && (
                        <p className="mt-4 flex items-center gap-2 text-sm text-amber-300">
                          <Lock size={14} /> Another ambassador is working on this task.
                        </p>
                      )}

                      {/* YELLOW mine: checklist -> documents -> complete (SOP steps 3-4) */}
                      {mineInProgress && (
                        <div className="mt-5 space-y-4">
                          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                            <p className="flex items-center gap-2 text-sm font-semibold">
                              <Navigation size={14} className={checklistDone ? "text-emerald-400" : "text-amber-400"} />
                              Step 1 — Site-visit checklist
                              {checklistDone && <CheckCircle2 size={14} className="text-emerald-400" />}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              GPS ON • Internet ON • Live location capture (run this at the site)
                            </p>
                            {!checklistDone && (
                              <Button onClick={() => runChecklist(task._id)} disabled={busy} variant="outline" className="mt-3 gap-2">
                                {busy ? <Loader2 size={14} className="animate-spin" /> : <Wifi size={14} />}
                                Capture live location
                              </Button>
                            )}
                            {checklistDone && task.checklist && (
                              <p className="mt-2 text-xs text-emerald-300">
                                Location captured: {task.checklist.liveLat?.toFixed(5)}, {task.checklist.liveLng?.toFixed(5)}
                              </p>
                            )}
                          </div>

                          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                            <p className="flex items-center gap-2 text-sm font-semibold">
                              <Camera size={14} className={hasDocs ? "text-emerald-400" : "text-amber-400"} />
                              Step 2 — Upload proof documents
                              {hasDocs && <CheckCircle2 size={14} className="text-emerald-400" />}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">Site photos, verification proof — at least one required.</p>
                            <div className="mt-3 flex flex-wrap items-center gap-2">
                              <Button onClick={() => pickDocument(task._id)} disabled={busy} variant="outline" className="gap-2">
                                {busy ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
                                Upload document
                              </Button>
                              {task.documents?.map((d, i) => (
                                <a key={i} href={d.fileUrl} target="_blank" rel="noreferrer" className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-sky-300 hover:underline">
                                  {d.fileName}
                                </a>
                              ))}
                            </div>
                          </div>

                          <Button
                            onClick={() => completeTask(task._id)}
                            disabled={busy || !checklistDone || !hasDocs}
                            className="w-full gap-2 bg-gradient-to-r from-emerald-500 to-emerald-400 text-black hover:opacity-90"
                          >
                            {busy ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                            Mark complete — earn {formatINR(task.payoutAmount)}
                          </Button>
                        </div>
                      )}

                      {/* RED: completed */}
                      {task.status === "COMPLETED" && (
                        <p className="mt-4 flex items-center gap-2 text-sm text-red-300">
                          <CheckCircle2 size={14} />
                          Completed{task.completedAt ? ` on ${new Date(task.completedAt).toLocaleString("en-IN")}` : ""}
                          {task.isMine ? ` — ${formatINR(task.payoutAmount)} earned` : ""}
                        </p>
                      )}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </>
      )}

      {/* hidden shared file input for document uploads */}
      <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="hidden" onChange={onFileChosen} />
    </main>
  );
}
