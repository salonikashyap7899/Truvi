import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/store/authStore";
import { toast } from "sonner";
import { ArrowLeft, Heart, Send, Users } from "lucide-react";
import { formatDate } from "@/lib/utils";

type PostCategory = "ALL" | "ANNOUNCEMENT" | "DISCUSSION" | "TIP" | "MARKET_UPDATE";

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
  ANNOUNCEMENT: "Announcement",
  DISCUSSION: "Discussion",
  TIP: "Tip",
  MARKET_UPDATE: "Market Update",
};

const CATEGORY_COLORS: Record<string, string> = {
  ANNOUNCEMENT: "bg-blue-900/40 text-blue-300 border-blue-800",
  DISCUSSION: "bg-white/10/60 text-foreground/90 border-white/15",
  TIP: "bg-yellow-900/40 text-yellow-300 border-yellow-800",
  MARKET_UPDATE: "bg-green-900/40 text-green-300 border-green-800",
};

const ROLE_BADGE: Record<string, string> = {
  CP: "bg-purple-900/40 text-purple-300",
  DEVELOPER: "bg-blue-900/40 text-blue-300",
  ADMIN: "bg-red-900/40 text-red-300",
};

export default function TruviConnectPage() {
  const user = useAuthStore((s) => s.user);
  const [posts, setPosts] = useState<Post[]>([]);
  const [filter, setFilter] = useState<PostCategory>("ALL");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState<Exclude<PostCategory, "ALL">>("DISCUSSION");
  const [posting, setPosting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set());

  async function loadPosts(cat: PostCategory = filter) {
    try {
      const res = await api.get("/connect/posts", { params: cat !== "ALL" ? { category: cat } : {} });
      const fetchedPosts: Post[] = res.data.posts;
      setPosts(fetchedPosts);
      // Track which posts the current user liked
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

  const FILTERS: PostCategory[] = ["ALL", "ANNOUNCEMENT", "DISCUSSION", "TIP", "MARKET_UPDATE"];

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
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Community for CPs, Developers, and the Truvi team.</p>
        </div>
      </div>

      {/* Compose */}
      <div className="rounded-2xl border border-white/10 glass p-4 mb-6">
        <p className="text-xs font-medium text-muted-foreground mb-2">Share with the community</p>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Share a tip, market update, or start a discussion…"
          className="w-full bg-white/5 border border-white/15 rounded-xl p-3 text-sm text-white placeholder:text-muted-foreground resize-none outline-none focus:border-purple-600 transition-colors"
          rows={3}
        />
        <div className="mt-3 flex items-center justify-between gap-3">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as any)}
            className="bg-white/5 border border-white/15 rounded-lg px-3 py-1.5 text-xs text-white outline-none"
          >
            <option value="DISCUSSION">Discussion</option>
            <option value="TIP">Tip</option>
            <option value="MARKET_UPDATE">Market Update</option>
            {user?.role === "ADMIN" && <option value="ANNOUNCEMENT">Announcement</option>}
          </select>
          <Button size="sm" onClick={submitPost} disabled={posting || !content.trim()} className="flex items-center gap-1.5">
            <Send size={13} /> {posting ? "Posting…" : "Post"}
          </Button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${filter === f ? "bg-purple-600 text-white" : "glass border border-white/10 text-muted-foreground hover:text-white"}`}
          >
            {f === "ALL" ? "All Posts" : CATEGORY_LABELS[f]}
          </button>
        ))}
      </div>

      {/* Feed */}
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading posts…</p>
      ) : posts.length === 0 ? (
        <div className="rounded-2xl border border-white/10 glass p-10 text-center">
          <p className="text-muted-foreground text-sm">No posts yet. Be the first to share!</p>
        </div>
      ) : (
        <div className="space-y-4">
          {posts.map((post) => (
            <div key={post._id} className="rounded-2xl border border-white/10 glass p-4">
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
    </main>
  );
}
