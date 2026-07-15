import { Router } from "express";
import { z } from "zod";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "../config/db";
import { projects, units, leads, users } from "../db/schema";
import { isValidId } from "../lib/ids";
import { createProjectSchema } from "../lib/validations/inventory";
import { authenticate, requireRole, AuthedRequest } from "../middleware/auth";
import { expireStaleLocks } from "../services/inventoryService";

const router = Router();
router.use(authenticate);

router.get("/", async (req: AuthedRequest, res) => {
  await expireStaleLocks();

  const { city } = req.query;
  const user = req.user!;
  if (user.role === "CP" && user.onboardingVerified !== true) {
    return res.status(403).json({ error: "Complete onboarding verification to access project details" });
  }

  const db = getDb();
  const conditions =
    user.role === "DEVELOPER"
      ? [eq(projects.developerId, user.userId)]
      : [
          eq(projects.approvalStatus, "APPROVED"),
          ...(city ? [eq(projects.city, String(city))] : []),
        ];

  const rows = await db
    .select()
    .from(projects)
    .where(and(...conditions))
    .orderBy(desc(projects.listingTier), desc(projects.createdAt));

  const projectIds = rows.map((project) => project._id);

  const [unitCounts, leadCounts] = await Promise.all([
    projectIds.length
      ? db
          .select({ projectId: units.projectId, count: sql<number>`count(*)::int` })
          .from(units)
          .where(inArray(units.projectId, projectIds))
          .groupBy(units.projectId)
      : Promise.resolve([]),
    projectIds.length
      ? db
          .select({ projectId: leads.projectId, count: sql<number>`count(*)::int` })
          .from(leads)
          .where(inArray(leads.projectId, projectIds))
          .groupBy(leads.projectId)
      : Promise.resolve([]),
  ]);

  const unitCountMap = new Map(unitCounts.map((item) => [String(item.projectId), item.count]));
  const leadCountMap = new Map(leadCounts.map((item) => [String(item.projectId), item.count]));

  const developerIds = [...new Set(rows.map((project) => project.developerId))];
  const developers = developerIds.length
    ? await db
        .select({ _id: users._id, name: users.name, developerProfile: users.developerProfile })
        .from(users)
        .where(inArray(users._id, developerIds))
    : [];
  const developerMap = new Map(developers.map((dev) => [String(dev._id), dev]));

  let buyerProfile: { savedProjectIds?: string[]; compareProjectIds?: string[] } | null = null;
  if (user.role === "BUYER") {
    const [buyer] = await db
      .select({ buyerProfile: users.buyerProfile })
      .from(users)
      .where(eq(users._id, user.userId));
    buyerProfile = buyer?.buyerProfile ?? null;
  }

  const enriched = rows.map((project) => {
    const developer = developerMap.get(String(project.developerId)) || null;
    const isSaved = Boolean(
      buyerProfile?.savedProjectIds?.some((id) => String(id) === String(project._id)),
    );
    const isCompared = Boolean(
      buyerProfile?.compareProjectIds?.some((id) => String(id) === String(project._id)),
    );

    return {
      ...project,
      developerId: developer,
      unitCount: unitCountMap.get(String(project._id)) || 0,
      leadCount: leadCountMap.get(String(project._id)) || 0,
      isSaved,
      isCompared,
    };
  });

  res.json({ projects: enriched });
});

router.get("/:id", async (req: AuthedRequest, res) => {
  if (!isValidId(req.params.id)) return res.status(404).json({ error: "Project not found" });

  const db = getDb();
  const [project] = await db.select().from(projects).where(eq(projects._id, req.params.id));
  if (!project) return res.status(404).json({ error: "Project not found" });

  const userRole = req.user?.role;
  if (userRole === "CP" && req.user?.onboardingVerified !== true) {
    return res.status(403).json({ error: "Complete onboarding verification to access project details" });
  }
  if (userRole && userRole !== "ADMIN" && userRole !== "DEVELOPER" && project.approvalStatus !== "APPROVED") {
    return res.status(404).json({ error: "Project not found" });
  }

  const [developer] = await db
    .select({ _id: users._id, name: users.name, developerProfile: users.developerProfile })
    .from(users)
    .where(eq(users._id, project.developerId));
  const unitRows = await db
    .select()
    .from(units)
    .where(eq(units.projectId, project._id))
    .orderBy(asc(units.unitNumber));

  res.json({ project: { ...project, developerId: developer || project.developerId }, units: unitRows });
});

const updateProjectSchema = z.object({
  brochureUrl: z.string().url().optional(),
  priceListUrl: z.string().url().optional(),
  description: z.string().min(10).optional(),
  commissionPercent: z.number().min(0).max(20).optional(),
  // Developer-editable project details.
  name: z.string().min(2).optional(),
  city: z.string().min(2).optional(),
  location: z.string().min(2).optional(),
  reraNumber: z.string().max(60).or(z.literal("")).optional(),
  reraStatus: z.enum(["REGISTERED", "PENDING", "NOT_REGISTERED"]).optional(),
  reraValidityDate: z.string().datetime().or(z.literal("")).nullable().optional(),
  possessionDate: z.string().datetime().or(z.literal("")).nullable().optional(),
  salesContact: z
    .object({
      name: z.string().max(80).optional(),
      phone: z.string().max(20).optional(),
      email: z.string().email().or(z.literal("")).optional(),
    })
    .optional(),
});

router.patch("/:id", requireRole("DEVELOPER", "ADMIN"), async (req: AuthedRequest, res) => {
  const parsed = updateProjectSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });

  if (!isValidId(req.params.id)) return res.status(404).json({ error: "Project not found" });

  const db = getDb();
  const [project] = await db.select().from(projects).where(eq(projects._id, req.params.id));
  if (!project) return res.status(404).json({ error: "Project not found" });
  if (req.user!.role === "DEVELOPER" && String(project.developerId) !== req.user!.userId) {
    return res.status(403).json({ error: "Not your project" });
  }

  const d = parsed.data;
  const update: Record<string, unknown> = {};
  for (const k of ["brochureUrl", "priceListUrl", "description", "commissionPercent", "name", "city", "location", "reraStatus", "salesContact"] as const) {
    if (d[k] !== undefined) update[k] = d[k];
  }
  if (d.reraNumber !== undefined) update.reraNumber = d.reraNumber || null;
  if (d.reraValidityDate !== undefined) update.reraValidityDate = d.reraValidityDate ? new Date(d.reraValidityDate) : null;
  if (d.possessionDate !== undefined) update.possessionDate = d.possessionDate ? new Date(d.possessionDate) : null;

  const [updated] = await db
    .update(projects)
    .set(update)
    .where(eq(projects._id, project._id))
    .returning();
  res.json({ project: updated });
});

router.post("/", requireRole("DEVELOPER"), async (req: AuthedRequest, res) => {
  const parsed = createProjectSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });

  const db = getDb();
  const { possessionDate, ...rest } = parsed.data;
  const [project] = await db
    .insert(projects)
    .values({
      ...rest,
      possessionDate: possessionDate ? new Date(possessionDate) : undefined,
      brochureUrl: parsed.data.brochureUrl || undefined,
      priceListUrl: parsed.data.priceListUrl || undefined,
      developerId: req.user!.userId,
      approvalStatus: "PENDING",
    })
    .returning();

  res.status(201).json({ project });
});

export default router;
