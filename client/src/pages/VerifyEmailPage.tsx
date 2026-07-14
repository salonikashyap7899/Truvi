import { useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { dashboardPath } from "@/lib/rolePaths";
import { Input, Label } from "@/components/ui/primitives";
import { Loader2, ShieldCheck } from "lucide-react";

export default function VerifyEmailPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const email = searchParams.get("email") ?? "";
  const phone = searchParams.get("phone") ?? "";
  const { verifyAccount, resendOtp } = useAuth();

  const [emailOtp, setEmailOtp] = useState("");
  const [phoneOtp, setPhoneOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  const ready = emailOtp.length === 6 && phoneOtp.length === 6;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const user = await verifyAccount(email, emailOtp.trim(), phoneOtp.trim());
      toast.success("Account verified — welcome to Truvi!");
      navigate(dashboardPath(user));
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
      if (data?.smsSent === false) {
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
    "h-11 border-white/15 bg-white/5 text-center text-lg tracking-[0.5em] text-white placeholder:tracking-normal placeholder:text-white/30";

  return (
    <main className="relative flex min-h-screen items-center justify-center px-4 py-12">
      {/* Ambient glow */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute left-1/2 top-[-15%] h-[45vh] w-[60vw] -translate-x-1/2 rounded-full opacity-20 blur-3xl"
          style={{ background: "radial-gradient(circle, #3B82F6 0%, transparent 70%)" }} />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-full max-w-sm"
      >
        <div className="rounded-[26px] p-px" style={{ background: "linear-gradient(160deg, rgba(255,255,255,0.22), rgba(59,130,246,0.3) 45%, rgba(255,255,255,0.05) 85%)" }}>
          <div className="rounded-[25px] bg-[#0a0d14]/95 p-8">
            <div className="flex flex-col items-center text-center">
              <span className="grid size-11 place-items-center rounded-2xl bg-white/10 text-sky-300 shadow-[0_0_36px_rgba(59,130,246,0.3)]">
                <ShieldCheck size={20} />
              </span>
              <h1 className="mt-4 font-display text-2xl font-medium text-white">Verify your account</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Enter the 6-digit codes we sent to{" "}
                <span className="text-white/90">{email || "your email"}</span>
                {phone ? <> and <span className="text-white/90">{phone}</span></> : null}.
              </p>
            </div>

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
                className="flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#dbeafe] to-white py-3 text-sm font-semibold text-[#0a0d14] transition-all hover:shadow-[0_0_30px_rgba(219,234,254,0.35)] disabled:opacity-60"
              >
                {loading && <Loader2 size={14} className="animate-spin" />}
                {loading ? "Verifying…" : "Verify & continue"}
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
                <Link to="/login" className="font-medium text-muted-foreground underline-offset-4 hover:text-white hover:underline">
                  Back to sign in
                </Link>
              </div>
            </form>
          </div>
        </div>
      </motion.div>
    </main>
  );
}
