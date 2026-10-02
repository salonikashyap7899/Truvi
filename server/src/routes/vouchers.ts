import { Router } from "express";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../config/db";
import { vouchers } from "../db/schema";
import { authenticate, requireRole, AuthedRequest } from "../middleware/auth";
import { getPlan } from "../config/pricing";
import { evaluateVoucher, normalizeVoucherCode } from "../services/vouchers";
import { zodMessage } from "../lib/validationError";
import { isValidId } from "../lib/ids";

const router = Router();

const R = (rupees: number) => Math.round(rupees * 100);

/** Public shape returned to the checkout (no internal counters). */
function serialize(v: typeof vouchers.$inferSelect) {
  return {
    id: v._id,
    code: v.code,
    description: v.description,
    discountType: v.discountType,
    discountValue: v.discountValue,
    maxDiscountPaise: v.maxDiscountPaise,
    planIds: v.planIds ?? null,
    category: v.category,
    maxRedemptions: v.maxRedemptions,
    redeemedCount: v.redeemedCount,
    minAmountPaise: v.minAmountPaise,
    active: v.active,
    expiresAt: v.expiresAt ? v.expiresAt.toISOString() : null,
    createdAt: v.createdAt ? v.createdAt.toISOString() : null,
  };
}

// ── Public: preview a code against a plan (used by the checkout) ─────────────
const validateSchema = z.object({ code: z.string().min(1), planId: z.string().min(1) });
router.post("/vouchers/validate", async (req, res) => {
  const parsed = validateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: zodMessage(parsed.error) });

  const plan = getPlan(parsed.data.planId);
  if (!plan) return res.status(404).json({ error: "Unknown plan" });
  if (plan.pricePaise <= 0 || plan.type === "subscription") {
    return res.status(400).json({ error: "A voucher can't be applied to this item." });
  }

  const db = getDb();
  const [v] = await db.select().from(vouchers).where(eq(vouchers.code, normalizeVoucherCode(parsed.data.code)));
  if (!v) return res.status(404).json({ error: "That code isn't valid." });

  const result = evaluateVoucher(v, plan, plan.pricePaise);
  if (!result.ok) return res.status(400).json({ error: result.reason });

  return res.json({
    code: v.code,
    discountPaise: result.discountPaise,
    basePaise: plan.pricePaise,
    finalBasePaise: plan.pricePaise - result.discountPaise,
    label: v.description || v.code,
  });
});

// ── Admin: create ───────────────────────────────────────────────────────────
const createSchema = z.object({
  code: z.string().trim().min(3, "Code must be at least 3 characters").max(40),
  description: z.string().max(200).optional(),
  discountType: z.enum(["PERCENT", "FIXED"]),
  discountValue: z.number().int().min(1, "Enter a discount value"), // PERCENT: 1..100 ; FIXED: rupees off
  maxDiscountRupees: z.number().int().min(0).optional(), // cap for PERCENT
  planIds: z.array(z.string()).optional(),
  category: z.enum(["BUYER", "CP", "DEVELOPER"]).optional(),
  maxRedemptions: z.number().int().min(1).optional(),
  minAmountRupees: z.number().int().min(0).optional(),
  active: z.boolean().optional(),
  expiresAt: z.string().optional(), // ISO date/datetime
});

router.post("/admin/vouchers", authenticate, requireRole("ADMIN"), async (req: AuthedRequest, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: zodMessage(parsed.error), issues: parsed.error.flatten() });
  const d = parsed.data;

  if (d.discountType === "PERCENT" && d.discountValue > 100) {
    return res.status(400).json({ error: "A percentage discount can't be more than 100%." });
  }
  const code = normalizeVoucherCode(d.code);
  const expiresAt = d.expiresAt ? new Date(d.expiresAt) : null;
  if (expiresAt && isNaN(expiresAt.getTime())) return res.status(400).json({ error: "Enter a valid expiry date." });

  const db = getDb();
  const [existing] = await db.select({ _id: vouchers._id }).from(vouchers).where(eq(vouchers.code, code));
  if (existing) return res.status(409).json({ error: "A voucher with this code already exists." });

  try {
    const [row] = await db
      .insert(vouchers)
      .values({
        code,
        description: d.description ?? null,
        discountType: d.discountType,
        // FIXED stores paise; PERCENT stores the percent as-is.
        discountValue: d.discountType === "FIXED" ? R(d.discountValue) : d.discountValue,
        maxDiscountPaise: d.maxDiscountRupees ? R(d.maxDiscountRupees) : null,
        planIds: d.planIds && d.planIds.length ? d.planIds : null,
        category: d.category ?? null,
        maxRedemptions: d.maxRedemptions ?? null,
        minAmountPaise: d.minAmountRupees ? R(d.minAmountRupees) : 0,
        active: d.active ?? true,
        expiresAt,
        createdById: req.user!.userId,
      })
      .returning();
    return res.status(201).json({ voucher: serialize(row) });
  } catch {
    return res.status(409).json({ error: "A voucher with this code already exists." });
  }
});

// ── Admin: list ─────────────────────────────────────────────────────────────
router.get("/admin/vouchers", authenticate, requireRole("ADMIN"), async (_req, res) => {
  const db = getDb();
  const rows = await db.select().from(vouchers).orderBy(desc(vouchers.createdAt));
  res.json({ vouchers: rows.map(serialize) });
});

// ── Admin: update (toggle active / edit basics) ─────────────────────────────
const patchSchema = z.object({
  active: z.boolean().optional(),
  description: z.string().max(200).optional(),
  maxRedemptions: z.number().int().min(1).nullable().optional(),
  expiresAt: z.string().nullable().optional(),
});
router.patch("/admin/vouchers/:id", authenticate, requireRole("ADMIN"), async (req: AuthedRequest, res) => {
  const { id } = req.params;
  if (!isValidId(id)) return res.status(400).json({ error: "Invalid voucher id" });
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: zodMessage(parsed.error) });

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.active != null) patch.active = parsed.data.active;
  if (parsed.data.description !== undefined) patch.description = parsed.data.description;
  if (parsed.data.maxRedemptions !== undefined) patch.maxRedemptions = parsed.data.maxRedemptions;
  if (parsed.data.expiresAt !== undefined) {
    if (parsed.data.expiresAt === null) patch.expiresAt = null;
    else {
      const d = new Date(parsed.data.expiresAt);
      if (isNaN(d.getTime())) return res.status(400).json({ error: "Enter a valid expiry date." });
      patch.expiresAt = d;
    }
  }

  const db = getDb();
  const [row] = await db.update(vouchers).set(patch).where(eq(vouchers._id, id)).returning();
  if (!row) return res.status(404).json({ error: "Voucher not found" });
  res.json({ voucher: serialize(row) });
});

// ── Admin: delete ───────────────────────────────────────────────────────────
router.delete("/admin/vouchers/:id", authenticate, requireRole("ADMIN"), async (req, res) => {
  const { id } = req.params;
  if (!isValidId(id)) return res.status(400).json({ error: "Invalid voucher id" });
  const db = getDb();
  await db.delete(vouchers).where(and(eq(vouchers._id, id)));
  res.json({ ok: true });
});

export default router;
