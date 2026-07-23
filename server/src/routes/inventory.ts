import { Router } from "express";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "../config/db";
import { projects, units, users, projectAssets } from "../db/schema";
import { isValidId } from "../lib/ids";
import { buildIntelligenceProfile } from "../services/intelligenceService";

const router = Router();

router.get("/", async (_req, res) => {
  const db = getDb();
  const rows = await db
    .select({
      project: projects,
      developer: { _id: users._id, name: users.name },
    })
    .from(projects)
    .leftJoin(users, eq(projects.developerId, users._id))
    .where(eq(projects.approvalStatus, "APPROVED"))
    .orderBy(desc(projects.isPrimeListing), asc(projects.listingTier), desc(projects.createdAt));

  const projectIds = rows.map((row) => row.project._id);
  const unitRows =
    projectIds.length > 0
      ? await db.select().from(units).where(inArray(units.projectId, projectIds))
      : [];

  // Auto-select the "featured" cover per project: the AI visual-quality score
  // wins; unscored images fall back to highest-resolution, then newest — so
  // uploading a better photo automatically promotes it to the listing cover.
  const coverRows =
    projectIds.length > 0
      ? await db
          .select({ projectId: projectAssets.projectId, fileUrl: projectAssets.fileUrl })
          .from(projectAssets)
          .where(
            and(
              inArray(projectAssets.projectId, projectIds),
              eq(projectAssets.category, "GALLERY_IMAGE"),
              eq(projectAssets.verified, true),
            ),
          )
          .orderBy(sql`${projectAssets.aiScore} desc nulls last`, desc(projectAssets.sizeBytes), desc(projectAssets.createdAt))
      : [];
  const coverMap = new Map<string, string>();
  for (const c of coverRows) {
    if (!coverMap.has(String(c.projectId))) coverMap.set(String(c.projectId), c.fileUrl);
  }

  const statsById = new Map<string, { unitCount: number; minPrice: number | null; maxPrice: number | null; minRate: number | null }>();
  for (const unit of unitRows) {
    const id = String(unit.projectId);
    const existing = statsById.get(id) ?? { unitCount: 0, minPrice: null, maxPrice: null, minRate: null };
    const nextMinPrice = existing.minPrice === null || unit.price < existing.minPrice ? unit.price : existing.minPrice;
    const nextMaxPrice = existing.maxPrice === null || unit.price > existing.maxPrice ? unit.price : existing.maxPrice;
    const unitRate = unit.areaSqft > 0 ? unit.price / unit.areaSqft : null;
    const nextMinRate = existing.minRate === null || (unitRate !== null && unitRate < existing.minRate) ? unitRate : existing.minRate;
    statsById.set(id, {
      unitCount: existing.unitCount + 1,
      minPrice: nextMinPrice,
      maxPrice: nextMaxPrice,
      minRate: nextMinRate,
    });
  }

  const enriched = rows.map(({ project, developer }) => {
    const stats = statsById.get(String(project._id));
    return {
      ...project,
      developerId: developer ? { _id: developer._id, name: developer.name } : null,
      unitCount: stats?.unitCount ?? 0,
      minPrice: stats?.minPrice ?? null,
      maxPrice: stats?.maxPrice ?? null,
      minRate: stats?.minRate ? Math.round(stats.minRate) : null,
      coverImageUrl: coverMap.get(String(project._id)) ?? null,
    };
  });

  res.json({ projects: enriched });
});

// Public visit counter — called once per page view of a listing.
router.post("/:id/view", async (req, res) => {
  if (!isValidId(req.params.id)) return res.status(404).json({ error: "Listing not found" });
  const db = getDb();
  const [row] = await db
    .update(projects)
    .set({ viewCount: sql`${projects.viewCount} + 1` })
    .where(eq(projects._id, req.params.id))
    .returning({ viewCount: projects.viewCount });
  if (!row) return res.status(404).json({ error: "Listing not found" });
  res.json({ viewCount: row.viewCount });
});

router.get("/:id/intelligence", async (req, res) => {
  if (!isValidId(req.params.id)) {
    return res.status(400).json({ error: "Invalid listing id" });
  }
  const db = getDb();
  const [project] = await db.select().from(projects).where(eq(projects._id, req.params.id));
  if (!project || project.approvalStatus !== "APPROVED") return res.status(404).json({ error: "Listing not found" });

  res.json({ intelligence: buildIntelligenceProfile(project) });
});

export default router;
