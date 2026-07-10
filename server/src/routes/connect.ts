import { Router } from "express";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { getDb } from "../config/db";
import { posts, PostCategory } from "../db/schema";
import { isValidId } from "../lib/ids";
import { authenticate, AuthedRequest } from "../middleware/auth";

const router = Router();
router.use(authenticate);

router.get("/posts", async (req: AuthedRequest, res) => {
  const { category } = req.query;
  const db = getDb();
  const rows = await db
    .select()
    .from(posts)
    .where(category && category !== "ALL" ? eq(posts.category, String(category) as PostCategory) : undefined)
    .orderBy(desc(posts.createdAt))
    .limit(50);
  res.json({ posts: rows });
});

const createPostSchema = z.object({
  content: z.string().min(5).max(1000),
  category: z.enum(["ANNOUNCEMENT", "DISCUSSION", "TIP", "MARKET_UPDATE"]).default("DISCUSSION"),
});

router.post("/posts", async (req: AuthedRequest, res) => {
  const parsed = createPostSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });

  const user = req.user!;
  const db = getDb();
  const [post] = await db
    .insert(posts)
    .values({
      authorId: user.userId,
      authorName: req.body.authorName || "User",
      authorRole: user.role,
      content: parsed.data.content,
      category: parsed.data.category,
    })
    .returning();

  res.status(201).json({ post });
});

router.post("/posts/:id/like", async (req: AuthedRequest, res) => {
  const userId = req.user!.userId;
  if (!isValidId(req.params.id)) return res.status(404).json({ error: "Post not found" });
  const db = getDb();
  const [post] = await db.select().from(posts).where(eq(posts._id, req.params.id));
  if (!post) return res.status(404).json({ error: "Post not found" });

  const likedBy = [...(post.likedBy ?? [])];
  const alreadyLiked = likedBy.some((id) => String(id) === userId);
  let likes = post.likes;
  let newLikedBy: string[];
  if (alreadyLiked) {
    newLikedBy = likedBy.filter((id) => String(id) !== userId);
    likes = Math.max(0, likes - 1);
  } else {
    newLikedBy = [...likedBy, userId];
    likes += 1;
  }
  await db.update(posts).set({ likedBy: newLikedBy, likes }).where(eq(posts._id, post._id));
  res.json({ likes, liked: !alreadyLiked });
});

export default router;
