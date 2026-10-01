import { Router } from "express";
import { zodMessage } from "../lib/validationError";
import { z } from "zod";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "../config/db";
import { projectComments, projects, users } from "../db/schema";
import { isValidId } from "../lib/ids";
import { authenticate, AuthedRequest } from "../middleware/auth";

const router = Router();

/** Stable, name-free identity for a commenter — a short #XXXXXX from their id. */
function shortUserId(id: string): string {
  return `#${id.replace(/[^a-zA-Z0-9]/g, "").slice(-6).toUpperCase()}`;
}

// GET /api/comments/:projectId — the listing's discussion (auth required).
router.get("/:projectId", authenticate, async (req: AuthedRequest, res) => {
  const { projectId } = req.params;
  if (!isValidId(projectId)) return res.status(400).json({ error: "Invalid project id" });

  const db = getDb();
  const rows = await db
    .select({
      _id: projectComments._id,
      parentId: projectComments.parentId,
      body: projectComments.body,
      createdAt: projectComments.createdAt,
      userId: projectComments.userId,
      name: users.name,
      role: users.role,
    })
    .from(projectComments)
    .leftJoin(users, eq(projectComments.userId, users._id))
    .where(eq(projectComments.projectId, projectId))
    .orderBy(asc(projectComments.createdAt));

  const comments = rows.map((r) => ({
    _id: r._id,
    parentId: r.parentId,
    body: r.body,
    createdAt: r.createdAt,
    userId: shortUserId(r.userId),
    // Show the commenter's real display name (falls back to the short id for
    // any legacy row with a missing user).
    authorName: r.name?.trim() || shortUserId(r.userId),
    role: r.role,
    mine: r.userId === req.user!.userId,
  }));
  res.json({ comments });
});

const createSchema = z.object({
  body: z.string().trim().min(1, "Comment can't be empty").max(2000),
  parentId: z.string().uuid().optional(),
});

// POST /api/comments/:projectId — add a comment or a reply.
router.post("/:projectId", authenticate, async (req: AuthedRequest, res) => {
  const { projectId } = req.params;
  if (!isValidId(projectId)) return res.status(400).json({ error: "Invalid project id" });

  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: zodMessage(parsed.error), issues: parsed.error.flatten() });

  const db = getDb();
  const [project] = await db.select({ _id: projects._id }).from(projects).where(eq(projects._id, projectId));
  if (!project) return res.status(404).json({ error: "Project not found" });

  // A reply's parent must belong to the same listing.
  if (parsed.data.parentId) {
    const [parent] = await db
      .select({ _id: projectComments._id })
      .from(projectComments)
      .where(and(eq(projectComments._id, parsed.data.parentId), eq(projectComments.projectId, projectId)));
    if (!parent) return res.status(400).json({ error: "Parent comment not found" });
  }

  const [row] = await db
    .insert(projectComments)
    .values({
      projectId,
      userId: req.user!.userId,
      parentId: parsed.data.parentId ?? null,
      body: parsed.data.body,
    })
    .returning();

  const [author] = await db.select({ name: users.name }).from(users).where(eq(users._id, req.user!.userId));

  res.status(201).json({
    comment: {
      _id: row._id,
      parentId: row.parentId,
      body: row.body,
      createdAt: row.createdAt,
      userId: shortUserId(row.userId),
      authorName: author?.name?.trim() || shortUserId(row.userId),
      role: req.user!.role,
      mine: true,
    },
  });
});

const editSchema = z.object({ body: z.string().trim().min(1, "Comment can't be empty").max(2000) });

// PATCH /api/comments/:projectId/:commentId — edit your own comment.
router.patch("/:projectId/:commentId", authenticate, async (req: AuthedRequest, res) => {
  const { commentId } = req.params;
  if (!isValidId(commentId)) return res.status(400).json({ error: "Invalid comment id" });

  const parsed = editSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: zodMessage(parsed.error), issues: parsed.error.flatten() });

  const db = getDb();
  const [comment] = await db.select().from(projectComments).where(eq(projectComments._id, commentId));
  if (!comment) return res.status(404).json({ error: "Comment not found" });
  // Only the author may edit their own comment.
  if (String(comment.userId) !== req.user!.userId) return res.status(403).json({ error: "Not your comment" });

  const [row] = await db
    .update(projectComments)
    .set({ body: parsed.data.body })
    .where(eq(projectComments._id, commentId))
    .returning();

  res.json({ comment: { _id: row._id, body: row.body } });
});

// DELETE /api/comments/:projectId/:commentId — delete your own comment (or any,
// as an admin). Deleting a top-level comment also removes its replies.
router.delete("/:projectId/:commentId", authenticate, async (req: AuthedRequest, res) => {
  const { commentId } = req.params;
  if (!isValidId(commentId)) return res.status(400).json({ error: "Invalid comment id" });

  const db = getDb();
  const [comment] = await db.select().from(projectComments).where(eq(projectComments._id, commentId));
  if (!comment) return res.status(404).json({ error: "Comment not found" });

  const isOwner = String(comment.userId) === req.user!.userId;
  const isAdmin = req.user!.role === "ADMIN";
  if (!isOwner && !isAdmin) return res.status(403).json({ error: "Not allowed" });

  // Remove the comment and any replies that hang off it.
  await db.delete(projectComments).where(eq(projectComments.parentId, commentId));
  await db.delete(projectComments).where(eq(projectComments._id, commentId));

  res.json({ ok: true });
});

export default router;
