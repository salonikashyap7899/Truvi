import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { Button } from "@/components/ui/button";
import { CircleCheckBig, Mail, Phone, FileText, Loader2, ChevronRight } from "lucide-react";
import { toast } from "sonner";

/**
 * The access token bakes in `onboardingVerified` at issue time, so after a
 * verification step succeeds we refresh the token — otherwise gated routes
 * keep seeing the stale "not verified" claim until the 15-min expiry.
 */
async function refreshSessionToken(updatedUser: any) {
  try {
    const res = await api.post("/auth/refresh");
    if (res.data?.accessToken) {
      useAuthStore.getState().setAuth(updatedUser, res.data.accessToken);
      return;
    }
  } catch {
    /* fall through — keep the old token; it renews on next 401 */
  }
  useAuthStore.getState().setAuth(updatedUser, useAuthStore.getState().accessToken!);
}

export function AmbassadorOnboarding() {
  const user = useAuthStore((s) => s.user);
  const [currentStep, setCurrentStep] = useState<"phone" | "email" | "aadhaar" | "complete">("phone");
  const [loading, setLoading] = useState(false);

  // Phone step state
  const [phoneOtpRequested, setPhoneOtpRequested] = useState(false);
  const [phoneOtp, setPhoneOtp] = useState("");
  const [phoneVerifying, setPhoneVerifying] = useState(false);

  // Email step state
  const [emailOtpRequested, setEmailOtpRequested] = useState(false);
  const [emailOtp, setEmailOtp] = useState("");
  const [emailVerifying, setEmailVerifying] = useState(false);

  // Aadhaar step state
  const [aadhaarFile, setAadhaarFile] = useState<File | null>(null);
  const [aadhaarUploading, setAadhaarUploading] = useState(false);

  useEffect(() => {
    if (!user) return;
    if (user.onboardingVerified) {
      setCurrentStep("complete");
    } else if (user.onboardingChecks?.phoneVerified && user.onboardingChecks?.emailVerified) {
      setCurrentStep("aadhaar");
    } else if (user.onboardingChecks?.phoneVerified) {
      setCurrentStep("email");
    } else {
      setCurrentStep("phone");
    }
  }, [user]);

  // Phone OTP
  async function requestPhoneOtp() {
    setLoading(true);
    try {
      const res = await api.post("/auth/request-phone-otp");
      setPhoneOtpRequested(true);
      toast.success(`OTP sent to ${res.data.phone}`);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to send OTP");
    } finally {
      setLoading(false);
    }
  }

  async function verifyPhoneOtp() {
    if (!phoneOtp) {
      toast.error("Enter OTP");
      return;
    }
    setPhoneVerifying(true);
    try {
      const res = await api.post("/auth/verify-phone-otp", { otp: phoneOtp });
      await refreshSessionToken({ ...user, onboardingChecks: res.data.onboardingChecks, onboardingVerified: res.data.onboardingVerified });
      toast.success("Phone verified!");
      setPhoneOtp("");
      setPhoneOtpRequested(false);
      setCurrentStep("email");
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Invalid OTP");
    } finally {
      setPhoneVerifying(false);
    }
  }

  // Email OTP
  async function requestEmailOtp() {
    setLoading(true);
    try {
      const res = await api.post("/auth/request-email-otp");
      setEmailOtpRequested(true);
      toast.success(`OTP sent to ${res.data.email}`);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to send OTP");
    } finally {
      setLoading(false);
    }
  }

  async function verifyEmailOtp() {
    if (!emailOtp) {
      toast.error("Enter OTP");
      return;
    }
    setEmailVerifying(true);
    try {
      const res = await api.post("/auth/verify-email-otp", { otp: emailOtp });
      await refreshSessionToken({ ...user, onboardingChecks: res.data.onboardingChecks, onboardingVerified: res.data.onboardingVerified });
      toast.success("Email verified!");
      setEmailOtp("");
      setEmailOtpRequested(false);
      setCurrentStep("aadhaar");
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Invalid OTP");
    } finally {
      setEmailVerifying(false);
    }
  }

  // Aadhaar upload
  async function uploadAadhaar() {
    if (!aadhaarFile) {
      toast.error("Select Aadhaar document");
      return;
    }

    setAadhaarUploading(true);
    try {
      const form = new FormData();
      form.append("aadhaar", aadhaarFile);
      const res = await api.post("/auth/upload-aadhaar", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      await refreshSessionToken({ ...user, onboardingChecks: res.data.onboardingChecks, onboardingVerified: res.data.onboardingVerified });
      toast.success("Aadhaar verified!");
      setAadhaarFile(null);
      setCurrentStep("complete");
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Upload failed");
    } finally {
      setAadhaarUploading(false);
    }
  }

  if (!user) return null;

  if (user.onboardingVerified) {
    return (
      <div className="mt-6 rounded-3xl border border-emerald-500/20 bg-emerald-950/20 p-5">
        <div className="flex items-center gap-3">
          <CircleCheckBig size={24} className="text-emerald-400" />
          <div>
            <p className="font-semibold text-emerald-200">Verification complete</p>
            <p className="text-sm text-emerald-100/70">All checks passed. Access to projects unlocked.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-4">
      <div className="rounded-3xl border border-sky-500/20 bg-sky-950/20 p-5">
        <p className="font-semibold text-sky-200">Ambassador verification</p>
        <p className="mt-1 text-sm text-muted-foreground">Complete each step to unlock project access</p>

        {/* Steps indicator */}
        <div className="mt-4 flex gap-2">
          {[
            { step: "phone", label: "Phone", icon: Phone },
            { step: "email", label: "Email", icon: Mail },
            { step: "aadhaar", label: "Aadhaar", icon: FileText },
          ].map((item, idx, arr) => {
            const isComplete = user.onboardingChecks?.[`${item.step}Verified` as keyof typeof user.onboardingChecks];
            const isCurrent = currentStep === item.step;
            return (
              <div key={item.step} className="flex flex-1 items-center gap-2">
                <div
                  className={`flex items-center gap-2 rounded-full px-3 py-2 text-xs font-medium transition ${
                    isComplete ? "border border-emerald-400/30 bg-emerald-500/10 text-emerald-200" : isCurrent ? "border border-blue-400/30 bg-blue-500/10 text-blue-200" : "border border-white/10 bg-white/5 text-muted-foreground"
                  }`}
                >
                  <item.icon size={12} />
                  {item.label}
                  {isComplete && <CircleCheckBig size={12} />}
                </div>
                {idx < arr.length - 1 && <ChevronRight size={16} className="text-white/20" />}
              </div>
            );
          })}
        </div>
      </div>

      {/* Phone step */}
      {currentStep === "phone" && !user.onboardingChecks?.phoneVerified && (
        <div className="rounded-3xl border border-white/10 bg-white/5 p-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-blue-500/10 p-3">
              <Phone size={20} className="text-blue-400" />
            </div>
            <div>
              <p className="font-semibold text-white">Phone verification</p>
              <p className="text-sm text-muted-foreground">Verify your phone number via OTP</p>
            </div>
          </div>

          {!phoneOtpRequested ? (
            <Button onClick={requestPhoneOtp} disabled={loading} className="w-full">
              {loading ? <Loader2 size={16} className="animate-spin" /> : "Send OTP"}
            </Button>
          ) : (
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Enter 6-digit OTP"
                value={phoneOtp}
                onChange={(e) => setPhoneOtp(e.target.value.slice(0, 6))}
                maxLength={6}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-center text-lg font-mono tracking-widest text-white placeholder:text-muted-foreground focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/50"
              />
              <Button onClick={verifyPhoneOtp} disabled={phoneVerifying || !phoneOtp} className="w-full">
                {phoneVerifying ? <Loader2 size={16} className="animate-spin" /> : "Verify OTP"}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Email step */}
      {currentStep === "email" && !user.onboardingChecks?.emailVerified && (
        <div className="rounded-3xl border border-white/10 bg-white/5 p-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-purple-500/10 p-3">
              <Mail size={20} className="text-purple-400" />
            </div>
            <div>
              <p className="font-semibold text-white">Email verification</p>
              <p className="text-sm text-muted-foreground">Verify your email address via OTP</p>
            </div>
          </div>

          {!emailOtpRequested ? (
            <Button onClick={requestEmailOtp} disabled={loading} className="w-full">
              {loading ? <Loader2 size={16} className="animate-spin" /> : "Send OTP"}
            </Button>
          ) : (
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Enter 6-digit OTP"
                value={emailOtp}
                onChange={(e) => setEmailOtp(e.target.value.slice(0, 6))}
                maxLength={6}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-center text-lg font-mono tracking-widest text-white placeholder:text-muted-foreground focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500/50"
              />
              <Button onClick={verifyEmailOtp} disabled={emailVerifying || !emailOtp} className="w-full">
                {emailVerifying ? <Loader2 size={16} className="animate-spin" /> : "Verify OTP"}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Aadhaar step */}
      {currentStep === "aadhaar" && !user.onboardingChecks?.aadhaarVerified && (
        <div className="rounded-3xl border border-white/10 bg-white/5 p-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-amber-500/10 p-3">
              <FileText size={20} className="text-amber-400" />
            </div>
            <div>
              <p className="font-semibold text-white">Aadhaar verification</p>
              <p className="text-sm text-muted-foreground">Upload your Aadhaar document (PDF or image)</p>
            </div>
          </div>

          <label className="block">
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              onChange={(e) => setAadhaarFile(e.target.files?.[0] || null)}
              className="hidden"
            />
            <div className="flex cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-white/10 bg-white/5 p-6 text-center hover:border-amber-500/30 hover:bg-amber-500/5 transition">
              <div>
                <FileText size={24} className="mx-auto mb-2 text-amber-400" />
                <p className="text-sm font-medium text-white">{aadhaarFile ? aadhaarFile.name : "Click to upload Aadhaar"}</p>
                <p className="text-xs text-muted-foreground">PDF or image up to 5MB</p>
              </div>
            </div>
          </label>

          <Button onClick={uploadAadhaar} disabled={aadhaarUploading || !aadhaarFile} className="w-full">
            {aadhaarUploading ? <Loader2 size={16} className="animate-spin" /> : "Upload Aadhaar"}
          </Button>
        </div>
      )}

      {/* Progress bar */}
      <div className="h-1 rounded-full bg-white/10 overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-blue-500 via-purple-500 to-amber-500 transition-all duration-500"
          style={{
            width: `${(Object.values(user.onboardingChecks || {}).filter(Boolean).length / 3) * 100}%`,
          }}
        />
      </div>
    </div>
  );
}
