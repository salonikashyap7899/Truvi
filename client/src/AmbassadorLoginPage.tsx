import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { dashboardPath } from "@/lib/rolePaths";
import { Input, Label } from "@/components/ui/primitives";

export default function AmbassadorLoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const user = await login(email, password);
      navigate(dashboardPath(user));
    } catch (err: any) {
      // Unverified account: the server sent fresh OTPs — route to verification.
      const data = err?.response?.data;
      if (data?.needsVerification) {
        const phoneParam = data.phone ? `&phone=${encodeURIComponent(data.phone)}` : "";
        navigate(`/verify-email?email=${encodeURIComponent(email)}${phoneParam}`);
        return;
      }
      setError(data?.error || "Invalid email or password");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center px-4">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute left-1/2 top-[-15%] h-[45vh] w-[60vw] -translate-x-1/2 rounded-full opacity-20 blur-3xl" style={{ background: "radial-gradient(circle, #3B82F6 0%, transparent 70%)" }} />
      </div>

      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }} className="relative w-full max-w-sm">
        <div className="rounded-[26px] p-px" style={{ background: "linear-gradient(160deg, rgba(255,255,255,0.22), rgba(59,130,246,0.3) 45%, rgba(255,255,255,0.05) 85%)" }}>
          <div className="rounded-[25px] bg-[#0a0d14]/95 p-8">
            <div className="flex flex-col items-center text-center">
              <span className="grid size-11 place-items-center overflow-hidden rounded-2xl bg-white p-1 shadow-[0_0_36px_rgba(59,130,246,0.4)]">
                <img src="/brand/icon.png" alt="Truvi" className="h-full w-full object-contain" />
              </span>
              <span className="mt-3 font-display text-[12px] font-semibold tracking-[0.35em] text-white/90">TRUVI AMBASSADOR</span>
            </div>

            <h1 className="mt-5 text-center font-display text-2xl font-medium text-white">Ambassador login</h1>
            <p className="mt-1 text-center text-sm text-muted-foreground">Use your ambassador account to access Truvi reporting tools.</p>

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
                {loading ? "Signing in…" : "Sign in"}
              </button>
            </form>
          </div>
        </div>
      </motion.div>
    </main>
  );
}
