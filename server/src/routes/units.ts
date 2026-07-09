import { Router } from "express";
import { Unit } from "../models/Unit";
import { Project } from "../models/Project";
import { createUnitSchema, updatePriceSchema } from "../lib/validations/inventory";
import { authenticate, requireRole, AuthedRequest } from "../middleware/auth";
import { expireStaleLocks } from "../services/inventoryService";
import { emitUnitUpdate } from "../sockets";
import { UNIT_LOCK_MINUTES } from "../config/constants";

const router = Router();
router.use(authenticate);

router.get("/", async (req: AuthedRequest, res) => {
  await expireStaleLocks();
  const { projectId, status } = req.query;
  if (req.user?.role === "CP" && req.user?.onboardingVerified !== true) {
    return res.status(403).json({ error: "Complete onboarding verification to access project details" });
  }
  const filter: Record<string, unknown> = {};
  if (projectId) filter.projectId = projectId;
  if (status) filter.status = status;
  const units = await Unit.find(filter).sort({ unitNumber: 1 });
  res.json({ units });
});

router.post("/", requireRole("DEVELOPER"), async (req: AuthedRequest, res) => {
  const parsed = createUnitSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });

  const project = await Project.findById(parsed.data.projectId);
  if (!project || String(project.developerId) !== req.user!.userId) {
    return res.status(404).json({ error: "Project not found" });
  }

  const unit = await Unit.create({
    ...parsed.data,
    priceHistory: [{ price: parsed.data.price, changedAt: new Date() }],
  });

  res.status(201).json({ unit });
});

/**
 * Lock a unit — the concurrency-critical operation. Uses a single atomic
 * findOneAndUpdate with a query filter that only matches if the unit is
 * currently lockable (AVAILABLE, or LOCKED-but-expired). MongoDB guarantees
 * this find+update pair is atomic at the document level, so two simultaneous
 * lock attempts can never both succeed — exactly the race condition the
 * original Prisma $transaction version guarded against, achieved here via
 * MongoDB's native compare-and-swap instead of a multi-statement transaction.
 */
router.post("/:id/lock", requireRole("CP"), async (req: AuthedRequest, res) => {
  const now = new Date();
  const unit = await Unit.findOneAndUpdate(
    {
      _id: req.params.id,
      $or: [{ status: "AVAILABLE" }, { status: "LOCKED", lockExpiresAt: { $lt: now } }],
    },
    {
      $set: {
        status: "LOCKED",
        lockedByCPId: req.user!.userId,
        lockExpiresAt: new Date(now.getTime() + UNIT_LOCK_MINUTES * 60 * 1000),
      },
    },
    { new: true }
  );

  if (!unit) {
    const exists = await Unit.findById(req.params.id);
    if (!exists) return res.status(404).json({ error: "Unit not found" });
    return res.status(409).json({ error: "This unit is already locked, reserved, or sold" });
  }

  emitUnitUpdate(String(unit.projectId), unit);
  res.json({ unit });
});

router.delete("/:id/lock", requireRole("CP"), async (req: AuthedRequest, res) => {
  const unit = await Unit.findOneAndUpdate(
    { _id: req.params.id, lockedByCPId: req.user!.userId },
    { $set: { status: "AVAILABLE", lockedByCPId: null, lockExpiresAt: null } },
    { new: true }
  );
  if (!unit) return res.status(403).json({ error: "You don't hold the lock on this unit" });

  emitUnitUpdate(String(unit.projectId), unit);
  res.json({ unit });
});

router.post("/:id/reserve", requireRole("ADMIN", "DEVELOPER"), async (req: AuthedRequest, res) => {
  const unit = await Unit.findById(req.params.id);
  if (!unit) return res.status(404).json({ error: "Unit not found" });

  if (req.user!.role === "DEVELOPER") {
    const project = await Project.findById(unit.projectId);
    if (!project || String(project.developerId) !== req.user!.userId) {
      return res.status(403).json({ error: "Not your project" });
    }
  }
  if (unit.status !== "LOCKED") {
    return res.status(409).json({ error: "Only a LOCKED unit can be reserved" });
  }

  const updated = await Unit.findOneAndUpdate(
    { _id: unit._id, status: "LOCKED" }, // re-check atomically to avoid a lock expiring mid-request
    { $set: { status: "RESERVED", lockExpiresAt: null } },
    { new: true }
  );
  if (!updated) return res.status(409).json({ error: "Unit is no longer LOCKED" });

  emitUnitUpdate(String(updated.projectId), updated);
  res.json({ unit: updated });
});

router.get("/:id", async (req: AuthedRequest, res) => {
  if (req.user?.role === "CP" && req.user?.onboardingVerified !== true) {
    return res.status(403).json({ error: "Complete onboarding verification to access project details" });
  }
  const unit = await Unit.findById(req.params.id);
  if (!unit) return res.status(404).json({ error: "Unit not found" });
  res.json({ unit });
});

router.patch("/:id", requireRole("DEVELOPER", "ADMIN"), async (req: AuthedRequest, res) => {
  const unit = await Unit.findById(req.params.id);
  if (!unit) return res.status(404).json({ error: "Unit not found" });

  if (req.user!.role === "DEVELOPER") {
    const project = await Project.findById(unit.projectId);
    if (!project || String(project.developerId) !== req.user!.userId) {
      return res.status(403).json({ error: "Not your project" });
    }
  }

  if (req.body?.price !== undefined) {
    const parsed = updatePriceSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });

    // Never overwrite without logging history — push, don't set.
    unit.priceHistory.push({ price: parsed.data.price, changedAt: new Date() });
    unit.price = parsed.data.price;
    await unit.save();

    emitUnitUpdate(String(unit.projectId), unit);
    return res.json({ unit });
  }

  if (req.body?.status === "SOLD") {
    unit.status = "SOLD";
    await unit.save();
    emitUnitUpdate(String(unit.projectId), unit);
    return res.json({ unit });
  }

  res.status(400).json({ error: "No valid update provided" });
});

export default router;
