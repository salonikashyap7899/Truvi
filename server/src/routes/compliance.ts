import { randomBytes } from "crypto";
import { Router } from "express";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../config/db";
import {
  grievanceTickets,
  privacyRequests,
  userConsentEvents,
  users,
} from "../db/schema";
import { authenticate, requireRole, AuthedRequest } from "../middleware/auth";
import { isValidId } from "../lib/ids";
import { CURRENT_POLICY_VERSIONS, POLICY_DOCUMENTS } from "../config/compliance";
import { canTransitionGrievance, canTransitionPrivacyRequest } from "../services/compliance.rules";
import { logAudit } from "../services/audit";
import { notifyRole, notifyUser } from "../services/notificationService";
import { adminLimiter, complianceSubmissionLimiter } from "../middleware/security";

const router = Router();
router.use(authenticate);

const OPEN_PRIVACY_STATUSES = ["SUBMITTED", "UNDER_REVIEW", "WAITING_FOR_USER", "APPROVED"] as const;

function currentConsentState(events: Array<{ policyType: string; policyVersion: string; action: string; occurredAt: Date }>) {
  const latest = new Map<string, { policyVersion: string; action: string; occurredAt: Date }>();
  for (const event of events) {
    if (!latest.has(event.policyType)) latest.set(event.policyType, {
      policyVersion: event.policyVersion,
      action: event.action,
      occurredAt: event.occurredAt,
    });
  }
  return Object.fromEntries(latest.entries());
}

router.get("/me", async (req: AuthedRequest, res) => {
  const db = getDb();
  const userId = req.user!.userId;
  const [events, requests, tickets] = await Promise.all([
    db.select({
      policyType: userConsentEvents.policyType,
      policyVersion: userConsentEvents.policyVersion,
      action: userConsentEvents.action,
      source: userConsentEvents.source,
      occurredAt: userConsentEvents.occurredAt,
    }).from(userConsentEvents)
      .where(eq(userConsentEvents.userId, userId))
      .orderBy(desc(userConsentEvents.occurredAt)),
    db.select({
      _id: privacyRequests._id,
      requestType: privacyRequests.requestType,
      details: privacyRequests.details,
      status: privacyRequests.status,
      publicResponse: privacyRequests.publicResponse,
      requestedAt: privacyRequests.requestedAt,
      updatedAt: privacyRequests.updatedAt,
      completedAt: privacyRequests.completedAt,
    }).from(privacyRequests)
      .where(eq(privacyRequests.requesterUserId, userId))
      .orderBy(desc(privacyRequests.requestedAt))
      .limit(50),
    db.select({
      _id: grievanceTickets._id,
      caseNumber: grievanceTickets.caseNumber,
      category: grievanceTickets.category,
      subject: grievanceTickets.subject,
      description: grievanceTickets.description,
      status: grievanceTickets.status,
      publicResponse: grievanceTickets.publicResponse,
      requestedAt: grievanceTickets.requestedAt,
      updatedAt: grievanceTickets.updatedAt,
      resolvedAt: grievanceTickets.resolvedAt,
    }).from(grievanceTickets)
      .where(eq(grievanceTickets.requesterUserId, userId))
      .orderBy(desc(grievanceTickets.requestedAt))
      .limit(50),
  ]);

  res.setHeader("Cache-Control", "private, no-store");
  return res.json({
    role: req.user!.role,
    policies: POLICY_DOCUMENTS,
    currentVersions: CURRENT_POLICY_VERSIONS,
    consents: events,
    consentState: currentConsentState(events),
    privacyRequests: requests,
    grievances: tickets,
  });
});

const consentSchema = z.object({
  policyType: z.enum(["TERMS_OF_SERVICE", "PRIVACY_NOTICE", "MARKETING"]),
  policyVersion: z.string().trim().min(1).max(80),
  action: z.enum(["ACKNOWLEDGED", "GRANTED", "WITHDRAWN"]),
});
router.post("/consents", async (req: AuthedRequest, res) => {
  const parsed = consentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid consent action" });

  const { policyType, policyVersion, action } = parsed.data;
  if (policyVersion !== CURRENT_POLICY_VERSIONS[policyType]) {
    return res.status(409).json({ error: "This policy version is no longer current. Refresh the page and review the latest version." });
  }
  if (policyType === "MARKETING" ? action === "ACKNOWLEDGED" : action !== "ACKNOWLEDGED") {
    return res.status(400).json({ error: "The action is not valid for this policy type." });
  }

  const db = getDb();
  const userId = req.user!.userId;
  const [latest] = await db.select({
    action: userConsentEvents.action,
    policyVersion: userConsentEvents.policyVersion,
  }).from(userConsentEvents)
    .where(and(eq(userConsentEvents.userId, userId), eq(userConsentEvents.policyType, policyType)))
    .orderBy(desc(userConsentEvents.occurredAt))
    .limit(1);

  if (latest?.policyVersion === policyVersion && latest.action === action) {
    return res.json({ ok: true, unchanged: true });
  }

  const [event] = await db.insert(userConsentEvents).values({
    userId,
    policyType,
    policyVersion,
    action,
    source: "PRIVACY_CENTER",
  }).returning();

  await logAudit({
    userId,
    action: "compliance.consent.record",
    resourceType: "user_consent_event",
    resourceId: event._id,
    metadata: { policyType, policyVersion, action },
  });
  return res.status(201).json({ ok: true, event });
});

const privacyRequestSchema = z.object({
  requestType: z.enum(["ACCESS", "CORRECTION", "ERASURE", "WITHDRAW_CONSENT"]),
  details: z.string().trim().min(10, "Please provide at least 10 characters of detail").max(3000),
});
router.post("/privacy-requests", ...complianceSubmissionLimiter, async (req: AuthedRequest, res) => {
  const parsed = privacyRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid privacy request" });

  const db = getDb();
  const userId = req.user!.userId;
  const [existing] = await db.select({ _id: privacyRequests._id })
    .from(privacyRequests)
    .where(and(
      eq(privacyRequests.requesterUserId, userId),
      eq(privacyRequests.requestType, parsed.data.requestType),
      inArray(privacyRequests.status, [...OPEN_PRIVACY_STATUSES]),
    ))
    .limit(1);
  if (existing) return res.status(409).json({ error: "You already have an open request of this type. Check its status in Privacy Centre." });

  const [request] = await db.insert(privacyRequests).values({
    requesterUserId: userId,
    requestType: parsed.data.requestType,
    details: parsed.data.details,
  }).returning();

  await notifyRole("ADMIN", {
    type: "privacy_request_submitted",
    title: "New privacy request",
    message: "A user submitted a " + request.requestType.toLowerCase().replace(/_/g, " ") + " request.",
    data: { href: "/admin/compliance", requestId: request._id },
    actorUserId: userId,
    priority: "high",
    dedupeKey: "privacy-request:" + request._id,
  }).catch(() => []);
  await logAudit({
    userId,
    action: "compliance.privacy_request.submit",
    resourceType: "privacy_request",
    resourceId: request._id,
    metadata: { requestType: request.requestType },
  });
  return res.status(201).json({ request });
});

const grievanceSchema = z.object({
  category: z.enum(["PRIVACY", "ACCOUNT", "PAYMENT", "PROJECT_LISTING", "KYC", "TECHNICAL", "OTHER"]),
  subject: z.string().trim().min(5).max(160),
  description: z.string().trim().min(15).max(5000),
});
router.post("/grievances", ...complianceSubmissionLimiter, async (req: AuthedRequest, res) => {
  const parsed = grievanceSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid grievance" });

  const userId = req.user!.userId;
  const caseNumber = "TRV-" + Date.now().toString(36).toUpperCase() + "-" + randomBytes(3).toString("hex").toUpperCase();
  const [ticket] = await getDb().insert(grievanceTickets).values({
    requesterUserId: userId,
    caseNumber,
    category: parsed.data.category,
    subject: parsed.data.subject,
    description: parsed.data.description,
  }).returning();

  await notifyRole("ADMIN", {
    type: "grievance_submitted",
    title: "New grievance received",
    message: ticket.caseNumber + " · " + ticket.category.replace(/_/g, " "),
    data: { href: "/admin/compliance", grievanceId: ticket._id },
    actorUserId: userId,
    priority: "high",
    dedupeKey: "grievance:" + ticket._id,
  }).catch(() => []);
  await logAudit({
    userId,
    action: "compliance.grievance.submit",
    resourceType: "grievance_ticket",
    resourceId: ticket._id,
    metadata: { caseNumber: ticket.caseNumber, category: ticket.category },
  });
  return res.status(201).json({ ticket });
});

router.get("/admin/queue", requireRole("ADMIN"), adminLimiter, async (_req: AuthedRequest, res) => {
  const db = getDb();
  const [grievanceRows, privacyRows] = await Promise.all([
    db.select({
      ticket: grievanceTickets,
      requesterName: users.name,
      requesterEmail: users.email,
      requesterRole: users.role,
    }).from(grievanceTickets)
      .innerJoin(users, eq(grievanceTickets.requesterUserId, users._id))
      .orderBy(desc(grievanceTickets.requestedAt))
      .limit(100),
    db.select({
      request: privacyRequests,
      requesterName: users.name,
      requesterEmail: users.email,
      requesterRole: users.role,
    }).from(privacyRequests)
      .innerJoin(users, eq(privacyRequests.requesterUserId, users._id))
      .orderBy(desc(privacyRequests.requestedAt))
      .limit(100),
  ]);
  res.setHeader("Cache-Control", "private, no-store");
  return res.json({
    grievances: grievanceRows.map((row) => ({ ...row.ticket, requesterName: row.requesterName, requesterEmail: row.requesterEmail, requesterRole: row.requesterRole })),
    privacyRequests: privacyRows.map((row) => ({ ...row.request, requesterName: row.requesterName, requesterEmail: row.requesterEmail, requesterRole: row.requesterRole })),
  });
});

const grievanceReviewSchema = z.object({
  status: z.enum(["SUBMITTED", "ACKNOWLEDGED", "IN_PROGRESS", "WAITING_FOR_USER", "RESOLVED", "CLOSED"]).optional(),
  publicResponse: z.string().trim().max(3000).optional(),
  internalNote: z.string().trim().max(3000).optional(),
});
router.patch("/admin/grievances/:id", requireRole("ADMIN"), adminLimiter, async (req: AuthedRequest, res) => {
  const id = String(req.params.id);
  if (!isValidId(id)) return res.status(400).json({ error: "Invalid case ID" });
  const parsed = grievanceReviewSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid grievance update" });
  if (!parsed.data.status && !parsed.data.publicResponse && !parsed.data.internalNote) return res.status(400).json({ error: "Provide a status, public response, or internal note." });

  const db = getDb();
  const [current] = await db.select().from(grievanceTickets).where(eq(grievanceTickets._id, id)).limit(1);
  if (!current) return res.status(404).json({ error: "Grievance not found" });
  const nextStatus = parsed.data.status ?? current.status;
  if (!canTransitionGrievance(current.status, nextStatus)) return res.status(409).json({ error: "Invalid grievance status transition." });
  if (["WAITING_FOR_USER", "RESOLVED", "CLOSED"].includes(nextStatus) && !parsed.data.publicResponse?.trim() && !current.publicResponse?.trim()) {
    return res.status(400).json({ error: "Add a customer-visible response before waiting for the user or closing this case." });
  }

  const now = new Date();
  const internalNotes = parsed.data.internalNote
    ? [current.internalNotes, "[" + now.toISOString() + "] " + req.user!.userId + ": " + parsed.data.internalNote].filter(Boolean).join("\n")
    : current.internalNotes;
  const [updated] = await db.update(grievanceTickets).set({
    status: nextStatus,
    publicResponse: parsed.data.publicResponse ?? current.publicResponse,
    internalNotes,
    reviewerUserId: req.user!.userId,
    updatedAt: now,
    resolvedAt: nextStatus === "RESOLVED" || nextStatus === "CLOSED" ? (current.resolvedAt ?? now) : null,
  }).where(and(eq(grievanceTickets._id, id), eq(grievanceTickets.status, current.status))).returning();
  if (!updated) return res.status(409).json({ error: "This case changed while you were editing it. Refresh and try again." });

  if (parsed.data.publicResponse || nextStatus !== current.status) {
    await notifyUser(String(updated.requesterUserId), {
      type: "grievance_updated",
      title: "Your Truvi support case was updated",
      message: updated.caseNumber + " is now " + updated.status.toLowerCase().replace(/_/g, " ") + ".",
      data: { href: "/privacy-center", caseNumber: updated.caseNumber },
      priority: "high",
      dedupeKey: "grievance-update:" + updated._id + ":" + updated.updatedAt.getTime(),
    }).catch(() => []);
  }
  await logAudit({
    userId: req.user!.userId,
    action: "compliance.grievance.review",
    resourceType: "grievance_ticket",
    resourceId: updated._id,
    metadata: { from: current.status, to: updated.status, hasPublicResponse: Boolean(parsed.data.publicResponse), addedInternalNote: Boolean(parsed.data.internalNote) },
  });
  return res.json({ ticket: updated });
});

const privacyReviewSchema = z.object({
  status: z.enum(["SUBMITTED", "UNDER_REVIEW", "WAITING_FOR_USER", "APPROVED", "REJECTED", "COMPLETED"]).optional(),
  publicResponse: z.string().trim().max(3000).optional(),
  internalNote: z.string().trim().max(3000).optional(),
});
router.patch("/admin/privacy-requests/:id", requireRole("ADMIN"), adminLimiter, async (req: AuthedRequest, res) => {
  const id = String(req.params.id);
  if (!isValidId(id)) return res.status(400).json({ error: "Invalid request ID" });
  const parsed = privacyReviewSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid privacy request update" });
  if (!parsed.data.status && !parsed.data.publicResponse && !parsed.data.internalNote) return res.status(400).json({ error: "Provide a status, public response, or internal note." });

  const db = getDb();
  const [current] = await db.select().from(privacyRequests).where(eq(privacyRequests._id, id)).limit(1);
  if (!current) return res.status(404).json({ error: "Privacy request not found" });
  const nextStatus = parsed.data.status ?? current.status;
  if (!canTransitionPrivacyRequest(current.status, nextStatus)) return res.status(409).json({ error: "Invalid privacy request status transition." });
  if (["REJECTED", "COMPLETED"].includes(nextStatus) && !parsed.data.publicResponse?.trim() && !current.publicResponse?.trim()) {
    return res.status(400).json({ error: "Add a customer-visible explanation before rejecting or completing this request." });
  }

  const now = new Date();
  const internalNotes = parsed.data.internalNote
    ? [current.internalNotes, "[" + now.toISOString() + "] " + req.user!.userId + ": " + parsed.data.internalNote].filter(Boolean).join("\n")
    : current.internalNotes;
  const [updated] = await db.update(privacyRequests).set({
    status: nextStatus,
    publicResponse: parsed.data.publicResponse ?? current.publicResponse,
    internalNotes,
    reviewerUserId: req.user!.userId,
    updatedAt: now,
    completedAt: nextStatus === "COMPLETED" ? now : null,
  }).where(and(eq(privacyRequests._id, id), eq(privacyRequests.status, current.status))).returning();
  if (!updated) return res.status(409).json({ error: "This request changed while you were editing it. Refresh and try again." });

  if (parsed.data.publicResponse || nextStatus !== current.status) {
    await notifyUser(String(updated.requesterUserId), {
      type: "privacy_request_updated",
      title: "Your privacy request was updated",
      message: "Your " + updated.requestType.toLowerCase().replace(/_/g, " ") + " request is now " + updated.status.toLowerCase().replace(/_/g, " ") + ".",
      data: { href: "/privacy-center", requestId: updated._id },
      priority: "high",
      dedupeKey: "privacy-request-update:" + updated._id + ":" + updated.updatedAt.getTime(),
    }).catch(() => []);
  }
  await logAudit({
    userId: req.user!.userId,
    action: "compliance.privacy_request.review",
    resourceType: "privacy_request",
    resourceId: updated._id,
    metadata: { from: current.status, to: updated.status, requestType: updated.requestType, hasPublicResponse: Boolean(parsed.data.publicResponse), addedInternalNote: Boolean(parsed.data.internalNote) },
  });
  return res.json({ request: updated });
});

export default router;
