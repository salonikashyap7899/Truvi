import { Router } from "express";
import fs from "fs";
import path from "path";
import { z } from "zod";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "../config/db";
import {
  users,
  projects,
  units,
  leads,
  siteVisits,
  commissions,
  enquiries,
  sharedDocuments,
  projectAssets,
  legalDocuments,
  notifications,
  Role,
  ApprovalStatus,
  VerificationDetails,
  OnboardingChecks,
  UserVerification,
  DEFAULT_ONBOARDING_CHECKS,
  isOnboardingComplete,
} from "../db/schema";
import { isValidId } from "../lib/ids";
import { authenticate, requireRole, AuthedRequest } from "../middleware/auth";
import { DEFAULT_PLATFORM_FEE_PERCENT } from "../config/constants";
import { emitNotification } from "../sockets";
import { kycDir } from "./auth";

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

// DELETE /api/admin/projects/:id — permanently delete ANY project (admin only).
// Removes the project and every dependent row (units, leads, visits,
// commissions, enquiries, shared docs, assets, legal docs). This cannot be
// undone, so it is gated to ADMIN.
router.delete("/projects/:id", requireRole("ADMIN"), async (req: AuthedRequest, res) => {
  const projectId = req.params.id;
  if (!isValidId(projectId)) return res.status(404).json({ error: "Project not found" });

  const db = getDb();
  const [existing] = await db.select().from(projects).where(eq(projects._id, projectId));
  if (!existing) return res.status(404).json({ error: "Project not found" });

  // Delete dependent rows first (Postgres enforces the foreign keys).
  const projectLeads = await db.select({ _id: leads._id }).from(leads).where(eq(leads.projectId, projectId));
  const leadIds = projectLeads.map((l) => l._id);
  if (leadIds.length) {
    await db.delete(commissions).where(inArray(commissions.leadId, leadIds));
    await db.delete(siteVisits).where(inArray(siteVisits.leadId, leadIds));
  }
  await db.delete(siteVisits).where(eq(siteVisits.projectId, projectId));
  await db.delete(leads).where(eq(leads.projectId, projectId));
  await db.delete(units).where(eq(units.projectId, projectId));
  await db.delete(projectAssets).where(eq(projectAssets.projectId, projectId));
  await db.delete(sharedDocuments).where(eq(sharedDocuments.projectId, projectId));
  await db.delete(enquiries).where(eq(enquiries.projectId, projectId));
  await db.delete(legalDocuments).where(eq(legalDocuments.projectId, projectId));
  await db.delete(projects).where(eq(projects._id, projectId));

  res.json({ ok: true, deleted: existing.name });
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

// ── CP identity (KYC) review ────────────────────────────────────────────────

// GET /api/admin/kyc/pending — submissions awaiting manual review.
router.get("/kyc/pending", requireRole("ADMIN"), async (_req, res) => {
  const db = getDb();
  const rows = await db
    .select({
      _id: users._id,
      name: users.name,
      email: users.email,
      phone: users.phone,
      role: users.role,
      onboardingChecks: users.onboardingChecks,
      verification: users.verification,
    })
    .from(users)
    .where(inArray(users.role, ["CP", "AMBASSADOR"]));

  const pending = rows
    .filter((u) => u.onboardingChecks?.kycStatus === "PENDING")
    .map((u) => ({
      _id: u._id,
      name: u.name,
      email: u.email,
      phone: u.phone,
      role: u.role,
      panNumberMasked: u.verification?.panNumberMasked ?? null,
      // Presence flags only — the actual images are fetched through the
      // authenticated file route below, never exposed as public URLs.
      hasAadhaar: Boolean(u.verification?.kycFiles?.aadhaar),
      hasPan: Boolean(u.verification?.kycFiles?.pan),
      hasSelfie: Boolean(u.verification?.kycFiles?.selfie),
      submittedAt: u.verification?.kycSubmittedAt ?? null,
    }));

  res.json({ submissions: pending });
});

// GET /api/admin/kyc/:userId/file/:type — stream a KYC document to an admin.
// This is the ONLY way to view identity docs; they are not statically served.
router.get("/kyc/:userId/file/:type", requireRole("ADMIN"), async (req: AuthedRequest, res) => {
  const userId = String(req.params.userId);
  const type = String(req.params.type);
  if (!isValidId(userId)) return res.status(404).json({ error: "Not found" });
  if (!["aadhaar", "pan", "selfie"].includes(type)) return res.status(400).json({ error: "Bad type" });

  const db = getDb();
  const [user] = await db.select({ verification: users.verification }).from(users).where(eq(users._id, userId));
  const entry = user?.verification?.kycFiles?.[type as "aadhaar" | "pan" | "selfie"];
  if (!entry) return res.status(404).json({ error: "Not found" });

  const filePath = path.join(kycDir, entry.file);
  // Guard against path traversal — the resolved path must stay inside kycDir.
  if (!path.resolve(filePath).startsWith(path.resolve(kycDir)) || !fs.existsSync(filePath)) {
    return res.status(404).json({ error: "Not found" });
  }
  res.setHeader("Content-Type", entry.mime || "application/octet-stream");
  res.setHeader("Cache-Control", "private, no-store");
  fs.createReadStream(filePath).pipe(res);
});

const kycDecisionSchema = z.object({ approve: z.boolean(), reason: z.string().max(300).optional() });

// POST /api/admin/kyc/:userId/decision — approve or reject a submission.
router.post("/kyc/:userId/decision", requireRole("ADMIN"), async (req: AuthedRequest, res) => {
  const { userId } = req.params;
  if (!isValidId(userId)) return res.status(404).json({ error: "User not found" });
  const parsed = kycDecisionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });

  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users._id, userId));
  if (!user) return res.status(404).json({ error: "User not found" });

  const { approve, reason } = parsed.data;
  const onboardingChecks: OnboardingChecks = {
    ...(user.onboardingChecks ?? DEFAULT_ONBOARDING_CHECKS),
    aadhaarVerified: approve,
    panVerified: approve,
    kycStatus: approve ? "APPROVED" : "REJECTED",
    kycRejectionReason: approve ? null : reason ?? "Documents could not be verified.",
  };
  const onboardingVerified = isOnboardingComplete(onboardingChecks);

  // Data-retention minimisation: once a decision is made we no longer need the
  // raw identity images. Delete the files from disk and drop the references.
  const kycFiles = user.verification?.kycFiles;
  if (kycFiles) {
    for (const entry of Object.values(kycFiles)) {
      if (!entry?.file) continue;
      const p = path.join(kycDir, entry.file);
      if (path.resolve(p).startsWith(path.resolve(kycDir))) fs.promises.unlink(p).catch(() => null);
    }
  }
  const verification: UserVerification = { ...(user.verification ?? {}), kycFiles: undefined };

  await db
    .update(users)
    .set({ onboardingChecks, onboardingVerified, verification })
    .where(eq(users._id, user._id));

  // Tell the CP the outcome in real time.
  try {
    const message = approve
      ? "Your identity has been verified — full access is now unlocked."
      : `Your identity verification was rejected. ${onboardingChecks.kycRejectionReason ?? ""} Please re-submit.`;
    const [n] = await db.insert(notifications).values({ userId: user._id, message }).returning();
    emitNotification(String(user._id), n);
  } catch {
    /* non-fatal */
  }

  res.json({ ok: true, userId: user._id, kycStatus: onboardingChecks.kycStatus, onboardingVerified });
});

export default router;
