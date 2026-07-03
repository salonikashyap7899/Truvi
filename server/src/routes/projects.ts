import { Router } from "express";
import { z } from "zod";
import { Project } from "../models/Project";
import { Unit } from "../models/Unit";
import { Lead } from "../models/Lead";
import { User } from "../models/User";
import { createProjectSchema } from "../lib/validations/inventory";
import { authenticate, requireRole, AuthedRequest } from "../middleware/auth";
import { expireStaleLocks } from "../services/inventoryService";

const router = Router();
router.use(authenticate);

router.get("/", async (req: AuthedRequest, res) => {
  await expireStaleLocks();

  const { city } = req.query;
  const user = req.user!;

  const filter: Record<string, unknown> =
    user.role === "DEVELOPER"
      ? { developerId: user.userId }
      : { approvalStatus: "APPROVED", ...(city ? { city } : {}) };

  const projects = await Project.find(filter)
    .populate("developerId", "name developerProfile")
    .sort({ listingTier: -1, createdAt: -1 })
    .lean();

  // Attach unit + lead counts (N+1-safe: two aggregate queries, not per-project).
  const projectIds = projects.map((p) => p._id);
  const [unitCounts, leadCounts] = await Promise.all([
    Unit.aggregate([{ $match: { projectId: { $in: projectIds } } }, { $group: { _id: "$projectId", count: { $sum: 1 } } }]),
    Lead.aggregate([{ $match: { projectId: { $in: projectIds } } }, { $group: { _id: "$projectId", count: { $sum: 1 } } }]),
  ]);
  const unitCountMap = new Map(unitCounts.map((u) => [String(u._id), u.count]));
  const leadCountMap = new Map(leadCounts.map((l) => [String(l._id), l.count]));

  const buyerProfile =
    user.role === "BUYER"
      ? await User.findById(user.userId).select("buyerProfile.savedProjectIds buyerProfile.compareProjectIds")
      : null;

  const enriched = projects.map((p) => {
    const isSaved = buyerProfile?.buyerProfile?.savedProjectIds.some((id) => String(id) === String(p._id));
    const isCompared = buyerProfile?.buyerProfile?.compareProjectIds.some((id) => String(id) === String(p._id));
    return {
      ...p,
      unitCount: unitCountMap.get(String(p._id)) || 0,
      leadCount: leadCountMap.get(String(p._id)) || 0,
      isSaved: Boolean(isSaved),
      isCompared: Boolean(isCompared),
    };
  });

  res.json({ projects: enriched });
});

router.get("/:id", async (req: AuthedRequest, res) => {
  const project = await Project.findById(req.params.id).populate("developerId", "name developerProfile");
  if (!project) return res.status(404).json({ error: "Project not found" });
  const userRole = req.user?.role;
  if (userRole && userRole !== "ADMIN" && userRole !== "DEVELOPER" && project.approvalStatus !== "APPROVED") {
    return res.status(404).json({ error: "Project not found" });
  }
  const units = await Unit.find({ projectId: project._id }).sort({ unitNumber: 1 });
  res.json({ project, units });
});

const updateProjectSchema = z.object({
  brochureUrl: z.string().url().optional(),
  priceListUrl: z.string().url().optional(),
  description: z.string().min(10).optional(),
  commissionPercent: z.number().min(0).max(20).optional(),
});

router.patch("/:id", requireRole("DEVELOPER", "ADMIN"), async (req: AuthedRequest, res) => {
  const parsed = updateProjectSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });

  const project = await Project.findById(req.params.id);
  if (!project) return res.status(404).json({ error: "Project not found" });
  if (req.user!.role === "DEVELOPER" && String(project.developerId) !== req.user!.userId) {
    return res.status(403).json({ error: "Not your project" });
  }

  Object.assign(project, parsed.data);
  await project.save();
  res.json({ project });
});

router.post("/", requireRole("DEVELOPER"), async (req: AuthedRequest, res) => {
  const parsed = createProjectSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });

  const project = await Project.create({
    ...parsed.data,
    brochureUrl: parsed.data.brochureUrl || undefined,
    priceListUrl: parsed.data.priceListUrl || undefined,
    developerId: req.user!.userId,
    approvalStatus: "PENDING",
  });

  res.status(201).json({ project });
});

export default router;
