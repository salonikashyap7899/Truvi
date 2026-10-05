import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useBodyScrollLock } from "@/lib/useBodyScrollLock";
import { IS_NATIVE } from "@/lib/native";
import { Sparkles, SlidersHorizontal, X, Minus, Maximize2, ChevronUp } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { AskTruviChat, AskTruviSignInGate, profileIsSet, useAskTruviChat } from "@/components/assistant/AskTruviChat";
import CopilotTools from "@/components/assistant/CopilotTools";

/**
 * The Truvi assistant pop-up — one floating panel with two AIs:
 *   1. Ask Truvi — source-backed property intelligence chat (everyone)
 *   2. Copilot  — WhatsApp / pitch / objection scripts (signed-in users)
 * It can be minimised to a small bar (the conversation is kept), or expanded
 * to the full-page chat at /ask-truvi, which continues the same conversation.
 * Other screens open it with the `open-ask-truvi` / `open-copilot` events.
 */

type Tab = "ask" | "copilot";

interface AskTruviProps {
  propertyContext?: Record<string, unknown>;
}

export default function AskTruvi({ propertyContext }: AskTruviProps = {}) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const role = useAuthStore((s) => s.user?.role);
  const profile = useAskTruviChat((s) => s.profile);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [tab, setTab] = useState<Tab>("ask");
  const [showAdvisor, setShowAdvisor] = useState(false);
  const expanded = open && !minimized;
  useBodyScrollLock(expanded); // lock the page behind the panel while it's open

  // The Copilot is for signed-in users (not ambassadors, who have no assistant).
  const copilotAvailable = !!accessToken;

  // Landing page CTAs, the app's tab bar / menu (and any other component) can
  // open the assistant on either tab.
  useEffect(() => {
    const openAsk = () => { setTab("ask"); setMinimized(false); setOpen(true); };
    const openCopilot = () => { setTab("copilot"); setMinimized(false); setOpen(true); };
    window.addEventListener("open-ask-truvi", openAsk);
    window.addEventListener("open-copilot", openCopilot);
    return () => {
      window.removeEventListener("open-ask-truvi", openAsk);
      window.removeEventListener("open-copilot", openCopilot);
    };
  }, []);

  useEffect(() => {
    if (tab === "copilot" && !copilotAvailable) setTab("ask");
  }, [tab, copilotAvailable]);

  // While the panel is open (a full-width bottom sheet on phones), flag it on
  // <body> so the other floating buttons (Invest) get out of the way —
  // otherwise they sit on top of the input and hide what you type.
  useEffect(() => {
    document.body.classList.toggle("ask-truvi-open", expanded);
    return () => document.body.classList.remove("ask-truvi-open");
  }, [expanded]);

  // Ambassadors get a focused field-agent workspace — no assistant. The
  // full-page chat already is the assistant, so no pop-up on top of it.
  if (role === "AMBASSADOR" || pathname === "/ask-truvi") return null;

  function openFullPage() {
    setOpen(false);
    setMinimized(false);
    navigate("/ask-truvi");
  }

  const tabBtn = (id: Tab, label: string) => (
    <button
      key={id}
      onClick={() => setTab(id)}
      className={`flex-1 py-2 text-xs font-semibold transition-colors ${
        tab === id ? "border-b-2 border-[var(--trust)] text-white" : "text-muted-foreground hover:text-foreground/90"
      }`}
    >
      {label}
    </button>
  );

  return (
    <>
      {/* Floating trigger button. Hidden in the installed app — the bottom
          navigation already has a prominent "Ask Truvi" action that opens this
          panel via the `open-ask-truvi` event. The website keeps it. */}
      {!IS_NATIVE && !open && (
        <button
          onClick={() => { setMinimized(false); setOpen(true); }}
          aria-label="Ask Truvi"
          data-fab="ask"
          className="fixed bottom-5 right-5 z-50 flex items-center gap-1.5 rounded-full bg-blue-600 px-3 py-2 text-xs font-semibold text-white shadow-lg shadow-blue-900/40 transition-all duration-200 hover:bg-blue-500 hover:shadow-blue-800/50"
        >
          <Sparkles size={14} />
          Ask Truvi
        </button>
      )}

      {/* Minimised bar — the conversation is kept; tap to restore. */}
      {open && minimized && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-1 rounded-full border border-white/10 py-1.5 pl-3 pr-1.5 shadow-2xl shadow-black/60 backdrop-blur-2xl" style={{ backgroundColor: "rgba(10,13,20,0.94)" }}>
          <button onClick={() => setMinimized(false)} className="flex items-center gap-2 text-left" aria-label="Restore Ask Truvi">
            <span className="grid size-6 place-items-center rounded-full bg-[var(--trust)]/20 text-xs text-white">✦</span>
            <span className="text-xs font-semibold text-white">{tab === "copilot" ? "Truvi Copilot" : "Ask Truvi™"}</span>
            <ChevronUp size={14} className="text-muted-foreground" />
          </button>
          <button onClick={() => { setOpen(false); setMinimized(false); }} className="ml-1 rounded-full p-1 text-muted-foreground hover:bg-white/10 hover:text-white" aria-label="Close">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Overlay — mobile only */}
      {expanded && <div className="fixed inset-0 z-40 bg-black/50 sm:hidden" onClick={() => setMinimized(true)} />}

      {/* Panel */}
      <div
        className={`
          fixed z-50 flex flex-col glass shadow-2xl shadow-black/60 backdrop-blur-2xl
          transition-all duration-300 ease-out
          bottom-3 inset-x-3 h-[70vh] max-h-[560px] rounded-2xl border border-white/10
          sm:bottom-6 sm:right-6 sm:left-auto sm:inset-x-auto sm:w-[420px] sm:h-[600px] sm:max-h-none
          ${expanded ? "translate-y-0 opacity-100" : "translate-y-full sm:translate-y-8 opacity-0 pointer-events-none"}
        `}
        style={{ maxHeight: "85vh", backgroundColor: "rgba(10,13,20,0.94)" }}
        aria-hidden={!expanded}
      >
        {/* Header — same chrome as the home-page "Ask Truvi" card */}
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 shrink-0">
          <div className="flex items-center gap-2">
            <span className="grid size-7 place-items-center rounded-full bg-[var(--trust)]/20 text-sm text-white">✦</span>
            <div>
              <p className="text-sm font-semibold text-white">{tab === "copilot" ? "Truvi Copilot" : "Ask Truvi™"}</p>
              <p className="text-[10px] text-muted-foreground">
                {tab === "copilot" ? "Sales scripts · WhatsApp · Objections" : "Property Intelligence · Source-backed"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-0.5">
            <span className="mr-1 rounded-full border border-emerald-400/20 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-300">Live</span>
            {tab === "ask" && accessToken && (
              <button
                onClick={() => setShowAdvisor((s) => !s)}
                className="relative rounded-lg p-1.5 text-muted-foreground hover:bg-white/10 hover:text-white transition-colors"
                aria-label="Personalize advice"
                title="Personalized Property Advisor"
              >
                <SlidersHorizontal size={15} />
                {profileIsSet(profile) && <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-emerald-400" />}
              </button>
            )}
            <button onClick={openFullPage} className="rounded-lg p-1.5 text-muted-foreground hover:bg-white/10 hover:text-white transition-colors" aria-label="Open full page" title="Open full page">
              <Maximize2 size={14} />
            </button>
            <button onClick={() => setMinimized(true)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-white/10 hover:text-white transition-colors" aria-label="Minimize" title="Minimize">
              <Minus size={15} />
            </button>
            <button onClick={() => { setOpen(false); setMinimized(false); }} className="rounded-lg p-1.5 text-muted-foreground hover:bg-white/10 hover:text-white transition-colors" aria-label="Close" title="Close">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Two AIs, one pop-up */}
        {copilotAvailable && (
          <div className="flex shrink-0 border-b border-white/10">
            {tabBtn("ask", "1 · Ask Truvi")}
            {tabBtn("copilot", "2 · Copilot")}
          </div>
        )}

        {tab === "copilot" && copilotAvailable ? (
          <CopilotTools />
        ) : !accessToken ? (
          <AskTruviSignInGate />
        ) : (
          <AskTruviChat
            propertyContext={propertyContext}
            showAdvisor={showAdvisor}
            onCloseAdvisor={() => setShowAdvisor(false)}
            autoFocus={expanded}
          />
        )}
      </div>
    </>
  );
}
