import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { AskTruviChat, AskTruviSignInGate, profileIsSet, useAskTruviChat } from "@/components/assistant/AskTruviChat";

/**
 * Ask Truvi — full-page chat. Same assistant and the same conversation as the
 * floating pop-up (shared store), with room for long answers and comparisons.
 */
export default function AskTruviPage() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const profile = useAskTruviChat((s) => s.profile);
  const [showAdvisor, setShowAdvisor] = useState(false);

  return (
    <main className="px-3 pb-4 pt-2 text-white sm:px-6">
      <div
        className="mx-auto flex max-w-5xl flex-col overflow-hidden rounded-2xl border border-white/10 glass shadow-2xl shadow-black/50 backdrop-blur-2xl"
        style={{ height: "calc(100dvh - env(safe-area-inset-top, 0px) - 6.5rem)", backgroundColor: "rgba(10,13,20,0.9)" }}
      >
        {/* Same chrome as the home-page "Ask Truvi" card */}
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded-full bg-[var(--trust)]/20 text-sm">✦</span>
            <div>
              <h1 className="text-base font-semibold">Ask Truvi™</h1>
              <p className="text-[11px] text-muted-foreground">Property Intelligence · Source-backed</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <span className="mr-1 rounded-full border border-emerald-400/20 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-300">Live</span>
            {accessToken && (
              <button
                onClick={() => setShowAdvisor((s) => !s)}
                className="relative rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-white/10 hover:text-white"
                aria-label="Personalize advice"
                title="Personalized Property Advisor"
              >
                <SlidersHorizontal size={16} />
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
    </main>
  );
}
