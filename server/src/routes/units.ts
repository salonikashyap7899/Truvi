import { Router } from "express";
import { and, asc, eq, lt, or } from "drizzle-orm";
import { getDb } from "../config/db";
import { units, projects, type UnitStatus, type PriceHistoryEntry } from "../db/schema";
import { createUnitSchema, updatePriceSchema } from "../lib/validations/inventory";
import { isValidId } from "../lib/ids";
import { authenticate, requireRole, AuthedRequest } from "../middleware/auth";
import { expireStaleLocks } from "../services/inventoryService";
import { emitUnitUpdate } from "../sockets";
import { UNIT_LOCK_MINUTES } from "../config/constants";

const router = Router();
router.use(authenticate);

router.get("/", async (req: AuthedRequest, res) => {
  await expireStaleLocks();
  const db = getDb();
  const { projectId, status } = req.query;
  if (req.user?.role === "CP" && req.user?.onboardingVerified !== true) {
    return res.status(403).json({ error: "Complete onboarding verification to access project details" });
  }
  const conds = [];
  if (projectId && isValidId(projectId)) conds.push(eq(units.projectId, projectId));
  if (status) conds.push(eq(units.status, status as UnitStatus));

  const rows = await db
    .select()
    .from(units)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(asc(units.unitNumber));
  res.json({ units: rows });
});

router.post("/", requireRole("DEVELOPER"), async (req: AuthedRequest, res) => {
  const parsed = createUnitSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });

  const db = getDb();
  const [project] = await db.select({ developerId: projects.developerId }).from(projects).where(eq(projects._id, parsed.data.projectId)).limit(1);
  if (!project || String(project.developerId) !== req.user!.userId) {
    return res.status(404).json({ error: "Project not found" });
  }

  const [unit] = await db
    .insert(units)
    .values({
      projectId: parsed.data.projectId,
      unitNumber: parsed.data.unitNumber,
      type: parsed.data.type,
      areaSqft: parsed.data.areaSqft,
      price: parsed.data.price,
      priceHistory: [{ price: parsed.data.price, changedAt: new Date().toISOString() }],
    })
    .returning();

  res.status(201).json({ unit });
});

/**
 * Lock a unit — the concurrency-critical operation. A single atomic UPDATE
 * whose WHERE clause only matches a currently-lockable unit (AVAILABLE, or
 * LOCKED-but-expired). Postgres evaluates the WHERE and applies the SET as one
 * atomic row-level operation, so two simultaneous lock attempts can never both
 * succeed — the same compare-and-swap guarantee the Mongoose version relied on.
 */
router.post("/:id/lock", requireRole("CP"), async (req: AuthedRequest, res) => {
  if (!isValidId(req.params.id)) return res.status(404).json({ error: "Unit not found" });
  const db = getDb();
  const now = new Date();

  const [unit] = await db
    .update(units)
    .set({
      status: "LOCKED",
      lockedByCPId: req.user!.userId,
      lockExpiresAt: new Date(now.getTime() + UNIT_LOCK_MINUTES * 60 * 1000),
    })
    .where(
      and(
        eq(units._id, req.params.id),
        or(eq(units.status, "AVAILABLE"), and(eq(units.status, "LOCKED"), lt(units.lockExpiresAt, now)))
      )
    )
    .returning();

  if (!unit) {
    const [exists] = await db.select({ _id: units._id }).from(units).where(eq(units._id, req.params.id)).limit(1);
    if (!exists) return res.status(404).json({ error: "Unit not found" });
    return res.status(409).json({ error: "This unit is already locked, reserved, or sold" });
  }

  emitUnitUpdate(String(unit.projectId), unit);
  res.json({ unit });
});

router.delete("/:id/lock", requireRole("CP"), async (req: AuthedRequest, res) => {
  if (!isValidId(req.params.id)) return res.status(403).json({ error: "You don't hold the lock on this unit" });
  const db = getDb();
  const [unit] = await db
    .update(units)
    .set({ status: "AVAILABLE", lockedByCPId: null, lockExpiresAt: null })
    .where(and(eq(units._id, req.params.id), eq(units.lockedByCPId, req.user!.userId)))
    .returning();
  if (!unit) return res.status(403).json({ error: "You don't hold the lock on this unit" });

  emitUnitUpdate(String(unit.projectId), unit);
  res.json({ unit });
});

router.post("/:id/reserve", requireRole("ADMIN", "DEVELOPER"), async (req: AuthedRequest, res) => {
  if (!isValidId(req.params.id)) return res.status(404).json({ error: "Unit not found" });
  const db = getDb();
  const [unit] = await db.select().from(units).where(eq(units._id, req.params.id)).limit(1);
  if (!unit) return res.status(404).json({ error: "Unit not found" });

  if (req.user!.role === "DEVELOPER") {
    const [project] = await db.select({ developerId: projects.developerId }).from(projects).where(eq(projects._id, unit.projectId)).limit(1);
    if (!project || String(project.developerId) !== req.user!.userId) {
      return res.status(403).json({ error: "Not your project" });
    }
  }
  if (unit.status !== "LOCKED") {
    return res.status(409).json({ error: "Only a LOCKED unit can be reserved" });
  }

  // Re-check atomically to avoid a lock expiring mid-request.
  const [updated] = await db
    .update(units)
    .set({ status: "RESERVED", lockExpiresAt: null })
    .where(and(eq(units._id, unit._id), eq(units.status, "LOCKED")))
    .returning();
  if (!updated) return res.status(409).json({ error: "Unit is no longer LOCKED" });

  emitUnitUpdate(String(updated.projectId), updated);
  res.json({ unit: updated });
});

router.get("/:id", async (req: AuthedRequest, res) => {
  if (req.user?.role === "CP" && req.user?.onboardingVerified !== true) {
    return res.status(403).json({ error: "Complete onboarding verification to access project details" });
  }
  if (!isValidId(req.params.id)) return res.status(404).json({ error: "Unit not found" });
  const db = getDb();
  const [unit] = await db.select().from(units).where(eq(units._id, req.params.id)).limit(1);
  if (!unit) return res.status(404).json({ error: "Unit not found" });
  res.json({ unit });
});

router.patch("/:id", requireRole("DEVELOPER", "ADMIN"), async (req: AuthedRequest, res) => {
  if (!isValidId(req.params.id)) return res.status(404).json({ error: "Unit not found" });
  const db = getDb();
  const [unit] = await db.select().from(units).where(eq(units._id, req.params.id)).limit(1);
  if (!unit) return res.status(404).json({ error: "Unit not found" });

  if (req.user!.role === "DEVELOPER") {
    const [project] = await db.select({ developerId: projects.developerId }).from(projects).where(eq(projects._id, unit.projectId)).limit(1);
    if (!project || String(project.developerId) !== req.user!.userId) {
      return res.status(403).json({ error: "Not your project" });
    }
  }

  if (req.body?.price !== undefined) {
    const parsed = updatePriceSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });

    // Never overwrite without logging history — push, don't set.
    const priceHistory: PriceHistoryEntry[] = [...unit.priceHistory, { price: parsed.data.price, changedAt: new Date().toISOString() }];
    const [updated] = await db.update(units).set({ price: parsed.data.price, priceHistory }).where(eq(units._id, unit._id)).returning();

    emitUnitUpdate(String(updated.projectId), updated);
    return res.json({ unit: updated });
  }

  if (req.body?.status === "SOLD") {
    const [updated] = await db.update(units).set({ status: "SOLD" }).where(eq(units._id, unit._id)).returning();
    emitUnitUpdate(String(updated.projectId), updated);
    return res.json({ unit: updated });
  }

  res.status(400).json({ error: "No valid update provided" });
});

export default router;
