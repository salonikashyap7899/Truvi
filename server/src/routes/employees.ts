import { Router } from "express";
import fs from "fs";
import path from "path";
import { randomBytes, createHash } from "crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import {
  and, desc, eq, gte, inArray, isNull, like, lt, or, sql,
} from "drizzle-orm";
import { getDb } from "../config/db";
import {
  users, employees, employeeInvites, employeeTasks, employeeTaskHistory,
  employeeTaskComments, employeeTaskAssignments, employeeTaskAttachments, employeeLeaveRequests,
  employeeAttendance, employeeSalaryRecords, projects, leads, leadActivities, leadFollowUps,
  siteVisits, notifications,
} from "../db/schema";
import { authenticate, requireRole, type AuthedRequest } from "../middleware/auth";
import { isValidId } from "../lib/ids";
import { sendEmail } from "../services/emailService";
import { logAudit } from "../services/audit";
import { createNotifications } from "../services/notificationService";
import { auditLogs } from "../db/verificationSchema";
import { DUPLICATE_LEAD_WINDOW_DAYS } from "../config/constants";
import { canAccessEmployeeLead, hasEmployeePermission as hasPermission } from "../lib/employeeAccess";
import { dateRangesOverlap, inclusiveCalendarDays, isValidIsoDate } from "../lib/employeeLeaveRules";
import { fileMatchesExtension } from "../services/uploadService";
import { privateFilePath, privateRef, privateUpload } from "../services/privateFiles";

const router = Router();
const DEFAULT_EMPLOYEE_PERMISSIONS = [
  "task.read.own", "task.create.own", "task.update.own", "task.complete.own",
  "lead.create", "lead.read.own", "lead.read.assigned", "lead.update.own", "lead.update.assigned",
  "lead.call.own", "lead.call.assigned", "telecalling.use", "followup.create.own", "followup.create.assigned",
  "sitevisit.create", "sitevisit.read.own", "sitevisit.update.own", "attendance.read.own", "attendance.checkin",
  "attendance.checkout", "leave.request.own", "leave.read.own", "profile.read.own", "salary.read.own",
] as const;

const esc = (v: string) => v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const hashToken = (v: string) => createHash("sha256").update(v).digest("hex");
const parseDate = (v?: string | null) => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};
const cleanPhone = (v: string) => v.replace(/\D/g, "").slice(-10);
const dateInIndia = (d = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
  const val = (key: string) => parts.find((p) => p.type === key)?.value ?? "";
  return `${val("year")}-${val("month")}-${val("day")}`;
};
const thisMonth = (d = new Date()) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
function employeeLeadScope(permissions: string[] | null | undefined, userId: string) {
  const scopes = [];
  if (hasPermission(permissions, "lead.read.own")) scopes.push(eq(leads.submittedById, userId));
  if (hasPermission(permissions, "lead.read.assigned")) scopes.push(eq(leads.assignedToId, userId));
  return scopes;
}
async function getEmployeeForUser(userId: string) {
  const [emp] = await getDb().select().from(employees).where(eq(employees.accountUserId, userId)).limit(1);
  return emp ?? null;
}
async function needEmployee(req: AuthedRequest, res: import("express").Response) {
  const employee = await getEmployeeForUser(req.user!.userId);
  if (!employee || employee.status === "INACTIVE") {
    res.status(403).json({ error: "No active employee profile is linked to this account." });
    return null;
  }
  return employee;
}
async function notifyUser(userId: string, type: string, title: string, message: string, actorUserId: string, href: string) {
  await createNotifications([userId], { type, title, message, actorUserId, data: { href }, priority: "normal" }).catch(() => []);
}
async function issueInvite(employeeId: string, actorUserId: string) {
  const db = getDb();
  const [employee] = await db.select().from(employees).where(eq(employees._id, employeeId)).limit(1);
  if (!employee || !employee.accountUserId || !employee.officialEmail) throw new Error("Employee account is missing.");
  const raw = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
  await db.update(employeeInvites).set({ usedAt: new Date() })
    .where(and(eq(employeeInvites.employeeId, employeeId), isNull(employeeInvites.usedAt)));
  await db.insert(employeeInvites).values({ employeeId, tokenHash: hashToken(raw), createdById: actorUserId, expiresAt });
  const clientBase = (process.env.CLIENT_URL || "https://truviventures.com").replace(/\/$/, "");
  const url = `${clientBase}/employee/activate?token=${raw}`;
  const delivered = await sendEmail(
    employee.officialEmail,
    "Activate your Truvi employee account",
    `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px;color:#172033"><h2>Welcome to Truvi, ${esc(employee.name)}</h2><p>Your employee account has been created. Use the secure link below to choose your password and activate access.</p><p><a href="${url}" style="display:inline-block;padding:12px 18px;background:#172033;color:#fff;text-decoration:none;border-radius:8px">Activate employee account</a></p><p>This one-time link expires in 48 hours. If you did not expect this invitation, contact your administrator.</p></div>`,
  );
  return { delivered, expiresAt };
}

const employeeCreateSchema = z.object({
  name: z.string().trim().min(2).max(160),
  employeeCode: z.string().trim().min(2).max(40).optional(),
  officialEmail: z.email().transform((v) => v.trim().toLowerCase()),
  phone: z.string().trim().max(30).optional().default(""),
  department: z.string().trim().min(1).max(100),
  designation: z.string().trim().max(160).optional().default(""),
  employmentType: z.enum(["FULL_TIME", "PART_TIME", "CONTRACT", "INTERN"]).default("FULL_TIME"),
  reportingManagerId: z.string().optional().nullable(),
  joiningDate: z.string().optional().nullable(),
  recruitmentSource: z.string().max(100).optional().default("Other"),
  recruitmentCampaign: z.string().max(180).optional().default(""),
  applicationDate: z.string().optional().nullable(),
  interviewDate: z.string().optional().nullable(),
  status: z.enum(["ACTIVE", "ON_LEAVE", "INACTIVE"]).default("ACTIVE"),
  monthlySalary: z.coerce.number().min(0).max(100000000).default(0),
  salaryDueDay: z.coerce.number().int().min(1).max(28).default(1),
  notes: z.string().max(2000).optional().default(""),
  permissions: z.array(z.string().min(1).max(80)).max(80).optional(),
});
const employeePatchSchema = employeeCreateSchema.partial().omit({ officialEmail: true }).extend({
  officialEmail: z.email().transform((v) => v.trim().toLowerCase()).optional(),
});
const activateSchema = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/i),
  password: z.string().min(12).max(128)
    .regex(/[a-z]/, "Use a lowercase letter")
    .regex(/[A-Z]/, "Use an uppercase letter")
    .regex(/[0-9]/, "Use a number")
    .regex(/[^A-Za-z0-9]/, "Use a symbol"),
});
const taskCreateSchema = z.object({
  employeeId: z.string().optional(),
  employeeIds: z.array(z.string()).min(1).max(100).optional(),
  title: z.string().trim().min(2).max(180),
  description: z.string().max(5000).optional().default(""),
  category: z.string().max(80).optional().default("GENERAL"),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
  startAt: z.string().optional().nullable(),
  deadlineAt: z.string().optional().nullable(),
  estimatedMinutes: z.coerce.number().int().min(1).max(100000).optional().nullable(),
  projectId: z.string().optional().nullable(),
  leadId: z.string().optional().nullable(),
});
const taskPatchSchema = z.object({
  title: z.string().trim().min(2).max(180).optional(),
  description: z.string().max(5000).optional(),
  category: z.string().max(80).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  status: z.enum(["ASSIGNED", "ACCEPTED", "IN_PROGRESS", "ON_HOLD", "COMPLETED", "CANCELLED"]).optional(),
  startAt: z.string().optional().nullable(),
  deadlineAt: z.string().optional().nullable(),
  estimatedMinutes: z.coerce.number().int().min(1).max(100000).optional().nullable(),
  completionNotes: z.string().max(5000).optional(),
  employeeId: z.string().optional(),
  employeeIds: z.array(z.string()).min(1).max(100).optional(),
  reason: z.string().max(500).optional(),
});
const leadCreateSchema = z.object({
  projectId: z.string().refine(isValidId, "Choose a valid project"),
  clientName: z.string().trim().min(2).max(180),
  clientPhone: z.string().trim().regex(/^[+\d\s()-]{10,20}$/),
  clientEmail: z.union([z.email(), z.literal("")]).optional().default(""),
  preferredContactMethod: z.enum(["PHONE", "EMAIL", "WHATSAPP", "OTHER"]).default("PHONE"),
  preferredLocation: z.string().max(180).optional().default(""),
  preferredPropertyType: z.string().max(120).optional().default(""),
  budgetRange: z.string().max(100).optional().default(""),
  source: z.string().trim().min(1).max(100),
  leadTemperature: z.enum(["HOT", "WARM", "COLD"]).default("WARM"),
  purchaseTimeline: z.string().max(120).optional().default(""),
  siteVisitRequired: z.boolean().default(false),
  visitDate: z.string().optional().nullable(),
  visitTime: z.string().optional().nullable(),
  siteVisitStatus: z.enum(["NOT_DISCUSSED", "INTERESTED", "PROPOSED", "CONFIRMED", "COMPLETED", "RESCHEDULED", "CANCELLED"]).default("NOT_DISCUSSED"),
  lastContactAt: z.string().optional().nullable(),
  nextFollowUpAt: z.string().optional().nullable(),
  followUpNotes: z.string().max(3000).optional().default(""),
  additionalRequirements: z.string().max(5000).optional().default(""),
  contactConsent: z.boolean().refine(Boolean, "Buyer consent is required"),
  confirmDuplicate: z.boolean().optional().default(false),
});
const callSchema = z.object({
  outcome: z.enum(["CONNECTED", "NO_ANSWER", "BUSY", "SWITCHED_OFF", "CALL_BACK_REQUESTED", "INTERESTED", "NOT_INTERESTED", "FOLLOW_UP_REQUIRED"]),
  notes: z.string().max(3000).optional().default(""),
  nextFollowUpAt: z.string().optional().nullable(),
  leadTemperature: z.enum(["HOT", "WARM", "COLD"]).optional(),
});
const followUpSchema = z.object({
  dueAt: z.string().min(1),
  channel: z.enum(["CALL", "WHATSAPP", "EMAIL", "MEETING"]).default("CALL"),
  note: z.string().max(2000).optional().default(""),
});
const siteVisitCreateSchema = z.object({
  leadId: z.string().refine(isValidId),
  scheduledAt: z.string().min(1),
  timeSlot: z.string().max(100).optional().default(""),
  contactNumber: z.string().max(30).optional().default(""),
  notes: z.string().max(3000).optional().default(""),
});
const attendanceCorrectionSchema = z.object({
  status: z.enum(["PRESENT", "ABSENT", "HALF_DAY", "ON_LEAVE", "HOLIDAY"]).optional(),
  notes: z.string().max(2000).optional(),
  correctionReason: z.string().trim().min(3).max(500),
  checkInAt: z.string().optional().nullable(),
  checkOutAt: z.string().optional().nullable(),
});
const leaveCreateSchema = z.object({
  leaveType: z.enum(["ANNUAL", "SICK", "CASUAL", "UNPAID", "OTHER"]).default("CASUAL"),
  startDate: z.string().refine(isValidIsoDate, "Choose a valid start date."),
  endDate: z.string().refine(isValidIsoDate, "Choose a valid end date."),
  reason: z.string().trim().min(5).max(2000),
});
const leaveReviewSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED", "CANCELLED"]),
  reviewNotes: z.string().trim().max(2000).optional().default(""),
});
const salaryCreateSchema = z.object({
  employeeId: z.string().refine(isValidId),
  monthKey: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  grossSalary: z.coerce.number().min(0).max(100000000),
  allowances: z.coerce.number().min(0).max(100000000).default(0),
  deductions: z.coerce.number().min(0).max(100000000).default(0),
  notes: z.string().max(2000).optional().default(""),
});
const salaryPatchSchema = z.object({
  status: z.enum(["DRAFT", "PENDING_APPROVAL", "APPROVED", "PAID", "ON_HOLD"]).optional(),
  grossSalary: z.coerce.number().min(0).max(100000000).optional(),
  allowances: z.coerce.number().min(0).max(100000000).optional(),
  deductions: z.coerce.number().min(0).max(100000000).optional(),
  paymentDate: z.string().optional().nullable(),
  paymentReference: z.string().max(180).optional(),
  notes: z.string().max(2000).optional(),
});
const roundMoney = (n: number) => Math.round(n * 100) / 100;

function employeePublicShape(e: typeof employees.$inferSelect, account?: { email: string; disabled: boolean; emailVerified: boolean; phoneVerified: boolean } | null, includeSalary = true) {
  return {
    id: String(e._id), accountUserId: e.accountUserId, employeeCode: e.employeeCode,
    name: e.name, officialEmail: e.officialEmail ?? account?.email ?? "",
    phone: e.phone ?? "", department: e.department, designation: e.title ?? "",
    employmentType: e.employmentType, reportingManagerId: e.reportingManagerId,
    recruitmentSource: e.recruitmentSource ?? "Other", recruitmentCampaign: e.recruitmentCampaign ?? "",
    applicationDate: e.applicationDate, interviewDate: e.interviewDate, joiningDate: e.joinedAt,
    status: e.status, monthlySalary: includeSalary ? e.monthlyCtc : undefined, salaryDueDay: includeSalary ? e.salaryDueDay : undefined,
    salaryStartDate: includeSalary ? e.salaryStartDate : undefined, notes: e.notes ?? "",
    permissions: e.permissions ?? [],
    accountStatus: !e.accountUserId ? "NO_ACCOUNT" : account?.disabled ? "INVITED_OR_DISABLED" : account?.emailVerified && account?.phoneVerified ? "ACTIVE" : "VERIFICATION_REQUIRED",
    createdAt: e.createdAt,
  };
}

// The one-time activation endpoint is intentionally registered before auth middleware.
router.post("/activate", async (req, res, next) => {
  try {
    const parsed = activateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Use a 12+ character password with upper/lowercase letters, a number, and a symbol." });
    const db = getDb();
    const [invite] = await db.select().from(employeeInvites).where(eq(employeeInvites.tokenHash, hashToken(parsed.data.token))).limit(1);
    if (!invite || invite.usedAt || invite.expiresAt.getTime() <= Date.now()) {
      return res.status(400).json({ error: "This activation link is invalid, expired, or already used. Ask your administrator for a new invitation." });
    }
    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    const activated = await db.transaction(async (tx) => {
      const [claimed] = await tx.update(employeeInvites).set({ usedAt: new Date() })
        .where(and(eq(employeeInvites._id, invite._id), isNull(employeeInvites.usedAt), gte(employeeInvites.expiresAt, new Date())))
        .returning();
      if (!claimed) return false;
      const [emp] = await tx.select().from(employees).where(eq(employees._id, invite.employeeId)).limit(1);
      if (!emp?.accountUserId || emp.status === "INACTIVE") return false;
      await tx.update(users).set({
        password: passwordHash, disabled: false, emailVerified: true,
        phoneVerified: !emp.phone, authVersion: sql`auth_version + 1`,
      }).where(eq(users._id, emp.accountUserId));
      return true;
    });
    if (!activated) return res.status(400).json({ error: "This account could not be activated. Contact your administrator." });
    await logAudit({ action: "employee.account.activate", resourceType: "employee", resourceId: String(invite.employeeId), metadata: { via: "invitation" } });
    return res.json({ message: "Your employee account is activated. Sign in to continue." });
  } catch (err) { next(err); }
});

router.use(authenticate);

// ------------------------------- Admin directory / account provisioning
router.get("/overview", requireRole("ADMIN"), async (req: AuthedRequest, res, next) => {
  try {
    const db = getDb();
    const [empRows, tasks, leadRows, visits, attendance, callRows, inviteRows, accountRows] = await Promise.all([
      db.select().from(employees),
      db.select({ id: employeeTasks._id, employeeId: employeeTasks.employeeId, taskType: employeeTasks.taskType, status: employeeTasks.status, deadlineAt: employeeTasks.deadlineAt, createdAt: employeeTasks.createdAt }).from(employeeTasks),
      db.select({ id: leads._id, submittedById: leads.submittedById, assignedToId: leads.assignedToId, leadTemperature: leads.leadTemperature, createdAt: leads.createdAt }).from(leads),
      db.select({ id: siteVisits._id, scheduledAt: siteVisits.scheduledAt, status: siteVisits.status, responsibleUserId: siteVisits.responsibleUserId }).from(siteVisits),
      db.select().from(employeeAttendance).where(eq(employeeAttendance.attendanceDate, dateInIndia())),
      db.select({ id: leadActivities._id, actorUserId: leadActivities.actorUserId, type: leadActivities.type, createdAt: leadActivities.createdAt }).from(leadActivities),
      db.select().from(employeeInvites).where(isNull(employeeInvites.usedAt)),
      db.select({ id: users._id, disabled: users.disabled, emailVerified: users.emailVerified, phoneVerified: users.phoneVerified }).from(users).where(eq(users.role, "EMPLOYEE")),
    ]);
    const employeeIds = new Set(empRows.filter((e) => e.accountUserId).map((e) => String(e.accountUserId)));
    const today = dateInIndia();
    const start = new Date(`${today}T00:00:00+05:30`);
    const end = new Date(start.getTime() + 86400000);
    const active = empRows.filter((e) => e.status === "ACTIVE");
    const accountById = new Map(accountRows.map((u) => [String(u.id), u]));
    const activeAccounts = empRows.filter((e) => e.accountUserId && e.status !== "INACTIVE" && accountById.get(String(e.accountUserId)) && !accountById.get(String(e.accountUserId))!.disabled);
    const submitted = leadRows.filter((l) => employeeIds.has(String(l.submittedById)));
    const assigned = leadRows.filter((l) => employeeIds.has(String(l.assignedToId)));
    const relatedLeads = new Map([...submitted, ...assigned].map((lead) => [String(lead.id), lead]));
    res.json({
      totalEmployees: empRows.length,
      activeEmployees: active.length,
      inactiveEmployees: empRows.filter((e) => e.status === "INACTIVE").length,
      employeesOnLeave: empRows.filter((e) => e.status === "ON_LEAVE").length,
      employeeAccounts: employeeIds.size,
      activeAccounts: activeAccounts.length,
      pendingInvitations: new Set(inviteRows.filter((i) => i.expiresAt.getTime() > Date.now()).map((i) => String(i.employeeId))).size,
      tasksAssignedToday: tasks.filter((t) => t.createdAt >= start && t.createdAt < end && t.taskType === "ASSIGNED").length,
      tasksCompletedToday: tasks.filter((t) => t.status === "COMPLETED" && t.createdAt >= start && t.createdAt < end).length,
      pendingTasks: tasks.filter((t) => !["COMPLETED", "CANCELLED"].includes(t.status)).length,
      overdueTasks: tasks.filter((t) => t.deadlineAt && t.deadlineAt < new Date() && !["COMPLETED", "CANCELLED"].includes(t.status)).length,
      totalLeadsSubmitted: submitted.length,
      assignedLeads: assigned.length,
      hotLeads: [...relatedLeads.values()].filter((l) => l.leadTemperature === "HOT").length,
      warmLeads: [...relatedLeads.values()].filter((l) => l.leadTemperature === "WARM").length,
      coldLeads: [...relatedLeads.values()].filter((l) => l.leadTemperature === "COLD").length,
      upcomingSiteVisits: visits.filter((v) => employeeIds.has(String(v.responsibleUserId)) && v.scheduledAt >= new Date() && !["CANCELLED", "COMPLETED"].includes(v.status)).length,
      callsLoggedToday: callRows.filter((c) => c.actorUserId && employeeIds.has(String(c.actorUserId)) && c.type === "CALL" && c.createdAt >= start && c.createdAt < end).length,
      attendanceSummary: {
        present: attendance.filter((a) => a.status === "PRESENT").length,
        absent: attendance.filter((a) => a.status === "ABSENT").length,
        halfDay: attendance.filter((a) => a.status === "HALF_DAY").length,
        onLeave: attendance.filter((a) => a.status === "ON_LEAVE").length,
        notMarked: Math.max(0, active.length - attendance.length),
      },
      byDepartment: Object.entries(empRows.reduce<Record<string, number>>((m, e) => { m[e.department] = (m[e.department] || 0) + 1; return m; }, {})).map(([department, count]) => ({ department, count })),
      byRecruitmentSource: Object.entries(empRows.reduce<Record<string, number>>((m, e) => { const key = e.recruitmentSource || "Other"; m[key] = (m[key] || 0) + 1; return m; }, {})).map(([source, count]) => ({ source, count })),
    });
  } catch (err) { next(err); }
});

router.get("/me", requireRole("EMPLOYEE"), async (req: AuthedRequest, res, next) => {
  try {
    const emp = await needEmployee(req, res);
    if (!emp) return;
    const [account] = await getDb().select({ email: users.email, disabled: users.disabled, emailVerified: users.emailVerified, phoneVerified: users.phoneVerified }).from(users).where(eq(users._id, req.user!.userId)).limit(1);
    return res.json({ employee: employeePublicShape(emp, account, hasPermission(emp.permissions, "salary.read.own")), userId: req.user!.userId });
  } catch (err) { next(err); }
});

router.get("/", requireRole("ADMIN"), async (req, res, next) => {
  try {
    const db = getDb();
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const status = typeof req.query.status === "string" ? req.query.status : "";
    const department = typeof req.query.department === "string" ? req.query.department : "";
    const source = typeof req.query.recruitmentSource === "string" ? req.query.recruitmentSource : "";
    const conditions = [];
    if (status) conditions.push(eq(employees.status, status as "ACTIVE" | "ON_LEAVE" | "INACTIVE"));
    if (department) conditions.push(eq(employees.department, department));
    if (source) conditions.push(eq(employees.recruitmentSource, source));
    if (q) conditions.push(or(sql`${employees.name} ILIKE ${"%" + q + "%"}`, sql`${employees.officialEmail} ILIKE ${"%" + q + "%"}`, sql`${employees.employeeCode} ILIKE ${"%" + q + "%"}`)!);
    const rows = await db.select({ employee: employees, email: users.email, disabled: users.disabled, emailVerified: users.emailVerified, phoneVerified: users.phoneVerified })
      .from(employees).leftJoin(users, eq(employees.accountUserId, users._id))
      .where(conditions.length ? and(...conditions) : undefined).orderBy(desc(employees.createdAt));
    return res.json({ employees: rows.map((r) => employeePublicShape(r.employee, r.email ? { email: r.email, disabled: !!r.disabled, emailVerified: !!r.emailVerified, phoneVerified: !!r.phoneVerified } : null)) });
  } catch (err) { next(err); }
});

router.post("/", requireRole("ADMIN"), async (req: AuthedRequest, res, next) => {
  try {
    const parsed = employeeCreateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Check the employee details and try again.", issues: parsed.error.flatten() });
    const data = parsed.data;
    if (data.phone && !/^[+\d\s()-]{10,20}$/.test(data.phone)) return res.status(400).json({ error: "Enter a valid phone number." });
    if (data.reportingManagerId && !isValidId(data.reportingManagerId)) return res.status(400).json({ error: "Reporting manager is invalid." });
    const db = getDb();
    const existing = await db.select({ id: users._id }).from(users).where(eq(users.email, data.officialEmail)).limit(1);
    if (existing.length) return res.status(409).json({ error: "An account already exists for this official email." });
    const tempPasswordHash = await bcrypt.hash(randomBytes(48).toString("hex"), 12);
    const code = data.employeeCode || `TRV-EMP-${new Date().getFullYear()}-${randomBytes(3).toString("hex").toUpperCase()}`;
    const created = await db.transaction(async (tx) => {
      const [account] = await tx.insert(users).values({
        name: data.name, email: data.officialEmail, password: tempPasswordHash,
        role: "EMPLOYEE", approvalStatus: "APPROVED", disabled: true,
        phone: data.phone || null, emailVerified: false, phoneVerified: false,
      }).returning({ id: users._id });
      const [employee] = await tx.insert(employees).values({
        accountUserId: account.id, employeeCode: code, officialEmail: data.officialEmail,
        phone: data.phone || null, name: data.name, title: data.designation || null,
        department: data.department, employmentType: data.employmentType,
        reportingManagerId: data.reportingManagerId || null,
        recruitmentSource: data.recruitmentSource || "Other",
        recruitmentCampaign: data.recruitmentCampaign || null,
        applicationDate: parseDate(data.applicationDate), interviewDate: parseDate(data.interviewDate),
        joinedAt: parseDate(data.joiningDate) || new Date(), status: data.status,
        monthlyCtc: data.monthlySalary, salaryDueDay: data.salaryDueDay,
        salaryStartDate: parseDate(data.joiningDate), notes: data.notes || null,
        permissions: data.permissions || [...DEFAULT_EMPLOYEE_PERMISSIONS],
      }).returning();
      return { accountId: String(account.id), employee };
    });
    const invite = await issueInvite(String(created.employee._id), req.user!.userId).catch(() => ({ delivered: false, expiresAt: null }));
    await logAudit({ userId: req.user!.userId, action: "employee.create", resourceType: "employee", resourceId: String(created.employee._id), metadata: { name: data.name, employeeCode: code, department: data.department, inviteDelivered: invite.delivered } });
    if (invite.delivered) {
      await notifyUser(req.user!.userId, "employee_invitation_sent", "Employee invitation sent", `Activation invitation sent to ${data.name}.`, req.user!.userId, "/admin/employees");
    }
    return res.status(201).json({
      employee: employeePublicShape(created.employee, { email: data.officialEmail, disabled: true, emailVerified: false, phoneVerified: false }),
      inviteDelivered: invite.delivered,
      inviteMessage: invite.delivered ? "Activation invitation sent by email." : "Employee profile created but email delivery is not configured or failed. Configure SMTP, then resend the invitation.",
    });
  } catch (err) { next(err); }
});

router.post("/:id/account", requireRole("ADMIN"), async (req: AuthedRequest, res, next) => {
  try {
    if (!isValidId(String(req.params.id))) return res.status(404).json({ error: "Employee not found." });
    const parsed = z.object({
      officialEmail: z.email().transform((v) => v.trim().toLowerCase()),
      phone: z.string().trim().max(30).optional().default(""),
      employeeCode: z.string().trim().min(2).max(40).optional(),
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Enter a valid official email and employee details." });
    const db = getDb();
    const [employee] = await db.select().from(employees).where(eq(employees._id, String(req.params.id))).limit(1);
    if (!employee) return res.status(404).json({ error: "Employee not found." });
    if (employee.accountUserId) return res.status(409).json({ error: "This employee already has a linked account." });
    if (employee.status === "INACTIVE") return res.status(409).json({ error: "Reactivate the employee profile before creating an account." });
    if (parsed.data.phone && !/^[+\d\s()-]{10,20}$/.test(parsed.data.phone)) return res.status(400).json({ error: "Enter a valid phone number." });
    const [existingAccount] = await db.select({ id: users._id }).from(users).where(eq(users.email, parsed.data.officialEmail)).limit(1);
    if (existingAccount) return res.status(409).json({ error: "An account already exists for this official email." });
    const passwordHash = await bcrypt.hash(randomBytes(48).toString("hex"), 12);
    const code = parsed.data.employeeCode || employee.employeeCode || `TRV-EMP-${new Date().getFullYear()}-${randomBytes(3).toString("hex").toUpperCase()}`;
    const phone = parsed.data.phone || employee.phone || null;
    const linked = await db.transaction(async (tx) => {
      const [account] = await tx.insert(users).values({
        name: employee.name, email: parsed.data.officialEmail, password: passwordHash,
        role: "EMPLOYEE", approvalStatus: "APPROVED", disabled: true, phone,
        emailVerified: false, phoneVerified: false,
      }).returning({ id: users._id });
      const [updated] = await tx.update(employees).set({
        accountUserId: account.id, employeeCode: code, officialEmail: parsed.data.officialEmail,
        phone, permissions: employee.permissions?.length ? employee.permissions : [...DEFAULT_EMPLOYEE_PERMISSIONS],
      }).where(and(eq(employees._id, employee._id), isNull(employees.accountUserId))).returning();
      if (!updated) throw new Error("The employee profile was linked concurrently. Refresh and try again.");
      return { accountId: String(account.id), employee: updated };
    });
    const invite = await issueInvite(String(linked.employee._id), req.user!.userId).catch(() => ({ delivered: false, expiresAt: null }));
    await logAudit({ userId: req.user!.userId, action: "employee.account.create", resourceType: "employee", resourceId: String(linked.employee._id), metadata: { employeeCode: code, inviteDelivered: invite.delivered, linkedExistingProfile: true } });
    return res.status(201).json({
      employee: employeePublicShape(linked.employee, { email: parsed.data.officialEmail, disabled: true, emailVerified: false, phoneVerified: false }),
      inviteDelivered: invite.delivered,
      inviteMessage: invite.delivered ? "Existing employee profile linked and activation invitation sent." : "Employee profile linked to a disabled account, but the invitation email could not be delivered. Configure SMTP, then resend the invitation.",
    });
  } catch (err) { next(err); }
});

router.post("/:id/invite", requireRole("ADMIN"), async (req: AuthedRequest, res, next) => {
  try {
    if (!isValidId(String(req.params.id))) return res.status(404).json({ error: "Employee not found." });
    const emp = await getDb().select().from(employees).where(eq(employees._id, String(req.params.id))).limit(1);
    if (!emp[0]?.accountUserId || emp[0].status === "INACTIVE") return res.status(400).json({ error: "Only employees with a linked, non-inactive account can be invited." });
    const [account] = await getDb().select({ disabled: users.disabled, emailVerified: users.emailVerified }).from(users).where(eq(users._id, emp[0].accountUserId)).limit(1);
    if (!account || !account.disabled || account.emailVerified) return res.status(409).json({ error: "This account has already completed email activation. Use the password-reset flow for access recovery." });
    const invite = await issueInvite(String(emp[0]._id), req.user!.userId);
    await logAudit({ userId: req.user!.userId, action: "employee.invite.resend", resourceType: "employee", resourceId: String(emp[0]._id), metadata: { delivered: invite.delivered } });
    return res.json({ delivered: invite.delivered, message: invite.delivered ? "Activation invitation sent." : "Email was not delivered. Check SMTP configuration and try again." });
  } catch (err) { next(err); }
});

router.patch("/:id", requireRole("ADMIN"), async (req: AuthedRequest, res, next) => {
  try {
    if (!isValidId(String(req.params.id))) return res.status(404).json({ error: "Employee not found." });
    const parsed = employeePatchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Check employee fields.", issues: parsed.error.flatten() });
    const db = getDb();
    const [before] = await db.select().from(employees).where(eq(employees._id, String(req.params.id))).limit(1);
    if (!before) return res.status(404).json({ error: "Employee not found." });
    const d = parsed.data;
    if (d.officialEmail && d.officialEmail !== before.officialEmail && before.accountUserId) {
      return res.status(400).json({ error: "Changing the email on a linked login requires the email-verification workflow. The current login email was not changed." });
    }
    if (d.officialEmail && d.officialEmail !== before.officialEmail) {
      const [existing] = await db.select({ id: users._id }).from(users).where(eq(users.email, d.officialEmail)).limit(1);
      if (existing && String(existing.id) !== String(before.accountUserId)) return res.status(409).json({ error: "An account already exists for this email." });
    }
    if (d.employeeCode && d.employeeCode !== before.employeeCode) {
      const [existingCode] = await db.select({ id: employees._id }).from(employees).where(eq(employees.employeeCode, d.employeeCode)).limit(1);
      if (existingCode && String(existingCode.id) !== String(before._id)) return res.status(409).json({ error: "That employee ID is already in use." });
    }
    const patch: Partial<typeof employees.$inferInsert> = {};
    if (d.name !== undefined) patch.name = d.name;
    if (d.employeeCode !== undefined) patch.employeeCode = d.employeeCode;
    if (d.officialEmail !== undefined) patch.officialEmail = d.officialEmail;
    if (d.phone !== undefined) patch.phone = d.phone || null;
    if (d.department !== undefined) patch.department = d.department;
    if (d.designation !== undefined) patch.title = d.designation || null;
    if (d.employmentType !== undefined) patch.employmentType = d.employmentType;
    if (d.reportingManagerId !== undefined) patch.reportingManagerId = d.reportingManagerId || null;
    if (d.recruitmentSource !== undefined) patch.recruitmentSource = d.recruitmentSource;
    if (d.recruitmentCampaign !== undefined) patch.recruitmentCampaign = d.recruitmentCampaign || null;
    if (d.applicationDate !== undefined) patch.applicationDate = parseDate(d.applicationDate);
    if (d.interviewDate !== undefined) patch.interviewDate = parseDate(d.interviewDate);
    if (d.joiningDate !== undefined) patch.joinedAt = parseDate(d.joiningDate) || before.joinedAt;
    if (d.status !== undefined) patch.status = d.status;
    if (d.monthlySalary !== undefined) patch.monthlyCtc = d.monthlySalary;
    if (d.salaryDueDay !== undefined) patch.salaryDueDay = d.salaryDueDay;
    if (d.notes !== undefined) patch.notes = d.notes || null;
    if (d.permissions !== undefined) patch.permissions = d.permissions;
    const [updated] = await db.update(employees).set(patch).where(eq(employees._id, String(req.params.id))).returning();
    if (before.accountUserId) {
      const userPatch: Partial<typeof users.$inferInsert> = {};
      if (d.name !== undefined) userPatch.name = d.name;
      if (d.officialEmail !== undefined) userPatch.email = d.officialEmail;
      if (d.phone !== undefined) userPatch.phone = d.phone || null;
      if (d.status === "INACTIVE") {
        userPatch.disabled = true;
        userPatch.authVersion = sql`auth_version + 1` as unknown as number;
      } else if (d.status === "ACTIVE" || d.status === "ON_LEAVE") {
        // Re-enable only previously verified accounts; pending invitations must still be activated first.
        const [account] = await db.select({ disabled: users.disabled, emailVerified: users.emailVerified, phoneVerified: users.phoneVerified }).from(users).where(eq(users._id, before.accountUserId)).limit(1);
        userPatch.disabled = !account?.emailVerified || !account?.phoneVerified;
        if (account?.emailVerified && account?.phoneVerified) userPatch.authVersion = sql`auth_version + 1` as unknown as number;
      }
      if (Object.keys(userPatch).length) await db.update(users).set(userPatch).where(eq(users._id, before.accountUserId));
    }
    if (d.monthlySalary !== undefined && d.monthlySalary !== before.monthlyCtc) {
      await logAudit({ userId: req.user!.userId, action: "employee.salary.structure.update", resourceType: "employee", resourceId: String(req.params.id), metadata: { from: before.monthlyCtc, to: d.monthlySalary, reason: "Employee profile update" } });
    }
    if (d.permissions !== undefined && JSON.stringify(d.permissions) !== JSON.stringify(before.permissions ?? [])) {
      await logAudit({ userId: req.user!.userId, action: "employee.permissions.update", resourceType: "employee", resourceId: String(req.params.id), metadata: { before: before.permissions ?? [], after: updated.permissions ?? [] } });
    }
    await logAudit({ userId: req.user!.userId, action: d.status === "INACTIVE" ? "employee.deactivate" : "employee.update", resourceType: "employee", resourceId: String(req.params.id), metadata: { changedFields: Object.keys(d) } });
    return res.json({ employee: employeePublicShape(updated) });
  } catch (err) { next(err); }
});

// ----------------------------------------------- employee overview / profile
router.get("/me/overview", requireRole("EMPLOYEE"), async (req: AuthedRequest, res, next) => {
  try {
    const emp = await needEmployee(req, res);
    if (!emp) return;
    const db = getDb();
    const userId = req.user!.userId;
    const [tasks, myLeads, visits, attendance, callActivities] = await Promise.all([
      db.select().from(employeeTasks).where(eq(employeeTasks.employeeId, emp._id)).orderBy(desc(employeeTasks.deadlineAt)),
      (() => { const scopes = employeeLeadScope(emp.permissions, userId); return scopes.length ? db.select().from(leads).where(or(...scopes)).orderBy(desc(leads.createdAt)) : Promise.resolve([] as (typeof leads.$inferSelect)[]); })(),
      db.select().from(siteVisits).where(eq(siteVisits.responsibleUserId, userId)).orderBy(desc(siteVisits.scheduledAt)),
      db.select().from(employeeAttendance).where(eq(employeeAttendance.employeeId, emp._id)).orderBy(desc(employeeAttendance.attendanceDate)),
      db.select().from(leadActivities).where(and(eq(leadActivities.actorUserId, userId), eq(leadActivities.type, "CALL"))).orderBy(desc(leadActivities.createdAt)).limit(200),
    ]);
    const today = dateInIndia();
    const todayAttendance = attendance.find((a) => a.attendanceDate === today) || null;
    const now = new Date();
    return res.json({
      employee: employeePublicShape(emp, null, hasPermission(emp.permissions, "salary.read.own")),
      today,
      tasks: {
        today: tasks.filter((t) => t.deadlineAt && dateInIndia(t.deadlineAt) === today),
        pending: tasks.filter((t) => !["COMPLETED", "CANCELLED"].includes(t.status)),
        completed: tasks.filter((t) => t.status === "COMPLETED"),
        overdue: tasks.filter((t) => t.deadlineAt && t.deadlineAt < now && !["COMPLETED", "CANCELLED"].includes(t.status)),
      },
      leads: { all: myLeads, submitted: myLeads.filter((l) => String(l.submittedById) === userId).length, hot: myLeads.filter((l) => l.leadTemperature === "HOT").length, warm: myLeads.filter((l) => l.leadTemperature === "WARM").length, cold: myLeads.filter((l) => l.leadTemperature === "COLD").length },
      siteVisits: visits,
      callsLoggedToday: callActivities.filter((c) => c.createdAt >= new Date(`${today}T00:00:00+05:30`) && c.createdAt < new Date(new Date(`${today}T00:00:00+05:30`).getTime() + 86400000)).length,
      recentCallActivities: callActivities.slice(0, 20),
      attendance: todayAttendance,
      attendanceHistory: attendance.slice(0, 30),
    });
  } catch (err) { next(err); }
});

async function canEmployeeAccessTask(task: typeof employeeTasks.$inferSelect, emp: typeof employees.$inferSelect) {
  if (String(task.employeeId) === String(emp._id)) return true;
  const [assignment] = await getDb().select({ id: employeeTaskAssignments._id }).from(employeeTaskAssignments)
    .where(and(eq(employeeTaskAssignments.taskId, task._id), eq(employeeTaskAssignments.employeeId, emp._id))).limit(1);
  return !!assignment;
}
async function shapeEmployeeTasks(rows: (typeof employeeTasks.$inferSelect)[], currentEmployeeId?: string) {
  if (!rows.length) return [];
  const db = getDb();
  const ids = rows.map((row) => row._id);
  const [assignments, attachments] = await Promise.all([
    db.select({
      taskId: employeeTaskAssignments.taskId, employeeId: employeeTaskAssignments.employeeId,
      name: employees.name, employeeCode: employees.employeeCode, status: employeeTaskAssignments.status,
      assignedAt: employeeTaskAssignments.assignedAt, completedAt: employeeTaskAssignments.completedAt,
    }).from(employeeTaskAssignments).innerJoin(employees, eq(employeeTaskAssignments.employeeId, employees._id))
      .where(inArray(employeeTaskAssignments.taskId, ids)),
    db.select().from(employeeTaskAttachments).where(inArray(employeeTaskAttachments.taskId, ids)).orderBy(desc(employeeTaskAttachments.createdAt)),
  ]);
  return rows.map((task) => {
    const assignees = assignments.filter((a) => String(a.taskId) === String(task._id));
    const mine = currentEmployeeId ? assignees.find((a) => String(a.employeeId) === currentEmployeeId) : undefined;
    return {
      ...task,
      status: mine?.status ?? task.status,
      taskStatus: task.status,
      currentUserAssignmentId: mine ? String(mine.employeeId) : null,
      assignedEmployeeIds: assignees.map((a) => String(a.employeeId)),
      assignees: assignees.map((a) => ({ employeeId: String(a.employeeId), name: a.name, employeeCode: a.employeeCode, status: a.status, assignedAt: a.assignedAt, completedAt: a.completedAt })),
      attachments: attachments.filter((a) => String(a.taskId) === String(task._id)).map((a) => ({
        _id: String(a._id), originalFileName: a.originalFileName, mimeType: a.mimeType,
        sizeBytes: a.sizeBytes, uploadedByUserId: String(a.uploadedByUserId), createdAt: a.createdAt,
      })),
    };
  });
}
async function activeLinkedEmployees(employeeIds: string[]) {
  const uniqueIds = Array.from(new Set(employeeIds));
  if (!uniqueIds.length || uniqueIds.some((id) => !isValidId(id))) return null;
  const rows = await getDb().select().from(employees).where(inArray(employees._id, uniqueIds));
  if (rows.length !== uniqueIds.length || rows.some((e) => e.status === "INACTIVE" || !e.accountUserId)) return null;
  return uniqueIds.map((id) => rows.find((e) => String(e._id) === id)!);
}

// ------------------------------------------------------------------- Tasks
router.get("/tasks", async (req: AuthedRequest, res, next) => {
  try {
    const db = getDb();
    let rows;
    if (req.user!.role === "ADMIN") {
      const employeeId = typeof req.query.employeeId === "string" ? req.query.employeeId : "";
      const conditions = [];
      const status = typeof req.query.status === "string" ? req.query.status : "";
      if (employeeId && isValidId(employeeId)) {
        const assignedRows = await db.select({ taskId: employeeTaskAssignments.taskId }).from(employeeTaskAssignments).where(eq(employeeTaskAssignments.employeeId, employeeId));
        const scope = [eq(employeeTasks.employeeId, employeeId)];
        if (assignedRows.length) scope.push(inArray(employeeTasks._id, assignedRows.map((r) => r.taskId)));
        conditions.push(or(...scope)!);
      }
      if (status) conditions.push(eq(employeeTasks.status, status as typeof employeeTasks.$inferSelect.status));
      rows = await db.select().from(employeeTasks).where(conditions.length ? and(...conditions) : undefined).orderBy(desc(employeeTasks.createdAt)).limit(500);
      return res.json({ tasks: await shapeEmployeeTasks(rows) });
    } else if (req.user!.role === "EMPLOYEE") {
      const emp = await needEmployee(req, res);
      if (!emp) return;
      if (!hasPermission(emp.permissions, "task.read.own")) return res.status(403).json({ error: "Task access is not enabled for this account." });
      const assignedRows = await db.select({ taskId: employeeTaskAssignments.taskId, status: employeeTaskAssignments.status })
        .from(employeeTaskAssignments).where(eq(employeeTaskAssignments.employeeId, emp._id));
      const scope = [eq(employeeTasks.employeeId, emp._id)];
      if (assignedRows.length) scope.push(inArray(employeeTasks._id, assignedRows.map((r) => r.taskId)));
      rows = await db.select().from(employeeTasks).where(or(...scope)).orderBy(desc(employeeTasks.createdAt)).limit(300);
      const enriched = await shapeEmployeeTasks(rows, String(emp._id));
      const filterStatus = typeof req.query.status === "string" ? req.query.status : "";
      return res.json({ tasks: filterStatus ? enriched.filter((task) => task.status === filterStatus) : enriched });
    } else return res.status(403).json({ error: "Insufficient permissions." });
    return res.json({ tasks: await shapeEmployeeTasks(rows) });
  } catch (err) { next(err); }
});

router.post("/tasks", async (req: AuthedRequest, res, next) => {
  try {
    const parsed = taskCreateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Check the task fields.", issues: parsed.error.flatten() });
    const d = parsed.data;
    const admin = req.user!.role === "ADMIN";
    if (!admin && req.user!.role !== "EMPLOYEE") return res.status(403).json({ error: "Insufficient permissions." });
    let emp: typeof employees.$inferSelect | null = null;
    let selectedEmployees: (typeof employees.$inferSelect)[] = [];
    let assignedEmployeeIds: string[] = [];
    if (admin) {
      assignedEmployeeIds = d.employeeIds?.length ? d.employeeIds : d.employeeId ? [d.employeeId] : [];
      const targets = await activeLinkedEmployees(assignedEmployeeIds);
      if (!targets) return res.status(400).json({ error: "Choose one or more active employees with linked login accounts." });
      selectedEmployees = targets;
      emp = targets[0];
      assignedEmployeeIds = targets.map((target) => String(target._id));
    } else {
      emp = await needEmployee(req, res);
      if (!emp) return;
      if (!hasPermission(emp.permissions, "task.create.own")) return res.status(403).json({ error: "Personal task creation is not enabled for this account." });
      if ((d.employeeIds && d.employeeIds.length) || (d.employeeId && d.employeeId !== String(emp._id))) return res.status(403).json({ error: "Employees may only create personal tasks." });
    }
    const db = getDb();
    const [task] = await db.insert(employeeTasks).values({
      employeeId: emp!._id, taskType: admin ? "ASSIGNED" : "PERSONAL",
      title: d.title, description: d.description || null, category: d.category || "GENERAL",
      assignedByUserId: req.user!.userId, priority: d.priority,
      status: admin ? "ASSIGNED" : "IN_PROGRESS",
      startAt: parseDate(d.startAt), deadlineAt: parseDate(d.deadlineAt),
      estimatedMinutes: d.estimatedMinutes ?? null,
      projectId: d.projectId && isValidId(d.projectId) ? d.projectId : null,
      leadId: d.leadId && isValidId(d.leadId) ? d.leadId : null,
    }).returning();
    if (admin) {
      await db.insert(employeeTaskAssignments).values(assignedEmployeeIds.map((employeeId) => ({
        taskId: task._id, employeeId, assignedByUserId: req.user!.userId, status: "ASSIGNED" as const,
      }))).onConflictDoNothing();
    }
    await db.insert(employeeTaskHistory).values({
      taskId: task._id, actorUserId: req.user!.userId, action: admin ? "ASSIGNED" : "PERSONAL_CREATED",
      afterValue: { status: task.status, title: task.title, employeeIds: assignedEmployeeIds },
    });
    if (admin) {
      for (const target of selectedEmployees) {
        if (target.accountUserId) await notifyUser(String(target.accountUserId), "employee_task_assigned", "New task assigned", "A new task was assigned: " + task.title, req.user!.userId, "/employee/dashboard?tab=tasks");
      }
    }
    await logAudit({ userId: req.user!.userId, action: admin ? "employee.task.assign" : "employee.task.personal.create", resourceType: "employee_task", resourceId: String(task._id), metadata: { employeeIds: admin ? assignedEmployeeIds : [String(emp!._id)], priority: task.priority } });
    const [responseTask] = await shapeEmployeeTasks([task]);
    return res.status(201).json({ task: responseTask });
  } catch (err) { next(err); }
});

router.patch("/tasks/:id", async (req: AuthedRequest, res, next) => {
  try {
    const taskId = String(req.params.id);
    if (!isValidId(taskId)) return res.status(404).json({ error: "Task not found." });
    const parsed = taskPatchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Check the task fields.", issues: parsed.error.flatten() });
    const db = getDb();
    const [before] = await db.select().from(employeeTasks).where(eq(employeeTasks._id, taskId)).limit(1);
    if (!before) return res.status(404).json({ error: "Task not found." });
    const admin = req.user!.role === "ADMIN";
    if (!admin && req.user!.role !== "EMPLOYEE") return res.status(403).json({ error: "Insufficient permissions." });
    let emp: typeof employees.$inferSelect | null = null;
    if (!admin) {
      emp = await needEmployee(req, res);
      if (!emp) return;
      if (!(await canEmployeeAccessTask(before, emp))) return res.status(404).json({ error: "Task not found." });
      if (before.taskType === "ASSIGNED") {
        const allowedKeys = Object.keys(parsed.data).filter((k) => !["status", "completionNotes", "reason"].includes(k));
        if (allowedKeys.length) return res.status(403).json({ error: "Assigned task details can only be changed by an administrator." });
        if (parsed.data.status && ["CANCELLED", "ASSIGNED"].includes(parsed.data.status)) {
          return res.status(403).json({ error: "Only an administrator can cancel or reset an assigned task." });
        }
        if (parsed.data.status && !hasPermission(emp.permissions, parsed.data.status === "COMPLETED" ? "task.complete.own" : "task.update.own")) {
          return res.status(403).json({ error: "Task update is not enabled for this account." });
        }
      } else if (!hasPermission(emp.permissions, "task.update.own")) {
        return res.status(403).json({ error: "Personal task editing is not enabled for this account." });
      }
    }
    const d = parsed.data;
    const patch: Partial<typeof employeeTasks.$inferInsert> = { updatedAt: new Date() };
    if (d.title !== undefined && admin) patch.title = d.title;
    if (d.description !== undefined && admin) patch.description = d.description;
    if (d.category !== undefined && admin) patch.category = d.category;
    if (d.priority !== undefined && admin) patch.priority = d.priority;
    if (d.startAt !== undefined && admin) patch.startAt = parseDate(d.startAt);
    if (d.deadlineAt !== undefined && admin) patch.deadlineAt = parseDate(d.deadlineAt);
    if (d.estimatedMinutes !== undefined && admin) patch.estimatedMinutes = d.estimatedMinutes;
    if (d.completionNotes !== undefined) patch.completionNotes = d.completionNotes;

    let requestedEmployeeIds: string[] | null = null;
    let newlyAssignedIds: string[] = [];
    if (admin && (d.employeeIds !== undefined || d.employeeId !== undefined)) {
      const requested = d.employeeIds?.length ? d.employeeIds : d.employeeId ? [d.employeeId] : [];
      const targets = await activeLinkedEmployees(requested);
      if (!targets) return res.status(400).json({ error: "Tasks can only be assigned to active employees with linked login accounts." });
      requestedEmployeeIds = targets.map((target) => String(target._id));
      patch.employeeId = targets[0]._id;
      patch.taskType = "ASSIGNED";
    }

    if (admin && d.status !== undefined) {
      patch.status = d.status;
      patch.completedAt = d.status === "COMPLETED" ? new Date() : null;
    } else if (!admin && before.taskType === "PERSONAL" && d.status !== undefined) {
      patch.status = d.status;
      patch.completedAt = d.status === "COMPLETED" ? new Date() : null;
    }

    let updated: typeof employeeTasks.$inferSelect = before;
    await db.transaction(async (tx) => {
      if (requestedEmployeeIds) {
        const existing = await tx.select().from(employeeTaskAssignments).where(eq(employeeTaskAssignments.taskId, before._id));
        const oldIds = new Set(existing.map((row) => String(row.employeeId)));
        const nextIds = new Set(requestedEmployeeIds!);
        const removedIds = Array.from(oldIds).filter((id) => !nextIds.has(id));
        newlyAssignedIds = Array.from(nextIds).filter((id) => !oldIds.has(id));
        if (removedIds.length) {
          await tx.delete(employeeTaskAssignments).where(and(
            eq(employeeTaskAssignments.taskId, before._id),
            inArray(employeeTaskAssignments.employeeId, removedIds),
          ));
        }
        if (newlyAssignedIds.length) {
          await tx.insert(employeeTaskAssignments).values(newlyAssignedIds.map((employeeId) => ({
            taskId: before._id, employeeId, assignedByUserId: req.user!.userId, status: "ASSIGNED" as const,
          })));
        }
      }

      if (admin && d.status !== undefined && before.taskType === "ASSIGNED") {
        await tx.update(employeeTaskAssignments).set({
          status: d.status,
          completedAt: d.status === "COMPLETED" ? new Date() : null,
          updatedAt: new Date(),
        }).where(eq(employeeTaskAssignments.taskId, before._id));
      } else if (!admin && before.taskType === "ASSIGNED" && d.status !== undefined) {
        const [assignment] = await tx.select().from(employeeTaskAssignments).where(and(
          eq(employeeTaskAssignments.taskId, before._id),
          eq(employeeTaskAssignments.employeeId, emp!._id),
        )).limit(1);
        if (assignment) {
          await tx.update(employeeTaskAssignments).set({
            status: d.status,
            completedAt: d.status === "COMPLETED" ? new Date() : null,
            updatedAt: new Date(),
          }).where(eq(employeeTaskAssignments._id, assignment._id));
        } else {
          await tx.insert(employeeTaskAssignments).values({
            taskId: before._id, employeeId: emp!._id, assignedByUserId: before.assignedByUserId,
            status: d.status, completedAt: d.status === "COMPLETED" ? new Date() : null,
          });
        }
        const assignments = await tx.select().from(employeeTaskAssignments).where(eq(employeeTaskAssignments.taskId, before._id));
        const allComplete = assignments.length > 0 && assignments.every((row) => row.status === "COMPLETED");
        patch.status = allComplete ? "COMPLETED" : "IN_PROGRESS";
        patch.completedAt = allComplete ? new Date() : null;
      }

      const [row] = await tx.update(employeeTasks).set(patch).where(eq(employeeTasks._id, before._id)).returning();
      updated = row;
      await tx.insert(employeeTaskHistory).values({
        taskId: before._id,
        actorUserId: req.user!.userId,
        action: requestedEmployeeIds ? "ASSIGNEES_UPDATED" : d.status === "COMPLETED" ? "COMPLETED" : d.deadlineAt !== undefined ? "DEADLINE_UPDATED" : "UPDATED",
        beforeValue: {
          status: before.status, priority: before.priority,
          deadlineAt: before.deadlineAt?.toISOString() ?? null,
          employeeId: String(before.employeeId),
        },
        afterValue: {
          status: row.status, priority: row.priority,
          deadlineAt: row.deadlineAt?.toISOString() ?? null,
          employeeId: String(row.employeeId),
          employeeIds: requestedEmployeeIds ?? undefined,
        },
        reason: d.reason || null,
      });
    });

    if (newlyAssignedIds.length) {
      const targets = await db.select().from(employees).where(inArray(employees._id, newlyAssignedIds));
      for (const target of targets) {
        if (target.accountUserId) await notifyUser(
          String(target.accountUserId), "employee_task_assigned", "Task assigned",
          "You have a task: " + updated.title, req.user!.userId, "/employee/dashboard?tab=tasks",
        );
      }
    }
    await logAudit({
      userId: req.user!.userId,
      action: requestedEmployeeIds ? "employee.task.reassign" : "employee.task.update",
      resourceType: "employee_task", resourceId: taskId,
      metadata: { changedFields: Object.keys(d), employeeIds: requestedEmployeeIds ?? undefined },
    });
    const [result] = await shapeEmployeeTasks([updated], emp ? String(emp._id) : undefined);
    return res.json({ task: result });
  } catch (err) { next(err); }
});

router.get("/tasks/:id/history", async (req: AuthedRequest, res, next) => {
  try {
    const [task] = await getDb().select().from(employeeTasks).where(eq(employeeTasks._id, String(req.params.id))).limit(1);
    if (!task) return res.status(404).json({ error: "Task not found." });
    if (req.user!.role !== "ADMIN") {
      const emp = await needEmployee(req, res); if (!emp) return;
      if (!hasPermission(emp.permissions, "task.read.own") || !(await canEmployeeAccessTask(task, emp))) return res.status(404).json({ error: "Task not found." });
    }
    const [history, comments] = await Promise.all([
      getDb().select().from(employeeTaskHistory).where(eq(employeeTaskHistory.taskId, task._id)).orderBy(desc(employeeTaskHistory.createdAt)),
      getDb().select().from(employeeTaskComments).where(eq(employeeTaskComments.taskId, task._id)).orderBy(desc(employeeTaskComments.createdAt)),
    ]);
    return res.json({ history, comments });
  } catch (err) { next(err); }
});
router.post("/tasks/:id/comments", async (req: AuthedRequest, res, next) => {
  try {
    const body = z.object({ body: z.string().trim().min(1).max(3000) }).safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: "Enter a comment." });
    const [task] = await getDb().select().from(employeeTasks).where(eq(employeeTasks._id, String(req.params.id))).limit(1);
    if (!task) return res.status(404).json({ error: "Task not found." });
    if (req.user!.role !== "ADMIN") {
      const emp = await needEmployee(req, res); if (!emp) return;
      if (!hasPermission(emp.permissions, "task.read.own") || !(await canEmployeeAccessTask(task, emp))) return res.status(404).json({ error: "Task not found." });
    }
    const [comment] = await getDb().insert(employeeTaskComments).values({ taskId: task._id, authorUserId: req.user!.userId, body: body.data.body }).returning();
    await logAudit({ userId: req.user!.userId, action: "employee.task.comment", resourceType: "employee_task", resourceId: String(req.params.id) });
    return res.status(201).json({ comment });
  } catch (err) { next(err); }
});

// ----------------------------------------------------------- Private task files
router.get("/tasks/:id/attachments", async (req: AuthedRequest, res, next) => {
  try {
    const taskId = String(req.params.id);
    if (!isValidId(taskId)) return res.status(404).json({ error: "Task not found." });
    const [task] = await getDb().select().from(employeeTasks).where(eq(employeeTasks._id, taskId)).limit(1);
    if (!task) return res.status(404).json({ error: "Task not found." });
    if (req.user!.role !== "ADMIN") {
      const emp = await needEmployee(req, res);
      if (!emp) return;
      if (!hasPermission(emp.permissions, "task.read.own") || !(await canEmployeeAccessTask(task, emp))) {
        return res.status(404).json({ error: "Task not found." });
      }
    }
    const rows = await getDb().select().from(employeeTaskAttachments)
      .where(eq(employeeTaskAttachments.taskId, taskId)).orderBy(desc(employeeTaskAttachments.createdAt));
    return res.json({ attachments: rows.map((a) => ({
      _id: String(a._id), originalFileName: a.originalFileName, mimeType: a.mimeType,
      sizeBytes: a.sizeBytes, uploadedByUserId: String(a.uploadedByUserId), createdAt: a.createdAt,
    })) });
  } catch (err) { next(err); }
});

router.post("/tasks/:id/attachments", privateUpload.single("file"), async (req: AuthedRequest, res, next) => {
  const file = req.file;
  const cleanup = () => { if (file?.path) fs.promises.unlink(file.path).catch(() => {}); };
  try {
    const taskId = String(req.params.id);
    if (!isValidId(taskId)) { cleanup(); return res.status(404).json({ error: "Task not found." }); }
    if (!file) return res.status(400).json({ error: "Choose a PDF or image file (maximum 10 MB)." });
    const ext = path.extname(file.filename).toLowerCase();
    if (!fileMatchesExtension(file.path, ext)) {
      cleanup();
      return res.status(400).json({ error: "The file content does not match its declared type." });
    }
    const [task] = await getDb().select().from(employeeTasks).where(eq(employeeTasks._id, taskId)).limit(1);
    if (!task) { cleanup(); return res.status(404).json({ error: "Task not found." }); }
    if (req.user!.role !== "ADMIN") {
      const emp = await needEmployee(req, res);
      if (!emp) { cleanup(); return; }
      if (!hasPermission(emp.permissions, "task.update.own") || !(await canEmployeeAccessTask(task, emp))) {
        cleanup();
        return res.status(404).json({ error: "Task not found." });
      }
    }
    const originalFileName = path.basename(file.originalname).replace(/[\r\n"]/g, "_").slice(0, 180) || "attachment";
    const [attachment] = await getDb().insert(employeeTaskAttachments).values({
      taskId, uploadedByUserId: req.user!.userId, storedFileName: file.filename,
      originalFileName, mimeType: file.mimetype, sizeBytes: file.size,
    }).returning();
    await getDb().insert(employeeTaskHistory).values({
      taskId, actorUserId: req.user!.userId, action: "ATTACHMENT_ADDED",
      afterValue: { attachmentId: String(attachment._id), fileName: originalFileName, sizeBytes: file.size },
    });
    await logAudit({
      userId: req.user!.userId, action: "employee.task.attachment.add",
      resourceType: "employee_task", resourceId: taskId,
      metadata: { attachmentId: String(attachment._id), fileName: originalFileName, sizeBytes: file.size },
    });
    return res.status(201).json({ attachment: {
      _id: String(attachment._id), originalFileName, mimeType: file.mimetype,
      sizeBytes: file.size, uploadedByUserId: req.user!.userId, createdAt: attachment.createdAt,
    } });
  } catch (err) { cleanup(); next(err); }
});

router.get("/tasks/:id/attachments/:attachmentId", async (req: AuthedRequest, res, next) => {
  try {
    const taskId = String(req.params.id), attachmentId = String(req.params.attachmentId);
    if (!isValidId(taskId) || !isValidId(attachmentId)) return res.status(404).json({ error: "Attachment not found." });
    const [task] = await getDb().select().from(employeeTasks).where(eq(employeeTasks._id, taskId)).limit(1);
    if (!task) return res.status(404).json({ error: "Attachment not found." });
    if (req.user!.role !== "ADMIN") {
      const emp = await needEmployee(req, res);
      if (!emp) return;
      if (!hasPermission(emp.permissions, "task.read.own") || !(await canEmployeeAccessTask(task, emp))) {
        return res.status(404).json({ error: "Attachment not found." });
      }
    }
    const [attachment] = await getDb().select().from(employeeTaskAttachments)
      .where(and(eq(employeeTaskAttachments._id, attachmentId), eq(employeeTaskAttachments.taskId, taskId))).limit(1);
    const full = attachment ? privateFilePath(privateRef(attachment.storedFileName)) : null;
    if (!attachment || !full || !fs.existsSync(full)) return res.status(404).json({ error: "Attachment not found." });
    const safeName = attachment.originalFileName.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "attachment";
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Type", attachment.mimeType);
    res.setHeader("Content-Disposition", 'attachment; filename="' + safeName + '"');
    return res.sendFile(full, { dotfiles: "deny" }, (err) => {
      if (err && !res.headersSent) res.status(404).json({ error: "Attachment not found." });
    });
  } catch (err) { next(err); }
});

router.delete("/tasks/:id/attachments/:attachmentId", async (req: AuthedRequest, res, next) => {
  try {
    const taskId = String(req.params.id), attachmentId = String(req.params.attachmentId);
    if (!isValidId(taskId) || !isValidId(attachmentId)) return res.status(404).json({ error: "Attachment not found." });
    const db = getDb();
    const [attachment] = await db.select().from(employeeTaskAttachments)
      .where(and(eq(employeeTaskAttachments._id, attachmentId), eq(employeeTaskAttachments.taskId, taskId))).limit(1);
    if (!attachment) return res.status(404).json({ error: "Attachment not found." });
    if (req.user!.role !== "ADMIN") {
      if (String(attachment.uploadedByUserId) !== req.user!.userId) return res.status(403).json({ error: "Only the uploader or an Admin can delete this attachment." });
      const emp = await needEmployee(req, res);
      if (!emp) return;
      const [task] = await db.select().from(employeeTasks).where(eq(employeeTasks._id, taskId)).limit(1);
      if (!task || !(await canEmployeeAccessTask(task, emp))) return res.status(404).json({ error: "Attachment not found." });
    }
    const [deleted] = await db.delete(employeeTaskAttachments).where(eq(employeeTaskAttachments._id, attachment._id)).returning();
    const full = privateFilePath(privateRef(attachment.storedFileName));
    if (full) fs.promises.unlink(full).catch(() => {});
    await logAudit({
      userId: req.user!.userId, action: "employee.task.attachment.delete",
      resourceType: "employee_task", resourceId: taskId,
      metadata: { attachmentId, fileName: attachment.originalFileName },
    });
    return res.json({ ok: !!deleted });
  } catch (err) { next(err); }
});

// -------------------------------------------------------------------- Leads
router.get("/leads", async (req: AuthedRequest, res, next) => {
  try {
    const db = getDb();
    if (req.user!.role === "ADMIN") {
      const rows = await db.select().from(leads).orderBy(desc(leads.createdAt)).limit(500);
      return res.json({ leads: rows });
    }
    if (req.user!.role !== "EMPLOYEE") return res.status(403).json({ error: "Insufficient permissions." });
    const emp = await needEmployee(req, res); if (!emp) return;
    const scopes = employeeLeadScope(emp.permissions, req.user!.userId);
    if (!scopes.length) return res.status(403).json({ error: "Lead access is not enabled." });
    const rows = await db.select().from(leads).where(or(...scopes)).orderBy(desc(leads.createdAt)).limit(300);
    return res.json({ leads: rows });
  } catch (err) { next(err); }
});

router.post("/leads", requireRole("EMPLOYEE"), async (req: AuthedRequest, res, next) => {
  try {
    const emp = await needEmployee(req, res); if (!emp) return;
    if (!hasPermission(emp.permissions, "lead.create")) return res.status(403).json({ error: "Lead submission is not enabled for this account." });
    const parsed = leadCreateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Check buyer details and required consent.", issues: parsed.error.flatten() });
    const d = parsed.data;
    const db = getDb();
    const [project] = await db.select().from(projects).where(eq(projects._id, d.projectId)).limit(1);
    if (!project) return res.status(404).json({ error: "Selected project was not found." });
    const phone = cleanPhone(d.clientPhone);
    if (phone.length !== 10 || !/^[6-9]\d{9}$/.test(phone)) return res.status(400).json({ error: "Enter a valid 10-digit Indian mobile number." });
    const windowStart = new Date(Date.now() - DUPLICATE_LEAD_WINDOW_DAYS * 86400000);
    const recent = await db.select({ id: leads._id, clientPhone: leads.clientPhone, submittedById: leads.submittedById, assignedToId: leads.assignedToId })
      .from(leads).where(and(eq(leads.projectId, d.projectId), gte(leads.createdAt, windowStart))).limit(500);
    const duplicate = recent.find((l) => cleanPhone(l.clientPhone) === phone);
    const ownsDuplicate = duplicate && (String(duplicate.submittedById) === req.user!.userId || String(duplicate.assignedToId) === req.user!.userId);
    if (duplicate && !d.confirmDuplicate) return res.status(409).json({
      warning: "DUPLICATE_DETECTED",
      message: "A lead with this phone number for the same project already exists. Review the potential duplicate before confirming a separate submission.",
      ...(ownsDuplicate ? { existingLeadId: String(duplicate.id) } : {}),
    });
    const [lead] = await db.insert(leads).values({
      projectId: d.projectId, submittedById: req.user!.userId, assignedToId: req.user!.userId,
      clientName: d.clientName, clientPhone: phone, clientEmail: d.clientEmail || null,
      contactConsent: d.contactConsent, contactConsentAt: new Date(), consentTextVersion: "employee-lead-v1",
      source: d.source, creatorRole: "EMPLOYEE", stage: "GENERATED",
      notes: d.followUpNotes || null, isDuplicate: !!duplicate,
      budgetRange: d.budgetRange || null, purchaseTimeline: d.purchaseTimeline || null,
      leadTemperature: d.leadTemperature, preferredLocation: d.preferredLocation || null,
      preferredPropertyType: d.preferredPropertyType || null, preferredContactMethod: d.preferredContactMethod,
      siteVisitStatus: d.siteVisitStatus, visitDate: d.visitDate || null, visitTime: d.visitTime || null,
      lastContactAt: parseDate(d.lastContactAt), nextFollowUpAt: parseDate(d.nextFollowUpAt),
      followUpNotes: d.followUpNotes || null, additionalRequirements: d.additionalRequirements || null,
    }).returning();
    await db.insert(leadActivities).values({ leadId: lead._id, cpId: null, actorUserId: req.user!.userId, type: "SYSTEM", content: "Lead submitted by employee", metadata: { employeeId: String(emp._id), leadSource: d.source } });
    if (d.nextFollowUpAt && parseDate(d.nextFollowUpAt)) {
      await db.insert(leadFollowUps).values({ leadId: lead._id, cpId: req.user!.userId, dueAt: parseDate(d.nextFollowUpAt)!, channel: d.preferredContactMethod === "EMAIL" ? "EMAIL" : d.preferredContactMethod === "WHATSAPP" ? "WHATSAPP" : "CALL", note: d.followUpNotes || null });
    }
    const admins = await db.select({ id: users._id }).from(users).where(and(eq(users.role, "ADMIN"), eq(users.disabled, false)));
    await createNotifications(admins.map((a) => String(a.id)), { type: "employee_lead_submitted", title: "Employee lead submitted", message: `${emp.name} submitted a new buyer lead for ${project.name}.`, actorUserId: req.user!.userId, data: { href: "/admin/leads" }, dedupeKey: `employee-lead:${lead._id}` }).catch(() => []);
    await logAudit({ userId: req.user!.userId, action: "employee.lead.submit", resourceType: "lead", resourceId: String(lead._id), metadata: { employeeId: String(emp._id), projectId: d.projectId, duplicateConfirmed: !!duplicate } });
    return res.status(201).json({ lead });
  } catch (err) { next(err); }
});

router.patch("/leads/:id", requireRole("EMPLOYEE"), async (req: AuthedRequest, res, next) => {
  try {
    const parsed = z.object({
      stage: z.enum(["CONTACTED", "INTERESTED", "SITE_VISIT", "NEGOTIATION", "LOST"]).optional(),
      leadTemperature: z.enum(["HOT", "WARM", "COLD"]).optional(),
      nextFollowUpAt: z.string().optional().nullable(),
      followUpNotes: z.string().max(3000).optional(),
      siteVisitStatus: z.enum(["NOT_DISCUSSED", "INTERESTED", "PROPOSED", "CONFIRMED", "COMPLETED", "RESCHEDULED", "CANCELLED"]).optional(),
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid lead update." });
    const emp = await needEmployee(req, res); if (!emp) return;
    const [lead] = await getDb().select().from(leads).where(eq(leads._id, String(req.params.id))).limit(1);
    if (!lead || !canAccessEmployeeLead(emp.permissions, lead, req.user!.userId, "lead.update.own", "lead.update.assigned")) return res.status(404).json({ error: "Lead not found." });
    const d = parsed.data;
    const patch: Partial<typeof leads.$inferInsert> = { updatedAt: new Date() };
    if (d.stage) patch.stage = d.stage;
    if (d.leadTemperature) patch.leadTemperature = d.leadTemperature;
    if (d.nextFollowUpAt !== undefined) patch.nextFollowUpAt = parseDate(d.nextFollowUpAt);
    if (d.followUpNotes !== undefined) patch.followUpNotes = d.followUpNotes;
    if (d.siteVisitStatus) patch.siteVisitStatus = d.siteVisitStatus;
    const [updated] = await getDb().update(leads).set(patch).where(eq(leads._id, lead._id)).returning();
    await getDb().insert(leadActivities).values({ leadId: lead._id, cpId: null, actorUserId: req.user!.userId, type: "NOTE", content: d.followUpNotes || "Employee updated lead details", metadata: { changedFields: Object.keys(d) } });
    await logAudit({ userId: req.user!.userId, action: "employee.lead.update", resourceType: "lead", resourceId: String(req.params.id), metadata: { changedFields: Object.keys(d) } });
    return res.json({ lead: updated });
  } catch (err) { next(err); }
});

router.post("/leads/:id/calls", requireRole("EMPLOYEE"), async (req: AuthedRequest, res, next) => {
  try {
    const parsed = callSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Check call outcome and notes." });
    const emp = await needEmployee(req, res); if (!emp) return;
    if (!hasPermission(emp.permissions, "telecalling.use")) return res.status(403).json({ error: "Telecalling access is not enabled." });
    const db = getDb();
    const [lead] = await db.select().from(leads).where(eq(leads._id, String(req.params.id))).limit(1);
    if (!lead || !canAccessEmployeeLead(emp.permissions, lead, req.user!.userId, "lead.call.own", "lead.call.assigned")) return res.status(404).json({ error: "Lead not found." });
    const d = parsed.data;
    const [activity] = await db.insert(leadActivities).values({
      leadId: lead._id, cpId: null, actorUserId: req.user!.userId, type: "CALL",
      content: `Outcome: ${d.outcome}${d.notes ? " — " + d.notes : ""}`,
      metadata: { outcome: d.outcome, nextFollowUpAt: d.nextFollowUpAt || null, temperature: d.leadTemperature || lead.leadTemperature },
    }).returning();
    if (d.nextFollowUpAt && parseDate(d.nextFollowUpAt)) {
      await db.insert(leadFollowUps).values({ leadId: lead._id, cpId: req.user!.userId, dueAt: parseDate(d.nextFollowUpAt)!, channel: "CALL", note: d.notes || d.outcome });
      await db.update(leads).set({ nextFollowUpAt: parseDate(d.nextFollowUpAt), lastContactAt: new Date(), leadTemperature: d.leadTemperature || lead.leadTemperature }).where(eq(leads._id, lead._id));
    } else {
      await db.update(leads).set({ lastContactAt: new Date(), ...(d.leadTemperature ? { leadTemperature: d.leadTemperature } : {}) }).where(eq(leads._id, lead._id));
    }
    await logAudit({ userId: req.user!.userId, action: "employee.call.log", resourceType: "lead", resourceId: String(lead._id), metadata: { employeeId: String(emp._id), outcome: d.outcome } });
    return res.status(201).json({ activity });
  } catch (err) { next(err); }
});

router.get("/leads/:id/activities", async (req: AuthedRequest, res, next) => {
  try {
    const [lead] = await getDb().select().from(leads).where(eq(leads._id, String(req.params.id))).limit(1);
    if (!lead) return res.status(404).json({ error: "Lead not found." });
    if (req.user!.role === "EMPLOYEE") {
      const emp = await needEmployee(req, res); if (!emp) return;
      if (!canAccessEmployeeLead(emp.permissions, lead, req.user!.userId, "lead.read.own", "lead.read.assigned")) return res.status(404).json({ error: "Lead not found." });
    } else if (req.user!.role !== "ADMIN") return res.status(403).json({ error: "Insufficient permissions." });
    const [activities, followUps] = await Promise.all([
      getDb().select().from(leadActivities).where(eq(leadActivities.leadId, lead._id)).orderBy(desc(leadActivities.createdAt)),
      req.user!.role === "ADMIN"
        ? getDb().select().from(leadFollowUps).where(eq(leadFollowUps.leadId, lead._id)).orderBy(desc(leadFollowUps.dueAt))
        : getDb().select().from(leadFollowUps).where(and(eq(leadFollowUps.leadId, lead._id), eq(leadFollowUps.cpId, req.user!.userId))).orderBy(desc(leadFollowUps.dueAt)),
    ]);
    return res.json({ activities, followUps });
  } catch (err) { next(err); }
});

router.post("/leads/:id/followups", async (req: AuthedRequest, res, next) => {
  try {
    const parsed = followUpSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Enter a valid follow-up date and channel." });
    const db = getDb();
    const [lead] = await db.select().from(leads).where(eq(leads._id, String(req.params.id))).limit(1);
    if (!lead) return res.status(404).json({ error: "Lead not found." });
    if (req.user!.role === "EMPLOYEE") {
      const emp = await needEmployee(req, res); if (!emp) return;
      if (!canAccessEmployeeLead(emp.permissions, lead, req.user!.userId, "followup.create.own", "followup.create.assigned")) return res.status(404).json({ error: "Lead not found." });
    } else if (req.user!.role !== "ADMIN") return res.status(403).json({ error: "Insufficient permissions." });
    const dueAt = parseDate(parsed.data.dueAt);
    if (!dueAt) return res.status(400).json({ error: "Enter a valid follow-up date." });
    const [followUp] = await db.insert(leadFollowUps).values({ leadId: lead._id, cpId: req.user!.userId, dueAt, channel: parsed.data.channel, note: parsed.data.note || null }).returning();
    await db.update(leads).set({ nextFollowUpAt: dueAt }).where(eq(leads._id, lead._id));
    await db.insert(leadActivities).values({ leadId: lead._id, cpId: null, actorUserId: req.user!.userId, type: "FOLLOW_UP", content: `Follow-up scheduled for ${dueAt.toISOString()}`, metadata: { channel: parsed.data.channel } });
    await logAudit({ userId: req.user!.userId, action: "employee.lead.followup.create", resourceType: "lead", resourceId: String(lead._id), metadata: { dueAt: dueAt.toISOString(), channel: parsed.data.channel } });
    return res.status(201).json({ followUp });
  } catch (err) { next(err); }
});

// --------------------------------------------------------------- Site visits
router.get("/site-visits", async (req: AuthedRequest, res, next) => {
  try {
    let conditions = [];
    if (req.user!.role === "EMPLOYEE") {
      const emp = await needEmployee(req, res); if (!emp) return;
      if (!hasPermission(emp.permissions, "sitevisit.read.own")) return res.status(403).json({ error: "Site visit access is not enabled." });
      conditions.push(eq(siteVisits.responsibleUserId, req.user!.userId));
    }
    else if (req.user!.role === "ADMIN") {
      if (typeof req.query.employeeId === "string" && isValidId(req.query.employeeId)) conditions.push(eq(siteVisits.responsibleUserId, req.query.employeeId));
    } else return res.status(403).json({ error: "Insufficient permissions." });
    const visits = await getDb().select({ visit: siteVisits, projectName: projects.name, clientName: leads.clientName, clientPhone: leads.clientPhone })
      .from(siteVisits).leftJoin(projects, eq(siteVisits.projectId, projects._id)).leftJoin(leads, eq(siteVisits.leadId, leads._id))
      .where(conditions.length ? and(...conditions) : undefined).orderBy(desc(siteVisits.scheduledAt)).limit(300);
    return res.json({ siteVisits: visits.map((r) => ({ ...r.visit, projectName: r.projectName, clientName: r.clientName, clientPhone: r.clientPhone })) });
  } catch (err) { next(err); }
});
router.post("/site-visits", requireRole("EMPLOYEE"), async (req: AuthedRequest, res, next) => {
  try {
    const parsed = siteVisitCreateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Choose a lead and a valid site-visit time." });
    const db = getDb();
    const emp = await needEmployee(req, res); if (!emp) return;
    if (!hasPermission(emp.permissions, "sitevisit.create")) return res.status(403).json({ error: "Site visit scheduling is not enabled." });
    const [lead] = await db.select().from(leads).where(and(eq(leads._id, parsed.data.leadId), or(eq(leads.submittedById, req.user!.userId), eq(leads.assignedToId, req.user!.userId))!)).limit(1);
    if (!lead || !canAccessEmployeeLead(emp.permissions, lead, req.user!.userId, "lead.read.own", "lead.read.assigned")) return res.status(404).json({ error: "Lead not found." });
    const scheduledAt = parseDate(parsed.data.scheduledAt);
    if (!scheduledAt || scheduledAt < new Date()) return res.status(400).json({ error: "Choose a future site-visit date and time." });
    const [visit] = await db.insert(siteVisits).values({
      leadId: lead._id, projectId: lead.projectId, responsibleUserId: req.user!.userId,
      scheduledAt, timeSlot: parsed.data.timeSlot || null, contactNumber: parsed.data.contactNumber || lead.clientPhone,
      status: "SCHEDULED", reportNotes: parsed.data.notes || null,
    }).returning();
    await db.update(leads).set({ stage: "SITE_VISIT", siteVisitStatus: "PROPOSED", visitDate: dateInIndia(scheduledAt), visitTime: scheduledAt.toISOString().slice(11, 16) }).where(eq(leads._id, lead._id));
    await db.insert(leadActivities).values({ leadId: lead._id, cpId: null, actorUserId: req.user!.userId, type: "SITE_VISIT", content: `Site visit proposed for ${scheduledAt.toISOString()}`, metadata: { siteVisitId: String(visit._id) } });
    const admins = await db.select({ id: users._id }).from(users).where(and(eq(users.role, "ADMIN"), eq(users.disabled, false)));
    await createNotifications(admins.map((a) => String(a.id)), { type: "employee_site_visit_proposed", title: "Site visit proposed", message: `${emp.name} proposed a site visit for ${lead.clientName}.`, actorUserId: req.user!.userId, data: { href: "/admin/meetings" }, dedupeKey: `employee-site-visit:${visit._id}` }).catch(() => []);
    await logAudit({ userId: req.user!.userId, action: "employee.sitevisit.create", resourceType: "site_visit", resourceId: String(visit._id), metadata: { leadId: String(lead._id), projectId: String(lead.projectId) } });
    return res.status(201).json({ siteVisit: visit });
  } catch (err) { next(err); }
});
router.patch("/site-visits/:id", async (req: AuthedRequest, res, next) => {
  try {
    const d = z.object({ status: z.enum(["SCHEDULED", "CONFIRMED", "COMPLETED", "CANCELLED", "NO_SHOW"]).optional(), scheduledAt: z.string().optional(), reportNotes: z.string().max(3000).optional(), timeSlot: z.string().max(100).optional() }).safeParse(req.body);
    if (!d.success) return res.status(400).json({ error: "Invalid site visit update." });
    const [visit] = await getDb().select().from(siteVisits).where(eq(siteVisits._id, String(req.params.id))).limit(1);
    if (!visit) return res.status(404).json({ error: "Site visit not found." });
    if (req.user!.role === "EMPLOYEE") {
      const emp = await needEmployee(req, res); if (!emp) return;
      if (!hasPermission(emp.permissions, "sitevisit.update.own") || String(visit.responsibleUserId) !== req.user!.userId) return res.status(404).json({ error: "Site visit not found." });
    } else if (req.user!.role !== "ADMIN") return res.status(403).json({ error: "Insufficient permissions." });
    const patch: Partial<typeof siteVisits.$inferInsert> = {};
    if (d.data.status) patch.status = d.data.status;
    if (d.data.scheduledAt) { const date = parseDate(d.data.scheduledAt); if (!date) return res.status(400).json({ error: "Invalid schedule date." }); patch.scheduledAt = date; }
    if (d.data.reportNotes !== undefined) patch.reportNotes = d.data.reportNotes;
    if (d.data.timeSlot !== undefined) patch.timeSlot = d.data.timeSlot;
    const [updated] = await getDb().update(siteVisits).set(patch).where(eq(siteVisits._id, visit._id)).returning();
    if (visit.leadId && d.data.status) {
      const map = { CONFIRMED: "CONFIRMED", COMPLETED: "COMPLETED", CANCELLED: "CANCELLED", SCHEDULED: "PROPOSED", NO_SHOW: "CANCELLED" } as const;
      await getDb().update(leads).set({ siteVisitStatus: map[d.data.status] }).where(eq(leads._id, visit.leadId));
    }
    await logAudit({ userId: req.user!.userId, action: "employee.sitevisit.update", resourceType: "site_visit", resourceId: String(req.params.id), metadata: { changedFields: Object.keys(d.data) } });
    return res.json({ siteVisit: updated });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------- Attendance
router.get("/attendance", async (req: AuthedRequest, res, next) => {
  try {
    const db = getDb();
    let rows;
    if (req.user!.role === "ADMIN") {
      const employeeId = typeof req.query.employeeId === "string" ? req.query.employeeId : "";
      rows = await db.select().from(employeeAttendance)
        .where(employeeId && isValidId(employeeId) ? eq(employeeAttendance.employeeId, employeeId) : undefined)
        .orderBy(desc(employeeAttendance.attendanceDate)).limit(500);
    } else if (req.user!.role === "EMPLOYEE") {
      const emp = await needEmployee(req, res); if (!emp) return;
      if (!hasPermission(emp.permissions, "attendance.read.own")) return res.status(403).json({ error: "Attendance access is not enabled." });
      rows = await db.select().from(employeeAttendance).where(eq(employeeAttendance.employeeId, emp._id)).orderBy(desc(employeeAttendance.attendanceDate)).limit(100);
    } else return res.status(403).json({ error: "Insufficient permissions." });
    return res.json({ attendance: rows });
  } catch (err) { next(err); }
});
router.post("/attendance/check-in", requireRole("EMPLOYEE"), async (req: AuthedRequest, res, next) => {
  try {
    const emp = await needEmployee(req, res); if (!emp) return;
    if (!hasPermission(emp.permissions, "attendance.checkin")) return res.status(403).json({ error: "Check-in is not enabled." });
    const db = getDb(), day = dateInIndia(), now = new Date();
    const [existing] = await db.select().from(employeeAttendance).where(and(eq(employeeAttendance.employeeId, emp._id), eq(employeeAttendance.attendanceDate, day))).limit(1);
    if (existing?.status === "ON_LEAVE" || existing?.status === "HOLIDAY") return res.status(409).json({ error: "Attendance is marked as approved leave or holiday for today." });
    if (existing?.checkInAt) return res.status(409).json({ error: "Today's attendance has already been checked in." });
    let row;
    if (existing) [row] = await db.update(employeeAttendance).set({ status: "PRESENT", checkInAt: now, checkOutAt: null, workingMinutes: null, updatedAt: now }).where(eq(employeeAttendance._id, existing._id)).returning();
    else [row] = await db.insert(employeeAttendance).values({ employeeId: emp._id, attendanceDate: day, status: "PRESENT", checkInAt: now, updatedAt: now }).returning();
    await logAudit({ userId: req.user!.userId, action: "employee.attendance.checkin", resourceType: "attendance", resourceId: String(row._id), metadata: { date: day } });
    return res.status(201).json({ attendance: row });
  } catch (err) { next(err); }
});
router.post("/attendance/check-out", requireRole("EMPLOYEE"), async (req: AuthedRequest, res, next) => {
  try {
    const emp = await needEmployee(req, res); if (!emp) return;
    if (!hasPermission(emp.permissions, "attendance.checkout")) return res.status(403).json({ error: "Check-out is not enabled." });
    const db = getDb(), day = dateInIndia(), now = new Date();
    const [existing] = await db.select().from(employeeAttendance).where(and(eq(employeeAttendance.employeeId, emp._id), eq(employeeAttendance.attendanceDate, day))).limit(1);
    if (!existing?.checkInAt) return res.status(400).json({ error: "Check in before checking out." });
    if (existing.checkOutAt) return res.status(409).json({ error: "Today's attendance has already been checked out." });
    const minutes = Math.max(0, Math.round((now.getTime() - existing.checkInAt.getTime()) / 60000));
    const [row] = await db.update(employeeAttendance).set({ checkOutAt: now, workingMinutes: minutes, updatedAt: now }).where(eq(employeeAttendance._id, existing._id)).returning();
    await logAudit({ userId: req.user!.userId, action: "employee.attendance.checkout", resourceType: "attendance", resourceId: String(row._id), metadata: { date: day, workingMinutes: minutes } });
    return res.json({ attendance: row });
  } catch (err) { next(err); }
});
router.patch("/attendance/:id", requireRole("ADMIN"), async (req: AuthedRequest, res, next) => {
  try {
    if (!isValidId(String(req.params.id))) return res.status(404).json({ error: "Attendance record not found." });
    const parsed = attendanceCorrectionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "A correction reason is required.", issues: parsed.error.flatten() });
    const db = getDb();
    const [before] = await db.select().from(employeeAttendance).where(eq(employeeAttendance._id, String(req.params.id))).limit(1);
    if (!before) return res.status(404).json({ error: "Attendance record not found." });
    const d = parsed.data;
    const checkIn = d.checkInAt !== undefined ? parseDate(d.checkInAt) : before.checkInAt;
    const checkOut = d.checkOutAt !== undefined ? parseDate(d.checkOutAt) : before.checkOutAt;
    const minutes = checkIn && checkOut ? Math.max(0, Math.round((checkOut.getTime() - checkIn.getTime()) / 60000)) : null;
    const [row] = await db.update(employeeAttendance).set({
      ...(d.status ? { status: d.status } : {}), ...(d.notes !== undefined ? { notes: d.notes } : {}),
      correctionReason: d.correctionReason, correctedByUserId: req.user!.userId,
      ...(d.checkInAt !== undefined ? { checkInAt: checkIn } : {}),
      ...(d.checkOutAt !== undefined ? { checkOutAt: checkOut } : {}),
      workingMinutes: minutes, updatedAt: new Date(),
    }).where(eq(employeeAttendance._id, before._id)).returning();
    await logAudit({ userId: req.user!.userId, action: "employee.attendance.correct", resourceType: "attendance", resourceId: String(req.params.id), metadata: { before: { status: before.status, checkInAt: before.checkInAt?.toISOString() ?? null, checkOutAt: before.checkOutAt?.toISOString() ?? null }, after: { status: row.status, checkInAt: row.checkInAt?.toISOString() ?? null, checkOutAt: row.checkOutAt?.toISOString() ?? null }, reason: d.correctionReason } });
    return res.json({ attendance: row });
  } catch (err) { next(err); }
});

// --------------------------------------------------------- Audit / activity
router.get("/audit-logs", requireRole("ADMIN"), async (req: AuthedRequest, res, next) => {
  try {
    const db = getDb();
    const employeeId = typeof req.query.employeeId === "string" ? req.query.employeeId : "";
    let employeeResourceIds: string[] = [];
    let metadataEmployeeId: string | null = null;
    if (employeeId) {
      if (!isValidId(employeeId)) return res.status(400).json({ error: "Invalid employee ID." });
      const [emp] = await db.select().from(employees).where(eq(employees._id, employeeId)).limit(1);
      if (!emp) return res.status(404).json({ error: "Employee not found." });
      metadataEmployeeId = String(emp._id);
      employeeResourceIds = [String(emp._id)];
      if (emp.accountUserId) employeeResourceIds.push(String(emp.accountUserId));
      const [tasks, attendanceRows, salaries, visits, relatedLeads] = await Promise.all([
        db.select({ id: employeeTasks._id }).from(employeeTasks).where(eq(employeeTasks.employeeId, emp._id)),
        db.select({ id: employeeAttendance._id }).from(employeeAttendance).where(eq(employeeAttendance.employeeId, emp._id)),
        db.select({ id: employeeSalaryRecords._id }).from(employeeSalaryRecords).where(eq(employeeSalaryRecords.employeeId, emp._id)),
        emp.accountUserId ? db.select({ id: siteVisits._id }).from(siteVisits).where(eq(siteVisits.responsibleUserId, emp.accountUserId)) : Promise.resolve([]),
        emp.accountUserId ? db.select({ id: leads._id }).from(leads).where(or(eq(leads.submittedById, emp.accountUserId), eq(leads.assignedToId, emp.accountUserId))) : Promise.resolve([]),
      ]);
      employeeResourceIds.push(...tasks.map((r) => String(r.id)), ...attendanceRows.map((r) => String(r.id)), ...salaries.map((r) => String(r.id)), ...visits.map((r) => String(r.id)), ...relatedLeads.map((r) => String(r.id)));
    }
    const conditions = [like(auditLogs.action, "employee.%")];
    if (metadataEmployeeId) {
      conditions.push(or(inArray(auditLogs.resourceId, employeeResourceIds), sql`${auditLogs.metadata}->>'employeeId' = ${metadataEmployeeId}`)!);
    }
    const parsedLimit = typeof req.query.limit === "string" ? Number(req.query.limit) : 100;
    const limit = Number.isInteger(parsedLimit) ? Math.min(250, Math.max(1, parsedLimit)) : 100;
    const rows = await db.select({ log: auditLogs, actorName: users.name, actorEmail: users.email })
      .from(auditLogs).leftJoin(users, eq(auditLogs.userId, users._id))
      .where(and(...conditions)).orderBy(desc(auditLogs.createdAt)).limit(limit);
    return res.json({ auditLogs: rows.map((r) => ({ ...r.log, actorName: r.actorName, actorEmail: r.actorEmail })) });
  } catch (err) { next(err); }
});

router.get("/performance", requireRole("ADMIN"), async (req: AuthedRequest, res, next) => {
  try {
    const db = getDb();
    const fromDate = typeof req.query.from === "string" ? parseDate(req.query.from) : null;
    const toDate = typeof req.query.to === "string" ? parseDate(req.query.to) : null;
    if ((req.query.from && !fromDate) || (req.query.to && !toDate)) return res.status(400).json({ error: "Invalid date filter." });
    if (fromDate && toDate && fromDate > toDate) return res.status(400).json({ error: "Start date must be before end date." });
    const department = typeof req.query.department === "string" ? req.query.department : "";
    const employeeFilter = typeof req.query.employeeId === "string" ? req.query.employeeId : "";
    const [employeeRows, taskRows, taskAssignmentRows, leadRows, callRows, visitRows, attendanceRows] = await Promise.all([
      db.select().from(employees).orderBy(employees.name),
      db.select().from(employeeTasks),
      db.select().from(employeeTaskAssignments),
      db.select().from(leads),
      db.select().from(leadActivities).where(eq(leadActivities.type, "CALL")),
      db.select().from(siteVisits),
      db.select().from(employeeAttendance),
    ]);
    const inRange = (date: Date | null | undefined) => !!date && (!fromDate || date >= fromDate) && (!toDate || date <= toDate);
    const rows = employeeRows.filter((e) =>
      (!department || e.department === department) && (!employeeFilter || String(e._id) === employeeFilter)
    ).map((emp) => {
      const userId = emp.accountUserId ? String(emp.accountUserId) : "";
      const myAssignments = taskAssignmentRows.filter((assignment) => String(assignment.employeeId) === String(emp._id));
      const assignmentByTask = new Map(myAssignments.map((assignment) => [String(assignment.taskId), assignment]));
      const assignedTaskIds = new Set(myAssignments.map((assignment) => String(assignment.taskId)));
      const taskItems = taskRows.filter((task) => String(task.employeeId) === String(emp._id) || assignedTaskIds.has(String(task._id)));
      const statusForEmployee = (task: typeof employeeTasks.$inferSelect) => assignmentByTask.get(String(task._id))?.status ?? task.status;
      const completionTimeForEmployee = (task: typeof employeeTasks.$inferSelect) => assignmentByTask.get(String(task._id))?.completedAt ?? task.completedAt ?? task.updatedAt;
      const myLeads = leadRows.filter((l) => userId && (String(l.submittedById) === userId || String(l.assignedToId) === userId));
      const calls = callRows.filter((c) => userId && String(c.actorUserId ?? "") === userId && inRange(c.createdAt) && myLeads.some((l) => String(l._id) === String(c.leadId)));
      const visits = visitRows.filter((v) => userId && String(v.responsibleUserId ?? "") === userId && inRange(v.scheduledAt));
      const attendance = attendanceRows.filter((a) => String(a.employeeId) === String(emp._id) && (!fromDate || a.attendanceDate >= dateInIndia(fromDate)) && (!toDate || a.attendanceDate <= dateInIndia(toDate)));
      const submitted = myLeads.filter((l) => String(l.submittedById) === userId && inRange(l.createdAt));
      const completedTasks = taskItems.filter((task) => statusForEmployee(task) === "COMPLETED" && inRange(completionTimeForEmployee(task)));
      const overdueTasks = taskItems.filter((task) => task.deadlineAt && task.deadlineAt < new Date() && !["COMPLETED", "CANCELLED"].includes(statusForEmployee(task)) && inRange(task.createdAt));
      return {
        employeeId: String(emp._id), employeeCode: emp.employeeCode, name: emp.name,
        department: emp.department, designation: emp.title, recruitmentSource: emp.recruitmentSource,
        status: emp.status, accountLinked: !!emp.accountUserId,
        tasksCompleted: completedTasks.length, tasksOverdue: overdueTasks.length,
        tasksOpen: taskItems.filter((task) => !["COMPLETED", "CANCELLED"].includes(statusForEmployee(task))).length,
        leadsSubmitted: submitted.length, leadsAssigned: myLeads.filter((l) => String(l.assignedToId) === userId && inRange(l.createdAt)).length,
        callsLogged: calls.length, siteVisitsScheduled: visits.length,
        siteVisitsCompleted: visits.filter((v) => v.status === "COMPLETED").length,
        attendancePresentDays: attendance.filter((a) => a.status === "PRESENT").length,
      };
    });
    return res.json({ metrics: rows, definitions: {
      tasksCompleted: "Tasks marked completed during the selected date range, using the completion/update timestamp.",
      tasksOverdue: "Open tasks past their deadline at the time this report is generated; filtered by task creation date.",
      leadsSubmitted: "Central CRM leads submitted by the employee in the date range.",
      leadsAssigned: "Central CRM leads assigned to the employee in the date range.",
      callsLogged: "Call attempts recorded in the lead activity timeline, not calls placed or successfully connected by Truvi.",
      siteVisitsCompleted: "Assigned site visits marked COMPLETED in the selected schedule-date range.",
      attendancePresentDays: "Attendance dates explicitly marked PRESENT; unmarked dates are not counted as absent.",
    } });
  } catch (err) { next(err); }
});

// -------------------------------------------------------------------- Leave requests
router.get("/leave-requests", async (req: AuthedRequest, res, next) => {
  try {
    const db = getDb();
    if (req.user!.role === "ADMIN") {
      const status = typeof req.query.status === "string" ? req.query.status : "";
      const rows = await db.select({
        request: employeeLeaveRequests, employeeName: employees.name,
        employeeCode: employees.employeeCode, department: employees.department,
      }).from(employeeLeaveRequests)
        .innerJoin(employees, eq(employeeLeaveRequests.employeeId, employees._id))
        .where(status ? eq(employeeLeaveRequests.status, status as typeof employeeLeaveRequests.$inferSelect.status) : undefined)
        .orderBy(desc(employeeLeaveRequests.createdAt)).limit(500);
      return res.json({ leaveRequests: rows.map((row) => ({
        ...row.request, employeeName: row.employeeName,
        employeeCode: row.employeeCode, department: row.department,
      })) });
    }
    if (req.user!.role !== "EMPLOYEE") return res.status(403).json({ error: "Insufficient permissions." });
    const emp = await needEmployee(req, res); if (!emp) return;
    if (!hasPermission(emp.permissions, "leave.read.own")) return res.status(403).json({ error: "Leave-request access is not enabled." });
    const rows = await db.select().from(employeeLeaveRequests)
      .where(eq(employeeLeaveRequests.employeeId, emp._id))
      .orderBy(desc(employeeLeaveRequests.createdAt)).limit(200);
    return res.json({ leaveRequests: rows });
  } catch (err) { next(err); }
});

router.post("/leave-requests", requireRole("EMPLOYEE"), async (req: AuthedRequest, res, next) => {
  try {
    const emp = await needEmployee(req, res); if (!emp) return;
    if (!hasPermission(emp.permissions, "leave.request.own")) return res.status(403).json({ error: "Leave requests are not enabled for this account." });
    const parsed = leaveCreateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Enter the leave type, dates, and reason.", issues: parsed.error.flatten() });
    const d = parsed.data;
    if (d.endDate < d.startDate) return res.status(400).json({ error: "End date cannot be before the start date." });
    if (d.startDate < dateInIndia()) return res.status(400).json({ error: "Leave requests must start today or in the future. Ask Admin for retrospective corrections." });
    const totalDays = inclusiveCalendarDays(d.startDate, d.endDate);
    if (totalDays < 1 || totalDays > 90) return res.status(400).json({ error: "A leave request must be between 1 and 90 calendar days." });
    const db = getDb();
    const existing = await db.select().from(employeeLeaveRequests)
      .where(and(eq(employeeLeaveRequests.employeeId, emp._id), inArray(employeeLeaveRequests.status, ["PENDING", "APPROVED"])));
    if (existing.some((row) => dateRangesOverlap(d.startDate, d.endDate, row.startDate, row.endDate))) {
      return res.status(409).json({ error: "These dates overlap an existing pending or approved leave request." });
    }
    const [request] = await db.insert(employeeLeaveRequests).values({
      employeeId: emp._id, requestedByUserId: req.user!.userId,
      leaveType: d.leaveType, startDate: d.startDate, endDate: d.endDate,
      totalDays, reason: d.reason, status: "PENDING",
    }).returning();
    const admins = await db.select({ id: users._id }).from(users)
      .where(and(eq(users.role, "ADMIN"), eq(users.disabled, false)));
    await createNotifications(admins.map((row) => String(row.id)), {
      type: "employee_leave_requested", title: "Employee leave request",
      message: emp.name + " requested " + totalDays + " day(s) of leave (" + d.startDate + " to " + d.endDate + ").",
      actorUserId: req.user!.userId, data: { href: "/admin/employees?tab=leave" },
      dedupeKey: "employee-leave-request:" + String(request._id),
    }).catch(() => []);
    await logAudit({
      userId: req.user!.userId, action: "employee.leave.request",
      resourceType: "employee_leave_request", resourceId: String(request._id),
      metadata: { employeeId: String(emp._id), leaveType: d.leaveType, startDate: d.startDate, endDate: d.endDate, totalDays },
    });
    return res.status(201).json({ leaveRequest: request });
  } catch (err) { next(err); }
});

router.patch("/leave-requests/:id", async (req: AuthedRequest, res, next) => {
  try {
    const requestId = String(req.params.id);
    if (!isValidId(requestId)) return res.status(404).json({ error: "Leave request not found." });
    const parsed = leaveReviewSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Choose a valid leave decision." });
    const db = getDb();
    const [before] = await db.select().from(employeeLeaveRequests).where(eq(employeeLeaveRequests._id, requestId)).limit(1);
    if (!before) return res.status(404).json({ error: "Leave request not found." });
    const admin = req.user!.role === "ADMIN";
    if (!admin) {
      if (req.user!.role !== "EMPLOYEE" || String(before.requestedByUserId) !== req.user!.userId) {
        return res.status(404).json({ error: "Leave request not found." });
      }
      const emp = await needEmployee(req, res); if (!emp) return;
      if (!hasPermission(emp.permissions, "leave.request.own") || before.status !== "PENDING" || parsed.data.status !== "CANCELLED") {
        return res.status(403).json({ error: "You can only cancel your own pending leave request." });
      }
    } else if (before.status !== "PENDING" || parsed.data.status === "CANCELLED") {
      return res.status(409).json({ error: "Only pending requests can be approved or rejected by Admin." });
    }
    const [employee] = await db.select().from(employees).where(eq(employees._id, before.employeeId)).limit(1);
    if (!employee) return res.status(404).json({ error: "Employee not found." });

    if (admin && parsed.data.status === "APPROVED") {
      const dayAfterEnd = new Date(before.endDate + "T00:00:00.000Z");
      dayAfterEnd.setUTCDate(dayAfterEnd.getUTCDate() + 1);
      const existingAttendance = await db.select().from(employeeAttendance)
        .where(and(
          eq(employeeAttendance.employeeId, before.employeeId),
          gte(employeeAttendance.attendanceDate, before.startDate),
          lt(employeeAttendance.attendanceDate, dayAfterEnd.toISOString().slice(0, 10)),
        ));
      if (existingAttendance.some((row) => row.checkInAt || row.status === "PRESENT" || row.status === "HALF_DAY")) {
        return res.status(409).json({ error: "Attendance already records work on one or more requested days. Resolve that conflict before approving leave." });
      }
    }

    const [updated] = await db.transaction(async (tx) => {
      const [row] = await tx.update(employeeLeaveRequests).set({
        status: parsed.data.status, reviewNotes: parsed.data.reviewNotes || null,
        reviewedByUserId: admin ? req.user!.userId : null,
        reviewedAt: admin ? new Date() : null, updatedAt: new Date(),
      }).where(and(eq(employeeLeaveRequests._id, before._id), eq(employeeLeaveRequests.status, "PENDING"))).returning();
      if (!row) throw new Error("This leave request was already reviewed. Refresh and try again.");

      if (admin && parsed.data.status === "APPROVED") {
        const start = new Date(before.startDate + "T00:00:00.000Z");
        const end = new Date(before.endDate + "T00:00:00.000Z");
        for (const day = new Date(start); day <= end; day.setUTCDate(day.getUTCDate() + 1)) {
          const dateKey = day.toISOString().slice(0, 10);
          const [existing] = await tx.select().from(employeeAttendance).where(and(
            eq(employeeAttendance.employeeId, before.employeeId),
            eq(employeeAttendance.attendanceDate, dateKey),
          )).limit(1);
          if (existing?.status === "HOLIDAY") continue;
          if (existing) {
            await tx.update(employeeAttendance).set({
              status: "ON_LEAVE", notes: "Approved leave request " + String(before._id), updatedAt: new Date(),
            }).where(eq(employeeAttendance._id, existing._id));
          } else {
            await tx.insert(employeeAttendance).values({
              employeeId: before.employeeId, attendanceDate: dateKey, status: "ON_LEAVE",
              notes: "Approved leave request " + String(before._id), correctedByUserId: req.user!.userId,
            });
          }
        }
      }
      return [row];
    });

    if (employee.accountUserId) {
      await notifyUser(
        String(employee.accountUserId), "employee_leave_decision",
        "Leave request " + updated.status.toLowerCase(),
        "Your leave request for " + updated.startDate + " to " + updated.endDate + " was " + updated.status.toLowerCase() + (updated.reviewNotes ? ". " + updated.reviewNotes : "."),
        req.user!.userId, "/employee/dashboard?tab=leave",
      );
    }
    await logAudit({
      userId: req.user!.userId, action: "employee.leave." + updated.status.toLowerCase(),
      resourceType: "employee_leave_request", resourceId: requestId,
      metadata: { employeeId: String(employee._id), startDate: updated.startDate, endDate: updated.endDate, reviewNotes: updated.reviewNotes },
    });
    return res.json({ leaveRequest: updated });
  } catch (err) { next(err); }
});

// ------------------------------------------------------------------ Salaries
router.get("/salaries", async (req: AuthedRequest, res, next) => {
  try {
    const db = getDb();
    if (req.user!.role === "ADMIN") {
      const rows = await db.select({ salary: employeeSalaryRecords, employeeName: employees.name, employeeCode: employees.employeeCode })
        .from(employeeSalaryRecords).innerJoin(employees, eq(employeeSalaryRecords.employeeId, employees._id)).orderBy(desc(employeeSalaryRecords.monthKey)).limit(500);
      return res.json({ salaries: rows.map((r) => ({ ...r.salary, employeeName: r.employeeName, employeeCode: r.employeeCode })) });
    }
    if (req.user!.role !== "EMPLOYEE") return res.status(403).json({ error: "Insufficient permissions." });
    const emp = await needEmployee(req, res); if (!emp) return;
    if (!hasPermission(emp.permissions, "salary.read.own")) return res.status(403).json({ error: "Salary access is not enabled." });
    const rows = await db.select().from(employeeSalaryRecords).where(eq(employeeSalaryRecords.employeeId, emp._id)).orderBy(desc(employeeSalaryRecords.monthKey)).limit(36);
    return res.json({ salaries: rows.map((r) => ({
      _id: String(r._id), employeeId: String(r.employeeId), monthKey: r.monthKey,
      grossSalary: r.grossSalary, allowances: r.allowances, deductions: r.deductions,
      netPayable: r.netPayable, status: r.status,
      paymentDate: r.status === "PAID" ? r.paymentDate : null,
      paymentReference: r.status === "PAID" ? r.paymentReference : null,
    })) });
  } catch (err) { next(err); }
});
router.post("/salaries", requireRole("ADMIN"), async (req: AuthedRequest, res, next) => {
  try {
    const parsed = salaryCreateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Check payroll fields.", issues: parsed.error.flatten() });
    const d = parsed.data, db = getDb();
    const [emp] = await db.select().from(employees).where(eq(employees._id, d.employeeId)).limit(1);
    if (!emp) return res.status(404).json({ error: "Employee not found." });
    const net = roundMoney(d.grossSalary + d.allowances - d.deductions);
    if (net < 0) return res.status(400).json({ error: "Deductions cannot exceed gross salary plus allowances." });
    const [existing] = await db.select({ id: employeeSalaryRecords._id }).from(employeeSalaryRecords).where(and(eq(employeeSalaryRecords.employeeId, emp._id), eq(employeeSalaryRecords.monthKey, d.monthKey))).limit(1);
    if (existing) return res.status(409).json({ error: "A payroll record already exists for this employee and month." });
    const [record] = await db.insert(employeeSalaryRecords).values({
      employeeId: emp._id, monthKey: d.monthKey, grossSalary: d.grossSalary, allowances: d.allowances,
      deductions: d.deductions, netPayable: net, status: "DRAFT", notes: d.notes || null, createdByUserId: req.user!.userId,
    }).returning();
    await logAudit({ userId: req.user!.userId, action: "employee.salary.create", resourceType: "employee_salary", resourceId: String(record._id), metadata: { employeeId: String(emp._id), monthKey: d.monthKey, netPayable: net } });
    return res.status(201).json({ salary: record });
  } catch (err) { next(err); }
});
router.patch("/salaries/:id", requireRole("ADMIN"), async (req: AuthedRequest, res, next) => {
  try {
    if (!isValidId(String(req.params.id))) return res.status(404).json({ error: "Salary record not found." });
    const parsed = salaryPatchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Check salary fields.", issues: parsed.error.flatten() });
    const db = getDb(), d = parsed.data;
    const [before] = await db.select().from(employeeSalaryRecords).where(eq(employeeSalaryRecords._id, String(req.params.id))).limit(1);
    if (!before) return res.status(404).json({ error: "Salary record not found." });
    if (before.status === "PAID") return res.status(409).json({ error: "Paid payroll records are immutable. Record any required adjustment as a separately approved adjustment or correction." });
    const patch: Partial<typeof employeeSalaryRecords.$inferInsert> = { updatedAt: new Date() };
    const gross = d.grossSalary ?? before.grossSalary, allowances = d.allowances ?? before.allowances, deductions = d.deductions ?? before.deductions;
    if (roundMoney(gross + allowances - deductions) < 0) return res.status(400).json({ error: "Deductions cannot exceed gross salary plus allowances." });
    if (d.grossSalary !== undefined) patch.grossSalary = d.grossSalary;
    if (d.allowances !== undefined) patch.allowances = d.allowances;
    if (d.deductions !== undefined) patch.deductions = d.deductions;
    if (d.grossSalary !== undefined || d.allowances !== undefined || d.deductions !== undefined) patch.netPayable = roundMoney(gross + allowances - deductions);
    if (d.notes !== undefined) patch.notes = d.notes;
    if (d.paymentDate !== undefined) patch.paymentDate = parseDate(d.paymentDate);
    if (d.paymentReference !== undefined) patch.paymentReference = d.paymentReference;
    if (d.status) {
      const allowed: Record<string, string[]> = {
        DRAFT: ["PENDING_APPROVAL", "ON_HOLD"],
        PENDING_APPROVAL: ["APPROVED", "ON_HOLD", "DRAFT"],
        APPROVED: ["PAID", "ON_HOLD", "DRAFT"],
        ON_HOLD: ["DRAFT", "PENDING_APPROVAL", "APPROVED"],
        PAID: [],
      };
      if (d.status !== before.status && !allowed[before.status]?.includes(d.status)) return res.status(400).json({ error: `Salary status cannot move from ${before.status} to ${d.status}.` });
      patch.status = d.status;
      if (d.status === "APPROVED") patch.approvedByUserId = req.user!.userId;
      if (d.status === "PAID") {
        if (before.status !== "APPROVED") return res.status(400).json({ error: "Only an approved salary record can be marked paid." });
        if (!parseDate(d.paymentDate) && !before.paymentDate) return res.status(400).json({ error: "Record the payment date before marking salary paid." });
        if (!d.paymentReference?.trim() && !before.paymentReference) return res.status(400).json({ error: "Record a payment reference before marking salary paid." });
        patch.paidByUserId = req.user!.userId;
        patch.paymentDate = parseDate(d.paymentDate) || before.paymentDate;
      }
    }
    const [updated] = await db.update(employeeSalaryRecords).set(patch).where(eq(employeeSalaryRecords._id, before._id)).returning();
    await logAudit({ userId: req.user!.userId, action: updated.status === "APPROVED" ? "employee.salary.approve" : updated.status === "PAID" ? "employee.salary.mark_paid" : "employee.salary.update", resourceType: "employee_salary", resourceId: String(req.params.id), metadata: { monthKey: updated.monthKey, statusFrom: before.status, statusTo: updated.status, changedFields: Object.keys(d) } });
    return res.json({ salary: updated });
  } catch (err) { next(err); }
});

export default router;
