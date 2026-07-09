import { Router } from "express";
import { and, desc, eq, inArray, SQL } from "drizzle-orm";
import { getDb } from "../config/db";
import { siteVisits, leads, projects, users, SiteVisitStatus, LeadStage } from "../db/schema";
import { isValidId } from "../lib/ids";
import { createSiteVisitSchema, confirmAttendanceSchema, siteVisitReportSchema } from "../lib/validations/leads";
import { authenticate, requireRole, AuthedRequest } from "../middleware/auth";
import { upload, fileUrl } from "../services/uploadService";

const router = Router();
router.use(authenticate);

router.get("/", async (req: AuthedRequest, res) => {
  const { status } = req.query;
  const user = req.user!;
  const db = getDb();
  const conditions: SQL[] = [];
  if (status) conditions.push(eq(siteVisits.status, String(status) as SiteVisitStatus));

  if (user.role === "CP") conditions.push(eq(siteVisits.cpId, user.userId));
  else if (user.role === "BUYER") conditions.push(eq(siteVisits.buyerId, user.userId));
  else if (user.role === "DEVELOPER") {
    const myProjects = await db
      .select({ _id: projects._id })
      .from(projects)
      .where(eq(projects.developerId, user.userId));
    const myProjectIds = myProjects.map((p) => p._id);
    if (myProjectIds.length === 0) return res.json({ siteVisits: [] });
    conditions.push(inArray(siteVisits.projectId, myProjectIds));
  }

  // Replicates populate("leadId", "clientName clientPhone") + populate("projectId", "name")
  // + populate("cpId", "name"): foreign keys become nested objects.
  const rows = await db
    .select({
      visit: siteVisits,
      leadRefId: leads._id,
      leadClientName: leads.clientName,
      leadClientPhone: leads.clientPhone,
      projectRefId: projects._id,
      projectName: projects.name,
      cpRefId: users._id,
      cpName: users.name,
    })
    .from(siteVisits)
    .leftJoin(leads, eq(siteVisits.leadId, leads._id))
    .leftJoin(projects, eq(siteVisits.projectId, projects._id))
    .leftJoin(users, eq(siteVisits.cpId, users._id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(siteVisits.scheduledAt));

  const enriched = rows.map((row) => ({
    ...row.visit,
    leadId: row.leadRefId
      ? { _id: row.leadRefId, clientName: row.leadClientName, clientPhone: row.leadClientPhone }
      : row.visit.leadId,
    projectId: row.projectRefId ? { _id: row.projectRefId, name: row.projectName } : row.visit.projectId,
    cpId: row.cpRefId ? { _id: row.cpRefId, name: row.cpName } : row.visit.cpId,
  }));

  res.json({ siteVisits: enriched });
});

router.post("/", requireRole("CP", "BUYER"), async (req: AuthedRequest, res) => {
  const parsed = createSiteVisitSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });

  const db = getDb();
  if (!isValidId(parsed.data.projectId)) return res.status(404).json({ error: "Project not found" });

  if (req.user!.role === "CP") {
    if (!parsed.data.leadId) return res.status(400).json({ error: "leadId is required for CP site visits" });
    if (!isValidId(parsed.data.leadId)) return res.status(404).json({ error: "Lead not found" });

    const [siteVisit] = await db
      .insert(siteVisits)
      .values({
        leadId: parsed.data.leadId,
        projectId: parsed.data.projectId,
        cpId: req.user!.userId,
        scheduledAt: new Date(parsed.data.scheduledAt),
        reportNotes: parsed.data.notes || undefined,
      })
      .returning();

    await db
      .update(leads)
      .set({ stage: "SITE_VISIT" })
      .where(eq(leads._id, parsed.data.leadId))
      .catch(() => null);

    return res.status(201).json({ siteVisit });
  }

  const [project] = await db.select().from(projects).where(eq(projects._id, parsed.data.projectId)).limit(1);
  if (!project || project.approvalStatus !== "APPROVED") {
    return res.status(404).json({ error: "Project not found" });
  }

  const [siteVisit] = await db
    .insert(siteVisits)
    .values({
      projectId: parsed.data.projectId,
      buyerId: req.user!.userId,
      scheduledAt: new Date(parsed.data.scheduledAt),
      timeSlot: parsed.data.timeSlot || undefined,
      contactNumber: parsed.data.contactNumber || undefined,
      reportNotes: parsed.data.notes || undefined,
    })
    .returning();

  res.status(201).json({ siteVisit });
});

// Geo-verified attendance confirmation
router.patch("/:id/attendance", requireRole("CP"), async (req: AuthedRequest, res) => {
  const parsed = confirmAttendanceSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });

  if (!isValidId(req.params.id)) return res.status(404).json({ error: "Site visit not found" });
  const db = getDb();
  const [visit] = await db
    .update(siteVisits)
    .set({
      attendanceConfirmed: true,
      geoVerifiedLat: parsed.data.lat,
      geoVerifiedLng: parsed.data.lng,
      status: "COMPLETED",
    })
    .where(and(eq(siteVisits._id, req.params.id as string), eq(siteVisits.cpId, req.user!.userId)))
    .returning();
  if (!visit) return res.status(404).json({ error: "Site visit not found" });

  res.json({ siteVisit: visit });
});

// Photo upload for the visit (new "better feature" vs the Next.js MVP,
// which only accepted URL strings for attachments).
router.post("/:id/photo", requireRole("CP"), upload.single("photo"), async (req: AuthedRequest, res) => {
  if (!isValidId(req.params.id)) return res.status(404).json({ error: "Site visit not found" });
  const db = getDb();
  const [visit] = await db
    .select()
    .from(siteVisits)
    .where(and(eq(siteVisits._id, req.params.id as string), eq(siteVisits.cpId, req.user!.userId)))
    .limit(1);
  if (!visit) return res.status(404).json({ error: "Site visit not found" });
  if (!req.file) return res.status(400).json({ error: "No photo uploaded" });

  const url = fileUrl(req.file.filename);
  const [updated] = await db
    .update(siteVisits)
    .set({ reportNotes: (visit.reportNotes || "") + `\n[Photo attached: ${url}]` })
    .where(eq(siteVisits._id, visit._id))
    .returning();

  res.json({ photoUrl: url, siteVisit: updated });
});

router.patch("/:id/report", requireRole("CP"), async (req: AuthedRequest, res) => {
  const parsed = siteVisitReportSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });

  if (!isValidId(req.params.id)) return res.status(404).json({ error: "Site visit not found" });
  const db = getDb();
  const [visit] = await db
    .update(siteVisits)
    .set({ reportNotes: parsed.data.reportNotes, nextSteps: parsed.data.nextSteps || undefined })
    .where(and(eq(siteVisits._id, req.params.id as string), eq(siteVisits.cpId, req.user!.userId)))
    .returning();
  if (!visit) return res.status(404).json({ error: "Site visit not found" });

  if (parsed.data.newLeadStage && visit.leadId) {
    await db
      .update(leads)
      .set({ stage: parsed.data.newLeadStage as LeadStage })
      .where(eq(leads._id, visit.leadId));
  }

  res.json({ siteVisit: visit });
});

export default router;
