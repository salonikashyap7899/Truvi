import { useState, useRef, useEffect, useCallback } from "react";
import {
  X, Send, Bot, User, Sparkles, SlidersHorizontal, ChevronRight,
} from "lucide-react";
import { api } from "@/lib/api";

/* ============================================================
   Ask Truvi AI — Real Estate Decision Intelligence Assistant
   Implements the 15-feature spec: source-backed answers,
   red-flag language, follow-up intelligence, comparisons,
   personalized advisory, verification explanation, and more.
   ============================================================ */

interface Source {
  label: string;
  detail?: string;
  lastUpdated?: string | null;
}
interface Flag {
  type: string;
  note?: string;
}
interface Comparison {
  headers: string[];
  rows: string[][];
}
interface Message {
  id: string;
  role: "user" | "ai";
  text: string;
  ts: number;
  sources?: Source[];
  flags?: Flag[];
  followUps?: string[];
  comparison?: Comparison | null;
}

interface AdvisorProfile {
  budget: string;
  city: string;
  bhk: string;
  purpose: string;
  timeline: string;
}

const EMPTY_PROFILE: AdvisorProfile = { budget: "", city: "", bhk: "", purpose: "", timeline: "" };
const PROFILE_KEY = "truvi-advisor-profile";

/* ---- Source Labeling System (spec p.16) ---- */
const SOURCE_META: Record<string, { icon: string; name: string; cls: string }> = {
  TRUVI_VERIFIED: { icon: "✅", name: "Truvi Verified", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-400/20" },
  PUBLIC_RECORD: { icon: "📂", name: "Public Record", cls: "bg-sky-500/15 text-sky-300 border-sky-400/20" },
  BUILDER_SUBMITTED: { icon: "📋", name: "Builder Submitted", cls: "bg-amber-500/15 text-amber-300 border-amber-400/20" },
  USER_SUBMITTED: { icon: "👤", name: "User Submitted", cls: "bg-violet-500/15 text-violet-300 border-violet-400/20" },
};

/* ---- Red Flag & Attention Points (spec feature 11) ---- */
const FLAG_META: Record<string, { icon: string; name: string; cls: string }> = {
  ATTENTION_REQUIRED: { icon: "⚠️", name: "Attention Required", cls: "border-amber-400/30 bg-amber-500/10 text-amber-200" },
  DATA_UNAVAILABLE: { icon: "❓", name: "Data Unavailable", cls: "border-white/15 bg-white/5 text-foreground/80" },
  NEEDS_VERIFICATION: { icon: "🔍", name: "Needs Verification", cls: "border-sky-400/30 bg-sky-500/10 text-sky-200" },
  INFORMATION_MISMATCH: { icon: "📋", name: "Information Mismatch", cls: "border-red-400/30 bg-red-500/10 text-red-200" },
};

/* ---- Quick-start intents covering the core features ---- */
const QUICK_ACTIONS: { icon: string; label: string; q: string; autosend: boolean }[] = [
  { icon: "🔍", label: "About a project", q: "Tell me about ", autosend: false },
  { icon: "⚖️", label: "Compare projects", q: "Compare  vs ", autosend: false },
  { icon: "🏗️", label: "Builder track record", q: "Show the builder profile and track record for ", autosend: false },
  { icon: "📍", label: "Location check", q: "Is this location good for buying? Area: ", autosend: false },
  { icon: "💰", label: "Match my budget", q: "₹70 lakh budget, 3BHK — which projects match?", autosend: true },
  { icon: "✅", label: "How Truvi verifies", q: "How does Truvi verify projects?", autosend: true },
  { icon: "⭐", label: "Explain a trust score", q: "Why is the trust score what it is for ", autosend: false },
  { icon: "📈", label: "Invest or self-use?", q: "Self-use ya investment ke liye better hai? Project: ", autosend: false },
];

let msgCounter = 0;
function uid() {
  return `msg-${Date.now()}-${++msgCounter}`;
}

function loadProfile(): AdvisorProfile {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (raw) return { ...EMPTY_PROFILE, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return EMPTY_PROFILE;
}

function profileIsSet(p: AdvisorProfile) {
  return Boolean(p.budget || p.city || p.bhk || p.purpose || p.timeline);
}

/* ---- Minimal rich text: **bold** + newlines ---- */
function RichText({ text }: { text: string }) {
  return (
    <>
      {text.split("\n").map((line, i) => (
        <span key={i}>
          {i > 0 && <br />}
          {line.split(/\*\*(.*?)\*\*/g).map((part, j) =>
            j % 2 === 1 ? (
              <strong key={j} className="font-semibold text-white">{part}</strong>
            ) : (
              part
            ),
          )}
        </span>
      ))}
    </>
  );
}

interface AiPayload {
  reply: string;
  sources?: Source[];
  flags?: Flag[];
  followUps?: string[];
  comparison?: Comparison | null;
}

async function askTruvi(
  message: string,
  history: { role: "user" | "ai"; text: string }[],
  propertyContext?: Record<string, unknown>,
  advisorProfile?: Partial<AdvisorProfile>,
): Promise<AiPayload> {
  try {
    const res = await api.post("/ai/chat", { message, history, propertyContext, advisorProfile });
    return res.data as AiPayload;
  } catch (err: unknown) {
    const axiosErr = err as { response?: { data?: { reply?: string } } };
    return { reply: axiosErr?.response?.data?.reply ?? "I'm having trouble connecting right now. Please try again in a moment." };
  }
}

function TypingDots() {
  return (
    <div className="flex items-center gap-1 px-4 py-3">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-2 w-2 rounded-full bg-blue-400 opacity-80"
          style={{ animation: `truvi-bounce 1.2s ease-in-out ${i * 0.2}s infinite` }}
        />
      ))}
    </div>
  );
}

/* ---- Source-Backed Answers strip (spec feature 15) ---- */
function SourceChips({ sources }: { sources: Source[] }) {
  if (!sources.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {sources.map((s, i) => {
        const meta = SOURCE_META[s.label] ?? { icon: "ℹ️", name: s.label, cls: "bg-white/10 text-foreground/80 border-white/15" };
        return (
          <span
            key={i}
            title={s.detail || meta.name}
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${meta.cls}`}
          >
            <span aria-hidden>{meta.icon}</span>
            {meta.name}
            {s.lastUpdated && <span className="opacity-70">· {s.lastUpdated}</span>}
          </span>
        );
      })}
    </div>
  );
}

/* ---- Red Flag callouts (spec feature 11) ---- */
function FlagCallouts({ flags }: { flags: Flag[] }) {
  if (!flags.length) return null;
  return (
    <div className="mt-2 space-y-1.5">
      {flags.map((f, i) => {
        const meta = FLAG_META[f.type] ?? FLAG_META.ATTENTION_REQUIRED;
        return (
          <div key={i} className={`rounded-lg border px-2.5 py-1.5 text-[11px] leading-snug ${meta.cls}`}>
            <span className="font-semibold">{meta.icon} {meta.name}</span>
            {f.note && <span className="opacity-90"> — {f.note}</span>}
          </div>
        );
      })}
    </div>
  );
}

/* ---- Side-by-side comparison table (spec feature 2) ---- */
function ComparisonTable({ comparison }: { comparison: Comparison }) {
  if (!comparison.headers?.length || !comparison.rows?.length) return null;
  return (
    <div className="mt-2 overflow-x-auto rounded-lg border border-white/10">
      <table className="w-full min-w-[300px] text-left text-[11px]">
        <thead>
          <tr className="border-b border-white/10 bg-white/5">
            {comparison.headers.map((h, i) => (
              <th key={i} className="px-2.5 py-1.5 font-semibold text-white">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {comparison.rows.map((row, i) => (
            <tr key={i} className="border-b border-white/5 last:border-0">
              {row.map((cell, j) => (
                <td key={j} className={`px-2.5 py-1.5 ${j === 0 ? "font-medium text-foreground/90" : "text-muted-foreground"}`}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---- Personalized Property Advisor profile (spec feature 13) ---- */
function AdvisorPanel({
  profile,
  onChange,
  onClose,
}: {
  profile: AdvisorProfile;
  onChange: (p: AdvisorProfile) => void;
  onClose: () => void;
}) {
  const field = "h-8 w-full rounded-lg border border-white/10 bg-white/[0.05] px-2 text-xs text-white outline-none focus:border-[var(--trust)]";
  return (
    <div className="border-b border-white/10 bg-white/[0.03] px-4 py-3 text-xs">
      <div className="mb-2 flex items-center justify-between">
        <p className="font-semibold text-white">Personalize my advice</p>
        <button onClick={onClose} className="text-muted-foreground hover:text-white" aria-label="Close personalization">
          <X size={13} />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input className={field} placeholder="Budget (e.g. ₹70 lakh)" value={profile.budget}
          onChange={(e) => onChange({ ...profile, budget: e.target.value })} />
        <input className={field} placeholder="Preferred city / area" value={profile.city}
          onChange={(e) => onChange({ ...profile, city: e.target.value })} />
        <select className={field} value={profile.bhk} onChange={(e) => onChange({ ...profile, bhk: e.target.value })}>
          <option value="">Unit size</option>
          <option>1BHK</option><option>2BHK</option><option>3BHK</option><option>4BHK+</option>
        </select>
        <select className={field} value={profile.purpose} onChange={(e) => onChange({ ...profile, purpose: e.target.value })}>
          <option value="">Purpose</option>
          <option>Self-use</option><option>Investment</option><option>Rental income</option><option>NRI investment</option><option>First-time buyer</option>
        </select>
        <select className={`${field} col-span-2`} value={profile.timeline} onChange={(e) => onChange({ ...profile, timeline: e.target.value })}>
          <option value="">Possession timeline</option>
          <option>Ready to move</option><option>Within 1 year</option><option>1–3 years</option><option>Flexible</option>
        </select>
      </div>
      <p className="mt-2 text-[10px] text-muted-foreground">
        Saved on this device and shared with Ask Truvi AI so every answer fits your needs.
      </p>
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
      text:
        "Namaste! 👋 I'm **Ask Truvi AI** — your Real Estate Decision Intelligence Assistant.\nAsk about projects, builders, locations, verification data and property decisions — every answer is **source-backed** by Truvi's verified data ecosystem.\nHindi ya Hinglish mein bhi pooch sakte hain!",
      ts: Date.now(),
      followUps: ["How does Truvi verify projects?", "₹70 lakh budget, 3BHK — which projects match?"],
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showAdvisor, setShowAdvisor] = useState(false);
  const [profile, setProfile] = useState<AdvisorProfile>(() => loadProfile());
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 150);
  }, [open]);

  // Landing page CTAs (and any other component) can open the assistant
  useEffect(() => {
    const openHandler = () => setOpen(true);
    window.addEventListener("open-ask-truvi", openHandler);
    return () => window.removeEventListener("open-ask-truvi", openHandler);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    } catch { /* ignore */ }
  }, [profile]);

  const send = useCallback(
    async (forced?: string) => {
      const text = (forced ?? input).trim();
      if (!text || loading) return;
      setInput("");
      const userMsg: Message = { id: uid(), role: "user", text, ts: Date.now() };
      setMessages((prev) => [...prev, userMsg]);
      setLoading(true);
      try {
        const history = [...messages, userMsg]
          .slice(-9, -1)
          .map((m) => ({ role: m.role, text: m.text }));
        const advisorProfile = profileIsSet(profile)
          ? Object.fromEntries(Object.entries(profile).filter(([, v]) => v))
          : undefined;
        const data = await askTruvi(text, history, propertyContext, advisorProfile);
        setMessages((prev) => [
          ...prev,
          {
            id: uid(),
            role: "ai",
            text: data.reply,
            ts: Date.now(),
            sources: Array.isArray(data.sources) ? data.sources : [],
            flags: Array.isArray(data.flags) ? data.flags : [],
            followUps: Array.isArray(data.followUps) ? data.followUps : [],
            comparison: data.comparison ?? null,
          },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [input, loading, messages, profile, propertyContext],
  );

  const quickAction = (q: string, autosend: boolean) => {
    if (autosend) {
      void send(q);
    } else {
      setInput(q);
      inputRef.current?.focus();
    }
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  const fresh = messages.length === 1;

  return (
    <>
      <style>{`
        @keyframes truvi-bounce {
          0%, 80%, 100% { transform: translateY(0); }
          40% { transform: translateY(-6px); }
        }
      `}</style>

      {/* The floating launcher was replaced by the WhatsApp contact button
          (WhatsAppFloat); Ask Truvi opens from the navbar buttons, which
          dispatch the "open-ask-truvi" event handled above. */}

      {/* Overlay — mobile only */}
      {open && (
        <div className="fixed inset-0 z-40 bg-black/50 sm:hidden" onClick={() => setOpen(false)} />
      )}

      {/* Panel */}
      <div
        className={`
          fixed z-50 flex flex-col bg-card shadow-2xl shadow-black/60
          transition-all duration-300 ease-out
          bottom-0 left-0 right-0 rounded-t-2xl border-t border-x border-white/10
          sm:bottom-6 sm:right-6 sm:left-auto sm:w-[420px] sm:h-[580px]
          sm:rounded-2xl sm:border sm:border-white/10
          ${open ? "translate-y-0 opacity-100" : "translate-y-full sm:translate-y-8 opacity-0 pointer-events-none"}
        `}
        style={{ maxHeight: "85vh" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 shrink-0">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600/20">
              <Sparkles size={14} className="text-blue-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Ask Truvi AI</p>
              <p className="text-[10px] text-muted-foreground">Decision Intelligence · Source-backed</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowAdvisor((s) => !s)}
              className="relative rounded-lg p-1.5 text-muted-foreground hover:bg-white/10 hover:text-white transition-colors"
              aria-label="Personalize advice"
              title="Personalized Property Advisor"
            >
              <SlidersHorizontal size={15} />
              {profileIsSet(profile) && (
                <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-emerald-400" />
              )}
            </button>
            <button
              onClick={() => setOpen(false)}
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-white/10 hover:text-white transition-colors"
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Personalized advisor profile */}
        {showAdvisor && (
          <AdvisorPanel profile={profile} onChange={setProfile} onClose={() => setShowAdvisor(false)} />
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {messages.map((msg) => (
            <div key={msg.id}>
              <div className={`flex items-end gap-2 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
                <div
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white
                    ${msg.role === "ai" ? "bg-blue-600/30" : "bg-white/15"}`}
                >
                  {msg.role === "ai" ? <Bot size={13} className="text-blue-300" /> : <User size={13} />}
                </div>
                <div
                  className={`max-w-[82%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed
                    ${msg.role === "ai" ? "bg-white/10 text-foreground rounded-bl-sm" : "bg-blue-600 text-white rounded-br-sm"}`}
                >
                  <RichText text={msg.text} />
                  {msg.comparison && <ComparisonTable comparison={msg.comparison} />}
                  {msg.flags && <FlagCallouts flags={msg.flags} />}
                  {msg.sources && <SourceChips sources={msg.sources} />}
                </div>
              </div>

              {/* Follow-up Intelligence (spec feature 14) */}
              {msg.role === "ai" && !!msg.followUps?.length && (
                <div className="ml-9 mt-2 flex flex-wrap gap-1.5">
                  {msg.followUps.map((f, i) => (
                    <button
                      key={i}
                      onClick={() => void send(f)}
                      disabled={loading}
                      className="inline-flex items-center gap-1 rounded-full border border-blue-400/25 bg-blue-500/10 px-2.5 py-1 text-[11px] text-blue-200 transition hover:bg-blue-500/20 disabled:opacity-50"
                    >
                      {f}
                      <ChevronRight size={11} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}

          {/* Quick-start feature grid on a fresh chat */}
          {fresh && !loading && (
            <div className="ml-9 grid grid-cols-2 gap-1.5">
              {QUICK_ACTIONS.map((a) => (
                <button
                  key={a.label}
                  onClick={() => quickAction(a.q, a.autosend)}
                  className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-left text-[11px] text-foreground/90 transition hover:border-white/20 hover:bg-white/10"
                >
                  <span aria-hidden>{a.icon}</span>
                  {a.label}
                </button>
              ))}
            </div>
          )}

          {loading && (
            <div className="flex items-end gap-2">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600/30">
                <Bot size={13} className="text-blue-300" />
              </div>
              <div className="rounded-2xl rounded-bl-sm bg-white/10 px-1 py-0">
                <TypingDots />
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input bar */}
        <div className="shrink-0 border-t border-white/10 px-3 py-3">
          <div className="flex items-center gap-2 rounded-xl border border-white/15 glass px-3 py-2 focus-within:border-blue-600 transition-colors">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKey}
              placeholder="Ask about projects, builders, locations…"
              className="flex-1 bg-transparent text-sm text-white placeholder:text-muted-foreground outline-none"
              disabled={loading}
            />
            <button
              onClick={() => void send()}
              disabled={!input.trim() || loading}
              className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600 text-white transition-colors hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
              aria-label="Send"
            >
              <Send size={13} />
            </button>
          </div>
          <p className="mt-1.5 text-center text-[10px] text-foreground/80">
            Source-backed answers · Not legal or financial advice
          </p>
        </div>
      </div>
    </>
  );
}
