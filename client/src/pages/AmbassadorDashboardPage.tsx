import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card, Badge } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/store/authStore";
import { AmbassadorOnboarding } from "@/components/AmbassadorOnboarding";
import { AmbassadorQRCode } from "@/components/AmbassadorQRCode";
import {
  MapPin, Clock, QrCode, CheckCircle2, Loader2, Wifi, Navigation,
  FileUp, IndianRupee, ExternalLink, ClipboardCheck,
} from "lucide-react";
import { toast } from "sonner";
import type { AmbassadorTask } from "@/types";

function statusBadge(status: AmbassadorTask["status"]) {
  // SOP colour logic: GREEN = Available, YELLOW = Locked (in-progress), RED = Completed
  if (status === "AVAILABLE") return <Badge variant="success">Available</Badge>;
  if (status === "LOCKED") return <Badge variant="warning">In progress</Badge>;
  return <Badge variant="danger">Completed</Badge>;
}

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
  const [available, setAvailable] = useState<AmbassadorTask[]>([]);
  const [mine, setMine] = useState<AmbassadorTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showQRCode, setShowQRCode] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadTasks = useCallback(async () => {
    setError(null);
    try {
      const res = await api.get("/ambassador-tasks");
      setAvailable(res.data.available ?? []);
      setMine(res.data.mine ?? []);
    } catch (err: any) {
      setError(err?.response?.data?.error || "Failed to load ambassador tasks");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    if (!user.onboardingVerified) {
      setLoading(false);
      return;
    }
    loadTasks();
  }, [user, loadTasks]);

  async function acceptTask(id: string) {
    setBusyId(id);
    try {
      await api.post(`/ambassador-tasks/${id}/accept`);
      toast.success("Task accepted — you have 6 hours to complete it.");
      await loadTasks();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Could not accept task");
    } finally {
      setBusyId(null);
    }
  }

  if (!user) {
    return <div className="min-h-screen p-10 text-white">Loading ambassador workspace…</div>;
  }

  return (
    <main className="min-h-screen p-6 text-white md:p-10">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Ambassador Dashboard</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Accept a site-verification task, complete the on-site checklist, upload proof, and earn{" "}
            <span className="text-emerald-300">₹500</span> per completed task.
          </p>
        </div>
        <div className="space-y-1 text-right">
          <p className="text-sm text-muted-foreground">Logged in as</p>
          <p className="text-base font-medium">{user.name}</p>
          <button
            onClick={() => setShowQRCode(true)}
            className="mt-3 inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-sm font-medium text-blue-300 hover:bg-white/10 transition"
          >
            <QrCode size={16} />
            Share Access QR
          </button>
        </div>
      </div>

      <AmbassadorOnboarding />

      {!user.onboardingVerified ? (
        <div className="mt-8 rounded-3xl border border-amber-500/20 bg-amber-950/20 p-6 text-sm text-amber-100">
          <p className="text-base font-semibold">Verification required</p>
          <p className="mt-2">
            Complete phone, email, and Aadhaar verification above to unlock available tasks.
          </p>
        </div>
      ) : (
        <div className="mt-8 space-y-8">
          {/* My active / completed tasks */}
          {mine.length > 0 && (
            <section className="space-y-4">
              <h2 className="text-xl font-semibold">My tasks</h2>
              <div className="grid gap-4">
                {mine.map((task) => (
                  <MyTaskCard key={task._id} task={task} onChanged={loadTasks} />
                ))}
              </div>
            </section>
          )}

          {/* Available pool */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Available tasks</h2>
              <span className="text-sm text-muted-foreground">{available.length} open</span>
            </div>

            {loading ? (
              <div className="rounded-3xl border border-white/10 bg-white/5 p-8 text-center text-muted-foreground">
                Loading tasks…
              </div>
            ) : error ? (
              <div className="rounded-3xl border border-rose-500/20 bg-rose-950/20 p-6 text-sm text-rose-200">
                {error}
              </div>
            ) : available.length === 0 ? (
              <div className="rounded-3xl border border-white/10 bg-white/5 p-8 text-center text-muted-foreground">
                No open tasks right now. Check back soon.
              </div>
            ) : (
              <div className="grid gap-4">
                {available.map((task) => (
                  <Card key={task._id} className="border-white/10 glass p-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          {statusBadge(task.status)}
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-300">
                            <IndianRupee size={12} />
                            {task.payoutAmount} payout
                          </span>
                        </div>
                        <p className="text-lg font-semibold text-white">{task.title}</p>
                        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                          <MapPin size={14} /> {task.address}
                        </p>
                        <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <Clock size={12} /> Deadline {new Date(task.deadline).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                          </span>
                          {task.mapUrl && (
                            <a href={task.mapUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sky-300 hover:underline">
                              <ExternalLink size={12} /> Map
                            </a>
                          )}
                        </div>
                        {task.instructions && (
                          <p className="max-w-xl text-sm text-muted-foreground/80">{task.instructions}</p>
                        )}
                      </div>
                      <Button
                        variant="primary"
                        disabled={busyId === task._id}
                        onClick={() => acceptTask(task._id)}
                      >
                        {busyId === task._id ? "Accepting…" : "Accept task"}
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {showQRCode && <AmbassadorQRCode onClose={() => setShowQRCode(false)} />}
    </main>
  );
}

/**
 * A task this ambassador holds — walks through the SOP steps:
 * Step 3 checklist (GPS/Internet/live location) → Step 4 upload documents → Complete.
 */
function MyTaskCard({ task, onChanged }: { task: AmbassadorTask; onChanged: () => Promise<void> }) {
  const completed = task.status === "COMPLETED";
  const [gpsOn, setGpsOn] = useState(Boolean(task.checklist?.gpsOn));
  const [internetOn, setInternetOn] = useState(Boolean(task.checklist?.internetOn));
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(
    task.checklist?.liveLocation ? { lat: task.checklist.liveLocation.lat, lng: task.checklist.liveLocation.lng } : null,
  );
  const [files, setFiles] = useState<FileList | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [completing, setCompleting] = useState(false);

  const hasDocs = (task.documents?.length ?? 0) > 0;
  const checklistDone = gpsOn && internetOn && !!location;

  function captureLocation() {
    if (!navigator.geolocation) {
      toast.error("Geolocation isn't supported on this device");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        toast.success("Live location captured");
      },
      () => toast.error("Couldn't get location. Enable GPS and allow access."),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  async function saveChecklist() {
    setSaving(true);
    try {
      await api.post(`/ambassador-tasks/${task._id}/checklist`, {
        gpsOn,
        internetOn,
        lat: location?.lat,
        lng: location?.lng,
      });
      toast.success("Checklist saved");
      await onChanged();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to save checklist");
    } finally {
      setSaving(false);
    }
  }

  async function uploadDocs() {
    if (!files || files.length === 0) {
      toast.error("Select at least one document");
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      Array.from(files).forEach((f) => form.append("documents", f));
      await api.post(`/ambassador-tasks/${task._id}/documents`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      toast.success("Documents uploaded");
      setFiles(null);
      await onChanged();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function complete() {
    setCompleting(true);
    try {
      await api.post(`/ambassador-tasks/${task._id}/complete`);
      toast.success("Task completed! ₹500 payout is now due.");
      await onChanged();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Could not complete task");
    } finally {
      setCompleting(false);
    }
  }

  return (
    <Card className={`border-white/10 p-5 ${completed ? "bg-rose-950/10" : "bg-amber-950/10"}`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            {statusBadge(task.status)}
            {completed && task.payoutPaid && <Badge variant="success">Paid</Badge>}
            {completed && !task.payoutPaid && <Badge variant="info">Payout due</Badge>}
          </div>
          <p className="text-lg font-semibold text-white">{task.title}</p>
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <MapPin size={14} /> {task.address}
          </p>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          <p className="inline-flex items-center gap-1 text-emerald-300">
            <IndianRupee size={12} /> {task.payoutAmount}
          </p>
          {!completed && task.lockExpiresAt && (
            <p className="mt-1 inline-flex items-center gap-1 text-amber-300">
              <Clock size={12} /> {timeLeft(task.lockExpiresAt)}
            </p>
          )}
        </div>
      </div>

      {completed ? (
        <div className="mt-4 flex items-center gap-2 rounded-2xl border border-emerald-500/20 bg-emerald-950/20 p-4 text-sm text-emerald-100">
          <CheckCircle2 size={18} />
          Verification submitted. {task.payoutPaid ? "Your ₹500 payout has been paid." : "Your ₹500 payout is being processed."}
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {/* Step 3 — checklist */}
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-white">
              <ClipboardCheck size={16} /> Site-visit checklist
            </p>
            <div className="mt-3 flex flex-wrap gap-3">
              <button
                onClick={() => setGpsOn((v) => !v)}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs transition ${gpsOn ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200" : "border-white/10 bg-white/5 text-muted-foreground"}`}
              >
                <Navigation size={12} /> GPS {gpsOn ? "ON" : "OFF"}
              </button>
              <button
                onClick={() => setInternetOn((v) => !v)}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs transition ${internetOn ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200" : "border-white/10 bg-white/5 text-muted-foreground"}`}
              >
                <Wifi size={12} /> Internet {internetOn ? "ON" : "OFF"}
              </button>
              <button
                onClick={captureLocation}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs transition ${location ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200" : "border-white/10 bg-white/5 text-muted-foreground"}`}
              >
                <MapPin size={12} />
                {location ? `Location ${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}` : "Capture live location"}
              </button>
            </div>
            <Button size="sm" variant="outline" className="mt-3" disabled={saving} onClick={saveChecklist}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : "Save checklist"}
            </Button>
          </div>

          {/* Step 4 — documents */}
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-white">
              <FileUp size={16} /> Upload verification documents
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Site photos / proof (PDF or images, up to 10MB each).
              {hasDocs && <span className="ml-1 text-emerald-300">{task.documents.length} uploaded.</span>}
            </p>
            <input
              type="file"
              multiple
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              onChange={(e) => setFiles(e.target.files)}
              className="mt-3 block w-full text-xs text-muted-foreground file:mr-3 file:rounded-full file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-white"
            />
            <Button size="sm" variant="outline" className="mt-3" disabled={uploading || !files} onClick={uploadDocs}>
              {uploading ? <Loader2 size={14} className="animate-spin" /> : "Upload documents"}
            </Button>
          </div>

          {/* Complete */}
          <Button
            variant="primary"
            className="w-full"
            disabled={completing || !checklistDone || !hasDocs}
            onClick={complete}
          >
            {completing ? <Loader2 size={16} className="animate-spin" /> : "Mark task complete"}
          </Button>
          {(!checklistDone || !hasDocs) && (
            <p className="text-center text-xs text-muted-foreground">
              Complete the checklist and upload at least one document to finish.
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
