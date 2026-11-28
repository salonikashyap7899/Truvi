import { FormEvent, useCallback, useEffect, useState } from "react";
import { CheckCheck, MessageCircle, Phone, Send, UserRound } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { useSocketEvent } from "@/lib/socket";

type Conversation = {
  _id: string;
  visitorName: string;
  visitorEmail: string;
  visitorPhone: string;
  topic: string;
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

export default function AdminInvestorChatsPanel() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const loadConversations = useCallback(async (quiet = false) => {
    try {
      const response = await api.get("/investor-chat/admin");
      const rows = (response.data?.conversations ?? []) as Conversation[];
      setConversations(rows);
      setSelectedId((current) => current || rows[0]?._id || "");
    } catch (cause: any) {
      if (!quiet) toast.error(cause?.response?.data?.error || "Couldn't load investor conversations.");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  const loadMessages = useCallback(async (id: string, quiet = false) => {
    if (!id) return;
    if (!quiet) setMessagesLoading(true);
    try {
      const response = await api.get("/investor-chat/admin/" + id + "/messages");
      setMessages((response.data?.messages ?? []) as ConversationMessage[]);
    } catch (cause: any) {
      if (!quiet) setError(cause?.response?.data?.error || "Couldn't load this conversation.");
    } finally {
      if (!quiet) setMessagesLoading(false);
    }
  }, []);

  useEffect(() => { void loadConversations(); }, [loadConversations]);

  useEffect(() => {
    const timer = window.setInterval(() => { void loadConversations(true); }, 5000);
    return () => window.clearInterval(timer);
  }, [loadConversations]);

  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      return;
    }
    void loadMessages(selectedId);
    const timer = window.setInterval(() => { void loadMessages(selectedId, true); }, 4000);
    return () => window.clearInterval(timer);
  }, [selectedId, loadMessages]);

  useSocketEvent<{ _id: string; visitorName?: string }>("investor-chat:new", (payload) => {
    void loadConversations(true);
    toast.info("New investor conversation from " + (payload.visitorName || "an investor"));
  });

  useSocketEvent<{ conversationId: string }>("investor-chat:message", (payload) => {
    void loadConversations(true);
    if (payload.conversationId === selectedId) void loadMessages(selectedId, true);
  });

  const selected = conversations.find((item) => item._id === selectedId) ?? null;

  const sendReply = async (event: FormEvent) => {
    event.preventDefault();
    const body = draft.trim();
    if (!body || !selected || selected.status !== "OPEN" || sending) return;
    setSending(true);
    setError("");
    try {
      const response = await api.post("/investor-chat/admin/" + selected._id + "/messages", { message: body });
      setMessages((current) => current.some((item) => item._id === response.data.message._id) ? current : [...current, response.data.message]);
      setDraft("");
      await loadConversations(true);
    } catch (cause: any) {
      setError(cause?.response?.data?.error || "Your reply couldn't be sent.");
    } finally {
      setSending(false);
    }
  };

  const closeConversation = async () => {
    if (!selected || selected.status !== "OPEN") return;
    try {
      await api.patch("/investor-chat/admin/" + selected._id + "/close");
      await loadConversations(true);
      await loadMessages(selected._id, true);
      toast.success("Conversation closed.");
    } catch (cause: any) {
      toast.error(cause?.response?.data?.error || "Couldn't close conversation.");
    }
  };

  return (
    <section className="grid min-h-[620px] overflow-hidden rounded-2xl border border-white/10 bg-[#081321] xl:grid-cols-[340px_minmax(0,1fr)]">
      <aside className="flex min-h-[260px] flex-col border-b border-white/10 xl:border-b-0 xl:border-r">
        <div className="border-b border-white/10 px-5 py-4">
          <p className="text-sm font-semibold text-white">Live investor chats</p>
          <p className="mt-1 text-[11px] text-white/45">Private conversations from Investor Club</p>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <p className="p-5 text-xs text-white/50">Loading conversations…</p>
          ) : conversations.length === 0 ? (
            <div className="px-5 py-12 text-center"><MessageCircle size={25} className="mx-auto text-blue-300/60" /><p className="mt-3 text-xs text-white/55">No investor conversations yet.</p></div>
          ) : conversations.map((item) => (
            <button key={item._id} onClick={() => setSelectedId(item._id)} className={"block w-full border-b border-white/[.07] px-4 py-4 text-left transition " + (selectedId === item._id ? "bg-blue-500/15" : "hover:bg-white/[.04]")}>
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-semibold text-white">{item.visitorName}</span>
                <span className="text-[9px] text-white/40">{new Date(item.lastMessageAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</span>
              </div>
              <p className="mt-1 truncate text-[10px] text-blue-200/75">{item.projectName || item.topic}</p>
              <div className="mt-2 flex items-center justify-between">
                <span className={"rounded-full px-2 py-1 text-[9px] uppercase tracking-wider " + (item.status === "OPEN" ? "bg-emerald-500/10 text-emerald-300" : "bg-white/10 text-white/45")}>{item.status}</span>
                {item.ownerUnread > 0 && <span className="grid min-w-5 place-items-center rounded-full bg-blue-500 px-1.5 py-1 text-[9px] font-bold text-white">{item.ownerUnread}</span>}
              </div>
            </button>
          ))}
        </div>
        <div className="border-t border-white/10 px-4 py-3 text-[9px] text-white/35">Auto-refreshes every 5 seconds</div>
      </aside>

      <div className="flex min-h-[540px] flex-col bg-[#0b1b2d]">
        {!selected ? (
          <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
            <span className="grid size-16 place-items-center rounded-full border border-blue-300/20 bg-blue-400/10 text-blue-200"><MessageCircle size={26} /></span>
            <h3 className="mt-4 font-display text-2xl text-white">Choose a conversation</h3>
            <p className="mt-2 max-w-sm text-xs leading-5 text-white/45">When an investor starts a private dialogue on the public Investor Club page, the conversation will appear here.</p>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-full border border-blue-300/20 bg-blue-400/10 text-blue-100"><UserRound size={17} /></span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">{selected.visitorName}</p>
                  <p className="mt-1 truncate text-[10px] text-white/45">{selected.visitorEmail} · {selected.visitorPhone}</p>
                  <p className="mt-1 truncate text-[10px] text-blue-200/70">{selected.projectName || "General discussion"} · {selected.topic}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <a href={"tel:" + selected.visitorPhone} className="grid size-9 place-items-center rounded-full border border-white/10 text-white/65 hover:bg-white/10" title="Call investor"><Phone size={15} /></a>
                <a href={"mailto:" + selected.visitorEmail} className="grid size-9 place-items-center rounded-full border border-white/10 text-white/65 hover:bg-white/10" title="Email investor"><Send size={14} /></a>
                {selected.status === "OPEN" && <button onClick={closeConversation} className="rounded-full border border-white/15 px-3 py-2 text-[10px] font-semibold text-white/60 hover:bg-white/10">Close chat</button>}
              </div>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto p-4 sm:p-6">
              {messagesLoading && messages.length === 0 ? <p className="text-xs text-white/45">Loading messages…</p> : messages.map((item) => (
                <div key={item._id} className={"flex " + (item.senderRole === "OWNER" ? "justify-end" : "justify-start")}>
                  <div className={"max-w-[88%] rounded-2xl px-4 py-3 " + (item.senderRole === "OWNER" ? "rounded-br-sm border border-blue-400/25 bg-blue-500/15 text-white" : "rounded-bl-sm border border-white/10 bg-white/[.07] text-white/90")}>
                    <p className={"mb-1 text-[9px] font-bold uppercase tracking-[.15em] " + (item.senderRole === "OWNER" ? "text-blue-200" : "text-emerald-200")}>{item.senderRole === "OWNER" ? "You · Truvi Owner" : "Investor · " + item.senderName}</p>
                    <p className="whitespace-pre-wrap break-words text-sm leading-6">{item.body}</p>
                    <p className="mt-2 text-right text-[9px] text-white/35">{new Date(item.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}{item.senderRole === "OWNER" && item.readAt ? " · Read" : ""}</p>
                  </div>
                </div>
              ))}
            </div>
            <form onSubmit={sendReply} className="border-t border-white/10 p-4 sm:p-5">
              {error && <p role="alert" className="mb-2 rounded-lg border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{error}</p>}
              {selected.status === "CLOSED" ? (
                <p className="flex items-center gap-2 text-xs text-white/45"><CheckCheck size={15} /> This conversation is closed. It remains available as a read-only record.</p>
              ) : (
                <div className="flex items-end gap-2">
                  <textarea aria-label="Reply to investor" rows={2} maxLength={4000} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Reply to the investor here…" className="max-h-32 min-h-12 flex-1 resize-y rounded-xl border border-white/10 bg-white/[.06] px-4 py-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-blue-400/50" />
                  <button disabled={!draft.trim() || sending} className="grid size-12 shrink-0 place-items-center rounded-xl bg-blue-500 text-white transition hover:bg-blue-400 disabled:opacity-40" aria-label="Send reply"><Send size={17} /></button>
                </div>
              )}
              <p className="mt-2 text-[9px] text-white/35">Replies are saved to this thread and appear in the investor’s browser automatically.</p>
            </form>
          </>
        )}
      </div>
    </section>
  );
}
