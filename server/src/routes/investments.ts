import { Router } from "express";
import { z } from "zod";
import mongoose from "mongoose";
import { Investment } from "../models/Investment";
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
  const investments = await Investment.find({ userId: req.user!.userId })
    .sort({ purchaseDate: -1 })
    .lean();
  res.json({ investments });
});

router.post("/", async (req: AuthedRequest, res) => {
  const parsed = investmentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });
  }

  const investment = await Investment.create({
    userId: req.user!.userId,
    ...parsed.data,
    purchaseDate: new Date(parsed.data.purchaseDate),
    rentalIncome: parsed.data.rentalIncome ?? 0,
  });

  res.status(201).json({ investment });
});

router.put("/:id", async (req: AuthedRequest, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ error: "Invalid investment ID" });
  }

  const parsed = investmentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });
  }

  const investment = await Investment.findOneAndUpdate(
    { _id: id, userId: req.user!.userId },
    { ...parsed.data, purchaseDate: new Date(parsed.data.purchaseDate) },
    { new: true }
  );

  if (!investment) return res.status(404).json({ error: "Investment not found" });
  res.json({ investment });
});

router.delete("/:id", async (req: AuthedRequest, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ error: "Invalid investment ID" });
  }

  const investment = await Investment.findOneAndDelete({ _id: id, userId: req.user!.userId });
  if (!investment) return res.status(404).json({ error: "Investment not found" });
  res.json({ success: true });
});

export default router;
