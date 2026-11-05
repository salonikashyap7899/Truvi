import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { toast } from "sonner";
import { ShieldCheck, Upload, Camera, RefreshCw, Loader2, Clock, XCircle } from "lucide-react";
import UserMenu from "@/components/UserMenu";

const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const KYC_ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const KYC_ALLOWED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".pdf"]);

/**
 * CP identity gate. A channel partner cannot use the workspace until an
 * authorised reviewer approves the submitted identity documents.
 * Shown in place of the CP dashboard while `onboardingVerified` is false.
 */
export function CpKycOnboarding() {
  const user = useAuthStore((s) => s.user);
  const status = user?.onboardingChecks?.kycStatus;
  const rejectionReason = user?.onboardingChecks?.kycRejectionReason;
  // PAN is NOT required for Ambassadors (many are students without one) —
  // they submit an accepted masked identity document + a live selfie only.
  const isAmbassador = user?.role === "AMBASSADOR";
  const intro = isAmbassador
    ? "Ambassadors must complete an identity-document review before accessing tasks and earnings. Upload a properly masked identity document and take a selfie."
    : "Channel Partners must complete an identity-document review before accessing projects, leads and inventory. Upload a properly masked identity document, PAN and a selfie.";

  const [panNumber, setPanNumber] = useState("");
  const [aadhaarFile, setAadhaarFile] = useState<File | null>(null);
  const [panFile, setPanFile] = useState<File | null>(null);
  const [identityNoticeAccepted, setIdentityNoticeAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // Brief "verifying…" state shown for ~2s after submit before access unlocks.
  const [verifying, setVerifying] = useState(false);

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

  // While the account is still unverified (awaiting review or on this screen),
  // poll the server so the workspace unlocks automatically the moment an admin
  // approves — the client otherwise keeps a stale cached user until re-login.
  useEffect(() => {
    if (user?.onboardingVerified) return;
    let cancelled = false;
    const refresh = async () => {
      try {
        const res = await api.get("/auth/me");
        const fresh = res.data.user;
        const cur = useAuthStore.getState().user;
        if (cancelled || !cur) return;
        useAuthStore.getState().setUser({
          ...cur,
          emailVerified: fresh.emailVerified,
          phoneVerified: fresh.phoneVerified,
          onboardingVerified: fresh.onboardingVerified,
          onboardingChecks: fresh.onboardingChecks,
        });
      } catch {
        /* transient — try again on the next tick */
      }
    };
    const id = setInterval(refresh, 12000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [user?.onboardingVerified]);

  async function startCamera() {
    // In-app browsers (WhatsApp / Instagram / Facebook) and non-HTTPS contexts
    // often don't expose the camera API — guard it so we show a clear message
    // instead of throwing. On mobile, opening the site in Chrome / Safari fixes it.
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== "function") {
      toast.error("Camera isn't available in this browser. Please open truviventures.com in Chrome or Safari (not inside another app), then try again.");
      return;
    }
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
      setStream(s);
      setCameraOn(true);
    } catch (err: any) {
      const name = err?.name || "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        toast.error("Camera permission was blocked. Allow camera access for this site in your browser settings, then try again.");
      } else if (name === "NotFoundError" || name === "OverconstrainedError") {
        toast.error("No front camera found. Please use a device with a front-facing camera.");
      } else {
        toast.error("Couldn't access the camera. Allow camera permission and use Chrome or Safari on your phone.");
      }
    }
  }

  function stopCamera() {
    stream?.getTracks().forEach((t) => t.stop());
    setStream(null);
    setCameraOn(false);
  }

  function capture() {
    const video = videoRef.current;
    if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || video.videoWidth <= 0 || video.videoHeight <= 0) {
      toast.error("The camera is still starting. Please wait a moment and try capturing your selfie again.");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      toast.error("Couldn't capture the selfie. Please restart the camera and try again.");
      return;
    }
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob || blob.size === 0) {
          toast.error("The selfie image was empty. Please retake it.");
          return;
        }
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
  // Ambassadors: identity document + selfie only. Channel Partners: also PAN.
  const panReady = isAmbassador ? true : panValid && !!panFile;
  const ready = useMemo(
    () => panReady && !!aadhaarFile && !!selfie && identityNoticeAccepted,
    [panReady, aadhaarFile, selfie, identityNoticeAccepted],
  );

  async function submit() {
    if (!ready || !aadhaarFile || !selfie || !identityNoticeAccepted || !user) return;
    setSubmitting(true);
    const requestId =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `kyc-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    try {
      const form = new FormData();
      form.append("aadhaar", aadhaarFile);
      form.append("identityNoticeAccepted", "true");
      form.append("identityNoticeVersion", "identity-kyc-2026-11-05");
      if (panFile) form.append("pan", panFile);
      form.append("selfie", new File([selfie], "selfie.jpg", { type: "image/jpeg" }));
      if (panNumber.trim()) form.append("panNumber", panNumber.trim().toUpperCase());
      // Do not set Content-Type manually for FormData: the browser must add the
      // multipart boundary. Explicitly setting it can break uploads in browsers.
      const res = await api.post("/auth/submit-kyc", form, {
        headers: { "X-Request-ID": requestId },
        timeout: 90_000,
      });
      // Apply the server's actual outcome after a brief transition. A pending
      // manual review is not a verification failure and must not ask for resubmission.
      setVerifying(true);
      const token = useAuthStore.getState().accessToken!;
      setTimeout(() => {
        const cur = useAuthStore.getState().user ?? user;
        useAuthStore.getState().setAuth(
          { ...cur, onboardingChecks: res.data.onboardingChecks, onboardingVerified: res.data.onboardingVerified },
          token,
        );
        if (res.data.onboardingVerified) {
          toast.success(res.data.message || "Identity verified — access unlocked.");
        } else if (res.data.onboardingChecks?.kycStatus === "PENDING") {
          toast.success(res.data.message || "Documents submitted successfully and are awaiting review.");
        } else {
          toast.error(res.data.message || "Verification could not be completed. Please review the message and try again.");
        }
        setVerifying(false);
      }, 2000);
    } catch (err: any) {
      // Surface the *specific* reason: the server's own message (e.g. "Enter a
      // server-side field validation errors, then any field
      // validation issue, then a status-coded message, and only fall back to a
      // generic line when the request never reached the server at all.
      const resp = err?.response;
      const responseRequestId = resp?.headers?.["x-request-id"] as string | undefined;
      const fieldError =
        resp?.data?.issues?.fieldErrors &&
        (Object.values(resp.data.issues.fieldErrors as Record<string, string[]>).flat().find(Boolean) as string | undefined);
      if (!resp) {
        // A mobile connection may drop after the server has saved the documents
        // but before the response reaches Chrome. Check the server's current
        // state before asking the customer to submit sensitive documents again.
        try {
          const statusResponse = await api.get("/auth/me", { timeout: 15_000 });
          const fresh = statusResponse.data?.user;
          const current = useAuthStore.getState().user ?? user;
          const checks = fresh?.onboardingChecks;
          const savedStatus = checks?.kycStatus;
          if (fresh && ["PENDING", "APPROVED", "REJECTED"].includes(savedStatus)) {
            const token = useAuthStore.getState().accessToken;
            if (token) {
              useAuthStore.getState().setAuth(
                {
                  ...current,
                  emailVerified: fresh.emailVerified,
                  phoneVerified: fresh.phoneVerified,
                  onboardingVerified: fresh.onboardingVerified,
                  onboardingChecks: checks,
                },
                token,
              );
            }
            if (savedStatus === "APPROVED" || fresh.onboardingVerified) {
              toast.success("Your KYC submission was received and your verification status is up to date.");
            } else if (savedStatus === "PENDING") {
              toast.success("Your KYC documents were received and are awaiting review.");
            } else {
              toast.error(fresh.onboardingChecks?.kycRejectionReason || "Your last KYC status is rejected. Please review the reason before submitting again.");
            }
            return;
          }
        } catch {
          // The status check can fail on the same weak connection; keep the
          // reference ID so support can correlate server logs if it reached us.
        }
        const timedOut = err?.code === "ECONNABORTED" || err?.code === "ETIMEDOUT";
        // Best-effort only: when the KYC connection fails transiently, report
        // minimal diagnostics to the server. This never includes form data or
        // document contents and is safe to fail silently while offline.
        try {
          await api.post(
            "/telemetry/kyc-failure",
            {
              requestId,
              failureKind: timedOut ? "timeout" : "network",
              online: typeof navigator !== "undefined" ? navigator.onLine : null,
            },
            { timeout: 3_000, headers: { "X-Request-ID": requestId } },
          );
        } catch {
          // The device may still be offline; there is nothing more to send.
        }
        toast.error(
          timedOut
            ? `The KYC upload timed out. We couldn't confirm whether it was saved. Reopen KYC status before retrying. Reference: ${requestId}`
            : `Truvi couldn't confirm the submission response. Check your connection and KYC status before retrying. Reference: ${requestId}`,
        );
        return;
      }
      const message =
        resp?.data?.error ||
        fieldError ||
        `Submission failed (HTTP ${resp.status}). Please check your details and try again.`;
      toast.error(
        resp.status >= 500
          ? `${message} Reference: ${responseRequestId || requestId}`
          : message,
      );
    } finally {
      setSubmitting(false);
    }
  }

  // Just submitted — a short "verifying" beat before access unlocks.
  if (verifying) {
    return (
      <Shell>
        <div className="rounded-2xl border border-white/10 glass p-8 text-center">
          <div className="mx-auto grid size-14 place-items-center rounded-full bg-[var(--trust)]/15 text-[var(--trust)]">
            <Loader2 size={26} className="animate-spin" />
          </div>
          <h1 className="mt-4 text-xl font-semibold">Saving your KYC submission…</h1>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
            Your identity document{isAmbassador ? "" : ", PAN"} and selfie are being submitted for restricted manual review.
            This is not UIDAI authentication or an automated government identity check.
          </p>
        </div>
      </Shell>
    );
  }

  // Submitted documents stay pending until a provider or an authorized admin
  // completes the identity review. Keep the form locked while review is pending.
  if (status === "PENDING") {
    return (
      <Shell>
        <div className="rounded-2xl border border-white/10 glass p-8 text-center">
          <div className="mx-auto grid size-14 place-items-center rounded-full bg-amber-500/15 text-amber-300">
            <Clock size={26} />
          </div>
          <h1 className="mt-4 text-xl font-semibold">Verification in progress</h1>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
            We&apos;ve received your identity document{isAmbassador ? "" : ", PAN"} and selfie. An authorised Truvi reviewer will
            review the submission and notify you when a decision is recorded.
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
        <p className="mt-1.5 text-sm text-muted-foreground">{intro}</p>

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
          {/* Masked identity document */}
          <div>
            <label className="text-sm font-medium">Identity document</label>
            <p className="mt-1 text-xs leading-relaxed text-amber-200/80">
              Upload a masked Aadhaar (first eight digits hidden) or another government photo ID accepted by Truvi.
              Never upload an unmasked Aadhaar, Aadhaar OTP, biometric data or a document showing more information
              than needed. Contact support before uploading another document type if unsure.
            </p>
            <FileField label="Masked identity document" file={aadhaarFile} onFile={setAadhaarFile} />
            <label className="mt-3 flex items-start gap-2.5 text-xs leading-relaxed text-white/75">
              <input
                type="checkbox"
                checked={identityNoticeAccepted}
                onChange={(event) => setIdentityNoticeAccepted(event.target.checked)}
                className="mt-0.5 size-4 shrink-0 accent-sky-400"
              />
              <span>
                I voluntarily consent to Truvi collecting and processing this masked identity document,
                PAN document/details where required, and selfie solely for manual onboarding and identity
                review, with access limited to authorised reviewers as described in the{" "}
                <a href="/privacy-policy" target="_blank" rel="noreferrer" className="text-sky-300 underline underline-offset-2">Privacy Policy</a>.
                I confirm that the Aadhaar image is masked (first eight digits hidden), or this is another
                identity document accepted by Truvi. I understand that Truvi does not perform UIDAI
                authentication or an automated government identity check, and that I can contact Truvi
                to ask about retention or an alternative document route.
              </span>
            </label>
          </div>

          {/* PAN — Channel Partners only (not required for Ambassadors) */}
          {!isAmbassador && (
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
          )}

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

/**
 * Page chrome for the identity flow. Defined at module scope (NOT inside
 * CpKycOnboarding) so its component identity is stable across renders —
 * otherwise every keystroke would remount the whole form and the focused input
 * (e.g. the Aadhaar field) would lose the cursor after each character.
 */
function Shell({ children }: { children: React.ReactNode }) {
  return (
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
}

function FileField({ label, file, onFile }: { label: string; file: File | null; onFile: (f: File | null) => void }) {
  return (
    <label className="mt-2 flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-white/20 px-4 py-3 text-sm text-muted-foreground transition-colors hover:border-[var(--trust)]/50 hover:text-[var(--trust)]">
      <Upload size={15} />
      {file ? <span className="truncate text-white">{file.name}</span> : <span>{label} — upload JPG, PNG, WEBP or PDF</span>}
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf,.pdf,.jpg,.jpeg,.png,.webp"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          const extension = `.${f.name.split(".").pop()?.toLowerCase() ?? ""}`;
          if (!KYC_ALLOWED_MIME_TYPES.has(f.type) && !KYC_ALLOWED_EXTENSIONS.has(extension)) {
            toast.error("Unsupported file type — upload a JPG, PNG, WEBP image, or PDF.");
            e.currentTarget.value = "";
            onFile(null);
            return;
          }
          if (f.size === 0) {
            toast.error("This file is empty. Please choose a different document.");
            e.currentTarget.value = "";
            onFile(null);
            return;
          }
          if (f.size > 6 * 1024 * 1024) {
            toast.error("File too large — max 6 MB");
            onFile(null);
            e.currentTarget.value = "";
            return;
          }
          onFile(f);
        }}
      />
    </label>
  );
}
