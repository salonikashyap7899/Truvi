import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, CheckCircle2, ChevronRight, LockKeyhole, MessageCircle, Send, ShieldCheck, Sparkles, UserRound } from "lucide-react";
import { api } from "@/lib/api";

type InvestorProject = { _id: string; name: string; city?: string };
type InvestorTopic =
  | "Discuss a specific project"
  | "Explore investment opportunities"
  | "Understand project structure and participation"
  | "Land acquisition or joint venture"
  | "Funding or development partnership"
  | "Arrange a private meeting with the owner";

type Conversation = {
  _id: string;
  visitorName: string;
  visitorEmail: string;
  visitorPhone: string;
  topic: InvestorTopic;
  projectName: string | null;
  status: "OPEN" | "CLOSED";
  ownerUnread: number;
  investorUnread: number;
  lastMessageAt: string;
  createdAt: string;
};

type ConversationMessage = {
  _id: string;
  senderRole: "INVESTOR" | "OWNER";
  senderName: string;
  body: string;
  readAt: string | null;
  createdAt: string;
};

const TOPICS: InvestorTopic[] = [
  "Discuss a specific project",
  "Explore investment opportunities",
  "Understand project structure and participation",
  "Land acquisition or joint venture",
  "Funding or development partnership",
  "Arrange a private meeting with the owner",
];

const INTRO_LINES = [
  "Welcome to Truvi Investor Club. It is good to have you here.",
  "Every investment begins with a conversation. Tell us what you are exploring and we will connect you with the right person at Truvi.",
  "What would you like to discuss with the owner today?",
];

function OwnerCharacter() {
  return (
    <div className="relative mx-auto w-full max-w-[340px] select-none" aria-hidden="true">
      <div className="absolute bottom-3 left-1/2 h-10 w-48 -translate-x-1/2 rounded-[100%] bg-black/35 blur-xl" />
      <svg viewBox="0 0 320 470" className="relative z-10 h-auto w-full drop-shadow-[0_24px_35px_rgba(0,0,0,.45)]">
        <defs>
          <linearGradient id="truvi-owner-suit" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#223d5c" />
            <stop offset=".55" stopColor="#10253b" />
            <stop offset="1" stopColor="#081523" />
          </linearGradient>
          <linearGradient id="truvi-owner-shirt" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="1" stopColor="#cbd9e9" />
          </linearGradient>
          <linearGradient id="truvi-owner-skin" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#f3c9ae" />
            <stop offset="1" stopColor="#bb806b" />
          </linearGradient>
        </defs>
        <ellipse cx="160" cy="445" rx="69" ry="12" fill="#020914" opacity=".45" />
        <path d="M107 409 L115 442 Q160 456 205 442 L213 409 L190 391 L130 391 Z" fill="#07111d" />
        <path d="M111 226 Q77 253 73 339 L86 418 Q160 447 234 418 L247 339 Q243 253 209 226 Q185 210 160 210 Q135 210 111 226Z" fill="url(#truvi-owner-suit)" stroke="#46627d" strokeWidth="2" />
        <path d="M130 218 L160 261 L190 218 L177 205 L143 205Z" fill="url(#truvi-owner-shirt)" />
        <path d="M145 248 L160 266 L175 248 L169 238 L151 238Z" fill="#3b82f6" />
        <path d="M144 260 L160 280 L153 348 L127 280Z" fill="#dce8f4" opacity=".9" />
        <path d="M176 260 L160 280 L168 348 L194 280Z" fill="#dce8f4" opacity=".9" />
        <path d="M127 280 L155 302 L145 408 L105 395 L108 320Z" fill="#17314d" />
        <path d="M193 280 L165 302 L175 408 L215 395 L212 320Z" fill="#132940" />
        <path d="M93 275 Q75 291 67 343 L58 382 Q56 397 70 401 Q83 402 89 385 L110 323Z" fill="url(#truvi-owner-suit)" />
        <path d="M227 275 Q245 291 253 343 L262 382 Q264 397 250 401 Q237 402 231 385 L210 323Z" fill="url(#truvi-owner-suit)" />
        <path d="M63 380 Q53 394 63 408 Q73 420 86 405 L89 388Z" fill="url(#truvi-owner-skin)" />
        <path d="M257 380 Q267 394 257 408 Q247 420 234 405 L231 388Z" fill="url(#truvi-owner-skin)" />
        <path d="M132 190 L129 222 Q160 246 191 222 L188 188Z" fill="url(#truvi-owner-skin)" />
        <path d="M109 106 Q110 46 160 46 Q210 46 211 106 L204 159 Q194 207 160 212 Q126 207 116 159Z" fill="url(#truvi-owner-skin)" stroke="#9e6b60" strokeWidth="1.5" />
        <path d="M109 120 Q89 96 102 61 Q113 22 160 26 Q211 22 220 64 Q229 94 211 122 L202 96 Q185 110 162 104 Q140 101 119 91Z" fill="#182332" />
        <path d="M109 113 Q99 119 104 143 Q110 157 119 147Z" fill="url(#truvi-owner-skin)" />
        <path d="M211 113 Q221 119 216 143 Q210 157 201 147Z" fill="url(#truvi-owner-skin)" />
        <path d="M133 131 Q143 124 151 132" stroke="#392c2c" strokeWidth="3" fill="none" strokeLinecap="round" />
        <path d="M169 132 Q178 124 188 131" stroke="#392c2c" strokeWidth="3" fill="none" strokeLinecap="round" />
        <ellipse cx="143" cy="143" rx="4" ry="3.5" fill="#172331" />
        <ellipse cx="180" cy="143" rx="4" ry="3.5" fill="#172331" />
        <path d="M160 143 L155 164 Q160 169 166 164" stroke="#9e6b60" strokeWidth="2" fill="none" strokeLinecap="round" />
        <path d="M146 180 Q160 190 175 180" stroke="#8f4e50" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        <path d="M138 184 Q160 198 182 184" fill="#a75e5f" opacity=".18" />
        <path d="M114 112 Q123 95 143 98 Q158 105 176 98 Q196 98 207 113" fill="none" stroke="#25374a" strokeWidth="5" strokeLinecap="round" />
        <circle cx="201" cy="270" r="5" fill="#60a5fa" />
        <path d="M201 280 L201 314" stroke="#60a5fa" strokeWidth="2" opacity=".65" />
      </svg>
      <div className="absolute bottom-8 right-5 z-20 flex items-center gap-2 rounded-full border border-white/15 bg-[#0a1b2d]/85 px-3 py-2 text-[10px] font-semibold uppercase tracking-[.16em] text-blue-100 shadow-xl backdrop-blur">
        <span className="size-2 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,.8)]" />
        Truvi host
      </div>
    </div>
  );
}

function SceneDialogue({ children, speaker = "TRUVI OWNER'S DESK" }: { children: React.ReactNode; speaker?: string }) {
  return (
    <div className="relative rounded-2xl border border-white/20 bg-[#f8fafc] px-5 pb-5 pt-7 text-[#172b41] shadow-[0_22px_70px_rgba(0,0,0,.45)] sm:px-7 sm:pb-6">
      <span className="absolute -top-3 left-5 rounded-md border border-blue-300/60 bg-[#1e5cb4] px-4 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[.18em] text-white shadow-lg">{speaker}</span>
      {children}
    </div>
  );
}

export default function InvestorConversationScene({
  projects,
  projectsLoaded,
}: {
  projects: InvestorProject[];
  projectsLoaded: boolean;
}) {
  const [stage, setStage] = useState<"INTRO" | "TOPIC" | "DETAILS" | "CHAT">("INTRO");
  const [introIndex, setIntroIndex] = useState(0);
  const [topic, setTopic] = useState<InvestorTopic>(TOPICS[0]);
  const [form, setForm] = useState({ name: "", email: "", phone: "", projectId: "", message: "" });
  const [privacyAcknowledged, setPrivacyAcknowledged] = useState(false);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const setField = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const loadSession = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const response = await api.get("/investor-chat/session");
      const nextConversation = response.data?.conversation as Conversation | null;
      if (nextConversation) {
        setConversation(nextConversation);
        setMessages((response.data?.messages ?? []) as ConversationMessage[]);
        setStage("CHAT");
      }
    } catch (cause: any) {
      if (!quiet) setError(cause?.response?.data?.error || "We couldn't restore your private conversation.");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => { void loadSession(); }, [loadSession]);

  useEffect(() => {
    if (!conversation) return;
    const poll = window.setInterval(() => { void loadSession(true); }, 4500);
    return () => window.clearInterval(poll);
  }, [conversation?._id, loadSession]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, stage]);

  const startConversation = async (event: FormEvent) => {
    event.preventDefault();
    if (!privacyAcknowledged) {
      setError("Please acknowledge the Privacy Policy before starting the conversation.");
      return;
    }
    if (form.message.trim().length < 2) {
      setError("Write a short opening message so the owner understands what you would like to discuss.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await api.post("/investor-chat/start", {
        ...form,
        topic,
        privacyNoticeAcknowledged: true,
      });
      setConversation(response.data.conversation as Conversation);
      setMessages((response.data.messages ?? []) as ConversationMessage[]);
      setStage("CHAT");
    } catch (cause: any) {
      setError(cause?.response?.data?.error || "Your conversation couldn't be started. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const sendMessage = async (event: FormEvent) => {
    event.preventDefault();
    const body = draft.trim();
    if (!body || !conversation || conversation.status !== "OPEN" || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await api.post("/investor-chat/messages", { message: body });
      setMessages((current) => current.some((item) => item._id === response.data.message._id) ? current : [...current, response.data.message]);
      setDraft("");
      setRefreshing(true);
      await loadSession(true);
      setRefreshing(false);
    } catch (cause: any) {
      setError(cause?.response?.data?.error || "Your message wasn't sent. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const startNewConversation = async () => {
    try {
      await api.post("/investor-chat/session/close");
    } catch {
      // The existing thread may already be closed or its cookie may have expired.
    }
    setConversation(null);
    setMessages([]);
    setForm({ name: "", email: "", phone: "", projectId: "", message: "" });
    setPrivacyAcknowledged(false);
    setStage("INTRO");
    setIntroIndex(0);
    setError("");
    await api.get("/investor-chat/session").catch(() => undefined);
  };

  return (
    <section id="register" className="scroll-mt-24 bg-[#071321] px-4 py-12 text-white sm:px-6 lg:px-8 lg:py-16">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.24em] text-blue-300"><Sparkles size={13} /> Truvi Investor Club · Private dialogue</p>
            <h2 className="mt-2 font-display text-3xl leading-tight tracking-[-.03em] text-white sm:text-4xl">A conversation can open an opportunity.</h2>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[.04] px-3 py-2 text-[10px] uppercase tracking-[.14em] text-white/55">
            <LockKeyhole size={13} className="text-blue-300" /> Private conversation
          </div>
        </div>

        <div className="relative isolate min-h-[720px] overflow-hidden rounded-[2rem] border border-white/15 bg-[#0b1d31] shadow-[0_35px_100px_rgba(0,0,0,.45)] sm:min-h-[760px]">
          <div className="absolute inset-0 -z-20 bg-cover bg-center" style={{ backgroundImage: "url('/images/truvi-projects-dark-bg.jpg')" }} />
          <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#061321]/95 via-[#071b2e]/70 to-[#071321]/50" />
          <div className="absolute inset-0 -z-10 bg-gradient-to-t from-[#061321]/95 via-[#061321]/15 to-[#061321]/35" />
          <div className="absolute inset-0 -z-10 opacity-40 [background-image:radial-gradient(circle_at_72%_22%,rgba(59,130,246,.28),transparent_34%)]" />

          <div className="flex min-h-[720px] flex-col sm:min-h-[760px]">
            <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-[#071321]/55 px-5 py-4 backdrop-blur-md sm:px-8">
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-full border border-blue-300/30 bg-blue-500/15"><img src="/brand/icon-white.png" alt="" className="size-6 object-contain" /></span>
                <div>
                  <p className="text-sm font-semibold tracking-wide text-white">Truvi Owner’s Desk</p>
                  <p className="mt-0.5 text-[9px] uppercase tracking-[.2em] text-blue-200/70">Investor conversation scene</p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-[10px] text-white/55">
                <span className="size-2 rounded-full bg-emerald-400" />
                {conversation ? "Private thread" : "Start a conversation"}
              </div>
            </div>

            {loading ? (
              <div className="flex flex-1 items-center justify-center">
                <div className="flex items-center gap-3 rounded-full border border-white/10 bg-black/30 px-5 py-3 text-xs text-white/70"><span className="size-4 animate-spin rounded-full border-2 border-white/20 border-t-blue-300" /> Restoring your conversation…</div>
              </div>
            ) : stage === "CHAT" && conversation ? (
              <div className="flex flex-1 flex-col">
                <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-3 sm:px-8">
                  <div>
                    <p className="text-sm font-semibold text-white">{conversation.projectName || "General investment discussion"}</p>
                    <p className="mt-1 text-[10px] text-white/50">{conversation.topic} · {conversation.status === "OPEN" ? "Open conversation" : "Closed conversation"}</p>
                  </div>
                  {conversation.status === "CLOSED" && <span className="rounded-full border border-white/15 px-3 py-1 text-[9px] uppercase tracking-wider text-white/50">Closed</span>}
                </div>
                <div className="grid flex-1 items-end gap-4 p-4 md:grid-cols-[minmax(190px,.55fr)_minmax(0,1.45fr)] md:gap-6 md:p-7">
                  <div className="hidden self-end md:block"><OwnerCharacter /><p className="mt-2 text-center text-[10px] uppercase tracking-[.2em] text-white/45">Your conversation with Truvi</p></div>
                  <div className="flex max-h-[480px] min-h-[310px] flex-col rounded-2xl border border-white/15 bg-[#071321]/85 shadow-2xl backdrop-blur-xl">
                    <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3"><MessageCircle size={15} className="text-blue-300" /><span className="text-xs font-semibold text-white">Conversation</span><span className="ml-auto text-[9px] text-white/40">Private · Saved securely</span></div>
                    <div className="flex-1 space-y-3 overflow-y-auto p-4">
                      {messages.map((item) => (
                        <div key={item._id} className={"flex " + (item.senderRole === "INVESTOR" ? "justify-end" : "justify-start")}>
                          <div className={"max-w-[88%] rounded-2xl px-4 py-3 " + (item.senderRole === "INVESTOR" ? "rounded-br-sm border border-blue-400/30 bg-blue-500/20 text-white" : "rounded-bl-sm border border-white/10 bg-white/[.07] text-white/90")}>
                            <p className={"mb-1 text-[9px] font-bold uppercase tracking-[.16em] " + (item.senderRole === "INVESTOR" ? "text-blue-200" : "text-emerald-200")}>{item.senderRole === "INVESTOR" ? "You" : "Truvi Owner · " + item.senderName}</p>
                            <p className="whitespace-pre-wrap break-words text-sm leading-6">{item.body}</p>
                            <p className="mt-2 text-right text-[9px] text-white/40">{new Date(item.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</p>
                          </div>
                        </div>
                      ))}
                      {messages.length === 1 && <div className="rounded-xl border border-blue-300/15 bg-blue-400/[.07] px-4 py-3 text-xs leading-5 text-blue-100/75">Your message is with the Truvi owner’s team. Replies will appear in this conversation; you can leave this page and return on this browser.</div>}
                      <div ref={endRef} />
                    </div>
                    <form onSubmit={sendMessage} className="border-t border-white/10 p-3">
                      {error && <p role="alert" className="mb-2 rounded-lg border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{error}</p>}
                      <div className="flex items-end gap-2">
                        <textarea aria-label="Write a message to Truvi" rows={2} maxLength={4000} disabled={conversation.status !== "OPEN" || busy} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={conversation.status === "OPEN" ? "Write your message…" : "This conversation is closed."} className="max-h-28 min-h-11 flex-1 resize-y rounded-xl border border-white/15 bg-white/[.06] px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/35 focus:border-blue-400/60 disabled:opacity-50" />
                        <button disabled={!draft.trim() || busy || conversation.status !== "OPEN"} className="grid size-11 shrink-0 place-items-center rounded-xl bg-blue-500 text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-40" aria-label="Send message"><Send size={17} /></button>
                      </div>
                      <div className="mt-2 flex items-center justify-between text-[9px] text-white/35"><span>{refreshing ? "Updating…" : "Messages refresh automatically"}</span><span>{draft.length}/4000</span></div>
                    </form>
                  </div>
                </div>
                {conversation.status === "CLOSED" && <div className="px-5 pb-5 text-center"><button onClick={startNewConversation} className="rounded-full border border-blue-300/30 px-5 py-2.5 text-xs font-semibold text-blue-100 hover:bg-blue-400/10">Start a new conversation</button></div>}
              </div>
            ) : (
              <div className="grid flex-1 items-center gap-3 px-4 pb-5 pt-2 md:grid-cols-[.85fr_1.15fr] md:px-10 md:pb-8">
                <div className="relative hidden h-full items-end justify-center md:flex"><OwnerCharacter /><div className="absolute bottom-2 left-1/2 -z-0 h-20 w-56 -translate-x-1/2 rounded-full bg-blue-500/20 blur-3xl" /></div>
                <div className="flex flex-col justify-center gap-4">
                  {stage === "INTRO" && (
                    <>
                      <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[.22em] text-blue-200"><Sparkles size={13} /> A private introduction</div>
                      <SceneDialogue>
                        <p className="min-h-24 font-display text-xl leading-8 text-[#172b41] sm:text-2xl">{INTRO_LINES[introIndex]}</p>
                        <div className="mt-5 flex items-center justify-between">
                          <span className="text-[9px] font-semibold uppercase tracking-[.16em] text-slate-400">Dialogue {introIndex + 1} / {INTRO_LINES.length}</span>
                          <button onClick={() => introIndex < INTRO_LINES.length - 1 ? setIntroIndex((value) => value + 1) : setStage("TOPIC")} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#2469c7] px-5 text-sm font-semibold text-white shadow-lg transition hover:bg-[#1d57a7]">{introIndex < INTRO_LINES.length - 1 ? "Next" : "Choose a topic"} <ChevronRight size={17} /></button>
                        </div>
                      </SceneDialogue>
                    </>
                  )}

                  {stage === "TOPIC" && (
                    <>
                      <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[.22em] text-blue-200"><MessageCircle size={13} /> Choose your response</div>
                      <SceneDialogue>
                        <p className="font-display text-xl leading-8 text-[#172b41] sm:text-2xl">What would you like to explore with the Truvi owner?</p>
                        <div className="mt-5 grid gap-2 sm:grid-cols-2">
                          {TOPICS.map((item) => <button key={item} onClick={() => setTopic(item)} className={"min-h-12 rounded-xl border px-4 py-3 text-left text-xs font-semibold transition " + (topic === item ? "border-blue-400 bg-blue-50 text-blue-800 shadow-inner" : "border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:bg-blue-50/50")}>{item}</button>)}
                        </div>
                        <div className="mt-5 flex justify-end"><button onClick={() => setStage("DETAILS")} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#2469c7] px-5 text-sm font-semibold text-white transition hover:bg-[#1d57a7]">Continue <ChevronRight size={17} /></button></div>
                      </SceneDialogue>
                    </>
                  )}

                  {stage === "DETAILS" && (
                    <>
                      <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[.22em] text-blue-200"><UserRound size={13} /> Introduce yourself</div>
                      <SceneDialogue speaker="TRUVI OWNER'S DESK · PRIVATE INTRODUCTION">
                        <p className="font-display text-xl leading-7 text-[#172b41]">Let’s make this a real conversation.</p>
                        <p className="mt-1 text-xs leading-5 text-slate-500">Share your contact details and an opening message. The owner can reply in this same private thread.</p>
                        <form onSubmit={startConversation} className="mt-4 grid gap-3 sm:grid-cols-2">
                          <label className="grid gap-1 text-[10px] font-semibold text-slate-600">Your name<input required maxLength={120} value={form.name} onChange={(e) => setField("name", e.target.value)} placeholder="Full name" className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal text-slate-900 outline-none focus:border-blue-400" /></label>
                          <label className="grid gap-1 text-[10px] font-semibold text-slate-600">Mobile number<input required inputMode="tel" maxLength={16} value={form.phone} onChange={(e) => setField("phone", e.target.value)} placeholder="+91 98765 43210" className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal text-slate-900 outline-none focus:border-blue-400" /></label>
                          <label className="grid gap-1 text-[10px] font-semibold text-slate-600 sm:col-span-2">Email address<input required type="email" maxLength={254} value={form.email} onChange={(e) => setField("email", e.target.value)} placeholder="you@example.com" className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal text-slate-900 outline-none focus:border-blue-400" /></label>
                          <label className="grid gap-1 text-[10px] font-semibold text-slate-600 sm:col-span-2">Project you want to discuss<select value={form.projectId} onChange={(e) => setField("projectId", e.target.value)} className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal text-slate-900 outline-none focus:border-blue-400"><option value="">{projectsLoaded ? "General discussion / not sure yet" : "Loading approved projects…"}</option>{projects.map((project) => <option key={project._id} value={project._id}>{project.name}{project.city ? " · " + project.city : ""}</option>)}</select></label>
                          <label className="grid gap-1 text-[10px] font-semibold text-slate-600 sm:col-span-2">Your opening message<textarea required minLength={2} maxLength={4000} rows={3} value={form.message} onChange={(e) => setField("message", e.target.value)} placeholder="Tell the owner what you are considering or what you would like to ask…" className="resize-y rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal text-slate-900 outline-none focus:border-blue-400" /></label>
                          <label className="flex items-start gap-2 text-[10px] leading-5 text-slate-600 sm:col-span-2"><input type="checkbox" checked={privacyAcknowledged} onChange={(e) => setPrivacyAcknowledged(e.target.checked)} className="mt-1 size-4 accent-blue-600" /><span><ShieldCheck size={12} className="mr-1 inline text-blue-600" />I acknowledge the <a href="/privacy-policy" target="_blank" rel="noreferrer" className="font-semibold text-blue-700 underline">Privacy Policy</a> and consent to Truvi using these details to respond to this private conversation.</span></label>
                          {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 sm:col-span-2">{error}</p>}
                          <div className="flex items-center justify-between gap-3 sm:col-span-2">
                            <button type="button" onClick={() => setStage("TOPIC")} className="px-2 py-2 text-xs font-semibold text-slate-500 hover:text-slate-800">Back</button>
                            <button disabled={busy || !privacyAcknowledged} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#2469c7] px-5 text-sm font-semibold text-white transition hover:bg-[#1d57a7] disabled:opacity-50">{busy ? "Connecting…" : "Start private conversation"} <ArrowRight size={16} /></button>
                          </div>
                        </form>
                      </SceneDialogue>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
        <p className="mt-4 flex items-center justify-center gap-2 text-center text-[10px] leading-5 text-white/40"><LockKeyhole size={12} /> Your conversation is private to you and Truvi’s authorised owner/admin team. It is not a public chat room.</p>
      </div>
    </section>
  );
}
