import { Router } from "express";
import { zodMessage } from "../lib/validationError";
import { and, asc, eq, inArray, lt, or } from "drizzle-orm";
import { getDb } from "../config/db";
import { units, projects, UnitStatus } from "../db/schema";
import { isValidId } from "../lib/ids";
import { createUnitSchema, updatePriceSchema, editUnitSchema } from "../lib/validations/inventory";
import { authenticate, requireRole, AuthedRequest } from "../middleware/auth";
import { expireStaleLocks } from "../services/inventoryService";
import { emitUnitUpdate } from "../sockets";
import { UNIT_LOCK_MINUTES } from "../config/constants";
import { notifyUser, notifyRole } from "../services/notificationService";

const router = Router();
router.use(authenticate);

router.get("/", async (req: AuthedRequest, res) => {
  await expireStaleLocks();
  const role = req.user!.role;
  if (role === "CP" && req.user?.onboardingVerified !== true) {
    return res.status(403).json({ error: "Complete onboarding verification to access project details" });
  }
  if (role !== "ADMIN" && role !== "DEVELOPER" && role !== "CP" && role !== "BUYER") {
    return res.status(403).json({ error: "You are not allowed to view inventory" });
  }

  const { projectId, status } = req.query;
  if (projectId && !isValidId(String(projectId))) {
    return res.status(400).json({ error: "Invalid projectId" });
  }

  const db = getDb();
  const conditions = [];
  let visibleProjectIds: string[] | null = null;

  if (role === "DEVELOPER") {
    const owned = await db
      .select({ _id: projects._id })
      .from(projects)
      .where(eq(projects.developerId, req.user!.userId));
    visibleProjectIds = owned.map((p) => String(p._id));
  } else if (role === "CP" || role === "BUYER") {
    const approved = await db
      .select({ _id: projects._id })
      .from(projects)
      .where(eq(projects.approvalStatus, "APPROVED"));
    visibleProjectIds = approved.map((p) => String(p._id));
  }

  // A developer can only inspect their own project inventory. Buyers and CPs
  // can inspect approved listings only. Admins retain platform-wide visibility.
  if (visibleProjectIds !== null) {
    if (projectId && !visibleProjectIds.includes(String(projectId))) {
      return res.status(404).json({ error: "Project not found" });
    }
    if (visibleProjectIds.length === 0) return res.json({ units: [] });
    conditions.push(inArray(units.projectId, visibleProjectIds));
  }
  if (projectId) conditions.push(eq(units.projectId, String(projectId)));
  if (status) conditions.push(eq(units.status, String(status) as UnitStatus));

  const rows = await db
    .select()
    .from(units)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(units.unitNumber));
  res.json({ units: rows });
});
router.post("/", requireRole("DEVELOPER", "ADMIN"), async (req: AuthedRequest, res) => {
  const parsed = createUnitSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: zodMessage(parsed.error), issues: parsed.error.flatten() });

  const db = getDb();
  const [project] = await db.select().from(projects).where(eq(projects._id, parsed.data.projectId));
  if (!project) return res.status(404).json({ error: "Project not found" });
  // Admins can add plots to any project; developers only to their own.
  if (req.user!.role === "DEVELOPER" && String(project.developerId) !== req.user!.userId) {
    return res.status(404).json({ error: "Project not found" });
  }

  const [unit] = await db
    .insert(units)
    .values({
      ...parsed.data,
      // A unit can be listed without human-readable plot dimensions.
      plotSize: parsed.data.plotSize?.trim() || null,
      priceHistory: [{ price: parsed.data.price, changedAt: new Date().toISOString() }],
    })
    .returning();

  // New inventory: tell CPs and buyers there are fresh plots to explore. Deduped
  // to once per project per day so adding many units at once doesn't spam. Only
  // for live (approved) projects — pending ones aren't public yet.
  try {
    if (project.approvalStatus === "APPROVED") {
      const day = new Date().toISOString().slice(0, 10);
      await notifyRole(["CP", "BUYER"], {
        type: "new_property",
        title: "New inventory available 🏘️",
        message: `New plots/units were just added in "${project.name}". Explore the latest inventory.`,
        data: { href: `/inventory/${project._id}/presentation` },
        dedupeKey: `inventory:${project._id}:${day}`,
      });
    }
  } catch {
    /* non-fatal */
  }

  res.status(201).json({ unit });
});

// DELETE /api/units/:id — remove a plot (admin any project, developer own).
router.delete("/:id", requireRole("DEVELOPER", "ADMIN"), async (req: AuthedRequest, res) => {
  if (!isValidId(req.params.id)) return res.status(404).json({ error: "Unit not found" });
  const db = getDb();
  const [unit] = await db.select().from(units).where(eq(units._id, req.params.id));
  if (!unit) return res.status(404).json({ error: "Unit not found" });

  if (req.user!.role === "DEVELOPER") {
    const [project] = await db.select().from(projects).where(eq(projects._id, unit.projectId));
    if (!project || String(project.developerId) !== req.user!.userId) {
      return res.status(403).json({ error: "Not your project" });
    }
  }

  await db.delete(units).where(eq(units._id, unit._id));
  res.json({ ok: true });
});

/**
 * Lock a unit — the concurrency-critical operation. A single UPDATE whose
 * WHERE clause only matches if the unit is currently lockable (AVAILABLE,
 * or LOCKED-but-expired). Postgres evaluates the row predicate and applies
 * the update atomically under row-level locking, so two simultaneous lock
 * attempts can never both succeed.
 */
router.post("/:id/lock", requireRole("CP"), async (req: AuthedRequest, res) => {
  const unitId = String(req.params.id);
  if (!isValidId(unitId)) return res.status(404).json({ error: "Unit not found" });
  const now = new Date();
  const db = getDb();
  const outcome = await db.transaction(async (tx) => {
    const [unitInfo] = await tx
      .select({ projectId: units.projectId })
      .from(units)
      .where(eq(units._id, unitId));
    if (!unitInfo) return { kind: "missing" as const };

    const [project] = await tx
      .select({ availabilityStatus: projects.availabilityStatus })
      .from(projects)
      .where(eq(projects._id, unitInfo.projectId))
      .for("update");
    if (!project) return { kind: "missing" as const };
    if (project.availabilityStatus === "SOLD_OUT") return { kind: "project-sold-out" as const };

    const [unit] = await tx
      .update(units)
      .set({
        status: "LOCKED",
        lockedByCPId: req.user!.userId,
        lockExpiresAt: new Date(now.getTime() + UNIT_LOCK_MINUTES * 60 * 1000),
      })
      .where(
        and(
          eq(units._id, unitId),
          or(eq(units.status, "AVAILABLE"), and(eq(units.status, "LOCKED"), lt(units.lockExpiresAt, now)))
        )
      )
      .returning();
    return unit ? { kind: "locked" as const, unit } : { kind: "unavailable" as const };
  });

  if (outcome.kind === "missing") return res.status(404).json({ error: "Unit not found" });
  if (outcome.kind === "project-sold-out") {
    return res.status(409).json({ error: "This project is currently sold out." });
  }
  if (outcome.kind === "unavailable") {
    const [exists] = await db.select({ _id: units._id }).from(units).where(eq(units._id, unitId));
    if (!exists) return res.status(404).json({ error: "Unit not found" });
    return res.status(409).json({ error: "This unit is already locked, reserved, or sold" });
  }
  const unit = outcome.unit;

  emitUnitUpdate(String(unit.projectId), unit);

  // Let the project's developer know a CP just locked a unit (booking intent).
  try {
    const [project] = await db
      .select({ _id: projects._id, name: projects.name, developerId: projects.developerId })
      .from(projects)
      .where(eq(projects._id, unit.projectId));
    if (project) {
      await notifyUser(String(project.developerId), {
        type: "unit_locked",
        title: "Unit locked by a channel partner",
        message: `A CP locked unit ${unit.unitNumber ?? ""} in "${project.name}" — a booking may be on the way.`,
        actorUserId: req.user!.userId,
        data: { href: `/developer/projects/${project._id}` },
      });
    }
  } catch {
    /* non-fatal */
  }

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
  const unitId = String(req.params.id);
  if (!isValidId(unitId)) return res.status(404).json({ error: "Unit not found" });
  const db = getDb();
  const [unit] = await db.select().from(units).where(eq(units._id, unitId));
  if (!unit) return res.status(404).json({ error: "Unit not found" });

  if (req.user!.role === "DEVELOPER") {
    const [project] = await db.select().from(projects).where(eq(projects._id, unit.projectId));
    if (!project || String(project.developerId) !== req.user!.userId) {
      return res.status(403).json({ error: "Not your project" });
    }
  }
  if (unit.status !== "LOCKED") {
    return res.status(409).json({ error: "Only a LOCKED unit can be reserved" });
  }

  // Lock the project row while checking its availability and reserving the
  // unit, so a concurrent project-level sell-out cannot race this booking.
  const outcome = await db.transaction(async (tx) => {
    const [project] = await tx
      .select({ availabilityStatus: projects.availabilityStatus })
      .from(projects)
      .where(eq(projects._id, unit.projectId))
      .for("update");
    if (!project) return { kind: "missing-project" as const };
    if (project.availabilityStatus === "SOLD_OUT") return { kind: "project-sold-out" as const };

    const [updated] = await tx
      .update(units)
      .set({ status: "RESERVED", lockExpiresAt: null })
      .where(and(eq(units._id, unit._id), eq(units.status, "LOCKED")))
      .returning();
    return updated ? { kind: "reserved" as const, unit: updated } : { kind: "no-longer-locked" as const };
  });
  if (outcome.kind === "missing-project") return res.status(404).json({ error: "Project not found" });
  if (outcome.kind === "project-sold-out") {
    return res.status(409).json({ error: "This project is currently sold out." });
  }
  const updated = outcome.kind === "reserved" ? outcome.unit : null;
  if (!updated) return res.status(409).json({ error: "Unit is no longer LOCKED" });

  emitUnitUpdate(String(updated.projectId), updated);
  res.json({ unit: updated });
});

router.get("/:id", async (req: AuthedRequest, res) => {
  const role = req.user!.role;
  if (role === "CP" && req.user?.onboardingVerified !== true) {
    return res.status(403).json({ error: "Complete onboarding verification to access project details" });
  }
  if (role !== "ADMIN" && role !== "DEVELOPER" && role !== "CP" && role !== "BUYER") {
    return res.status(403).json({ error: "You are not allowed to view inventory" });
  }
  if (!isValidId(req.params.id)) return res.status(404).json({ error: "Unit not found" });

  const db = getDb();
  const [unit] = await db.select().from(units).where(eq(units._id, req.params.id));
  if (!unit) return res.status(404).json({ error: "Unit not found" });

  if (role !== "ADMIN") {
    const [project] = await db
      .select({ developerId: projects.developerId, approvalStatus: projects.approvalStatus })
      .from(projects)
      .where(eq(projects._id, unit.projectId));
    if (!project) return res.status(404).json({ error: "Unit not found" });
    if (role === "DEVELOPER" && String(project.developerId) !== req.user!.userId) {
      return res.status(404).json({ error: "Unit not found" });
    }
    if ((role === "CP" || role === "BUYER") && project.approvalStatus !== "APPROVED") {
      return res.status(404).json({ error: "Unit not found" });
    }
  }
  res.json({ unit });
});
router.patch("/:id", requireRole("DEVELOPER", "ADMIN"), async (req: AuthedRequest, res) => {
  if (!isValidId(req.params.id)) return res.status(404).json({ error: "Unit not found" });
  const db = getDb();
  const [unit] = await db.select().from(units).where(eq(units._id, req.params.id));
  if (!unit) return res.status(404).json({ error: "Unit not found" });

  if (req.user!.role === "DEVELOPER") {
    const [project] = await db.select().from(projects).where(eq(projects._id, unit.projectId));
    if (!project || String(project.developerId) !== req.user!.userId) {
      return res.status(403).json({ error: "Not your project" });
    }
  }

  // Full detail edit — the developer/admin changes a plot's number, type,
  // area, plot size and/or price from the inventory table. Triggered when any
  // non-price/status field is present so the price-only and status-only paths
  // below stay untouched.
  const detailKeys = ["unitNumber", "type", "areaSqft", "plotSize"] as const;
  if (detailKeys.some((k) => req.body?.[k] !== undefined)) {
    const parsed = editUnitSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: zodMessage(parsed.error), issues: parsed.error.flatten() });

    const d = parsed.data;
    const upd: Record<string, unknown> = {};
    if (d.unitNumber !== undefined) upd.unitNumber = d.unitNumber;
    if (d.type !== undefined) upd.type = d.type;
    if (d.areaSqft !== undefined) upd.areaSqft = d.areaSqft;
    if (d.plotSize !== undefined) upd.plotSize = d.plotSize || null;
    if (d.price !== undefined) {
      upd.price = d.price;
      // Only append to price history when the price actually changes.
      if (d.price !== unit.price) {
        upd.priceHistory = [...(unit.priceHistory ?? []), { price: d.price, changedAt: new Date().toISOString() }];
      }
    }

    const [updated] = await db.update(units).set(upd).where(eq(units._id, unit._id)).returning();
    emitUnitUpdate(String(updated.projectId), updated);
    return res.json({ unit: updated });
  }

  if (req.body?.price !== undefined) {
    const parsed = updatePriceSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: zodMessage(parsed.error), issues: parsed.error.flatten() });

    // Never overwrite without logging history — push, don't set.
    const priceHistory = [
      ...(unit.priceHistory ?? []),
      { price: parsed.data.price, changedAt: new Date().toISOString() },
    ];
    const [updated] = await db
      .update(units)
      .set({ price: parsed.data.price, priceHistory })
      .where(eq(units._id, unit._id))
      .returning();

    emitUnitUpdate(String(updated.projectId), updated);
    return res.json({ unit: updated });
  }

  // Availability set by the developer/admin: Available, Sold, or Blocked
  // (Blocked maps to RESERVED). Setting the status clears any CP lock.
  if (req.body?.status !== undefined) {
    const status = req.body.status as UnitStatus;
    if (!["AVAILABLE", "SOLD", "RESERVED"].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }
    const [updated] = await db
      .update(units)
      .set({ status, lockedByCPId: null, lockExpiresAt: null })
      .where(eq(units._id, unit._id))
      .returning();
    emitUnitUpdate(String(updated.projectId), updated);
    return res.json({ unit: updated });
  }

  // Plot-on-layout position: developer drags the marker onto the uploaded
  // master plan. mapX/mapY are fractions 0–1 of the image; null clears it.
  if (req.body?.mapX !== undefined || req.body?.mapY !== undefined) {
    const clamp = (v: unknown): number | null => {
      if (v === null) return null;
      const n = Number(v);
      if (!Number.isFinite(n)) return null;
      return Math.min(1, Math.max(0, n));
    };
    const mapX = clamp(req.body.mapX);
    const mapY = clamp(req.body.mapY);
    const [updated] = await db
      .update(units)
      .set({ mapX, mapY })
      .where(eq(units._id, unit._id))
      .returning();
    emitUnitUpdate(String(updated.projectId), updated);
    return res.json({ unit: updated });
  }

  res.status(400).json({ error: "No valid update provided" });
});

export default router;
