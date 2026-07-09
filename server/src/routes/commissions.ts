import { Router } from "express";
import { z } from "zod";
import { randomUUID } from "crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "../config/db";
import {
  commissions,
  leads,
  projects,
  users,
  notifications,
  type ICommission,
  type ILead,
  type IUser,
  type CommissionMilestone,
} from "../db/schema";
import { authenticate, requireRole, AuthedRequest } from "../middleware/auth";
import { calculateCommission, buildMilestones, assertReleasedNeverExceedsTotal } from "../services/commissionCalculator";
import { DEFAULT_PLATFORM_FEE_PERCENT, TDS_PERCENT } from "../config/constants";
import { emitCommissionUpdate, emitNotification } from "../sockets";
import { sendCommissionEmail } from "../services/emailService";
import { isValidId } from "../lib/ids";

const router = Router();
router.use(authenticate);

class AppError extends Error {
  constructor(public code: string, public status: number, message: string) {
    super(message);
  }
}

interface CommissionJoinRow {
  commission: ICommission;
  lead: ILead | null;
  cp: Pick<IUser, "_id" | "name"> | null;
}

function shapeCommission(row: CommissionJoinRow) {
  return {
    ...row.commission,
    leadId: row.lead ?? row.commission.leadId,
    cpId: row.cp ? { _id: row.cp._id, name: row.cp.name } : row.commission.cpId,
  };
}

router.get("/", async (req: AuthedRequest, res) => {
  const db = getDb();
  const user = req.user!;

  const conds = [];
  if (user.role === "CP") {
    conds.push(eq(commissions.cpId, user.userId));
  } else if (user.role === "DEVELOPER") {
    conds.push(eq(projects.developerId, user.userId));
  }

  const rows = await db
    .select({
      commission: commissions,
      lead: leads,
      cp: { _id: users._id, name: users.name },
    })
    .from(commissions)
    .leftJoin(leads, eq(commissions.leadId, leads._id))
    .leftJoin(projects, eq(leads.projectId, projects._id))
    .leftJoin(users, eq(commissions.cpId, users._id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(commissions.createdAt));

  res.json({ commissions: rows.map(shapeCommission) });
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
  const db = getDb();

  // Multi-statement transaction (Commission + CPProfile + Notification writes
  // must all succeed or none do). Unlike the old Mongoose version this needs no
  // replica set — plain Postgres gives full ACID transactions out of the box.
  let result: { commission: ICommission; notification: typeof notifications.$inferSelect; cpId: string; leadClientName: string };

  try {
    result = await db.transaction(async (tx) => {
      if (!isValidId(leadId)) throw new AppError("LEAD_NOT_FOUND", 404, "Lead not found");
      const [lead] = await tx.select().from(leads).where(eq(leads._id, leadId)).limit(1);
      if (!lead) throw new AppError("LEAD_NOT_FOUND", 404, "Lead not found");

      const [project] = await tx.select().from(projects).where(eq(projects._id, lead.projectId)).limit(1);
      if (user.role === "DEVELOPER") {
        if (!project || String(project.developerId) !== user.userId) {
          throw new AppError("FORBIDDEN", 403, "Not your project's lead");
        }
      }
      if (lead.stage !== "BOOKING" && lead.stage !== "REGISTRATION") {
        throw new AppError("NOT_AT_BOOKING_STAGE", 400, "Lead must be at BOOKING or REGISTRATION stage to generate a commission");
      }
      const [existingCommission] = await tx.select({ _id: commissions._id }).from(commissions).where(eq(commissions.leadId, leadId)).limit(1);
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
        label: m.label,
        percentOfTotal: m.percentOfTotal,
        amount: m.amount,
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

      // Atomically bump the CP's totalBookings counter inside the JSONB profile.
      await tx
        .update(users)
        .set({
          cpProfile: sql`jsonb_set(COALESCE(${users.cpProfile}, '{}'::jsonb), '{totalBookings}', to_jsonb(COALESCE((${users.cpProfile}->>'totalBookings')::int, 0) + 1))`,
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
  } catch (err: unknown) {
    if (err instanceof AppError) return res.status(err.status).json({ error: err.message });
    console.error("Commission generation error:", err);
    return res.status(500).json({ error: "Failed to generate commission" });
  }

  emitCommissionUpdate(result.cpId, result.commission);
  emitNotification(result.cpId, result.notification);

  const [cp] = await db.select({ email: users.email, name: users.name }).from(users).where(eq(users._id, result.cpId)).limit(1);
  if (cp) sendCommissionEmail(cp.email, cp.name, result.commission.cpCommissionAmount, result.leadClientName).catch((e) => console.error("Commission email failed:", e));

  res.status(201).json({ commission: result.commission });
});

const releaseSchema = z.object({ milestoneId: z.string().min(1) });

router.patch("/:id/milestones", requireRole("ADMIN"), async (req, res) => {
  const parsed = releaseSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });
  if (!isValidId(req.params.id)) return res.status(404).json({ error: "Commission not found" });

  const db = getDb();
  const [commission] = await db.select().from(commissions).where(eq(commissions._id, req.params.id)).limit(1);
  if (!commission) return res.status(404).json({ error: "Commission not found" });

  const milestones = commission.milestones;
  const target = milestones.find((m) => String(m._id) === parsed.data.milestoneId);
  if (!target) return res.status(404).json({ error: "Milestone not found" });
  if (target.isReleased) return res.status(409).json({ error: "Milestone already released" });

  const releasedAfter = milestones
    .filter((m) => m.isReleased || String(m._id) === parsed.data.milestoneId)
    .map((m) => m.amount);

  try {
    assertReleasedNeverExceedsTotal(releasedAfter, commission.cpCommissionAmount);
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) }); // invariant violation — should never happen, but never silently allow it
  }

  const updatedMilestones: CommissionMilestone[] = milestones.map((m) =>
    String(m._id) === parsed.data.milestoneId ? { ...m, isReleased: true, releasedAt: new Date().toISOString() } : m
  );
  const allReleased = updatedMilestones.every((m) => m.isReleased);
  const status = allReleased ? "PAID" : "MILESTONE_DUE";

  const [updated] = await db
    .update(commissions)
    .set({ milestones: updatedMilestones, status })
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

  res.json({ commission: updated });
});

const invoiceSchema = z.object({ invoiceUrl: z.string().url() });

router.patch("/:id/invoice", async (req: AuthedRequest, res) => {
  const parsed = invoiceSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });
  if (!isValidId(req.params.id)) return res.status(404).json({ error: "Commission not found" });

  const db = getDb();
  const [commission] = await db.select().from(commissions).where(eq(commissions._id, req.params.id)).limit(1);
  if (!commission) return res.status(404).json({ error: "Commission not found" });
  if (String(commission.cpId) !== req.user!.userId && req.user!.role !== "ADMIN") {
    return res.status(403).json({ error: "Forbidden" });
  }

  const status = commission.status === "PENDING" ? "INVOICED" : commission.status;
  const [updated] = await db
    .update(commissions)
    .set({ invoiceUrl: parsed.data.invoiceUrl, status })
    .where(eq(commissions._id, commission._id))
    .returning();
  res.json({ commission: updated });
});

export default router;
