import { Router } from "express";
import { and, desc, eq, gte, inArray, or, SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb } from "../config/db";
import { leads, projects, users, LeadStage } from "../db/schema";
import { isValidId } from "../lib/ids";
import { createLeadSchema, updateLeadStageSchema } from "../lib/validations/leads";
import { authenticate, requireRole, AuthedRequest } from "../middleware/auth";
import { emitLeadUpdate } from "../sockets";
import { DUPLICATE_LEAD_WINDOW_DAYS } from "../config/constants";

const router = Router();
router.use(authenticate);

router.get("/", async (req: AuthedRequest, res) => {
  const { stage, projectId } = req.query;
  const user = req.user!;
  const db = getDb();

  const conditions: SQL[] = [];
  if (stage) conditions.push(eq(leads.stage, String(stage) as LeadStage));
  if (projectId) {
    if (!isValidId(String(projectId))) return res.json({ leads: [] });
    conditions.push(eq(leads.projectId, String(projectId)));
  }

  if (user.role === "CP") {
    conditions.push(or(eq(leads.submittedById, user.userId), eq(leads.assignedToId, user.userId))!);
  } else if (user.role === "DEVELOPER") {
    // Developers only see leads on their own projects — resolved via a join.
    const myProjects = await db
      .select({ _id: projects._id })
      .from(projects)
      .where(eq(projects.developerId, user.userId));
    const myProjectIds = myProjects.map((p) => p._id);
    if (myProjectIds.length === 0) return res.json({ leads: [] });
    conditions.push(inArray(leads.projectId, myProjectIds));
  }

  // Replicates the old populate("projectId"/"submittedById"/"assignedToId", "name")
  // shapes: each foreign key becomes a nested `{ _id, name }` object.
  const submittedBy = alias(users, "submitted_by");
  const assignedTo = alias(users, "assigned_to");
  const rows = await db
    .select({
      lead: leads,
      projectName: projects.name,
      projectRefId: projects._id,
      submittedByName: submittedBy.name,
      submittedByRefId: submittedBy._id,
      assignedToName: assignedTo.name,
      assignedToRefId: assignedTo._id,
    })
    .from(leads)
    .leftJoin(projects, eq(leads.projectId, projects._id))
    .leftJoin(submittedBy, eq(leads.submittedById, submittedBy._id))
    .leftJoin(assignedTo, eq(leads.assignedToId, assignedTo._id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(leads.updatedAt));

  const enriched = rows.map((row) => ({
    ...row.lead,
    projectId: row.projectRefId ? { _id: row.projectRefId, name: row.projectName } : row.lead.projectId,
    submittedById: row.submittedByRefId
      ? { _id: row.submittedByRefId, name: row.submittedByName }
      : row.lead.submittedById,
    assignedToId: row.assignedToRefId
      ? { _id: row.assignedToRefId, name: row.assignedToName }
      : row.lead.assignedToId,
  }));

  res.json({ leads: enriched });
});

const STAGE_ORDER = ["GENERATED", "ASSIGNED", "CONTACTED", "SITE_VISIT", "NEGOTIATION", "BOOKING", "REGISTRATION"] as const;

router.post("/", requireRole("CP"), async (req: AuthedRequest, res) => {
  const parsed = createLeadSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });

  const { projectId, clientPhone, confirmDuplicate, ...rest } = parsed.data;
  if (!isValidId(projectId)) return res.status(400).json({ error: "Invalid projectId" });
  const db = getDb();

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
      ...rest,
      clientEmail: rest.clientEmail || undefined,
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
  const [lead] = await db.select().from(leads).where(eq(leads._id, req.params.id as string)).limit(1);
  if (!lead) return res.status(404).json({ error: "Lead not found" });

  const user = req.user!;
  if (user.role === "CP" && String(lead.assignedToId) !== user.userId) {
    return res.status(403).json({ error: "You can only update leads assigned to you" });
  }
  if (user.role === "DEVELOPER") {
    const [project] = await db.select().from(projects).where(eq(projects._id, lead.projectId)).limit(1);
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

  const [updated] = await db
    .update(leads)
    .set({ stage: newStage as LeadStage })
    .where(eq(leads._id, lead._id))
    .returning();

  emitLeadUpdate(updated);
  res.json({ lead: updated });
});

export default router;
