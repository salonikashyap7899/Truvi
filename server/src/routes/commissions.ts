import { Router } from "express";
import { z } from "zod";
import { randomUUID } from "crypto";
import { desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "../config/db";
import { commissions, leads, projects, users, notifications, CommissionMilestone } from "../db/schema";
import { isValidId } from "../lib/ids";
import { authenticate, requireRole, AuthedRequest } from "../middleware/auth";
import { logAudit } from "../services/audit";
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
  const db = getDb();

  const conditions = [];
  if (user.role === "CP") {
    conditions.push(eq(commissions.cpId, user.userId));
  } else if (user.role === "DEVELOPER") {
    const myProjects = await db
      .select({ _id: projects._id })
      .from(projects)
      .where(eq(projects.developerId, user.userId));
    const myProjectIds = myProjects.map((p) => p._id);
    if (myProjectIds.length === 0) return res.json({ commissions: [] });
    const myLeads = await db
      .select({ _id: leads._id })
      .from(leads)
      .where(inArray(leads.projectId, myProjectIds));
    const leadIds = myLeads.map((l) => l._id);
    if (leadIds.length === 0) return res.json({ commissions: [] });
    conditions.push(inArray(commissions.leadId, leadIds));
  }

  const rows = await db
    .select({
      commission: commissions,
      lead: leads,
      cp: { _id: users._id, name: users.name },
    })
    .from(commissions)
    .leftJoin(leads, eq(commissions.leadId, leads._id))
    .leftJoin(users, eq(commissions.cpId, users._id))
    .where(conditions.length ? conditions[0] : undefined)
    .orderBy(desc(commissions.createdAt));

  const result = rows.map(({ commission, lead, cp }) => ({
    ...commission,
    leadId: lead ?? commission.leadId,
    cpId: cp ?? commission.cpId,
  }));

  res.json({ commissions: result });
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
  if (!isValidId(leadId)) return res.status(404).json({ error: "Lead not found" });

  // Multi-row transaction: the Commission insert, the CP's totalBookings
  // increment, and the Notification insert must all succeed or none do.
  const db = getDb();
  let result: any;

  try {
    result = await db.transaction(async (tx) => {
      const [lead] = await tx.select().from(leads).where(eq(leads._id, leadId));
      if (!lead) throw new AppError("LEAD_NOT_FOUND", 404, "Lead not found");

      const [project] = await tx.select().from(projects).where(eq(projects._id, lead.projectId));
      if (user.role === "DEVELOPER") {
        if (!project || String(project.developerId) !== user.userId) {
          throw new AppError("FORBIDDEN", 403, "Not your project's lead");
        }
      }
      if (lead.stage !== "BOOKING" && lead.stage !== "REGISTRATION") {
        throw new AppError("NOT_AT_BOOKING_STAGE", 400, "Lead must be at BOOKING or REGISTRATION stage to generate a commission");
      }
      const [existingCommission] = await tx
        .select({ _id: commissions._id })
        .from(commissions)
        .where(eq(commissions.leadId, leadId));
      if (existingCommission) throw new AppError("ALREADY_EXISTS", 409, "A commission already exists for this lead");
      if (!lead.assignedToId) throw new AppError("NO_ASSIGNED_CP", 400, "Lead has no assigned CP");

      const calc = calculateCommission({
        bookingValue,
        commissionPercent: project!.commissionPercent,
        platformFeePercent: DEFAULT_PLATFORM_FEE_PERCENT,
        tdsPercent: TDS_PERCENT,
      });
      const milestones: CommissionMilestone[] = buildMilestones(calc.cpCommissionAmount).map((m) => ({
        _id: randomUUID(),
        ...m,
        isReleased: false,
        releasedAt: null,
      }));

      const [commission] = await tx
        .insert(commissions)
        .values({
          leadId,
          cpId: lead.assignedToId,
          bookingValue,
          commissionPercent: project!.commissionPercent,
          cpCommissionAmount: calc.cpCommissionAmount,
          platformFeeAmount: calc.platformFeeAmount,
          tdsAmount: calc.tdsAmount,
          status: "PENDING",
          milestones,
        })
        .returning();

      await tx
        .update(users)
        .set({
          cpProfile: sql`jsonb_set(coalesce(${users.cpProfile}, '{}'::jsonb), '{totalBookings}', (coalesce((${users.cpProfile}->>'totalBookings')::int, 0) + 1)::text::jsonb)`,
        })
        .where(eq(users._id, lead.assignedToId));

      const [notification] = await tx
        .insert(notifications)
        .values({
          userId: lead.assignedToId,
          message: `Commission generated for ${lead.clientName}: your full ₹${calc.cpCommissionAmount.toLocaleString(
            "en-IN"
          )} commission is confirmed across ${milestones.length} milestones.`,
        })
        .returning();

      return { commission, notification, cpId: String(lead.assignedToId), leadClientName: lead.clientName };
    });
  } catch (err: any) {
    if (err instanceof AppError) return res.status(err.status).json({ error: err.message });
    console.error("Commission generation error:", err);
    return res.status(500).json({ error: "Failed to generate commission" });
  }

  emitCommissionUpdate(result.cpId, result.commission);
  emitNotification(result.cpId, result.notification);

  const [cp] = await db.select().from(users).where(eq(users._id, result.cpId));
  if (cp) sendCommissionEmail(cp.email, cp.name, result.commission.cpCommissionAmount, result.leadClientName).catch((e) => console.error("Commission email failed:", e));

  res.status(201).json({ commission: result.commission });
});

const releaseSchema = z.object({ milestoneId: z.string().min(1) });

router.patch("/:id/milestones", requireRole("ADMIN"), async (req, res) => {
  const parsed = releaseSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });

  if (!isValidId(req.params.id)) return res.status(404).json({ error: "Commission not found" });
  const db = getDb();
  const [commission] = await db.select().from(commissions).where(eq(commissions._id, req.params.id));
  if (!commission) return res.status(404).json({ error: "Commission not found" });

  const milestones = [...(commission.milestones ?? [])];
  const target = milestones.find((m) => String(m._id) === parsed.data.milestoneId);
  if (!target) return res.status(404).json({ error: "Milestone not found" });
  if (target.isReleased) return res.status(409).json({ error: "Milestone already released" });

  const releasedAfter = milestones
    .filter((m) => m.isReleased || String(m._id) === parsed.data.milestoneId)
    .map((m) => m.amount);

  try {
    assertReleasedNeverExceedsTotal(releasedAfter, commission.cpCommissionAmount);
  } catch (err: any) {
    return res.status(500).json({ error: err.message }); // invariant violation — should never happen, but never silently allow it
  }

  target.isReleased = true;
  target.releasedAt = new Date().toISOString();

  const allReleased = milestones.every((m) => m.isReleased);
  const [updated] = await db
    .update(commissions)
    .set({ milestones, status: allReleased ? "PAID" : "MILESTONE_DUE" })
    .where(eq(commissions._id, commission._id))
    .returning();

  const [notification] = await db
    .insert(notifications)
    .values({
      userId: commission.cpId,
      message: `Milestone "${target.label}" (₹${target.amount.toLocaleString("en-IN")}) has been released to you.`,
    })
    .returning();

  emitCommissionUpdate(String(commission.cpId), updated);
  emitNotification(String(commission.cpId), notification);

  await logAudit({ userId: (req as AuthedRequest).user?.userId, action: "commission.milestone.release", resourceType: "commission", resourceId: String(commission._id), metadata: { milestone: target.label, amount: target.amount } });
  res.json({ commission: updated });
});

const invoiceSchema = z.object({ invoiceUrl: z.string().url() });

router.patch("/:id/invoice", async (req: AuthedRequest, res) => {
  const parsed = invoiceSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });

  if (!isValidId(req.params.id)) return res.status(404).json({ error: "Commission not found" });
  const db = getDb();
  const [commission] = await db.select().from(commissions).where(eq(commissions._id, req.params.id));
  if (!commission) return res.status(404).json({ error: "Commission not found" });
  if (String(commission.cpId) !== req.user!.userId && req.user!.role !== "ADMIN") {
    return res.status(403).json({ error: "Forbidden" });
  }

  const [updated] = await db
    .update(commissions)
    .set({
      invoiceUrl: parsed.data.invoiceUrl,
      status: commission.status === "PENDING" ? "INVOICED" : commission.status,
    })
    .where(eq(commissions._id, commission._id))
    .returning();
  res.json({ commission: updated });
});

export default router;
