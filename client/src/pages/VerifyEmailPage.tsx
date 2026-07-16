import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { dashboardPath } from "@/lib/rolePaths";
import { OtpStep } from "@/components/auth/OtpStep";

/**
 * Standalone verify screen — kept as a fallback for email/SMS links and the
 * ambassador flow. The primary signup/login paths now verify inline. Both
 * reuse the same {@link OtpStep} so every auth surface stays identical.
 */
export default function VerifyEmailPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const email = searchParams.get("email") ?? "";
  const phone = searchParams.get("phone") ?? "";

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
            <OtpStep
              email={email}
              phone={phone}
              onVerified={(u) => navigate(dashboardPath(u))}
              onBack={() => navigate("/login")}
            />
          </div>
        </div>
      </motion.div>
    </main>
  );
}
