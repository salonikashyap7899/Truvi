import { Router } from "express";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../config/db";
import { loanChecks } from "../db/schema";
import { authenticate, requireRole, AuthedRequest } from "../middleware/auth";
import { isValidId } from "../lib/ids";

const router = Router();
router.use(authenticate, requireRole("BUYER"));

const loanCheckSchema = z.object({
  income: z.number().positive(),
  obligations: z.number().min(0),
  tenure: z.number().int().min(1).max(30),
  interestRate: z.number().min(0.1).max(30),
  eligibleAmount: z.number().min(0),
  estimatedEmi: z.number().min(0),
});

router.get("/", async (req: AuthedRequest, res) => {
  const db = getDb();
  const checks = await db
    .select()
    .from(loanChecks)
    .where(eq(loanChecks.userId, req.user!.userId))
    .orderBy(desc(loanChecks.createdAt))
    .limit(20);
  res.json({ checks });
});

router.post("/", async (req: AuthedRequest, res) => {
  const parsed = loanCheckSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });
  }

  const db = getDb();
  const [check] = await db
    .insert(loanChecks)
    .values({ userId: req.user!.userId, ...parsed.data })
    .returning();

  res.status(201).json({ check });
});

router.delete("/:id", async (req: AuthedRequest, res) => {
  const { id } = req.params;
  if (!isValidId(id)) {
    return res.status(400).json({ error: "Invalid ID" });
  }

  const db = getDb();
  const [deleted] = await db
    .delete(loanChecks)
    .where(and(eq(loanChecks._id, id), eq(loanChecks.userId, req.user!.userId)))
    .returning();

  if (!deleted) return res.status(404).json({ error: "Not found" });
  res.json({ ok: true });
});

export default router;
