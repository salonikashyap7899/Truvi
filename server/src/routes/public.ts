import { Router } from "express";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "../config/db";
import { projects, users } from "../db/schema";

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

export default router;
