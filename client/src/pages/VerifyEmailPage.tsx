import { useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { Input, Label } from "@/components/ui/primitives";
import { Loader2, MailCheck } from "lucide-react";
import type { User } from "@/types";

function dashboardPath(user: User): string {
  if (user.role === "ADMIN") {
    return user.email?.toLowerCase() === "founder@truvi.app" ? "/founder/dashboard" : "/admin/dashboard";
  }
  if (user.role === "DEVELOPER") return "/developer/dashboard";
  if (user.role === "AMBASSADOR") return "/ambassador/dashboard";
  if (user.role === "CP") return "/cp/dashboard";
  return "/buyer/dashboard";
}

export default function VerifyEmailPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const email = searchParams.get("email") ?? "";
  const { verifyEmail, resendOtp } = useAuth();

  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const user = await verifyEmail(email, otp.trim());
      toast.success("Email verified — welcome to Truvi!");
      navigate(dashboardPath(user));
    } catch (err: any) {
      setError(err?.response?.data?.error || "Could not verify the code. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function onResend() {
    setError(null);
    setResending(true);
    try {
      await resendOtp(email);
      toast.success("A new code has been sent to your email.");
    } catch (err: any) {
      setError(err?.response?.data?.error || "Could not resend the code. Please try again.");
    } finally {
      setResending(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center px-4">
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
                <MailCheck size={20} />
              </span>
              <h1 className="mt-4 font-display text-2xl font-medium text-white">Verify your email</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                We sent a 6-digit code to{" "}
                <span className="text-white/90">{email || "your email"}</span>. Enter it below to activate your account.
              </p>
            </div>

            <form onSubmit={onSubmit} className="mt-7 space-y-4">
              <div>
                <Label>Verification code</Label>
                <Input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                  required
                  placeholder="123456"
                  className="h-11 border-white/15 bg-white/5 text-center text-lg tracking-[0.5em] text-white placeholder:tracking-normal placeholder:text-white/30"
                />
              </div>
              {error && (
                <p className="rounded-lg border border-red-500/25 bg-red-950/40 px-3 py-2 text-sm text-red-300">{error}</p>
              )}
              <button
                type="submit"
                disabled={loading || otp.length !== 6}
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
                  {resending ? "Sending…" : "Resend code"}
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
