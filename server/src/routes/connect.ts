import { Router } from "express";
import { z } from "zod";
import { Post } from "../models/Post";
import { authenticate, AuthedRequest } from "../middleware/auth";

const router = Router();
router.use(authenticate);

router.get("/posts", async (req: AuthedRequest, res) => {
  const { category } = req.query;
  const filter: Record<string, unknown> = {};
  if (category && category !== "ALL") filter.category = category;
  const posts = await Post.find(filter).sort({ createdAt: -1 }).limit(50);
  res.json({ posts });
});

const createPostSchema = z.object({
  content: z.string().min(5).max(1000),
  category: z.enum(["ANNOUNCEMENT", "DISCUSSION", "TIP", "MARKET_UPDATE"]).default("DISCUSSION"),
});

router.post("/posts", async (req: AuthedRequest, res) => {
  const parsed = createPostSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });

  const user = req.user!;
  const post = await Post.create({
    authorId: user.userId,
    authorName: req.body.authorName || "User",
    authorRole: user.role,
    content: parsed.data.content,
    category: parsed.data.category,
  });

  res.status(201).json({ post });
});

router.post("/posts/:id/like", async (req: AuthedRequest, res) => {
  const userId = req.user!.userId;
  const post = await Post.findById(req.params.id);
  if (!post) return res.status(404).json({ error: "Post not found" });

  const alreadyLiked = post.likedBy.some((id) => String(id) === userId);
  if (alreadyLiked) {
    post.likedBy = post.likedBy.filter((id) => String(id) !== userId) as any;
    post.likes = Math.max(0, post.likes - 1);
  } else {
    post.likedBy.push(userId as any);
    post.likes += 1;
  }
  await post.save();
  res.json({ likes: post.likes, liked: !alreadyLiked });
});

export default router;
