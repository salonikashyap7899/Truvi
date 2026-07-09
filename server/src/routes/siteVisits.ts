import { Router } from "express";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../config/db";
import { siteVisits, leads, projects, users, type ISiteVisit, type ILead, type IProject, type IUser, type SiteVisitStatus } from "../db/schema";
import { createSiteVisitSchema, confirmAttendanceSchema, siteVisitReportSchema } from "../lib/validations/leads";
import { isValidId } from "../lib/ids";
import { authenticate, requireRole, AuthedRequest } from "../middleware/auth";
import { upload, fileUrl } from "../services/uploadService";

const router = Router();
router.use(authenticate);

interface SiteVisitJoinRow {
  siteVisit: ISiteVisit;
  lead: Pick<ILead, "_id" | "clientName" | "clientPhone"> | null;
  project: Pick<IProject, "_id" | "name"> | null;
  cp: Pick<IUser, "_id" | "name"> | null;
}

function shapeSiteVisit(row: SiteVisitJoinRow) {
  return {
    ...row.siteVisit,
    leadId: row.lead ? { _id: row.lead._id, clientName: row.lead.clientName, clientPhone: row.lead.clientPhone } : row.siteVisit.leadId,
    projectId: row.project ? { _id: row.project._id, name: row.project.name } : row.siteVisit.projectId,
    cpId: row.cp ? { _id: row.cp._id, name: row.cp.name } : row.siteVisit.cpId,
  };
}

router.get("/", async (req: AuthedRequest, res) => {
  const db = getDb();
  const { status } = req.query;
  const user = req.user!;

  const conds = [];
  if (status) conds.push(eq(siteVisits.status, status as SiteVisitStatus));
  if (user.role === "CP") conds.push(eq(siteVisits.cpId, user.userId));
  else if (user.role === "BUYER") conds.push(eq(siteVisits.buyerId, user.userId));
  else if (user.role === "DEVELOPER") conds.push(eq(projects.developerId, user.userId));

  const rows = await db
    .select({
      siteVisit: siteVisits,
      lead: { _id: leads._id, clientName: leads.clientName, clientPhone: leads.clientPhone },
      project: { _id: projects._id, name: projects.name },
      cp: { _id: users._id, name: users.name },
    })
    .from(siteVisits)
    .leftJoin(leads, eq(siteVisits.leadId, leads._id))
    .leftJoin(projects, eq(siteVisits.projectId, projects._id))
    .leftJoin(users, eq(siteVisits.cpId, users._id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(siteVisits.scheduledAt));

  res.json({ siteVisits: rows.map(shapeSiteVisit) });
});

router.post("/", requireRole("CP", "BUYER"), async (req: AuthedRequest, res) => {
  const parsed = createSiteVisitSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });

  const db = getDb();

  if (req.user!.role === "CP") {
    if (!parsed.data.leadId) return res.status(400).json({ error: "leadId is required for CP site visits" });

    const [siteVisit] = await db
      .insert(siteVisits)
      .values({
        leadId: parsed.data.leadId,
        projectId: parsed.data.projectId,
        cpId: req.user!.userId,
        scheduledAt: new Date(parsed.data.scheduledAt),
        reportNotes: parsed.data.notes || null,
      })
      .returning();

    if (isValidId(parsed.data.leadId)) {
      await db.update(leads).set({ stage: "SITE_VISIT" }).where(eq(leads._id, parsed.data.leadId)).catch(() => null);
    }

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
      timeSlot: parsed.data.timeSlot || null,
      contactNumber: parsed.data.contactNumber || null,
      reportNotes: parsed.data.notes || null,
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
    .where(and(eq(siteVisits._id, req.params.id), eq(siteVisits.cpId, req.user!.userId)))
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
    .where(and(eq(siteVisits._id, req.params.id), eq(siteVisits.cpId, req.user!.userId)))
    .limit(1);
  if (!visit) return res.status(404).json({ error: "Site visit not found" });
  if (!req.file) return res.status(400).json({ error: "No photo uploaded" });

  const url = fileUrl(req.file.filename);
  const reportNotes = (visit.reportNotes || "") + `\n[Photo attached: ${url}]`;
  const [updated] = await db.update(siteVisits).set({ reportNotes }).where(eq(siteVisits._id, visit._id)).returning();

  res.json({ photoUrl: url, siteVisit: updated });
});

router.patch("/:id/report", requireRole("CP"), async (req: AuthedRequest, res) => {
  const parsed = siteVisitReportSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });
  if (!isValidId(req.params.id)) return res.status(404).json({ error: "Site visit not found" });

  const db = getDb();
  const [visit] = await db
    .select()
    .from(siteVisits)
    .where(and(eq(siteVisits._id, req.params.id), eq(siteVisits.cpId, req.user!.userId)))
    .limit(1);
  if (!visit) return res.status(404).json({ error: "Site visit not found" });

  const [updated] = await db
    .update(siteVisits)
    .set({ reportNotes: parsed.data.reportNotes, nextSteps: parsed.data.nextSteps || null })
    .where(eq(siteVisits._id, visit._id))
    .returning();

  if (parsed.data.newLeadStage && visit.leadId) {
    await db.update(leads).set({ stage: parsed.data.newLeadStage }).where(eq(leads._id, visit.leadId));
  }

  res.json({ siteVisit: updated });
});

export default router;
