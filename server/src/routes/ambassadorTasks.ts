import { Router } from "express";
import { z } from "zod";
import { and, desc, eq, lt, or, sql } from "drizzle-orm";
import { getDb } from "../config/db";
import { ambassadorTasks, users, TaskChecklist, TaskDocument } from "../db/schema";
import { isValidId } from "../lib/ids";
import { authenticate, requireRole, AuthedRequest } from "../middleware/auth";
import { upload, fileUrl } from "../services/uploadService";

/**
 * Truvi Ambassador task workflow (per the Ambassador SOP):
 *
 *   GREEN  (AVAILABLE) -> accept -> YELLOW (LOCKED, 6h exclusive)
 *   YELLOW -> checklist (GPS + internet + live location) -> documents -> complete -> RED (COMPLETED, payout)
 *   YELLOW + 6h passed  -> auto-expires back to GREEN for anyone to accept
 *
 * Distinct from the CP sales flow — this is field verification gig work.
 */

const TASK_LOCK_HOURS = 6;
export const AMBASSADOR_TASK_PAYOUT = 500; // ₹ per completed task (SOP step 7)

const router = Router();
router.use(authenticate);

/** Flip YELLOW tasks whose 6-hour lock has lapsed back to GREEN (SOP colour logic). */
async function expireStaleTaskLocks(): Promise<void> {
  const db = getDb();
  await db
    .update(ambassadorTasks)
    .set({ status: "AVAILABLE", acceptedById: null, acceptedAt: null, lockExpiresAt: null, checklist: null })
    .where(and(eq(ambassadorTasks.status, "LOCKED"), lt(ambassadorTasks.lockExpiresAt, new Date())));
}

// ── Ambassador: list tasks (colour-coded) ───────────────────────────────────
router.get("/", requireRole("AMBASSADOR", "ADMIN"), async (req: AuthedRequest, res) => {
  await expireStaleTaskLocks();
  const db = getDb();

  const rows = await db
    .select({ task: ambassadorTasks, acceptedByName: users.name })
    .from(ambassadorTasks)
    .leftJoin(users, eq(ambassadorTasks.acceptedById, users._id))
    .orderBy(desc(ambassadorTasks.createdAt));

  const me = req.user!.userId;
  const tasks = rows.map(({ task, acceptedByName }) => ({
    ...task,
    acceptedByName,
    isMine: String(task.acceptedById) === me,
    // SOP colour for the UI: GREEN available, YELLOW locked, RED completed
    colour: task.status === "AVAILABLE" ? "GREEN" : task.status === "LOCKED" ? "YELLOW" : "RED",
  }));

  res.json({ tasks });
});

// ── Ambassador: my earnings summary ─────────────────────────────────────────
router.get("/earnings", requireRole("AMBASSADOR"), async (req: AuthedRequest, res) => {
  const db = getDb();
  const me = req.user!.userId;
  const [row] = await db
    .select({
      completedCount: sql<number>`count(*) filter (where ${ambassadorTasks.status} = 'COMPLETED')`,
      totalEarned: sql<number>`coalesce(sum(${ambassadorTasks.payoutAmount}) filter (where ${ambassadorTasks.status} = 'COMPLETED'), 0)`,
      totalPaid: sql<number>`coalesce(sum(${ambassadorTasks.payoutAmount}) filter (where ${ambassadorTasks.status} = 'COMPLETED' and ${ambassadorTasks.payoutPaid}), 0)`,
    })
    .from(ambassadorTasks)
    .where(eq(ambassadorTasks.acceptedById, me));

  res.json({
    completedCount: Number(row?.completedCount ?? 0),
    totalEarned: Number(row?.totalEarned ?? 0),
    totalPaid: Number(row?.totalPaid ?? 0),
    pendingPayout: Number(row?.totalEarned ?? 0) - Number(row?.totalPaid ?? 0),
  });
});

// ── Ambassador: accept a task (GREEN -> YELLOW, atomic 6h exclusive lock) ────
router.post("/:id/accept", requireRole("AMBASSADOR"), async (req: AuthedRequest, res) => {
  if (!isValidId(req.params.id)) return res.status(404).json({ error: "Task not found" });
  const db = getDb();
  const now = new Date();

  // Single atomic UPDATE: only wins if the task is AVAILABLE or its lock
  // lapsed — two ambassadors can never both accept (same CAS pattern as
  // unit locking).
  const [task] = await db
    .update(ambassadorTasks)
    .set({
      status: "LOCKED",
      acceptedById: req.user!.userId,
      acceptedAt: now,
      lockExpiresAt: new Date(now.getTime() + TASK_LOCK_HOURS * 60 * 60 * 1000),
      checklist: null,
    })
    .where(
      and(
        eq(ambassadorTasks._id, req.params.id as string),
        or(
          eq(ambassadorTasks.status, "AVAILABLE"),
          and(eq(ambassadorTasks.status, "LOCKED"), lt(ambassadorTasks.lockExpiresAt, now))
        )
      )
    )
    .returning();

  if (!task) {
    const [exists] = await db
      .select({ status: ambassadorTasks.status })
      .from(ambassadorTasks)
      .where(eq(ambassadorTasks._id, req.params.id as string))
      .limit(1);
    if (!exists) return res.status(404).json({ error: "Task not found" });
    return res.status(409).json({
      error: exists.status === "COMPLETED" ? "This task is already completed" : "Another ambassador is working on this task",
    });
  }

  res.json({ task: { ...task, colour: "YELLOW" }, lockHours: TASK_LOCK_HOURS });
});

// ── Ambassador: site-visit checklist (GPS on, internet on, live location) ────
const checklistSchema = z.object({
  gpsOn: z.literal(true, { error: "GPS must be ON" }),
  internetOn: z.literal(true, { error: "Internet must be ON" }),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

router.post("/:id/checklist", requireRole("AMBASSADOR"), async (req: AuthedRequest, res) => {
  const parsed = checklistSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });
  if (!isValidId(req.params.id)) return res.status(404).json({ error: "Task not found" });

  const db = getDb();
  const checklist: TaskChecklist = {
    gpsOn: true,
    internetOn: true,
    liveLat: parsed.data.lat,
    liveLng: parsed.data.lng,
    completedAt: new Date().toISOString(),
  };

  // Only the accepting ambassador, and only while their lock is live.
  const [task] = await db
    .update(ambassadorTasks)
    .set({ checklist })
    .where(
      and(
        eq(ambassadorTasks._id, req.params.id as string),
        eq(ambassadorTasks.acceptedById, req.user!.userId),
        eq(ambassadorTasks.status, "LOCKED")
      )
    )
    .returning();
  if (!task) return res.status(403).json({ error: "You are not working on this task (or the lock expired)" });

  res.json({ task });
});

// ── Ambassador: upload proof documents (photos, verification proof) ─────────
router.post(
  "/:id/documents",
  requireRole("AMBASSADOR"),
  upload.single("file"),
  async (req: AuthedRequest, res) => {
    if (!isValidId(req.params.id)) return res.status(404).json({ error: "Task not found" });
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const db = getDb();
    const [task] = await db
      .select()
      .from(ambassadorTasks)
      .where(
        and(
          eq(ambassadorTasks._id, req.params.id as string),
          eq(ambassadorTasks.acceptedById, req.user!.userId),
          eq(ambassadorTasks.status, "LOCKED")
        )
      )
      .limit(1);
    if (!task) return res.status(403).json({ error: "You are not working on this task (or the lock expired)" });

    const documents: TaskDocument[] = [
      ...(task.documents ?? []),
      { fileName: req.file.originalname, fileUrl: fileUrl(req.file.filename), uploadedAt: new Date().toISOString() },
    ];
    const [updated] = await db
      .update(ambassadorTasks)
      .set({ documents })
      .where(eq(ambassadorTasks._id, task._id))
      .returning();

    res.status(201).json({ task: updated });
  },
);

// ── Ambassador: complete (YELLOW -> RED). Needs checklist + >=1 document ─────
router.post("/:id/complete", requireRole("AMBASSADOR"), async (req: AuthedRequest, res) => {
  if (!isValidId(req.params.id)) return res.status(404).json({ error: "Task not found" });
  const db = getDb();

  const [task] = await db
    .select()
    .from(ambassadorTasks)
    .where(
      and(
        eq(ambassadorTasks._id, req.params.id as string),
        eq(ambassadorTasks.acceptedById, req.user!.userId),
        eq(ambassadorTasks.status, "LOCKED")
      )
    )
    .limit(1);
  if (!task) return res.status(403).json({ error: "You are not working on this task (or the lock expired)" });

  if (!task.checklist?.completedAt) {
    return res.status(400).json({ error: "Complete the site-visit checklist first (GPS, internet, live location)" });
  }
  if (!task.documents || task.documents.length === 0) {
    return res.status(400).json({ error: "Upload at least one proof document before completing" });
  }

  const [updated] = await db
    .update(ambassadorTasks)
    .set({ status: "COMPLETED", completedAt: new Date(), lockExpiresAt: null })
    // Re-check LOCKED atomically so an expired lock can't complete after reset
    .where(and(eq(ambassadorTasks._id, task._id), eq(ambassadorTasks.status, "LOCKED")))
    .returning();
  if (!updated) return res.status(409).json({ error: "Task lock expired before completion" });

  res.json({
    task: { ...updated, colour: "RED" },
    message: `Task completed! ₹${updated.payoutAmount.toLocaleString("en-IN")} payout earned.`,
  });
});

// ── Admin: create a task ─────────────────────────────────────────────────────
const createTaskSchema = z.object({
  title: z.string().min(2),
  address: z.string().min(5),
  mapUrl: z.string().url().optional(),
  deadline: z.string().datetime(),
  payoutAmount: z.number().positive().optional(),
  instructions: z.string().optional(),
});

router.post("/", requireRole("ADMIN"), async (req: AuthedRequest, res) => {
  const parsed = createTaskSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });

  const db = getDb();
  const [task] = await db
    .insert(ambassadorTasks)
    .values({
      title: parsed.data.title,
      address: parsed.data.address,
      mapUrl: parsed.data.mapUrl,
      deadline: new Date(parsed.data.deadline),
      payoutAmount: parsed.data.payoutAmount ?? AMBASSADOR_TASK_PAYOUT,
      instructions: parsed.data.instructions,
      createdById: req.user!.userId,
    })
    .returning();

  res.status(201).json({ task: { ...task, colour: "GREEN" } });
});

// ── Admin: mark payout as paid ───────────────────────────────────────────────
router.post("/:id/mark-paid", requireRole("ADMIN"), async (req: AuthedRequest, res) => {
  if (!isValidId(req.params.id)) return res.status(404).json({ error: "Task not found" });
  const db = getDb();
  const [task] = await db
    .update(ambassadorTasks)
    .set({ payoutPaid: true })
    .where(and(eq(ambassadorTasks._id, req.params.id as string), eq(ambassadorTasks.status, "COMPLETED")))
    .returning();
  if (!task) return res.status(404).json({ error: "Completed task not found" });
  res.json({ task });
});

export default router;
