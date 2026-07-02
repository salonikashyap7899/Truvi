import { Router } from "express";
import { SiteVisit } from "../models/SiteVisit";
import { Lead } from "../models/Lead";
import { Project } from "../models/Project";
import { createSiteVisitSchema, confirmAttendanceSchema, siteVisitReportSchema } from "../lib/validations/leads";
import { authenticate, requireRole, AuthedRequest } from "../middleware/auth";
import { upload, fileUrl } from "../services/uploadService";

const router = Router();
router.use(authenticate);

router.get("/", async (req: AuthedRequest, res) => {
  const { status } = req.query;
  const user = req.user!;
  const filter: Record<string, unknown> = status ? { status } : {};

  if (user.role === "CP") filter.cpId = user.userId;
  else if (user.role === "BUYER") filter.buyerId = user.userId;
  else if (user.role === "DEVELOPER") {
    const myProjectIds = await Project.find({ developerId: user.userId }).distinct("_id");
    filter.projectId = { $in: myProjectIds };
  }

  const siteVisits = await SiteVisit.find(filter)
    .populate("leadId", "clientName clientPhone")
    .populate("projectId", "name")
    .populate("cpId", "name")
    .sort({ scheduledAt: -1 });

  res.json({ siteVisits });
});

router.post("/", requireRole("CP", "BUYER"), async (req: AuthedRequest, res) => {
  const parsed = createSiteVisitSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });

  if (req.user!.role === "CP") {
    if (!parsed.data.leadId) return res.status(400).json({ error: "leadId is required for CP site visits" });

    const siteVisit = await SiteVisit.create({
      leadId: parsed.data.leadId,
      projectId: parsed.data.projectId,
      cpId: req.user!.userId,
      scheduledAt: new Date(parsed.data.scheduledAt),
      reportNotes: parsed.data.notes || undefined,
    });

    await Lead.findByIdAndUpdate(parsed.data.leadId, { stage: "SITE_VISIT" }).catch(() => null);

    return res.status(201).json({ siteVisit });
  }

  const project = await Project.findById(parsed.data.projectId);
  if (!project || project.approvalStatus !== "APPROVED") {
    return res.status(404).json({ error: "Project not found" });
  }

  const siteVisit = await SiteVisit.create({
    projectId: parsed.data.projectId,
    buyerId: req.user!.userId,
    scheduledAt: new Date(parsed.data.scheduledAt),
    reportNotes: parsed.data.notes || undefined,
  });

  res.status(201).json({ siteVisit });
});

// Geo-verified attendance confirmation
router.patch("/:id/attendance", requireRole("CP"), async (req: AuthedRequest, res) => {
  const parsed = confirmAttendanceSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });

  const visit = await SiteVisit.findOne({ _id: req.params.id, cpId: req.user!.userId });
  if (!visit) return res.status(404).json({ error: "Site visit not found" });

  visit.attendanceConfirmed = true;
  visit.geoVerifiedLat = parsed.data.lat;
  visit.geoVerifiedLng = parsed.data.lng;
  visit.status = "COMPLETED";
  await visit.save();

  res.json({ siteVisit: visit });
});

// Photo upload for the visit (new "better feature" vs the Next.js MVP,
// which only accepted URL strings for attachments).
router.post("/:id/photo", requireRole("CP"), upload.single("photo"), async (req: AuthedRequest, res) => {
  const visit = await SiteVisit.findOne({ _id: req.params.id, cpId: req.user!.userId });
  if (!visit) return res.status(404).json({ error: "Site visit not found" });
  if (!req.file) return res.status(400).json({ error: "No photo uploaded" });

  const url = fileUrl(req.file.filename);
  visit.reportNotes = (visit.reportNotes || "") + `\n[Photo attached: ${url}]`;
  await visit.save();

  res.json({ photoUrl: url, siteVisit: visit });
});

router.patch("/:id/report", requireRole("CP"), async (req: AuthedRequest, res) => {
  const parsed = siteVisitReportSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });

  const visit = await SiteVisit.findOne({ _id: req.params.id, cpId: req.user!.userId });
  if (!visit) return res.status(404).json({ error: "Site visit not found" });

  visit.reportNotes = parsed.data.reportNotes;
  visit.nextSteps = parsed.data.nextSteps || undefined;
  await visit.save();

  if (parsed.data.newLeadStage) {
    await Lead.findByIdAndUpdate(visit.leadId, { stage: parsed.data.newLeadStage });
  }

  res.json({ siteVisit: visit });
});

export default router;
