import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { AskTruviChat, AskTruviSignInGate, profileIsSet, useAskTruviChat } from "@/components/assistant/AskTruviChat";

/**
 * Ask Truvi — full-page chat. The exact card from the home-page "Ask Truvi"
 * section (same width, glow, header, bubbles and footer), stretched to the
 * screen height, and the same conversation as the floating pop-up.
 */
export default function AskTruviPage() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const profile = useAskTruviChat((s) => s.profile);
  const [showAdvisor, setShowAdvisor] = useState(false);

  return (
    <main className="px-4 pb-4 pt-4 text-white">
      <div className="relative mx-auto w-full max-w-3xl">
        <div aria-hidden className="pointer-events-none absolute -inset-8 -z-10 opacity-40 blur-3xl" style={{ background: "var(--gradient-aurora)" }} />
        <div
          className="flex flex-col rounded-2xl glass p-5 md:p-7"
          style={{ height: "calc(100dvh - env(safe-area-inset-top, 0px) - 7rem)" }}
        >
          {/* Window chrome — identical to the home card */}
          <div className="flex shrink-0 items-center justify-between border-b border-white/10 pb-4">
            <div className="flex items-center gap-2">
              <span className="grid size-7 place-items-center rounded-full bg-[var(--trust)]/20 text-sm">✦</span>
              <div>
                <h1 className="text-sm font-semibold">Ask Truvi™</h1>
                <p className="text-[10px] text-muted-foreground">Property Intelligence · Source-backed</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <span className="rounded-full border border-emerald-400/20 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-300">Live</span>
              {accessToken && (
                <button
                  onClick={() => setShowAdvisor((s) => !s)}
                  className="relative rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-white/10 hover:text-white"
                  aria-label="Personalize advice"
                  title="Personalized Property Advisor"
                >
                  <SlidersHorizontal size={15} />
                  {profileIsSet(profile) && <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-emerald-400" />}
                </button>
              )}
            </div>
          </div>

          {accessToken ? (
            <AskTruviChat size="page" showAdvisor={showAdvisor} onCloseAdvisor={() => setShowAdvisor(false)} autoFocus />
          ) : (
            <AskTruviSignInGate />
          )}
        </div>
      </div>
    </main>
  );
}
