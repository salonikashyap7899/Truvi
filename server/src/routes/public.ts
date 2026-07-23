import { Router } from "express";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "../config/db";
import { projects, projectAssets, units, users } from "../db/schema";

/**
 * Unauthenticated, read-only platform stats for the public landing page.
 * Every number is computed live from the database — no seeded or hard-coded
 * figures — so the marketing site can only ever show what is genuinely true.
 */
const router = Router();

router.get("/stats", async (_req, res) => {
  const db = getDb();
  try {
    const [approvedProjects, developerRows, cpRows] = await Promise.all([
      db.select().from(projects).where(eq(projects.approvalStatus, "APPROVED")),
      db.select({ n: sql<number>`count(*)` }).from(users).where(and(eq(users.role, "DEVELOPER"), eq(users.approvalStatus, "APPROVED"))),
      db.select({ n: sql<number>`count(*)` }).from(users).where(eq(users.role, "CP")),
    ]);

    const verifiedProjects = approvedProjects.filter((p) => p.isVerified).length;
    const cities = new Set(approvedProjects.map((p) => p.city).filter(Boolean)).size;

    res.json({
      verifiedProjects,
      liveProjects: approvedProjects.length,
      developers: Number(developerRows[0]?.n ?? 0),
      channelPartners: Number(cpRows[0]?.n ?? 0),
      cities,
    });
  } catch {
    // The landing page treats stats as best-effort; never break page render.
    res.json({ verifiedProjects: 0, liveProjects: 0, developers: 0, channelPartners: 0, cities: 0 });
  }
});

/**
 * Public project showcase for the marketing homepage. Returns approved
 * projects (verified + prime first) with the developer's uploaded cover photo,
 * so the site fills itself as developers onboard — no stock imagery needed.
 */
router.get("/projects", async (req, res) => {
  const db = getDb();
  const limit = Math.min(Number(req.query.limit) || 8, 24);
  try {
    const rows = await db
      .select({ project: projects, developer: { _id: users._id, name: users.name } })
      .from(projects)
      .leftJoin(users, eq(projects.developerId, users._id))
      .where(eq(projects.approvalStatus, "APPROVED"))
      .orderBy(desc(projects.isVerified), desc(projects.isPrimeListing), desc(projects.createdAt));

    const ids = rows.map((r) => r.project._id);
    if (ids.length === 0) return res.json({ projects: [] });

    // Featured cover per project: AI visual-quality score first, then highest
    // resolution, then newest — so the best photo automatically leads.
    const coverRows = await db
      .select({ projectId: projectAssets.projectId, fileUrl: projectAssets.fileUrl })
      .from(projectAssets)
      .where(and(inArray(projectAssets.projectId, ids), eq(projectAssets.category, "GALLERY_IMAGE"), eq(projectAssets.verified, true)))
      .orderBy(sql`${projectAssets.aiScore} desc nulls last`, desc(projectAssets.sizeBytes), desc(projectAssets.createdAt));
    const coverMap = new Map<string, string>();
    for (const c of coverRows) if (!coverMap.has(String(c.projectId))) coverMap.set(String(c.projectId), c.fileUrl);

    // Cheapest ₹/sq ft per project for a "from" price.
    const unitRows = await db.select({ projectId: units.projectId, price: units.price, areaSqft: units.areaSqft }).from(units).where(inArray(units.projectId, ids));
    const rateMap = new Map<string, number>();
    for (const u of unitRows) {
      if (!u.areaSqft || u.areaSqft <= 0) continue;
      const rate = u.price / u.areaSqft;
      const cur = rateMap.get(String(u.projectId));
      if (cur === undefined || rate < cur) rateMap.set(String(u.projectId), rate);
    }

    // Prefer projects that already have a photo — they look best on the homepage.
    const mapped = rows.map(({ project: p, developer }) => ({
      _id: p._id,
      name: p.name,
      city: p.city,
      location: p.location,
      developer: developer?.name ?? null,
      isVerified: p.isVerified,
      listingTier: p.listingTier,
      isPrimeListing: p.isPrimeListing,
      reraNumber: p.reraNumber ?? null,
      coverImageUrl: coverMap.get(String(p._id)) ?? null,
      minRate: rateMap.has(String(p._id)) ? Math.round(rateMap.get(String(p._id))!) : null,
    }));
    mapped.sort((a, b) => Number(Boolean(b.coverImageUrl)) - Number(Boolean(a.coverImageUrl)));

    res.json({ projects: mapped.slice(0, limit) });
  } catch {
    res.json({ projects: [] });
  }
});

export default router;
