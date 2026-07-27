import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Loader2, ArrowLeft, MailCheck } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Input, Label } from "@/components/ui/primitives";
import { AuthCard } from "@/components/auth/AuthShell";

/**
 * Forgot-password flow, available to every role. Two steps on one screen:
 *  1. "request" — enter your email; we send a 6-digit reset code.
 *  2. "reset"   — enter the code + a new password to set it.
 * On success the user is sent back to /login.
 */

const inputClass =
  "h-11 border-white/12 bg-white/[0.04] text-white placeholder:text-white/30 transition-all focus:border-[var(--trust)]/50 focus:bg-white/[0.06] focus:ring-2 focus:ring-[var(--trust)]/20";

const submitClass =
  "group relative mt-1 flex w-full items-center justify-center gap-2 overflow-hidden rounded-full bg-gradient-to-r from-[var(--trust)] via-[#3b82f6] to-[#2563eb] py-3.5 text-sm font-semibold text-white shadow-[0_12px_32px_-8px_rgba(59,130,246,0.7)] transition-all hover:shadow-[0_16px_40px_-6px_rgba(59,130,246,0.9)] active:scale-[0.99] disabled:opacity-60";

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const { forgotPassword, resetPassword } = useAuth();

  const [phase, setPhase] = useState<"request" | "reset">("request");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onRequest(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await forgotPassword(email);
      setNotice("If an account exists for that email, we've sent a 6-digit reset code. Enter it below.");
      setPhase("reset");
    } catch (err: any) {
      setError(err?.response?.data?.error || "Couldn't send a reset code. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function onReset(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await resetPassword(email, otp, password);
      navigate("/login", {
        replace: true,
        state: { notice: "Password reset. Sign in with your new password." },
      });
    } catch (err: any) {
      setError(err?.response?.data?.error || "Couldn't reset your password. Check the code and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center px-4 py-12">
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-full max-w-sm"
      >
        <AuthCard>
          <h1 className="text-center font-display text-[26px] font-semibold leading-tight tracking-tight">
            <span className="bg-gradient-to-b from-white to-white/60 bg-clip-text text-transparent">
              {phase === "request" ? "Reset your password" : "Enter your reset code"}
            </span>
          </h1>
          <p className="mt-1 text-center text-sm text-muted-foreground">
            {phase === "request"
              ? "Enter your account email — we'll send you a 6-digit code."
              : "We emailed a code to your inbox. It expires in 10 minutes."}
          </p>

          {notice && (
            <p className="mt-5 flex items-start gap-2 rounded-lg border border-[var(--trust)]/25 bg-[var(--trust)]/10 px-3 py-2 text-sm text-sky-200">
              <MailCheck size={16} className="mt-0.5 shrink-0" /> {notice}
            </p>
          )}

          {phase === "request" ? (
            <form onSubmit={onRequest} className="mt-6 space-y-4">
              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="you@example.com"
                  className={inputClass}
                />
              </div>
              {error && (
                <p className="rounded-lg border border-red-500/25 bg-red-950/40 px-3 py-2 text-sm text-red-300">{error}</p>
              )}
              <button type="submit" disabled={loading} className={submitClass}>
                {loading && <Loader2 size={15} className="relative z-10 animate-spin" />}
                <span className="relative z-10">{loading ? "Sending…" : "Send reset code"}</span>
              </button>
            </form>
          ) : (
            <form onSubmit={onReset} className="mt-6 space-y-4">
              <div>
                <Label>Reset code</Label>
                <Input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  required
                  placeholder="6-digit code"
                  className={`${inputClass} tracking-[0.4em]`}
                />
              </div>
              <div>
                <Label>New password</Label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  className={inputClass}
                />
                <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground/70">
                  At least 8 characters with an uppercase, a lowercase, a number and a special character.
                </p>
              </div>
              {error && (
                <p className="rounded-lg border border-red-500/25 bg-red-950/40 px-3 py-2 text-sm text-red-300">{error}</p>
              )}
              <button type="submit" disabled={loading} className={submitClass}>
                {loading && <Loader2 size={15} className="relative z-10 animate-spin" />}
                <span className="relative z-10">{loading ? "Resetting…" : "Reset password"}</span>
              </button>
              <button
                type="button"
                onClick={() => { setPhase("request"); setError(null); setNotice(null); setOtp(""); }}
                className="w-full text-center text-sm text-muted-foreground underline-offset-4 hover:text-white hover:underline"
              >
                Use a different email
              </button>
            </form>
          )}

          <div className="mt-6 text-center">
            <Link to="/login" className="inline-flex items-center gap-1.5 text-sm text-sky-300 underline-offset-4 hover:underline">
              <ArrowLeft size={14} /> Back to sign in
            </Link>
          </div>
        </AuthCard>

        <p className="mt-6 text-center text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
          Neutral · Evidence-led · Source-backed
        </p>
      </motion.div>
    </main>
  );
}
