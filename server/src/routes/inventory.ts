import { Router } from "express";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "../config/db";
import { projects, units, users, projectAssets } from "../db/schema";
import { isValidId } from "../lib/ids";
import { buildIntelligenceProfile } from "../services/intelligenceService";
import { fetchRagItemsForProject, fetchRagCountsForProjects } from "../services/ragIntel";

const router = Router();

/** First integer inside a unit number ("32" → 32, "Plot 32" → 32); 0 if none. */
function unitNumberToInt(s: string): number {
  const m = String(s ?? "").match(/\d+/);
  return m ? parseInt(m[0], 10) : 0;
}

/** Plots/units to show for a listing: the developer-declared total, else the
 *  largest numeric unit number entered (developers put the count there), else
 *  the number of unit rows. */
function displayPlotCount(totalUnits: number | null | undefined, maxUnitNo: number, rowCount: number): number {
  if (typeof totalUnits === "number" && totalUnits > 0) return totalUnits;
  if (maxUnitNo > rowCount) return maxUnitNo;
  return rowCount;
}

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
  // Verified gallery media (images + videos) for the listing cover and the
  // swipeable media carousel on each card.
  const MEDIA_PER_PROJECT = 8;
  const coverRows =
    projectIds.length > 0
      ? await db
          .select({
            projectId: projectAssets.projectId,
            fileUrl: projectAssets.fileUrl,
            category: projectAssets.category,
            mimeType: projectAssets.mimeType,
          })
          .from(projectAssets)
          .where(
            and(
              inArray(projectAssets.projectId, projectIds),
              inArray(projectAssets.category, ["GALLERY_IMAGE", "GALLERY_VIDEO"]),
              eq(projectAssets.verified, true),
            ),
          )
          .orderBy(sql`${projectAssets.aiScore} desc nulls last`, desc(projectAssets.sizeBytes), desc(projectAssets.createdAt))
      : [];
  const coverMap = new Map<string, string>();
  const mediaMap = new Map<string, { url: string; type: "image" | "video" }[]>();
  for (const c of coverRows) {
    const id = String(c.projectId);
    const type: "image" | "video" =
      c.category === "GALLERY_VIDEO" || c.mimeType.startsWith("video/") ? "video" : "image";
    // First verified image is the cover.
    if (type === "image" && !coverMap.has(id)) coverMap.set(id, c.fileUrl);
    // Media carousel: images first (already the primary sort), capped per project.
    const list = mediaMap.get(id) ?? [];
    if (list.length < MEDIA_PER_PROJECT) {
      list.push({ url: c.fileUrl, type });
      mediaMap.set(id, list);
    }
  }
  // Put images before videos within each project's carousel.
  for (const [id, list] of mediaMap) {
    mediaMap.set(id, [...list].sort((a, b) => (a.type === b.type ? 0 : a.type === "image" ? -1 : 1)));
  }

  const statsById = new Map<string, { unitCount: number; maxUnitNo: number; minPrice: number | null; maxPrice: number | null; minRate: number | null }>();
  for (const unit of unitRows) {
    const id = String(unit.projectId);
    const existing = statsById.get(id) ?? { unitCount: 0, maxUnitNo: 0, minPrice: null, maxPrice: null, minRate: null };
    const nextMinPrice = existing.minPrice === null || unit.price < existing.minPrice ? unit.price : existing.minPrice;
    const nextMaxPrice = existing.maxPrice === null || unit.price > existing.maxPrice ? unit.price : existing.maxPrice;
    const unitRate = unit.areaSqft > 0 ? unit.price / unit.areaSqft : null;
    const nextMinRate = existing.minRate === null || (unitRate !== null && unitRate < existing.minRate) ? unitRate : existing.minRate;
    // The developer often enters the total plot count as the unit number ("32");
    // track the largest numeric unit number so the card can show that count.
    const num = unitNumberToInt(unit.unitNumber);
    statsById.set(id, {
      unitCount: existing.unitCount + 1,
      maxUnitNo: num > existing.maxUnitNo ? num : existing.maxUnitNo,
      minPrice: nextMinPrice,
      maxPrice: nextMaxPrice,
      minRate: nextMinRate,
    });
  }

  // Live Truvi Score per card — computed the same way as the full breakdown, so
  // the number on the card matches the "Why this score?" panel on the listing.
  const ragCounts = await fetchRagCountsForProjects(db, projectIds);

  const enriched = rows.map(({ project, developer }) => {
    const stats = statsById.get(String(project._id));
    const profile = buildIntelligenceProfile(project, ragCounts.get(String(project._id)) ?? {});
    return {
      ...project,
      developerId: developer ? { _id: developer._id, name: developer.name } : null,
      unitCount: stats?.unitCount ?? 0,
      plotCount: displayPlotCount(project.totalUnits, stats?.maxUnitNo ?? 0, stats?.unitCount ?? 0),
      minPrice: stats?.minPrice ?? null,
      maxPrice: stats?.maxPrice ?? null,
      minRate: stats?.minRate ? Math.round(stats.minRate) : null,
      coverImageUrl: coverMap.get(String(project._id)) ?? null,
      media: mediaMap.get(String(project._id)) ?? [],
      truviScore: profile.ai.confidenceScore,
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

  // Pull the admin-uploaded data points so the breakdown credits them and shows
  // each one's source + verification status.
  const rag = await fetchRagItemsForProject(db, String(project._id));
  res.json({ intelligence: buildIntelligenceProfile(project, rag) });
});

export default router;
