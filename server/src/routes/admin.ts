import { Router } from "express";
import { z } from "zod";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "../config/db";
import { users, projects, Role, ApprovalStatus, VerificationDetails } from "../db/schema";
import { isValidId } from "../lib/ids";
import { authenticate, requireRole, AuthedRequest } from "../middleware/auth";
import { DEFAULT_PLATFORM_FEE_PERCENT } from "../config/constants";

const router = Router();
router.use(authenticate);

// GET /api/admin/users?role=&approvalStatus=
router.get("/users", requireRole("ADMIN"), async (req, res) => {
  const { role, approvalStatus } = req.query;

  const conditions = [];
  if (typeof role === "string" && role) {
    conditions.push(eq(users.role, role as Role));
  } else {
    conditions.push(inArray(users.role, ["DEVELOPER", "CP", "BUYER"]));
  }

  if (typeof approvalStatus === "string" && approvalStatus) {
    conditions.push(eq(users.approvalStatus, approvalStatus as ApprovalStatus));
  }

  const db = getDb();
  const rows = await db
    .select()
    .from(users)
    .where(and(...conditions))
    .orderBy(desc(users.createdAt));
  const safeUsers = rows.map(({ password, ...u }) => u);
  res.json({ users: safeUsers });
});

// Admin account-approval has been removed — accounts self-approve on signup
// and are gated by email OTP verification instead, so there is no longer a
// user approval/rejection endpoint here.

// GET /api/admin/projects?approvalStatus=
router.get("/projects", requireRole("ADMIN"), async (req, res) => {
  const { approvalStatus } = req.query;

  const conditions = [];
  if (typeof approvalStatus === "string" && approvalStatus) {
    conditions.push(eq(projects.approvalStatus, approvalStatus as ApprovalStatus));
  }

  const db = getDb();
  const rows = await db
    .select({
      project: projects,
      developer: { _id: users._id, name: users.name },
    })
    .from(projects)
    .leftJoin(users, eq(projects.developerId, users._id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(projects.createdAt));

  const result = rows.map(({ project, developer }) => ({
    ...project,
    developerId: developer ? { _id: String(developer._id), name: developer.name } : null,
  }));

  res.json({ projects: result });
});

const verificationDetailsSchema = z.object({
  reraVerified: z.boolean().optional(),
  titleClearance: z.boolean().optional(),
  encumbranceFree: z.boolean().optional(),
  constructionApproval: z.boolean().optional(),
  verificationSource: z.string().optional(),
  portfolioVerified: z.boolean().optional(),
  lastVerifiedAt: z.string().datetime().optional().nullable(),
  notes: z.string().optional(),
}).optional();

const patchProjectSchema = z.object({
  projectId: z.string().min(1),
  approvalStatus: z.enum(["APPROVED", "REJECTED", "PENDING"]).optional(),
  listingTier: z.enum(["STANDARD", "FEATURED"]).optional(),
  featuredUntil: z.string().datetime().optional().nullable(),
  isVerified: z.boolean().optional(),
  isPrimeListing: z.boolean().optional(),
  threeDModelUrl: z.string().url().or(z.literal("")).nullable().optional(),
  masterPlanUrl: z.string().min(1).or(z.literal("")).nullable().optional(),
  verificationDetails: verificationDetailsSchema,
});

router.patch("/projects", requireRole("ADMIN"), async (req: AuthedRequest, res) => {
  const parsed = patchProjectSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });

  const { projectId, ...data } = parsed.data;
  if (!isValidId(projectId)) return res.status(404).json({ error: "Project not found" });

  const db = getDb();
  const [existing] = await db.select().from(projects).where(eq(projects._id, projectId));
  if (!existing) return res.status(404).json({ error: "Project not found" });

  const update: Record<string, unknown> = {};
  if (data.approvalStatus) update.approvalStatus = data.approvalStatus;
  if (data.listingTier) update.listingTier = data.listingTier;
  if (data.featuredUntil !== undefined) update.featuredUntil = data.featuredUntil ? new Date(data.featuredUntil) : null;
  if (data.isVerified !== undefined) {
    update.isVerified = data.isVerified;
    update.verifiedAt = data.isVerified ? new Date() : null;
  }
  if (data.isPrimeListing !== undefined) update.isPrimeListing = data.isPrimeListing;
  if (data.threeDModelUrl !== undefined) update.threeDModelUrl = data.threeDModelUrl || null;
  if (data.masterPlanUrl !== undefined) update.masterPlanUrl = data.masterPlanUrl || null;
  if (data.verificationDetails !== undefined) {
    const merged = {
      reraVerified: false,
      titleClearance: false,
      encumbranceFree: false,
      constructionApproval: false,
      portfolioVerified: false,
      ...(existing.verificationDetails ?? {}),
      ...data.verificationDetails,
    } as VerificationDetails;

    if (data.verificationDetails.lastVerifiedAt !== undefined) {
      merged.lastVerifiedAt = data.verificationDetails.lastVerifiedAt;
    }

    update.verificationDetails = merged;
  }

  if (Object.keys(update).length === 0) {
    return res.json({ project: existing });
  }

  const [project] = await db
    .update(projects)
    .set(update)
    .where(eq(projects._id, projectId))
    .returning();
  if (!project) return res.status(404).json({ error: "Project not found" });

  res.json({ project });
});

let platformFeePercent = DEFAULT_PLATFORM_FEE_PERCENT;

router.get("/settings", requireRole("ADMIN", "DEVELOPER", "CP"), (_req, res) => {
  res.json({ platformFeePercent });
});

router.patch("/settings", requireRole("ADMIN"), (req, res) => {
  const value = req.body?.platformFeePercent;
  if (typeof value !== "number" || value < 0) {
    return res.status(400).json({ error: "platformFeePercent must be a positive number" });
  }
  platformFeePercent = value;
  res.json({ platformFeePercent });
});

export function getPlatformFeePercent(): number {
  return platformFeePercent;
}

export default router;
