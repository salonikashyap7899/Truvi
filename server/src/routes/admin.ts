import { Router } from "express";
import { z } from "zod";
import { isValidId } from "../lib/ids";
import { authenticate, requireRole, AuthedRequest } from "../middleware/auth";
import { emitNotification } from "../sockets";
import { sendApprovalEmail } from "../services/emailService";
import { DEFAULT_PLATFORM_FEE_PERCENT } from "../config/constants";
import { User } from "../models/User";
import { Project } from "../models/Project";
import { Notification } from "../models/Notification";

const router = Router();
router.use(authenticate);

// GET /api/admin/users?role=&approvalStatus=
router.get("/users", requireRole("ADMIN"), async (req, res) => {
  const { role, approvalStatus } = req.query;

  const query: Record<string, unknown> = {};
  if (typeof role === "string" && role) {
    query.role = role;
  } else {
    query.role = { $in: ["DEVELOPER", "CP", "BUYER"] };
  }

  if (typeof approvalStatus === "string" && approvalStatus) {
    query.approvalStatus = approvalStatus;
  }

  const rows = await User.find(query).sort({ createdAt: -1 }).lean();
  const safeUsers = rows.map(({ password, ...u }) => u);
  res.json({ users: safeUsers });
});

const patchUserSchema = z.object({
  userId: z.string().min(1),
  approvalStatus: z.enum(["APPROVED", "REJECTED", "PENDING"]),
});

router.patch("/users", requireRole("ADMIN"), async (req, res) => {
  const parsed = patchUserSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });

  if (!isValidId(parsed.data.userId)) return res.status(404).json({ error: "User not found" });

  const user = await User.findByIdAndUpdate(
    parsed.data.userId,
    { approvalStatus: parsed.data.approvalStatus },
    { new: true }
  ).lean();

  if (!user) return res.status(404).json({ error: "User not found" });

  const message =
    parsed.data.approvalStatus === "APPROVED"
      ? "Your Truvi account has been approved. You now have full access."
      : parsed.data.approvalStatus === "REJECTED"
      ? "Your Truvi account application was not approved. Contact support for details."
      : "Your Truvi account status was updated to pending review.";

  const notification = await Notification.create({ userId: user._id, message });
  emitNotification(String(user._id), notification);

  if (parsed.data.approvalStatus !== "PENDING") {
    sendApprovalEmail(user.email, user.name, parsed.data.approvalStatus === "APPROVED").catch((err) =>
      console.error("Approval email failed:", err)
    );
  }

  const { password: _p, ...safeUser } = user;
  res.json({ user: safeUser });
});

// GET /api/admin/projects?approvalStatus=
router.get("/projects", requireRole("ADMIN"), async (req, res) => {
  const { approvalStatus } = req.query;

  const query: Record<string, unknown> = {};
  if (typeof approvalStatus === "string" && approvalStatus) {
    query.approvalStatus = approvalStatus;
  }

  const rows = await Project.find(query)
    .sort({ createdAt: -1 })
    .populate("developerId", "name")
    .lean();

  const result = rows.map((project) => {
    const developer =
      project.developerId && typeof project.developerId === "object"
        ? { _id: String((project.developerId as any)._id), name: (project.developerId as any).name }
        : null;
    return {
      ...project,
      developerId: developer,
    };
  });

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
  verificationDetails: verificationDetailsSchema,
});

router.patch("/projects", requireRole("ADMIN"), async (req: AuthedRequest, res) => {
  const parsed = patchProjectSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });

  const { projectId, ...data } = parsed.data;
  if (!isValidId(projectId)) return res.status(404).json({ error: "Project not found" });

  const existing = await Project.findById(projectId).lean();
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
  if (data.verificationDetails !== undefined) {
    const merged = {
      reraVerified: false,
      titleClearance: false,
      encumbranceFree: false,
      constructionApproval: false,
      portfolioVerified: false,
      ...(existing.verificationDetails ?? {}),
      ...data.verificationDetails,
    } as Record<string, unknown>;

    if (data.verificationDetails.lastVerifiedAt !== undefined) {
      merged.lastVerifiedAt = data.verificationDetails.lastVerifiedAt;
    }

    update.verificationDetails = merged;
  }

  if (Object.keys(update).length === 0) {
    return res.json({ project: existing });
  }

  const project = await Project.findByIdAndUpdate(projectId, update, { new: true, lean: true });
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
