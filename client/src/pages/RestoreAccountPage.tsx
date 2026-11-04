import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { ArrowRight, CheckCircle2, LockKeyhole, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";

function readRestoreToken(): string {
  if (typeof window === "undefined") return "";
  const match = window.location.hash.match(/^#token=([a-f0-9]{64})$/i);
  return match?.[1] ?? "";
}

export default function RestoreAccountPage() {
  const [token] = useState(readRestoreToken);
  const [busy, setBusy] = useState(false);
  const [restored, setRestored] = useState(false);

  async function restore() {
    if (!token) {
      toast.error("This restoration link is invalid or incomplete.");
      return;
    }
    setBusy(true);
    try {
      const response = await api.post("/compliance/account-deletion/restore", { token });
      setRestored(true);
      window.history.replaceState(null, "", window.location.pathname);
      toast.success(response.data?.message ?? "Your Truvi account has been restored.");
    } catch (error: any) {
      toast.error(error?.response?.data?.error || "This restoration link is invalid or expired.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-[80vh] items-center justify-center px-4 py-16 text-white">
      <section className="w-full max-w-lg rounded-3xl border border-white/10 bg-[#0d1420]/95 p-7 shadow-2xl sm:p-9">
        <div className="mb-5 grid size-12 place-items-center rounded-2xl border border-sky-400/20 bg-sky-400/10 text-sky-300">
          {restored ? <CheckCircle2 size={22} /> : <ShieldCheck size={22} />}
        </div>
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-300">Truvi account recovery</p>
        <h1 className="mt-2 text-2xl font-semibold">{restored ? "Account restored" : "Restore your Truvi account"}</h1>
        <p className="mt-3 text-sm leading-relaxed text-white/60">
          {restored
            ? "Your account is active again. For your security, previous sessions were revoked. Sign in with your existing email and password."
            : "Use the secure, single-use link sent to your verified email address. Restoring your account will re-enable sign-in and invalidate previous sessions."}
        </p>

        {!restored && (
          <div className="mt-6 space-y-4">
            <div className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <LockKeyhole size={17} className="mt-0.5 shrink-0 text-sky-300" />
              <p className="text-xs leading-relaxed text-white/50">
                This link can only be used once and expires 30 days after your account was deactivated. If it has expired, contact <a className="text-sky-300 underline" href="mailto:info@truviventures.com">Truvi support</a>.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void restore()}
              disabled={busy || !token}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-sky-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "Restoring account…" : "Restore my account"} <ArrowRight size={15} />
            </button>
            {!token && <p className="text-center text-xs text-amber-200/80">No valid recovery token was found in this link. Open the latest restoration email or contact support.</p>}
          </div>
        )}

        {restored && (
          <Link to="/login" className="mt-6 flex w-full items-center justify-center rounded-xl bg-sky-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-sky-400">
            Sign in to Truvi
          </Link>
        )}
        <p className="mt-6 text-center text-xs text-white/35">
          Need help? <a className="text-sky-300 underline" href="mailto:info@truviventures.com">info@truviventures.com</a>
        </p>
      </section>
    </main>
  );
}
