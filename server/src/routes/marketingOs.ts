/**
 * Truvi Marketing OS — integrated with the existing HR, employee task and CRM systems.
 * Partner responses are explicitly allow-listed; operational writes are audited.
 */
import { Router } from "express";
import fs from "node:fs";
import { randomBytes, createHash, createCipheriv, createDecipheriv } from "node:crypto";
import bcrypt from "bcryptjs";
import { and, desc, eq, gte, inArray, isNotNull, isNull, lt, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../config/db";
import {
  users, employees, projects, leads, leadActivities, siteVisits, commissions,
  employeeTasks, employeeTaskAssignments, employeeTaskHistory, employeeTaskAttachments, employeeTaskComments,
  marketingPartnerCampaigns, marketingPartnerProfiles, marketingPartnerInvites,
  marketingPartnerProjects, marketingCampaignEmployees, marketingCampaignLeads, marketingTaskPartners,
  marketingTaskUpdates, marketingOsEmailOutbox, userConsentEvents,
} from "../db/schema";
import { authenticate, type AuthedRequest } from "../middleware/auth";
import { isValidId } from "../lib/ids";
import { CURRENT_POLICY_VERSIONS } from "../config/compliance";
import { sendEmailWithStatus, MAIL_FROM } from "../services/emailService";
import { createNotifications } from "../services/notificationService";
import { logAudit } from "../services/audit";
import { privateFilePath } from "../services/privateFiles";

const router = Router();
const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
const inviteMailKey = () => createHash("sha256").update("truvi-marketing-os-invite:" + (process.env.JWT_ACCESS_SECRET || "local-development-only")).digest();
export function encryptInviteUrl(value: string): string {
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", inviteMailKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv.toString("hex"), cipher.getAuthTag().toString("hex"), encrypted.toString("hex")].join(".");
}
function decryptInviteUrl(value: string): string {
  const [ivHex, tagHex, dataHex] = value.split(".");
  if (!ivHex || !tagHex || !dataHex) throw new Error("INVALID_ENCRYPTED_INVITE_URL");
  const decipher = createDecipheriv("aes-256-gcm", inviteMailKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]).toString("utf8");
}
const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] || ""));
const partnerPermissionDefaults = ["project.read.assigned", "campaign.read.assigned", "task.read.shared", "report.read.assigned"];
const partnerPermissionAllowlist = [...partnerPermissionDefaults, "task.update.shared"];

function isAdmin(req: AuthedRequest) { return req.user?.role === "ADMIN"; }
function isMarketingEmployee(employee: typeof employees.$inferSelect) {
  return employee.department.toLowerCase().includes("market") ||
    Boolean(employee.permissions?.some((permission) => ["marketing.os.manage", "marketing.os.read"].includes(permission)));
}
function isMarketingTask(task: typeof employeeTasks.$inferSelect) {
  return task.taskType === "ASSIGNED" && (task.category === "MARKETING" || Boolean(task.marketingCampaignId));
}
async function actorEmployee(req: AuthedRequest) {
  if (req.user?.role !== "EMPLOYEE") return null;
  const [row] = await getDb().select().from(employees)
    .where(and(eq(employees.accountUserId, req.user.userId), eq(employees.status, "ACTIVE"))).limit(1);
  return row ?? null;
}
async function canManage(req: AuthedRequest) {
  if (isAdmin(req)) return true;
  const emp = await actorEmployee(req);
  return !!emp?.permissions?.includes("marketing.os.manage");
}
async function requireManager(req: AuthedRequest, res: import("express").Response) {
  if (!(await canManage(req))) { res.status(403).json({ error: "Marketing management permission is required." }); return false; }
  return true;
}

export async function queueMarketingOsEmail(userId: string, eventType: string, resourceId: string | null, payload: Record<string, unknown>, dedupeKey: string): Promise<boolean> {
  try {
    await getDb().insert(marketingOsEmailOutbox).values({
      recipientUserId: userId, eventType, resourceId, payload, dedupeKey,
      status: "QUEUED", attempts: 0, nextAttemptAt: new Date(),
    }).onConflictDoNothing();
    return true;
  } catch (error) {
    console.warn("[marketing-os] email could not be queued:", error instanceof Error ? error.message : "unknown");
    return false;
  }
}

function renderEmail(eventType: string, name: string, payload: Record<string, unknown>) {
  const title = String(payload.title || "A new update from Truvi");
  const message = String(payload.message || "");
  const href = typeof payload.hrefEncrypted === "string" ? decryptInviteUrl(payload.hrefEncrypted) : String(payload.href || "https://truviventures.com");
  const action = ["PARTNER_INVITE", "EMPLOYEE_INVITE"].includes(eventType) ? "Set up my account" : "Open Marketing OS";
  return {
    subject: eventType === "PARTNER_INVITE" ? "Your Truvi Marketing Partner invitation" : title + " | Truvi Ventures",
    html: '<div style="margin:0;background:#071321;padding:32px 12px;font-family:Arial,sans-serif;color:#f8fafc"><div style="max-width:560px;margin:auto;border:1px solid #1d4056;border-radius:18px;background:#0b1b2b;padding:30px"><div style="font-size:12px;letter-spacing:3px;color:#38bdf8;font-weight:700">TRUVI VENTURES</div><h1 style="font-size:25px;line-height:1.25;margin:22px 0 12px">' + esc(title) + '</h1><p style="color:#cbd5e1;line-height:1.7">Hello ' + esc(name) + ',</p><p style="color:#cbd5e1;line-height:1.7">' + esc(message) + '</p><p style="margin:26px 0"><a href="' + esc(href) + '" style="background:#0ea5e9;color:#03111f;text-decoration:none;font-weight:700;padding:13px 20px;border-radius:10px;display:inline-block">' + action + '</a></p><p style="font-size:12px;color:#94a3b8;line-height:1.6">This is an operational email about your Truvi account or assigned work. Promotional updates remain a separate optional preference.</p><p style="color:#cbd5e1">Team Truvi<br/>truviventures.com</p></div></div>',
  };
}

/** Durable queue with atomic claiming, bounded retries and idempotent provider keys. */
export async function processMarketingOsEmailOutbox(limit = 25) {
  const db = getDb(), now = new Date(), stale = new Date(Date.now() - 10 * 60_000);
  await db.update(marketingOsEmailOutbox).set({
    status: "RETRY_PENDING", claimedAt: null, nextAttemptAt: now, lastError: "STALE_SEND_RECOVERED",
  }).where(and(
    eq(marketingOsEmailOutbox.status, "SENDING"),
    lt(marketingOsEmailOutbox.attempts, 5),
    or(isNull(marketingOsEmailOutbox.claimedAt), lt(marketingOsEmailOutbox.claimedAt, stale)),
  ));
  await db.update(marketingOsEmailOutbox).set({
    status: "FAILED", claimedAt: null, nextAttemptAt: now, lastError: "STALE_SEND_EXHAUSTED",
  }).where(and(
    eq(marketingOsEmailOutbox.status, "SENDING"),
    gte(marketingOsEmailOutbox.attempts, 5),
    or(isNull(marketingOsEmailOutbox.claimedAt), lt(marketingOsEmailOutbox.claimedAt, stale)),
  ));
  const pending = await db.select({ id: marketingOsEmailOutbox._id }).from(marketingOsEmailOutbox)
    .where(and(inArray(marketingOsEmailOutbox.status, ["QUEUED", "RETRY_PENDING"]), lt(marketingOsEmailOutbox.attempts, 5), lte(marketingOsEmailOutbox.nextAttemptAt, now)))
    .orderBy(marketingOsEmailOutbox.nextAttemptAt).limit(Math.max(1, Math.min(100, limit)));
  let accepted = 0, retried = 0, failed = 0;
  for (const item of pending) {
    const [job] = await db.update(marketingOsEmailOutbox).set({
      status: "SENDING", attempts: sql.raw('"attempts" + 1'), claimedAt: now,
    }).where(and(eq(marketingOsEmailOutbox._id, item.id), inArray(marketingOsEmailOutbox.status, ["QUEUED", "RETRY_PENDING"]), lte(marketingOsEmailOutbox.nextAttemptAt, now))).returning();
    if (!job) continue;
    try {
      const [recipient] = await db.select({ name: users.name, email: users.email, disabled: users.disabled }).from(users).where(eq(users._id, job.recipientUserId)).limit(1);
      const activationInvite = job.eventType === "PARTNER_INVITE" || job.eventType === "EMPLOYEE_INVITE";
      if (!recipient || (!activationInvite && recipient.disabled) || !recipient.email) throw new Error("RECIPIENT_UNAVAILABLE");
      const rendered = renderEmail(job.eventType, recipient.name, job.payload || {});
      const result = await sendEmailWithStatus(recipient.email, rendered.subject, rendered.html, MAIL_FROM, { idempotencyKey: "marketing-os/" + String(job._id) });
      if (result.status !== "SENT_TO_PROVIDER") throw new Error("EMAIL_PROVIDER_UNCONFIGURED");
      await db.update(marketingOsEmailOutbox).set({ status: "SENT_TO_PROVIDER", sentAt: new Date(), claimedAt: null, lastError: null }).where(eq(marketingOsEmailOutbox._id, job._id));
      accepted++;
    } catch (error) {
      const terminal = job.attempts >= 5;
      const delay = [1, 5, 15, 60, 180][Math.max(0, job.attempts - 1)] || 180;
      await db.update(marketingOsEmailOutbox).set({
        status: terminal ? "FAILED" : "RETRY_PENDING",
        nextAttemptAt: terminal ? now : new Date(Date.now() + delay * 60_000),
        claimedAt: null, lastError: error instanceof Error ? error.message.slice(0, 120) : "EMAIL_SEND_FAILED",
      }).where(eq(marketingOsEmailOutbox._id, job._id));
      if (terminal) failed++; else retried++;
    }
  }
  return { scanned: pending.length, accepted, retried, failed };
}

/**
 * Queue one Marketing task deadline email per active assignee, at most once
 * per India-local day and deadline. Delivery is handled by the durable outbox.
 */
export async function queueMarketingOsDeadlineReminders(): Promise<{ scanned: number; queued: number }> {
  const db = getDb();
  const now = new Date();
  const soon = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const part = (kind: string) => parts.find((item) => item.type === kind)?.value ?? "";
  const dayKey = part("year") + "-" + part("month") + "-" + part("day");
  const rows = await db.select().from(employeeTasks)
    .where(and(eq(employeeTasks.taskType, "ASSIGNED"), eq(employeeTasks.category, "MARKETING"), lte(employeeTasks.deadlineAt, soon)))
    .orderBy(employeeTasks.deadlineAt).limit(1000);
  let queued = 0;
  for (const task of rows) {
    if (!task.deadlineAt || ["COMPLETED", "CANCELLED", "UNDER_REVIEW"].includes(task.status)) continue;
    const assignments = await db.select({
      employeeId: employeeTaskAssignments.employeeId,
      status: employeeTaskAssignments.status,
    }).from(employeeTaskAssignments).where(eq(employeeTaskAssignments.taskId, task._id));
    const activeAssignmentIds = assignments
      .filter((row) => !["COMPLETED", "CANCELLED", "UNDER_REVIEW"].includes(row.status))
      .map((row) => String(row.employeeId));
    const targetIds = activeAssignmentIds.length
      ? Array.from(new Set(activeAssignmentIds))
      : assignments.length ? [] : [String(task.employeeId)];
    if (!targetIds.length) continue;
    const recipients = await db.select({
      userId: employees.accountUserId,
      name: employees.name,
    }).from(employees).innerJoin(users, eq(employees.accountUserId, users._id))
      .where(and(inArray(employees._id, targetIds), eq(users.disabled, false), eq(users.role, "EMPLOYEE")));
    const overdue = task.deadlineAt.getTime() < now.getTime();
    const deadlineLabel = task.deadlineAt.toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
    for (const recipient of recipients) {
      if (!recipient.userId) continue;
      await queueMarketingOsEmail(
        String(recipient.userId),
        "TASK_DEADLINE",
        String(task._id),
        {
          title: overdue ? "Marketing task overdue" : "Marketing task due soon",
          message: (overdue ? "Your Marketing task is overdue: " : "Your Marketing task is due soon: ") +
            task.title + ". Deadline: " + deadlineLabel + ".",
          href: "https://truviventures.com/employee/marketing",
        },
        "marketing-deadline:" + String(task._id) + ":" + String(recipient.userId) + ":" + task.deadlineAt.toISOString() + ":" + dayKey,
      );
      queued++;
    }
  }
  return { scanned: rows.length, queued };
}

// Public, single-use partner activation. This is deliberately registered before authenticate.
router.post("/partner/activate", async (req, res) => {
  const parsed = z.object({
    token: z.string().regex(/^[a-f0-9]{64}$/i),
    password: z.string().min(12).max(128).regex(/[a-z]/).regex(/[A-Z]/).regex(/[0-9]/).regex(/[^A-Za-z0-9]/),
    acceptTerms: z.literal(true), acknowledgePrivacyNotice: z.literal(true),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Check your password and accept the required account policies." });
  const db = getDb();
  const [invite] = await db.select().from(marketingPartnerInvites).where(eq(marketingPartnerInvites.tokenHash, tokenHash(parsed.data.token))).limit(1);
  if (!invite || invite.usedAt || invite.expiresAt.getTime() < Date.now()) return res.status(400).json({ error: "This invitation is invalid, expired or already used. Ask Truvi Admin to resend it." });
  const [account] = await db.select({ role: users.role, disabled: users.disabled })
    .from(users).where(eq(users._id, invite.userId)).limit(1);
  if (!account || account.role !== "MARKETING_PARTNER" || !account.disabled) {
    return res.status(409).json({ error: "This invitation is no longer active. Contact Truvi Admin for a new invitation." });
  }
  const [profile] = await db.select().from(marketingPartnerProfiles).where(eq(marketingPartnerProfiles.userId, invite.userId)).limit(1);
  if (!profile || profile.status !== "ACTIVE") return res.status(403).json({ error: "This partner account is inactive. Contact Truvi Admin." });
  const password = await bcrypt.hash(parsed.data.password, 12);
  await db.transaction(async (tx) => {
    const [claimed] = await tx.update(marketingPartnerInvites).set({ usedAt: new Date() })
      .where(and(eq(marketingPartnerInvites._id, invite._id), isNull(marketingPartnerInvites.usedAt))).returning({ id: marketingPartnerInvites._id });
    if (!claimed) throw new Error("INVITATION_ALREADY_USED");
    await tx.update(users).set({ password, disabled: false, emailVerified: true, authVersion: sql.raw('"auth_version" + 1') }).where(eq(users._id, invite.userId));
    await tx.insert(userConsentEvents).values([
      { userId: invite.userId, policyType: "TERMS_OF_SERVICE", policyVersion: CURRENT_POLICY_VERSIONS.TERMS_OF_SERVICE, action: "ACKNOWLEDGED", source: "EMPLOYEE_ACTIVATION", occurredAt: new Date() },
      { userId: invite.userId, policyType: "PRIVACY_NOTICE", policyVersion: CURRENT_POLICY_VERSIONS.PRIVACY_NOTICE, action: "ACKNOWLEDGED", source: "EMPLOYEE_ACTIVATION", occurredAt: new Date() },
    ]);
    await tx.update(marketingPartnerProfiles).set({
      termsAcceptedAt: new Date(), termsVersion: CURRENT_POLICY_VERSIONS.TERMS_OF_SERVICE,
      privacyAcknowledgedAt: new Date(), privacyNoticeVersion: CURRENT_POLICY_VERSIONS.PRIVACY_NOTICE,
      updatedAt: new Date(),
    }).where(eq(marketingPartnerProfiles.userId, invite.userId));
  });
  await logAudit({ userId: invite.userId, action: "marketing.partner.activate", resourceType: "marketing_partner", resourceId: String(invite.userId) });
  return res.json({ ok: true, message: "Your Truvi Marketing Partner account is active. Sign in using your invited email." });
});

router.use(authenticate);

router.get("/partner/me", async (req: AuthedRequest, res) => {
  if (req.user!.role !== "MARKETING_PARTNER") return res.status(403).json({ error: "Partner access only." });
  const [profile] = await getDb().select().from(marketingPartnerProfiles).where(eq(marketingPartnerProfiles.userId, req.user!.userId)).limit(1);
  if (!profile || profile.status !== "ACTIVE") return res.status(403).json({ error: "Partner access is inactive." });
  const [user] = await getDb().select({ name: users.name, email: users.email }).from(users).where(eq(users._id, req.user!.userId)).limit(1);
  return res.json({ profile: { companyName: profile.companyName, permissions: profile.permissions }, user });
});

router.get("/overview", async (req: AuthedRequest, res) => {
  if (!(await requireManager(req, res))) return;
  const db = getDb();
  const employeeId = typeof req.query.employeeId === "string" ? req.query.employeeId : "";
  const projectId = typeof req.query.projectId === "string" ? req.query.projectId : "";
  const campaignId = typeof req.query.campaignId === "string" ? req.query.campaignId : "";
  const statusFilter = typeof req.query.status === "string" ? req.query.status.trim().toUpperCase() : "";
  const from = typeof req.query.from === "string" ? new Date(req.query.from) : null;
  const to = typeof req.query.to === "string" ? new Date(req.query.to) : null;

  const [tasks, employeesRows, campaigns, visits, allCampaignLeadRows, campaignEmployeeRows] = await Promise.all([
    db.select().from(employeeTasks)
      .where(and(eq(employeeTasks.taskType, "ASSIGNED"), or(eq(employeeTasks.category, "MARKETING"), isNotNull(employeeTasks.marketingCampaignId))!))
      .orderBy(desc(employeeTasks.createdAt)).limit(2000),
    db.select({ employee: employees, disabled: users.disabled })
      .from(employees).leftJoin(users, eq(employees.accountUserId, users._id)).orderBy(desc(employees.createdAt)),
    db.select().from(marketingPartnerCampaigns).orderBy(desc(marketingPartnerCampaigns.createdAt)),
    db.select().from(siteVisits).orderBy(desc(siteVisits.scheduledAt)).limit(5000),
    db.select().from(marketingCampaignLeads),
    db.select().from(marketingCampaignEmployees),
  ]);
  const taskIds = tasks.map((task) => task._id);
  const taskAssignments = taskIds.length
    ? await db.select({ taskId: employeeTaskAssignments.taskId, employeeId: employeeTaskAssignments.employeeId })
        .from(employeeTaskAssignments).where(inArray(employeeTaskAssignments.taskId, taskIds))
    : [];
  const assignmentsByTask = new Map<string, Set<string>>();
  for (const assignment of taskAssignments) {
    const key = String(assignment.taskId);
    if (!assignmentsByTask.has(key)) assignmentsByTask.set(key, new Set());
    assignmentsByTask.get(key)!.add(String(assignment.employeeId));
  }
  const selectedEmployee = employeeId
    ? employeesRows.find((row) => String(row.employee._id) === employeeId)?.employee
    : null;
  if (employeeId && !selectedEmployee) return res.status(404).json({ error: "Employee filter does not match an employee record." });
  const employeeUserId = selectedEmployee?.accountUserId ? String(selectedEmployee.accountUserId) : "";
  const campaignIdsByEmployee = new Map<string, Set<string>>();
  for (const assignment of campaignEmployeeRows) {
    const id = String(assignment.employeeId);
    if (!campaignIdsByEmployee.has(id)) campaignIdsByEmployee.set(id, new Set());
    campaignIdsByEmployee.get(id)!.add(String(assignment.campaignId));
  }
  const marketingEmployeeIds = new Set([
    ...campaignEmployeeRows.map((assignment) => String(assignment.employeeId)),
    ...employeesRows.filter((row) =>
      row.employee.department.toLowerCase().includes("marketing") ||
      row.employee.permissions?.some((permission) => ["marketing.os.manage", "marketing.os.read"].includes(permission))
    ).map((row) => String(row.employee._id)),
  ]);
  const marketingEmployeeRows = employeesRows.filter((row) => marketingEmployeeIds.has(String(row.employee._id)));
  if (employeeId && !marketingEmployeeIds.has(employeeId)) return res.status(404).json({ error: "Employee filter does not match a Marketing OS employee." });

  const scopedCampaigns = campaigns.filter((campaign) =>
    (!projectId || String(campaign.projectId || "") === projectId) &&
    (!campaignId || String(campaign._id) === campaignId) &&
    (!employeeId || campaignIdsByEmployee.get(employeeId)?.has(String(campaign._id))) &&
    (!from || Number.isNaN(from.getTime()) || (campaign.endsAt || new Date(8640000000000000)) >= from) &&
    (!to || Number.isNaN(to.getTime()) || (campaign.startedAt || campaign.createdAt) <= to)
  );

  let scopedTasks = tasks.filter((task) =>
    (!projectId || String(task.projectId || "") === projectId) &&
    (!campaignId || String(task.marketingCampaignId || "") === campaignId) &&
    (!employeeId || String(task.employeeId) === employeeId || assignmentsByTask.get(String(task._id))?.has(employeeId)) &&
    (!statusFilter || task.status === statusFilter) &&
    (!from || Number.isNaN(from.getTime()) || task.createdAt >= from) &&
    (!to || Number.isNaN(to.getTime()) || task.createdAt <= to)
  );

  let relevantLeads = await db.select().from(leads).orderBy(desc(leads.createdAt)).limit(10000);
  relevantLeads = relevantLeads.filter((lead) =>
    (!projectId || String(lead.projectId) === projectId) &&
    (!employeeId || (!!employeeUserId && (String(lead.submittedById) === employeeUserId || String(lead.assignedToId || "") === employeeUserId))) &&
    (!statusFilter || !["GENERATED", "ASSIGNED", "CONTACTED", "INTERESTED", "SITE_VISIT", "NEGOTIATION", "BOOKING", "REGISTRATION", "COMPLETED", "LOST"].includes(statusFilter) || lead.stage === statusFilter) &&
    (!from || Number.isNaN(from.getTime()) || lead.createdAt >= from) &&
    (!to || Number.isNaN(to.getTime()) || lead.createdAt <= to)
  );
  if (campaignId && isValidId(campaignId)) {
    const linkedLeadIds = new Set(allCampaignLeadRows.filter((row) => String(row.campaignId) === campaignId).map((row) => String(row.leadId)));
    relevantLeads = relevantLeads.filter((lead) => linkedLeadIds.has(String(lead._id)));
  }

  const leadIds = relevantLeads.map((lead) => lead._id);
  const activities = leadIds.length
    ? (await db.select().from(leadActivities).where(inArray(leadActivities.leadId, leadIds)))
        .filter((activity) => (!from || Number.isNaN(from.getTime()) || activity.createdAt >= from) && (!to || Number.isNaN(to.getTime()) || activity.createdAt <= to))
    : [];
  const converted = relevantLeads.filter((lead) => ["BOOKING", "REGISTRATION", "COMPLETED"].includes(lead.stage)).length;
  const commissionRows = leadIds.length
    ? (await db.select().from(commissions).where(inArray(commissions.leadId, leadIds)))
        .filter((commission) => (!from || Number.isNaN(from.getTime()) || commission.createdAt >= from) && (!to || Number.isNaN(to.getTime()) || commission.createdAt <= to))
    : [];
  const activeTasks = scopedTasks.filter((task) => !["COMPLETED", "CANCELLED"].includes(task.status));
  const completedTasks = scopedTasks.filter((task) => task.status === "COMPLETED");
  const overdue = activeTasks.filter((task) => task.deadlineAt && task.deadlineAt.getTime() < Date.now());
  const relevantVisits = visits.filter((visit) =>
    (!projectId || String(visit.projectId) === projectId) &&
    (!employeeId || (!!employeeUserId && String(visit.responsibleUserId || "") === employeeUserId)) &&
    (!from || Number.isNaN(from.getTime()) || visit.scheduledAt >= from) &&
    (!to || Number.isNaN(to.getTime()) || visit.scheduledAt <= to)
  );

  const campaignPerformance = scopedCampaigns.map((campaign) => {
    const campaignLeadIds = new Set(allCampaignLeadRows.filter((row) => String(row.campaignId) === String(campaign._id)).map((row) => String(row.leadId)));
    const campaignLeads = relevantLeads.filter((lead) => campaignLeadIds.has(String(lead._id)));
    const campaignConversions = campaignLeads.filter((lead) => ["BOOKING", "REGISTRATION", "COMPLETED"].includes(lead.stage)).length;
    const campaignBookingValue = commissionRows
      .filter((commission) => campaignLeadIds.has(String(commission.leadId)))
      .reduce((sum, commission) => sum + Number(commission.bookingValue || 0), 0);
    return {
      ...campaign,
      attributedLeads: campaignLeads.length,
      convertedLeads: campaignConversions,
      bookingValue: campaignBookingValue,
      conversionRate: campaignLeads.length ? Math.round(campaignConversions / campaignLeads.length * 1000) / 10 : 0,
    };
  }).filter((campaign) => !campaignId || String(campaign._id) === campaignId);

  const employeePerformance = marketingEmployeeRows.filter((row) => row.employee.status !== "INACTIVE").map((row) => {
    const id = String(row.employee._id);
    const userId = row.employee.accountUserId ? String(row.employee.accountUserId) : "";
    const employeeTasks = scopedTasks.filter((task) => String(task.employeeId) === id || assignmentsByTask.get(String(task._id))?.has(id));
    const employeeLeads = relevantLeads.filter((lead) => !!userId && (String(lead.submittedById) === userId || String(lead.assignedToId || "") === userId));
    const employeeActivities = activities.filter((activity) => !!userId && String(activity.actorUserId || "") === userId);
    const employeeVisits = relevantVisits.filter((visit) => !!userId && String(visit.responsibleUserId || "") === userId);
    const employeeConverted = employeeLeads.filter((lead) => ["BOOKING", "REGISTRATION", "COMPLETED"].includes(lead.stage)).length;
    const employeeCompleted = employeeTasks.filter((task) => task.status === "COMPLETED").length;
    return {
      employeeId: id, name: row.employee.name, department: row.employee.department,
      designation: row.employee.title, status: row.employee.status,
      assignedTasks: employeeTasks.length, inProgress: employeeTasks.filter((task) => task.status === "IN_PROGRESS").length,
      completedTasks: employeeCompleted,
      overdueTasks: employeeTasks.filter((task) => task.deadlineAt && task.deadlineAt.getTime() < Date.now() && !["COMPLETED", "CANCELLED"].includes(task.status)).length,
      completionPercent: employeeTasks.length ? Math.round(employeeCompleted / employeeTasks.length * 100) : 0,
      leads: employeeLeads.length, calls: employeeActivities.filter((activity) => activity.type === "CALL").length,
      followUps: employeeActivities.filter((activity) => activity.type === "FOLLOW_UP").length,
      siteVisits: employeeVisits.length, conversions: employeeConverted,
      conversionRate: employeeLeads.length ? Math.round(employeeConverted / employeeLeads.length * 1000) / 10 : 0,
    };
  }).filter((row) => !employeeId || row.employeeId === employeeId);

  const dailyMap = new Map<string, { date: string; leads: number; calls: number; followUps: number; siteVisits: number; conversions: number }>();
  const dayKey = (date: Date) => new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(date);
  const dailyRow = (date: Date) => {
    const key = dayKey(date);
    if (!dailyMap.has(key)) dailyMap.set(key, { date: key, leads: 0, calls: 0, followUps: 0, siteVisits: 0, conversions: 0 });
    return dailyMap.get(key)!;
  };
  for (const lead of relevantLeads) {
    const row = dailyRow(lead.createdAt);
    row.leads += 1;
    if (["BOOKING", "REGISTRATION", "COMPLETED"].includes(lead.stage)) row.conversions += 1;
  }
  for (const activity of activities) {
    const row = dailyRow(activity.createdAt);
    if (activity.type === "CALL") row.calls += 1;
    if (activity.type === "FOLLOW_UP") row.followUps += 1;
  }
  for (const visit of relevantVisits) dailyRow(visit.scheduledAt).siteVisits += 1;

  res.json({
    filters: { employeeId: employeeId || null, projectId: projectId || null, campaignId: campaignId || null, status: statusFilter || null, from: from?.toISOString() || null, to: to?.toISOString() || null },
    daily: [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date)),
    kpis: {
      employees: marketingEmployeeRows.filter((row) => row.employee.status !== "INACTIVE" && !row.disabled).length,
      campaigns: scopedCampaigns.filter((campaign) => campaign.status === "ACTIVE").length,
      tasks: scopedTasks.length,
      inProgress: scopedTasks.filter((task) => task.status === "IN_PROGRESS").length,
      pending: scopedTasks.filter((task) => ["ASSIGNED", "ACCEPTED"].includes(task.status)).length,
      underReview: scopedTasks.filter((task) => task.status === "UNDER_REVIEW").length,
      completed: completedTasks.length, overdue: overdue.length,
      completionPercent: scopedTasks.length ? Math.round(completedTasks.length / scopedTasks.length * 100) : 0,
      leads: relevantLeads.length, calls: activities.filter((activity) => activity.type === "CALL").length,
      followUps: activities.filter((activity) => activity.type === "FOLLOW_UP").length,
      siteVisits: relevantVisits.length, conversions: converted,
      conversionRate: relevantLeads.length ? Math.round(converted / relevantLeads.length * 1000) / 10 : 0,
      revenue: commissionRows.reduce((sum, commission) => sum + Number(commission.bookingValue || 0), 0),
      campaignSpendPaise: scopedCampaigns.reduce((sum, campaign) => sum + Number(campaign.spendPaise || 0), 0),
    },
    employees: marketingEmployeeRows.map((row) => ({
      id: String(row.employee._id), name: row.employee.name, email: row.employee.officialEmail,
      department: row.employee.department, designation: row.employee.title, status: row.employee.status,
      accountActive: !!row.employee.accountUserId && !row.disabled,
    })),
    employeePerformance,
    campaignPerformance,
    campaigns: scopedCampaigns,
    tasks: scopedTasks,
    projects: await db.select({ id: projects._id, name: projects.name, city: projects.city }).from(projects).orderBy(projects.name).limit(1000),
    leadsByStage: ["GENERATED", "ASSIGNED", "CONTACTED", "INTERESTED", "SITE_VISIT", "NEGOTIATION", "BOOKING", "REGISTRATION", "COMPLETED", "LOST"].map((stage) => ({ stage, count: relevantLeads.filter((lead) => lead.stage === stage).length })),
  });
});

router.get("/campaigns", async (req: AuthedRequest, res) => {
  const db = getDb();
  if (req.user!.role === "MARKETING_PARTNER") return res.status(403).json({ error: "Use the assigned partner workspace." });
  const manager = await canManage(req), emp = manager ? null : await actorEmployee(req);
  if (!manager && (!emp || !emp.permissions?.includes("marketing.os.read"))) return res.status(403).json({ error: "Marketing read permission is required." });
  let rows = await db.select().from(marketingPartnerCampaigns).orderBy(desc(marketingPartnerCampaigns.createdAt)).limit(500);
  if (!manager && emp) {
    const assignments = await db.select({ id: marketingCampaignEmployees.campaignId }).from(marketingCampaignEmployees).where(eq(marketingCampaignEmployees.employeeId, emp._id));
    const ids = assignments.map((r) => String(r.id));
    rows = rows.filter((r) => ids.includes(String(r._id)));
  }
  const result = await Promise.all(rows.map(async (campaign) => {
    const [project] = campaign.projectId ? await db.select({ name: projects.name, city: projects.city }).from(projects).where(eq(projects._id, campaign.projectId)).limit(1) : [];
    const assignees = await db.select({ employeeId: marketingCampaignEmployees.employeeId, name: employees.name, designation: employees.title })
      .from(marketingCampaignEmployees).innerJoin(employees, eq(marketingCampaignEmployees.employeeId, employees._id)).where(eq(marketingCampaignEmployees.campaignId, campaign._id));
    const attributedLeads = await db.select({ id: marketingCampaignLeads._id }).from(marketingCampaignLeads).where(eq(marketingCampaignLeads.campaignId, campaign._id));
    return { ...campaign, project, assignees, attributedLeads: attributedLeads.length };
  }));
  res.json({ campaigns: result });
});

router.post("/campaigns", async (req: AuthedRequest, res) => {
  if (!(await requireManager(req, res))) return;
  const parsed = z.object({
    name: z.string().trim().min(2).max(160), objective: z.string().max(2000).optional(),
    projectId: z.string().refine(isValidId).nullable().optional(), channel: z.string().trim().max(60).optional(),
    status: z.enum(["ACTIVE", "PAUSED", "COMPLETED"]).optional(), spendRupees: z.number().nonnegative().max(1000000000).optional(),
    startsAt: z.string().datetime().nullable().optional(), endsAt: z.string().datetime().nullable().optional(),
    employeeIds: z.array(z.string().refine(isValidId)).max(100).default([]),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid campaign details.", issues: parsed.error.flatten() });
  const d = parsed.data, db = getDb();
  if (d.projectId && !(await db.select({ id: projects._id }).from(projects).where(eq(projects._id, d.projectId)).limit(1)).length) return res.status(404).json({ error: "Selected project was not found." });
  const empRows = d.employeeIds.length ? await db.select().from(employees).where(inArray(employees._id, d.employeeIds)) : [];
  if (empRows.length !== new Set(d.employeeIds).size || empRows.some((e) => e.status === "INACTIVE" || !e.accountUserId || !isMarketingEmployee(e))) return res.status(400).json({ error: "Every campaign employee must be an active linked Marketing employee (Marketing department or Marketing OS permission)." });
  const [campaign] = await db.transaction(async (tx) => {
    const [row] = await tx.insert(marketingPartnerCampaigns).values({
      userId: req.user!.userId, name: d.name, objective: d.objective || null, projectId: d.projectId || null,
      channel: d.channel || "Other", status: d.status || "ACTIVE", spendPaise: Math.round((d.spendRupees || 0) * 100),
      startedAt: d.startsAt ? new Date(d.startsAt) : new Date(), endsAt: d.endsAt ? new Date(d.endsAt) : null, createdById: req.user!.userId,
    }).returning();
    if (empRows.length) await tx.insert(marketingCampaignEmployees).values(empRows.map((e) => ({ campaignId: row._id, employeeId: e._id, assignedByUserId: req.user!.userId }))).onConflictDoNothing();
    return [row];
  });
  await logAudit({ userId: req.user!.userId, action: "marketing_os.campaign.create", resourceType: "marketing_campaign", resourceId: String(campaign._id), metadata: { projectId: campaign.projectId, employeeCount: empRows.length } });
  for (const e of empRows) if (e.accountUserId) {
    await createNotifications([String(e.accountUserId)], { type: "marketing_campaign_assigned", title: "Marketing campaign assigned", message: "You were assigned to campaign: " + campaign.name, actorUserId: req.user!.userId, data: { href: "/employee/marketing", campaignId: String(campaign._id) } }).catch(() => []);
    await queueMarketingOsEmail(String(e.accountUserId), "CAMPAIGN_UPDATE", String(campaign._id), { title: "Marketing campaign assigned", message: "You have been added to the campaign: " + campaign.name, href: "https://truviventures.com/employee/marketing" }, "campaign-assigned:" + String(campaign._id) + ":" + String(e.accountUserId));
  }
  res.status(201).json({ campaign });
});

router.post("/campaigns/:id/leads", async (req: AuthedRequest, res) => {
  if (!(await requireManager(req, res))) return;
  if (!isValidId(req.params.id)) return res.status(404).json({ error: "Campaign not found." });
  const parsed = z.object({ leadIds: z.array(z.string().refine(isValidId)).min(1).max(500) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Choose one or more valid CRM leads." });
  const db = getDb();
  const [campaign] = await db.select().from(marketingPartnerCampaigns).where(eq(marketingPartnerCampaigns._id, req.params.id)).limit(1);
  if (!campaign) return res.status(404).json({ error: "Campaign not found." });
  const leadRows = await db.select({ id: leads._id, projectId: leads.projectId }).from(leads).where(inArray(leads._id, parsed.data.leadIds));
  if (leadRows.length !== new Set(parsed.data.leadIds).size) return res.status(400).json({ error: "One or more CRM leads do not exist." });
  if (campaign.projectId && leadRows.some((row) => String(row.projectId) !== String(campaign.projectId))) return res.status(400).json({ error: "Campaign attribution can only include leads for its selected project." });
  await db.insert(marketingCampaignLeads).values(leadRows.map((row) => ({ campaignId: campaign._id, leadId: row.id, linkedByUserId: req.user!.userId }))).onConflictDoNothing();
  await logAudit({ userId: req.user!.userId, action: "marketing_os.campaign.leads.link", resourceType: "marketing_campaign", resourceId: String(campaign._id), metadata: { leadCount: leadRows.length } });
  const count = await db.select({ id: marketingCampaignLeads._id }).from(marketingCampaignLeads).where(eq(marketingCampaignLeads.campaignId, campaign._id));
  res.json({ ok: true, attributedLeads: count.length });
});

router.patch("/campaigns/:id", async (req: AuthedRequest, res) => {
  if (!(await requireManager(req, res))) return;
  if (!isValidId(req.params.id)) return res.status(404).json({ error: "Campaign not found." });
  const parsed = z.object({
    name: z.string().trim().min(2).max(160).optional(), objective: z.string().max(2000).optional(),
    projectId: z.string().refine(isValidId).nullable().optional(), status: z.enum(["ACTIVE", "PAUSED", "COMPLETED"]).optional(),
    spendRupees: z.number().nonnegative().max(1000000000).optional(),
    startsAt: z.string().datetime().nullable().optional(), endsAt: z.string().datetime().nullable().optional(),
    employeeIds: z.array(z.string().refine(isValidId)).max(100).optional(),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid campaign update." });
  const db = getDb(), d = parsed.data;
  const [existing] = await db.select().from(marketingPartnerCampaigns).where(eq(marketingPartnerCampaigns._id, req.params.id)).limit(1);
  if (!existing) return res.status(404).json({ error: "Campaign not found." });
  const patch: Record<string, unknown> = {};
  if (d.name !== undefined) patch.name = d.name;
  if (d.objective !== undefined) patch.objective = d.objective;
  if (d.projectId !== undefined) patch.projectId = d.projectId;
  if (d.status !== undefined) patch.status = d.status;
  if (d.spendRupees !== undefined) patch.spendPaise = Math.round(d.spendRupees * 100);
  if (d.startsAt !== undefined) patch.startedAt = d.startsAt ? new Date(d.startsAt) : null;
  if (d.endsAt !== undefined) patch.endsAt = d.endsAt ? new Date(d.endsAt) : null;
  let empRows: (typeof employees.$inferSelect)[] = [];
  if (d.employeeIds) {
    empRows = await db.select().from(employees).where(inArray(employees._id, d.employeeIds));
    if (empRows.length !== new Set(d.employeeIds).size || empRows.some((e) => e.status === "INACTIVE" || !e.accountUserId || !isMarketingEmployee(e))) return res.status(400).json({ error: "Choose active linked Marketing employees." });
  }
  const [updated] = await db.transaction(async (tx) => {
    const [row] = await tx.update(marketingPartnerCampaigns).set(patch).where(eq(marketingPartnerCampaigns._id, existing._id)).returning();
    if (d.employeeIds) {
      await tx.delete(marketingCampaignEmployees).where(eq(marketingCampaignEmployees.campaignId, existing._id));
      if (empRows.length) await tx.insert(marketingCampaignEmployees).values(empRows.map((e) => ({ campaignId: existing._id, employeeId: e._id, assignedByUserId: req.user!.userId })));
    }
    return [row];
  });
  await logAudit({ userId: req.user!.userId, action: "marketing_os.campaign.update", resourceType: "marketing_campaign", resourceId: String(updated._id) });
  const materialChange = d.name !== undefined || d.objective !== undefined || d.projectId !== undefined || d.status !== undefined || d.startsAt !== undefined || d.endsAt !== undefined;
  if (materialChange) {
    const [employeeRecipients, partnerRecipients] = await Promise.all([
      db.select({ userId: employees.accountUserId, name: employees.name })
        .from(marketingCampaignEmployees).innerJoin(employees, eq(marketingCampaignEmployees.employeeId, employees._id))
        .innerJoin(users, eq(employees.accountUserId, users._id))
        .where(and(eq(marketingCampaignEmployees.campaignId, updated._id), eq(users.disabled, false))),
      updated.projectId
        ? db.select({ userId: marketingPartnerProfiles.userId })
            .from(marketingPartnerProjects).innerJoin(marketingPartnerProfiles, eq(marketingPartnerProjects.partnerUserId, marketingPartnerProfiles.userId))
            .innerJoin(users, eq(marketingPartnerProfiles.userId, users._id))
            .where(and(eq(marketingPartnerProjects.projectId, updated.projectId), eq(marketingPartnerProfiles.status, "ACTIVE"), eq(users.disabled, false)))
        : Promise.resolve([]),
    ]);
    const message = "Campaign update: " + updated.name + " is now " + updated.status.toLowerCase().replaceAll("_", " ") + ".";
    const employeeIds = Array.from(new Set(employeeRecipients.map((row) => row.userId).filter((id): id is string => !!id)));
    const partnerIds = Array.from(new Set(partnerRecipients.map((row) => String(row.userId))));
    if (employeeIds.length) {
      await createNotifications(employeeIds, { type: "marketing_campaign_assigned", title: "Marketing campaign updated", message, actorUserId: req.user!.userId, data: { href: "/employee/marketing", campaignId: String(updated._id) } }).catch(() => []);
      for (const recipientUserId of employeeIds) await queueMarketingOsEmail(recipientUserId, "CAMPAIGN_UPDATE", String(updated._id), { title: "Marketing campaign updated", message, href: "https://truviventures.com/employee/marketing" }, "campaign-update:" + String(updated._id) + ":" + recipientUserId + ":" + String(Date.now()));
    }
    if (partnerIds.length) {
      await createNotifications(partnerIds, { type: "marketing_campaign_assigned", title: "Shared campaign updated", message, actorUserId: req.user!.userId, data: { href: "/marketing/partner", campaignId: String(updated._id) } }).catch(() => []);
      for (const recipientUserId of partnerIds) await queueMarketingOsEmail(recipientUserId, "CAMPAIGN_UPDATE", String(updated._id), { title: "Shared campaign updated", message, href: "https://truviventures.com/marketing/partner" }, "campaign-partner-update:" + String(updated._id) + ":" + recipientUserId + ":" + String(Date.now()));
    }
  }
  res.json({ campaign: updated });
});

router.get("/tasks", async (req: AuthedRequest, res) => {
  const db = getDb();
  if (req.user!.role === "MARKETING_PARTNER") return res.status(403).json({ error: "Use the assigned partner workspace." });
  const manager = await canManage(req);
  const marketingTaskScope = and(eq(employeeTasks.taskType, "ASSIGNED"), or(eq(employeeTasks.category, "MARKETING"), isNotNull(employeeTasks.marketingCampaignId))!)!;
  let tasks = await db.select().from(employeeTasks).where(marketingTaskScope).orderBy(desc(employeeTasks.updatedAt)).limit(500);
  if (!manager) {
    const emp = await actorEmployee(req);
    if (!emp || !emp.permissions?.includes("task.read.own")) return res.status(403).json({ error: "Task access is not enabled." });
    const ids = await db.select({ taskId: employeeTaskAssignments.taskId }).from(employeeTaskAssignments).where(eq(employeeTaskAssignments.employeeId, emp._id));
    const ownScope = [eq(employeeTasks.employeeId, emp._id)];
    if (ids.length) ownScope.push(inArray(employeeTasks._id, ids.map((i) => i.taskId)));
    tasks = await db.select().from(employeeTasks).where(and(marketingTaskScope, or(...ownScope)!)).orderBy(desc(employeeTasks.updatedAt)).limit(250);
  }
  const taskIds = tasks.map((task) => task._id);
  const partnerAssignments = taskIds.length ? await db.select({ taskId: marketingTaskPartners.taskId, userId: marketingTaskPartners.partnerUserId }).from(marketingTaskPartners).where(inArray(marketingTaskPartners.taskId, taskIds)) : [];
  const shaped = await Promise.all(tasks.map(async (task) => {
    const [project] = task.projectId ? await db.select({ name: projects.name }).from(projects).where(eq(projects._id, task.projectId)).limit(1) : [];
    const [campaign] = task.marketingCampaignId ? await db.select({ name: marketingPartnerCampaigns.name }).from(marketingPartnerCampaigns).where(eq(marketingPartnerCampaigns._id, task.marketingCampaignId)).limit(1) : [];
    const assignees = await db.select({ employeeId: employeeTaskAssignments.employeeId, name: employees.name, status: employeeTaskAssignments.status })
      .from(employeeTaskAssignments).innerJoin(employees, eq(employeeTaskAssignments.employeeId, employees._id)).where(eq(employeeTaskAssignments.taskId, task._id));
    const attachments = await db.select({
      id: employeeTaskAttachments._id, originalFileName: employeeTaskAttachments.originalFileName,
      mimeType: employeeTaskAttachments.mimeType, sizeBytes: employeeTaskAttachments.sizeBytes, createdAt: employeeTaskAttachments.createdAt,
    }).from(employeeTaskAttachments).where(eq(employeeTaskAttachments.taskId, task._id)).orderBy(desc(employeeTaskAttachments.createdAt));
    return { ...task, project, campaign, assignees, attachments, partnerUserIds: partnerAssignments.filter((row) => String(row.taskId) === String(task._id)).map((row) => String(row.userId)) };
  }));
  res.json({ tasks: shaped });
});

router.post("/tasks", async (req: AuthedRequest, res) => {
  if (!(await requireManager(req, res))) return;
  const parsed = z.object({
    title: z.string().trim().min(2).max(180), description: z.string().max(5000).optional(),
    projectId: z.string().refine(isValidId).nullable().optional(), campaignId: z.string().refine(isValidId).nullable().optional(),
    employeeIds: z.array(z.string().refine(isValidId)).min(1).max(100),
    partnerUserIds: z.array(z.string().refine(isValidId)).max(50).default([]),
    startAt: z.string().datetime().nullable().optional(), deadlineAt: z.string().datetime().nullable().optional(),
    priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid task details.", issues: parsed.error.flatten() });
  const d = parsed.data, db = getDb();
  const emps = await db.select().from(employees).where(inArray(employees._id, d.employeeIds));
  if (emps.length !== new Set(d.employeeIds).size || emps.some((e) => e.status === "INACTIVE" || !e.accountUserId || !isMarketingEmployee(e))) return res.status(400).json({ error: "Select active linked Marketing employees (Marketing department or Marketing OS permission)." });
  if (d.projectId && !(await db.select({ id: projects._id }).from(projects).where(eq(projects._id, d.projectId)).limit(1)).length) return res.status(404).json({ error: "Project not found." });
  if (d.campaignId) {
    const [campaign] = await db.select().from(marketingPartnerCampaigns).where(eq(marketingPartnerCampaigns._id, d.campaignId)).limit(1);
    if (!campaign) return res.status(404).json({ error: "Campaign not found." });
    if (d.projectId && campaign.projectId && campaign.projectId !== d.projectId) return res.status(400).json({ error: "Task project must match the campaign project." });
  }
  const partnerIds = Array.from(new Set(d.partnerUserIds));
  const profiles = partnerIds.length ? await db.select().from(marketingPartnerProfiles).where(inArray(marketingPartnerProfiles.userId, partnerIds)) : [];
  if (profiles.length !== partnerIds.length || profiles.some((p) => p.status !== "ACTIVE")) return res.status(400).json({ error: "Every client/partner must be active before task sharing." });
  for (const id of partnerIds) if (d.projectId) {
    const [assignment] = await db.select({ id: marketingPartnerProjects._id }).from(marketingPartnerProjects).where(and(eq(marketingPartnerProjects.partnerUserId, id), eq(marketingPartnerProjects.projectId, d.projectId))).limit(1);
    if (!assignment) return res.status(403).json({ error: "A client can only be shared tasks for a project assigned to that account." });
  }
  const [task] = await db.transaction(async (tx) => {
    const [created] = await tx.insert(employeeTasks).values({
      employeeId: emps[0]._id, taskType: "ASSIGNED", title: d.title, description: d.description || null,
      category: "MARKETING", assignedByUserId: req.user!.userId, priority: d.priority, status: "ASSIGNED",
      startAt: d.startAt ? new Date(d.startAt) : null, deadlineAt: d.deadlineAt ? new Date(d.deadlineAt) : null,
      projectId: d.projectId || null, marketingCampaignId: d.campaignId || null,
    }).returning();
    await tx.insert(employeeTaskAssignments).values(emps.map((e) => ({ taskId: created._id, employeeId: e._id, assignedByUserId: req.user!.userId, status: "ASSIGNED" as const }))).onConflictDoNothing();
    if (partnerIds.length) await tx.insert(marketingTaskPartners).values(partnerIds.map((id) => ({ taskId: created._id, partnerUserId: id, assignedByUserId: req.user!.userId }))).onConflictDoNothing();
    await tx.insert(employeeTaskHistory).values({ taskId: created._id, actorUserId: req.user!.userId, action: "MARKETING_TASK_ASSIGNED", afterValue: { employeeIds: d.employeeIds, partnerUserIds: partnerIds, campaignId: d.campaignId || null, status: "ASSIGNED" } });
    return [created];
  });
  await logAudit({ userId: req.user!.userId, action: "marketing_os.task.assign", resourceType: "employee_task", resourceId: String(task._id), metadata: { employeeCount: emps.length, partnerCount: partnerIds.length, campaignId: d.campaignId || null } });
  const recipients = emps.map((e) => String(e.accountUserId)).concat(partnerIds);
  await createNotifications(recipients, { type: "employee_task_assigned", title: "New marketing task assigned", message: "A new task was assigned: " + task.title, actorUserId: req.user!.userId, data: { href: "/employee/marketing", taskId: String(task._id) } }).catch(() => []);
  for (const recipient of recipients) await queueMarketingOsEmail(recipient, "TASK_ASSIGNED", String(task._id), { title: "New marketing task assigned", message: "A new marketing task was assigned: " + task.title, href: "https://truviventures.com/employee/marketing" }, "task-assigned:" + String(task._id) + ":" + recipient);
  res.status(201).json({ task });
});

router.patch("/tasks/:id/assignments", async (req: AuthedRequest, res) => {
  if (!(await requireManager(req, res))) return;
  if (!isValidId(req.params.id)) return res.status(404).json({ error: "Task not found." });
  const parsed = z.object({
    employeeIds: z.array(z.string().refine(isValidId)).min(1).max(100),
    partnerUserIds: z.array(z.string().refine(isValidId)).max(50).optional(),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Choose one or more valid employee accounts." });
  const db = getDb();
  const [task] = await db.select().from(employeeTasks).where(eq(employeeTasks._id, req.params.id)).limit(1);
  if (!task || !isMarketingTask(task)) return res.status(404).json({ error: "Task not found." });
  if (["COMPLETED", "CANCELLED"].includes(task.status)) return res.status(409).json({ error: "Closed tasks cannot be reassigned." });
  const employeeRows = await db.select().from(employees).where(inArray(employees._id, parsed.data.employeeIds));
  if (employeeRows.length !== new Set(parsed.data.employeeIds).size || employeeRows.some((e) => e.status === "INACTIVE" || !e.accountUserId || !isMarketingEmployee(e))) return res.status(400).json({ error: "Choose active linked Marketing employees (Marketing department or Marketing OS permission)." });
  const partnerIds = Array.from(new Set(parsed.data.partnerUserIds || []));
  const partnerProfiles = partnerIds.length ? await db.select().from(marketingPartnerProfiles).where(inArray(marketingPartnerProfiles.userId, partnerIds)) : [];
  if (partnerProfiles.length !== partnerIds.length || partnerProfiles.some((p) => p.status !== "ACTIVE")) return res.status(400).json({ error: "Every shared partner must be active." });
  for (const id of partnerIds) if (task.projectId) {
    const [assignment] = await db.select({ id: marketingPartnerProjects._id }).from(marketingPartnerProjects).where(and(eq(marketingPartnerProjects.partnerUserId, id), eq(marketingPartnerProjects.projectId, task.projectId))).limit(1);
    if (!assignment) return res.status(403).json({ error: "A partner can only be assigned tasks for a project in its approved project list." });
  }
  const existingAssignments = await db.select({ employeeId: employeeTaskAssignments.employeeId }).from(employeeTaskAssignments).where(eq(employeeTaskAssignments.taskId, task._id));
  const oldEmployeeIds = new Set(existingAssignments.map((r) => String(r.employeeId)));
  const oldPartners = await db.select({ userId: marketingTaskPartners.partnerUserId }).from(marketingTaskPartners).where(eq(marketingTaskPartners.taskId, task._id));
  const oldPartnerIds = new Set(oldPartners.map((r) => String(r.userId)));
  await db.transaction(async (tx) => {
    await tx.delete(employeeTaskAssignments).where(eq(employeeTaskAssignments.taskId, task._id));
    await tx.insert(employeeTaskAssignments).values(employeeRows.map((e) => ({ taskId: task._id, employeeId: e._id, assignedByUserId: req.user!.userId, status: "ASSIGNED" as const }))).onConflictDoNothing();
    await tx.update(employeeTasks).set({ employeeId: employeeRows[0]._id, updatedAt: new Date() }).where(eq(employeeTasks._id, task._id));
    await tx.delete(marketingTaskPartners).where(eq(marketingTaskPartners.taskId, task._id));
    if (partnerIds.length) await tx.insert(marketingTaskPartners).values(partnerIds.map((id) => ({ taskId: task._id, partnerUserId: id, assignedByUserId: req.user!.userId }))).onConflictDoNothing();
    await tx.insert(employeeTaskHistory).values({
      taskId: task._id, actorUserId: req.user!.userId, action: "MARKETING_TASK_REASSIGNED",
      beforeValue: { employeeIds: [...oldEmployeeIds], partnerUserIds: [...oldPartnerIds] },
      afterValue: { employeeIds: parsed.data.employeeIds, partnerUserIds: partnerIds },
    });
  });
  const newEmployeeUsers = employeeRows.filter((e) => e.accountUserId).map((e) => String(e.accountUserId));
  const newRecipients = newEmployeeUsers.concat(partnerIds);
  await createNotifications(newRecipients, { type: "employee_task_reassigned", title: "Marketing task assignment updated", message: "The task was assigned or updated: " + task.title, actorUserId: req.user!.userId, data: { href: "/employee/marketing", taskId: String(task._id) } }).catch(() => []);
  for (const recipient of newRecipients) await queueMarketingOsEmail(recipient, "TASK_ASSIGNED", String(task._id), { title: "Marketing task assignment updated", message: "A marketing task was assigned or updated: " + task.title, href: "https://truviventures.com/employee/marketing" }, "task-reassigned:" + String(task._id) + ":" + recipient + ":" + Date.now());
  for (const oldId of oldEmployeeIds) if (!parsed.data.employeeIds.includes(oldId)) {
    const [oldEmployee] = await db.select({ accountUserId: employees.accountUserId }).from(employees).where(eq(employees._id, oldId)).limit(1);
    if (oldEmployee?.accountUserId) await createNotifications([String(oldEmployee.accountUserId)], { type: "employee_task_reassigned", title: "Task reassigned", message: "A task is no longer assigned to you: " + task.title, actorUserId: req.user!.userId }).catch(() => []);
  }
  await logAudit({ userId: req.user!.userId, action: "marketing_os.task.reassign", resourceType: "employee_task", resourceId: String(task._id), metadata: { employeeCount: employeeRows.length, partnerCount: partnerIds.length } });
  res.json({ ok: true });
});

router.get("/tasks/:id/activity", async (req: AuthedRequest, res) => {
  if (!isValidId(req.params.id)) return res.status(404).json({ error: "Task not found." });
  const db = getDb();
  const [task] = await db.select().from(employeeTasks).where(eq(employeeTasks._id, req.params.id)).limit(1);
  if (!task || !isMarketingTask(task)) return res.status(404).json({ error: "Task not found." });
  const partner = req.user!.role === "MARKETING_PARTNER";
  if (partner) {
    const [share] = await db.select({ id: marketingTaskPartners._id }).from(marketingTaskPartners).where(and(eq(marketingTaskPartners.taskId, task._id), eq(marketingTaskPartners.partnerUserId, req.user!.userId))).limit(1);
    if (!share) return res.status(404).json({ error: "Task not found." });
    const updates = await db.select().from(marketingTaskUpdates).where(and(eq(marketingTaskUpdates.taskId, task._id), eq(marketingTaskUpdates.clientVisible, true))).orderBy(desc(marketingTaskUpdates.createdAt)).limit(100);
    return res.json({ updates, history: [], comments: [] });
  }
  if (!isAdmin(req) && !(await canManage(req))) {
    const emp = await actorEmployee(req);
    if (!emp || !emp.permissions?.includes("task.read.own") || !(await db.select({ id: employeeTaskAssignments._id }).from(employeeTaskAssignments).where(and(eq(employeeTaskAssignments.taskId, task._id), eq(employeeTaskAssignments.employeeId, emp._id))).limit(1)).length) return res.status(404).json({ error: "Task not found." });
  }
  const [updates, history, comments] = await Promise.all([
    db.select().from(marketingTaskUpdates).where(eq(marketingTaskUpdates.taskId, task._id)).orderBy(desc(marketingTaskUpdates.createdAt)).limit(100),
    db.select().from(employeeTaskHistory).where(eq(employeeTaskHistory.taskId, task._id)).orderBy(desc(employeeTaskHistory.createdAt)).limit(100),
    db.select().from(employeeTaskComments).where(eq(employeeTaskComments.taskId, task._id)).orderBy(desc(employeeTaskComments.createdAt)).limit(100),
  ]);
  res.json({ updates, history, comments });
});

router.post("/tasks/:id/comments", async (req: AuthedRequest, res) => {
  if (!isValidId(req.params.id)) return res.status(404).json({ error: "Task not found." });
  const parsed = z.object({ body: z.string().trim().min(1).max(3000) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Enter a comment." });
  const db = getDb(), [task] = await db.select().from(employeeTasks).where(eq(employeeTasks._id, req.params.id)).limit(1);
  if (!task || !isMarketingTask(task)) return res.status(404).json({ error: "Task not found." });
  if (req.user!.role === "MARKETING_PARTNER") return res.status(403).json({ error: "Use the shared partner update channel." });
  if (!isAdmin(req) && !(await canManage(req))) {
    const emp = await actorEmployee(req);
    if (!emp || !emp.permissions?.includes("task.read.own") || !(await db.select({ id: employeeTaskAssignments._id }).from(employeeTaskAssignments).where(and(eq(employeeTaskAssignments.taskId, task._id), eq(employeeTaskAssignments.employeeId, emp._id))).limit(1)).length) return res.status(404).json({ error: "Task not found." });
  }
  const [comment] = await db.insert(employeeTaskComments).values({ taskId: task._id, authorUserId: req.user!.userId, body: parsed.data.body }).returning();
  const employeeRecipients = await db.select({ userId: employees.accountUserId }).from(employeeTaskAssignments)
    .innerJoin(employees, eq(employeeTaskAssignments.employeeId, employees._id))
    .innerJoin(users, eq(employees.accountUserId, users._id))
    .where(and(eq(employeeTaskAssignments.taskId, task._id), eq(users.disabled, false)));
  const recipients = isAdmin(req) || (await canManage(req))
    ? employeeRecipients.map((row) => row.userId).filter((id): id is string => !!id)
    : [String(task.assignedByUserId)];
  const uniqueRecipients = Array.from(new Set(recipients)).filter((id) => id !== req.user!.userId);
  if (uniqueRecipients.length) await createNotifications(uniqueRecipients, {
    type: "employee_task_updated",
    title: "Marketing task comment added",
    message: task.title + ": " + parsed.data.body,
    actorUserId: req.user!.userId,
    data: { href: isAdmin(req) || (await canManage(req)) ? "/employee/marketing" : "/admin/marketing-os", taskId: String(task._id) },
  }).catch(() => []);
  await db.insert(employeeTaskHistory).values({
    taskId: task._id, actorUserId: req.user!.userId, action: "MARKETING_COMMENT_ADDED",
    afterValue: { commentId: String(comment._id) },
  });
  await logAudit({ userId: req.user!.userId, action: "marketing_os.task.comment", resourceType: "employee_task", resourceId: String(task._id) });
  res.status(201).json({ comment });
});

router.patch("/tasks/:id/progress", async (req: AuthedRequest, res) => {
  if (!isValidId(req.params.id)) return res.status(404).json({ error: "Task not found." });
  const parsed = z.object({ progressPercent: z.number().int().min(0).max(100), status: z.enum(["ACCEPTED", "IN_PROGRESS", "UNDER_REVIEW"]).optional(), update: z.string().trim().min(2).max(3000) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Enter a progress update and a percentage from 0 to 100." });
  const db = getDb();
  const [task] = await db.select().from(employeeTasks).where(eq(employeeTasks._id, req.params.id)).limit(1);
  if (!task || !isMarketingTask(task) || req.user!.role !== "EMPLOYEE") return res.status(404).json({ error: "Task not found." });
  const emp = await actorEmployee(req);
  if (!emp) return res.status(403).json({ error: "Active employee profile required." });
  const [assignment] = await db.select().from(employeeTaskAssignments).where(and(eq(employeeTaskAssignments.taskId, task._id), eq(employeeTaskAssignments.employeeId, emp._id))).limit(1);
  if (!assignment || !emp.permissions?.includes("task.update.own")) return res.status(404).json({ error: "Task not found." });
  if (["COMPLETED", "CANCELLED"].includes(task.status)) return res.status(409).json({ error: "This task is already closed." });
  const nextStatus = parsed.data.status || "IN_PROGRESS";
  if (nextStatus === "UNDER_REVIEW" && parsed.data.progressPercent !== 100) return res.status(400).json({ error: "Submit for review only after setting progress to 100%." });
  await db.transaction(async (tx) => {
    await tx.update(employeeTasks).set({ progressPercent: parsed.data.progressPercent, status: nextStatus, completionNotes: parsed.data.update, updatedAt: new Date() }).where(eq(employeeTasks._id, task._id));
    await tx.update(employeeTaskAssignments).set({ status: nextStatus, updatedAt: new Date(), completedAt: null }).where(and(eq(employeeTaskAssignments.taskId, task._id), eq(employeeTaskAssignments.employeeId, emp._id)));
    await tx.insert(marketingTaskUpdates).values({ taskId: task._id, authorUserId: req.user!.userId, updateType: nextStatus === "UNDER_REVIEW" ? "SUBMITTED_FOR_REVIEW" : "PROGRESS", body: parsed.data.update, progressPercent: parsed.data.progressPercent, clientVisible: true });
    await tx.insert(employeeTaskHistory).values({ taskId: task._id, actorUserId: req.user!.userId, action: nextStatus === "UNDER_REVIEW" ? "SUBMITTED_FOR_REVIEW" : "PROGRESS_UPDATED", beforeValue: { progressPercent: task.progressPercent, status: task.status }, afterValue: { progressPercent: parsed.data.progressPercent, status: nextStatus } });
  });
  await createNotifications([String(task.assignedByUserId)], { type: "employee_task_updated", title: nextStatus === "UNDER_REVIEW" ? "Marketing task submitted for review" : "Marketing task progress updated", message: emp.name + " updated " + task.title + " to " + parsed.data.progressPercent + "%.", actorUserId: req.user!.userId, data: { href: "/admin/marketing-os", taskId: String(task._id) } }).catch(() => []);
  const partnerShares = await db.select({ userId: marketingTaskPartners.partnerUserId }).from(marketingTaskPartners).where(eq(marketingTaskPartners.taskId, task._id));
  await queueMarketingOsEmail(String(task.assignedByUserId), "TASK_PROGRESS", String(task._id), { title: "Marketing task progress updated", message: emp.name + " updated " + task.title + " to " + parsed.data.progressPercent + "%.", href: "https://truviventures.com/admin/marketing-os" }, "task-progress:" + String(task._id) + ":" + Date.now());
  if (partnerShares.length) for (const share of partnerShares) await queueMarketingOsEmail(String(share.userId), "TASK_PROGRESS", String(task._id), { title: "Shared marketing activity updated", message: task.title + " is now " + parsed.data.progressPercent + "% complete.", href: "https://truviventures.com/marketing/partner" }, "task-partner-progress:" + String(task._id) + ":" + String(share.userId) + ":" + Date.now());
  if (partnerShares.length) await createNotifications(partnerShares.map((x) => String(x.userId)), { type: "marketing_partner_progress", title: "Shared work progress updated", message: task.title + " is now " + parsed.data.progressPercent + "% complete.", actorUserId: req.user!.userId, data: { href: "/marketing/partner" } }).catch(() => []);
  await logAudit({ userId: req.user!.userId, action: "marketing_os.task.progress", resourceType: "employee_task", resourceId: String(task._id), metadata: { status: nextStatus, progressPercent: parsed.data.progressPercent } });
  res.json({ ok: true, progressPercent: parsed.data.progressPercent, status: nextStatus });
});

router.patch("/tasks/:id/review", async (req: AuthedRequest, res) => {
  if (!(await requireManager(req, res))) return;
  if (!isValidId(req.params.id)) return res.status(404).json({ error: "Task not found." });
  const parsed = z.object({ decision: z.enum(["APPROVE", "REVISE"]), notes: z.string().trim().min(2).max(3000) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Choose approval or revision and provide review notes." });
  const db = getDb();
  const [task] = await db.select().from(employeeTasks).where(eq(employeeTasks._id, req.params.id)).limit(1);
  if (!task || !isMarketingTask(task) || task.status !== "UNDER_REVIEW") return res.status(409).json({ error: "This Marketing task is not awaiting review." });
  const status = parsed.data.decision === "APPROVE" ? "COMPLETED" : "IN_PROGRESS";
  await db.transaction(async (tx) => {
    await tx.update(employeeTasks).set({ status, progressPercent: status === "COMPLETED" ? 100 : Math.min(task.progressPercent, 99), reviewedByUserId: req.user!.userId, reviewedAt: new Date(), reviewNotes: parsed.data.notes, completedAt: status === "COMPLETED" ? new Date() : null, updatedAt: new Date() }).where(eq(employeeTasks._id, task._id));
    await tx.update(employeeTaskAssignments).set({ status, completedAt: status === "COMPLETED" ? new Date() : null, updatedAt: new Date() }).where(eq(employeeTaskAssignments.taskId, task._id));
    await tx.insert(marketingTaskUpdates).values({ taskId: task._id, authorUserId: req.user!.userId, updateType: parsed.data.decision, body: parsed.data.notes, progressPercent: status === "COMPLETED" ? 100 : Math.min(task.progressPercent, 99), clientVisible: true });
    await tx.insert(employeeTaskHistory).values({ taskId: task._id, actorUserId: req.user!.userId, action: "REVIEW_" + parsed.data.decision, beforeValue: { status: task.status }, afterValue: { status, notes: parsed.data.notes } });
  });
  const assignees = await db.select({ userId: employees.accountUserId }).from(employeeTaskAssignments).innerJoin(employees, eq(employeeTaskAssignments.employeeId, employees._id)).where(eq(employeeTaskAssignments.taskId, task._id));
  const partnerShares = await db.select({ userId: marketingTaskPartners.partnerUserId }).from(marketingTaskPartners).where(eq(marketingTaskPartners.taskId, task._id));
  const reviewTitle = parsed.data.decision === "APPROVE" ? "Marketing task approved" : "Changes requested for your marketing task";
  for (const row of assignees) if (row.userId) await queueMarketingOsEmail(String(row.userId), "TASK_REVIEW", String(task._id), { title: reviewTitle, message: task.title + ": " + parsed.data.notes, href: "https://truviventures.com/employee/marketing" }, "task-review:" + String(task._id) + ":" + String(row.userId) + ":" + Date.now());
  for (const share of partnerShares) await queueMarketingOsEmail(String(share.userId), "TASK_REVIEW", String(task._id), { title: "Shared marketing activity reviewed", message: task.title + ": " + parsed.data.notes, href: "https://truviventures.com/marketing/partner" }, "task-partner-review:" + String(task._id) + ":" + String(share.userId) + ":" + Date.now());
  for (const row of assignees) if (row.userId) await createNotifications([String(row.userId)], { type: "employee_task_review", title: parsed.data.decision === "APPROVE" ? "Marketing task approved" : "Changes requested", message: task.title + ": " + parsed.data.notes, actorUserId: req.user!.userId, data: { href: "/employee/marketing" } }).catch(() => []);
  if (partnerShares.length) await createNotifications(partnerShares.map((x) => String(x.userId)), { type: "marketing_partner_progress", title: "Shared work updated", message: task.title + " has a new review update.", actorUserId: req.user!.userId, data: { href: "/marketing/partner" } }).catch(() => []);
  await logAudit({ userId: req.user!.userId, action: "marketing_os.task.review", resourceType: "employee_task", resourceId: String(task._id), metadata: { decision: parsed.data.decision } });
  res.json({ ok: true, status });
});

router.get("/tasks/:id/updates", async (req: AuthedRequest, res) => {
  if (!isValidId(req.params.id)) return res.status(404).json({ error: "Task not found." });
  const db = getDb(), [task] = await db.select().from(employeeTasks).where(eq(employeeTasks._id, req.params.id)).limit(1);
  if (!task || !isMarketingTask(task)) return res.status(404).json({ error: "Task not found." });
  const isPartner = req.user!.role === "MARKETING_PARTNER";
  if (isPartner) {
    const [profile] = await db.select().from(marketingPartnerProfiles).where(and(eq(marketingPartnerProfiles.userId, req.user!.userId), eq(marketingPartnerProfiles.status, "ACTIVE"))).limit(1);
    const [share] = await db.select({ id: marketingTaskPartners._id }).from(marketingTaskPartners).where(and(eq(marketingTaskPartners.taskId, task._id), eq(marketingTaskPartners.partnerUserId, req.user!.userId))).limit(1);
    if (!profile?.permissions.includes("task.read.shared") || !share) return res.status(404).json({ error: "Task not found." });
  } else if (req.user!.role === "EMPLOYEE") {
    const emp = await actorEmployee(req);
    if (!emp || !(await db.select({ id: employeeTaskAssignments._id }).from(employeeTaskAssignments).where(and(eq(employeeTaskAssignments.taskId, task._id), eq(employeeTaskAssignments.employeeId, emp._id))).limit(1)).length) return res.status(404).json({ error: "Task not found." });
  } else if (!isAdmin(req) && !(await canManage(req))) return res.status(403).json({ error: "Not authorised." });
  const updates = await db.select().from(marketingTaskUpdates).where(and(eq(marketingTaskUpdates.taskId, task._id), ...(isPartner ? [eq(marketingTaskUpdates.clientVisible, true)] : []))).orderBy(desc(marketingTaskUpdates.createdAt)).limit(100);
  res.json({ updates });
});

router.post("/tasks/:id/updates", async (req: AuthedRequest, res) => {
  if (!isValidId(req.params.id)) return res.status(404).json({ error: "Task not found." });
  const parsed = z.object({ body: z.string().trim().min(2).max(3000), clientVisible: z.boolean().default(true) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Enter an update." });
  const db = getDb(), [task] = await db.select().from(employeeTasks).where(eq(employeeTasks._id, req.params.id)).limit(1);
  if (!task || !isMarketingTask(task)) return res.status(404).json({ error: "Task not found." });
  if (req.user!.role === "MARKETING_PARTNER") {
    const [profile] = await db.select().from(marketingPartnerProfiles).where(and(eq(marketingPartnerProfiles.userId, req.user!.userId), eq(marketingPartnerProfiles.status, "ACTIVE"))).limit(1);
    const [share] = await db.select({ id: marketingTaskPartners._id }).from(marketingTaskPartners).where(and(eq(marketingTaskPartners.taskId, task._id), eq(marketingTaskPartners.partnerUserId, req.user!.userId))).limit(1);
    if (!profile?.permissions.includes("task.update.shared") || !share) return res.status(403).json({ error: "Partner updates are not enabled for this account." });
  } else if (req.user!.role === "EMPLOYEE") {
    const emp = await actorEmployee(req);
    if (!emp || !(await db.select({ id: employeeTaskAssignments._id }).from(employeeTaskAssignments).where(and(eq(employeeTaskAssignments.taskId, task._id), eq(employeeTaskAssignments.employeeId, emp._id))).limit(1)).length) return res.status(404).json({ error: "Task not found." });
  } else if (!isAdmin(req) && !(await canManage(req))) return res.status(403).json({ error: "Not authorised." });
  const visible = req.user!.role === "MARKETING_PARTNER" ? true : parsed.data.clientVisible;
  const [row] = await db.insert(marketingTaskUpdates).values({ taskId: task._id, authorUserId: req.user!.userId, body: parsed.data.body, progressPercent: task.progressPercent, clientVisible: visible }).returning();
  await logAudit({ userId: req.user!.userId, action: "marketing_os.task.update", resourceType: "employee_task", resourceId: String(task._id) });
  if (req.user!.role === "MARKETING_PARTNER") {
    await createNotifications([String(task.assignedByUserId)], { type: "marketing_partner_progress", title: "Client / partner shared an update", message: task.title + ": " + parsed.data.body, actorUserId: req.user!.userId, data: { href: "/employee/marketing", taskId: String(task._id) } }).catch(() => []);
    await queueMarketingOsEmail(String(task.assignedByUserId), "TASK_PROGRESS", String(task._id), { title: "Client / partner shared an update", message: task.title + ": " + parsed.data.body, href: "https://truviventures.com/employee/marketing" }, "partner-shared-update:" + String(row._id));
  } else if (visible) {
    const shares = await db.select({ userId: marketingTaskPartners.partnerUserId }).from(marketingTaskPartners).where(eq(marketingTaskPartners.taskId, task._id));
    const partnerIds = Array.from(new Set(shares.map((share) => String(share.userId))));
    if (partnerIds.length) {
      await createNotifications(partnerIds, { type: "marketing_partner_progress", title: "Shared marketing activity updated", message: task.title + ": " + parsed.data.body, actorUserId: req.user!.userId, data: { href: "/marketing/partner", taskId: String(task._id) } }).catch(() => []);
      for (const partnerId of partnerIds) await queueMarketingOsEmail(partnerId, "TASK_PROGRESS", String(task._id), { title: "Shared marketing activity updated", message: task.title + ": " + parsed.data.body, href: "https://truviventures.com/marketing/partner" }, "employee-shared-update:" + String(row._id) + ":" + partnerId);
    }
  }
  res.status(201).json({ update: row });
});

router.get("/partner/dashboard", async (req: AuthedRequest, res) => {
  if (req.user!.role !== "MARKETING_PARTNER") return res.status(403).json({ error: "Partner access only." });
  const db = getDb();
  const [profile] = await db.select().from(marketingPartnerProfiles).where(and(eq(marketingPartnerProfiles.userId, req.user!.userId), eq(marketingPartnerProfiles.status, "ACTIVE"))).limit(1);
  if (!profile) return res.status(403).json({ error: "Partner access is inactive." });
  const projectLinks = profile.permissions.includes("project.read.assigned")
    ? await db.select({ project: projects }).from(marketingPartnerProjects).innerJoin(projects, eq(marketingPartnerProjects.projectId, projects._id)).where(eq(marketingPartnerProjects.partnerUserId, req.user!.userId))
    : [];
  const projectIds = projectLinks.map((row) => String(row.project._id));
  const taskLinks = profile.permissions.includes("task.read.shared")
    ? await db.select({ task: employeeTasks }).from(marketingTaskPartners).innerJoin(employeeTasks, eq(marketingTaskPartners.taskId, employeeTasks._id)).where(eq(marketingTaskPartners.partnerUserId, req.user!.userId))
    : [];
  const taskCampaignIds = taskLinks.map((x) => String(x.task.marketingCampaignId || "")).filter(Boolean);
  const campaignRowsAll = await db.select().from(marketingPartnerCampaigns).orderBy(desc(marketingPartnerCampaigns.createdAt));
  const campaignRows = profile.permissions.includes("campaign.read.assigned")
    ? campaignRowsAll.filter((campaign) =>
        (campaign.projectId && projectIds.includes(String(campaign.projectId))) || taskCampaignIds.includes(String(campaign._id))
      )
    : [];
  const tasks = await Promise.all(taskLinks.map(async ({ task }) => {
    const [updates] = await db.select().from(marketingTaskUpdates).where(and(eq(marketingTaskUpdates.taskId, task._id), eq(marketingTaskUpdates.clientVisible, true))).orderBy(desc(marketingTaskUpdates.createdAt)).limit(1);
    const [project] = task.projectId ? await db.select({ name: projects.name, city: projects.city }).from(projects).where(eq(projects._id, task.projectId)).limit(1) : [];
    const [campaign] = task.marketingCampaignId ? await db.select({ name: marketingPartnerCampaigns.name }).from(marketingPartnerCampaigns).where(eq(marketingPartnerCampaigns._id, task.marketingCampaignId)).limit(1) : [];
    const attachments = profile.permissions.includes("report.read.assigned")
      ? await db.select({ id: employeeTaskAttachments._id, fileName: employeeTaskAttachments.originalFileName, mimeType: employeeTaskAttachments.mimeType, createdAt: employeeTaskAttachments.createdAt }).from(employeeTaskAttachments).where(eq(employeeTaskAttachments.taskId, task._id)).orderBy(desc(employeeTaskAttachments.createdAt))
      : [];
    return { id: String(task._id), title: task.title, description: task.description, status: task.status, progressPercent: task.progressPercent, startAt: task.startAt, deadlineAt: task.deadlineAt, project, campaign, latestUpdate: updates ? { body: updates.body, createdAt: updates.createdAt } : null, attachments };
  }));
  const [user] = await db.select({ name: users.name, email: users.email }).from(users).where(eq(users._id, req.user!.userId)).limit(1);
  return res.json({
    user, companyName: profile.companyName, permissions: profile.permissions,
    projects: projectLinks.map((r) => ({ id: String(r.project._id), name: r.project.name, city: r.project.city, location: r.project.location })),
    campaigns: campaignRows.map((c) => ({ id: String(c._id), name: c.name, channel: c.channel, status: c.status, startedAt: c.startedAt, endsAt: c.endsAt, projectId: c.projectId })),
    tasks, summary: {
      tasks: tasks.length, completed: tasks.filter((t) => t.status === "COMPLETED").length,
      inProgress: tasks.filter((t) => t.status === "IN_PROGRESS").length,
      completionPercent: tasks.length ? Math.round(tasks.filter((t) => t.status === "COMPLETED").length / tasks.length * 100) : 0,
    },
  });
});

router.get("/partners", async (req: AuthedRequest, res) => {
  if (!isAdmin(req) && !(await canManage(req))) return res.status(403).json({ error: "Marketing manager access is required." });
  const rows = await getDb().select({ profile: marketingPartnerProfiles, name: users.name, email: users.email, disabled: users.disabled })
    .from(marketingPartnerProfiles).innerJoin(users, eq(marketingPartnerProfiles.userId, users._id)).orderBy(desc(marketingPartnerProfiles.createdAt));
  res.json({ partners: rows.map((r) => ({ id: String(r.profile.userId), name: r.name, email: r.email, companyName: r.profile.companyName, phone: r.profile.phone, status: r.profile.status, accountActive: !r.disabled, permissions: r.profile.permissions })) });
});

router.post("/partners", async (req: AuthedRequest, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: "Only Admin can provision client/partner accounts." });
  const parsed = z.object({
    name: z.string().trim().min(2).max(160), email: z.email().transform((v) => v.toLowerCase()),
    phone: z.string().trim().max(24).optional().default(""), companyName: z.string().trim().max(180).optional(),
    projectIds: z.array(z.string().refine(isValidId)).min(1).max(100),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Check the partner details and assigned projects.", issues: parsed.error.flatten() });
  const d = parsed.data, db = getDb();
  if ((await db.select({ id: users._id }).from(users).where(eq(users.email, d.email)).limit(1)).length) return res.status(409).json({ error: "An account already exists for that email." });
  const pRows = await db.select({ id: projects._id }).from(projects).where(inArray(projects._id, d.projectIds));
  if (pRows.length !== new Set(d.projectIds).size) return res.status(400).json({ error: "One or more assigned projects do not exist." });
  const randomPassword = await bcrypt.hash(randomBytes(48).toString("hex"), 12);
  const created = await db.transaction(async (tx) => {
    const [account] = await tx.insert(users).values({
      name: d.name, email: d.email, password: randomPassword, role: "MARKETING_PARTNER",
      // The optional phone is stored on the partner profile as contact data. The
      // emailed single-use invitation verifies the login identity, so do not
      // attach an unverified phone number to an account that requires phone OTP.
      approvalStatus: "APPROVED", disabled: true, phone: null, emailVerified: false, phoneVerified: true,
    }).returning({ id: users._id });
    await tx.insert(marketingPartnerProfiles).values({ userId: account.id, companyName: d.companyName || null, phone: d.phone || null, status: "ACTIVE", permissions: partnerPermissionDefaults, createdById: req.user!.userId });
    await tx.insert(marketingPartnerProjects).values(d.projectIds.map((id) => ({ partnerUserId: account.id, projectId: id, assignedByUserId: req.user!.userId }))).onConflictDoNothing();
    return { id: String(account.id) };
  });
  const token = randomBytes(32).toString("hex");
  await db.insert(marketingPartnerInvites).values({ userId: created.id, tokenHash: tokenHash(token), createdById: req.user!.userId, expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000) });
  const inviteUrl = (process.env.CLIENT_URL || "https://truviventures.com").replace(/\/$/, "") + "/marketing/activate?token=" + token;
  const inviteQueued = await queueMarketingOsEmail(created.id, "PARTNER_INVITE", null, {
    title: "Your Truvi Marketing Partner account is ready",
    message: "Truvi has invited you to a secure project workspace. Activate your account to view assigned projects, campaign activity, progress and reports.",
    hrefEncrypted: encryptInviteUrl(inviteUrl),
  }, "partner-invite:" + created.id);
  await logAudit({ userId: req.user!.userId, action: "marketing_os.partner.create", resourceType: "marketing_partner", resourceId: created.id, metadata: { projectCount: d.projectIds.length } });
  res.status(201).json({
    partnerId: created.id,
    inviteQueued,
    message: inviteQueued
      ? "Partner account created. The invitation email has been queued for delivery."
      : "Partner account created, but the invitation could not be queued. Check the database and resend the invitation.",
  });
});

router.post("/partners/:userId/invite", async (req: AuthedRequest, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: "Admin access only." });
  const partnerUserId = String(req.params.userId || "");
  if (!isValidId(partnerUserId)) return res.status(404).json({ error: "Partner not found." });
  const db = getDb();
  const [profile] = await db.select().from(marketingPartnerProfiles).where(eq(marketingPartnerProfiles.userId, partnerUserId)).limit(1);
  const [account] = await db.select({ id: users._id, role: users.role, disabled: users.disabled, emailVerified: users.emailVerified })
    .from(users).where(eq(users._id, partnerUserId)).limit(1);
  if (!profile || profile.status !== "ACTIVE" || !account || account.role !== "MARKETING_PARTNER") return res.status(404).json({ error: "Active partner account not found." });
  if (!account.disabled || account.emailVerified) return res.status(409).json({ error: "This partner account has already been activated. Use the normal password-reset flow instead of resending activation." });
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
  await db.transaction(async (tx) => {
    await tx.update(marketingPartnerInvites).set({ usedAt: new Date() }).where(and(eq(marketingPartnerInvites.userId, partnerUserId), isNull(marketingPartnerInvites.usedAt)));
    await tx.insert(marketingPartnerInvites).values({ userId: partnerUserId, tokenHash: tokenHash(token), createdById: req.user!.userId, expiresAt });
    await tx.update(users).set({ disabled: true, authVersion: sql.raw('"auth_version" + 1') }).where(eq(users._id, partnerUserId));
  });
  const inviteUrl = (process.env.CLIENT_URL || "https://truviventures.com").replace(/\/$/, "") + "/marketing/activate?token=" + token;
  const queued = await queueMarketingOsEmail(partnerUserId, "PARTNER_INVITE", null, {
    title: "Your Truvi Marketing Partner invitation",
    message: "Use the secure one-time link to activate your assigned project workspace. The link expires in 48 hours.",
    hrefEncrypted: encryptInviteUrl(inviteUrl),
  }, "partner-invite:" + partnerUserId + ":" + expiresAt.getTime());
  await logAudit({ userId: req.user!.userId, action: "marketing_os.partner.invite.resend", resourceType: "marketing_partner", resourceId: partnerUserId });
  res.json({ ok: queued, queued, message: queued ? "The new invitation was queued." : "The new invitation could not be queued. Check the database logs." });
});

router.patch("/partners/:userId", async (req: AuthedRequest, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: "Admin access only." });
  const partnerUserId = String(req.params.userId || "");
  if (!isValidId(partnerUserId)) return res.status(404).json({ error: "Partner not found." });
  const parsed = z.object({
    status: z.enum(["ACTIVE", "INACTIVE"]),
    projectIds: z.array(z.string().refine(isValidId)).max(100).optional(),
    permissions: z.array(z.enum(["project.read.assigned", "campaign.read.assigned", "task.read.shared", "report.read.assigned", "task.update.shared"])).max(5).optional(),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid partner update." });
  const db = getDb(), [profile] = await db.select().from(marketingPartnerProfiles).where(eq(marketingPartnerProfiles.userId, partnerUserId)).limit(1);
  if (!profile) return res.status(404).json({ error: "Partner not found." });
  if (parsed.data.projectIds) {
    const existing = await db.select({ id: projects._id }).from(projects).where(inArray(projects._id, parsed.data.projectIds));
    if (existing.length !== new Set(parsed.data.projectIds).size) return res.status(400).json({ error: "One or more assigned projects do not exist." });
  }
  await db.transaction(async (tx) => {
    await tx.update(marketingPartnerProfiles).set({
      status: parsed.data.status,
      ...(parsed.data.permissions ? { permissions: Array.from(new Set(parsed.data.permissions)) } : {}),
      updatedAt: new Date(),
    }).where(eq(marketingPartnerProfiles.userId, partnerUserId));
    const [account] = await tx.select({ emailVerified: users.emailVerified }).from(users).where(eq(users._id, partnerUserId)).limit(1);
    await tx.update(users).set({
      disabled: parsed.data.status !== "ACTIVE" || !account?.emailVerified,
      authVersion: sql.raw('"auth_version" + 1'),
    }).where(eq(users._id, partnerUserId));
    if (parsed.data.projectIds) {
      await tx.delete(marketingPartnerProjects).where(eq(marketingPartnerProjects.partnerUserId, partnerUserId));
      if (parsed.data.projectIds.length) await tx.insert(marketingPartnerProjects).values(parsed.data.projectIds.map((id) => ({ partnerUserId: partnerUserId, projectId: id, assignedByUserId: req.user!.userId }))).onConflictDoNothing();
    }
  });
  await logAudit({ userId: req.user!.userId, action: "marketing_os.partner.update", resourceType: "marketing_partner", resourceId: partnerUserId, metadata: { status: parsed.data.status } });
  res.json({ ok: true });
});

router.get("/partner/tasks/:id/attachments/:attachmentId", async (req: AuthedRequest, res) => {
  if (req.user!.role !== "MARKETING_PARTNER" || !isValidId(req.params.id) || !isValidId(req.params.attachmentId)) return res.status(404).end();
  const db = getDb();
  const [task] = await db.select().from(employeeTasks).where(eq(employeeTasks._id, req.params.id)).limit(1);
  if (!task || !isMarketingTask(task)) return res.status(404).end();
  const [share] = await db.select({ id: marketingTaskPartners._id }).from(marketingTaskPartners).where(and(eq(marketingTaskPartners.taskId, req.params.id), eq(marketingTaskPartners.partnerUserId, req.user!.userId))).limit(1);
  const [profile] = await db.select().from(marketingPartnerProfiles).where(and(eq(marketingPartnerProfiles.userId, req.user!.userId), eq(marketingPartnerProfiles.status, "ACTIVE"))).limit(1);
  if (!profile?.permissions.includes("report.read.assigned") || !share) return res.status(404).end();
  const [attachment] = await db.select().from(employeeTaskAttachments).where(and(eq(employeeTaskAttachments._id, req.params.attachmentId), eq(employeeTaskAttachments.taskId, req.params.id))).limit(1);
  if (!attachment) return res.status(404).end();
  const file = privateFilePath("private:" + attachment.storedFileName);
  if (!file || !fs.existsSync(file)) return res.status(404).end();
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Type", attachment.mimeType);
  res.setHeader("Content-Disposition", "attachment; filename*=UTF-8''" + encodeURIComponent(attachment.originalFileName));
  fs.createReadStream(file).pipe(res);
});

router.post("/outbox/:id/retry", async (req: AuthedRequest, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: "Admin access only." });
  if (!isValidId(req.params.id)) return res.status(404).json({ error: "Email event not found." });
  const [job] = await getDb().update(marketingOsEmailOutbox).set({ status: "RETRY_PENDING", attempts: 0, nextAttemptAt: new Date(), claimedAt: null, lastError: null }).where(and(eq(marketingOsEmailOutbox._id, req.params.id), inArray(marketingOsEmailOutbox.status, ["FAILED", "RETRY_PENDING"]))).returning({ id: marketingOsEmailOutbox._id });
  if (!job) return res.status(409).json({ error: "Only failed or waiting messages can be retried." });
  await logAudit({ userId: req.user!.userId, action: "marketing_os.email.retry", resourceType: "marketing_os_email", resourceId: String(job.id) });
  res.json({ ok: true });
});

router.get("/outbox", async (req: AuthedRequest, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: "Admin access only." });
  const rows = await getDb().select({
    id: marketingOsEmailOutbox._id, eventType: marketingOsEmailOutbox.eventType,
    status: marketingOsEmailOutbox.status, attempts: marketingOsEmailOutbox.attempts,
    nextAttemptAt: marketingOsEmailOutbox.nextAttemptAt, sentAt: marketingOsEmailOutbox.sentAt,
    lastError: marketingOsEmailOutbox.lastError, createdAt: marketingOsEmailOutbox.createdAt,
  }).from(marketingOsEmailOutbox).orderBy(desc(marketingOsEmailOutbox.createdAt)).limit(200);
  res.json({ outbox: rows });
});

export default router;
