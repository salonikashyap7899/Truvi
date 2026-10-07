import { Router } from "express";
import { z } from "zod";
import { and, desc, eq, isNull } from "drizzle-orm";
import { getDb } from "../config/db";
import { offers, projects, units, IOffer } from "../db/schema";
import { isValidId } from "../lib/ids";
import { zodMessage } from "../lib/validationError";
import { authenticate, optionalAuthenticate, requireRole, AuthedRequest } from "../middleware/auth";
import { logAudit } from "../services/audit";
import { computeOfferReward, isOfferEligible, isOfferLive, istToday, offerBadge, publicOffer } from "../services/offerService";

/**
 * Offers — admin-managed incentives shown on inventory (e.g. Paradise Town:
 * "For every 1,000 sq ft sold, earn ₹1,00,000").
 *
 *  GET    /api/offers/active?projectId=   Live offers the caller is eligible for.
 *  POST   /api/offers/:id/estimate        Server-calculated reward for a unit/area.
 *  GET    /api/offers                     Admin: every offer (incl. inactive).
 *  POST   /api/offers                     Admin: create.
 *  PATCH  /api/offers/:id                 Admin: edit / activate / deactivate.
 *  DELETE /api/offers/:id                 Admin: delete (soft — leads keep their link).
 */
const router = Router();

// ── Public (role-aware) ──────────────────────────────────────────────────────
router.get("/active", optionalAuthenticate, async (req: AuthedRequest, res) => {
  const projectId = typeof req.query.projectId === "string" ? req.query.projectId : null;
  if (projectId && !isValidId(projectId)) return res.json({ offers: [] });
  const db = getDb();
  const rows = await db
    .select({ offer: offers, approval: projects.approvalStatus })
    .from(offers)
    .innerJoin(projects, eq(offers.projectId, projects._id))
    .where(and(eq(offers.isActive, true), isNull(offers.deletedAt), projectId ? eq(offers.projectId, projectId) : undefined));
  const today = istToday();
  const role = req.user?.role ?? null;
  const list = rows
    .filter(({ offer, approval }) => approval === "APPROVED" && isOfferLive(offer, today) && isOfferEligible(offer, role))
    .map(({ offer }) => publicOffer(offer));
  res.json({ offers: list });
});

const estimateSchema = z.object({
  unitId: z.string().refine(isValidId).optional(),
  areaSqft: z.number().positive().max(10_000_000).optional(),
  units: z.number().int().positive().max(10_000).optional(),
});

router.post("/:id/estimate", optionalAuthenticate, async (req: AuthedRequest, res) => {
  if (!isValidId(req.params.id)) return res.status(404).json({ error: "Offer not found" });
  const parsed = estimateSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: zodMessage(parsed.error) });
  const db = getDb();
  const [offer] = await db.select().from(offers).where(eq(offers._id, req.params.id));
  if (!offer || !isOfferLive(offer) || !isOfferEligible(offer, req.user?.role ?? null)) {
    return res.status(404).json({ error: "Offer not found" });
  }
  let areaSqft = parsed.data.areaSqft ?? null;
  let bookingValue: number | null = null;
  if (parsed.data.unitId) {
    const [u] = await db.select({ areaSqft: units.areaSqft, price: units.price, projectId: units.projectId }).from(units).where(eq(units._id, parsed.data.unitId));
    if (!u || String(u.projectId) !== String(offer.projectId)) return res.status(400).json({ error: "That unit isn't part of this offer" });
    areaSqft = u.areaSqft;
    bookingValue = u.price;
  }
  const reward = computeOfferReward(offer, { areaSqft, units: parsed.data.units ?? 1, bookingValue });
  res.json({ reward, areaSqft });
});

// ── Admin CRUD ───────────────────────────────────────────────────────────────
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const offerBody = z.object({
  name: z.string().trim().min(2, "Give the offer a name").max(120),
  projectId: z.string().refine(isValidId, "Choose a project"),
  unitId: z.string().refine(isValidId).nullable().optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  badgeText: z.string().trim().max(80).nullable().optional(),
  terms: z.string().trim().max(2000).nullable().optional(),
  rewardType: z.enum(["INCENTIVE", "BONUS_COMMISSION", "GIFT", "DISCOUNT"]),
  calcBasis: z.enum(["PER_AREA_BLOCK", "PER_UNIT", "PERCENT_OF_VALUE", "FIXED"]),
  basisQuantity: z.number().positive().max(10_000_000).nullable().optional(),
  amount: z.number().positive("Enter the reward amount").max(1_000_000_000),
  prorate: z.boolean().optional(),
  eligibleRoles: z.array(z.enum(["CP", "AMBASSADOR", "BUYER"])).min(1, "Pick who can see this offer"),
  startDate: z.string().regex(DATE).nullable().optional(),
  endDate: z.string().regex(DATE).nullable().optional(),
  isActive: z.boolean().optional(),
});

async function validateOffer(d: Partial<z.infer<typeof offerBody>>, current?: IOffer): Promise<string | null> {
  const db = getDb();
  const projectId = d.projectId ?? current?.projectId;
  if (d.projectId) {
    const [p] = await db.select({ _id: projects._id }).from(projects).where(eq(projects._id, d.projectId));
    if (!p) return "Project not found";
  }
  const unitId = d.unitId === undefined ? current?.unitId : d.unitId;
  if (unitId) {
    const [u] = await db.select({ projectId: units.projectId }).from(units).where(eq(units._id, unitId));
    if (!u || String(u.projectId) !== String(projectId)) return "That unit doesn't belong to the chosen project";
  }
  const basis = d.calcBasis ?? current?.calcBasis;
  const qty = d.basisQuantity === undefined ? current?.basisQuantity : d.basisQuantity;
  if (basis === "PER_AREA_BLOCK" && !qty) return "Enter the sq ft per reward block (e.g. 1000)";
  const amount = d.amount ?? current?.amount ?? 0;
  if (basis === "PERCENT_OF_VALUE" && amount > 100) return "A percentage can't be more than 100";
  const start = d.startDate === undefined ? current?.startDate : d.startDate;
  const end = d.endDate === undefined ? current?.endDate : d.endDate;
  if (start && end && end < start) return "The end date must be on or after the start date";
  return null;
}

function adminShape(o: IOffer, projectName?: string | null, unitNumber?: string | null) {
  return { ...o, projectName: projectName ?? null, unitNumber: unitNumber ?? null, badge: offerBadge(o), live: isOfferLive(o), examples: publicOffer(o).examples };
}

router.get("/", authenticate, requireRole("ADMIN"), async (_req: AuthedRequest, res) => {
  const rows = await getDb()
    .select({ offer: offers, projectName: projects.name, unitNumber: units.unitNumber })
    .from(offers)
    .leftJoin(projects, eq(offers.projectId, projects._id))
    .leftJoin(units, eq(offers.unitId, units._id))
    .where(isNull(offers.deletedAt))
    .orderBy(desc(offers.createdAt));
  res.json({ offers: rows.map((r) => adminShape(r.offer, r.projectName, r.unitNumber)) });
});

router.post("/", authenticate, requireRole("ADMIN"), async (req: AuthedRequest, res) => {
  const parsed = offerBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: zodMessage(parsed.error) });
  const d = parsed.data;
  const problem = await validateOffer(d);
  if (problem) return res.status(400).json({ error: problem });
  const [created] = await getDb()
    .insert(offers)
    .values({
      ...d,
      unitId: d.unitId ?? null,
      basisQuantity: d.calcBasis === "PER_AREA_BLOCK" ? d.basisQuantity ?? null : null,
      prorate: d.prorate ?? false,
      isActive: d.isActive ?? true,
      createdById: req.user!.userId,
    })
    .returning();
  void logAudit({ userId: req.user!.userId, action: "offer.create", resourceType: "offer", resourceId: String(created._id), metadata: { name: created.name } });
  res.status(201).json({ offer: adminShape(created) });
});

router.patch("/:id", authenticate, requireRole("ADMIN"), async (req: AuthedRequest, res) => {
  if (!isValidId(req.params.id)) return res.status(404).json({ error: "Offer not found" });
  const parsed = offerBody.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: zodMessage(parsed.error) });
  const d = parsed.data;
  if (Object.keys(d).length === 0) return res.status(400).json({ error: "Nothing to update" });
  const db = getDb();
  const [current] = await db.select().from(offers).where(and(eq(offers._id, req.params.id), isNull(offers.deletedAt)));
  if (!current) return res.status(404).json({ error: "Offer not found" });
  const problem = await validateOffer(d, current);
  if (problem) return res.status(400).json({ error: problem });
  const basis = d.calcBasis ?? current.calcBasis;
  const [saved] = await db
    .update(offers)
    .set({ ...d, ...(basis !== "PER_AREA_BLOCK" ? { basisQuantity: null } : {}) })
    .where(eq(offers._id, current._id))
    .returning();
  void logAudit({ userId: req.user!.userId, action: "offer.update", resourceType: "offer", resourceId: String(saved._id), metadata: { fields: Object.keys(d) } });
  res.json({ offer: adminShape(saved) });
});

router.delete("/:id", authenticate, requireRole("ADMIN"), async (req: AuthedRequest, res) => {
  if (!isValidId(req.params.id)) return res.status(404).json({ error: "Offer not found" });
  const [gone] = await getDb()
    .update(offers)
    .set({ deletedAt: new Date(), isActive: false })
    .where(and(eq(offers._id, req.params.id), isNull(offers.deletedAt)))
    .returning({ _id: offers._id, name: offers.name });
  if (!gone) return res.status(404).json({ error: "Offer not found" });
  void logAudit({ userId: req.user!.userId, action: "offer.delete", resourceType: "offer", resourceId: String(gone._id), metadata: { name: gone.name } });
  res.json({ ok: true });
});

export default router;
