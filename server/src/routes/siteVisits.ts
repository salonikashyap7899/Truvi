import { Router } from "express";
import { and, desc, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb } from "../config/db";
import { siteVisits, leads, projects, users, notifications, SiteVisitStatus, LeadStage } from "../db/schema";
import { isValidId } from "../lib/ids";
import { createSiteVisitSchema, confirmAttendanceSchema, siteVisitReportSchema } from "../lib/validations/leads";
import { authenticate, requireRole, AuthedRequest } from "../middleware/auth";
import { upload, fileUrl } from "../services/uploadService";
import { emitNotification } from "../sockets";

const router = Router();
router.use(authenticate);

router.get("/", async (req: AuthedRequest, res) => {
  const { status } = req.query;
  const user = req.user!;
  const db = getDb();
  const conditions = [];
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

  const cp = alias(users, "cp");
  const rows = await db
    .select({
      visit: siteVisits,
      lead: { _id: leads._id, clientName: leads.clientName, clientPhone: leads.clientPhone },
      project: { _id: projects._id, name: projects.name },
      cp: { _id: cp._id, name: cp.name },
    })
    .from(siteVisits)
    .leftJoin(leads, eq(siteVisits.leadId, leads._id))
    .leftJoin(projects, eq(siteVisits.projectId, projects._id))
    .leftJoin(cp, eq(siteVisits.cpId, cp._id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(siteVisits.scheduledAt));

  const result = rows.map(({ visit, lead, project, cp: cpUser }) => ({
    ...visit,
    leadId: lead ?? visit.leadId,
    projectId: project ?? visit.projectId,
    cpId: cpUser ?? visit.cpId,
  }));

  res.json({ siteVisits: result });
});

router.post("/", requireRole("CP", "BUYER"), async (req: AuthedRequest, res) => {
  const parsed = createSiteVisitSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });

  if (!isValidId(parsed.data.projectId)) return res.status(404).json({ error: "Project not found" });
  const db = getDb();

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
      .set({ stage: "SITE_VISIT" as LeadStage })
      .where(eq(leads._id, parsed.data.leadId))
      .catch(() => null);

    return res.status(201).json({ siteVisit });
  }

  const [project] = await db.select().from(projects).where(eq(projects._id, parsed.data.projectId));
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

  // Alert admins in real time (notification bell + toast) about the new booking.
  // A failure here must never block the buyer's booking, so it's best-effort.
  try {
    const [buyer] = await db.select({ name: users.name }).from(users).where(eq(users._id, req.user!.userId));
    const admins = await db.select({ _id: users._id }).from(users).where(eq(users.role, "ADMIN"));
    if (admins.length) {
      const when = new Date(parsed.data.scheduledAt).toLocaleString("en-IN");
      const slot = parsed.data.timeSlot ? ` (${parsed.data.timeSlot})` : "";
      const message = `New site-visit booking: ${buyer?.name || "A buyer"} booked "${project.name}" for ${when}${slot}.`;
      const rows = await db
        .insert(notifications)
        .values(admins.map((a) => ({ userId: a._id, message })))
        .returning();
      rows.forEach((n) => emitNotification(String(n.userId), n));
    }
  } catch {
    /* non-fatal: booking already succeeded */
  }

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
    .where(and(eq(siteVisits._id, req.params.id), eq(siteVisits.cpId, req.user!.userId)));
  if (!visit) return res.status(404).json({ error: "Site visit not found" });
  if (!req.file) return res.status(400).json({ error: "No photo uploaded" });

  const url = fileUrl(req.file.filename);
  const reportNotes = (visit.reportNotes || "") + `\n[Photo attached: ${url}]`;
  const [updated] = await db
    .update(siteVisits)
    .set({ reportNotes })
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
    .set({
      reportNotes: parsed.data.reportNotes,
      nextSteps: parsed.data.nextSteps || undefined,
    })
    .where(and(eq(siteVisits._id, req.params.id), eq(siteVisits.cpId, req.user!.userId)))
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
