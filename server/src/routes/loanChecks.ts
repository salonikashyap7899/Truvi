import { Router } from "express";
import { z } from "zod";
import mongoose from "mongoose";
import { LoanCheck } from "../models/LoanCheck";
import { authenticate, requireRole, AuthedRequest } from "../middleware/auth";

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
  const checks = await LoanCheck.find({ userId: req.user!.userId })
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();
  res.json({ checks });
});

router.post("/", async (req: AuthedRequest, res) => {
  const parsed = loanCheckSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });
  }

  const check = await LoanCheck.create({
    userId: req.user!.userId,
    ...parsed.data,
  });

  res.status(201).json({ check });
});

router.delete("/:id", async (req: AuthedRequest, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ error: "Invalid ID" });
  }
  const deleted = await LoanCheck.findOneAndDelete({ _id: id, userId: req.user!.userId });
  if (!deleted) return res.status(404).json({ error: "Not found" });
  res.json({ ok: true });
});

export default router;
