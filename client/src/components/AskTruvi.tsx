import { useState, useRef, useEffect, useCallback } from "react";
import { X, Send, Bot, User, Sparkles, ChevronDown } from "lucide-react";

interface Message {
  id: string;
  role: "user" | "ai";
  text: string;
  ts: number;
}

const MOCK_RESPONSES: string[] = [
  "Based on current market trends in this micro-market, I'd recommend reviewing the price per sq. ft. against comparable ready-to-move listings within a 2 km radius.",
  "RERA registration is mandatory for projects above 500 sq. mt. in most states. A 'Pending' status means the developer has applied but approval is awaited — it's worth verifying the timeline.",
  "The trust score is computed from four signals: RERA compliance, legal encumbrance status, builder track record, and community reviews. A score above 75 is considered healthy.",
  "For this price bracket, an appreciation of 6–9% CAGR over 5 years is realistic in a Tier-1 metro, assuming infrastructure development plans proceed on schedule.",
  "Owner history with frequent changes (3+ owners in under 10 years) can indicate distress sales. I'd suggest requesting the chain of title documents before proceeding.",
  "Flood risk for this locality is mapped from historical IMD data and NDMA zone classifications. Medium risk typically means waterlogging during peak monsoon — check drainage infrastructure.",
  "A CP's commission is usually 1.5–3% of the agreement value, paid by the developer. Always confirm it is documented in the Channel Partner Agreement before site visits.",
  "I'm still learning! For complex legal or financial decisions, please consult a certified real estate attorney or SEBI-registered advisor.",
];

let msgCounter = 0;
function uid() {
  return `msg-${Date.now()}-${++msgCounter}`;
}

function mockReply(userText: string): Promise<string> {
  const lower = userText.toLowerCase();
  const match = MOCK_RESPONSES.find((r) => {
    if (lower.includes("rera")) return r.toLowerCase().includes("rera");
    if (lower.includes("trust")) return r.toLowerCase().includes("trust score");
    if (lower.includes("flood")) return r.toLowerCase().includes("flood");
    if (lower.includes("owner") || lower.includes("history")) return r.toLowerCase().includes("owner");
    if (lower.includes("appreciat") || lower.includes("cagr")) return r.toLowerCase().includes("appreciation");
    if (lower.includes("commission") || lower.includes("cp")) return r.toLowerCase().includes("cp");
    if (lower.includes("price") || lower.includes("value")) return r.toLowerCase().includes("price per");
    return false;
  });
  const reply = match ?? MOCK_RESPONSES[Math.floor(Math.random() * MOCK_RESPONSES.length)];
  return new Promise((res) => setTimeout(() => res(reply), 900 + Math.random() * 800));
}

function TypingDots() {
  return (
    <div className="flex items-center gap-1 px-4 py-3">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-2 w-2 rounded-full bg-blue-400 opacity-80"
          style={{
            animation: `truvi-bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

export default function AskTruvi() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: uid(),
      role: "ai",
      text: "Hi! I'm Truvi AI. Ask me anything about a property, RERA, pricing, or the real estate market.",
      ts: Date.now(),
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 150);
  }, [open]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    const userMsg: Message = { id: uid(), role: "user", text, ts: Date.now() };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);
    try {
      const reply = await mockReply(text);
      setMessages((prev) => [...prev, { id: uid(), role: "ai", text: reply, ts: Date.now() }]);
    } finally {
      setLoading(false);
    }
  }, [input, loading]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  return (
    <>
      {/* Bounce keyframes injected once */}
      <style>{`
        @keyframes truvi-bounce {
          0%, 80%, 100% { transform: translateY(0); }
          40% { transform: translateY(-6px); }
        }
      `}</style>

      {/* Floating trigger button */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Ask Truvi AI"
        className={`
          fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full
          bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-900/40
          transition-all duration-200 hover:bg-blue-500 hover:shadow-blue-800/50
          ${open ? "opacity-0 pointer-events-none scale-90" : "opacity-100 scale-100"}
        `}
      >
        <Sparkles size={16} />
        Ask Truvi AI
      </button>

      {/* Overlay — mobile only */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 sm:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Panel */}
      <div
        className={`
          fixed z-50 flex flex-col bg-[#0D1626] shadow-2xl shadow-black/60
          transition-all duration-300 ease-out
          /* Mobile: bottom sheet */
          bottom-0 left-0 right-0 rounded-t-2xl border-t border-x border-neutral-800
          sm:bottom-6 sm:right-6 sm:left-auto sm:w-[380px] sm:h-[520px]
          sm:rounded-2xl sm:border sm:border-neutral-800
          ${open ? "translate-y-0 opacity-100" : "translate-y-full sm:translate-y-8 opacity-0 pointer-events-none"}
        `}
        style={{ maxHeight: "85vh" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3 shrink-0">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600/20">
              <Sparkles size={14} className="text-blue-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Ask Truvi AI</p>
              <p className="text-[10px] text-neutral-500">Property intelligence assistant</p>
            </div>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="rounded-lg p-1.5 text-neutral-500 hover:bg-neutral-800 hover:text-white transition-colors"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-neutral-700">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex items-end gap-2 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}
            >
              {/* Avatar */}
              <div
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white
                  ${msg.role === "ai" ? "bg-blue-600/30" : "bg-neutral-700"}`}
              >
                {msg.role === "ai" ? <Bot size={13} className="text-blue-300" /> : <User size={13} />}
              </div>
              {/* Bubble */}
              <div
                className={`max-w-[78%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed
                  ${msg.role === "ai"
                    ? "bg-[#1a2540] text-neutral-200 rounded-bl-sm"
                    : "bg-blue-600 text-white rounded-br-sm"
                  }`}
              >
                {msg.text}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex items-end gap-2">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600/30">
                <Bot size={13} className="text-blue-300" />
              </div>
              <div className="rounded-2xl rounded-bl-sm bg-[#1a2540] px-1 py-0">
                <TypingDots />
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input bar */}
        <div className="shrink-0 border-t border-neutral-800 px-3 py-3">
          <div className="flex items-center gap-2 rounded-xl border border-neutral-700 bg-[#121A2B] px-3 py-2 focus-within:border-blue-600 transition-colors">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKey}
              placeholder="Ask about RERA, pricing, appreciation…"
              className="flex-1 bg-transparent text-sm text-white placeholder:text-neutral-600 outline-none"
              disabled={loading}
            />
            <button
              onClick={send}
              disabled={!input.trim() || loading}
              className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600 text-white transition-colors hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
              aria-label="Send"
            >
              <Send size={13} />
            </button>
          </div>
          <p className="mt-1.5 text-center text-[10px] text-neutral-700">
            Placeholder responses · Real AI coming soon
          </p>
        </div>
      </div>
    </>
  );
}
