import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { BadgePercent, Copy, Share2, ArrowRight } from "lucide-react";

interface ReferralSummary {
  referredCount: number;
  active: number;
  totalTransactions: number;
  totalEarnings: number;
}
interface ReferralData {
  referralCode: string | null;
  summary?: ReferralSummary;
}

/**
 * Prominent "Refer a Developer & Earn 2%" banner. Any referrer role — Channel
 * Partner, Ambassador or Developer — sees their own shareable referral code and
 * can copy or share it, then jump to the full referral dashboard. The referral
 * system is identical across roles, so this one banner powers all of them.
 */
export function ReferralBanner({ className = "" }: { className?: string }) {
  const [referral, setReferral] = useState<ReferralData | null>(null);

  useEffect(() => {
    api.get("/onboarding/referral").then((r) => setReferral(r.data)).catch(() => {});
  }, []);

  const code = referral?.referralCode ?? null;
  const registrationLink = code ? `${window.location.origin}/signup?ref=${code}` : "";

  async function copyCode() {
    if (!code) return;
    try { await navigator.clipboard.writeText(code); toast.success("Referral code copied"); } catch { /* ignore */ }
  }

  async function shareReferral() {
    if (!code) return;
    const text = `Join Truvi with my referral code ${code} and list your properties.\n${registrationLink}`;
    if (typeof navigator !== "undefined" && navigator.share) {
      try { await navigator.share({ title: "Join Truvi", text, url: registrationLink }); return; }
      catch (err) { if ((err as Error)?.name === "AbortError") return; }
    }
    try { await navigator.clipboard.writeText(text); toast.success("Referral link copied — share it anywhere"); } catch { /* ignore */ }
  }

  return (
    <section
      className={`rounded-2xl border border-emerald-500/25 bg-gradient-to-br from-emerald-500/10 to-transparent p-5 text-white ${className}`}
      aria-label="Refer a developer and earn 2%"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-lg font-semibold">
            <BadgePercent size={18} className="text-emerald-400" />
            Refer a Developer &amp; Earn 2%
          </p>
          <p className="mt-1 text-sm text-emerald-100/80">
            Earn <b className="text-emerald-300">2% on every successful transaction</b> from every developer who joins with your code.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <span className="text-xs uppercase tracking-wide text-emerald-300/80">Your referral code</span>
            <span className="font-display text-2xl font-bold tracking-wider text-white">{code ?? "…"}</span>
            <button
              onClick={copyCode}
              title="Copy code"
              disabled={!code}
              className="rounded-lg border border-white/15 bg-white/5 p-2 text-white/70 transition hover:bg-white/10 disabled:opacity-40"
            >
              <Copy size={14} />
            </button>
          </div>
          {registrationLink && <p className="mt-2 break-all text-[11px] text-emerald-100/60">{registrationLink}</p>}
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
          <button
            onClick={shareReferral}
            disabled={!code}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-40"
          >
            <Share2 size={15} /> Share code
          </button>
          <Link
            to="/cp/onboard-developers"
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10"
          >
            Referral dashboard <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    </section>
  );
}
