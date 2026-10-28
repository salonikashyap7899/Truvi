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
  // PAN is NOT required for Ambassadors (many are students without one) — they
  // verify with Aadhaar + a live selfie only. Channel Partners still need PAN.
  const isAmbassador = user?.role === "AMBASSADOR";
  const intro = isAmbassador
    ? "Ambassadors must verify their identity before accessing tasks and earnings. Upload your Aadhaar and take a live selfie. Your documents are stored securely for verification."
    : "Channel Partners must verify their identity before accessing projects, leads and inventory. Upload your Aadhaar and PAN, and take a live selfie. Your documents are stored securely for verification.";

  const [aadhaarNumber, setAadhaarNumber] = useState("");
  const [panNumber, setPanNumber] = useState("");
  const [aadhaarFile, setAadhaarFile] = useState<File | null>(null);
  const [panFile, setPanFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Brief "verifying…" state shown for ~2s after submit before access unlocks.
  const [verifying, setVerifying] = useState(false);
  const [providerKycEnabled, setProviderKycEnabled] = useState<boolean | null>(null);
  const [startingProvider, setStartingProvider] = useState(false);
  const [providerCaptureLink, setProviderCaptureLink] = useState<string | null>(null);

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

  // Discover whether a hosted automatic verification workflow is configured.
  // The backend only reports configuration status; all provider credentials stay server-side.
  useEffect(() => {
    let cancelled = false;
    api.get("/auth/kyc/provider-status")
      .then((res) => {
        if (!cancelled) setProviderKycEnabled(res.data?.configured === true);
      })
      .catch(() => {
        if (!cancelled) setProviderKycEnabled(false);
      });
    return () => { cancelled = true; };
  }, []);

  // Check the provider while KYC is in progress. The server records an approval
  // only after IDfy returns an explicit approved decision; once it does, the
  // refreshed access token immediately unlocks protected API calls in this tab.
  useEffect(() => {
    if (
      user?.onboardingVerified ||
      providerKycEnabled !== true ||
      user?.onboardingChecks?.kycStatus !== "PENDING"
    ) return;
    let cancelled = false;
    const refresh = async () => {
      try {
        const res = await api.get("/auth/kyc/status", { timeout: 15_000 });
        const cur = useAuthStore.getState().user;
        if (cancelled || !cur) return;
        if (res.data?.accessToken && res.data?.user) {
          useAuthStore.getState().setAuth(
            { ...cur, ...res.data.user, onboardingVerified: res.data.onboardingVerified, onboardingChecks: res.data.onboardingChecks },
            res.data.accessToken,
          );
        } else {
          useAuthStore.getState().setUser({
            ...cur,
            onboardingVerified: res.data?.onboardingVerified ?? cur.onboardingVerified,
            onboardingChecks: res.data?.onboardingChecks ?? cur.onboardingChecks,
          });
        }
      } catch {
        /* temporary network/provider issue — keep access locked and retry */
      }
    };
    void refresh();
    const id = setInterval(refresh, 6000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [user?.onboardingVerified, user?.onboardingChecks?.kycStatus, providerKycEnabled]);

  // Legacy/manual-review fallback keeps its existing account-status refresh.
  useEffect(() => {
    if (user?.onboardingVerified || providerKycEnabled !== false) return;
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
  }, [user?.onboardingVerified, providerKycEnabled]);

  async function startAutomaticVerification() {
    if (startingProvider) return;
    // Open a tab during the click gesture so mobile browsers do not block the
    // secure provider journey after the API request completes.
    let popup: Window | null = null;
    try {
      popup = window.open("about:blank", "_blank");
      if (popup) popup.opener = null;
    } catch {
      popup = null;
    }
    setStartingProvider(true);
    try {
      const res = await api.post("/auth/kyc/start");
      if (res.data?.alreadyVerified && res.data?.accessToken && res.data?.user) {
        popup?.close();
        const cur = useAuthStore.getState().user ?? user;
        if (cur) {
          useAuthStore.getState().setAuth(
            { ...cur, ...res.data.user, onboardingVerified: true },
            res.data.accessToken,
          );
        }
        toast.success("Your identity is already verified. Your dashboard is unlocking.");
        return;
      }
      const link = res.data?.captureLink;
      if (typeof link !== "string" || !link.startsWith("https://capture.")) {
        popup?.close();
        throw new Error("The verification provider did not return a secure link.");
      }
      setProviderCaptureLink(link);
      const currentUser = useAuthStore.getState().user ?? user;
      if (currentUser) {
        useAuthStore.getState().setUser({
          ...currentUser,
          onboardingVerified: res.data?.onboardingVerified ?? currentUser.onboardingVerified,
          onboardingChecks: res.data?.onboardingChecks ?? currentUser.onboardingChecks,
        });
      }
      if (popup) {
        popup.location.href = link;
      } else {
        toast.message("Your secure verification journey is ready. Use the button below to open it.");
      }
      toast.success("Complete the secure identity check. Keep this Truvi tab open; access unlocks after verification passes.");
    } catch (err: any) {
      popup?.close();
      toast.error(err?.response?.data?.error || err?.message || "Automatic verification could not start. Please try again.");
    } finally {
      setStartingProvider(false);
    }
  }

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
  const aadhaarValid = /^\d{12}$/.test(aadhaarNumber.replace(/\s/g, ""));
  // Ambassadors: Aadhaar + selfie only. Channel Partners: also PAN.
  const panReady = isAmbassador ? true : panValid && !!panFile;
  const ready = useMemo(
    () => aadhaarValid && panReady && !!aadhaarFile && !!selfie,
    [aadhaarValid, panReady, aadhaarFile, selfie],
  );

  async function submit() {
    if (!ready || !aadhaarFile || !selfie || !user) return;
    setSubmitting(true);
    const requestId =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `kyc-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    try {
      const form = new FormData();
      form.append("aadhaar", aadhaarFile);
      if (panFile) form.append("pan", panFile);
      form.append("selfie", new File([selfie], "selfie.jpg", { type: "image/jpeg" }));
      form.append("aadhaarNumber", aadhaarNumber.replace(/\s/g, ""));
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
      // valid 12-digit Aadhaar number", "Enter a valid PAN…"), then any field
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

  // Wait for provider configuration before showing a KYC path. If configured,
  // use the provider's hosted capture and keep checking its decision in the background.
  if (providerKycEnabled === null) {
    return (
      <Shell>
        <div className="rounded-2xl border border-white/10 glass p-8 text-center">
          <Loader2 size={24} className="mx-auto animate-spin text-[var(--trust)]" />
          <p className="mt-3 text-sm text-muted-foreground">Preparing secure identity verification…</p>
        </div>
      </Shell>
    );
  }

  if (providerKycEnabled && !user?.onboardingVerified) {
    return (
      <Shell>
        <div className="rounded-2xl border border-white/10 glass p-6 sm:p-8">
          <div className="grid size-12 place-items-center rounded-2xl bg-[var(--trust)]/12 text-[var(--trust)] ring-1 ring-inset ring-[var(--trust)]/25">
            <ShieldCheck size={22} />
          </div>
          <h1 className="mt-4 text-xl font-semibold">Verify your identity securely</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Complete the secure identity check in the verification provider&apos;s page.
            Truvi keeps your dashboard locked until the provider returns a successful result.
          </p>
          {status === "PENDING" && (
            <p className="mt-4 rounded-xl border border-amber-400/20 bg-amber-500/10 p-3 text-sm text-amber-200">
              Verification is in progress. Continue the provider journey or leave this page open;
              Truvi checks the result automatically.
            </p>
          )}
          {status === "REJECTED" && (
            <p className="mt-4 rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-200">
              Previous verification was not successful{rejectionReason ? ": " + rejectionReason : "."}
              Start a new secure check after reviewing your details.
            </p>
          )}
          <button
            type="button"
            onClick={startAutomaticVerification}
            disabled={startingProvider}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[var(--trust)] to-[#2563eb] py-3 text-sm font-semibold text-white shadow-[0_10px_30px_-8px_rgba(59,130,246,0.7)] transition disabled:cursor-not-allowed disabled:opacity-50"
          >
            {startingProvider && <Loader2 size={15} className="animate-spin" />}
            {startingProvider ? "Preparing verification…" : status === "PENDING" ? "Continue automatic verification" : "Start automatic verification"}
          </button>
          {providerCaptureLink && (
            <a
              href={providerCaptureLink}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 flex w-full items-center justify-center rounded-full border border-white/15 bg-white/5 py-3 text-sm font-medium text-white hover:bg-white/10"
            >
              Open secure verification
            </a>
          )}
          <p className="mt-4 text-xs text-muted-foreground">
            Once the provider confirms your identity, Truvi updates your status automatically. An upload alone never counts as verification.
          </p>
        </div>
      </Shell>
    );
  }

  if (!providerKycEnabled && (user?.role === "BUYER" || user?.role === "DEVELOPER")) {
    return (
      <Shell>
        <div className="rounded-2xl border border-white/10 glass p-6 sm:p-8">
          <ShieldCheck size={24} className="text-[var(--trust)]" />
          <h1 className="mt-4 text-xl font-semibold">Identity verification setup required</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This account type requires identity verification before dashboard access. Automatic verification has not been configured for this account yet. Please contact Truvi support; access will remain protected until verification is available and completed.
          </p>
        </div>
      </Shell>
    );
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
            Your Aadhaar{isAmbassador ? "" : ", PAN"} and selfie are being submitted securely. This step does not guarantee
            instant approval: when manual review is needed, your status will show as pending until an authorized reviewer
            completes the check.
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
          if (f && f.size > 6 * 1024 * 1024) {
            toast.error("File too large — max 6 MB");
            onFile(null);
            e.currentTarget.value = "";
            return;
          }
          onFile(f || null);
        }}
      />
    </label>
  );
}
