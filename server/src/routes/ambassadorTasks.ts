import { Router, Response, NextFunction } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { and, eq, or, lt, desc, isNull } from "drizzle-orm";
import { getDb } from "../config/db";
import { ambassadorTasks, users, AmbassadorTaskChecklist, AmbassadorTaskDocument } from "../db/schema";
import { isValidId } from "../lib/ids";
import { authenticate, requireRole, AuthedRequest } from "../middleware/auth";

const router = Router();

// Ambassadors accept a task and hold it for 6 hours before it returns to the pool.
const TASK_LOCK_HOURS = 6;

// --- File upload setup (site photos / verification proof) ---
const uploadDir = path.join(process.cwd(), "uploads", "ambassador-tasks");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const taskUpload = multer({
  dest: uploadDir,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB per file
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Only PDF and image files are allowed"));
  },
});

/**
 * Gate for ambassador-only actions. Unlike requireRole, this re-reads the
 * user's current onboardingVerified from the database rather than trusting
 * the (up to 15-minute-stale) access-token payload — so an ambassador can
 * start accepting tasks the instant they finish verification, without waiting
 * for a token refresh.
 */
async function requireVerifiedAmbassador(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: "Not authenticated" });
  if (req.user.role !== "AMBASSADOR") {
    return res.status(403).json({ error: "Ambassadors only" });
  }
  const db = getDb();
  if (!isValidId(req.user.userId)) return res.status(404).json({ error: "User not found" });
  const [user] = await db.select().from(users).where(eq(users._id, req.user.userId));
  if (!user) return res.status(404).json({ error: "User not found" });
  if (!user.onboardingVerified) {
    return res.status(403).json({
      error: "Complete verification (Aadhaar, phone, email) to access ambassador tasks",
    });
  }
  next();
}

/**
 * Return any expired locks to the pool (YELLOW → GREEN). A single UPDATE, run
 * lazily before listing/accepting, so a stalled task is never stuck locked.
 */
async function releaseExpiredLocks() {
  const db = getDb();
  await db
    .update(ambassadorTasks)
    .set({ status: "AVAILABLE", acceptedById: null, acceptedAt: null, lockExpiresAt: null })
    .where(
      and(
        eq(ambassadorTasks.status, "LOCKED"),
        lt(ambassadorTasks.lockExpiresAt, new Date()),
        isNull(ambassadorTasks.completedAt)
      )
    );
}

// ---------------------------------------------------------------------------
// Ambassador-facing endpoints
// ---------------------------------------------------------------------------

// List available tasks + the tasks this ambassador is working on / has finished.
router.get("/", authenticate, requireVerifiedAmbassador, async (req: AuthedRequest, res) => {
  await releaseExpiredLocks();
  const db = getDb();
  const me = req.user!.userId;

  const [available, mine] = await Promise.all([
    db
      .select()
      .from(ambassadorTasks)
      .where(eq(ambassadorTasks.status, "AVAILABLE"))
      .orderBy(desc(ambassadorTasks.createdAt)),
    db
      .select()
      .from(ambassadorTasks)
      .where(eq(ambassadorTasks.acceptedById, me))
      .orderBy(desc(ambassadorTasks.createdAt)),
  ]);

  res.json({ available, mine });
});

// Task details.
router.get("/:id", authenticate, requireVerifiedAmbassador, async (req: AuthedRequest, res) => {
  if (!isValidId(req.params.id)) return res.status(404).json({ error: "Task not found" });
  await releaseExpiredLocks();
  const db = getDb();
  const [task] = await db.select().from(ambassadorTasks).where(eq(ambassadorTasks._id, req.params.id));
  if (!task) return res.status(404).json({ error: "Task not found" });
  res.json({ task });
});

// Accept a task — atomic 6-hour lock (YELLOW). Same compare-and-swap guarantee
// used for unit locking: only one ambassador can win the row.
router.post("/:id/accept", authenticate, requireVerifiedAmbassador, async (req: AuthedRequest, res) => {
  if (!isValidId(req.params.id)) return res.status(404).json({ error: "Task not found" });
  await releaseExpiredLocks();

  const db = getDb();
  const now = new Date();
  const [task] = await db
    .update(ambassadorTasks)
    .set({
      status: "LOCKED",
      acceptedById: req.user!.userId,
      acceptedAt: now,
      lockExpiresAt: new Date(now.getTime() + TASK_LOCK_HOURS * 60 * 60 * 1000),
    })
    .where(
      and(
        eq(ambassadorTasks._id, req.params.id),
        isNull(ambassadorTasks.completedAt),
        or(
          eq(ambassadorTasks.status, "AVAILABLE"),
          and(eq(ambassadorTasks.status, "LOCKED"), lt(ambassadorTasks.lockExpiresAt, now))
        )
      )
    )
    .returning();

  if (!task) {
    const [exists] = await db
      .select({ _id: ambassadorTasks._id })
      .from(ambassadorTasks)
      .where(eq(ambassadorTasks._id, req.params.id));
    if (!exists) return res.status(404).json({ error: "Task not found" });
    return res.status(409).json({ error: "This task is already locked by another ambassador or completed" });
  }

  res.json({ task });
});

// Submit the site-visit checklist (GPS on, internet on, live location capture).
router.post("/:id/checklist", authenticate, requireVerifiedAmbassador, async (req: AuthedRequest, res) => {
  if (!isValidId(req.params.id)) return res.status(404).json({ error: "Task not found" });
  const { gpsOn, internetOn, lat, lng } = req.body ?? {};

  const checklist: AmbassadorTaskChecklist = {
    gpsOn: Boolean(gpsOn),
    internetOn: Boolean(internetOn),
    liveLocation:
      typeof lat === "number" && typeof lng === "number"
        ? { lat, lng, capturedAt: new Date().toISOString() }
        : null,
  };

  const db = getDb();
  const [task] = await db
    .update(ambassadorTasks)
    .set({ checklist })
    .where(and(eq(ambassadorTasks._id, req.params.id), eq(ambassadorTasks.acceptedById, req.user!.userId)))
    .returning();

  if (!task) return res.status(403).json({ error: "You don't hold this task" });
  res.json({ task });
});

// Upload project documents / verification proof (site photos, etc.).
router.post(
  "/:id/documents",
  authenticate,
  requireVerifiedAmbassador,
  taskUpload.array("documents", 10),
  async (req: AuthedRequest, res) => {
    if (!isValidId(req.params.id)) return res.status(404).json({ error: "Task not found" });
    const files = (req.files as Express.Multer.File[]) ?? [];
    if (files.length === 0) return res.status(400).json({ error: "At least one document is required" });

    const db = getDb();
    const [current] = await db
      .select()
      .from(ambassadorTasks)
      .where(and(eq(ambassadorTasks._id, req.params.id), eq(ambassadorTasks.acceptedById, req.user!.userId)));
    if (!current) return res.status(403).json({ error: "You don't hold this task" });

    const newDocs: AmbassadorTaskDocument[] = files.map((f) => ({
      url: `/uploads/ambassador-tasks/${f.filename}`,
      label: f.originalname,
      uploadedAt: new Date().toISOString(),
    }));
    const documents = [...(current.documents ?? []), ...newDocs];

    const [task] = await db
      .update(ambassadorTasks)
      .set({ documents })
      .where(eq(ambassadorTasks._id, req.params.id))
      .returning();

    res.json({ task });
  }
);

// Complete the task (RED). Requires a finished checklist and at least one document.
router.post("/:id/complete", authenticate, requireVerifiedAmbassador, async (req: AuthedRequest, res) => {
  if (!isValidId(req.params.id)) return res.status(404).json({ error: "Task not found" });

  const db = getDb();
  const [current] = await db
    .select()
    .from(ambassadorTasks)
    .where(and(eq(ambassadorTasks._id, req.params.id), eq(ambassadorTasks.acceptedById, req.user!.userId)));
  if (!current) return res.status(403).json({ error: "You don't hold this task" });

  const checklistDone =
    current.checklist?.gpsOn && current.checklist?.internetOn && current.checklist?.liveLocation;
  if (!checklistDone) {
    return res.status(400).json({ error: "Complete the site-visit checklist (GPS, internet, live location) first" });
  }
  if (!current.documents || current.documents.length === 0) {
    return res.status(400).json({ error: "Upload the required verification documents before completing" });
  }

  const [task] = await db
    .update(ambassadorTasks)
    .set({ status: "COMPLETED", completedAt: new Date(), lockExpiresAt: null })
    .where(eq(ambassadorTasks._id, req.params.id))
    .returning();

  res.json({ task });
});

// ---------------------------------------------------------------------------
// Admin-facing endpoints (create + manage tasks)
// ---------------------------------------------------------------------------

// Create a new task.
router.post("/", authenticate, requireRole("ADMIN"), async (req: AuthedRequest, res) => {
  const { title, address, mapUrl, deadline, instructions, payoutAmount } = req.body ?? {};
  if (!title || !address || !deadline) {
    return res.status(400).json({ error: "title, address, and deadline are required" });
  }
  const deadlineDate = new Date(deadline);
  if (isNaN(deadlineDate.getTime())) {
    return res.status(400).json({ error: "Invalid deadline date" });
  }

  const db = getDb();
  const [task] = await db
    .insert(ambassadorTasks)
    .values({
      title,
      address,
      mapUrl: mapUrl || null,
      deadline: deadlineDate,
      instructions: instructions || null,
      payoutAmount: typeof payoutAmount === "number" ? payoutAmount : 500,
      createdById: req.user!.userId,
    })
    .returning();

  res.status(201).json({ task });
});

// List every task (admin overview).
router.get("/admin/all", authenticate, requireRole("ADMIN"), async (_req, res) => {
  await releaseExpiredLocks();
  const db = getDb();
  const tasks = await db.select().from(ambassadorTasks).orderBy(desc(ambassadorTasks.createdAt));
  res.json({ tasks });
});

// Mark a completed task's ₹500 payout as paid.
router.patch("/:id/paid", authenticate, requireRole("ADMIN"), async (req: AuthedRequest, res) => {
  if (!isValidId(req.params.id)) return res.status(404).json({ error: "Task not found" });
  const db = getDb();
  const [task] = await db
    .update(ambassadorTasks)
    .set({ payoutPaid: true })
    .where(and(eq(ambassadorTasks._id, req.params.id), eq(ambassadorTasks.status, "COMPLETED")))
    .returning();
  if (!task) return res.status(400).json({ error: "Task not found or not yet completed" });
  res.json({ task });
});

export default router;
