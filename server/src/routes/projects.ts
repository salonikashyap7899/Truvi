import { Router } from "express";
import { z } from "zod";
import { isValidId } from "../lib/ids";
import { createProjectSchema } from "../lib/validations/inventory";
import { authenticate, requireRole, AuthedRequest } from "../middleware/auth";
import { expireStaleLocks } from "../services/inventoryService";
import { Project } from "../models/Project";
import { Unit } from "../models/Unit";
import { Lead } from "../models/Lead";
import { User } from "../models/User";

const router = Router();
router.use(authenticate);

router.get("/", async (req: AuthedRequest, res) => {
  await expireStaleLocks();

  const { city } = req.query;
  const user = req.user!;
  if (user.role === "CP" && user.onboardingVerified !== true) {
    return res.status(403).json({ error: "Complete onboarding verification to access project details" });
  }
  const projectQuery: Record<string, unknown> = {};

  if (user.role === "DEVELOPER") {
    projectQuery.developerId = user.userId;
  } else {
    projectQuery.approvalStatus = "APPROVED";
    if (city) projectQuery.city = String(city);
  }

  const rows = await Project.find(projectQuery).sort({ listingTier: -1, createdAt: -1 }).lean();
  const projectIds = rows.map((project) => project._id);

  const [unitCounts, leadCounts] = await Promise.all([
    Unit.aggregate([
      { $match: { projectId: { $in: projectIds } } },
      { $group: { _id: "$projectId", count: { $sum: 1 } } },
    ]),
    Lead.aggregate([
      { $match: { projectId: { $in: projectIds } } },
      { $group: { _id: "$projectId", count: { $sum: 1 } } },
    ]),
  ]);

  const unitCountMap = new Map(unitCounts.map((item) => [String(item._id), item.count]));
  const leadCountMap = new Map(leadCounts.map((item) => [String(item._id), item.count]));

  const developerIds = rows.map((project) => project.developerId);
  const developers = await User.find({ _id: { $in: developerIds } })
    .select("_id name developerProfile")
    .lean();
  const developerMap = new Map(developers.map((dev) => [String(dev._id), dev]));

  const buyer =
    user.role === "BUYER"
      ? await User.findById(user.userId).select("buyerProfile").lean()
      : null;

  const enriched = rows.map((project) => {
    const developer = developerMap.get(String(project.developerId)) || null;
    const isSaved = Boolean(
      buyer?.buyerProfile?.savedProjectIds?.some((id) => String(id) === String(project._id)),
    );
    const isCompared = Boolean(
      buyer?.buyerProfile?.compareProjectIds?.some((id) => String(id) === String(project._id)),
    );

    return {
      ...project,
      developerId: developer,
      unitCount: unitCountMap.get(String(project._id)) || 0,
      leadCount: leadCountMap.get(String(project._id)) || 0,
      isSaved,
      isCompared,
    };
  });

  res.json({ projects: enriched });
});

router.get("/:id", async (req: AuthedRequest, res) => {
  if (!isValidId(req.params.id)) return res.status(404).json({ error: "Project not found" });

  const project = await Project.findById(req.params.id).lean();
  if (!project) return res.status(404).json({ error: "Project not found" });

  const userRole = req.user?.role;
  if (userRole === "CP" && req.user?.onboardingVerified !== true) {
    return res.status(403).json({ error: "Complete onboarding verification to access project details" });
  }
  if (userRole && userRole !== "ADMIN" && userRole !== "DEVELOPER" && project.approvalStatus !== "APPROVED") {
    return res.status(404).json({ error: "Project not found" });
  }

  const developer = await User.findById(project.developerId)
    .select("_id name developerProfile")
    .lean();
  const units = await Unit.find({ projectId: project._id }).sort({ unitNumber: 1 }).lean();

  res.json({ project: { ...project, developerId: developer || project.developerId }, units });
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

  if (!isValidId(req.params.id)) return res.status(404).json({ error: "Project not found" });

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
