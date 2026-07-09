import { useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "@/hooks/useAuth";
import { Input, Label } from "@/components/ui/primitives";
import { User, Handshake, Building2, Loader2 } from "lucide-react";

const signupSchema = z
  .object({
    name: z.string().min(2, "Name must be at least 2 characters"),
    email: z.string().email("Enter a valid email"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    phone: z.string().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit Indian mobile number").optional().or(z.literal("")),
    role: z.enum(["DEVELOPER", "CP", "BUYER"]),
    companyName: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.role === "DEVELOPER" && (!data.companyName || data.companyName.trim().length < 2)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["companyName"], message: "Company name is required for developers" });
    }
  });

type SignupForm = z.infer<typeof signupSchema>;
type Role = SignupForm["role"];

const ROLE_OPTIONS: { id: Role; label: string; icon: React.ReactNode }[] = [
  { id: "BUYER", label: "Buyer", icon: <User size={16} /> },
  { id: "CP", label: "Seller / CP", icon: <Handshake size={16} /> },
  { id: "DEVELOPER", label: "Developer", icon: <Building2 size={16} /> },
];

export default function SignupPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { signup } = useAuth();
  const [serverError, setServerError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Role pre-selected by the welcome gate (?role=BUYER|CP|DEVELOPER)
  const paramRole = searchParams.get("role");
  const initialRole: Role =
    paramRole === "DEVELOPER" || paramRole === "CP" || paramRole === "BUYER"
      ? paramRole
      : paramRole === "AMBASSADOR"
      ? "CP"
      : "BUYER";

  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm<SignupForm>({
    resolver: zodResolver(signupSchema),
    defaultValues: { role: initialRole },
  });

  const role = watch("role");

  async function onSubmit(data: SignupForm) {
    setServerError(null);
    try {
      await signup(data);
      setSuccess(true);
      setTimeout(() => navigate("/login"), 2000);
    } catch (err: any) {
      setServerError(err?.response?.data?.error || "Something went wrong");
    }
  }

  const inputCls = "h-11 border-white/15 bg-white/5 text-white placeholder:text-white/30";

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
        className="relative w-full max-w-md"
      >
        <div className="rounded-[26px] p-px" style={{ background: "linear-gradient(160deg, rgba(255,255,255,0.22), rgba(59,130,246,0.3) 45%, rgba(255,255,255,0.05) 85%)" }}>
          <div className="rounded-[25px] bg-[#0a0d14]/95 p-8">
            <Link to="/" className="flex flex-col items-center text-center">
              <span className="grid size-11 place-items-center overflow-hidden rounded-2xl bg-white p-1 shadow-[0_0_36px_rgba(59,130,246,0.4)]">
                <img src="/brand/icon.png" alt="Truvi" className="h-full w-full object-contain" />
              </span>
              <span className="mt-3 font-display text-[12px] font-semibold tracking-[0.35em] text-white/90">TRUVI</span>
            </Link>

            <h1 className="mt-5 text-center font-display text-2xl font-medium text-white">Create your account</h1>
            <p className="mt-1 text-center text-sm text-muted-foreground">
              An admin verifies and approves every account before full access.
            </p>

            {/* Role selector */}
            <div className="mt-6 flex rounded-full border border-white/12 bg-white/[0.04] p-1">
              {ROLE_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setValue("role", opt.id)}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-full py-2 text-[13px] font-medium transition-all ${
                    role === opt.id
                      ? "bg-gradient-to-r from-[var(--trust)] to-[#2563eb] text-white shadow-[0_0_18px_rgba(59,130,246,0.35)]"
                      : "text-muted-foreground hover:text-white"
                  }`}
                >
                  {opt.icon}
                  {opt.label}
                </button>
              ))}
            </div>

            {success ? (
              <p className="mt-6 rounded-xl border border-emerald-500/25 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-300">
                Account created! Redirecting to sign-in — your account is pending admin approval.
              </p>
            ) : (
              <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
                <div>
                  <Label>Full name</Label>
                  <Input {...register("name")} placeholder="Priya Sharma" className={inputCls} />
                  {errors.name && <p className="mt-1 text-xs text-red-400">{errors.name.message}</p>}
                </div>
                <div>
                  <Label>Email</Label>
                  <Input type="email" {...register("email")} placeholder="you@example.com" className={inputCls} />
                  {errors.email && <p className="mt-1 text-xs text-red-400">{errors.email.message}</p>}
                </div>
                <div>
                  <Label>Phone</Label>
                  <Input {...register("phone")} placeholder="98765 43210" className={inputCls} />
                  {errors.phone && <p className="mt-1 text-xs text-red-400">{errors.phone.message}</p>}
                </div>
                <div>
                  <Label>Password</Label>
                  <Input type="password" {...register("password")} placeholder="At least 8 characters" className={inputCls} />
                  {errors.password && <p className="mt-1 text-xs text-red-400">{errors.password.message}</p>}
                </div>
                {role === "DEVELOPER" && (
                  <div>
                    <Label>Company name</Label>
                    <Input {...register("companyName")} placeholder="Skyline Developers Pvt Ltd" className={inputCls} />
                    {errors.companyName && <p className="mt-1 text-xs text-red-400">{errors.companyName.message}</p>}
                  </div>
                )}
                {serverError && (
                  <p className="rounded-lg border border-red-500/25 bg-red-950/40 px-3 py-2 text-sm text-red-300">{serverError}</p>
                )}
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#dbeafe] to-white py-3 text-sm font-semibold text-[#0a0d14] transition-all hover:shadow-[0_0_30px_rgba(219,234,254,0.35)] disabled:opacity-60"
                >
                  {isSubmitting && <Loader2 size={14} className="animate-spin" />}
                  {isSubmitting ? "Creating account…" : "Create account"}
                </button>
                <p className="text-center text-sm text-muted-foreground">
                  Already have an account?{" "}
                  <Link to="/login" className="font-medium text-sky-300 underline-offset-4 hover:underline">
                    Sign in
                  </Link>
                </p>
              </form>
            )}
          </div>
        </div>
      </motion.div>
    </main>
  );
}
