import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "@/hooks/useAuth";
import { dashboardPath } from "@/lib/rolePaths";
import { Input, Label, PasswordInput } from "@/components/ui/primitives";
import { OtpStep } from "@/components/auth/OtpStep";
import { AuthCard } from "@/components/auth/AuthShell";
import { VoiceGuideButton } from "@/components/VoiceGuideButton";
import { User, Handshake, Building2, Loader2, ArrowRight, ChevronDown, Search } from "lucide-react";
import { COUNTRY_CODES } from "@/lib/countryCodes";

/** Searchable country dial-code picker (native <select> can't be searched).
 *  Defined at module scope so the search input keeps focus across renders. */
function CountrySelect({ value, onChange, inputCls }: { value: string; onChange: (dial: string) => void; inputCls: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const selected = COUNTRY_CODES.find((c) => c.dial === value) ?? COUNTRY_CODES[0];
  const q = query.trim().toLowerCase();
  const filtered = q
    ? COUNTRY_CODES.filter((c) => c.name.toLowerCase().includes(q) || c.dial.replace("+", "").includes(q.replace("+", "")) || c.iso.toLowerCase().includes(q))
    : COUNTRY_CODES;

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div ref={ref} className="relative w-[8.5rem] shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`${inputCls} flex w-full items-center justify-between gap-1`}
        aria-label="Select country code"
      >
        <span className="truncate">{selected.flag} {selected.dial}</span>
        <ChevronDown size={14} className={`shrink-0 opacity-60 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute z-[60] mt-1 w-64 overflow-hidden rounded-xl border border-white/15 bg-[#0d1219] shadow-2xl shadow-black/60">
          <div className="border-b border-white/10 p-2">
            <div className="flex items-center gap-2 rounded-lg border border-white/15 bg-white/[0.05] px-2.5 py-1.5">
              <Search size={14} className="shrink-0 text-white/40" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search country or code…"
                className="w-full bg-transparent text-sm text-white placeholder:text-white/35 outline-none"
              />
            </div>
          </div>
          <div className="max-h-56 overflow-y-auto py-1">
            {filtered.length === 0 && <p className="px-3 py-3 text-xs text-white/50">No country matches.</p>}
            {filtered.map((c) => (
              <button
                type="button"
                key={`${c.iso}${c.dial}`}
                onClick={() => { onChange(c.dial); setOpen(false); setQuery(""); }}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-white/10 ${c.dial === value ? "bg-white/[0.06]" : ""}`}
              >
                <span className="w-6 shrink-0">{c.flag}</span>
                <span className="flex-1 truncate text-white/90">{c.name}</span>
                <span className="shrink-0 text-white/50">{c.dial}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

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
    // The country dial code (e.g. "+91") plus the national number. Indian
    // numbers keep the exact 10-digit rule; other countries accept 6–14 digits.
    countryCode: z.string(),
    phone: z.string(),
    role: z.enum(["DEVELOPER", "CP", "BUYER"]),
    companyName: z.string().optional(),
    referralCode: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.role === "DEVELOPER" && (!data.companyName || data.companyName.trim().length < 2)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["companyName"], message: "Company name is required for developers" });
    }
    const national = (data.phone || "").replace(/\D/g, "");
    if (data.countryCode === "+91") {
      if (!/^[6-9]\d{9}$/.test(national)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["phone"], message: "Enter a valid 10-digit Indian mobile number" });
      }
    } else if (national.length < 6 || national.length > 14) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["phone"], message: "Enter a valid mobile number for the selected country" });
    }
  });

type SignupForm = z.infer<typeof signupSchema>;
type Role = SignupForm["role"];

const ROLE_OPTIONS: { id: Role; label: string; icon: React.ReactNode }[] = [
  { id: "BUYER", label: "Buyer", icon: <User size={16} /> },
  { id: "CP", label: "Channel Partner", icon: <Handshake size={16} /> },
  { id: "DEVELOPER", label: "Developer / Seller", icon: <Building2 size={16} /> },
];

export default function SignupPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { signup, user, isAuthenticated } = useAuth();
  const [serverError, setServerError] = useState<string | null>(null);
  // Two-step flow kept on this page: "form" collects details, "otp" verifies
  // the emailed + texted codes inline (no bounce to a separate screen).
  const [step, setStep] = useState<"form" | "otp">("form");
  const [pending, setPending] = useState<{ email: string; phone: string } | null>(null);

  // Already signed in? Straight to this role's own workspace.
  useEffect(() => {
    if (isAuthenticated && user) navigate(dashboardPath(user), { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Role pre-selected by the welcome gate (?role=BUYER|CP|DEVELOPER)
  const paramRole = searchParams.get("role");
  // Ambassadors have their own dedicated signup at /ambassador/signup; the
  // generic form only offers Buyer / CP / Developer.
  const initialRole: Role =
    paramRole === "DEVELOPER" || paramRole === "CP" || paramRole === "BUYER"
      ? paramRole
      : "BUYER";

  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm<SignupForm>({
    resolver: zodResolver(signupSchema),
    defaultValues: { role: initialRole, countryCode: "+91", referralCode: searchParams.get("ref") ?? "" },
  });

  const role = watch("role");
  const countryCode = watch("countryCode");

  // Play the voice guide that matches the role the user is signing up as.
  const guideAudio =
    role === "DEVELOPER"
      ? "/media/developer-guide.mp3"
      : role === "CP"
        ? "/media/cp-guide.mp3"
        : "/media/buyer-guide.mp3";

  async function onSubmit(data: SignupForm) {
    setServerError(null);
    // Build the number to send: Indian numbers stay a bare 10-digit (unchanged);
    // other countries send full E.164 with the country code so the OTP SMS
    // reaches the right country.
    const national = (data.phone || "").replace(/\D/g, "");
    const phoneToSend = data.countryCode === "+91" ? national : `${data.countryCode}${national}`;
    try {
      await signup({ ...data, phone: phoneToSend });
      // Account created — verify the email + phone OTPs inline on this page.
      setPending({ email: data.email, phone: phoneToSend });
      setStep("otp");
    } catch (err: any) {
      setServerError(err?.response?.data?.error || "Something went wrong");
    }
  }

  const inputCls =
    "h-11 border-white/12 bg-white/[0.04] text-white placeholder:text-white/30 transition-all focus:border-[var(--trust)]/50 focus:bg-white/[0.06] focus:ring-2 focus:ring-[var(--trust)]/20";

  return (
    <main className="relative flex min-h-screen items-center justify-center px-4 py-12">

      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-full max-w-md"
      >
        <AuthCard topLeft={<VoiceGuideButton key={guideAudio} audioSrc={guideAudio} />}>
            {step === "otp" && pending ? (
              <OtpStep
                email={pending.email}
                phone={pending.phone}
                onVerified={(u) => navigate(dashboardPath(u))}
                onBack={() => setStep("form")}
              />
            ) : (
            <>
            <h1 className="text-center font-display text-[26px] font-semibold leading-tight tracking-tight">
              <span className="bg-gradient-to-b from-white to-white/60 bg-clip-text text-transparent">Create your account</span>
            </h1>
            <p className="mx-auto mt-1.5 max-w-[19rem] text-center text-sm text-muted-foreground">
              We&apos;ll send 6-digit codes to your email and phone to verify your account.
            </p>

            {/* Premium role selector — sliding highlight, icon over label */}
            <div className="mt-6 grid grid-cols-3 gap-1 rounded-2xl border border-white/10 bg-white/[0.03] p-1">
              {ROLE_OPTIONS.map((opt) => {
                const active = role === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setValue("role", opt.id)}
                    className="relative flex flex-col items-center justify-center gap-1.5 rounded-xl px-1 py-3 text-center text-[11.5px] font-medium leading-tight"
                  >
                    {active && (
                      <motion.span
                        layoutId="roleActive"
                        transition={{ type: "spring", stiffness: 420, damping: 34 }}
                        className="absolute inset-0 rounded-xl bg-gradient-to-b from-[var(--trust)] to-[#2563eb] shadow-[0_10px_26px_-8px_rgba(59,130,246,0.7)]"
                      />
                    )}
                    <span className={`relative z-10 transition-colors ${active ? "text-white" : "text-muted-foreground"}`}>{opt.icon}</span>
                    <span className={`relative z-10 transition-colors ${active ? "text-white" : "text-muted-foreground"}`}>{opt.label}</span>
                  </button>
                );
              })}
            </div>

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
                  <div className="flex gap-2">
                    <input type="hidden" {...register("countryCode")} />
                    <CountrySelect
                      value={countryCode}
                      onChange={(d) => setValue("countryCode", d, { shouldValidate: true })}
                      inputCls={inputCls}
                    />
                    <Input
                      {...register("phone")}
                      inputMode="tel"
                      placeholder={countryCode === "+91" ? "98765 43210" : "Mobile number"}
                      className={`${inputCls} flex-1`}
                    />
                  </div>
                  {errors.phone && <p className="mt-1 text-xs text-red-400">{errors.phone.message}</p>}
                  {countryCode !== "+91" && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      We'll text your OTP to {countryCode}. Standard international SMS may apply.
                    </p>
                  )}
                </div>
                <div>
                  <Label>Password</Label>
                  <PasswordInput {...register("password")} placeholder="8+ chars, upper, lower, number, symbol" className={inputCls} />
                  {errors.password ? (
                    <p className="mt-1 text-xs text-red-400">{errors.password.message}</p>
                  ) : (
                    <p className="mt-1 text-xs text-muted-foreground">At least 8 characters with an uppercase, lowercase, number and special character.</p>
                  )}
                </div>
                {role === "DEVELOPER" && (
                  <div>
                    <Label>Company name</Label>
                    <Input {...register("companyName")} placeholder="Skyline Developers Pvt Ltd" className={inputCls} />
                    {errors.companyName && <p className="mt-1 text-xs text-red-400">{errors.companyName.message}</p>}
                  </div>
                )}
                <div>
                  <Label>Referral code <span className="text-muted-foreground">(optional)</span></Label>
                  <Input {...register("referralCode")} placeholder="e.g. RAK4X9Q2" className={`${inputCls} uppercase placeholder:normal-case`} />
                  <p className="mt-1 text-xs text-muted-foreground">Got a code from a Channel Partner, Ambassador or Developer? Enter it to link your account.</p>
                </div>
                {serverError && (
                  <p className="rounded-lg border border-red-500/25 bg-red-950/40 px-3 py-2 text-sm text-red-300">{serverError}</p>
                )}
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="group relative mt-1 flex w-full items-center justify-center gap-2 overflow-hidden rounded-full bg-gradient-to-r from-[var(--trust)] via-[#3b82f6] to-[#2563eb] py-3.5 text-sm font-semibold text-white shadow-[0_12px_32px_-8px_rgba(59,130,246,0.7)] transition-all hover:shadow-[0_16px_40px_-6px_rgba(59,130,246,0.9)] active:scale-[0.99] disabled:opacity-60"
                >
                  <span aria-hidden className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-full" />
                  {isSubmitting && <Loader2 size={15} className="relative z-10 animate-spin" />}
                  <span className="relative z-10">{isSubmitting ? "Creating account…" : "Create account"}</span>
                  {!isSubmitting && <ArrowRight size={15} className="relative z-10 transition-transform group-hover:translate-x-0.5" />}
                </button>
                <p className="text-center text-sm text-muted-foreground">
                  Already have an account?{" "}
                  <Link to="/login" className="font-medium text-sky-300 underline-offset-4 hover:underline">
                    Sign in
                  </Link>
                </p>
              </form>
            </>
            )}
        </AuthCard>
      </motion.div>
    </main>
  );
}
