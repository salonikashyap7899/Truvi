import { Router } from "express";
import { and, desc, eq, gte, inArray, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb } from "../config/db";
import { leads, leadActivities, projects, users, LeadStage } from "../db/schema";
import { isValidId } from "../lib/ids";
import { createLeadSchema, updateLeadStageSchema } from "../lib/validations/leads";
import { authenticate, requireRole, AuthedRequest } from "../middleware/auth";
import { emitLeadUpdate } from "../sockets";
import { logAudit } from "../services/audit";
import { DUPLICATE_LEAD_WINDOW_DAYS } from "../config/constants";

const router = Router();
router.use(authenticate);

router.get("/", async (req: AuthedRequest, res) => {
  const { stage, projectId } = req.query;
  const user = req.user!;
  const db = getDb();

  const conditions = [];
  if (stage) conditions.push(eq(leads.stage, String(stage) as LeadStage));
  if (projectId && isValidId(String(projectId))) conditions.push(eq(leads.projectId, String(projectId)));

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

  const submitter = alias(users, "submitter");
  const assignee = alias(users, "assignee");

  const rows = await db
    .select({
      lead: leads,
      project: { _id: projects._id, name: projects.name },
      submitter: { _id: submitter._id, name: submitter.name },
      assignee: { _id: assignee._id, name: assignee.name },
    })
    .from(leads)
    .leftJoin(projects, eq(leads.projectId, projects._id))
    .leftJoin(submitter, eq(leads.submittedById, submitter._id))
    .leftJoin(assignee, eq(leads.assignedToId, assignee._id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(leads.updatedAt));

  const result = rows.map(({ lead, project, submitter: sub, assignee: asg }) => ({
    ...lead,
    projectId: project ?? lead.projectId,
    submittedById: sub ?? lead.submittedById,
    assignedToId: asg ?? lead.assignedToId,
  }));

  res.json({ leads: result });
});

const STAGE_ORDER = ["GENERATED", "ASSIGNED", "CONTACTED", "INTERESTED", "SITE_VISIT", "NEGOTIATION", "BOOKING", "REGISTRATION", "COMPLETED"] as const;

router.post("/", requireRole("CP"), async (req: AuthedRequest, res) => {
  const parsed = createLeadSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });

  const { projectId, clientPhone, confirmDuplicate, ...rest } = parsed.data;
  if (!isValidId(projectId)) return res.status(404).json({ error: "Project not found" });

  const db = getDb();
  const windowStart = new Date(Date.now() - DUPLICATE_LEAD_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const [possibleDuplicate] = await db
    .select({ _id: leads._id })
    .from(leads)
    .where(and(eq(leads.projectId, projectId), eq(leads.clientPhone, clientPhone), gte(leads.createdAt, windowStart)));

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
  const [lead] = await db.select().from(leads).where(eq(leads._id, req.params.id));
  if (!lead) return res.status(404).json({ error: "Lead not found" });

  const user = req.user!;
  if (user.role === "CP" && String(lead.assignedToId) !== user.userId) {
    return res.status(403).json({ error: "You can only update leads assigned to you" });
  }
  if (user.role === "DEVELOPER") {
    const [project] = await db.select().from(projects).where(eq(projects._id, lead.projectId));
    if (!project || String(project.developerId) !== user.userId) {
      return res.status(403).json({ error: "Not your project's lead" });
    }
  }

  const newStage = parsed.data.stage;
  const currentIdx = STAGE_ORDER.indexOf(lead.stage as any);
  const newIdx = STAGE_ORDER.indexOf(newStage as any);
  const bookingIdx = STAGE_ORDER.indexOf("BOOKING");

  // CPs manage their pipeline freely (Kanban drag-and-drop, forward or back),
  // with two guardrails: only Admin/Developer can mark a lead Booked, and
  // post-booking stages are unreachable until the lead has actually booked.
  if (user.role === "CP" && newStage !== "LOST") {
    if (newStage === "BOOKING") {
      return res.status(403).json({ error: "Only an Admin or Developer can mark a lead as Booked" });
    }
    if (newIdx > bookingIdx && currentIdx < bookingIdx) {
      return res.status(400).json({ error: "Lead must be Booked before it can move to Registration or Completed" });
    }
  }

  const [updated] = await db
    .update(leads)
    .set({ stage: newStage as LeadStage })
    .where(eq(leads._id, lead._id))
    .returning();

  // Timeline: record the stage change so the CRM Buyer Timeline shows it.
  // Best-effort — a missing table (pre-boot-SQL deploy) must not fail the move.
  try {
    await db.insert(leadActivities).values({
      leadId: lead._id,
      cpId: (lead.assignedToId || lead.submittedById) as string,
      type: "STAGE_CHANGE",
      content: `Stage moved from ${lead.stage} to ${newStage}`,
      metadata: { from: lead.stage, to: newStage, by: user.userId },
    });
  } catch {
    /* non-fatal */
  }

  await logAudit({ userId: user.userId, action: "lead.stage.update", resourceType: "lead", resourceId: String(lead._id), metadata: { from: lead.stage, to: newStage, client: lead.clientName } });
  emitLeadUpdate(updated);
  res.json({ lead: updated });
});

export default router;
