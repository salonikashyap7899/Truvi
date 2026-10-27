import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { and, desc, eq, gte, ilike, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../config/db";
import {
  propertyRequirementEvents,
  propertyRequirementMatches,
  propertyRequirementResponses,
  propertyRequirements,
  projects,
  employees,
  users,
  leads,
} from "../db/schema";
import { zodMessage } from "../lib/validationError";
import { isValidId } from "../lib/ids";
import { authenticate, requireRole, type AuthedRequest } from "../middleware/auth";
import { withoutPrivateProjectFields } from "../lib/projectPrivacy";
import { enqueueRequirementMatchJob } from "../services/propertyRequirementMatching";
import { logAudit } from "../services/audit";
import { isEmailTransportConfigured } from "../services/emailService";
import { notifyUser, NotificationType } from "../services/notificationService";

const router = Router();
router.use(authenticate);
router.use(requireRole("ADMIN", "DEVELOPER", "CP", "BUYER", "AMBASSADOR", "EMPLOYEE"));

const propertyTypes = ["ANY", "PLOTTED", "RESIDENTIAL", "APARTMENT", "VILLA", "COMMERCIAL", "INDUSTRIAL", "LAND", "MIXED"] as const;
const timelines = ["IMMEDIATE", "WITHIN_30_DAYS", "WITHIN_3_MONTHS", "WITHIN_6_MONTHS", "FLEXIBLE"] as const;
const purposes = ["INVESTMENT", "SELF_USE", "BUSINESS", "OTHER"] as const;
const contactMethods = ["PHONE", "EMAIL", "WHATSAPP", "IN_APP"] as const;
const visibilityValues = ["PRIVATE", "TRUVI"] as const;
const requirementStatuses = ["ACTIVE", "CLOSED", "UNDER_REVIEW", "REJECTED", "SPAM"] as const;

const submitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 15,
  standardHeaders: true,
  legacyHeaders: false,
});

const adminRetryLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

const fields = {
  title: z.string().trim().min(3).max(120),
  propertyType: z.enum(propertyTypes),
  city: z.string().trim().min(2).max(100),
  location: z.string().trim().min(2).max(160),
  minBudget: z.number().finite().min(0),
  maxBudget: z.number().finite().positive(),
  minAreaSqft: z.number().finite().positive().nullable().optional(),
  maxAreaSqft: z.number().finite().positive().nullable().optional(),
  purpose: z.enum(purposes).nullable().optional(),
  timeline: z.enum(timelines),
  details: z.string().trim().max(1200).nullable().optional(),
  publicSummary: z.string().trim().max(400).nullable().optional(),
  preferredContactMethod: z.enum(contactMethods).optional().default("IN_APP"),
  visibility: z.enum(visibilityValues).optional().default("TRUVI"),
  clientName: z.string().trim().max(120).nullable().optional(),
  clientPhone: z.string().trim().max(30).regex(/^\+?[0-9 ()-]{8,30}$/).nullable().optional(),
  clientEmail: z.string().trim().email().max(254).nullable().optional(),
  contactConsent: z.boolean().optional().default(false),
};
const createRequirementSchema = z.object(fields);
const updateRequirementSchema = z.object({
  title: z.string().trim().max(120).optional().or(z.literal("")),
  propertyType: z.enum(propertyTypes).optional(),
  city: z.string().trim().min(2).max(100).optional(),
  location: z.string().trim().min(2).max(160).optional(),
  minBudget: z.number().finite().min(0).nullable().optional(),
  maxBudget: z.number().finite().positive().optional(),
  minAreaSqft: z.number().finite().positive().nullable().optional(),
  maxAreaSqft: z.number().finite().positive().nullable().optional(),
  purpose: z.enum(purposes).nullable().optional(),
  timeline: z.enum(timelines).optional(),
  details: z.string().trim().max(1200).nullable().optional(),
  publicSummary: z.string().trim().max(400).nullable().optional(),
  preferredContactMethod: z.enum(contactMethods).optional(),
  visibility: z.enum(visibilityValues).optional(),
  clientName: z.string().trim().max(120).nullable().optional(),
  clientPhone: z.string().trim().max(30).regex(/^\+?[0-9 ()-]{8,30}$/).nullable().optional(),
  clientEmail: z.string().trim().email().max(254).nullable().optional(),
  contactConsent: z.boolean().optional(),
  status: z.enum(["ACTIVE", "CLOSED"]).optional(),
});
const adminModerationSchema = z.object({
  status: z.enum(requirementStatuses),
  moderationNote: z.string().trim().max(500).nullable().optional(),
  duplicateOfId: z.string().uuid().nullable().optional(),
});

function validateBounds(values: {
  minBudget?: number | null;
  maxBudget?: number | null;
  minAreaSqft?: number | null;
  maxAreaSqft?: number | null;
}): string | null {
  if (values.minBudget != null && values.maxBudget != null && values.minBudget > values.maxBudget) {
    return "Minimum budget cannot exceed maximum budget.";
  }
  if (values.minAreaSqft != null && values.maxAreaSqft != null && values.minAreaSqft > values.maxAreaSqft) {
    return "Minimum property size cannot exceed maximum property size.";
  }
  return null;
}

function displayType(value: string): string {
  return value === "ANY" ? "Property" : value.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
}

/** Public summaries are a separate field; redact common contact patterns defensively. */
function sanitizePublicSummary(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const sanitized = value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[contact removed]")
    .replace(/\+?\d[\d ()-]{7,}\d/g, "[contact removed]")
    .trim();
  return sanitized || null;
}

async function employeeCanCreateRequirement(userId: string): Promise<boolean> {
  const [employee] = await getDb().select({
    permissions: employees.permissions,
    status: employees.status,
  }).from(employees)
    .where(eq(employees.accountUserId, userId))
    .limit(1);
  return Boolean(employee && employee.status === "ACTIVE" && employee.permissions.includes("lead.create"));
}

async function writeRequirementEvent(
  requirementId: string,
  actorUserId: string | null,
  action: string,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  try {
    await getDb().insert(propertyRequirementEvents).values({
      requirementId,
      actorUserId,
      action,
      metadata,
    });
  } catch {
    // Event logging is non-fatal to the user's primary action; failure is logged
    // without requirement details or client contact information.
    console.warn("[requirements] activity event could not be recorded");
  }
}

function buildBoardFilters(query: Record<string, unknown>, allowPrivate = false) {
  const conditions = [];
  if (!allowPrivate) conditions.push(eq(propertyRequirements.visibility, "TRUVI"));

  const status = typeof query.status === "string" ? query.status : allowPrivate ? "ALL" : "ACTIVE";
  if (allowPrivate) {
    if (status !== "ALL" && requirementStatuses.includes(status as typeof requirementStatuses[number])) {
      conditions.push(eq(propertyRequirements.status, status as typeof requirementStatuses[number]));
    }
  } else {
    const allowedStatus = status === "CLOSED" ? "CLOSED" : "ACTIVE";
    conditions.push(eq(propertyRequirements.status, allowedStatus));
  }

  if (typeof query.city === "string" && query.city.trim()) {
    conditions.push(ilike(propertyRequirements.city, `%${query.city.trim().slice(0, 100)}%`));
  }
  if (typeof query.location === "string" && query.location.trim()) {
    conditions.push(ilike(propertyRequirements.location, `%${query.location.trim().slice(0, 160)}%`));
  }
  if (typeof query.propertyType === "string" && propertyTypes.includes(query.propertyType as typeof propertyTypes[number])) {
    conditions.push(eq(propertyRequirements.propertyType, query.propertyType));
  }
  if (typeof query.timeline === "string" && timelines.includes(query.timeline as typeof timelines[number])) {
    conditions.push(eq(propertyRequirements.timeline, query.timeline));
  }
  const budgetMin = Number(query.budgetMin);
  const budgetMax = Number(query.budgetMax);
  if (Number.isFinite(budgetMin) && budgetMin > 0) conditions.push(gte(propertyRequirements.maxBudget, budgetMin));
  if (Number.isFinite(budgetMax) && budgetMax > 0) {
    conditions.push(or(isNull(propertyRequirements.minBudget), lte(propertyRequirements.minBudget, budgetMax))!);
  }
  const parseDateBoundary = (value: unknown, endOfDay: boolean): Date | null => {
    if (typeof value !== "string" || !value.trim()) return null;
    // Date-picker inputs are calendar dates in the product's primary timezone (India).
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
    const normalized = dateOnly
      ? `${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}+05:30`
      : value;
    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };
  const dateFrom = parseDateBoundary(query.dateFrom, false);
  const dateTo = parseDateBoundary(query.dateTo, true);
  if (dateFrom) conditions.push(gte(propertyRequirements.createdAt, dateFrom));
  if (dateTo) conditions.push(lte(propertyRequirements.createdAt, dateTo));
  if (allowPrivate && typeof query.role === "string") {
    conditions.push(eq(propertyRequirements.submittedByRole, query.role as never));
  }
  if (typeof query.q === "string" && query.q.trim()) {
    const pattern = `%${query.q.trim().slice(0, 100)}%`;
    conditions.push(or(
      ilike(propertyRequirements.title, pattern),
      ilike(propertyRequirements.city, pattern),
      ilike(propertyRequirements.location, pattern),
    )!);
  }
  if (allowPrivate && typeof query.visibility === "string" && visibilityValues.includes(query.visibility as typeof visibilityValues[number])) {
    conditions.push(eq(propertyRequirements.visibility, query.visibility as typeof visibilityValues[number]));
  }
  return conditions;
}

function pagination(query: Record<string, unknown>) {
  const pageParsed = Number.parseInt(String(query.page ?? "1"), 10);
  const limitParsed = Number.parseInt(String(query.limit ?? "20"), 10);
  const page = Number.isInteger(pageParsed) ? Math.max(1, Math.min(100000, pageParsed)) : 1;
  const limit = Number.isInteger(limitParsed) ? Math.max(1, Math.min(100, limitParsed)) : 20;
  return { page, limit, offset: (page - 1) * limit };
}

/**
 * GET /api/requirements/mine — private records (including contact details) for the owner only.
 */
router.get("/mine", async (req: AuthedRequest, res) => {
  const rows = await getDb()
    .select()
    .from(propertyRequirements)
    .where(eq(propertyRequirements.submittedById, req.user!.userId))
    .orderBy(desc(propertyRequirements.createdAt))
    .limit(100);
  res.json({ requirements: rows });
});

/**
 * GET /api/requirements/board — paginated, privacy-safe summaries for authorized Truvi users.
 * Submitter IDs, private notes, client names and contact details are excluded.
 */
router.get("/board", async (req: AuthedRequest, res) => {
  const db = getDb();
  const { page, limit, offset } = pagination(req.query as Record<string, unknown>);
  const conditions = buildBoardFilters(req.query as Record<string, unknown>);
  const [countRow] = await db.select({ total: sql<number>`count(*)::int` }).from(propertyRequirements).where(and(...conditions));
  const rows = await db
    .select({
      _id: propertyRequirements._id,
      title: propertyRequirements.title,
      propertyType: propertyRequirements.propertyType,
      city: propertyRequirements.city,
      location: propertyRequirements.location,
      minBudget: propertyRequirements.minBudget,
      maxBudget: propertyRequirements.maxBudget,
      minAreaSqft: propertyRequirements.minAreaSqft,
      maxAreaSqft: propertyRequirements.maxAreaSqft,
      purpose: propertyRequirements.purpose,
      timeline: propertyRequirements.timeline,
      publicSummary: propertyRequirements.publicSummary,
      submittedByRole: propertyRequirements.submittedByRole,
      visibility: propertyRequirements.visibility,
      status: propertyRequirements.status,
      createdAt: propertyRequirements.createdAt,
    })
    .from(propertyRequirements)
    .where(and(...conditions))
    .orderBy(desc(propertyRequirements.createdAt))
    .limit(limit)
    .offset(offset);
  const total = countRow?.total ?? 0;
  res.json({ requirements: rows, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
});

/** GET /api/requirements/matches — only matches for this user's active requirements and live projects. */
router.get("/matches", async (req: AuthedRequest, res) => {
  const userId = req.user!.userId;
  const rows = await getDb()
    .select({
      match: propertyRequirementMatches,
      requirementTitle: propertyRequirements.title,
      project: projects,
    })
    .from(propertyRequirementMatches)
    .innerJoin(
      propertyRequirements,
      and(
        eq(propertyRequirementMatches.requirementId, propertyRequirements._id),
        eq(propertyRequirements.submittedById, userId),
        eq(propertyRequirements.status, "ACTIVE"),
      ),
    )
    .innerJoin(
      projects,
      and(
        eq(propertyRequirementMatches.projectId, projects._id),
        eq(projects.approvalStatus, "APPROVED"),
        eq(projects.availabilityStatus, "AVAILABLE"),
      ),
    )
    .where(inArray(propertyRequirementMatches.matchStatus, ["MATCHED", "ENQUIRY_CREATED"]))
    .orderBy(desc(propertyRequirementMatches.createdAt))
    .limit(100);

  res.json({
    matches: rows.map((row) => ({
      match: row.match,
      requirementTitle: row.requirementTitle,
      project: withoutPrivateProjectFields(row.project, { userId, role: req.user!.role }, String(row.project.developerId)),
    })),
  });
});

/** A requirement's private event history is available only to its submitter and admins. */
router.get("/mine/:id/events", async (req: AuthedRequest, res) => {
  if (!isValidId(req.params.id)) return res.status(404).json({ error: "Requirement not found" });
  const [row] = await getDb().select({
    id: propertyRequirements._id,
    ownerId: propertyRequirements.submittedById,
  }).from(propertyRequirements).where(eq(propertyRequirements._id, req.params.id)).limit(1);
  if (!row) return res.status(404).json({ error: "Requirement not found" });
  if (req.user!.role !== "ADMIN" && String(row.ownerId) !== req.user!.userId) {
    return res.status(403).json({ error: "You are not allowed to view this requirement's history." });
  }
  const events = await getDb().select().from(propertyRequirementEvents)
    .where(eq(propertyRequirementEvents.requirementId, row.id))
    .orderBy(desc(propertyRequirementEvents.createdAt)).limit(100);
  res.json({ events });
});

/**
 * POST /api/requirements — submit an unmet need, with no existing property required.
 * For lead-generating roles this stores private client data only when the submitter
 * attests to client permission; client data is never included in board summaries.
 */
router.post("/", submitLimiter, async (req: AuthedRequest, res) => {
  if (req.user!.role === "EMPLOYEE" && !(await employeeCanCreateRequirement(req.user!.userId))) {
    return res.status(403).json({ error: "Requirement submission is not enabled for this employee account.", code: "EMPLOYEE_REQUIREMENT_PERMISSION_REQUIRED" });
  }
  const parsed = createRequirementSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: zodMessage(parsed.error), issues: parsed.error.flatten() });
  const invalidBounds = validateBounds(parsed.data);
  if (invalidBounds) return res.status(400).json({ error: invalidBounds });

  const data = parsed.data;
  const hasClientContact = Boolean(data.clientName?.trim() || data.clientPhone?.trim() || data.clientEmail?.trim());
  const isBuyer = req.user!.role === "BUYER";
  if (isBuyer && hasClientContact) {
    return res.status(400).json({ error: "Buyer requirements cannot contain another person's contact details." });
  }
  if (!isBuyer && !data.contactConsent) {
    return res.status(400).json({ error: "Confirm that the client has consented before submitting a lead requirement." });
  }
  if (hasClientContact && !data.contactConsent) {
    return res.status(400).json({ error: "Client consent is required before saving client contact information." });
  }

  // Idempotent duplicate guard for repeated submit/network retries. Partners can
  // still create separate client records; supplied consented contact identifiers
  // are included in the comparison when available.
  const recentSince = new Date(Date.now() - 2 * 60_000);
  const duplicateConditions = [
    eq(propertyRequirements.submittedById, req.user!.userId),
    eq(propertyRequirements.requirementKind, isBuyer ? "BUYER" : "CLIENT"),
    eq(propertyRequirements.propertyType, data.propertyType),
    eq(propertyRequirements.city, data.city.trim()),
    eq(propertyRequirements.location, data.location.trim()),
    eq(propertyRequirements.maxBudget, data.maxBudget),
    gte(propertyRequirements.createdAt, recentSince),
    eq(propertyRequirements.status, "ACTIVE"),
  ];
  if (data.minBudget == null) duplicateConditions.push(isNull(propertyRequirements.minBudget) as never);
  else duplicateConditions.push(eq(propertyRequirements.minBudget, data.minBudget) as never);
  if (data.clientPhone?.trim()) duplicateConditions.push(eq(propertyRequirements.clientPhone, data.clientPhone.trim()) as never);
  else if (data.clientEmail?.trim()) duplicateConditions.push(eq(propertyRequirements.clientEmail, data.clientEmail.trim()) as never);
  else if (data.clientName?.trim()) duplicateConditions.push(eq(propertyRequirements.clientName, data.clientName.trim()) as never);
  else if (!isBuyer) duplicateConditions.push(isNull(propertyRequirements.clientPhone) as never);

  const [recentDuplicate] = await getDb().select({
    id: propertyRequirements._id,
  }).from(propertyRequirements)
    .where(and(...duplicateConditions))
    .orderBy(desc(propertyRequirements.createdAt))
    .limit(1);
  if (recentDuplicate) {
    return res.status(409).json({
      error: "A very similar requirement was just submitted. Check your saved requirements before submitting again.",
      reference: String(recentDuplicate.id),
      code: "RECENT_DUPLICATE_REQUIREMENT",
    });
  }

  const title = data.title?.trim() || `${displayType(data.propertyType)} requirement in ${data.city.trim()}`;
  const [requirement] = await getDb().insert(propertyRequirements).values({
    submittedById: req.user!.userId,
    submittedByRole: req.user!.role,
    requirementKind: isBuyer ? "BUYER" : "CLIENT",
    visibility: data.visibility,
    title,
    propertyType: data.propertyType,
    city: data.city.trim(),
    location: data.location.trim(),
    minBudget: data.minBudget ?? null,
    maxBudget: data.maxBudget,
    minAreaSqft: data.minAreaSqft ?? null,
    maxAreaSqft: data.maxAreaSqft ?? null,
    purpose: data.purpose ?? null,
    timeline: data.timeline,
    details: data.details?.trim() || null,
    publicSummary: sanitizePublicSummary(data.publicSummary),
    preferredContactMethod: data.preferredContactMethod,
    clientName: hasClientContact ? data.clientName?.trim() || null : null,
    clientPhone: hasClientContact ? data.clientPhone?.trim() || null : null,
    clientEmail: hasClientContact ? data.clientEmail?.trim() || null : null,
    contactConsent: Boolean(data.contactConsent),
    contactConsentAt: data.contactConsent ? new Date() : null,
    status: "ACTIVE",
  }).returning();

  await writeRequirementEvent(String(requirement._id), req.user!.userId, "REQUIREMENT_CREATED", {
    role: req.user!.role,
    requirementKind: requirement.requirementKind,
    visibility: requirement.visibility,
    city: requirement.city,
    propertyType: requirement.propertyType,
  });

  void enqueueRequirementMatchJob("REQUIREMENT", { requirementId: String(requirement._id) }).catch(() => {
    console.warn("[property-matching] requirement matching job could not be queued");
  });

  res.status(201).json({ requirement, reference: String(requirement._id) });
});

/** Admin-only requirements queue. Private fields are returned only on this route. */
router.get("/admin", requireRole("ADMIN"), async (req: AuthedRequest, res) => {
  const db = getDb();
  const { page, limit, offset } = pagination(req.query as Record<string, unknown>);
  const conditions = buildBoardFilters(req.query as Record<string, unknown>, true);
  const [countRow] = await db.select({ total: sql<number>`count(*)::int` }).from(propertyRequirements).where(and(...conditions));
  const rows = await db.select({
    requirement: propertyRequirements,
    submitter: { id: users._id, name: users.name, email: users.email, role: users.role },
  }).from(propertyRequirements)
    .innerJoin(users, eq(propertyRequirements.submittedById, users._id))
    .where(and(...conditions))
    .orderBy(desc(propertyRequirements.createdAt))
    .limit(limit)
    .offset(offset);
  const total = countRow?.total ?? 0;
  res.json({ requirements: rows, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
});

/** Admin analytics use real PostgreSQL records; uninstrumented metrics are marked unavailable. */
router.get("/admin/analytics", requireRole("ADMIN"), async (req: AuthedRequest, res) => {
  const db = getDb();
  const conditions = buildBoardFilters(req.query as Record<string, unknown>, true);
  const all = await db.select({
    id: propertyRequirements._id,
    status: propertyRequirements.status,
  }).from(propertyRequirements).where(and(...conditions));
  const activeIds = all.filter((row) => row.status === "ACTIVE").map((row) => String(row.id));
  const ids = all.map((row) => row.id);
  const matchedRows = ids.length ? await db.select({
    id: propertyRequirementMatches._id,
    requirementId: propertyRequirementMatches.requirementId,
    matchStatus: propertyRequirementMatches.matchStatus,
    emailStatus: propertyRequirementMatches.emailStatus,
    notificationStatus: propertyRequirementMatches.notificationStatus,
  }).from(propertyRequirementMatches).where(inArray(propertyRequirementMatches.requirementId, ids)) : [];
  const eligibleMatches = matchedRows.filter((row) => ["MATCHED", "ENQUIRY_CREATED"].includes(row.matchStatus));
  const matchedRequirementIds = new Set(eligibleMatches.map((row) => String(row.requirementId)));
  const distinctMatchedRequirements = new Set(eligibleMatches.map((row) => String(row.requirementId))).size;
  const matchIds = matchedRows.map((row) => row.id);
  let enquiryCount = 0;
  if (matchIds.length > 0) {
    const [enquiryCountRow] = await db.select({
      count: sql<number>`count(*)::int`,
    }).from(leads).where(inArray(leads.propertyRequirementMatchId, matchIds));
    enquiryCount = enquiryCountRow?.count ?? 0;
  }
  res.json({
    filters: {
      city: typeof req.query.city === "string" ? req.query.city : null,
      location: typeof req.query.location === "string" ? req.query.location : null,
      propertyType: typeof req.query.propertyType === "string" ? req.query.propertyType : null,
      role: typeof req.query.role === "string" ? req.query.role : null,
      status: typeof req.query.status === "string" ? req.query.status : "ALL",
      dateFrom: typeof req.query.dateFrom === "string" ? req.query.dateFrom : null,
      dateTo: typeof req.query.dateTo === "string" ? req.query.dateTo : null,
    },
    requirements: {
      total: all.length,
      active: all.filter((r) => r.status === "ACTIVE").length,
      closed: all.filter((r) => r.status === "CLOSED").length,
      underReview: all.filter((r) => r.status === "UNDER_REVIEW").length,
      rejected: all.filter((r) => r.status === "REJECTED").length,
      spam: all.filter((r) => r.status === "SPAM").length,
      activeWithMatches: activeIds.filter((id) => matchedRequirementIds.has(id)).length,
      activeWithoutMatches: activeIds.filter((id) => !matchedRequirementIds.has(id)).length,
    },
    matches: {
      total: eligibleMatches.length,
      distinctMatchedRequirements,
      notificationQueued: matchedRows.filter((r) => ["PENDING", "QUEUED", "RETRY_PENDING", "SENDING"].includes(r.notificationStatus) || ["QUEUED", "RETRY_PENDING", "SENDING"].includes(r.emailStatus)).length,
      emailsAcceptedBySmtp: matchedRows.filter((r) => ["SENT_TO_PROVIDER", "DELIVERED"].includes(r.emailStatus)).length,
      emailsConfirmedDelivered: matchedRows.filter((r) => r.emailStatus === "DELIVERED").length,
      failures: matchedRows.filter((r) => r.notificationStatus === "FAILED" || r.emailStatus === "FAILED").length,
    },
    propertyEnquiriesFromNotifications: { tracked: true, count: enquiryCount },
    note: "SMTP acceptance is not confirmed mailbox delivery. A provider-specific signed delivery webhook is required to populate confirmed-delivery counts.",
  });
});

/** Admin moderation and duplicate marking; changes are audit logged. */
router.patch("/admin/:id", requireRole("ADMIN"), async (req: AuthedRequest, res) => {
  if (!isValidId(req.params.id)) return res.status(404).json({ error: "Requirement not found" });
  const parsed = adminModerationSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: zodMessage(parsed.error), issues: parsed.error.flatten() });

  const db = getDb();
  const [existing] = await db.select().from(propertyRequirements).where(eq(propertyRequirements._id, req.params.id)).limit(1);
  if (!existing) return res.status(404).json({ error: "Requirement not found" });
  if (parsed.data.duplicateOfId && parsed.data.duplicateOfId === String(existing._id)) {
    return res.status(400).json({ error: "A requirement cannot be a duplicate of itself." });
  }
  if (parsed.data.duplicateOfId) {
    const [duplicateTarget] = await db.select({ id: propertyRequirements._id }).from(propertyRequirements)
      .where(eq(propertyRequirements._id, parsed.data.duplicateOfId)).limit(1);
    if (!duplicateTarget) return res.status(400).json({ error: "Duplicate target was not found." });
  }

  const [updated] = await db.update(propertyRequirements).set({
    status: parsed.data.status,
    moderationNote: parsed.data.moderationNote?.trim() || null,
    duplicateOfId: parsed.data.duplicateOfId ?? null,
    moderatedById: req.user!.userId,
    moderatedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(propertyRequirements._id, existing._id)).returning();

  await writeRequirementEvent(String(updated._id), req.user!.userId, "REQUIREMENT_MODERATED", {
    fromStatus: existing.status,
    toStatus: updated.status,
    duplicateMarked: Boolean(updated.duplicateOfId),
    hasModerationNote: Boolean(updated.moderationNote),
  });
  await logAudit({
    userId: req.user!.userId,
    action: "requirement.moderate",
    resourceType: "property_requirement",
    resourceId: String(updated._id),
    metadata: { fromStatus: existing.status, toStatus: updated.status, duplicateMarked: Boolean(updated.duplicateOfId) },
  });
  res.json({ requirement: updated });
});

router.get("/admin/:id/events", requireRole("ADMIN"), async (req: AuthedRequest, res) => {
  if (!isValidId(req.params.id)) return res.status(404).json({ error: "Requirement not found" });
  const events = await getDb().select().from(propertyRequirementEvents)
    .where(eq(propertyRequirementEvents.requirementId, req.params.id))
    .orderBy(desc(propertyRequirementEvents.createdAt)).limit(200);
  res.json({ events });
});

/** Retry failed property-recommendation email attempts after SMTP has been configured/fixed. */
router.post("/admin/retry-failed-emails", adminRetryLimiter, requireRole("ADMIN"), async (req: AuthedRequest, res) => {
  if (!isEmailTransportConfigured()) {
    return res.status(503).json({
      error: "SMTP is not configured in this server process. Configure SMTP_HOST, SMTP_PORT, SMTP_USER and SMTP_PASSWORD before retrying.",
      code: "SMTP_NOT_CONFIGURED",
    });
  }

  const eligibleErrors = ["SMTP_SEND_FAILED", "SMTP_NOT_CONFIGURED", "STALE_SEND_EXHAUSTED"];
  const rows = await getDb().update(propertyRequirementMatches).set({
    emailStatus: "RETRY_PENDING",
    emailAttempts: 0,
    emailNextAttemptAt: new Date(),
    emailClaimedAt: null,
    emailLastError: null,
  }).where(and(
    eq(propertyRequirementMatches.emailStatus, "FAILED"),
    inArray(propertyRequirementMatches.emailLastError, eligibleErrors),
  )).returning({ id: propertyRequirementMatches._id });

  await logAudit({
    userId: req.user!.userId,
    action: "requirement.email.retry",
    resourceType: "property_requirement_match",
    metadata: { resetCount: rows.length },
  });
  res.json({ ok: true, resetCount: rows.length, message: "Eligible failed email attempts were placed back in the retry queue." });
});

/** Admin-only duplicate candidates: same normalized city/locality/type and overlapping budgets. */
router.get("/admin/duplicates", requireRole("ADMIN"), async (_req: AuthedRequest, res) => {
  const rows = await getDb().select({
    id: propertyRequirements._id,
    title: propertyRequirements.title,
    city: propertyRequirements.city,
    location: propertyRequirements.location,
    propertyType: propertyRequirements.propertyType,
    minBudget: propertyRequirements.minBudget,
    maxBudget: propertyRequirements.maxBudget,
    createdAt: propertyRequirements.createdAt,
    submittedByRole: propertyRequirements.submittedByRole,
  }).from(propertyRequirements).where(eq(propertyRequirements.status, "ACTIVE"))
    .orderBy(desc(propertyRequirements.createdAt)).limit(1500);

  const normalizeKey = (value: string) => value.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = [normalizeKey(row.city), normalizeKey(row.location), row.propertyType].join("|");
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const candidates = [...groups.entries()].flatMap(([key, group]) => {
    if (group.length < 2) return [];
    const overlapping = group.some((a, i) => group.slice(i + 1).some((b) => {
      const aMin = a.minBudget ?? 0;
      const bMin = b.minBudget ?? 0;
      return aMin <= b.maxBudget && bMin <= a.maxBudget;
    }));
    return overlapping ? [{ key, requirements: group.map(({ minBudget, ...row }) => ({ ...row, minBudget })) }] : [];
  });
  res.json({ candidateGroups: candidates, scanned: rows.length, capped: rows.length === 1500 });
});

const responseSchema = z.object({
  message: z.string().trim().min(5).max(1000),
});

/** Submit a private response to an active TRUVI-visible requirement. Contact details are never returned by this route. */
router.post("/:id/responses", submitLimiter, async (req: AuthedRequest, res) => {
  if (!isValidId(req.params.id)) return res.status(404).json({ error: "Requirement not found" });
  const allowedRoles = ["ADMIN", "DEVELOPER", "CP", "AMBASSADOR", "EMPLOYEE"];
  if (!allowedRoles.includes(req.user!.role)) {
    return res.status(403).json({ error: "Only authorized Truvi lead-generating roles can respond to a requirement." });
  }
  if (req.user!.role === "EMPLOYEE" && !(await employeeCanCreateRequirement(req.user!.userId))) {
    return res.status(403).json({ error: "Requirement responses are not enabled for this employee account." });
  }
  const parsed = responseSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: zodMessage(parsed.error), issues: parsed.error.flatten() });

  const db = getDb();
  const [requirement] = await db.select({
    id: propertyRequirements._id,
    ownerId: propertyRequirements.submittedById,
    title: propertyRequirements.title,
    visibility: propertyRequirements.visibility,
    status: propertyRequirements.status,
  }).from(propertyRequirements)
    .where(eq(propertyRequirements._id, req.params.id))
    .limit(1);
  if (!requirement || requirement.visibility !== "TRUVI" || requirement.status !== "ACTIVE") {
    return res.status(404).json({ error: "This requirement is not available for responses." });
  }
  if (String(requirement.ownerId) === req.user!.userId) {
    return res.status(400).json({ error: "You cannot respond to your own requirement." });
  }

  const [existingResponse] = await db.select({ id: propertyRequirementResponses._id })
    .from(propertyRequirementResponses)
    .where(and(
      eq(propertyRequirementResponses.requirementId, requirement.id),
      eq(propertyRequirementResponses.responderId, req.user!.userId),
      eq(propertyRequirementResponses.status, "SENT"),
    )).limit(1);
  if (existingResponse) {
    return res.status(409).json({ error: "You have already responded to this requirement.", code: "RESPONSE_ALREADY_EXISTS" });
  }

  const [response] = await db.insert(propertyRequirementResponses).values({
    requirementId: requirement.id,
    responderId: req.user!.userId,
    message: parsed.data.message,
    status: "SENT",
  }).returning();

  await writeRequirementEvent(String(requirement.id), req.user!.userId, "REQUIREMENT_RESPONSE_SENT", {
    responseId: String(response._id),
  });

  try {
    await notifyUser(String(requirement.ownerId), {
      type: "requirement_response",
      title: "New response to your property requirement",
      message: "An authorized Truvi user has responded to your requirement. Sign in to review the response.",
      priority: "high",
      data: { href: "/requirements", requirementId: String(requirement.id) },
      dedupeKey: `requirement-response:${response._id}`,
    });
  } catch {
    console.warn("[requirements] response notification could not be delivered");
  }

  res.status(201).json({ response: { _id: response._id, requirementId: response.requirementId, message: response.message, createdAt: response.createdAt } });
});

/** The owner or administrator can review private responses; client contact information is never exposed. */
router.get("/mine/:id/responses", async (req: AuthedRequest, res) => {
  if (!isValidId(req.params.id)) return res.status(404).json({ error: "Requirement not found" });
  const [requirement] = await getDb().select({
    id: propertyRequirements._id,
    ownerId: propertyRequirements.submittedById,
  }).from(propertyRequirements).where(eq(propertyRequirements._id, req.params.id)).limit(1);
  if (!requirement) return res.status(404).json({ error: "Requirement not found" });
  if (req.user!.role !== "ADMIN" && String(requirement.ownerId) !== req.user!.userId) {
    return res.status(403).json({ error: "You are not allowed to view this requirement's responses." });
  }
  const rows = await getDb().select({
    id: propertyRequirementResponses._id,
    message: propertyRequirementResponses.message,
    status: propertyRequirementResponses.status,
    createdAt: propertyRequirementResponses.createdAt,
    readAt: propertyRequirementResponses.readAt,
    responderName: users.name,
    responderRole: users.role,
  }).from(propertyRequirementResponses)
    .innerJoin(users, eq(propertyRequirementResponses.responderId, users._id))
    .where(and(
      eq(propertyRequirementResponses.requirementId, requirement.id),
      eq(propertyRequirementResponses.status, "SENT"),
    ))
    .orderBy(desc(propertyRequirementResponses.createdAt))
    .limit(100);

  if (req.user!.role !== "ADMIN") {
    await getDb().update(propertyRequirementResponses)
      .set({ readAt: new Date() })
      .where(and(
        eq(propertyRequirementResponses.requirementId, requirement.id),
        isNull(propertyRequirementResponses.readAt),
      ));
  }
  res.json({ responses: rows });
});

/** Owner update/withdrawal. Admin moderation statuses may only be changed by admins. */
router.patch("/:id", async (req: AuthedRequest, res) => {
  if (!isValidId(req.params.id)) return res.status(404).json({ error: "Requirement not found" });
  const parsed = updateRequirementSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: zodMessage(parsed.error), issues: parsed.error.flatten() });
  const invalidBounds = validateBounds(parsed.data);
  if (invalidBounds) return res.status(400).json({ error: invalidBounds });

  const db = getDb();
  const [existing] = await db.select().from(propertyRequirements).where(eq(propertyRequirements._id, req.params.id)).limit(1);
  if (!existing) return res.status(404).json({ error: "Requirement not found" });
  if (req.user!.role !== "ADMIN" && String(existing.submittedById) !== req.user!.userId) {
    return res.status(403).json({ error: "You can only update your own requirements." });
  }
  if (req.user!.role === "EMPLOYEE" && !(await employeeCanCreateRequirement(req.user!.userId))) {
    return res.status(403).json({ error: "Requirement editing is not enabled for this employee account." });
  }
  if (req.user!.role !== "ADMIN" && !["ACTIVE", "CLOSED"].includes(existing.status)) {
    return res.status(403).json({ error: "This requirement is under moderation and cannot be changed by its owner." });
  }

  const combined = { ...existing, ...parsed.data };
  const data = parsed.data;
  const update: Record<string, unknown> = { updatedAt: new Date() };
  if (data.title !== undefined) update.title = data.title.trim() || `${displayType(String(combined.propertyType))} requirement in ${String(combined.city)}`;
  if (data.propertyType !== undefined) update.propertyType = data.propertyType;
  if (data.city !== undefined) update.city = data.city.trim();
  if (data.location !== undefined) update.location = data.location.trim();
  if (data.minBudget !== undefined) update.minBudget = data.minBudget;
  if (data.maxBudget !== undefined) update.maxBudget = data.maxBudget;
  if (data.minAreaSqft !== undefined) update.minAreaSqft = data.minAreaSqft;
  if (data.maxAreaSqft !== undefined) update.maxAreaSqft = data.maxAreaSqft;
  if (data.purpose !== undefined) update.purpose = data.purpose;
  if (data.timeline !== undefined) update.timeline = data.timeline;
  if (data.details !== undefined) update.details = data.details?.trim() || null;
  if (data.publicSummary !== undefined) update.publicSummary = sanitizePublicSummary(data.publicSummary);
  if (data.preferredContactMethod !== undefined) update.preferredContactMethod = data.preferredContactMethod;
  if (data.visibility !== undefined) update.visibility = data.visibility;
  if (data.clientName !== undefined) update.clientName = data.clientName?.trim() || null;
  if (data.clientPhone !== undefined) update.clientPhone = data.clientPhone?.trim() || null;
  if (data.clientEmail !== undefined) update.clientEmail = data.clientEmail?.trim() || null;
  if (data.contactConsent !== undefined) {
    update.contactConsent = data.contactConsent;
    update.contactConsentAt = data.contactConsent ? new Date() : null;
  }
  if (data.status !== undefined) update.status = data.status;

  const hasClientContactAfter = Boolean(
    data.clientName !== undefined ? data.clientName?.trim() : existing.clientName
  ) || Boolean(
    data.clientPhone !== undefined ? data.clientPhone?.trim() : existing.clientPhone
  ) || Boolean(
    data.clientEmail !== undefined ? data.clientEmail?.trim() : existing.clientEmail
  );
  const consentAfter = data.contactConsent !== undefined ? data.contactConsent : existing.contactConsent;
  if (hasClientContactAfter && !consentAfter) {
    return res.status(400).json({ error: "Client consent is required before saving client contact information." });
  }

  const [requirement] = await db.update(propertyRequirements).set(update)
    .where(eq(propertyRequirements._id, existing._id)).returning();

  await writeRequirementEvent(String(requirement._id), req.user!.userId, "REQUIREMENT_UPDATED", {
    changedFields: Object.keys(data),
    fromStatus: existing.status,
    toStatus: requirement.status,
  });

  if (requirement.status === "ACTIVE") {
    void enqueueRequirementMatchJob("REQUIREMENT", { requirementId: String(requirement._id) }).catch(() => {
      console.warn("[property-matching] requirement update matching job could not be queued");
    });
  }
  res.json({ requirement });
});

export default router;
