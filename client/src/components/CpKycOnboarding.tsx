import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { toast } from "sonner";
import { ShieldCheck, Upload, Camera, RefreshCw, Loader2, Clock, XCircle } from "lucide-react";
import UserMenu from "@/components/UserMenu";

const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

/**
 * CP identity gate. A channel partner cannot use the workspace until they
 * submit Aadhaar + PAN + a live selfie and an admin (or KYC provider) approves.
 * Shown in place of the CP dashboard while `onboardingVerified` is false.
 */
export function CpKycOnboarding() {
  const user = useAuthStore((s) => s.user);
  const status = user?.onboardingChecks?.kycStatus;
  const rejectionReason = user?.onboardingChecks?.kycRejectionReason;

  const [aadhaarNumber, setAadhaarNumber] = useState("");
  const [panNumber, setPanNumber] = useState("");
  const [aadhaarFile, setAadhaarFile] = useState<File | null>(null);
  const [panFile, setPanFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Live selfie capture
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [selfie, setSelfie] = useState<Blob | null>(null);
  const [selfieUrl, setSelfieUrl] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      stream?.getTracks().forEach((t) => t.stop());
      if (selfieUrl) URL.revokeObjectURL(selfieUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stream]);

  useEffect(() => {
    if (cameraOn && stream && videoRef.current) videoRef.current.srcObject = stream;
  }, [cameraOn, stream]);

  async function startCamera() {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
      setStream(s);
      setCameraOn(true);
    } catch {
      toast.error("Couldn't access the camera. Allow camera permission and use a device with a front camera.");
    }
  }

  function stopCamera() {
    stream?.getTracks().forEach((t) => t.stop());
    setStream(null);
    setCameraOn(false);
  }

  function capture() {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        setSelfie(blob);
        if (selfieUrl) URL.revokeObjectURL(selfieUrl);
        setSelfieUrl(URL.createObjectURL(blob));
        stopCamera();
      },
      "image/jpeg",
      0.9,
    );
  }

  const panValid = PAN_RE.test(panNumber.trim().toUpperCase());
  const aadhaarValid = /^\d{12}$/.test(aadhaarNumber.replace(/\s/g, ""));
  const ready = useMemo(
    () => aadhaarValid && panValid && !!aadhaarFile && !!panFile && !!selfie,
    [aadhaarValid, panValid, aadhaarFile, panFile, selfie],
  );

  async function submit() {
    if (!ready || !aadhaarFile || !panFile || !selfie || !user) return;
    setSubmitting(true);
    try {
      const form = new FormData();
      form.append("aadhaar", aadhaarFile);
      form.append("pan", panFile);
      form.append("selfie", new File([selfie], "selfie.jpg", { type: "image/jpeg" }));
      form.append("aadhaarNumber", aadhaarNumber.replace(/\s/g, ""));
      form.append("panNumber", panNumber.trim().toUpperCase());
      const res = await api.post("/auth/submit-kyc", form, { headers: { "Content-Type": "multipart/form-data" } });
      useAuthStore.getState().setAuth(
        { ...user, onboardingChecks: res.data.onboardingChecks, onboardingVerified: res.data.onboardingVerified },
        useAuthStore.getState().accessToken!,
      );
      toast.success(res.data.message || "Documents submitted for verification.");
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Could not submit your documents. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <main className="min-h-screen p-6 text-white md:p-10">
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-2 font-display font-semibold tracking-wide">
          <ShieldCheck size={18} className="text-[var(--trust)]" /> Identity verification
        </div>
        <UserMenu />
      </div>
      <div className="mx-auto max-w-xl">{children}</div>
    </main>
  );

  // Submitted and awaiting review — no form, just a status card.
  if (status === "PENDING") {
    return (
      <Shell>
        <div className="rounded-2xl border border-white/10 glass p-8 text-center">
          <div className="mx-auto grid size-14 place-items-center rounded-full bg-amber-500/15 text-amber-300">
            <Clock size={26} />
          </div>
          <h1 className="mt-4 text-xl font-semibold">Verification in progress</h1>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
            We&apos;ve received your Aadhaar, PAN and selfie. Our team is verifying your identity — you&apos;ll get a
            notification the moment it&apos;s approved and your workspace unlocks.
          </p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="rounded-2xl border border-white/10 glass p-6 sm:p-8">
        <div className="grid size-12 place-items-center rounded-2xl bg-[var(--trust)]/12 text-[var(--trust)] ring-1 ring-inset ring-[var(--trust)]/25">
          <ShieldCheck size={22} />
        </div>
        <h1 className="mt-4 text-xl font-semibold">Verify your identity to start</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Channel Partners must verify their identity before accessing projects, leads and inventory. Upload your Aadhaar
          and PAN, and take a live selfie. Your documents are stored securely for verification.
        </p>

        {status === "REJECTED" && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-500/25 bg-red-950/40 px-3 py-2.5 text-sm text-red-300">
            <XCircle size={16} className="mt-0.5 shrink-0" />
            <span>
              Your previous submission was rejected{rejectionReason ? `: ${rejectionReason}` : "."} Please re-submit with
              clear, valid documents.
            </span>
          </div>
        )}

        <div className="mt-6 space-y-5">
          {/* Aadhaar */}
          <div>
            <label className="text-sm font-medium">Aadhaar number</label>
            <input
              inputMode="numeric"
              maxLength={12}
              value={aadhaarNumber}
              onChange={(e) => setAadhaarNumber(e.target.value.replace(/\D/g, ""))}
              placeholder="12-digit Aadhaar number"
              className="mt-1 h-11 w-full rounded-lg border border-white/15 bg-white/5 px-3 text-sm text-white placeholder:text-white/30 outline-none focus:border-[var(--trust)]/50 focus:ring-2 focus:ring-[var(--trust)]/20"
            />
            {aadhaarNumber && !aadhaarValid && <p className="mt-1 text-xs text-red-400">Enter all 12 digits.</p>}
            <FileField label="Aadhaar card (front)" file={aadhaarFile} onFile={setAadhaarFile} />
          </div>

          {/* PAN */}
          <div>
            <label className="text-sm font-medium">PAN number</label>
            <input
              maxLength={10}
              value={panNumber}
              onChange={(e) => setPanNumber(e.target.value.toUpperCase())}
              placeholder="ABCDE1234F"
              className="mt-1 h-11 w-full rounded-lg border border-white/15 bg-white/5 px-3 text-sm uppercase tracking-wider text-white placeholder:text-white/30 outline-none focus:border-[var(--trust)]/50 focus:ring-2 focus:ring-[var(--trust)]/20"
            />
            {panNumber && !panValid && <p className="mt-1 text-xs text-red-400">Format: 5 letters, 4 digits, 1 letter.</p>}
            <FileField label="PAN card" file={panFile} onFile={setPanFile} />
          </div>

          {/* Live selfie */}
          <div>
            <label className="text-sm font-medium">Live selfie</label>
            <p className="text-xs text-muted-foreground">Take a real-time selfie — this must match your ID.</p>
            <div className="mt-2 overflow-hidden rounded-xl border border-white/15 bg-black/40">
              {selfieUrl ? (
                <img src={selfieUrl} alt="Your selfie" className="mx-auto max-h-64 w-auto" />
              ) : cameraOn ? (
                <video ref={videoRef} autoPlay playsInline muted className="mx-auto max-h-64 w-auto -scale-x-100" />
              ) : (
                <div className="flex h-40 flex-col items-center justify-center gap-2 text-muted-foreground">
                  <Camera size={26} />
                  <span className="text-xs">Camera is off</span>
                </div>
              )}
            </div>
            <div className="mt-2 flex gap-2">
              {!cameraOn && !selfieUrl && (
                <button type="button" onClick={startCamera} className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-2 text-sm font-medium hover:bg-white/15">
                  <Camera size={15} /> Start camera
                </button>
              )}
              {cameraOn && (
                <button type="button" onClick={capture} className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--trust)] px-3 py-2 text-sm font-semibold hover:bg-[var(--trust)]/85">
                  <Camera size={15} /> Capture selfie
                </button>
              )}
              {selfieUrl && (
                <button type="button" onClick={() => { setSelfie(null); if (selfieUrl) URL.revokeObjectURL(selfieUrl); setSelfieUrl(null); startCamera(); }} className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-2 text-sm font-medium hover:bg-white/15">
                  <RefreshCw size={15} /> Retake
                </button>
              )}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={submit}
          disabled={!ready || submitting}
          className="mt-7 flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[var(--trust)] to-[#2563eb] py-3 text-sm font-semibold text-white shadow-[0_10px_30px_-8px_rgba(59,130,246,0.7)] transition-all hover:shadow-[0_14px_36px_-6px_rgba(59,130,246,0.9)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting && <Loader2 size={15} className="animate-spin" />}
          {submitting ? "Submitting…" : "Submit for verification"}
        </button>
      </div>
    </Shell>
  );
}

function FileField({ label, file, onFile }: { label: string; file: File | null; onFile: (f: File | null) => void }) {
  return (
    <label className="mt-2 flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-white/20 px-4 py-3 text-sm text-muted-foreground transition-colors hover:border-[var(--trust)]/50 hover:text-[var(--trust)]">
      <Upload size={15} />
      {file ? <span className="truncate text-white">{file.name}</span> : <span>{label} — click to upload (PDF or image)</span>}
      <input
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,.webp"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f && f.size > 6 * 1024 * 1024) {
            toast.error("File too large — max 6 MB");
            return;
          }
          onFile(f || null);
        }}
      />
    </label>
  );
}
