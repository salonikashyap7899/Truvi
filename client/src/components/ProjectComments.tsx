import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { toast } from "sonner";
import { MessageSquare, Send, CornerDownRight, Loader2, User } from "lucide-react";

interface Comment {
  _id: string;
  parentId: string | null;
  body: string;
  createdAt: string;
  userId: string; // short, name-free id like "#A1B2C3"
  role: string | null;
  mine: boolean;
}

/** Deterministic avatar hue from the (already anonymised) user id. */
function avatarHue(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return h;
}

function fmt(dt: string): string {
  const d = new Date(dt);
  return isNaN(d.getTime()) ? "" : d.toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function Avatar({ id }: { id: string }) {
  const hue = avatarHue(id);
  return (
    <span
      className="grid size-8 shrink-0 place-items-center rounded-full text-white/90"
      style={{ background: `linear-gradient(135deg, hsl(${hue} 60% 45%), hsl(${(hue + 40) % 360} 60% 38%))` }}
      title={id}
    >
      <User size={15} />
    </span>
  );
}

function CommentRow({ c, onReply }: { c: Comment; onReply: (id: string) => void }) {
  return (
    <div className="flex gap-3">
      <Avatar id={c.userId} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-white">{c.userId}</span>
          {c.role && <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{c.role}</span>}
          {c.mine && <span className="rounded-full bg-[var(--trust)]/20 px-1.5 py-0.5 text-[10px] font-medium text-sky-300">You</span>}
          <span className="text-[11px] text-muted-foreground">{fmt(c.createdAt)}</span>
        </div>
        <p className="mt-1 whitespace-pre-wrap break-words text-sm text-foreground/90">{c.body}</p>
        <button onClick={() => onReply(c._id)} className="mt-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-white">
          <CornerDownRight size={11} /> Reply
        </button>
      </div>
    </div>
  );
}

export default function ProjectComments({ projectId }: { projectId: string }) {
  const user = useAuthStore((s) => s.user);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    if (!user) {
      setLoaded(true);
      return;
    }
    api
      .get(`/comments/${projectId}`)
      .then((r) => setComments(r.data.comments))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [projectId, user]);

  async function post(text: string, parentId: string | null) {
    const t = text.trim();
    if (!t) return;
    setPosting(true);
    try {
      const res = await api.post(`/comments/${projectId}`, { body: t, parentId: parentId ?? undefined });
      setComments((prev) => [...prev, res.data.comment]);
      if (parentId) {
        setReplyTo(null);
        setReplyBody("");
      } else {
        setBody("");
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Couldn't post comment");
    } finally {
      setPosting(false);
    }
  }

  const top = comments.filter((c) => !c.parentId);
  const repliesOf = (id: string) => comments.filter((c) => c.parentId === id);

  return (
    <section className="mt-8 rounded-2xl border border-white/10 glass p-5">
      <h2 className="flex items-center gap-2 text-lg font-medium text-white">
        <MessageSquare size={18} className="text-sky-400" /> Discussion
        {comments.length > 0 && <span className="text-sm text-muted-foreground">({comments.length})</span>}
      </h2>

      {!user ? (
        <p className="mt-3 text-sm text-muted-foreground">Sign in to view and post comments on this listing.</p>
      ) : (
        <>
          {/* New comment */}
          <div className="mt-4 flex gap-3">
            <Avatar id="you" />
            <div className="flex-1">
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={2}
                placeholder="Add a comment about this property…"
                className="w-full rounded-lg border border-white/10 bg-white/[0.04] p-2.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/60 focus:border-[var(--trust)]"
              />
              <div className="mt-1.5 flex justify-end">
                <button
                  onClick={() => post(body, null)}
                  disabled={posting || !body.trim()}
                  className="inline-flex items-center gap-1.5 rounded-full bg-[var(--trust)] px-4 py-1.5 text-sm font-medium text-white transition hover:bg-[var(--trust)]/85 disabled:opacity-50"
                >
                  {posting ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Post
                </button>
              </div>
            </div>
          </div>

          {/* Thread */}
          <div className="mt-5 space-y-5">
            {!loaded ? (
              <p className="text-sm text-muted-foreground">Loading comments…</p>
            ) : top.length === 0 ? (
              <p className="text-sm text-muted-foreground">No comments yet — start the discussion.</p>
            ) : (
              top.map((c) => (
                <div key={c._id}>
                  <CommentRow c={c} onReply={(id) => setReplyTo(replyTo === id ? null : id)} />

                  {/* Replies */}
                  {repliesOf(c._id).length > 0 && (
                    <div className="ml-11 mt-4 space-y-4 border-l border-white/10 pl-4">
                      {repliesOf(c._id).map((r) => (
                        <CommentRow key={r._id} c={r} onReply={(id) => setReplyTo(replyTo === id ? null : id)} />
                      ))}
                    </div>
                  )}

                  {/* Reply composer */}
                  {replyTo === c._id && (
                    <div className="ml-11 mt-3 flex gap-2 border-l border-white/10 pl-4">
                      <input
                        value={replyBody}
                        onChange={(e) => setReplyBody(e.target.value)}
                        placeholder="Write a reply…"
                        onKeyDown={(e) => e.key === "Enter" && post(replyBody, c._id)}
                        className="h-9 flex-1 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-sm text-foreground outline-none focus:border-[var(--trust)]"
                      />
                      <button
                        onClick={() => post(replyBody, c._id)}
                        disabled={posting || !replyBody.trim()}
                        className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 text-sm text-white hover:bg-white/15 disabled:opacity-50"
                      >
                        {posting ? <Loader2 size={13} className="animate-spin" /> : "Reply"}
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </>
      )}
    </section>
  );
}
