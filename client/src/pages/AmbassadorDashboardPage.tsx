import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { Card, Badge } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/store/authStore";
import { AmbassadorOnboarding } from "@/components/AmbassadorOnboarding";
import { AmbassadorQRCode } from "@/components/AmbassadorQRCode";
import {
  MapPin, Clock, QrCode, CheckCircle2, Loader2, Wifi, Navigation,
  FileUp, IndianRupee, ExternalLink, ClipboardCheck, Camera, X,
} from "lucide-react";
import { toast } from "sonner";
import type { AmbassadorTask } from "@/types";
import UserMenu from "@/components/UserMenu";

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

  if (!user) return null;

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
          <div className="flex justify-end"><UserMenu /></div>
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
  // Real GPS fix (lat/lng + accuracy in metres) — only set when the device
  // actually returns a satellite/location fix, so GPS "ON" can't be faked.
  const [gpsFix, setGpsFix] = useState<{ lat: number; lng: number; accuracy: number } | null>(
    task.checklist?.liveLocation
      ? { lat: task.checklist.liveLocation.lat, lng: task.checklist.liveLocation.lng, accuracy: 0 }
      : null,
  );
  // Live internet status straight from the browser/device.
  const [internetOn, setInternetOn] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [capturing, setCapturing] = useState(false);
  const [files, setFiles] = useState<FileList | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [completing, setCompleting] = useState(false);

  // Live camera capture (phone camera / webcam) for verification photos.
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [photos, setPhotos] = useState<File[]>([]);

  // Track real connectivity changes as they happen.
  useEffect(() => {
    const update = () => setInternetOn(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  const gpsOn = !!gpsFix; // derived from a genuine location fix, not a toggle
  const hasDocs = (task.documents?.length ?? 0) > 0;
  const checklistDone = gpsOn && internetOn;

  function captureLocation() {
    if (!navigator.geolocation) {
      toast.error("Geolocation isn't supported on this device");
      return;
    }
    setCapturing(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsFix({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy });
        setCapturing(false);
        toast.success("Live GPS location captured");
      },
      (err) => {
        setCapturing(false);
        setGpsFix(null);
        toast.error(
          err.code === err.PERMISSION_DENIED
            ? "Location permission denied — enable GPS access for this site."
            : "Couldn't get a GPS fix. Turn GPS on and try again outdoors.",
        );
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  }

  async function saveChecklist() {
    if (!gpsFix) {
      toast.error("Capture your live GPS location first");
      return;
    }
    setSaving(true);
    try {
      await api.post(`/ambassador-tasks/${task._id}/checklist`, {
        gpsOn: true,
        internetOn: navigator.onLine,
        lat: gpsFix.lat,
        lng: gpsFix.lng,
      });
      toast.success("Checklist saved");
      await onChanged();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to save checklist");
    } finally {
      setSaving(false);
    }
  }

  // Open the device camera (rear camera on phones, webcam on desktop).
  async function openCamera() {
    setCameraError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("Camera isn't supported on this device.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraOn(true);
      // Attach the stream once the <video> is in the DOM.
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play();
        }
      }, 0);
    } catch (err: any) {
      setCameraError(
        err?.name === "NotAllowedError"
          ? "Camera permission denied — allow camera access for this site."
          : "Couldn't open the camera. Check your device camera and try again.",
      );
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOn(false);
  }

  // Grab the current video frame as a JPEG photo.
  function capturePhoto() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `site-photo-${Date.now()}.jpg`, { type: "image/jpeg" });
        setPhotos((prev) => [...prev, file]);
        toast.success("Photo captured");
      },
      "image/jpeg",
      0.9,
    );
  }

  // Stop the camera when the card unmounts so the light turns off.
  useEffect(() => () => stopCamera(), []);

  async function uploadDocs() {
    const chosen = files ? Array.from(files) : [];
    const all = [...photos, ...chosen];
    if (all.length === 0) {
      toast.error("Capture at least one photo");
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      all.forEach((f) => form.append("documents", f));
      await api.post(`/ambassador-tasks/${task._id}/documents`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      toast.success("Photos uploaded");
      setPhotos([]);
      setFiles(null);
      stopCamera();
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
            <p className="mt-1 text-xs text-muted-foreground">
              Live-detected from your device — capture your real GPS location on site.
            </p>
            <div className="mt-3 space-y-2">
              {/* Internet — read live from the device, not a toggle */}
              <div
                className={`inline-flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-xs sm:w-auto ${internetOn ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200" : "border-rose-400/40 bg-rose-500/10 text-rose-200"}`}
              >
                <Wifi size={12} />
                {internetOn ? "Internet connected" : "Offline — reconnect to continue"}
              </div>

              {/* GPS — derived from a genuine location fix */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={captureLocation}
                  disabled={capturing}
                  className="inline-flex items-center gap-2 rounded-full border border-sky-400/40 bg-sky-500/10 px-3 py-2 text-xs text-sky-200 transition hover:bg-sky-500/20 disabled:opacity-60"
                >
                  {capturing ? <Loader2 size={12} className="animate-spin" /> : <Navigation size={12} />}
                  {capturing ? "Locating…" : gpsFix ? "Update GPS location" : "Capture live GPS location"}
                </button>
                {gpsFix && (
                  <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
                    <MapPin size={12} />
                    {gpsFix.lat.toFixed(5)}, {gpsFix.lng.toFixed(5)}
                    {gpsFix.accuracy ? ` · ±${Math.round(gpsFix.accuracy)}m` : ""}
                  </span>
                )}
              </div>
            </div>
            <Button size="sm" variant="outline" className="mt-3" disabled={saving || !gpsFix} onClick={saveChecklist}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : "Save checklist"}
            </Button>
          </div>

          {/* Step 4 — capture verification photos */}
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-white">
              <Camera size={16} /> Capture verification photos
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Take live photos on site with your phone camera or webcam.
              {hasDocs && <span className="ml-1 text-emerald-300">{task.documents.length} uploaded.</span>}
            </p>

            {cameraOn ? (
              <div className="mt-3 space-y-2">
                <div className="overflow-hidden rounded-xl border border-white/10 bg-black">
                  <video ref={videoRef} playsInline muted className="max-h-72 w-full object-contain" />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="primary" onClick={capturePhoto}>
                    <Camera size={14} className="mr-1" /> Capture photo
                  </Button>
                  <Button size="sm" variant="outline" onClick={stopCamera}>
                    Close camera
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  onClick={openCamera}
                  className="inline-flex items-center gap-2 rounded-full border border-sky-400/40 bg-sky-500/10 px-3 py-2 text-xs text-sky-200 transition hover:bg-sky-500/20"
                >
                  <Camera size={12} /> Open camera
                </button>
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-white/15 px-3 py-2 text-xs text-muted-foreground transition hover:bg-white/10">
                  <FileUp size={12} /> Choose from device
                  <input
                    type="file"
                    multiple
                    accept="image/*,.pdf"
                    capture="environment"
                    onChange={(e) => setFiles(e.target.files)}
                    className="hidden"
                  />
                </label>
              </div>
            )}

            {cameraError && <p className="mt-2 text-xs text-rose-300">{cameraError}</p>}

            {(photos.length > 0 || (files && files.length > 0)) && (
              <div className="mt-3 flex flex-wrap gap-2">
                {photos.map((p, i) => (
                  <div key={i} className="relative">
                    <img
                      src={URL.createObjectURL(p)}
                      alt=""
                      className="h-16 w-16 rounded-lg border border-white/10 object-cover"
                    />
                    <button
                      onClick={() => setPhotos((prev) => prev.filter((_, j) => j !== i))}
                      className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-rose-600 text-white"
                      aria-label="Remove photo"
                    >
                      <X size={11} />
                    </button>
                  </div>
                ))}
                {files &&
                  Array.from(files).map((f, i) => (
                    <span
                      key={`f${i}`}
                      className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-muted-foreground"
                    >
                      <FileUp size={11} /> {f.name}
                    </span>
                  ))}
              </div>
            )}

            <Button
              size="sm"
              variant="outline"
              className="mt-3"
              disabled={uploading || (photos.length === 0 && !files)}
              onClick={uploadDocs}
            >
              {uploading ? <Loader2 size={14} className="animate-spin" /> : "Upload photos"}
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
