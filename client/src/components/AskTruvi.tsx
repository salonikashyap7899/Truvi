import { useState, useRef, useEffect, useCallback } from "react";
import { X, Send, Bot, User, Sparkles } from "lucide-react";
import { api } from "@/lib/api";

interface Message {
  id: string;
  role: "user" | "ai";
  text: string;
  ts: number;
}

let msgCounter = 0;
function uid() {
  return `msg-${Date.now()}-${++msgCounter}`;
}

async function fetchAIReply(message: string, propertyContext?: Record<string, unknown>): Promise<string> {
  try {
    const res = await api.post("/ai/chat", { message, propertyContext });
    return res.data.reply as string;
  } catch (err: unknown) {
    const axiosErr = err as { response?: { data?: { reply?: string } } };
    if (axiosErr?.response?.data?.reply) return axiosErr.response.data.reply;
    return "I'm having trouble connecting right now. Please try again in a moment.";
  }
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

interface AskTruviProps {
  propertyContext?: Record<string, unknown>;
}

export default function AskTruvi({ propertyContext }: AskTruviProps = {}) {
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
      const reply = await fetchAIReply(text, propertyContext);
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
            Powered by AI · Not a substitute for professional advice
          </p>
        </div>
      </div>
    </>
  );
}
