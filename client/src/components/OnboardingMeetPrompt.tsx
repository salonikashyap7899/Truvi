import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Video, X } from "lucide-react";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { dashboardPath } from "@/lib/rolePaths";
import { IS_NATIVE } from "@/lib/native";
import { formatDate, formatTime } from "@/components/leads/inventoryLeadShared";

/**
 * Onboarding meeting invite for people who work on Truvi (Channel Partners,
 * Ambassadors, Developers): a small card on their dashboard with the fixed
 * onboarding session (if the admin set one) and "Schedule a Google Meet".
 * "I'm all set" marks onboarding complete on the account, so the card never
 * shows again unless an admin resets it. "×" hides it for this visit only.
 */

const ROLES = new Set(["CP", "AMBASSADOR", "DEVELOPER"]);
const LATER_KEY = "truvi-onboarding-meet-later";

interface Session { date: string; time: string; link: string; note?: string }

export default function OnboardingMeetPrompt() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const { pathname } = useLocation();
  const [state, setState] = useState<{ show: boolean; session: Session | null }>({ show: false, session: null });

  const eligible =
    !!user &&
    ROLES.has(user.role) &&
    !user.onboardingCompletedAt &&
    pathname === dashboardPath(user) &&
    // A CP still finishing joining sees the joining steps, not this card.
    (user.role !== "CP" || (!!user.onboardingVerified && !!user.whatsappChannelJoined && !!user.cpJoinedAt));

  useEffect(() => {
    if (!eligible) { setState((s) => (s.show ? { ...s, show: false } : s)); return; }
    try { if (sessionStorage.getItem(LATER_KEY)) return; } catch { /* ignore */ }
    let cancelled = false;
    api
      .get("/meetings/mine")
      .then((r) => {
        if (cancelled) return;
        if (r.data.onboardingCompleted) {
          const cur = useAuthStore.getState().user;
          if (cur) setUser({ ...cur, onboardingCompletedAt: cur.onboardingCompletedAt ?? new Date().toISOString() });
          return;
        }
        setState({ show: true, session: r.data.onboardingSession ?? null });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [eligible, setUser]);

  if (!eligible || !state.show) return null;

  function later() {
    try { sessionStorage.setItem(LATER_KEY, "1"); } catch { /* ignore */ }
    setState((s) => ({ ...s, show: false }));
  }
  async function allSet() {
    setState((s) => ({ ...s, show: false }));
    try {
      const r = await api.post("/meetings/onboarding/complete");
      const cur = useAuthStore.getState().user;
      if (cur) setUser({ ...cur, onboardingCompletedAt: r.data.onboardingCompletedAt });
    } catch { /* it'll show again next visit */ }
  }

  const s = state.session;
  return (
    <div
      className="fixed inset-x-3 z-[60] sm:inset-x-auto sm:left-5 sm:w-[360px]"
      style={{ bottom: IS_NATIVE ? "calc(76px + env(safe-area-inset-bottom, 0px))" : "4.5rem" }}
      role="dialog"
      aria-label="Onboarding"
    >
      <div className="relative rounded-2xl border border-sky-400/25 bg-[#0a0d14]/95 p-4 text-white shadow-2xl shadow-black/60 backdrop-blur-xl">
        <button onClick={later} aria-label="Not now" className="absolute right-2.5 top-2.5 grid size-7 place-items-center rounded-full text-white/50 hover:bg-white/10 hover:text-white">
          <X size={14} />
        </button>
        <p className="flex items-center gap-1.5 pr-6 text-sm font-semibold"><Video size={15} className="text-sky-300" /> New to Truvi?</p>
        <p className="mt-1 text-xs text-white/70">Need help understanding how to work on Truvi? Schedule a Google Meet with our team.</p>
        {s && (
          <div className="mt-2.5 rounded-xl border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-xs">
            <p className="font-semibold text-amber-100">Onboarding session · {formatDate(s.date, { weekday: "short", day: "numeric", month: "short" })}, {formatTime(s.time)}</p>
            <a href={s.link} target="_blank" rel="noreferrer" className="mt-1 inline-block font-semibold text-amber-300 hover:underline">Join on Google Meet →</a>
          </div>
        )}
        <div className="mt-3 flex gap-2">
          <Link to="/help/meet" onClick={later} className="flex-1 rounded-xl bg-gradient-to-r from-[var(--trust)] to-[#2563eb] py-2 text-center text-xs font-semibold">
            Schedule a Google Meet
          </Link>
          <button onClick={allSet} className="rounded-xl border border-white/15 px-3 py-2 text-xs text-white/80 hover:bg-white/10">I’m all set</button>
        </div>
      </div>
    </div>
  );
}
