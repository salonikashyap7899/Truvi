import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Input, Label } from "@/components/ui/primitives";
import type { User } from "@/types";

/**
 * Inline OTP verification step. Renders the card's *inner* content only, so each
 * auth page (signup, login, the standalone verify page) can drop it straight
 * into its own glassy card wrapper. Keeps the whole verify flow on the auth page
 * itself instead of bouncing to a separate screen.
 */
export function OtpStep({
  email,
  phone,
  onVerified,
  onBack,
  initialDelivery,
}: {
  email: string;
  phone?: string;
  onVerified: (user: User) => void;
  onBack?: () => void;
  initialDelivery?: { emailSent?: boolean; smsSent?: boolean };
}) {
  const { verifyAccount, resendOtp } = useAuth();
  const [emailOtp, setEmailOtp] = useState("");
  const [phoneOtp, setPhoneOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [deliveryStatus, setDeliveryStatus] = useState(initialDelivery);

  const ready = emailOtp.length === 6 && phoneOtp.length === 6;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const user = await verifyAccount(email, emailOtp.trim(), phoneOtp.trim());
      toast.success("Account verified — welcome to Truvi!");
      onVerified(user);
    } catch (err: any) {
      setError(err?.response?.data?.error || "Could not verify the codes. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function onResend() {
    setError(null);
    setResending(true);
    try {
      const data = await resendOtp(email);
      const emailOk = data?.emailSent !== false;
      const smsOk = data?.smsSent !== false;
      setDeliveryStatus({
        emailSent: typeof data?.emailSent === "boolean" ? data.emailSent : undefined,
        smsSent: typeof data?.smsSent === "boolean" ? data.smsSent : undefined,
      });
      if (!emailOk && !smsOk) {
        toast.error("We couldn't send the codes right now. Please try again shortly or contact support.");
      } else if (!emailOk) {
        toast.message("Phone code sent. Email delivery isn't available right now — contact support if you can't get the email code.");
      } else if (!smsOk) {
        toast.message("Email code sent. SMS delivery isn't available right now — contact support if you can't get the phone code.");
      } else {
        toast.success("Fresh codes have been sent to your email and phone.");
      }
    } catch (err: any) {
      setError(err?.response?.data?.error || "Could not resend the codes. Please try again.");
    } finally {
      setResending(false);
    }
  }

  const codeInputCls =
    "h-11 border-white/12 bg-white/[0.04] text-center text-lg tracking-[0.5em] text-white placeholder:tracking-normal placeholder:text-white/30 transition-all focus:border-[var(--trust)]/50 focus:bg-white/[0.06] focus:ring-2 focus:ring-[var(--trust)]/20";

  return (
    <>
      <div className="flex flex-col items-center text-center">
        <h1 className="font-display text-2xl font-medium text-white">Verify your account</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Enter the 6-digit codes we sent to{" "}
          <span className="text-white/90">{email || "your email"}</span>
          {phone ? <> and <span className="text-white/90">{phone}</span></> : null}.
        </p>
      </div>

      {deliveryStatus && (deliveryStatus.emailSent === false || deliveryStatus.smsSent === false) && (
        <p role="status" className="mt-4 rounded-lg border border-amber-400/25 bg-amber-950/30 px-3 py-2 text-sm text-amber-200">
          {deliveryStatus.emailSent === false && deliveryStatus.smsSent === false
            ? "Neither verification code could be sent. Check your email/phone details and try Resend codes. If this keeps happening, contact Truvi support."
            : deliveryStatus.emailSent === false
              ? "The email provider did not accept the verification email. Resend the codes or contact Truvi support before continuing."
              : "The SMS provider did not accept the phone code. Resend the codes or contact Truvi support before continuing."}
          {" "}Do not restart signup repeatedly; doing so replaces the current codes.
        </p>
      )}

      <form onSubmit={onSubmit} className="mt-7 space-y-4">
        <div>
          <Label>Email code</Label>
          <Input
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={emailOtp}
            onChange={(e) => setEmailOtp(e.target.value.replace(/\D/g, ""))}
            required
            placeholder="123456"
            className={codeInputCls}
          />
        </div>
        <div>
          <Label>Phone (SMS) code</Label>
          <Input
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={phoneOtp}
            onChange={(e) => setPhoneOtp(e.target.value.replace(/\D/g, ""))}
            required
            placeholder="123456"
            className={codeInputCls}
          />
        </div>
        {error && (
          <p className="rounded-lg border border-red-500/25 bg-red-950/40 px-3 py-2 text-sm text-red-300">{error}</p>
        )}
        <button
          type="submit"
          disabled={loading || !ready}
          className="group relative mt-1 flex w-full items-center justify-center gap-2 overflow-hidden rounded-full bg-gradient-to-r from-[var(--trust)] via-[#3b82f6] to-[#2563eb] py-3.5 text-sm font-semibold text-white shadow-[0_12px_32px_-8px_rgba(59,130,246,0.7)] transition-all hover:shadow-[0_16px_40px_-6px_rgba(59,130,246,0.9)] active:scale-[0.99] disabled:opacity-60"
        >
          <span aria-hidden className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-full" />
          {loading && <Loader2 size={15} className="relative z-10 animate-spin" />}
          <span className="relative z-10">{loading ? "Verifying…" : "Verify & continue"}</span>
        </button>
        <div className="flex items-center justify-between text-sm">
          <button
            type="button"
            onClick={onResend}
            disabled={resending}
            className="font-medium text-sky-300 underline-offset-4 hover:underline disabled:opacity-60"
          >
            {resending ? "Sending…" : "Resend codes"}
          </button>
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="font-medium text-muted-foreground underline-offset-4 hover:text-white hover:underline"
            >
              Back
            </button>
          )}
        </div>
      </form>
    </>
  );
}
