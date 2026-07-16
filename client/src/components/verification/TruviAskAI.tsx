import { useEffect, useRef, useState } from "react";
import { Sparkles, Send, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";

interface Source { category: string; dataKey?: string; label?: string; verified?: boolean }
interface Msg { role: "user" | "assistant"; content: string; sources?: Source[] }

/** RAG chat over verified data. Shows cited sources as chips under each answer. */
export default function TruviAskAI({ projectId }: { projectId?: string }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [sessionId, setSessionId] = useState<string | undefined>();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, busy]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const q = input.trim();
    if (!q || busy) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", content: q }]);
    setBusy(true);
    try {
      const { data } = await api.post("/ask", { question: q, propertyId: projectId, sessionId });
      setSessionId(data.sessionId);
      setMessages((m) => [...m, { role: "assistant", content: data.answer, sources: data.sources ?? [] }]);
    } catch (err: any) {
      setMessages((m) => [...m, { role: "assistant", content: err?.response?.data?.error || "Something went wrong. Please try again." }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-[520px] flex-col rounded-2xl border border-white/10 glass">
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
        <Sparkles size={16} className="text-[var(--trust)]" />
        <span className="font-display text-sm font-semibold">Ask Truvi AI</span>
        <span className="text-[11px] text-muted-foreground">— answers only from verified data, with sources</span>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && (
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Ask about {projectId ? "this property" : "any property"} — e.g. "Is the RERA verified?" or "Any fraud flags?"
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm ${m.role === "user" ? "bg-[var(--trust)] text-white" : "border border-white/10 bg-white/[0.03] text-foreground/90"}`}>
              <p className="whitespace-pre-wrap">{m.content}</p>
              {m.sources && m.sources.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {m.sources.slice(0, 8).map((s, j) => (
                    <span key={j} className="rounded-full border border-white/12 bg-black/20 px-2 py-0.5 text-[10px] text-foreground/70">
                      {s.category}{s.label ? ` · ${s.label}` : ""}{s.verified ? " ✓" : ""}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {busy && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 size={13} className="animate-spin" /> Truvi is thinking…</div>}
        <div ref={endRef} />
      </div>

      <form onSubmit={send} className="flex items-center gap-2 border-t border-white/10 p-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question…"
          className="flex-1 rounded-full border border-white/15 bg-card px-4 py-2 text-sm text-white outline-none focus:border-[var(--trust)]"
        />
        <Button type="submit" disabled={busy || !input.trim()} size="sm" className="rounded-full">
          <Send size={15} />
        </Button>
      </form>
    </div>
  );
}
