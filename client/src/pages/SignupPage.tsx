import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "@/hooks/useAuth";
import { dashboardPath } from "@/lib/rolePaths";
import { Input, PasswordInput } from "@/components/ui/primitives";
import { OtpStep } from "@/components/auth/OtpStep";
import { AuthCard } from "@/components/auth/AuthShell";
import { VoiceGuideButton } from "@/components/VoiceGuideButton";
import { User, Handshake, Building2, Loader2, ArrowRight, ChevronDown, Search, Mail, Phone, Lock, Gift } from "lucide-react";
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
    <div ref={ref} className="relative shrink-0">
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
        <div className="absolute left-0 z-[60] mt-1 w-[min(20rem,calc(100vw-5rem))] -translate-x-16 overflow-hidden rounded-xl border border-white/15 bg-[#0d1219] shadow-2xl shadow-black/60">
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

/** Transparent input styling used inside an icon Field (no border/bg of its
 *  own — the Field container provides the frame and focus ring). */
const FIELD_INPUT =
  "h-7 w-full rounded-none border-0 bg-transparent p-0 text-sm text-white placeholder:text-white/30 outline-none backdrop-blur-none focus:border-0 focus:ring-0";

/** A compact field row: an icon chip on the left, label + control stacked. */
function Field({
  icon,
  label,
  error,
  hint,
  className,
  children,
}: {
  icon: React.ReactNode;
  label: React.ReactNode;
  error?: string;
  hint?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <div className="flex items-center gap-2.5 rounded-xl border border-white/12 bg-white/[0.04] px-3 py-1.5 transition-all focus-within:border-[var(--trust)]/50 focus-within:bg-white/[0.06] focus-within:ring-2 focus-within:ring-[var(--trust)]/15">
        <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-[var(--trust)]/12 text-sky-300">{icon}</span>
        <div className="min-w-0 flex-1">
          <label className="block text-[10.5px] font-medium leading-tight text-muted-foreground">{label}</label>
          {children}
        </div>
      </div>
      {error ? (
        <p className="mt-0.5 text-[11px] text-red-400">{error}</p>
      ) : hint ? (
        <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{hint}</p>
      ) : null}
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


  return (
    <main className="relative flex min-h-[calc(100dvh-5rem)] items-center justify-center px-4 pt-2 [padding-bottom:calc(5rem+env(safe-area-inset-bottom))] sm:pb-4">

      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className={`relative w-full ${step === "otp" && pending ? "max-w-md" : "max-w-xl"}`}
      >
        {/* Compact card: two fields per row on larger screens so the whole
            form fits on one screen without scrolling. */}
        <AuthCard topLeft={<VoiceGuideButton key={guideAudio} audioSrc={guideAudio} />} className="!px-5 !pt-5 !pb-5 sm:!px-7">
            {step === "otp" && pending ? (
              <OtpStep
                email={pending.email}
                phone={pending.phone}
                onVerified={(u) => navigate(dashboardPath(u))}
                onBack={() => setStep("form")}
              />
            ) : (
            <>
            {/* Side padding keeps the title and subtitle clear of the voice-guide
                button pinned in the card's top-left corner (it overlapped on phones). */}
            <div className="px-11 sm:px-12">
            <h1 className="text-center font-display text-xl font-semibold leading-tight tracking-tight">
              <span className="bg-gradient-to-b from-white to-white/60 bg-clip-text text-transparent">Create your account</span>
            </h1>
            <p className="mx-auto mt-0.5 max-w-[22rem] text-center text-[11px] text-muted-foreground">
              We&apos;ll send 6-digit codes to your email and phone to verify your account.
            </p>
            </div>

            {/* Premium role selector — sliding highlight, icon over label */}
            <div className="mt-3 grid grid-cols-3 gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1">
              {ROLE_OPTIONS.map((opt) => {
                const active = role === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setValue("role", opt.id)}
                    className="relative flex flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1.5 text-center text-[11px] font-medium leading-tight"
                  >
                    {active && (
                      <motion.span
                        layoutId="roleActive"
                        transition={{ type: "spring", stiffness: 420, damping: 34 }}
                        className="absolute inset-0 rounded-lg bg-gradient-to-b from-[var(--trust)] to-[#2563eb] shadow-[0_10px_26px_-8px_rgba(59,130,246,0.7)]"
                      />
                    )}
                    <span className={`relative z-10 transition-colors ${active ? "text-white" : "text-muted-foreground"}`}>{opt.icon}</span>
                    <span className={`relative z-10 transition-colors ${active ? "text-white" : "text-muted-foreground"}`}>{opt.label}</span>
                  </button>
                );
              })}
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="mt-3 grid gap-2 sm:grid-cols-2">
                <Field icon={<User size={16} />} label="Full name" error={errors.name?.message}>
                  <Input {...register("name")} placeholder="e.g. Priya Sharma" className={FIELD_INPUT} />
                </Field>
                <Field icon={<Mail size={16} />} label="Email" error={errors.email?.message}>
                  <Input type="email" {...register("email")} placeholder="you@example.com" className={FIELD_INPUT} />
                </Field>
                <Field
                  icon={<Phone size={16} />}
                  label="Phone"
                  error={errors.phone?.message}
                  hint={countryCode !== "+91" ? `We'll text your OTP to ${countryCode}. Standard international SMS may apply.` : undefined}
                >
                  <div className="flex items-center gap-2">
                    <input type="hidden" {...register("countryCode")} />
                    <CountrySelect
                      value={countryCode}
                      onChange={(d) => setValue("countryCode", d, { shouldValidate: true })}
                      inputCls="flex items-center gap-1 rounded-md bg-white/[0.07] px-2 py-0.5 text-sm font-medium text-white"
                    />
                    <Input
                      {...register("phone")}
                      inputMode="tel"
                      placeholder={countryCode === "+91" ? "98765 43210" : "Mobile number"}
                      className={`${FIELD_INPUT} min-w-0 flex-1`}
                    />
                  </div>
                </Field>
                <Field
                  icon={<Lock size={16} />}
                  label="Password"
                  error={errors.password?.message}
                  hint={!errors.password ? "8+ chars · upper & lower case · number · symbol" : undefined}
                >
                  <PasswordInput {...register("password")} placeholder="Create a strong password" className={`${FIELD_INPUT} pr-9`} />
                </Field>
                {role === "DEVELOPER" && (
                  <Field icon={<Building2 size={16} />} label="Company name" error={errors.companyName?.message}>
                    <Input {...register("companyName")} placeholder="Skyline Developers Pvt Ltd" className={FIELD_INPUT} />
                  </Field>
                )}
                <Field
                  className={role === "DEVELOPER" ? undefined : "sm:col-span-2"}
                  icon={<Gift size={16} />}
                  label={<>Referral code <span className="text-muted-foreground/70">(optional)</span></>}
                  hint="From a Channel Partner, Ambassador or Developer"
                >
                  <Input {...register("referralCode")} placeholder="e.g. RAK4X9Q2" className={`${FIELD_INPUT} uppercase placeholder:normal-case`} />
                </Field>
                {serverError && (
                  <p className="sm:col-span-2 rounded-lg border border-red-500/25 bg-red-950/40 px-3 py-2 text-sm text-red-300">{serverError}</p>
                )}
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="group relative mt-1 flex w-full items-center justify-center gap-2 overflow-hidden rounded-full bg-gradient-to-r from-[var(--trust)] via-[#3b82f6] to-[#2563eb] py-2.5 text-sm sm:col-span-2 font-semibold text-white shadow-[0_12px_32px_-8px_rgba(59,130,246,0.7)] transition-all hover:shadow-[0_16px_40px_-6px_rgba(59,130,246,0.9)] active:scale-[0.99] disabled:opacity-60"
                >
                  <span aria-hidden className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-full" />
                  {isSubmitting && <Loader2 size={15} className="relative z-10 animate-spin" />}
                  <span className="relative z-10">{isSubmitting ? "Creating account…" : "Create account"}</span>
                  {!isSubmitting && <ArrowRight size={15} className="relative z-10 transition-transform group-hover:translate-x-0.5" />}
                </button>
                <p className="text-center text-[13px] text-muted-foreground sm:col-span-2">
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
