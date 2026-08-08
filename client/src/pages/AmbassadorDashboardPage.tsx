import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { Card, Badge } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/store/authStore";
import { CpKycOnboarding } from "@/components/CpKycOnboarding";
import { AmbassadorQRCode } from "@/components/AmbassadorQRCode";
import {
  MapPin, Clock, QrCode, CheckCircle2, Loader2, Wifi, Navigation,
  FileUp, IndianRupee, ExternalLink, ClipboardCheck, Camera, X,
  Network, Users, Share2, Copy, TrendingUp, Wallet, Landmark, Save, Building2, Handshake,
} from "lucide-react";
import { formatINR, formatDate } from "@/lib/utils";
import { toast } from "sonner";
import type { AmbassadorTask } from "@/types";
import UserMenu from "@/components/UserMenu";
import DeveloperReferralPanel from "@/components/DeveloperReferralPanel";

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

  // Identity gate — same full KYC (Aadhaar + PAN + live selfie → admin review)
  // as Channel Partners. Ambassadors can't access tasks until verified.
  if (!user.onboardingVerified) return <CpKycOnboarding />;

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

      <DeveloperReferralPanel className="mt-8" />

      <Level2ReferralSection />

      <AmbassadorCommissionSection />

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

/* ------------------------------------------------------------------ */
/* Ambassador → Ambassador Referral (Level 2) — an ambassador earns an */
/* extra 0.5% on the referral earnings of every ambassador they refer. */
/* ------------------------------------------------------------------ */
interface Level2Ambassador {
  _id: string;
  name: string;
  email: string | null;
  createdAt: string;
  theirReferrals: number;
  theirTransactions: number;
  earnedByThem: number;
  level2Commission: number;
}
interface Level2Data {
  level2Percent: number;
  referralCode: string | null;
  referredAmbassadors: Level2Ambassador[];
  summary: { referredAmbassadors: number; totalDownlineEarnings: number; totalLevel2Commission: number };
}

function Level2ReferralSection() {
  const [data, setData] = useState<Level2Data | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/onboarding/level2")
      .then((r) => setData(r.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  const inviteLink = data?.referralCode ? `${window.location.origin}/ambassador/signup?ref=${data.referralCode}` : "";

  async function copyLink() {
    if (!inviteLink) return;
    try { await navigator.clipboard.writeText(inviteLink); toast.success("Level 2 invite link copied"); } catch { /* ignore */ }
  }
  async function shareLink() {
    if (!inviteLink || !data?.referralCode) return;
    const text = `Join Truvi as an Ambassador with my code ${data.referralCode}.\n${inviteLink}`;
    if (typeof navigator !== "undefined" && navigator.share) {
      try { await navigator.share({ title: "Join Truvi as an Ambassador", text, url: inviteLink }); return; }
      catch (err) { if ((err as Error)?.name === "AbortError") return; }
    }
    try { await navigator.clipboard.writeText(text); toast.success("Invite copied — share it anywhere"); } catch { /* ignore */ }
  }

  const s = data?.summary ?? { referredAmbassadors: 0, totalDownlineEarnings: 0, totalLevel2Commission: 0 };
  const pct = data?.level2Percent ?? 0.5;

  return (
    <Card className="mt-8 border-violet-500/25 bg-violet-950/10 text-white">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
            <Network size={18} className="text-violet-300" /> Level 2 Referral Commission ({pct}%)
            <Badge variant="info">Ambassador → Ambassador</Badge>
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Refer another ambassador and earn an extra <b className="text-violet-300">{pct}%</b> on everything they earn from their own referrals — for life.
          </p>
        </div>
      </div>

      {/* Referral code + invite link */}
      <div className="mt-4 flex flex-col gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-violet-300/80">Your ambassador referral code</p>
          <div className="mt-1 flex items-center gap-3">
            <span className="font-display text-2xl font-bold tracking-wider">{data?.referralCode ?? "…"}</span>
            <button onClick={copyLink} title="Copy invite link" className="rounded-lg border border-white/15 bg-white/5 p-2 text-white/70 hover:bg-white/10"><Copy size={15} /></button>
          </div>
          {inviteLink && <p className="mt-2 break-all text-[11px] text-muted-foreground">{inviteLink}</p>}
        </div>
        <Button onClick={shareLink} className="shrink-0 gap-2"><Share2 size={15} /> Invite an ambassador</Button>
      </div>

      {/* Summary */}
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <L2Stat icon={<Users size={16} />} tone="text-sky-300" label="Referred Ambassadors" value={String(s.referredAmbassadors)} />
        <L2Stat icon={<TrendingUp size={16} />} tone="text-emerald-300" label="Their Total Earnings" value={formatINR(s.totalDownlineEarnings)} />
        <L2Stat icon={<IndianRupee size={16} />} tone="text-violet-300" label={`Your Level 2 (${pct}%)`} value={formatINR(s.totalLevel2Commission)} />
      </div>

      {/* Referral history */}
      <div className="mt-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-foreground/80">Level 2 Referral History</h3>
        {loading ? (
          <p className="mt-2 text-sm text-muted-foreground">Loading…</p>
        ) : (data?.referredAmbassadors.length ?? 0) === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">You haven't referred any ambassadors yet. Share your invite link above to start earning {pct}% Level 2 commission.</p>
        ) : (
          <div className="mt-2 overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-white/[0.03] text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Ambassador</th>
                  <th className="px-4 py-3 text-right">Their referrals</th>
                  <th className="px-4 py-3 text-right">Their transactions</th>
                  <th className="px-4 py-3 text-right">They earned</th>
                  <th className="px-4 py-3 text-right">Your {pct}%</th>
                  <th className="px-4 py-3 text-right">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {data!.referredAmbassadors.map((a) => (
                  <tr key={a._id}>
                    <td className="px-4 py-3">
                      <p className="font-medium">{a.name}</p>
                      <p className="text-[11px] text-muted-foreground">{a.email ?? ""}</p>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{a.theirReferrals}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{a.theirTransactions}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatINR(a.earnedByThem)}</td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-violet-300">{formatINR(a.level2Commission)}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{formatDate(a.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Card>
  );
}

function L2Stat({ icon, tone, label, value }: { icon: React.ReactNode; tone: string; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className={tone}>{icon}</span>
      </div>
      <p className="mt-1 font-display text-xl font-semibold">{value}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Ambassador commission wallet + payout (bank/UPI) details — the same */
/* system as Channel Partners, so admin/founder can pay ambassadors    */
/* the same way (Add → Approve → Mark Paid → UPI).                     */
/* ------------------------------------------------------------------ */
interface AmbWallet {
  developerCommission: number;
  saleCommission: number;
  totalEarnings: number;
  paid: number;
  pending: number;
  nextPayable: number;
  payments: { _id: string; amount: number; mode: string; transactionId: string | null; paymentDate: string; notes: string | null }[];
}
interface AmbPayoutDetails {
  accountHolderName?: string; accountNumber?: string; ifsc?: string; bankName?: string; upiId?: string; method?: "BANK_TRANSFER" | "UPI"; updatedAt?: string;
}

function AmbassadorCommissionSection() {
  const [w, setW] = useState<AmbWallet | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/commissions/wallet").then((r) => setW(r.data)).catch(() => setW(null)).finally(() => setLoading(false));
  }, []);

  return (
    <Card className="mt-8 border-emerald-500/25 bg-emerald-950/10 text-white">
      <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
        <Wallet size={18} className="text-emerald-300" /> Commission & Payout
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Your commission earnings and payout details. Add your bank / UPI so the Truvi team can pay you directly.
      </p>

      {/* Wallet tiles */}
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <AmbTile icon={<Wallet size={15} />} label="Total Earnings" value={loading ? "…" : formatINR(w?.totalEarnings ?? 0)} />
        <AmbTile icon={<Building2 size={15} />} label="Developer 2%" value={loading ? "…" : formatINR(w?.developerCommission ?? 0)} />
        <AmbTile icon={<Handshake size={15} />} label="Sale / Bonus" value={loading ? "…" : formatINR(w?.saleCommission ?? 0)} />
        <AmbTile icon={<Clock size={15} />} label="Pending" value={loading ? "…" : formatINR(w?.pending ?? 0)} tone="text-amber-300" />
        <AmbTile icon={<CheckCircle2 size={15} />} label="Paid" value={loading ? "…" : formatINR(w?.paid ?? 0)} tone="text-emerald-300" />
      </div>

      <AmbassadorPayoutForm />

      {/* Payments received */}
      {w && w.payments.length > 0 && (
        <div className="mt-5">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-foreground/80">Payments Received</h3>
          <div className="mt-2 overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="bg-white/[0.03] text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3">Mode</th>
                  <th className="px-4 py-3">Transaction ID</th>
                  <th className="px-4 py-3">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {w.payments.map((p) => (
                  <tr key={p._id}>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(p.paymentDate)}</td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatINR(p.amount)}</td>
                    <td className="px-4 py-3">{p.mode.replace(/_/g, " ")}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{p.transactionId || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{p.notes || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Card>
  );
}

function AmbassadorPayoutForm() {
  const [d, setD] = useState<AmbPayoutDetails>({ method: "BANK_TRANSFER" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | undefined>();

  useEffect(() => {
    api.get("/commissions/payout-details").then((r) => {
      if (r.data.payoutDetails) { setD({ method: "BANK_TRANSFER", ...r.data.payoutDetails }); setSavedAt(r.data.payoutDetails.updatedAt); }
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const set = (k: keyof AmbPayoutDetails) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setD((p) => ({ ...p, [k]: e.target.value }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const r = await api.put("/commissions/payout-details", {
        accountHolderName: d.accountHolderName || undefined,
        accountNumber: d.accountNumber || undefined,
        ifsc: d.ifsc || undefined,
        bankName: d.bankName || undefined,
        upiId: d.upiId || undefined,
        method: d.method || "BANK_TRANSFER",
      });
      setSavedAt(r.data.payoutDetails?.updatedAt);
      toast.success("Payout details saved");
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to save payout details");
    } finally { setSaving(false); }
  }

  const input = "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400/50";

  return (
    <div className="mt-5">
      <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-foreground/80"><Landmark size={14} /> Payout Details</h3>
      {loading ? (
        <p className="mt-2 text-sm text-muted-foreground">Loading…</p>
      ) : (
        <form onSubmit={save} className="mt-2 grid grid-cols-1 gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4 sm:grid-cols-2">
          <label className="block"><span className="mb-1 block text-xs text-muted-foreground">Account Holder Name</span><input className={input} value={d.accountHolderName ?? ""} onChange={set("accountHolderName")} placeholder="As per bank records" /></label>
          <label className="block"><span className="mb-1 block text-xs text-muted-foreground">Bank Name</span><input className={input} value={d.bankName ?? ""} onChange={set("bankName")} placeholder="e.g. HDFC Bank" /></label>
          <label className="block"><span className="mb-1 block text-xs text-muted-foreground">Bank Account Number</span><input className={input} value={d.accountNumber ?? ""} onChange={set("accountNumber")} placeholder="Account number" /></label>
          <label className="block"><span className="mb-1 block text-xs text-muted-foreground">IFSC Code</span><input className={input} value={d.ifsc ?? ""} onChange={set("ifsc")} placeholder="e.g. HDFC0001234" /></label>
          <label className="block"><span className="mb-1 block text-xs text-muted-foreground">UPI ID</span><input className={input} value={d.upiId ?? ""} onChange={set("upiId")} placeholder="name@upi" /></label>
          <label className="block"><span className="mb-1 block text-xs text-muted-foreground">Preferred Payment Method</span>
            <select className={input} value={d.method ?? "BANK_TRANSFER"} onChange={set("method")}>
              <option value="BANK_TRANSFER" className="bg-[#0a0d14]">Bank Transfer</option>
              <option value="UPI" className="bg-[#0a0d14]">UPI</option>
            </select>
          </label>
          <div className="flex items-center gap-3 sm:col-span-2">
            <Button type="submit" disabled={saving} className="gap-2">{saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save Payout Details</Button>
            {savedAt && <span className="text-xs text-muted-foreground">Last updated {formatDate(savedAt)}</span>}
          </div>
        </form>
      )}
    </div>
  );
}

function AmbTile({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">{icon} {label}</p>
      <p className={`mt-1 font-display text-lg font-semibold ${tone ?? "text-white"}`}>{value}</p>
    </div>
  );
}
