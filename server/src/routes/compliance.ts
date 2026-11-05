import { createHash, randomBytes } from "crypto";
import { Router } from "express";
import { and, desc, eq, gt, inArray, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../config/db";
import {
  accountDeletionRequests,
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
import { adminLimiter, complianceSubmissionLimiter, otpSendLimiter, otpVerifyLimiter } from "../middleware/security";
import { generateOtp, clearRefreshCookies, TOO_MANY_OTP } from "../services/authService";
import { sendEmail, sendOtpEmail } from "../services/emailService";
import { hashOtpForStorage, verifyStoredOtp } from "../lib/otpHash";
import { clearOtpAttempts, otpAttemptBlocked, recordOtpFailure } from "../services/otpAttempts";

const router = Router();

const RESTORE_WINDOW_DAYS = 30;
const restoreAccountSchema = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/i) });

/**
 * The email restoration link is a single-use bearer secret. Keep the token in
 * the URL fragment so it is not sent in HTTP requests, proxy logs or referrers.
 */
router.post("/account-deletion/restore", ...otpVerifyLimiter, async (req, res) => {
  const parsed = restoreAccountSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "This restoration link is invalid." });

  const tokenHash = createHash("sha256").update(parsed.data.token).digest("hex");
  const db = getDb();
  const now = new Date();
  const [candidate] = await db.select({
    id: accountDeletionRequests._id,
    userId: accountDeletionRequests.userId,
  }).from(accountDeletionRequests).where(and(
    eq(accountDeletionRequests.status, "DEACTIVATED"),
    eq(accountDeletionRequests.restoreTokenHash, tokenHash),
    gt(accountDeletionRequests.restoreExpiresAt, now),
  )).limit(1);

  if (!candidate) {
    return res.status(410).json({ error: "This restoration link has expired or has already been used. Contact Truvi support for assistance." });
  }

  const restored = await db.transaction(async (tx) => {
    const [claimed] = await tx.update(accountDeletionRequests).set({
      status: "RESTORED",
      restoreTokenHash: null,
      restoreExpiresAt: null,
      restoredAt: now,
      updatedAt: now,
    }).where(and(
      eq(accountDeletionRequests._id, candidate.id),
      eq(accountDeletionRequests.status, "DEACTIVATED"),
      eq(accountDeletionRequests.restoreTokenHash, tokenHash),
      gt(accountDeletionRequests.restoreExpiresAt, now),
    )).returning({ userId: accountDeletionRequests.userId });

    if (!claimed) return null;
    const [account] = await tx.update(users).set({
      disabled: false,
      authVersion: sql`auth_version + 1`,
    }).where(eq(users._id, claimed.userId)).returning({ id: users._id, email: users.email });
    if (!account) throw new Error("Account restoration could not update the user record.");
    return account;
  });

  if (!restored) return res.status(409).json({ error: "This restoration link has already been used. Please sign in or contact support." });

  await clearOtpAttempts("account-delete:" + restored.id);
  await logAudit({
    userId: String(restored.id),
    action: "account.deletion.restore",
    resourceType: "account_deletion_request",
    resourceId: candidate.id,
    metadata: { restoredThrough: "email_link" },
  });
  await sendEmail(
    restored.email,
    "Your Truvi account has been restored",
    "<p>Your Truvi account has been restored. For your security, all previous sessions were revoked. Please sign in again.</p>",
  ).catch(() => false);

  return res.json({ ok: true, message: "Your account has been restored. Please sign in again." });
});


// Public complaints must remain accessible to consumers who do not have a Truvi
// account. The route is rate-limited and includes a honeypot; it does not expose
// any complaint lookup endpoint to unauthenticated callers.
const publicGrievanceSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(254),
  phone: z.string().trim().max(25).optional().default(""),
  category: z.enum(["PRIVACY", "ACCOUNT", "PAYMENT", "PROJECT_LISTING", "KYC", "TECHNICAL", "OTHER"]),
  subject: z.string().trim().min(5).max(160),
  description: z.string().trim().min(15).max(5000),
  privacyNoticeAcknowledged: z.literal(true),
  privacyNoticeVersion: z.literal(CURRENT_POLICY_VERSIONS.PRIVACY_NOTICE),
  website: z.string().trim().max(300).optional().default(""),
});

function escapeEmailHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[character]!);
}

async function sendGrievanceReceipt(
  email: string,
  name: string,
  ticket: { caseNumber: string; category: string },
): Promise<boolean> {
  const safeName = escapeEmailHtml(name);
  const safeCase = escapeEmailHtml(ticket.caseNumber);
  const safeCategory = escapeEmailHtml(ticket.category.replace(/_/g, " "));
  try {
    return await sendEmail(
      email,
      "Truvi grievance acknowledgement — " + ticket.caseNumber,
      '<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;padding:24px;color:#172033">' +
        "<h2>We have received your complaint</h2>" +
        "<p>Hello " + safeName + ",</p>" +
        "<p>Your grievance has been recorded and acknowledged. Keep this case number for future communication:</p>" +
        "<p style=\"font-size:18px;font-weight:bold\">" + safeCase + "</p>" +
        "<p><strong>Category:</strong> " + safeCategory + "</p>" +
        "<p>For privacy, this acknowledgement contains only the case reference and category. The full complaint is retained in Truvi's restricted case system for authorised review.</p>" +
        "<p>For follow-up, reply to this email or write to info@truviventures.com and mention the case number.</p>" +
        "<p>Truvi Support</p></div>",
    );
  } catch {
    console.warn("GRIEVANCE_RECEIPT_EMAIL_FAILED", ticket.caseNumber);
    return false;
  }
}

router.post("/public-grievances", complianceSubmissionLimiter, async (req, res) => {
  const parsed = publicGrievanceSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid grievance" });

  // A populated honeypot is treated as a rejected submission. Never echo the
  // hidden field or supplied values into logs or the response.
  if (parsed.data.website) return res.status(400).json({ error: "Unable to submit this complaint." });
  if (parsed.data.phone && !/^[+0-9() .-]{7,25}$/.test(parsed.data.phone)) {
    return res.status(400).json({ error: "Enter a valid phone number or leave the field blank." });
  }

  const now = new Date();
  const acknowledgementDueAt = new Date(now.getTime() + 48 * 60 * 60 * 1000);
  // Internal target is 15 calendar days; e-commerce entities covered by the
  // Consumer Protection Rules must redress complaints within one month.
  const responseDueAt = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000);
  const caseNumber = "TRV-" + now.getTime().toString(36).toUpperCase() + "-" + randomBytes(3).toString("hex").toUpperCase();
  const [ticket] = await getDb().insert(grievanceTickets).values({
    requesterUserId: null,
    requesterName: parsed.data.name,
    requesterEmail: parsed.data.email,
    requesterPhone: parsed.data.phone || null,
    privacyNoticeVersion: parsed.data.privacyNoticeVersion,
    privacyNoticeAcknowledgedAt: now,
    caseNumber,
    category: parsed.data.category,
    subject: parsed.data.subject,
    description: parsed.data.description,
    status: "SUBMITTED",
    acknowledgedAt: null,
    acknowledgementDueAt,
    responseDueAt,
    requestedAt: now,
    updatedAt: now,
  }).returning({
    _id: grievanceTickets._id,
    caseNumber: grievanceTickets.caseNumber,
    category: grievanceTickets.category,
    subject: grievanceTickets.subject,
    status: grievanceTickets.status,
    requestedAt: grievanceTickets.requestedAt,
    acknowledgedAt: grievanceTickets.acknowledgedAt,
    responseDueAt: grievanceTickets.responseDueAt,
    acknowledgementDueAt: grievanceTickets.acknowledgementDueAt,
  });

  const emailPromise = sendGrievanceReceipt(parsed.data.email, parsed.data.name, {
    caseNumber: ticket.caseNumber,
    category: parsed.data.category,
  });
  const adminNoticePromise = notifyRole("ADMIN", {
    type: "grievance_submitted",
    title: "New public grievance received",
    message: ticket.caseNumber + " · " + ticket.category.replace(/_/g, " "),
    data: { href: "/admin/compliance", grievanceId: ticket._id },
    priority: "high",
    dedupeKey: "grievance:" + ticket._id,
  }).catch(() => []);
  const safeAdminName = escapeEmailHtml(parsed.data.name);
  const safeAdminEmail = escapeEmailHtml(parsed.data.email);
  const safeAdminPhone = escapeEmailHtml(parsed.data.phone || "Not provided");
  const safeAdminSubject = escapeEmailHtml(parsed.data.subject);
  const safeAdminDescription = escapeEmailHtml(parsed.data.description).replace(/\r?\n/g, "<br>");
  const teamEmailPromise = sendEmail(
    "info@truviventures.com",
    "New Truvi grievance — " + ticket.caseNumber,
    '<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;padding:24px;color:#172033">' +
      "<h2>New public grievance received</h2>" +
      "<p><strong>Case:</strong> " + escapeEmailHtml(ticket.caseNumber) + "</p>" +
      "<p><strong>Name:</strong> " + safeAdminName + "</p>" +
      "<p><strong>Email:</strong> " + safeAdminEmail + "</p>" +
      "<p><strong>Phone:</strong> " + safeAdminPhone + "</p>" +
      "<p><strong>Category:</strong> " + escapeEmailHtml(ticket.category.replace(/_/g, " ")) + "</p>" +
      "<p><strong>Subject:</strong> " + safeAdminSubject + "</p>" +
      "<p><strong>Complaint:</strong><br>" + safeAdminDescription + "</p>" +
      "<p>Review this case in the Truvi Admin Compliance Centre.</p></div>",
  ).catch(() => false);
  const [emailSent] = await Promise.all([emailPromise, adminNoticePromise, teamEmailPromise]);

  // Mark acknowledged only after the email provider accepts the full complaint
  // copy. If delivery is unconfigured or rejected, leave the case SUBMITTED so
  // the admin queue can pick it up before the 48-hour acknowledgement target.
  let recordedTicket = ticket;
  if (emailSent) {
    const [acknowledgedTicket] = await getDb().update(grievanceTickets).set({
      status: "ACKNOWLEDGED",
      acknowledgedAt: new Date(),
      updatedAt: new Date(),
    }).where(and(
      eq(grievanceTickets._id, ticket._id),
      eq(grievanceTickets.status, "SUBMITTED"),
    )).returning({
      _id: grievanceTickets._id,
      caseNumber: grievanceTickets.caseNumber,
      category: grievanceTickets.category,
      subject: grievanceTickets.subject,
      status: grievanceTickets.status,
      requestedAt: grievanceTickets.requestedAt,
      acknowledgedAt: grievanceTickets.acknowledgedAt,
      acknowledgementDueAt: grievanceTickets.acknowledgementDueAt,
      responseDueAt: grievanceTickets.responseDueAt,
    });
    if (acknowledgedTicket) recordedTicket = acknowledgedTicket;
  }

  await logAudit({
    userId: null,
    action: "compliance.grievance.submit_public",
    resourceType: "grievance_ticket",
    resourceId: ticket._id,
    metadata: { caseNumber: ticket.caseNumber, category: ticket.category, channel: "PUBLIC_FORM", acknowledgementAcceptedByProvider: emailSent },
  });
  return res.status(201).json({ ticket: recordedTicket, acknowledgementEmailSent: emailSent });
});

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

router.post("/account-deletion/request", ...otpSendLimiter, complianceSubmissionLimiter, async (req: AuthedRequest, res) => {
  const db = getDb();
  const userId = req.user!.userId;
  const [account] = await db.select().from(users).where(eq(users._id, userId)).limit(1);
  if (!account || account.disabled) return res.status(404).json({ error: "Active account not found." });
  if (!account.emailVerified) return res.status(400).json({ error: "Verify your email address before requesting account deletion." });

  // Prevent the platform from losing its only active administrator.
  if (account.role === "ADMIN") {
    const activeAdmins = await db.select({ id: users._id }).from(users)
      .where(and(eq(users.role, "ADMIN"), eq(users.disabled, false)));
    if (activeAdmins.length <= 1) return res.status(409).json({ error: "The last active administrator cannot deactivate this account. Transfer administrator access first." });
  }

  const otp = generateOtp();
  try {
    const sent = await sendOtpEmail(account.email, otp);
    if (!sent) return res.status(503).json({ error: "We could not send the confirmation code. Your account has not been deactivated." });
  } catch {
    return res.status(503).json({ error: "We could not send the confirmation code. Your account has not been deactivated." });
  }

  const now = new Date();
  await db.insert(accountDeletionRequests).values({
    userId,
    status: "OTP_SENT",
    deletionOtpHash: hashOtpForStorage(otp),
    otpExpiresAt: new Date(now.getTime() + 10 * 60 * 1000),
    restoreTokenHash: null,
    restoreExpiresAt: null,
    requestedAt: now,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: accountDeletionRequests.userId,
    set: {
      status: "OTP_SENT",
      deletionOtpHash: hashOtpForStorage(otp),
      otpExpiresAt: new Date(now.getTime() + 10 * 60 * 1000),
      restoreTokenHash: null,
      restoreExpiresAt: null,
      requestedAt: now,
      deactivatedAt: null,
      restoredAt: null,
      updatedAt: now,
    },
  });
  await clearOtpAttempts("account-delete:" + userId);
  return res.json({
    ok: true,
    email: account.email.replace(/^(.{1,2}).*(@.*)$/, "$1••••$2"),
    expiresInSeconds: 600,
    message: "A six-digit confirmation code has been sent to your verified email address.",
  });
});

const confirmDeletionSchema = z.object({ otp: z.string().trim().regex(/^\d{6}$/) });
router.post("/account-deletion/confirm", ...otpVerifyLimiter, async (req: AuthedRequest, res) => {
  const parsed = confirmDeletionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Enter the six-digit code sent to your email." });

  const userId = req.user!.userId;
  const attemptKey = "account-delete:" + userId;
  if (await otpAttemptBlocked(attemptKey)) return res.status(429).json({ error: TOO_MANY_OTP });

  const db = getDb();
  const now = new Date();
  const [request] = await db.select().from(accountDeletionRequests)
    .where(and(eq(accountDeletionRequests.userId, userId), eq(accountDeletionRequests.status, "OTP_SENT")))
    .limit(1);
  if (!request || typeof request.deletionOtpHash !== "string" || !request.otpExpiresAt) {
    return res.status(400).json({ error: "Request a new account-deletion code first." });
  }
  const deletionOtpHash = request.deletionOtpHash;
  if (request.otpExpiresAt.getTime() <= now.getTime()) {
    return res.status(410).json({ error: "This confirmation code has expired. Request a new code." });
  }
  if (!verifyStoredOtp(parsed.data.otp, deletionOtpHash)) {
    await recordOtpFailure(attemptKey);
    return res.status(400).json({ error: "The confirmation code is incorrect." });
  }

  const [account] = await db.select({
    id: users._id,
    name: users.name,
    email: users.email,
    role: users.role,
    disabled: users.disabled,
  }).from(users).where(eq(users._id, userId)).limit(1);
  if (!account || account.disabled) return res.status(404).json({ error: "Active account not found." });
  if (account.role === "ADMIN") {
    const activeAdmins = await db.select({ id: users._id }).from(users)
      .where(and(eq(users.role, "ADMIN"), eq(users.disabled, false)));
    if (activeAdmins.length <= 1) return res.status(409).json({ error: "The last active administrator cannot deactivate this account." });
  }

  const rawRestoreToken = randomBytes(32).toString("hex");
  const restoreTokenHash = createHash("sha256").update(rawRestoreToken).digest("hex");
  const restoreExpiresAt = new Date(now.getTime() + RESTORE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const clientBase = (process.env.CLIENT_URL || "https://truviventures.com").replace(/\/$/, "");
  const restoreUrl = clientBase + "/restore-account#token=" + rawRestoreToken;
  const escapedName = account.name.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

  // Send the recovery link before disabling the account. If email delivery is
  // unavailable, the user remains signed in and can retry rather than being
  // locked out without a way back in.
  try {
    const sent = await sendEmail(
      account.email,
      "Your Truvi account deactivation and recovery link",
      `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px;color:#172033">
        <h2>Account deactivation confirmed</h2>
        <p>Hello ${escapedName},</p>
        <p>Your Truvi account has been deactivated after email OTP confirmation. You can restore it within ${RESTORE_WINDOW_DAYS} days using the secure, single-use link below.</p>
        <p><a href="${restoreUrl}" style="display:inline-block;padding:12px 18px;background:#172033;color:#fff;text-decoration:none;border-radius:8px">Restore my Truvi account</a></p>
        <p>This link expires on ${restoreExpiresAt.toLocaleDateString("en-IN", { dateStyle: "long", timeZone: "Asia/Kolkata" })}. If you did not request this, use the link only from the email account you control and contact support.</p>
        <p>Account deactivation stops sign-in. Related transaction, tax, commission, KYC, security and dispute records may be retained where legally or operationally required. Permanent erasure is reviewed separately after the recovery period.</p>
      </div>`,
    );
    if (!sent) return res.status(503).json({ error: "We could not send your recovery email. Your account has not been deactivated." });
  } catch {
    return res.status(503).json({ error: "We could not send your recovery email. Your account has not been deactivated." });
  }

  const deactivated = await db.transaction(async (tx) => {
    const [claimed] = await tx.update(accountDeletionRequests).set({
      status: "DEACTIVATED",
      deletionOtpHash: null,
      otpExpiresAt: null,
      restoreTokenHash,
      restoreExpiresAt,
      deactivatedAt: now,
      updatedAt: now,
    }).where(and(
      eq(accountDeletionRequests._id, request._id),
      eq(accountDeletionRequests.status, "OTP_SENT"),
      eq(accountDeletionRequests.deletionOtpHash, deletionOtpHash),
      gt(accountDeletionRequests.otpExpiresAt, now),
    )).returning({ id: accountDeletionRequests._id });

    if (!claimed) return false;
    const [updated] = await tx.update(users).set({
      disabled: true,
      authVersion: sql`auth_version + 1`,
    }).where(and(eq(users._id, userId), eq(users.disabled, false))).returning({ id: users._id });
    if (!updated) throw new Error("The active account changed during deactivation.");
    return true;
  });

  if (!deactivated) return res.status(409).json({ error: "Your account state changed. Refresh and request deletion again." });
  await clearOtpAttempts(attemptKey);
  clearRefreshCookies(res);
  await logAudit({
    userId,
    action: "account.deletion.deactivate",
    resourceType: "account_deletion_request",
    resourceId: request._id,
    metadata: { restoreWindowDays: RESTORE_WINDOW_DAYS, confirmation: "email_otp" },
  });
  return res.json({
    ok: true,
    deactivated: true,
    restoreWindowDays: RESTORE_WINDOW_DAYS,
    message: "Your account is deactivated. A single-use restoration link has been emailed to your verified address.",
  });
});

router.get("/me", async (req: AuthedRequest, res) => {
  const db = getDb();
  const userId = req.user!.userId;
  const [events, requests, tickets, deletionState] = await Promise.all([
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
    db.select({
      status: accountDeletionRequests.status,
      otpExpiresAt: accountDeletionRequests.otpExpiresAt,
      requestedAt: accountDeletionRequests.requestedAt,
    }).from(accountDeletionRequests)
      .where(eq(accountDeletionRequests.userId, userId))
      .limit(1),
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
    accountDeletion: deletionState[0] ?? null,
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
router.post("/privacy-requests", complianceSubmissionLimiter, async (req: AuthedRequest, res) => {
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

  await Promise.all([
    notifyRole("ADMIN", {
      type: "privacy_request_submitted",
      title: "New privacy request",
      message: "A user submitted a " + request.requestType.toLowerCase().replace(/_/g, " ") + " request.",
      data: { href: "/admin/compliance", requestId: request._id },
      actorUserId: userId,
      priority: "high",
      dedupeKey: "privacy-request:" + request._id,
    }).catch(() => []),
    notifyUser(userId, {
      type: "privacy_request_received",
      title: "Privacy request received",
      message: "We received your " + request.requestType.toLowerCase().replace(/_/g, " ") + " request. You can follow its progress in Privacy & Support Centre.",
      data: { href: "/privacy-center", requestId: request._id },
      priority: "normal",
      dedupeKey: "privacy-request-received:" + request._id,
    }).catch(() => []),
  ]);
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
router.post("/grievances", complianceSubmissionLimiter, async (req: AuthedRequest, res) => {
  const parsed = grievanceSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid grievance" });

  const userId = req.user!.userId;
  const db = getDb();
  const [requester] = await db.select({ name: users.name, email: users.email }).from(users).where(eq(users._id, userId)).limit(1);
  const now = new Date();
  const responseDueAt = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000);
  const caseNumber = "TRV-" + now.getTime().toString(36).toUpperCase() + "-" + randomBytes(3).toString("hex").toUpperCase();
  const [ticket] = await db.insert(grievanceTickets).values({
    requesterUserId: userId,
    requesterName: requester?.name ?? null,
    requesterEmail: requester?.email ?? null,
    caseNumber,
    category: parsed.data.category,
    subject: parsed.data.subject,
    description: parsed.data.description,
    status: "ACKNOWLEDGED",
    acknowledgedAt: now,
    acknowledgementDueAt: now,
    responseDueAt,
    requestedAt: now,
    updatedAt: now,
  }).returning();

  await Promise.all([
    notifyRole("ADMIN", {
      type: "grievance_submitted",
      title: "New grievance received",
      message: ticket.caseNumber + " · " + ticket.category.replace(/_/g, " "),
      data: { href: "/admin/compliance", grievanceId: ticket._id },
      actorUserId: userId,
      priority: "high",
      dedupeKey: "grievance:" + ticket._id,
    }).catch(() => []),
    notifyUser(userId, {
      type: "grievance_received",
      title: "Grievance received",
      message: "We received your case " + ticket.caseNumber + ". You can track its progress in Privacy & Support Centre.",
      data: { href: "/privacy-center", caseNumber: ticket.caseNumber, grievanceId: ticket._id },
      priority: "normal",
      dedupeKey: "grievance-received:" + ticket._id,
    }).catch(() => []),
  ]);
  if (requester?.email) {
    await sendGrievanceReceipt(requester.email, requester.name, {
      caseNumber: ticket.caseNumber,
      category: parsed.data.category,
      subject: parsed.data.subject,
    });
  }
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
  const now = new Date();
  // Once the recovery link expires, move the deactivation into the manual
  // erasure/retention review queue. The system does not hard-delete records
  // whose ownership, finance, KYC, audit or statutory dependencies are unknown.
  await db.update(accountDeletionRequests).set({ status: "ERASURE_REVIEW", updatedAt: now })
    .where(and(eq(accountDeletionRequests.status, "DEACTIVATED"), lt(accountDeletionRequests.restoreExpiresAt, now)));

  const [grievanceRows, privacyRows, deletionRows] = await Promise.all([
    db.select({
      ticket: grievanceTickets,
      requesterName: users.name,
      requesterEmail: users.email,
      requesterRole: users.role,
    }).from(grievanceTickets)
      .leftJoin(users, eq(grievanceTickets.requesterUserId, users._id))
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
    db.select({
      request: accountDeletionRequests,
      requesterName: users.name,
      requesterEmail: users.email,
      requesterRole: users.role,
    }).from(accountDeletionRequests)
      .innerJoin(users, eq(accountDeletionRequests.userId, users._id))
      .where(inArray(accountDeletionRequests.status, ["DEACTIVATED", "ERASURE_REVIEW"]))
      .orderBy(desc(accountDeletionRequests.requestedAt))
      .limit(100),
  ]);
  res.setHeader("Cache-Control", "private, no-store");
  return res.json({
    grievances: grievanceRows.map((row) => ({
      ...row.ticket,
      requesterName: row.requesterName ?? row.ticket.requesterName ?? "Public complainant",
      requesterEmail: row.requesterEmail ?? row.ticket.requesterEmail ?? "",
      requesterPhone: row.ticket.requesterPhone,
      requesterRole: row.requesterRole ?? "PUBLIC",
    })),
    privacyRequests: privacyRows.map((row) => ({ ...row.request, requesterName: row.requesterName, requesterEmail: row.requesterEmail, requesterRole: row.requesterRole })),
    accountDeletions: deletionRows.map((row) => ({
      ...row.request,
      requesterName: row.requesterName,
      requesterEmail: row.requesterEmail,
      requesterRole: row.requesterRole,
    })),
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
    acknowledgedAt: current.acknowledgedAt ?? (nextStatus === "SUBMITTED" ? null : now),
    updatedAt: now,
    resolvedAt: nextStatus === "RESOLVED" || nextStatus === "CLOSED" ? (current.resolvedAt ?? now) : null,
  }).where(and(eq(grievanceTickets._id, id), eq(grievanceTickets.status, current.status))).returning();
  if (!updated) return res.status(409).json({ error: "This case changed while you were editing it. Refresh and try again." });

  if (parsed.data.publicResponse || nextStatus !== current.status) {
    const updateMessage = updated.caseNumber + " is now " + updated.status.toLowerCase().replace(/_/g, " ") + ".";
    if (updated.requesterUserId) {
      await notifyUser(String(updated.requesterUserId), {
        type: "grievance_updated",
        title: "Your Truvi support case was updated",
        message: updateMessage,
        data: { href: "/privacy-center", caseNumber: updated.caseNumber },
        priority: "high",
        dedupeKey: "grievance-update:" + updated._id + ":" + updated.updatedAt.getTime(),
      }).catch(() => []);
    } else if (updated.requesterEmail) {
      const responseText = (parsed.data.publicResponse ?? updated.publicResponse ?? "").replace(/[\r\n]+/g, " ").trim();
      const safeResponse = escapeEmailHtml(responseText);
      await sendEmail(
        updated.requesterEmail,
        "Truvi grievance update — " + updated.caseNumber,
        '<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px;color:#172033">' +
          "<h2>Your grievance has been updated</h2>" +
          "<p>Case: <strong>" + escapeEmailHtml(updated.caseNumber) + "</strong></p>" +
          "<p>Status: " + escapeEmailHtml(updated.status.replace(/_/g, " ")) + "</p>" +
          (safeResponse ? "<p>" + safeResponse + "</p>" : "") +
          "<p>For follow-up, reply to this email or write to info@truviventures.com.</p></div>",
      ).catch(() => false);
    }
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
