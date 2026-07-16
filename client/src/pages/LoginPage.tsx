import { useEffect, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { dashboardPath } from "@/lib/rolePaths";
import { Input, Label } from "@/components/ui/primitives";
import { OtpStep } from "@/components/auth/OtpStep";
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
              <span className="grid size-11 place-items-center overflow-hidden rounded-2xl bg-white p-1 shadow-[0_0_36px_rgba(59,130,246,0.4)]">
                <img src="/brand/icon.png" alt="Truvi" className="h-full w-full object-contain" />
              </span>
              <span className="mt-3 font-display text-[12px] font-semibold tracking-[0.35em] text-white/90">TRUVI</span>
            </Link>

            <h1 className="mt-5 text-center font-display text-2xl font-medium text-white">Welcome back</h1>
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
                  className="h-11 border-white/15 bg-white/5 text-white placeholder:text-white/30"
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
                  className="h-11 border-white/15 bg-white/5 text-white placeholder:text-white/30"
                />
              </div>
              {error && (
                <p className="rounded-lg border border-red-500/25 bg-red-950/40 px-3 py-2 text-sm text-red-300">{error}</p>
              )}
              <button
                type="submit"
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#dbeafe] to-white py-3 text-sm font-semibold text-[#0a0d14] transition-all hover:shadow-[0_0_30px_rgba(219,234,254,0.35)] disabled:opacity-60"
              >
                {loading && <Loader2 size={14} className="animate-spin" />}
                {loading ? "Signing in…" : "Sign in"}
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
          </div>
        </div>

        <p className="mt-6 text-center text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
          Neutral · Evidence-led · Source-backed
        </p>
      </motion.div>
    </main>
  );
}
