import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { dashboardPath } from "@/lib/rolePaths";
import { OtpStep } from "@/components/auth/OtpStep";
import { AuthAurora, AuthCard } from "@/components/auth/AuthShell";

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
      <AuthAurora />

      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-full max-w-sm"
      >
        <AuthCard>
          <OtpStep
            email={email}
            phone={phone}
            onVerified={(u) => navigate(dashboardPath(u))}
            onBack={() => navigate("/login")}
          />
        </AuthCard>
      </motion.div>
    </main>
  );
}
