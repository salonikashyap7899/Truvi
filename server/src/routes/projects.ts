import { Router } from "express";
import { z } from "zod";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "../config/db";
import { isValidId } from "../lib/ids";
import { createProjectSchema } from "../lib/validations/inventory";
import { authenticate, requireRole, AuthedRequest } from "../middleware/auth";
import { expireStaleLocks } from "../services/inventoryService";
import { projects, units, leads, users } from "../db/schema";

const router = Router();
router.use(authenticate);

router.get("/", async (req: AuthedRequest, res) => {
  await expireStaleLocks();

  const db = getDb();
  const { city } = req.query;
  const user = req.user!;
  if (user.role === "CP" && user.onboardingVerified !== true) {
    return res.status(403).json({ error: "Complete onboarding verification to access project details" });
  }

  const conds = [];
  if (user.role === "DEVELOPER") {
    conds.push(eq(projects.developerId, user.userId));
  } else {
    conds.push(eq(projects.approvalStatus, "APPROVED"));
    if (city) conds.push(eq(projects.city, String(city)));
  }

  // FEATURED listings surface first, then newest.
  const rows = await db
    .select()
    .from(projects)
    .where(and(...conds))
    .orderBy(sql`CASE WHEN ${projects.listingTier} = 'FEATURED' THEN 0 ELSE 1 END`, desc(projects.createdAt));

  const projectIds = rows.map((project) => project._id);

  const [unitCounts, leadCounts] = await Promise.all([
    projectIds.length
      ? db.select({ projectId: units.projectId, count: sql<number>`count(*)::int` }).from(units).where(inArray(units.projectId, projectIds)).groupBy(units.projectId)
      : Promise.resolve([] as { projectId: string; count: number }[]),
    projectIds.length
      ? db.select({ projectId: leads.projectId, count: sql<number>`count(*)::int` }).from(leads).where(inArray(leads.projectId, projectIds)).groupBy(leads.projectId)
      : Promise.resolve([] as { projectId: string; count: number }[]),
  ]);

  const unitCountMap = new Map(unitCounts.map((item) => [String(item.projectId), item.count]));
  const leadCountMap = new Map(leadCounts.map((item) => [String(item.projectId), item.count]));

  const developerIds = rows.map((project) => project.developerId);
  const developers = developerIds.length
    ? await db.select({ _id: users._id, name: users.name, developerProfile: users.developerProfile }).from(users).where(inArray(users._id, developerIds))
    : [];
  const developerMap = new Map(developers.map((dev) => [String(dev._id), dev]));

  const [buyer] =
    user.role === "BUYER"
      ? await db.select({ buyerProfile: users.buyerProfile }).from(users).where(eq(users._id, user.userId)).limit(1)
      : [undefined];

  const enriched = rows.map((project) => {
    const developer = developerMap.get(String(project.developerId)) || null;
    const isSaved = Boolean(
      buyer?.buyerProfile?.savedProjectIds?.some((id) => String(id) === String(project._id)),
    );
    const isCompared = Boolean(
      buyer?.buyerProfile?.compareProjectIds?.some((id) => String(id) === String(project._id)),
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
  const [project] = await db.select().from(projects).where(eq(projects._id, req.params.id)).limit(1);
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
    .where(eq(users._id, project.developerId))
    .limit(1);
  const projectUnits = await db.select().from(units).where(eq(units.projectId, project._id)).orderBy(asc(units.unitNumber));

  res.json({ project: { ...project, developerId: developer || project.developerId }, units: projectUnits });
});

const updateProjectSchema = z.object({
  brochureUrl: z.string().url().optional(),
  priceListUrl: z.string().url().optional(),
  description: z.string().min(10).optional(),
  commissionPercent: z.number().min(0).max(20).optional(),
});

router.patch("/:id", requireRole("DEVELOPER", "ADMIN"), async (req: AuthedRequest, res) => {
  const parsed = updateProjectSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });

  if (!isValidId(req.params.id)) return res.status(404).json({ error: "Project not found" });

  const db = getDb();
  const [project] = await db.select().from(projects).where(eq(projects._id, req.params.id)).limit(1);
  if (!project) return res.status(404).json({ error: "Project not found" });
  if (req.user!.role === "DEVELOPER" && String(project.developerId) !== req.user!.userId) {
    return res.status(403).json({ error: "Not your project" });
  }

  const [updated] = await db.update(projects).set(parsed.data).where(eq(projects._id, project._id)).returning();
  res.json({ project: updated });
});

router.post("/", requireRole("DEVELOPER"), async (req: AuthedRequest, res) => {
  const parsed = createProjectSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });

  const db = getDb();
  const [project] = await db
    .insert(projects)
    .values({
      name: parsed.data.name,
      description: parsed.data.description,
      city: parsed.data.city,
      location: parsed.data.location,
      reraNumber: parsed.data.reraNumber || null,
      commissionPercent: parsed.data.commissionPercent,
      brochureUrl: parsed.data.brochureUrl || null,
      priceListUrl: parsed.data.priceListUrl || null,
      developerId: req.user!.userId,
      approvalStatus: "PENDING",
    })
    .returning();

  res.status(201).json({ project });
});

export default router;
