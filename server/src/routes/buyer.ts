import { Router } from "express";
import { z } from "zod";
import { User } from "../models/User";
import { Project } from "../models/Project";
import { authenticate, requireRole, AuthedRequest } from "../middleware/auth";

const router = Router();
router.use(authenticate);

const saveProjectSchema = z.object({ projectId: z.string().min(1) });

router.get("/dashboard", requireRole("BUYER"), async (req: AuthedRequest, res) => {
  const user = await User.findById(req.user!.userId);
  if (!user) return res.status(404).json({ error: "User not found" });

  const savedProjects = user.buyerProfile?.savedProjectIds || [];
  const saved = await Project.find({ _id: { $in: savedProjects }, approvalStatus: "APPROVED" })
    .populate("developerId", "name developerProfile")
    .lean();

  res.json({ savedProjects: saved });
});

router.post("/save", requireRole("BUYER"), async (req: AuthedRequest, res) => {
  const parsed = saveProjectSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });

  const user = await User.findById(req.user!.userId);
  if (!user) return res.status(404).json({ error: "User not found" });

  user.buyerProfile = user.buyerProfile || { savedProjectIds: [], compareProjectIds: [], loanEligibilityNotes: "", investmentGoals: "" };
  if (!user.buyerProfile.savedProjectIds.some((id) => String(id) === parsed.data.projectId)) {
    user.buyerProfile.savedProjectIds.push(parsed.data.projectId as any);
  }
  await user.save();

  res.json({ savedProjectIds: user.buyerProfile.savedProjectIds });
});

router.post("/compare", requireRole("BUYER"), async (req: AuthedRequest, res) => {
  const parsed = saveProjectSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });

  const user = await User.findById(req.user!.userId);
  if (!user) return res.status(404).json({ error: "User not found" });

  user.buyerProfile = user.buyerProfile || { savedProjectIds: [], compareProjectIds: [], loanEligibilityNotes: "", investmentGoals: "" };
  if (!user.buyerProfile.compareProjectIds.some((id) => String(id) === parsed.data.projectId)) {
    user.buyerProfile.compareProjectIds.push(parsed.data.projectId as any);
  }
  await user.save();

  res.json({ compareProjectIds: user.buyerProfile.compareProjectIds });
});

router.post("/loan-eligibility", requireRole("BUYER"), async (req: AuthedRequest, res) => {
  const parsed = z.object({ notes: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });

  const user = await User.findById(req.user!.userId);
  if (!user) return res.status(404).json({ error: "User not found" });

  user.buyerProfile = user.buyerProfile || { savedProjectIds: [], compareProjectIds: [], loanEligibilityNotes: "", investmentGoals: "" };
  user.buyerProfile.loanEligibilityNotes = parsed.data.notes;
  await user.save();

  res.json({ loanEligibilityNotes: user.buyerProfile.loanEligibilityNotes });
});

router.post("/investment-goals", requireRole("BUYER"), async (req: AuthedRequest, res) => {
  const parsed = z.object({ goals: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });

  const user = await User.findById(req.user!.userId);
  if (!user) return res.status(404).json({ error: "User not found" });

  user.buyerProfile = user.buyerProfile || { savedProjectIds: [], compareProjectIds: [], loanEligibilityNotes: "", investmentGoals: "" };
  user.buyerProfile.investmentGoals = parsed.data.goals;
  await user.save();

  res.json({ investmentGoals: user.buyerProfile.investmentGoals });
});

export default router;
