import { Router } from "express";
import { z } from "zod";
import { User } from "../models/User";
import { Project } from "../models/Project";
import { Notification } from "../models/Notification";
import { authenticate, requireRole, AuthedRequest } from "../middleware/auth";
import { emitNotification } from "../sockets";
import { sendApprovalEmail } from "../services/emailService";
import { DEFAULT_PLATFORM_FEE_PERCENT } from "../config/constants";

const router = Router();
router.use(authenticate);

// GET /api/admin/users?role=&approvalStatus=
router.get("/users", requireRole("ADMIN"), async (req, res) => {
  const { role, approvalStatus } = req.query;
  const filter: Record<string, unknown> = { role: role || { $in: ["DEVELOPER", "CP"] } };
  if (approvalStatus) filter.approvalStatus = approvalStatus;

  const users = await User.find(filter).select("-password").sort({ createdAt: -1 });
  res.json({ users });
});

const patchUserSchema = z.object({
  userId: z.string().min(1),
  approvalStatus: z.enum(["APPROVED", "REJECTED", "PENDING"]),
});

router.patch("/users", requireRole("ADMIN"), async (req, res) => {
  const parsed = patchUserSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });

  const user = await User.findByIdAndUpdate(parsed.data.userId, { approvalStatus: parsed.data.approvalStatus }, { new: true });
  if (!user) return res.status(404).json({ error: "User not found" });

  const message =
    parsed.data.approvalStatus === "APPROVED"
      ? "Your Truvi account has been approved. You now have full access."
      : parsed.data.approvalStatus === "REJECTED"
      ? "Your Truvi account application was not approved. Contact support for details."
      : "Your Truvi account status was updated to pending review.";

  const notification = await Notification.create({ userId: user._id, message });
  emitNotification(String(user._id), notification);

  // Best-effort email — never block the approval action on email delivery.
  if (parsed.data.approvalStatus !== "PENDING") {
    sendApprovalEmail(user.email, user.name, parsed.data.approvalStatus === "APPROVED").catch((err) =>
      console.error("Approval email failed:", err)
    );
  }

  res.json({ user });
});

// GET /api/admin/projects?approvalStatus=
router.get("/projects", requireRole("ADMIN"), async (req, res) => {
  const { approvalStatus } = req.query;
  const filter: Record<string, unknown> = approvalStatus ? { approvalStatus } : {};
  const projects = await Project.find(filter).populate("developerId", "name").sort({ createdAt: -1 });
  res.json({ projects });
});

const patchProjectSchema = z.object({
  projectId: z.string().min(1),
  approvalStatus: z.enum(["APPROVED", "REJECTED", "PENDING"]).optional(),
  listingTier: z.enum(["STANDARD", "FEATURED"]).optional(),
  featuredUntil: z.string().datetime().optional().nullable(),
  isVerified: z.boolean().optional(),
});

router.patch("/projects", requireRole("ADMIN"), async (req: AuthedRequest, res) => {
  const parsed = patchProjectSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });

  const { projectId, ...data } = parsed.data;
  const update: Record<string, unknown> = {};
  if (data.approvalStatus) update.approvalStatus = data.approvalStatus;
  if (data.listingTier) update.listingTier = data.listingTier;
  if (data.featuredUntil !== undefined) update.featuredUntil = data.featuredUntil ? new Date(data.featuredUntil) : null;
  if (data.isVerified !== undefined) {
    update.isVerified = data.isVerified;
    update.verifiedAt = data.isVerified ? new Date() : null;
  }

  const project = await Project.findByIdAndUpdate(projectId, update, { new: true });
  if (!project) return res.status(404).json({ error: "Project not found" });

  res.json({ project });
});

// In-memory platform fee setting (same pragmatic MVP choice as the Next.js
// version — see DECISIONS.md for the follow-up: promote to a Settings collection).
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
