import { useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "@/hooks/useAuth";
import { Input, Label } from "@/components/ui/primitives";
import { Loader2 } from "lucide-react";

const signupSchema = z
  .object({
    name: z.string().min(2, "Name must be at least 2 characters"),
    email: z
      .string()
      .email("Enter a valid email")
      .regex(/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i, "Enter a valid email"),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .regex(/[a-z]/, "Add at least one lowercase letter")
      .regex(/[A-Z]/, "Add at least one uppercase letter")
      .regex(/[0-9]/, "Add at least one number")
      .regex(/[^A-Za-z0-9]/, "Add at least one special character"),
    phone: z.string().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit Indian mobile number"),
    role: z.literal("AMBASSADOR"),
    companyName: z.string().optional(),
  })
  .superRefine(() => {
    // Role is fixed to AMBASSADOR here, so no extra role-specific validation is required.
  });

type SignupForm = z.infer<typeof signupSchema>;

export default function AmbassadorSignupPage() {
  const navigate = useNavigate();
  const { signup } = useAuth();
  const [serverError, setServerError] = useState<string | null>(null);
  const [searchParams] = useSearchParams();
  const defaultEmail = searchParams.get("email") ?? "";

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<SignupForm>({
    resolver: zodResolver(signupSchema),
    defaultValues: { role: "AMBASSADOR", email: defaultEmail, name: "", phone: "", password: "", companyName: "" },
  });

  async function onSubmit(data: SignupForm) {
    setServerError(null);
    try {
      await signup({
        ...data,
        role: "AMBASSADOR",
      });
      // Verify the email + phone OTPs before first sign-in.
      navigate(`/verify-email?email=${encodeURIComponent(data.email)}&phone=${encodeURIComponent(data.phone)}`);
    } catch (err: any) {
      setServerError(err?.response?.data?.error || "Something went wrong");
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center px-4 py-12">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute left-1/2 top-[-15%] h-[45vh] w-[60vw] -translate-x-1/2 rounded-full opacity-20 blur-3xl" style={{ background: "radial-gradient(circle, #3B82F6 0%, transparent 70%)" }} />
      </div>

      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }} className="relative w-full max-w-md">
        <div className="rounded-[26px] p-px" style={{ background: "linear-gradient(160deg, rgba(255,255,255,0.22), rgba(59,130,246,0.3) 45%, rgba(255,255,255,0.05) 85%)" }}>
          <div className="rounded-[25px] bg-[#0a0d14]/95 p-8">
            <div className="flex flex-col items-center text-center">
              <span className="grid size-11 place-items-center overflow-hidden rounded-2xl bg-white p-1 shadow-[0_0_36px_rgba(59,130,246,0.4)]">
                <img src="/brand/icon.png" alt="Truvi" className="h-full w-full object-contain" />
              </span>
              <span className="mt-3 font-display text-[12px] font-semibold tracking-[0.35em] text-white/90">TRUVI AMBASSADOR</span>
            </div>

            <h1 className="mt-5 text-center font-display text-2xl font-medium text-white">Join Truvi as an Ambassador</h1>
            <p className="mt-1 text-center text-sm text-muted-foreground">Get started with verified site reporting and earn for every completed ambassador task.</p>

            <form onSubmit={handleSubmit(onSubmit)} className="mt-7 space-y-4">
                <div>
                  <Label>Full name</Label>
                  <Input {...register("name")} placeholder="Priya Sharma" className="h-11 border-white/15 bg-white/5 text-white placeholder:text-white/30" />
                  {errors.name && <p className="mt-1 text-xs text-red-400">{errors.name.message}</p>}
                </div>
                <div>
                  <Label>Email</Label>
                  <Input type="email" {...register("email")} placeholder="you@example.com" className="h-11 border-white/15 bg-white/5 text-white placeholder:text-white/30" />
                  {errors.email && <p className="mt-1 text-xs text-red-400">{errors.email.message}</p>}
                </div>
                <div>
                  <Label>Phone</Label>
                  <Input {...register("phone")} placeholder="98765 43210" className="h-11 border-white/15 bg-white/5 text-white placeholder:text-white/30" />
                  {errors.phone && <p className="mt-1 text-xs text-red-400">{errors.phone.message}</p>}
                </div>
                <div>
                  <Label>Password</Label>
                  <Input type="password" {...register("password")} placeholder="8+ chars, upper, lower, number, symbol" className="h-11 border-white/15 bg-white/5 text-white placeholder:text-white/30" />
                  {errors.password ? (
                    <p className="mt-1 text-xs text-red-400">{errors.password.message}</p>
                  ) : (
                    <p className="mt-1 text-xs text-muted-foreground">At least 8 characters with an uppercase, lowercase, number and special character.</p>
                  )}
                </div>
                {serverError && <p className="rounded-lg border border-red-500/25 bg-red-950/40 px-3 py-2 text-sm text-red-300">{serverError}</p>}
                <button type="submit" disabled={isSubmitting} className="flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#dbeafe] to-white py-3 text-sm font-semibold text-[#0a0d14] transition-all hover:shadow-[0_0_30px_rgba(219,234,254,0.35)] disabled:opacity-60">
                  {isSubmitting && <Loader2 size={14} className="animate-spin" />}
                  {isSubmitting ? "Joining…" : "Join as Ambassador"}
                </button>
              </form>
            <p className="mt-6 text-center text-sm text-muted-foreground">
              Already have an ambassador account? <a href="/ambassador/login" className="font-medium text-sky-300 underline-offset-4 hover:underline">Sign in</a>
            </p>
          </div>
        </div>
      </motion.div>
    </main>
  );
}
