import { Router } from "express";
import { z } from "zod";
import mongoose from "mongoose";
import { Commission } from "../models/Commission";
import { Lead } from "../models/Lead";
import { Project } from "../models/Project";
import { User } from "../models/User";
import { Notification } from "../models/Notification";
import { authenticate, requireRole, AuthedRequest } from "../middleware/auth";
import { calculateCommission, buildMilestones, assertReleasedNeverExceedsTotal } from "../services/commissionCalculator";
import { DEFAULT_PLATFORM_FEE_PERCENT, TDS_PERCENT } from "../config/constants";
import { emitCommissionUpdate, emitNotification } from "../sockets";
import { sendCommissionEmail } from "../services/emailService";

const router = Router();
router.use(authenticate);

class AppError extends Error {
  constructor(public code: string, public status: number, message: string) {
    super(message);
  }
}

router.get("/", async (req: AuthedRequest, res) => {
  const user = req.user!;
  const filter: Record<string, unknown> = {};

  if (user.role === "CP") {
    filter.cpId = user.userId;
  } else if (user.role === "DEVELOPER") {
    const myProjectIds = await Project.find({ developerId: user.userId }).distinct("_id");
    const leadIds = await Lead.find({ projectId: { $in: myProjectIds } }).distinct("_id");
    filter.leadId = { $in: leadIds };
  }

  const commissions = await Commission.find(filter).populate("leadId").populate("cpId", "name").sort({ createdAt: -1 });
  res.json({ commissions });
});

const generateSchema = z.object({
  leadId: z.string().min(1),
  bookingValue: z.number().positive(),
});

router.post("/", requireRole("ADMIN", "DEVELOPER"), async (req: AuthedRequest, res) => {
  const parsed = generateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });

  const { leadId, bookingValue } = parsed.data;
  const user = req.user!;

  // Multi-document transaction (Commission + CPProfile + Notification writes
  // must all succeed or none do). Requires MongoDB running as a replica set
  // — see README for local setup (mongod --replSet rs0, single-node is fine
  // for dev, or use MongoDB Atlas which is a replica set by default). If your
  // Mongo instance isn't a replica set, this will throw; see DECISIONS.md.
  const session = await mongoose.startSession();
  let result: any;

  try {
    await session.withTransaction(async () => {
      const lead = await Lead.findById(leadId).session(session);
      if (!lead) throw new AppError("LEAD_NOT_FOUND", 404, "Lead not found");

      if (user.role === "DEVELOPER") {
        const project = await Project.findById(lead.projectId).session(session);
        if (!project || String(project.developerId) !== user.userId) {
          throw new AppError("FORBIDDEN", 403, "Not your project's lead");
        }
      }
      if (lead.stage !== "BOOKING" && lead.stage !== "REGISTRATION") {
        throw new AppError("NOT_AT_BOOKING_STAGE", 400, "Lead must be at BOOKING or REGISTRATION stage to generate a commission");
      }
      const existingCommission = await Commission.findOne({ leadId }).session(session);
      if (existingCommission) throw new AppError("ALREADY_EXISTS", 409, "A commission already exists for this lead");
      if (!lead.assignedToId) throw new AppError("NO_ASSIGNED_CP", 400, "Lead has no assigned CP");

      const project = await Project.findById(lead.projectId).session(session);
      const calc = calculateCommission({
        bookingValue,
        commissionPercent: project!.commissionPercent,
        platformFeePercent: DEFAULT_PLATFORM_FEE_PERCENT,
        tdsPercent: TDS_PERCENT,
      });
      const milestones = buildMilestones(calc.cpCommissionAmount);

      const [commission] = await Commission.create(
        [
          {
            leadId,
            cpId: lead.assignedToId,
            bookingValue,
            commissionPercent: project!.commissionPercent,
            cpCommissionAmount: calc.cpCommissionAmount,
            platformFeeAmount: calc.platformFeeAmount,
            tdsAmount: calc.tdsAmount,
            status: "PENDING",
            milestones,
          },
        ],
        { session }
      );

      await User.updateOne({ _id: lead.assignedToId }, { $inc: { "cpProfile.totalBookings": 1 } }).session(session);

      const [notification] = await Notification.create(
        [
          {
            userId: lead.assignedToId,
            message: `Commission generated for ${lead.clientName}: your full ₹${calc.cpCommissionAmount.toLocaleString(
              "en-IN"
            )} commission is confirmed across ${milestones.length} milestones.`,
          },
        ],
        { session }
      );

      result = { commission, notification, cpId: String(lead.assignedToId), leadClientName: lead.clientName };
    });
  } catch (err: any) {
    if (err instanceof AppError) return res.status(err.status).json({ error: err.message });
    console.error("Commission generation error:", err);
    return res.status(500).json({ error: "Failed to generate commission" });
  } finally {
    await session.endSession();
  }

  emitCommissionUpdate(result.cpId, result.commission);
  emitNotification(result.cpId, result.notification);

  const cp = await User.findById(result.cpId);
  if (cp) sendCommissionEmail(cp.email, cp.name, result.commission.cpCommissionAmount, result.leadClientName).catch((e) => console.error("Commission email failed:", e));

  res.status(201).json({ commission: result.commission });
});

const releaseSchema = z.object({ milestoneId: z.string().min(1) });

router.patch("/:id/milestones", requireRole("ADMIN"), async (req, res) => {
  const parsed = releaseSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });

  const commission = await Commission.findById(req.params.id);
  if (!commission) return res.status(404).json({ error: "Commission not found" });

  const target = commission.milestones.id(parsed.data.milestoneId);
  if (!target) return res.status(404).json({ error: "Milestone not found" });
  if (target.isReleased) return res.status(409).json({ error: "Milestone already released" });

  const releasedAfter = commission.milestones
    .filter((m) => m.isReleased || String(m._id) === parsed.data.milestoneId)
    .map((m) => m.amount);

  try {
    assertReleasedNeverExceedsTotal(releasedAfter, commission.cpCommissionAmount);
  } catch (err: any) {
    return res.status(500).json({ error: err.message }); // invariant violation — should never happen, but never silently allow it
  }

  target.isReleased = true;
  target.releasedAt = new Date();

  const allReleased = commission.milestones.every((m) => m.isReleased);
  commission.status = allReleased ? "PAID" : "MILESTONE_DUE";
  await commission.save();

  const notification = await Notification.create({
    userId: commission.cpId,
    message: `Milestone "${target.label}" (₹${target.amount.toLocaleString("en-IN")}) has been released to you.`,
  });

  emitCommissionUpdate(String(commission.cpId), commission);
  emitNotification(String(commission.cpId), notification);

  res.json({ commission });
});

export default router;
