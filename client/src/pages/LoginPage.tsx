import { useEffect, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { dashboardPath } from "@/lib/rolePaths";
import { Input, Label } from "@/components/ui/primitives";
import { OtpStep } from "@/components/auth/OtpStep";
import { AuthAurora, AuthCard } from "@/components/auth/AuthShell";
import { Loader2 } from "lucide-react";

export default function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const roleParam = searchParams.get("role");
  const isAmbassador = roleParam === "AMBASSADOR";
  const { login, user, isAuthenticated } = useAuth();

  // Already signed in? Straight to this role's own workspace.
  useEffect(() => {
    if (isAuthenticated && user) navigate(dashboardPath(user), { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Unverified accounts verify inline on this page instead of bouncing away.
  const [otpPhase, setOtpPhase] = useState<{ email: string; phone?: string } | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const loggedIn = await login(email, password);
      // Every role lands in its own workspace — buyers see buyer things,
      // sellers see seller things, developers see developer things.
      navigate(dashboardPath(loggedIn));
    } catch (err: any) {
      // Unverified account: the server sent fresh OTPs — verify inline here.
      const data = err?.response?.data;
      if (data?.needsVerification) {
        setOtpPhase({ email, phone: data.phone });
        return;
      }
      setError(data?.error || "Invalid email or password");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center px-4 py-12">
      <AuthAurora />

      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-full max-w-sm"
      >
        <AuthCard>
            {otpPhase ? (
              <OtpStep
                email={otpPhase.email}
                phone={otpPhase.phone}
                onVerified={(u) => navigate(dashboardPath(u))}
                onBack={() => setOtpPhase(null)}
              />
            ) : (
            <>
            <Link to="/" className="flex flex-col items-center text-center">
              <span className="grid size-12 place-items-center overflow-hidden rounded-2xl bg-white p-1.5 shadow-[0_0_44px_rgba(59,130,246,0.5)] ring-1 ring-white/20">
                <img src="/brand/icon.png" alt="Truvi" className="h-full w-full object-contain" />
              </span>
              <span className="mt-3 font-display text-[12px] font-semibold tracking-[0.35em] text-white/90">TRUVI</span>
            </Link>

            <h1 className="mt-5 text-center font-display text-[26px] font-semibold leading-tight tracking-tight">
              <span className="bg-gradient-to-b from-white to-white/60 bg-clip-text text-transparent">Welcome back</span>
            </h1>
            <p className="mt-1 text-center text-sm text-muted-foreground">
              {isAmbassador ? "Sign in to your Ambassador workspace." : "Sign in to your Truvi workspace."}
            </p>

            <form onSubmit={onSubmit} className="mt-7 space-y-4">
              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="you@example.com"
                  className="h-11 border-white/12 bg-white/[0.04] text-white placeholder:text-white/30 transition-all focus:border-[var(--trust)]/50 focus:bg-white/[0.06] focus:ring-2 focus:ring-[var(--trust)]/20"
                />
              </div>
              <div>
                <Label>Password</Label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  className="h-11 border-white/12 bg-white/[0.04] text-white placeholder:text-white/30 transition-all focus:border-[var(--trust)]/50 focus:bg-white/[0.06] focus:ring-2 focus:ring-[var(--trust)]/20"
                />
              </div>
              {error && (
                <p className="rounded-lg border border-red-500/25 bg-red-950/40 px-3 py-2 text-sm text-red-300">{error}</p>
              )}
              <button
                type="submit"
                disabled={loading}
                className="group relative mt-1 flex w-full items-center justify-center gap-2 overflow-hidden rounded-full bg-gradient-to-r from-[var(--trust)] via-[#3b82f6] to-[#2563eb] py-3.5 text-sm font-semibold text-white shadow-[0_12px_32px_-8px_rgba(59,130,246,0.7)] transition-all hover:shadow-[0_16px_40px_-6px_rgba(59,130,246,0.9)] active:scale-[0.99] disabled:opacity-60"
              >
                <span aria-hidden className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-full" />
                {loading && <Loader2 size={15} className="relative z-10 animate-spin" />}
                <span className="relative z-10">{loading ? "Signing in…" : "Sign in"}</span>
              </button>
              <p className="text-center text-sm text-muted-foreground">
                New to Truvi?{" "}
                <Link to="/signup" className="font-medium text-sky-300 underline-offset-4 hover:underline">
                  Create an account
                </Link>
              </p>
            </form>
            </>
            )}
        </AuthCard>

        <p className="mt-6 text-center text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
          Neutral · Evidence-led · Source-backed
        </p>
      </motion.div>
    </main>
  );
}
