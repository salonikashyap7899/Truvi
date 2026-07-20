import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/store/authStore";
import { toast } from "sonner";
import { ArrowLeft, Heart, Send, Users, Flame, Trophy, Sparkles } from "lucide-react";
import { formatDate } from "@/lib/utils";

type PostCategory =
  | "ALL" | "ANNOUNCEMENT" | "DISCUSSION" | "TIP" | "MARKET_UPDATE"
  | "PROJECT_LAUNCH" | "HOT_DEAL" | "BUYER_REQUIREMENT" | "SUCCESS_STORY" | "ASK_COMMUNITY";
type Composable = Exclude<PostCategory, "ALL">;

interface Post {
  _id: string;
  authorName: string;
  authorRole: string;
  content: string;
  category: string;
  likes: number;
  likedBy: string[];
  createdAt: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  ANNOUNCEMENT: "📢 Announcement",
  DISCUSSION: "💬 Discussion",
  TIP: "💡 Sales Tip",
  MARKET_UPDATE: "📈 Market Update",
  PROJECT_LAUNCH: "🏗 Project Launch",
  HOT_DEAL: "🔥 Hot Deal",
  BUYER_REQUIREMENT: "🤝 Buyer Requirement",
  SUCCESS_STORY: "🎉 Success Story",
  ASK_COMMUNITY: "❓ Ask Community",
};

const CATEGORY_COLORS: Record<string, string> = {
  ANNOUNCEMENT: "bg-blue-900/40 text-blue-300 border-blue-800",
  DISCUSSION: "bg-white/10 text-foreground/90 border-white/15",
  TIP: "bg-yellow-900/40 text-yellow-300 border-yellow-800",
  MARKET_UPDATE: "bg-green-900/40 text-green-300 border-green-800",
  PROJECT_LAUNCH: "bg-purple-900/40 text-purple-300 border-purple-800",
  HOT_DEAL: "bg-rose-900/40 text-rose-300 border-rose-800",
  BUYER_REQUIREMENT: "bg-sky-900/40 text-sky-300 border-sky-800",
  SUCCESS_STORY: "bg-emerald-900/40 text-emerald-300 border-emerald-800",
  ASK_COMMUNITY: "bg-amber-900/40 text-amber-300 border-amber-800",
};

const ROLE_BADGE: Record<string, string> = {
  CP: "bg-purple-900/40 text-purple-300",
  DEVELOPER: "bg-blue-900/40 text-blue-300",
  ADMIN: "bg-red-900/40 text-red-300",
};

// Composer scaffolds — labelled starters (not sample content), one click to fill.
const TEMPLATES: { label: string; category: Composable; scaffold: string }[] = [
  { label: "🤝 Buyer Requirement", category: "BUYER_REQUIREMENT", scaffold: "Looking for:\nBudget:\nPreferred location:\nConfiguration:\nTimeline:" },
  { label: "🏗 Project Launch", category: "PROJECT_LAUNCH", scaffold: "Project:\nLocation:\nInventory:\nKey highlights:\nCommission for CPs:" },
  { label: "🔥 Hot Deal", category: "HOT_DEAL", scaffold: "Deal:\nProject:\nOffer / price:\nUnits left:\nValid till:" },
  { label: "🎉 Success Story", category: "SUCCESS_STORY", scaffold: "What closed:\nProject:\nHow Truvi helped:" },
  { label: "📈 Market Update", category: "MARKET_UPDATE", scaffold: "Location:\nTrend I'm seeing:\nWhat's your view?" },
];

export default function TruviConnectPage() {
  const user = useAuthStore((s) => s.user);
  const [posts, setPosts] = useState<Post[]>([]);
  const [filter, setFilter] = useState<PostCategory>("ALL");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState<Composable>("DISCUSSION");
  const [posting, setPosting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set());

  async function loadPosts(cat: PostCategory = filter) {
    try {
      const res = await api.get("/connect/posts", { params: cat !== "ALL" ? { category: cat } : {} });
      const fetchedPosts: Post[] = res.data.posts;
      setPosts(fetchedPosts);
      if (user) {
        const liked = new Set(fetchedPosts.filter((p) => p.likedBy?.includes(user._id)).map((p) => p._id));
        setLikedPosts(liked);
      }
    } catch { toast.error("Failed to load posts"); }
    finally { setLoading(false); }
  }

  useEffect(() => { loadPosts(); }, [filter]);

  async function submitPost() {
    if (!content.trim()) return;
    setPosting(true);
    try {
      await api.post("/connect/posts", { content, category, authorName: user?.name || "User" });
      setContent("");
      toast.success("Post shared!");
      loadPosts();
    } catch { toast.error("Failed to post"); }
    finally { setPosting(false); }
  }

  async function toggleLike(postId: string) {
    try {
      const res = await api.post(`/connect/posts/${postId}/like`);
      setPosts((prev) => prev.map((p) => p._id === postId ? { ...p, likes: res.data.likes } : p));
      setLikedPosts((prev) => {
        const next = new Set(prev);
        if (res.data.liked) next.add(postId); else next.delete(postId);
        return next;
      });
    } catch { toast.error("Failed to like post"); }
  }

  function applyTemplate(t: { category: Composable; scaffold: string }) {
    setCategory(t.category);
    setContent((c) => (c.trim() ? c + "\n\n" : "") + t.scaffold);
  }

  const FILTERS: PostCategory[] = [
    "ALL", "ANNOUNCEMENT", "PROJECT_LAUNCH", "HOT_DEAL", "BUYER_REQUIREMENT",
    "MARKET_UPDATE", "TIP", "SUCCESS_STORY", "DISCUSSION", "ASK_COMMUNITY",
  ];

  // Live community insights derived from real posts.
  const contributors = useMemo(() => {
    const counts = new Map<string, { name: string; role: string; posts: number; likes: number }>();
    for (const p of posts) {
      const cur = counts.get(p.authorName) ?? { name: p.authorName, role: p.authorRole, posts: 0, likes: 0 };
      cur.posts += 1;
      cur.likes += p.likes;
      counts.set(p.authorName, cur);
    }
    return [...counts.values()].sort((a, b) => b.posts - a.posts || b.likes - a.likes).slice(0, 5);
  }, [posts]);

  const pulse = useMemo(() => ({
    total: posts.length,
    likes: posts.reduce((s, p) => s + p.likes, 0),
    categories: new Set(posts.map((p) => p.category)).size,
  }), [posts]);

  return (
    <main className="min-h-screen p-6 text-white md:p-10 pb-20">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link to="/cp/dashboard" className="text-muted-foreground hover:text-white transition-colors">
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Users size={22} className="text-purple-400" /> Truvi Connect
            <span className="hidden sm:inline text-xs font-medium text-purple-300/70">· Learn • Connect • Grow Together</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            The professional network for verified Channel Partners, Developers and the Truvi team — share market insights, project updates and close more deals together.
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        {/* Left column: composer + feed */}
        <div>
          {/* Compose */}
          <div className="tv-fade-up rounded-2xl border border-white/10 glass p-4 mb-4">
            <p className="text-xs font-medium text-muted-foreground mb-2">What&apos;s happening today?</p>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Share a project update, ask a question, post a requirement, or celebrate a booking…"
              className="w-full bg-white/5 border border-white/15 rounded-xl p-3 text-sm text-white placeholder:text-muted-foreground resize-none outline-none focus:border-purple-600 transition-colors"
              rows={3}
            />
            {/* Quick templates */}
            <div className="mt-3 flex flex-wrap gap-1.5">
              {TEMPLATES.map((t) => (
                <button
                  key={t.label}
                  onClick={() => applyTemplate(t)}
                  className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-white/70 transition hover:border-purple-500/50 hover:text-white"
                >
                  + {t.label}
                </button>
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as Composable)}
                className="bg-white/5 border border-white/15 rounded-lg px-3 py-1.5 text-xs text-white outline-none"
              >
                {(Object.keys(CATEGORY_LABELS) as Composable[])
                  .filter((c) => c !== "ANNOUNCEMENT" || user?.role === "ADMIN")
                  .map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
              </select>
              <Button size="sm" onClick={submitPost} disabled={posting || !content.trim()} className="flex items-center gap-1.5">
                <Send size={13} /> {posting ? "Posting…" : "Post"}
              </Button>
            </div>
          </div>

          {/* Filter chips */}
          <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
            {FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${filter === f ? "bg-purple-600 text-white" : "glass border border-white/10 text-muted-foreground hover:text-white"}`}
              >
                {f === "ALL" ? "🌐 All Posts" : CATEGORY_LABELS[f]}
              </button>
            ))}
          </div>

          {/* Feed */}
          {loading ? (
            <div className="space-y-4">
              {[0, 1, 2].map((i) => (
                <div key={i} className="rounded-2xl border border-white/10 glass p-4">
                  <div className="tv-skeleton h-8 w-8 rounded-full" />
                  <div className="tv-skeleton mt-3 h-4 w-3/4" />
                  <div className="tv-skeleton mt-2 h-4 w-1/2" />
                </div>
              ))}
            </div>
          ) : posts.length === 0 ? (
            <div className="rounded-2xl border border-white/10 glass p-10 text-center">
              <Sparkles size={22} className="mx-auto text-purple-400" />
              <p className="mt-2 text-sm text-white">No posts in this category yet.</p>
              <p className="text-muted-foreground text-xs mt-1">Use a quick template above and be the first to share.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {posts.map((post, i) => (
                <div key={post._id} style={{ animationDelay: `${i * 40}ms` }} className="tv-fade-up tv-lift rounded-2xl border border-white/10 glass p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-full bg-purple-600/20 flex items-center justify-center text-sm font-bold text-purple-300">
                        {post.authorName.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-white">{post.authorName}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className={`text-[10px] rounded px-1.5 py-0.5 ${ROLE_BADGE[post.authorRole] || "bg-white/10 text-muted-foreground"}`}>
                            {post.authorRole}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-[10px] rounded-full px-2 py-0.5 border ${CATEGORY_COLORS[post.category] || ""}`}>
                        {CATEGORY_LABELS[post.category] || post.category}
                      </span>
                      <span className="text-[10px] text-muted-foreground">{formatDate(post.createdAt)}</span>
                    </div>
                  </div>
                  <p className="mt-3 text-sm text-foreground leading-relaxed whitespace-pre-wrap">{post.content}</p>
                  <div className="mt-3 flex items-center gap-3 border-t border-white/10 pt-3">
                    <button
                      onClick={() => toggleLike(post._id)}
                      className={`flex items-center gap-1.5 text-xs transition-colors ${likedPosts.has(post._id) ? "text-rose-400" : "text-muted-foreground hover:text-rose-400"}`}
                    >
                      <Heart size={13} className={likedPosts.has(post._id) ? "fill-rose-400" : ""} />
                      {post.likes} {post.likes === 1 ? "like" : "likes"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right column: live community sidebar */}
        <aside className="space-y-4 lg:sticky lg:top-6 h-fit">
          <div className="tv-fade-up rounded-2xl border border-white/10 glass p-4">
            <div className="flex items-center gap-2 text-sm font-semibold"><Flame size={15} className="text-rose-400" /> Community Pulse</div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-white/[0.03] py-3"><p className="font-display text-lg font-semibold">{pulse.total}</p><p className="text-[10px] text-muted-foreground">Posts</p></div>
              <div className="rounded-xl bg-white/[0.03] py-3"><p className="font-display text-lg font-semibold">{pulse.likes}</p><p className="text-[10px] text-muted-foreground">Likes</p></div>
              <div className="rounded-xl bg-white/[0.03] py-3"><p className="font-display text-lg font-semibold">{pulse.categories}</p><p className="text-[10px] text-muted-foreground">Topics</p></div>
            </div>
          </div>

          <div className="tv-fade-up rounded-2xl border border-white/10 glass p-4">
            <div className="flex items-center gap-2 text-sm font-semibold"><Trophy size={15} className="text-amber-400" /> Top Contributors</div>
            {contributors.length === 0 ? (
              <p className="mt-3 text-xs text-muted-foreground">Post to climb the leaderboard.</p>
            ) : (
              <div className="mt-3 space-y-2">
                {contributors.map((c, i) => (
                  <div key={c.name} className="flex items-center gap-2.5">
                    <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold ${i === 0 ? "bg-amber-500/20 text-amber-300" : "bg-white/10 text-white/60"}`}>{i + 1}</span>
                    <div className="h-7 w-7 rounded-full bg-purple-600/20 flex items-center justify-center text-xs font-bold text-purple-300">{c.name.charAt(0).toUpperCase()}</div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-white">{c.name}</p>
                      <p className="text-[10px] text-muted-foreground">{c.posts} post{c.posts === 1 ? "" : "s"} · {c.likes} like{c.likes === 1 ? "" : "s"}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="tv-fade-up rounded-2xl border border-white/10 glass p-4">
            <div className="text-sm font-semibold">Post categories</div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {Object.entries(CATEGORY_LABELS).map(([k, label]) => (
                <button key={k} onClick={() => setFilter(k as PostCategory)} className={`rounded-full border px-2 py-0.5 text-[10px] ${CATEGORY_COLORS[k]}`}>{label}</button>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
