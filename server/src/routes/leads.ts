import { Router } from "express";
import { Lead } from "../models/Lead";
import { createLeadSchema, updateLeadStageSchema } from "../lib/validations/leads";
import { authenticate, requireRole, AuthedRequest } from "../middleware/auth";
import { emitLeadUpdate } from "../sockets";
import { DUPLICATE_LEAD_WINDOW_DAYS } from "../config/constants";

const router = Router();
router.use(authenticate);

router.get("/", async (req: AuthedRequest, res) => {
  const { stage, projectId } = req.query;
  const user = req.user!;

  const filter: Record<string, unknown> = {};
  if (stage) filter.stage = stage;
  if (projectId) filter.projectId = projectId;

  if (user.role === "CP") {
    filter.$or = [{ submittedById: user.userId }, { assignedToId: user.userId }];
  } else if (user.role === "DEVELOPER") {
    // Developers only see leads on their own projects — resolved via a join.
    const { Project } = await import("../models/Project");
    const myProjectIds = await Project.find({ developerId: user.userId }).distinct("_id");
    filter.projectId = { $in: myProjectIds };
  }

  const leads = await Lead.find(filter)
    .populate("projectId", "name")
    .populate("submittedById", "name")
    .populate("assignedToId", "name")
    .sort({ updatedAt: -1 });

  res.json({ leads });
});

const STAGE_ORDER = ["GENERATED", "ASSIGNED", "CONTACTED", "SITE_VISIT", "NEGOTIATION", "BOOKING", "REGISTRATION"] as const;

router.post("/", requireRole("CP"), async (req: AuthedRequest, res) => {
  const parsed = createLeadSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });

  const { projectId, clientPhone, confirmDuplicate, ...rest } = parsed.data;

  const windowStart = new Date(Date.now() - DUPLICATE_LEAD_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const possibleDuplicate = await Lead.findOne({ projectId, clientPhone, createdAt: { $gte: windowStart } });

  if (possibleDuplicate && !confirmDuplicate) {
    return res.status(409).json({
      warning: "DUPLICATE_DETECTED",
      message: "A lead with this phone number for this project was submitted recently. Submit again with confirmDuplicate: true to proceed anyway.",
      existingLeadId: possibleDuplicate._id,
    });
  }

  const lead = await Lead.create({
    projectId,
    clientPhone,
    ...rest,
    clientEmail: rest.clientEmail || undefined,
    submittedById: req.user!.userId,
    assignedToId: req.user!.userId, // auto-assign to submitting CP
    stage: "ASSIGNED",
    isDuplicate: !!possibleDuplicate,
  });

  emitLeadUpdate(lead);
  res.status(201).json({ lead });
});

router.patch("/:id", async (req: AuthedRequest, res) => {
  const parsed = updateLeadStageSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });

  const lead = await Lead.findById(req.params.id);
  if (!lead) return res.status(404).json({ error: "Lead not found" });

  const user = req.user!;
  if (user.role === "CP" && String(lead.assignedToId) !== user.userId) {
    return res.status(403).json({ error: "You can only update leads assigned to you" });
  }
  if (user.role === "DEVELOPER") {
    const { Project } = await import("../models/Project");
    const project = await Project.findById(lead.projectId);
    if (!project || String(project.developerId) !== user.userId) {
      return res.status(403).json({ error: "Not your project's lead" });
    }
  }

  const newStage = parsed.data.stage;
  const currentIdx = STAGE_ORDER.indexOf(lead.stage as any);
  const newIdx = STAGE_ORDER.indexOf(newStage as any);

  const isLostTransition = newStage === "LOST";
  const isSequentialForward = newIdx === currentIdx + 1;
  const isOverride = user.role !== "CP";

  if (!isLostTransition && !isSequentialForward && !isOverride) {
    return res.status(400).json({
      error: `Leads can only move forward one stage at a time. Current: ${lead.stage}, requested: ${newStage}`,
    });
  }

  if (user.role === "CP" && newStage === "BOOKING") {
    return res.status(403).json({ error: "Only an Admin or Developer can mark a lead as Booked" });
  }

  lead.stage = newStage as any;
  await lead.save();

  emitLeadUpdate(lead);
  res.json({ lead });
});

export default router;
