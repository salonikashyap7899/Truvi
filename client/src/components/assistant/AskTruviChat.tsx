import { useEffect, useRef, useState } from "react";
import { create } from "zustand";
import {
  X, Send, User, Sparkles, ChevronRight,
  Search, Scale, Building2, MapPin, Wallet, ShieldCheck, Star, TrendingUp,
  FolderOpen, ClipboardList, AlertTriangle, HelpCircle, Info, FileWarning, type LucideIcon,
} from "lucide-react";
import { api } from "@/lib/api";

/* ============================================================
   Ask Truvi AI — Real Estate Decision Intelligence Assistant
   Implements the 15-feature spec: source-backed answers,
   red-flag language, follow-up intelligence, comparisons,
   personalized advisory, verification explanation, and more.

   The conversation lives in one shared store, so the floating
   pop-up and the full-page /ask-truvi chat are the same chat —
   expanding to full page (or minimising) never loses it.
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

export interface AdvisorProfile {
  budget: string;
  city: string;
  bhk: string;
  purpose: string;
  timeline: string;
}

const EMPTY_PROFILE: AdvisorProfile = { budget: "", city: "", bhk: "", purpose: "", timeline: "" };
const PROFILE_KEY = "truvi-advisor-profile";

/* ---- Source Labeling System (spec p.16) ---- */
const SOURCE_META: Record<string, { Icon: LucideIcon; name: string; cls: string }> = {
  TRUVI_VERIFIED: { Icon: ShieldCheck, name: "Truvi Verified", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-400/20" },
  PUBLIC_RECORD: { Icon: FolderOpen, name: "Public Record", cls: "bg-sky-500/15 text-sky-300 border-sky-400/20" },
  BUILDER_SUBMITTED: { Icon: ClipboardList, name: "Builder Submitted", cls: "bg-amber-500/15 text-amber-300 border-amber-400/20" },
  USER_SUBMITTED: { Icon: User, name: "User Submitted", cls: "bg-violet-500/15 text-violet-300 border-violet-400/20" },
};

/* ---- Red Flag & Attention Points (spec feature 11) ---- */
const FLAG_META: Record<string, { Icon: LucideIcon; name: string; cls: string }> = {
  ATTENTION_REQUIRED: { Icon: AlertTriangle, name: "Attention Required", cls: "border-amber-400/30 bg-amber-500/10 text-amber-200" },
  DATA_UNAVAILABLE: { Icon: HelpCircle, name: "Data Unavailable", cls: "border-white/15 bg-white/5 text-foreground/80" },
  NEEDS_VERIFICATION: { Icon: Search, name: "Needs Verification", cls: "border-sky-400/30 bg-sky-500/10 text-sky-200" },
  INFORMATION_MISMATCH: { Icon: FileWarning, name: "Information Mismatch", cls: "border-red-400/30 bg-red-500/10 text-red-200" },
};

/* ---- Quick-start intents covering the core features ---- */
const QUICK_ACTIONS: { Icon: LucideIcon; label: string; q: string; autosend: boolean }[] = [
  { Icon: Search, label: "About a project", q: "Tell me about ", autosend: false },
  { Icon: Scale, label: "Compare projects", q: "Compare  vs ", autosend: false },
  { Icon: Building2, label: "Builder track record", q: "Show the builder profile and track record for ", autosend: false },
  { Icon: MapPin, label: "Location check", q: "Is this location good for buying? Area: ", autosend: false },
  { Icon: Wallet, label: "Match my budget", q: "₹70 lakh budget, 3BHK — which projects match?", autosend: true },
  { Icon: ShieldCheck, label: "How Truvi verifies", q: "How does Truvi verify projects?", autosend: true },
  { Icon: Star, label: "Explain a trust score", q: "Why is the trust score what it is for ", autosend: false },
  { Icon: TrendingUp, label: "Invest or self-use?", q: "Is this better for self-use or investment? Project: ", autosend: false },
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

export function profileIsSet(p: AdvisorProfile) {
  return Boolean(p.budget || p.city || p.bhk || p.purpose || p.timeline);
}

/* ---- Rich text: **bold**, headings, bullets, clean line breaks ----
   Renders the assistant's reply as tidy, professional text. It also degrades
   gracefully if the model slips in markdown: `#`/`##` become bold headings,
   `-`/`*` become • bullets, and markdown table pipe-rows / separator rows are
   dropped instead of shown as raw `| a | b |`. */
function Inline({ text }: { text: string }) {
  return (
    <>
      {text.split(/\*\*(.*?)\*\*/g).map((part, j) =>
        j % 2 === 1 ? <strong key={j} className="font-semibold text-white">{part}</strong> : <span key={j}>{part}</span>,
      )}
    </>
  );
}

function RichText({ text }: { text: string }) {
  const lines = (text ?? "").replace(/\r/g, "").split("\n");
  const out: React.ReactNode[] = [];
  lines.forEach((raw, i) => {
    const line = raw.trimEnd();
    // Drop markdown table separator rows like |---|---| entirely.
    if (/^\s*\|?\s*:?-{2,}.*\|/.test(line)) return;
    // A markdown table data row → render its cells as a simple " · " list.
    if (/^\s*\|.*\|\s*$/.test(line)) {
      const cells = line.replace(/^\s*\||\|\s*$/g, "").split("|").map((c) => c.trim()).filter(Boolean);
      if (cells.length) out.push(<div key={i} className="text-foreground/90"><Inline text={cells.join(" · ")} /></div>);
      return;
    }
    // Headings
    const h = line.match(/^#{1,3}\s+(.*)$/);
    if (h) {
      out.push(<div key={i} className="mt-2 mb-0.5 font-semibold text-white"><Inline text={h[1]} /></div>);
      return;
    }
    // Bullets
    const b = line.match(/^\s*[-*•]\s+(.*)$/);
    if (b) {
      out.push(
        <div key={i} className="flex gap-1.5 pl-1"><span className="text-[var(--trust)]">•</span><span><Inline text={b[1]} /></span></div>,
      );
      return;
    }
    if (line === "") { out.push(<div key={i} className="h-1.5" />); return; }
    out.push(<div key={i}><Inline text={line} /></div>);
  });
  return <div className="space-y-0.5">{out}</div>;
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
        const meta = SOURCE_META[s.label] ?? { Icon: Info, name: s.label, cls: "bg-white/10 text-foreground/80 border-white/15" };
        return (
          <span
            key={i}
            title={s.detail || meta.name}
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${meta.cls}`}
          >
            <meta.Icon size={11} className="shrink-0" />
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
            <span className="inline-flex items-center gap-1.5 font-semibold"><meta.Icon size={12} className="shrink-0" /> {meta.name}</span>
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
export function AdvisorPanel({
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
    <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs">
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

/* ---- Shared conversation state (pop-up + full page) ---- */
const GREETING: Message = {
  id: uid(),
  role: "ai",
  text:
    "Hello, I'm **Ask Truvi AI** — your Real Estate Decision Intelligence Assistant.\nAsk about projects, builders, locations, verification data and property decisions — every answer is **source-backed** by Truvi's verified data ecosystem.",
  ts: Date.now(),
  followUps: ["How does Truvi verify projects?", "₹70 lakh budget, 3BHK — which projects match?"],
};

interface AskTruviState {
  messages: Message[];
  loading: boolean;
  profile: AdvisorProfile;
  setProfile: (p: AdvisorProfile) => void;
  send: (text: string, propertyContext?: Record<string, unknown>) => Promise<void>;
}

export const useAskTruviChat = create<AskTruviState>((set, get) => ({
  messages: [GREETING],
  loading: false,
  profile: loadProfile(),
  setProfile: (profile) => {
    set({ profile });
    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    } catch { /* ignore */ }
  },
  send: async (raw, propertyContext) => {
    const text = raw.trim();
    const { loading, messages, profile } = get();
    if (!text || loading) return;
    const userMsg: Message = { id: uid(), role: "user", text, ts: Date.now() };
    set({ messages: [...messages, userMsg], loading: true });
    try {
      const history = [...messages, userMsg].slice(-9, -1).map((m) => ({ role: m.role, text: m.text }));
      const advisorProfile = profileIsSet(profile)
        ? Object.fromEntries(Object.entries(profile).filter(([, v]) => v))
        : undefined;
      const data = await askTruvi(text, history, propertyContext, advisorProfile);
      set((s) => ({
        messages: [
          ...s.messages,
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
        ],
      }));
    } finally {
      set({ loading: false });
    }
  },
}));

/** Sign-in prompt shown to guests (Ask Truvi is member-only). */
export function AskTruviSignInGate() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 py-10 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-blue-400/25 bg-blue-500/10">
        <Sparkles size={20} className="text-blue-300" />
      </div>
      <p className="text-base font-semibold text-white">Sign in to use Ask Truvi</p>
      <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
        Create a free account to get source-backed property intelligence, verified project data and personalized advice.
      </p>
      <div className="mt-2 flex w-full max-w-xs flex-col gap-2">
        <a
          href="/login"
          className="w-full rounded-full bg-gradient-to-r from-[#dbeafe] to-white py-2.5 text-center text-sm font-semibold text-[#0a0d14] transition-all hover:shadow-[0_0_24px_rgba(219,234,254,0.3)]"
        >
          Sign in
        </a>
        <a
          href="/signup"
          className="w-full rounded-full border border-white/15 py-2.5 text-center text-sm text-white transition hover:bg-white/10"
        >
          Create a free account
        </a>
      </div>
    </div>
  );
}

/**
 * The Ask Truvi conversation: messages, follow-ups, quick-start actions and
 * the input bar. Used by the floating pop-up and the full-page chat (`size`
 * only changes spacing and the width of the message column).
 */
export function AskTruviChat({
  propertyContext,
  showAdvisor,
  onCloseAdvisor,
  autoFocus,
  size = "panel",
  footerAction,
}: {
  propertyContext?: Record<string, unknown>;
  showAdvisor: boolean;
  onCloseAdvisor: () => void;
  autoFocus?: boolean;
  size?: "panel" | "page";
  /** Shown at the right of the footer line (e.g. "Open full chat"). */
  footerAction?: React.ReactNode;
}) {
  const { messages, loading, profile, setProfile, send } = useAskTruviChat();
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const page = size === "page";

  // Follow the conversation as it grows; a fresh chat stays at the top so the
  // greeting is read from its first line.
  useEffect(() => {
    if (messages.length > 1 || loading) bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, loading]);

  useEffect(() => {
    if (autoFocus) setTimeout(() => inputRef.current?.focus(), 150);
  }, [autoFocus]);

  const submit = (forced?: string) => {
    const text = forced ?? input;
    if (!text.trim() || loading) return;
    if (forced === undefined) setInput("");
    void send(text, propertyContext);
  };

  const quickAction = (q: string, autosend: boolean) => {
    if (autosend) {
      submit(q);
    } else {
      setInput(q);
      inputRef.current?.focus();
    }
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
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

      {showAdvisor && <AdvisorPanel profile={profile} onChange={setProfile} onClose={onCloseAdvisor} />}

      {/* Messages — same bubbles as the home-page "Ask Truvi" card. min-h-0
          lets this flex child scroll inside the card instead of growing and
          pushing the input off-screen. */}
      <div className="-mx-1 flex-1 min-h-0 overflow-y-auto overscroll-contain px-1 pt-5 pb-4">
        <div className="space-y-4">
          {messages.map((msg) => (
            <div key={msg.id}>
              <div className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed
                    ${msg.role === "ai" ? "max-w-[92%] bg-white/10 text-foreground rounded-bl-sm" : "max-w-[85%] bg-[var(--trust)] text-white rounded-br-sm"}`}
                >
                  <RichText text={msg.text} />
                  {msg.comparison && <ComparisonTable comparison={msg.comparison} />}
                  {msg.flags && <FlagCallouts flags={msg.flags} />}
                  {msg.sources && <SourceChips sources={msg.sources} />}
                </div>
              </div>

              {/* Follow-up Intelligence (spec feature 14) */}
              {msg.role === "ai" && !!msg.followUps?.length && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {msg.followUps.map((f, i) => (
                    <button
                      key={i}
                      onClick={() => submit(f)}
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
            <div className={`grid gap-1.5 ${page ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2"}`}>
              {QUICK_ACTIONS.map((a) => (
                <button
                  key={a.label}
                  onClick={() => quickAction(a.q, a.autosend)}
                  className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-left text-[11px] text-foreground/90 transition hover:border-white/20 hover:bg-white/10"
                >
                  <a.Icon size={13} className="shrink-0 text-[var(--trust)]" />
                  {a.label}
                </button>
              ))}
            </div>
          )}

          {loading && (
            <div className="flex justify-start">
              <div className="rounded-2xl rounded-bl-sm bg-white/10 px-1 py-0">
                <TypingDots />
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Footer — like the home card: a divider, then the input and the
          "Not a chatbot" line with an optional action on the right. */}
      <div className="shrink-0 border-t border-white/10 pt-4">
        <div>
          <div className="flex items-center gap-2 rounded-xl border border-white/15 glass px-3 py-2 focus-within:border-[var(--trust)] transition-colors">
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
              onClick={() => submit()}
              disabled={!input.trim() || loading}
              className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--trust)] text-white transition hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
              aria-label="Send"
            >
              <Send size={13} />
            </button>
          </div>
          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="min-w-0 flex-1 text-[11px] text-muted-foreground">
              Not a chatbot — a property-intelligence assistant grounded in Truvi's data.
            </p>
            {footerAction}
          </div>
        </div>
      </div>
    </>
  );
}
