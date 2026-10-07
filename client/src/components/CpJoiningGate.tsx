import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { CheckCircle2, Circle, Handshake, Loader2, Video } from "lucide-react";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import UserMenu from "@/components/UserMenu";
import { CpKycOnboarding } from "@/components/CpKycOnboarding";
import { CpWhatsAppGate } from "@/components/CpWhatsAppGate";
import type { User } from "@/types";

/**
 * Compulsory Channel Partner joining. Every CP workspace page is shown only
 * after the partner has (1) cleared KYC, (2) joined the WhatsApp updates
 * channel and (3) accepted the partner terms. Each step is saved on the
 * account, so once joining is complete it never shows again — unless an admin
 * resets it. KYC itself is handled exactly as before (CpKycOnboarding).
 *
 * The saved flags are re-checked with the server on every CP page so an
 * admin reset (or joining finished on another device) takes effect.
 */

type Flags = Pick<User, "onboardingVerified" | "whatsappChannelJoined" | "cpJoinedAt">;
const complete = (u: Flags | null | undefined) => !!u?.onboardingVerified && !!u?.whatsappChannelJoined && !!u?.cpJoinedAt;

export function CpJoiningFlow({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const [checked, setChecked] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current || user?.role !== "CP") return;
    started.current = true;
    api
      .get("/auth/me")
      .then((res) => {
        const me = res.data.user as User;
        const cur = useAuthStore.getState().user;
        if (cur && me) {
          useAuthStore.getState().setUser({
            ...cur,
            onboardingVerified: me.onboardingVerified,
            onboardingChecks: me.onboardingChecks ?? cur.onboardingChecks,
            whatsappChannelJoined: me.whatsappChannelJoined,
            cpJoinedAt: me.cpJoinedAt ?? null,
            onboardingCompletedAt: me.onboardingCompletedAt ?? null,
          });
        }
      })
      .catch(() => {})
      .finally(() => setChecked(true));
  }, [user?.role]);

  if (user?.role !== "CP") return <>{children}</>;
  // Already complete on this device → show the page while re-checking quietly.
  if (complete(user)) return <>{children}</>;
  if (!checked) {
    return (
      <main className="grid min-h-[60vh] place-items-center text-sm text-muted-foreground">
        <span className="flex items-center gap-2"><Loader2 size={15} className="animate-spin" /> Checking your partner account…</span>
      </main>
    );
  }
  if (!user.onboardingVerified) return <CpKycOnboarding />;
  if (!user.whatsappChannelJoined) return <CpWhatsAppGate />;
  return <CpJoiningGate />;
}

const TERMS = [
  "I'll share only genuine customer details, with the customer's consent.",
  "Commissions and offers are paid as per Truvi's published terms, after the booking is verified.",
  "I won't misrepresent any project, price or approval to a customer.",
  "I'll keep customer data private and use it only for this enquiry.",
];

export function CpJoiningGate() {
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function complete() {
    if (!accepted || submitting) return;
    setSubmitting(true);
    try {
      const res = await api.post("/auth/cp-joining/complete", { acceptTerms: true });
      const cur = useAuthStore.getState().user;
      if (cur) useAuthStore.getState().setAuth({ ...cur, cpJoinedAt: res.data.cpJoinedAt }, res.data.accessToken ?? accessToken ?? "");
      toast.success("Welcome aboard — your Channel Partner workspace is unlocked.");
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Couldn't complete joining. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const step = (done: boolean, label: string, sub?: string) => (
    <li className="flex gap-3">
      {done ? <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-400" /> : <Circle size={18} className="mt-0.5 shrink-0 text-white/40" />}
      <div>
        <p className={`text-sm ${done ? "text-white/70" : "font-semibold text-white"}`}>{label}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </div>
    </li>
  );

  return (
    <main className="min-h-screen p-6 text-white md:p-10">
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-2 font-display font-semibold tracking-wide">
          <Handshake size={18} className="text-[var(--trust)]" /> Channel Partner joining
        </div>
        <UserMenu />
      </div>

      <div className="mx-auto max-w-xl">
        <div className="rounded-2xl border border-white/10 glass p-6 sm:p-8">
          <h1 className="text-xl font-semibold">Complete Channel Partner Joining</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            One last step before you can add leads, lock units and earn commissions on Truvi.
          </p>

          <ol className="mt-6 space-y-3">
            {step(!!user?.onboardingVerified, "KYC verified")}
            {step(!!user?.whatsappChannelJoined, "Joined the WhatsApp updates channel")}
            {step(false, "Accept the Channel Partner terms")}
          </ol>

          <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <ul className="list-disc space-y-1.5 pl-4 text-xs text-white/75">
              {TERMS.map((t) => <li key={t}>{t}</li>)}
            </ul>
            <label className="mt-4 flex cursor-pointer items-start gap-2.5 text-sm">
              <input type="checkbox" className="mt-0.5 size-4 accent-[var(--trust)]" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
              <span>I agree to the Truvi Channel Partner terms.</span>
            </label>
          </div>

          <button
            type="button"
            onClick={complete}
            disabled={!accepted || submitting}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[var(--trust)] to-[#2563eb] py-3 text-sm font-semibold text-white shadow-[0_10px_30px_-8px_rgba(59,130,246,0.7)] transition disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={16} />}
            {submitting ? "Completing…" : "Complete joining"}
          </button>

          <Link to="/help/meet" className="mt-4 flex items-center justify-center gap-1.5 text-xs text-sky-300 hover:underline">
            <Video size={13} /> Need help? Schedule a Google Meet with our team
          </Link>
          <p className="mt-4 text-center text-[11px] text-muted-foreground">
            Signed in as {user?.name || user?.email}. Joining is a one-time step.
          </p>
        </div>
      </div>
    </main>
  );
}
