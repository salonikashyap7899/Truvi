import { Router } from "express";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../config/db";
import { investments } from "../db/schema";
import { isValidId } from "../lib/ids";
import { authenticate, requireRole, AuthedRequest } from "../middleware/auth";

const router = Router();
router.use(authenticate, requireRole("BUYER"));

const investmentSchema = z.object({
  propertyName: z.string().min(1).max(200),
  purchasePrice: z.number().positive(),
  purchaseDate: z.string().min(1),
  currentValue: z.number().positive(),
  rentalIncome: z.number().min(0).optional(),
});

router.get("/", async (req: AuthedRequest, res) => {
  const db = getDb();
  const rows = await db
    .select()
    .from(investments)
    .where(eq(investments.userId, req.user!.userId))
    .orderBy(desc(investments.purchaseDate));
  res.json({ investments: rows });
});

router.post("/", async (req: AuthedRequest, res) => {
  const parsed = investmentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });
  }

  const db = getDb();
  const [investment] = await db
    .insert(investments)
    .values({
      userId: req.user!.userId,
      propertyName: parsed.data.propertyName,
      purchasePrice: parsed.data.purchasePrice,
      currentValue: parsed.data.currentValue,
      purchaseDate: new Date(parsed.data.purchaseDate),
      rentalIncome: parsed.data.rentalIncome ?? 0,
    })
    .returning();

  res.status(201).json({ investment });
});

router.put("/:id", async (req: AuthedRequest, res) => {
  const { id } = req.params;
  if (!isValidId(id)) {
    return res.status(400).json({ error: "Invalid investment ID" });
  }

  const parsed = investmentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });
  }

  const db = getDb();
  const [investment] = await db
    .update(investments)
    .set({
      propertyName: parsed.data.propertyName,
      purchasePrice: parsed.data.purchasePrice,
      currentValue: parsed.data.currentValue,
      purchaseDate: new Date(parsed.data.purchaseDate),
      rentalIncome: parsed.data.rentalIncome ?? 0,
    })
    .where(and(eq(investments._id, id), eq(investments.userId, req.user!.userId)))
    .returning();

  if (!investment) return res.status(404).json({ error: "Investment not found" });
  res.json({ investment });
});

router.delete("/:id", async (req: AuthedRequest, res) => {
  const { id } = req.params;
  if (!isValidId(id)) {
    return res.status(400).json({ error: "Invalid investment ID" });
  }

  const db = getDb();
  const [investment] = await db
    .delete(investments)
    .where(and(eq(investments._id, id), eq(investments.userId, req.user!.userId)))
    .returning();
  if (!investment) return res.status(404).json({ error: "Investment not found" });
  res.json({ success: true });
});

export default router;
