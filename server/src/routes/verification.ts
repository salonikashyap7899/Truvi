import { Router } from "express";
import { eq, desc } from "drizzle-orm";
import { getDb } from "../config/db";
import { projects } from "../db/schema";
import {
  verificationResults,
  fraudFlags,
  CATEGORY_TABLES,
  DATA_CATEGORIES,
} from "../db/verificationSchema";
import { isValidId } from "../lib/ids";
import { authenticate, requireRole, AuthedRequest } from "../middleware/auth";
import { verifyLimiter } from "../middleware/security";
import { runVerification } from "../services/verification/engine";
import { runFraudDetection } from "../services/fraud/detector";
import { logAudit } from "../services/audit";

const router = Router();
router.use(authenticate);

/** POST /api/verify/:projectId — run the dynamic engine + fraud detection. */
router.post("/verify/:projectId", verifyLimiter, requireRole("ADMIN", "VERIFIER"), async (req: AuthedRequest, res) => {
  const projectId = req.params.projectId;
  if (!isValidId(projectId)) return res.status(404).json({ error: "Project not found" });

  const db = getDb();
  const [project] = await db.select({ _id: projects._id }).from(projects).where(eq(projects._id, projectId));
  if (!project) return res.status(404).json({ error: "Project not found" });

  const [verification, fraud] = await Promise.all([
    runVerification(projectId),
    runFraudDetection(projectId),
  ]);

  await logAudit({
    userId: req.user!.userId,
    action: "verification.run",
    resourceType: "project",
    resourceId: projectId,
    metadata: { status: verification.status, score: verification.confidenceScore, fraudHits: fraud.length },
  });

  res.json({ verification, fraud });
});

/** GET /api/verification/:projectId — latest result + fraud flags. */
router.get("/verification/:projectId", async (req, res) => {
  const projectId = req.params.projectId;
  if (!isValidId(projectId)) return res.status(404).json({ error: "Project not found" });

  const db = getDb();
  const [result] = await db.select().from(verificationResults).where(eq(verificationResults.projectId, projectId));
  const flags = await db.select().from(fraudFlags).where(eq(fraudFlags.projectId, projectId)).orderBy(desc(fraudFlags.flaggedAt));

  if (!result) return res.json({ verification: null, fraudFlags: flags });
  res.json({ verification: result, fraudFlags: flags });
});

/**
 * GET /api/property/:id — aggregate EVERY data category that has data for this
 * project, plus the verification result and fraud flags. Sections are never
 * hardcoded: whatever category has rows is returned, the rest are omitted.
 */
router.get("/property/:id", async (req, res) => {
  const id = req.params.id;
  if (!isValidId(id)) return res.status(404).json({ error: "Property not found" });

  const db = getDb();
  const [project] = await db.select().from(projects).where(eq(projects._id, id));
  if (!project) return res.status(404).json({ error: "Property not found" });

  const categories: Record<string, unknown[]> = {};
  for (const category of DATA_CATEGORIES) {
    const table = CATEGORY_TABLES[category as keyof typeof CATEGORY_TABLES];
    if (!table) continue;
    const rows = await db.select().from(table as any).where(eq((table as any).projectId, id));
    if (rows.length > 0) categories[category] = rows;
  }

  const [verification] = await db.select().from(verificationResults).where(eq(verificationResults.projectId, id));
  const flags = await db.select().from(fraudFlags).where(eq(fraudFlags.projectId, id)).orderBy(desc(fraudFlags.flaggedAt));

  res.json({ property: project, categories, verification: verification ?? null, fraudFlags: flags });
});

export default router;
