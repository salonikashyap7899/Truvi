import { Router } from "express";
import { and, desc, eq, gte, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb } from "../config/db";
import { leads, projects, users, type LeadStage, type ILead, type IProject, type IUser } from "../db/schema";
import { createLeadSchema, updateLeadStageSchema } from "../lib/validations/leads";
import { isValidId } from "../lib/ids";
import { authenticate, requireRole, AuthedRequest } from "../middleware/auth";
import { emitLeadUpdate } from "../sockets";
import { DUPLICATE_LEAD_WINDOW_DAYS } from "../config/constants";

const router = Router();
router.use(authenticate);

// Two aliases of `users` so a single query can resolve both the submitting CP
// and the currently-assigned CP (mirrors the old `.populate()` calls).
const submitter = alias(users, "submitter");
const assignee = alias(users, "assignee");

interface LeadJoinRow {
  lead: ILead;
  project: Pick<IProject, "_id" | "name"> | null;
  submittedBy: Pick<IUser, "_id" | "name"> | null;
  assignedTo: Pick<IUser, "_id" | "name"> | null;
}

// Reshape a joined row into the nested `{ _id, name }` shape the React client
// already expects from the Mongoose `.populate()` responses.
function shapeLead(row: LeadJoinRow) {
  return {
    ...row.lead,
    projectId: row.project ? { _id: row.project._id, name: row.project.name } : row.lead.projectId,
    submittedById: row.submittedBy ? { _id: row.submittedBy._id, name: row.submittedBy.name } : row.lead.submittedById,
    assignedToId: row.assignedTo ? { _id: row.assignedTo._id, name: row.assignedTo.name } : row.lead.assignedToId,
  };
}

router.get("/", async (req: AuthedRequest, res) => {
  const db = getDb();
  const { stage, projectId } = req.query;
  const user = req.user!;

  const conds = [];
  if (stage) conds.push(eq(leads.stage, stage as LeadStage));
  if (projectId && isValidId(projectId)) conds.push(eq(leads.projectId, projectId));

  if (user.role === "CP") {
    conds.push(or(eq(leads.submittedById, user.userId), eq(leads.assignedToId, user.userId))!);
  } else if (user.role === "DEVELOPER") {
    // Developers only see leads on their own projects — enforced via the join.
    conds.push(eq(projects.developerId, user.userId));
  }

  const rows = await db
    .select({
      lead: leads,
      project: { _id: projects._id, name: projects.name },
      submittedBy: { _id: submitter._id, name: submitter.name },
      assignedTo: { _id: assignee._id, name: assignee.name },
    })
    .from(leads)
    .leftJoin(projects, eq(leads.projectId, projects._id))
    .leftJoin(submitter, eq(leads.submittedById, submitter._id))
    .leftJoin(assignee, eq(leads.assignedToId, assignee._id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(leads.updatedAt));

  res.json({ leads: rows.map(shapeLead) });
});

const STAGE_ORDER = ["GENERATED", "ASSIGNED", "CONTACTED", "SITE_VISIT", "NEGOTIATION", "BOOKING", "REGISTRATION"] as const;

router.post("/", requireRole("CP"), async (req: AuthedRequest, res) => {
  const parsed = createLeadSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });

  const db = getDb();
  const { projectId, clientPhone, confirmDuplicate, ...rest } = parsed.data;

  const windowStart = new Date(Date.now() - DUPLICATE_LEAD_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const [possibleDuplicate] = await db
    .select({ _id: leads._id })
    .from(leads)
    .where(and(eq(leads.projectId, projectId), eq(leads.clientPhone, clientPhone), gte(leads.createdAt, windowStart)))
    .limit(1);

  if (possibleDuplicate && !confirmDuplicate) {
    return res.status(409).json({
      warning: "DUPLICATE_DETECTED",
      message: "A lead with this phone number for this project was submitted recently. Submit again with confirmDuplicate: true to proceed anyway.",
      existingLeadId: possibleDuplicate._id,
    });
  }

  const [lead] = await db
    .insert(leads)
    .values({
      projectId,
      clientPhone,
      clientName: rest.clientName,
      clientEmail: rest.clientEmail || null,
      source: rest.source,
      notes: rest.notes || null,
      submittedById: req.user!.userId,
      assignedToId: req.user!.userId, // auto-assign to submitting CP
      stage: "ASSIGNED",
      isDuplicate: !!possibleDuplicate,
    })
    .returning();

  emitLeadUpdate(lead);
  res.status(201).json({ lead });
});

router.patch("/:id", async (req: AuthedRequest, res) => {
  const parsed = updateLeadStageSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });

  if (!isValidId(req.params.id)) return res.status(404).json({ error: "Lead not found" });

  const db = getDb();
  const [lead] = await db.select().from(leads).where(eq(leads._id, req.params.id)).limit(1);
  if (!lead) return res.status(404).json({ error: "Lead not found" });

  const user = req.user!;
  if (user.role === "CP" && String(lead.assignedToId) !== user.userId) {
    return res.status(403).json({ error: "You can only update leads assigned to you" });
  }
  if (user.role === "DEVELOPER") {
    const [project] = await db.select({ developerId: projects.developerId }).from(projects).where(eq(projects._id, lead.projectId)).limit(1);
    if (!project || String(project.developerId) !== user.userId) {
      return res.status(403).json({ error: "Not your project's lead" });
    }
  }

  const newStage = parsed.data.stage;
  const currentIdx = STAGE_ORDER.indexOf(lead.stage as (typeof STAGE_ORDER)[number]);
  const newIdx = STAGE_ORDER.indexOf(newStage as (typeof STAGE_ORDER)[number]);

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

  const [updated] = await db.update(leads).set({ stage: newStage }).where(eq(leads._id, lead._id)).returning();

  emitLeadUpdate(updated);
  res.json({ lead: updated });
});

export default router;
