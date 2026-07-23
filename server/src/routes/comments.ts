import { Router } from "express";
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
      role: users.role,
    })
    .from(projectComments)
    .leftJoin(users, eq(projectComments.userId, users._id))
    .where(eq(projectComments.projectId, projectId))
    .orderBy(asc(projectComments.createdAt));

  // The commenter's name is deliberately never returned — only a short id + role.
  const comments = rows.map((r) => ({
    _id: r._id,
    parentId: r.parentId,
    body: r.body,
    createdAt: r.createdAt,
    userId: shortUserId(r.userId),
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
  if (!parsed.success) return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });

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

  res.status(201).json({
    comment: {
      _id: row._id,
      parentId: row.parentId,
      body: row.body,
      createdAt: row.createdAt,
      userId: shortUserId(row.userId),
      role: req.user!.role,
      mine: true,
    },
  });
});

export default router;
