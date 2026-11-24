import { createHmac, timingSafeEqual } from "node:crypto";
import { Router, type Request, type Response } from "express";
import multer from "multer";
import Papa from "papaparse";
import { and, asc, count, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { getDatabaseStatus, getDb } from "../config/db";
import {
  buyerCrmActivities,
  buyerCrmLeads,
  employees,
  leads,
  metaAdFormMappings,
  projects,
  propertyRequirements,
  users,
} from "../db/schema";
import { authenticate, requireRole, type AuthedRequest } from "../middleware/auth";
import { isValidId } from "../lib/ids";
import { logAudit } from "../services/audit";
import { createNotifications } from "../services/notificationService";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });
const SOURCES = ["META_AD", "GOOGLE_AD", "TELECALLER", "WHATSAPP", "WEBSITE", "CUSTOMER_REFERRAL", "OTHER"] as const;
const STATUSES = [
  "NEW",
  "CONTACTED",
  "QUALIFIED",
  "SITE_VISIT_SCHEDULED",
  "SITE_VISIT_COMPLETED",
  "BOOKING_TOKEN",
  "CONVERTED",
  "LOST",
] as const;
const ACTIVITY_TYPES = ["CALL", "WHATSAPP", "NOTE", "FOLLOW_UP"] as const;

function normalizePhone(value: string): string {
  let digits = value.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return digits;
}

export type BuyerCrmAccess = {
  isAdmin: boolean;
  canReadAssigned: boolean;
  canReadSite: boolean;
  canUpdateStatus: boolean;
  canCreateActivity: boolean;
  userId: string;
};

async function getBuyerCrmAccess(req: AuthedRequest): Promise<BuyerCrmAccess | null> {
  if (!req.user) return null;
  if (req.user.role === "ADMIN") {
    return {
      isAdmin: true,
      canReadAssigned: true,
      canReadSite: true,
      canUpdateStatus: true,
      canCreateActivity: true,
      userId: req.user.userId,
    };
  }
  if (req.user.role === "EMPLOYEE") {
    const db = getDb();
    const [emp] = await db.select({ permissions: employees.permissions, status: employees.status })
      .from(employees)
      .where(eq(employees.accountUserId, req.user.userId))
      .limit(1);
    if (!emp || emp.status === "INACTIVE") return null;
    const perms = emp.permissions || [];
    const canReadAssigned = perms.includes("buyer_crm.read.assigned");
    const canReadSite = perms.includes("buyer_crm.read.site");
    const canUpdateStatus = perms.includes("buyer_crm.status.update");
    const canCreateActivity = perms.includes("buyer_crm.activity.create");

    if (!canReadAssigned && !canReadSite) return null;

    return {
      isAdmin: false,
      canReadAssigned,
      canReadSite,
      canUpdateStatus,
      canCreateActivity,
      userId: req.user.userId,
    };
  }
  return null;
}

const createLeadSchema = z.object({
  fullName: z.string().trim().min(2).max(100),
  phone: z.string().trim().min(10).max(24),
  email: z.string().trim().email().max(160).optional().or(z.literal("")),
  source: z.enum(SOURCES),
  projectId: z.string().refine(isValidId).optional().or(z.literal("")),
  propertyType: z.string().trim().max(50).optional().or(z.literal("")),
  preferredLocation: z.string().trim().max(120).optional().or(z.literal("")),
  budgetRange: z.string().trim().max(80).optional().or(z.literal("")),
  purchasePurpose: z.enum(["SELF_USE", "INVESTMENT", "UNDECIDED"]).optional().or(z.literal("")),
  purchaseTimeline: z.enum(["IMMEDIATE", "WITHIN_3_MONTHS", "3_TO_6_MONTHS", "6_TO_12_MONTHS", "MORE_THAN_12_MONTHS", "NOT_DECIDED"]).optional().or(z.literal("")),
  requirement: z.string().trim().max(1200).optional().or(z.literal("")),
  nextFollowUpAt: z.string().datetime().optional().or(z.literal("")),
  assignedToId: z.string().refine(isValidId).optional().or(z.literal("")),
  contactConsent: z.literal(true, { error: "Confirm the buyer agreed to be contacted." }),
  consentBasis: z.string().trim().min(4).max(300),
}).refine((data) => Boolean(data.projectId || data.requirement || data.propertyType || data.preferredLocation || data.budgetRange), {
  message: "Choose a project or describe the buyer's broader requirement.",
  path: ["requirement"],
});

const updateLeadSchema = z.object({
  status: z.enum(STATUSES).optional(),
  projectId: z.string().refine(isValidId).nullable().optional(),
  nextFollowUpAt: z.string().datetime().nullable().optional(),
  assignedToId: z.string().refine(isValidId).nullable().optional(),
  requirement: z.string().trim().max(1200).nullable().optional(),
  contactConsent: z.boolean().optional(),
  consentBasis: z.string().trim().max(300).nullable().optional(),
}).refine((data) => data.contactConsent !== true || Boolean(data.consentBasis && data.consentBasis.trim().length >= 4), {
  message: "Record how the buyer gave permission before enabling contact.",
  path: ["consentBasis"],
});

const createMappingSchema = z.object({
  formId: z.string().trim().min(1).max(160),
  formName: z.string().trim().max(250).optional().or(z.literal("")),
  adId: z.string().trim().max(160).optional().or(z.literal("")),
  adName: z.string().trim().max(250).optional().or(z.literal("")),
  campaignId: z.string().trim().max(160).optional().or(z.literal("")),
  campaignName: z.string().trim().max(250).optional().or(z.literal("")),
  projectId: z.string().refine(isValidId, "Choose an approved project."),
});

const updateMappingSchema = z.object({
  formId: z.string().trim().min(1).max(160).optional(),
  formName: z.string().trim().max(250).nullable().optional(),
  adId: z.string().trim().max(160).nullable().optional(),
  adName: z.string().trim().max(250).nullable().optional(),
  campaignId: z.string().trim().max(160).nullable().optional(),
  campaignName: z.string().trim().max(250).nullable().optional(),
  projectId: z.string().refine(isValidId, "Choose an approved project.").optional(),
  isActive: z.boolean().optional(),
});

function listFilters(query: Record<string, unknown>, access: BuyerCrmAccess): { conditions: SQL[]; page: number; limit: number } {
  const page = Math.max(1, Math.min(10000, Number(query.page) || 1));
  const limit = Math.max(1, Math.min(100, Number(query.limit) || 50));
  const conditions: SQL[] = [];

  // Employee scoping
  if (!access.isAdmin) {
    if (access.canReadAssigned && !access.canReadSite) {
      conditions.push(eq(buyerCrmLeads.assignedToId, access.userId));
    } else if (access.canReadSite && !access.canReadAssigned) {
      conditions.push(sql`${buyerCrmLeads.projectId} IS NOT NULL`);
    } else if (access.canReadSite && access.canReadAssigned) {
      if (query.scope === "assigned" || query.assignedTo === "me") {
        conditions.push(eq(buyerCrmLeads.assignedToId, access.userId));
      } else if (typeof query.projectId === "string" && isValidId(query.projectId)) {
        conditions.push(eq(buyerCrmLeads.projectId, query.projectId));
      } else {
        conditions.push(or(eq(buyerCrmLeads.assignedToId, access.userId), sql`${buyerCrmLeads.projectId} IS NOT NULL`)!);
      }
    }
  }

  if (typeof query.status === "string" && STATUSES.includes(query.status as typeof STATUSES[number])) {
    conditions.push(eq(buyerCrmLeads.status, query.status));
  }
  if (typeof query.source === "string" && SOURCES.includes(query.source as typeof SOURCES[number])) {
    conditions.push(eq(buyerCrmLeads.source, query.source));
  }
  if (typeof query.projectId === "string") {
    if (query.projectId === "GENERAL") conditions.push(sql`${buyerCrmLeads.projectId} IS NULL`);
    else if (isValidId(query.projectId)) conditions.push(eq(buyerCrmLeads.projectId, query.projectId));
  }
  if (typeof query.campaign === "string" && query.campaign.trim()) {
    conditions.push(eq(buyerCrmLeads.providerCampaignName, query.campaign.trim()));
  }
  if (typeof query.adName === "string" && query.adName.trim()) {
    conditions.push(eq(buyerCrmLeads.providerAdName, query.adName.trim()));
  }
  if (query.isDuplicate === "true") {
    conditions.push(eq(buyerCrmLeads.isDuplicate, true));
  } else if (query.isDuplicate === "false") {
    conditions.push(eq(buyerCrmLeads.isDuplicate, false));
  }
  if (access.isAdmin && typeof query.assignedTo === "string" && isValidId(query.assignedTo)) {
    conditions.push(eq(buyerCrmLeads.assignedToId, query.assignedTo));
  }

  if (typeof query.q === "string" && query.q.trim()) {
    const escaped = `%${query.q.trim().replace(/[\\%_]/g, "\\$&")}%`;
    conditions.push(or(
      ilike(buyerCrmLeads.fullName, escaped),
      ilike(buyerCrmLeads.phone, escaped),
      ilike(buyerCrmLeads.email, escaped),
      ilike(buyerCrmLeads.requirement, escaped),
      ilike(buyerCrmLeads.providerCampaignName, escaped),
      ilike(buyerCrmLeads.providerAdName, escaped),
      ilike(projects.name, escaped),
    )!);
  }
  return { conditions, page, limit };
}

router.use(authenticate);

router.get("/admin/summary", requireRole("ADMIN", "EMPLOYEE"), async (req: AuthedRequest, res: Response) => {
  const access = await getBuyerCrmAccess(req);
  if (!access) return res.status(403).json({ error: "Insufficient permissions for Buyer CRM." });

  const db = getDb();
  const scopeCondition: SQL[] = [];
  if (!access.isAdmin) {
    if (access.canReadAssigned && !access.canReadSite) {
      scopeCondition.push(eq(buyerCrmLeads.assignedToId, access.userId));
    } else if (access.canReadSite && !access.canReadAssigned) {
      scopeCondition.push(sql`${buyerCrmLeads.projectId} IS NOT NULL`);
    } else {
      scopeCondition.push(or(eq(buyerCrmLeads.assignedToId, access.userId), sql`${buyerCrmLeads.projectId} IS NOT NULL`)!);
    }
  }
  const scopeWhere = scopeCondition.length ? and(...scopeCondition) : undefined;

  const [crmStats] = await db.select({
    total: count(),
    new: sql<number>`count(*) FILTER (WHERE ${buyerCrmLeads.status} = 'NEW')::int`,
    projectInterests: sql<number>`count(*) FILTER (WHERE ${buyerCrmLeads.projectId} IS NOT NULL)::int`,
    broaderRequirements: sql<number>`count(*) FILTER (WHERE ${buyerCrmLeads.projectId} IS NULL AND ${buyerCrmLeads.requirement} IS NOT NULL AND ${buyerCrmLeads.requirement} <> '')::int`,
    followUpsDue: sql<number>`count(*) FILTER (WHERE ${buyerCrmLeads.nextFollowUpAt} <= now() AND ${buyerCrmLeads.status} NOT IN ('CONVERTED','LOST'))::int`,
    siteVisitsScheduled: sql<number>`count(*) FILTER (WHERE ${buyerCrmLeads.status} = 'SITE_VISIT_SCHEDULED')::int`,
    siteVisitsCompleted: sql<number>`count(*) FILTER (WHERE ${buyerCrmLeads.status} = 'SITE_VISIT_COMPLETED')::int`,
    bookingTokens: sql<number>`count(*) FILTER (WHERE ${buyerCrmLeads.status} = 'BOOKING_TOKEN')::int`,
    converted: sql<number>`count(*) FILTER (WHERE ${buyerCrmLeads.status} = 'CONVERTED')::int`,
    duplicates: sql<number>`count(*) FILTER (WHERE ${buyerCrmLeads.isDuplicate} = true)::int`,
  }).from(buyerCrmLeads).where(scopeWhere);

  const [registeredBuyers] = access.isAdmin
    ? await db.select({ total: count() }).from(users).where(eq(users.role, "BUYER"))
    : [{ total: 0 }];

  const bySource = await db.select({ source: buyerCrmLeads.source, total: count() })
    .from(buyerCrmLeads).where(scopeWhere).groupBy(buyerCrmLeads.source).orderBy(desc(count()));

  const [campaignRows, adRows] = await Promise.all([
    db.selectDistinct({ name: buyerCrmLeads.providerCampaignName })
      .from(buyerCrmLeads)
      .where(and(scopeWhere, sql`${buyerCrmLeads.providerCampaignName} IS NOT NULL AND ${buyerCrmLeads.providerCampaignName} <> ''`)),
    db.selectDistinct({ name: buyerCrmLeads.providerAdName })
      .from(buyerCrmLeads)
      .where(and(scopeWhere, sql`${buyerCrmLeads.providerAdName} IS NOT NULL AND ${buyerCrmLeads.providerAdName} <> ''`)),
  ]);

  res.json({
    leads: crmStats,
    registeredBuyers: registeredBuyers?.total ?? 0,
    bySource,
    distinctCampaigns: campaignRows.map((r) => r.name).filter(Boolean),
    distinctAds: adRows.map((r) => r.name).filter(Boolean),
    metaAdsConfigured: Boolean(process.env.META_LEADS_VERIFY_TOKEN?.trim() && process.env.META_LEADS_APP_SECRET?.trim() && process.env.META_LEADS_ACCESS_TOKEN?.trim()),
    userPermissions: {
      isAdmin: access.isAdmin,
      canReadAssigned: access.canReadAssigned,
      canReadSite: access.canReadSite,
      canUpdateStatus: access.canUpdateStatus,
      canCreateActivity: access.canCreateActivity,
    },
  });
});

router.get("/admin/projects", requireRole("ADMIN", "EMPLOYEE"), async (req: AuthedRequest, res: Response) => {
  const access = await getBuyerCrmAccess(req);
  if (!access) return res.status(403).json({ error: "Insufficient permissions for Buyer CRM." });
  const rows = await getDb().select({ _id: projects._id, name: projects.name, city: projects.city, location: projects.location })
    .from(projects).where(eq(projects.approvalStatus, "APPROVED")).orderBy(asc(projects.name));
  res.json({ projects: rows });
});

router.get("/admin/staff", requireRole("ADMIN"), async (_req: AuthedRequest, res: Response) => {
  const rows = await getDb().select({ _id: users._id, name: users.name, role: users.role })
    .from(users).where(and(inArray(users.role, ["ADMIN", "EMPLOYEE"]), eq(users.disabled, false))).orderBy(asc(users.name));
  res.json({ staff: rows });
});

router.get("/admin/leads", requireRole("ADMIN", "EMPLOYEE"), async (req: AuthedRequest, res: Response) => {
  const access = await getBuyerCrmAccess(req);
  if (!access) return res.status(403).json({ error: "Insufficient permissions for Buyer CRM." });

  const db = getDb();
  const { conditions, page, limit } = listFilters(req.query as Record<string, unknown>, access);
  const where = and(...conditions);
  const [countRow] = await db.select({ total: count() }).from(buyerCrmLeads)
    .leftJoin(projects, eq(buyerCrmLeads.projectId, projects._id)).where(where);
  const assignee = alias(users, "buyer_crm_assignee");
  const rows = await db.select({
    _id: buyerCrmLeads._id,
    buyerUserId: buyerCrmLeads.buyerUserId,
    fullName: buyerCrmLeads.fullName,
    phone: buyerCrmLeads.phone,
    email: buyerCrmLeads.email,
    source: buyerCrmLeads.source,
    status: buyerCrmLeads.status,
    propertyType: buyerCrmLeads.propertyType,
    preferredLocation: buyerCrmLeads.preferredLocation,
    budgetRange: buyerCrmLeads.budgetRange,
    purchasePurpose: buyerCrmLeads.purchasePurpose,
    purchaseTimeline: buyerCrmLeads.purchaseTimeline,
    requirement: buyerCrmLeads.requirement,
    contactConsent: buyerCrmLeads.contactConsent,
    consentBasis: buyerCrmLeads.consentBasis,
    nextFollowUpAt: buyerCrmLeads.nextFollowUpAt,
    assignedToId: buyerCrmLeads.assignedToId,
    providerLeadId: buyerCrmLeads.providerLeadId,
    providerPageId: buyerCrmLeads.providerPageId,
    providerFormId: buyerCrmLeads.providerFormId,
    providerAdId: buyerCrmLeads.providerAdId,
    providerAdName: buyerCrmLeads.providerAdName,
    providerCampaignId: buyerCrmLeads.providerCampaignId,
    providerCampaignName: buyerCrmLeads.providerCampaignName,
    providerAdsetId: buyerCrmLeads.providerAdsetId,
    providerAdsetName: buyerCrmLeads.providerAdsetName,
    isDuplicate: buyerCrmLeads.isDuplicate,
    duplicateCount: buyerCrmLeads.duplicateCount,
    createdAt: buyerCrmLeads.createdAt,
    updatedAt: buyerCrmLeads.updatedAt,
    project: { _id: projects._id, name: projects.name, city: projects.city },
    assignedTo: { _id: assignee._id, name: assignee.name },
  }).from(buyerCrmLeads)
    .leftJoin(projects, eq(buyerCrmLeads.projectId, projects._id))
    .leftJoin(assignee, eq(buyerCrmLeads.assignedToId, assignee._id))
    .where(where).orderBy(desc(buyerCrmLeads.updatedAt)).limit(limit).offset((page - 1) * limit);

  res.json({
    leads: rows.map((row) => ({
      ...row,
      project: row.project?._id ? row.project : null,
      assignedTo: row.assignedTo?._id ? row.assignedTo : null,
    })),
    total: countRow?.total ?? 0,
    page,
    limit,
  });
});

router.get("/admin/buyers", requireRole("ADMIN"), async (req: AuthedRequest, res: Response) => {
  const db = getDb();
  const page = Math.max(1, Math.min(10000, Number(req.query.page) || 1));
  const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 50));
  const conditions: SQL[] = [eq(users.role, "BUYER")];
  if (typeof req.query.q === "string" && req.query.q.trim()) {
    const escaped = `%${req.query.q.trim().replace(/[\\%_]/g, "\\$&")}%`;
    conditions.push(or(ilike(users.name, escaped), ilike(users.email, escaped), ilike(users.phone, escaped))!);
  }
  const where = and(...conditions);
  const [countRow] = await db.select({ total: count() }).from(users).where(where);
  const rows = await db.select({ _id: users._id, name: users.name, email: users.email, phone: users.phone, disabled: users.disabled, createdAt: users.createdAt })
    .from(users).where(where).orderBy(desc(users.createdAt)).limit(limit).offset((page - 1) * limit);
  const ids = rows.map((row) => row._id);
  const [requirementCounts, platformLeadCounts, crmLeadCounts] = ids.length ? await Promise.all([
    db.select({ buyerId: propertyRequirements.submittedById, total: count() }).from(propertyRequirements)
      .where(and(inArray(propertyRequirements.submittedById, ids), eq(propertyRequirements.requirementKind, "BUYER")))
      .groupBy(propertyRequirements.submittedById),
    db.select({ buyerId: leads.submittedById, total: count() }).from(leads)
      .where(inArray(leads.submittedById, ids)).groupBy(leads.submittedById),
    db.select({ buyerId: buyerCrmLeads.buyerUserId, total: count() }).from(buyerCrmLeads)
      .where(inArray(buyerCrmLeads.buyerUserId, ids)).groupBy(buyerCrmLeads.buyerUserId),
  ]) : [[], [], []];
  res.json({
    buyers: rows.map((row) => ({
      ...row,
      requirements: requirementCounts.find((value) => value.buyerId === row._id)?.total ?? 0,
      platformLeads: platformLeadCounts.find((value) => value.buyerId === row._id)?.total ?? 0,
      crmLeads: crmLeadCounts.find((value) => value.buyerId === row._id)?.total ?? 0,
    })),
    total: countRow?.total ?? 0,
    page,
    limit,
  });
});

router.get("/admin/buyers/:id/interests", requireRole("ADMIN"), async (req: AuthedRequest, res: Response) => {
  if (!isValidId(req.params.id)) return res.status(404).json({ error: "Registered buyer not found." });
  const db = getDb();
  const [buyer] = await db.select({ _id: users._id }).from(users)
    .where(and(eq(users._id, req.params.id), eq(users.role, "BUYER"))).limit(1);
  if (!buyer) return res.status(404).json({ error: "Registered buyer not found." });
  const [requirements, listingEnquiries, crmEnquiries] = await Promise.all([
    db.select({
      _id: propertyRequirements._id,
      title: propertyRequirements.title,
      propertyType: propertyRequirements.propertyType,
      city: propertyRequirements.city,
      location: propertyRequirements.location,
      minBudget: propertyRequirements.minBudget,
      maxBudget: propertyRequirements.maxBudget,
      purpose: propertyRequirements.purpose,
      timeline: propertyRequirements.timeline,
      details: propertyRequirements.details,
      status: propertyRequirements.status,
      createdAt: propertyRequirements.createdAt,
    }).from(propertyRequirements)
      .where(and(eq(propertyRequirements.submittedById, buyer._id), eq(propertyRequirements.requirementKind, "BUYER")))
      .orderBy(desc(propertyRequirements.createdAt)).limit(50),
    db.select({
      _id: leads._id,
      projectId: leads.projectId,
      projectName: projects.name,
      projectCity: projects.city,
      stage: leads.stage,
      requirement: leads.requirement,
      budgetRange: leads.budgetRange,
      purchasePurpose: leads.purchasePurpose,
      purchaseTimeline: leads.purchaseTimeline,
      createdAt: leads.createdAt,
    }).from(leads).leftJoin(projects, eq(leads.projectId, projects._id))
      .where(eq(leads.submittedById, buyer._id)).orderBy(desc(leads.createdAt)).limit(50),
    db.select({
      _id: buyerCrmLeads._id,
      source: buyerCrmLeads.source,
      status: buyerCrmLeads.status,
      projectName: projects.name,
      preferredLocation: buyerCrmLeads.preferredLocation,
      propertyType: buyerCrmLeads.propertyType,
      budgetRange: buyerCrmLeads.budgetRange,
      requirement: buyerCrmLeads.requirement,
      contactConsent: buyerCrmLeads.contactConsent,
      createdAt: buyerCrmLeads.createdAt,
    }).from(buyerCrmLeads).leftJoin(projects, eq(buyerCrmLeads.projectId, projects._id))
      .where(eq(buyerCrmLeads.buyerUserId, buyer._id)).orderBy(desc(buyerCrmLeads.createdAt)).limit(50),
  ]);
  res.json({ requirements, listingEnquiries, crmEnquiries });
});

router.post("/admin/leads", requireRole("ADMIN"), async (req: AuthedRequest, res: Response) => {
  const parsed = createLeadSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Check the buyer details." });
  const d = parsed.data;
  const phone = normalizePhone(d.phone);
  if (!/^[6-9]\d{9}$/.test(phone)) return res.status(400).json({ error: "Enter a valid 10-digit Indian mobile number." });
  const db = getDb();
  const projectId = d.projectId || null;
  if (projectId) {
    const [project] = await db.select({ _id: projects._id }).from(projects)
      .where(and(eq(projects._id, projectId), eq(projects.approvalStatus, "APPROVED"))).limit(1);
    if (!project) return res.status(400).json({ error: "Choose an approved project." });
  }
  if (d.assignedToId) {
    const [staff] = await db.select({ _id: users._id }).from(users)
      .where(and(eq(users._id, d.assignedToId), inArray(users.role, ["ADMIN", "EMPLOYEE"]), eq(users.disabled, false))).limit(1);
    if (!staff) return res.status(400).json({ error: "Choose an active admin or employee." });
  }
  const conditions = [eq(users.role, "BUYER"), or(
    sql`right(regexp_replace(coalesce(${users.phone}, ''), '\\D', '', 'g'), 10) = ${phone}`,
    ...(d.email ? [eq(users.email, d.email.trim().toLowerCase())] : []),
  )!];
  const [matchingBuyer] = await db.select({ _id: users._id }).from(users).where(and(...conditions)).limit(1);
  const [lead] = await db.insert(buyerCrmLeads).values({
    buyerUserId: matchingBuyer?._id ?? null,
    fullName: d.fullName,
    phone,
    email: d.email ? d.email.trim().toLowerCase() : null,
    source: d.source,
    status: "NEW",
    projectId,
    propertyType: d.propertyType || null,
    preferredLocation: d.preferredLocation || null,
    budgetRange: d.budgetRange || null,
    purchasePurpose: d.purchasePurpose || null,
    purchaseTimeline: d.purchaseTimeline || null,
    requirement: d.requirement || null,
    contactConsent: true,
    consentBasis: d.consentBasis,
    nextFollowUpAt: d.nextFollowUpAt ? new Date(d.nextFollowUpAt) : null,
    assignedToId: d.assignedToId || null,
    createdById: req.user!.userId,
  }).returning();
  await db.insert(buyerCrmActivities).values({ leadId: lead._id, actorUserId: req.user!.userId, type: "CREATED", content: `Added manually from ${d.source.replace(/_/g, " ").toLowerCase()}.` });
  await logAudit({ userId: req.user!.userId, action: "BUYER_CRM_LEAD_CREATED", resourceType: "buyer_crm_lead", resourceId: lead._id, metadata: { source: d.source, projectId } });
  res.status(201).json({ lead });
});

router.patch("/admin/leads/:id", requireRole("ADMIN", "EMPLOYEE"), async (req: AuthedRequest, res: Response) => {
  if (!isValidId(req.params.id)) return res.status(404).json({ error: "Buyer lead not found." });
  const access = await getBuyerCrmAccess(req);
  if (!access) return res.status(403).json({ error: "Insufficient permissions for Buyer CRM." });

  const parsed = updateLeadSchema.safeParse(req.body);
  if (!parsed.success || Object.keys(parsed.data ?? {}).length === 0) return res.status(400).json({ error: parsed.success ? "No changes supplied." : parsed.error.issues[0]?.message });
  const db = getDb();
  const [current] = await db.select().from(buyerCrmLeads).where(eq(buyerCrmLeads._id, req.params.id)).limit(1);
  if (!current) return res.status(404).json({ error: "Buyer lead not found." });

  const d = parsed.data;

  // Employee checks & restrictions
  if (!access.isAdmin) {
    if (!access.canUpdateStatus) {
      return res.status(403).json({ error: "You do not have permission to update buyer leads." });
    }
    const isAssigned = current.assignedToId === access.userId;
    const isSiteLead = Boolean(current.projectId) && access.canReadSite;
    if (!isAssigned && !isSiteLead) {
      return res.status(403).json({ error: "You cannot modify this lead." });
    }
    if (d.assignedToId !== undefined && d.assignedToId !== current.assignedToId) {
      return res.status(403).json({ error: "Only administrators can assign or reassign leads." });
    }
    if (d.projectId !== undefined && d.projectId !== current.projectId) {
      return res.status(403).json({ error: "Only administrators can re-link leads to another project." });
    }
  }

  if (d.projectId === null && ![d.requirement ?? current.requirement, current.propertyType, current.preferredLocation, current.budgetRange].some((value) => Boolean(value?.trim()))) {
    return res.status(400).json({ error: "Add a broader requirement before unlinking this project." });
  }
  if (d.projectId) {
    const [project] = await db.select({ _id: projects._id }).from(projects).where(and(eq(projects._id, d.projectId), eq(projects.approvalStatus, "APPROVED"))).limit(1);
    if (!project) return res.status(400).json({ error: "Choose an approved project." });
  }
  if (d.assignedToId) {
    const [staff] = await db.select({ _id: users._id }).from(users).where(and(eq(users._id, d.assignedToId), inArray(users.role, ["ADMIN", "EMPLOYEE"]), eq(users.disabled, false))).limit(1);
    if (!staff) return res.status(400).json({ error: "Choose an active admin or employee." });
  }

  const update: Partial<typeof buyerCrmLeads.$inferInsert> = { updatedAt: new Date() };
  if (d.status !== undefined) update.status = d.status;
  if (d.projectId !== undefined && access.isAdmin) update.projectId = d.projectId;
  if (d.nextFollowUpAt !== undefined) update.nextFollowUpAt = d.nextFollowUpAt ? new Date(d.nextFollowUpAt) : null;
  if (d.assignedToId !== undefined && access.isAdmin) update.assignedToId = d.assignedToId;
  if (d.requirement !== undefined) update.requirement = d.requirement;
  if (d.contactConsent !== undefined) update.contactConsent = d.contactConsent;
  if (d.consentBasis !== undefined) update.consentBasis = d.consentBasis;

  const [lead] = await db.update(buyerCrmLeads).set(update).where(eq(buyerCrmLeads._id, current._id)).returning();
  const activities: Array<{ type: string; content: string }> = [];
  if (d.status && d.status !== current.status) activities.push({ type: "STATUS", content: `Status changed from ${current.status} to ${d.status}.` });
  if (d.projectId !== undefined && d.projectId !== current.projectId) activities.push({ type: "PROJECT", content: d.projectId ? "Linked to a project." : "Project link removed; this is now a broader requirement." });
  if (d.nextFollowUpAt !== undefined && (d.nextFollowUpAt ? new Date(d.nextFollowUpAt).getTime() : null) !== (current.nextFollowUpAt?.getTime() ?? null)) activities.push({ type: "FOLLOW_UP", content: d.nextFollowUpAt ? `Follow-up set for ${new Date(d.nextFollowUpAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}.` : "Follow-up reminder cleared." });
  if (d.assignedToId !== undefined && d.assignedToId !== current.assignedToId) activities.push({ type: "ASSIGNMENT", content: d.assignedToId ? "Buyer lead assigned to a team member." : "Buyer lead unassigned." });
  if (d.contactConsent === false && current.contactConsent) activities.push({ type: "CONSENT", content: "Contact permission was withdrawn." });
  if (d.contactConsent === true && !current.contactConsent) activities.push({ type: "CONSENT", content: `Contact permission recorded: ${d.consentBasis}` });
  if (activities.length) await db.insert(buyerCrmActivities).values(activities.map((activity) => ({ ...activity, leadId: current._id, actorUserId: req.user!.userId })));
  await logAudit({ userId: req.user!.userId, action: "BUYER_CRM_LEAD_UPDATED", resourceType: "buyer_crm_lead", resourceId: current._id, metadata: { fields: Object.keys(d) } });
  res.json({ lead });
});

router.post("/admin/leads/:id/activities", requireRole("ADMIN", "EMPLOYEE"), async (req: AuthedRequest, res: Response) => {
  if (!isValidId(req.params.id)) return res.status(404).json({ error: "Buyer lead not found." });
  const access = await getBuyerCrmAccess(req);
  if (!access) return res.status(403).json({ error: "Insufficient permissions for Buyer CRM." });

  if (!access.isAdmin && !access.canCreateActivity) {
    return res.status(403).json({ error: "You do not have permission to log activities." });
  }

  const parsed = z.object({ type: z.enum(ACTIVITY_TYPES), content: z.string().trim().min(2).max(1200) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Enter a short activity note." });
  const db = getDb();
  const [lead] = await db.select().from(buyerCrmLeads).where(eq(buyerCrmLeads._id, req.params.id)).limit(1);
  if (!lead) return res.status(404).json({ error: "Buyer lead not found." });

  if (!access.isAdmin) {
    const isAssigned = lead.assignedToId === access.userId;
    const isSiteLead = Boolean(lead.projectId) && access.canReadSite;
    if (!isAssigned && !isSiteLead) {
      return res.status(403).json({ error: "You cannot add notes to this lead." });
    }
  }

  const [activity] = await db.insert(buyerCrmActivities).values({ leadId: lead._id, actorUserId: req.user!.userId, type: parsed.data.type, content: parsed.data.content }).returning();
  await db.update(buyerCrmLeads).set({ updatedAt: new Date() }).where(eq(buyerCrmLeads._id, lead._id));
  res.status(201).json({ activity });
});

router.get("/admin/leads/:id/activities", requireRole("ADMIN", "EMPLOYEE"), async (req: AuthedRequest, res: Response) => {
  if (!isValidId(req.params.id)) return res.status(404).json({ error: "Buyer lead not found." });
  const access = await getBuyerCrmAccess(req);
  if (!access) return res.status(403).json({ error: "Insufficient permissions for Buyer CRM." });

  const db = getDb();
  const [lead] = await db.select({ _id: buyerCrmLeads._id, assignedToId: buyerCrmLeads.assignedToId, projectId: buyerCrmLeads.projectId })
    .from(buyerCrmLeads).where(eq(buyerCrmLeads._id, req.params.id)).limit(1);
  if (!lead) return res.status(404).json({ error: "Buyer lead not found." });

  if (!access.isAdmin) {
    const isAssigned = lead.assignedToId === access.userId;
    const isSiteLead = Boolean(lead.projectId) && access.canReadSite;
    if (!isAssigned && !isSiteLead) {
      return res.status(403).json({ error: "You cannot view activities for this lead." });
    }
  }

  const rows = await db.select({ _id: buyerCrmActivities._id, type: buyerCrmActivities.type, content: buyerCrmActivities.content, createdAt: buyerCrmActivities.createdAt, actor: users.name })
    .from(buyerCrmActivities).leftJoin(users, eq(buyerCrmActivities.actorUserId, users._id))
    .where(eq(buyerCrmActivities.leadId, req.params.id)).orderBy(desc(buyerCrmActivities.createdAt)).limit(100);
  res.json({ activities: rows });
});

/* =========================================================================
 * Meta Lead Ad Form & Campaign Mapping Endpoints (Admin Only)
 * ========================================================================= */

router.get("/admin/meta-mappings", requireRole("ADMIN"), async (_req: AuthedRequest, res: Response) => {
  const rows = await getDb().select({
    _id: metaAdFormMappings._id,
    formId: metaAdFormMappings.formId,
    formName: metaAdFormMappings.formName,
    adId: metaAdFormMappings.adId,
    adName: metaAdFormMappings.adName,
    campaignId: metaAdFormMappings.campaignId,
    campaignName: metaAdFormMappings.campaignName,
    projectId: metaAdFormMappings.projectId,
    isActive: metaAdFormMappings.isActive,
    createdAt: metaAdFormMappings.createdAt,
    updatedAt: metaAdFormMappings.updatedAt,
    project: { _id: projects._id, name: projects.name, city: projects.city },
  }).from(metaAdFormMappings)
    .leftJoin(projects, eq(metaAdFormMappings.projectId, projects._id))
    .orderBy(desc(metaAdFormMappings.createdAt));

  res.json({ mappings: rows });
});

router.post("/admin/meta-mappings", requireRole("ADMIN"), async (req: AuthedRequest, res: Response) => {
  const parsed = createMappingSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid mapping details." });
  const d = parsed.data;
  const db = getDb();

  const [project] = await db.select({ _id: projects._id, name: projects.name }).from(projects)
    .where(and(eq(projects._id, d.projectId), eq(projects.approvalStatus, "APPROVED"))).limit(1);
  if (!project) return res.status(400).json({ error: "Selected project was not found or is not approved." });

  const [mapping] = await db.insert(metaAdFormMappings).values({
    formId: d.formId,
    formName: d.formName || null,
    adId: d.adId || null,
    adName: d.adName || null,
    campaignId: d.campaignId || null,
    campaignName: d.campaignName || null,
    projectId: d.projectId,
    isActive: true,
    createdById: req.user!.userId,
  }).returning();

  await logAudit({
    userId: req.user!.userId,
    action: "META_MAPPING_CREATED",
    resourceType: "meta_ad_form_mapping",
    resourceId: mapping._id,
    metadata: { formId: d.formId, projectId: d.projectId, projectName: project.name },
  });

  res.status(201).json({ mapping: { ...mapping, project } });
});

router.patch("/admin/meta-mappings/:id", requireRole("ADMIN"), async (req: AuthedRequest, res: Response) => {
  if (!isValidId(req.params.id)) return res.status(404).json({ error: "Mapping not found." });
  const parsed = updateMappingSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid mapping updates." });
  const d = parsed.data;
  const db = getDb();

  const [current] = await db.select().from(metaAdFormMappings).where(eq(metaAdFormMappings._id, req.params.id)).limit(1);
  if (!current) return res.status(404).json({ error: "Mapping not found." });

  if (d.projectId) {
    const [project] = await db.select({ _id: projects._id }).from(projects)
      .where(and(eq(projects._id, d.projectId), eq(projects.approvalStatus, "APPROVED"))).limit(1);
    if (!project) return res.status(400).json({ error: "Selected project was not found." });
  }

  const update: Partial<typeof metaAdFormMappings.$inferInsert> = { updatedAt: new Date() };
  if (d.formId !== undefined) update.formId = d.formId;
  if (d.formName !== undefined) update.formName = d.formName;
  if (d.adId !== undefined) update.adId = d.adId;
  if (d.adName !== undefined) update.adName = d.adName;
  if (d.campaignId !== undefined) update.campaignId = d.campaignId;
  if (d.campaignName !== undefined) update.campaignName = d.campaignName;
  if (d.projectId !== undefined) update.projectId = d.projectId;
  if (d.isActive !== undefined) update.isActive = d.isActive;

  const [mapping] = await db.update(metaAdFormMappings).set(update).where(eq(metaAdFormMappings._id, current._id)).returning();
  res.json({ mapping });
});

router.delete("/admin/meta-mappings/:id", requireRole("ADMIN"), async (req: AuthedRequest, res: Response) => {
  if (!isValidId(req.params.id)) return res.status(404).json({ error: "Mapping not found." });
  const db = getDb();
  const [deleted] = await db.delete(metaAdFormMappings).where(eq(metaAdFormMappings._id, req.params.id)).returning();
  if (!deleted) return res.status(404).json({ error: "Mapping not found." });
  await logAudit({
    userId: req.user!.userId,
    action: "META_MAPPING_DELETED",
    resourceType: "meta_ad_form_mapping",
    resourceId: deleted._id,
    metadata: { formId: deleted.formId, projectId: deleted.projectId },
  });
  res.json({ success: true });
});

/* =========================================================================
 * Meta Lead Extraction & Validation Engine
 * ========================================================================= */

type MetaField = { name?: unknown; values?: unknown };
type MetaLead = {
  id?: unknown;
  created_time?: unknown;
  form_id?: unknown;
  ad_id?: unknown;
  ad_name?: unknown;
  campaign_id?: unknown;
  campaign_name?: unknown;
  adset_id?: unknown;
  adset_name?: unknown;
  field_data?: unknown;
};

function safeText(value: unknown, limit = 250): string {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function normalizeFieldKey(key: string): string {
  return key
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function fieldsToMap(value: unknown): Map<string, string> {
  const map = new Map<string, string>();
  if (!Array.isArray(value)) return map;
  for (const item of value as MetaField[]) {
    const rawName = safeText(item.name, 150);
    const name = normalizeFieldKey(rawName);
    const raw = Array.isArray(item.values) ? item.values[0] : item.values;
    const answer = safeText(raw, 1200);
    if (name && answer) map.set(name, answer);
  }
  return map;
}

function firstField(fields: Map<string, string>, ...names: string[]): string {
  for (const name of names) {
    const result = fields.get(normalizeFieldKey(name));
    if (result) return result;
  }
  return "";
}

function extractMetaFieldValues(fields: Map<string, string>) {
  const findValue = (...patterns: (string | RegExp)[]): string => {
    for (const pat of patterns) {
      if (typeof pat === "string") {
        const val = fields.get(normalizeFieldKey(pat));
        if (val && val.trim()) return val.trim();
      } else {
        for (const [k, val] of fields.entries()) {
          if (pat.test(k) && val && val.trim()) return val.trim();
        }
      }
    }
    return "";
  };

  // 1. Phone number (Mandatory - must be valid Indian 10-digit number)
  const rawPhone = findValue(
    "phone_number",
    "phone",
    "mobile_number",
    "contact_number",
    "contact",
    /phone|mobile|contact/i
  );
  const phone = normalizePhone(rawPhone);
  const isPhoneValid = /^[6-9]\d{9}$/.test(phone);

  // 2. Full Name (Mandatory)
  const firstName = findValue("first_name", /first_?name/i);
  const lastName = findValue("last_name", /last_?name/i);
  const combinedName = [firstName, lastName].filter(Boolean).join(" ");
  const rawFullName = findValue(
    "full_name",
    "name",
    "buyer_name",
    /full_?name|buyer_?name/i
  ) || combinedName;
  const fullName = rawFullName.trim().slice(0, 100);
  const isNameValid = fullName.length > 0 && !/^(unknown|ad lead|lead|n\/a|na|null|undefined|-)$/i.test(fullName);

  // 3. Email (Mandatory)
  const rawEmail = findValue(
    "email_id",
    "email",
    "email_address",
    /email/i
  ).toLowerCase().trim();
  const isEmailValid = rawEmail.length > 3 && rawEmail.includes("@") && rawEmail.includes(".");

  // Mandatory trio: Phone, Email, and Name must all be present.
  const isValidLead = isPhoneValid && isNameValid && isEmailValid;

  // 4. City (Optional: e.g. "city", "preferred_city", "location")
  const city = findValue(
    "city",
    "preferred_city",
    "location",
    "preferred_location",
    /city|location/i
  ).slice(0, 100) || null;

  // 5. Site visit timing: kab_aap_site_visit_karna_chahenge? (Optional)
  const siteVisitPreference = findValue(
    "kab_aap_site_visit_karna_chahenge",
    "site_visit",
    "preferred_site_visit",
    "site_visit_timing",
    /site_?visit|kab.*visit|visit.*karna/i
  ).slice(0, 200) || null;

  // 6. Plot size: aap_kitne_size_ka_plot_prefer_karenge? (Optional)
  const plotSize = findValue(
    "aap_kitne_size_ka_plot_prefer_karenge",
    "plot_size",
    "preferred_plot_size",
    "size_of_plot",
    /plot_?size|size.*plot|kitne.*size/i
  ).slice(0, 200) || null;

  // 7. Approximate budget: aapka_approximate_budget_kya_hai? (Optional)
  const budget = findValue(
    "aapka_approximate_budget_kya_hai",
    "approximate_budget",
    "budget_range",
    "budget",
    /approx.*budget|budget.*hai|budget/i
  ).slice(0, 100) || null;

  // 8. General requirement / additional notes (Optional)
  const generalReq = findValue(
    "requirement",
    "property_requirement",
    "what_are_you_looking_for",
    "additional_requirements",
    /requirement|looking_for/i
  );

  // Assemble structured requirement summary
  const reqParts: string[] = [];
  if (plotSize) reqParts.push(`Plot Size: ${plotSize}`);
  if (siteVisitPreference) reqParts.push(`Site Visit: ${siteVisitPreference}`);
  if (generalReq && !reqParts.some((p) => p.toLowerCase().includes(generalReq.toLowerCase()))) {
    reqParts.push(generalReq);
  }
  const requirement = reqParts.join(" | ").slice(0, 500) || null;

  // Property type: Plot if plot size is mentioned, or custom property type
  const propertyType = plotSize ? "Plot" : findValue("property_type", "type_of_property", /property_?type/i) || null;

  return {
    phone,
    fullName,
    email: rawEmail || null,
    isValidLead,
    isPhoneValid,
    isNameValid,
    isEmailValid,
    city,
    siteVisitPreference,
    plotSize,
    budget,
    requirement,
    propertyType,
  };
}

router.post("/admin/meta-mappings/:id/sync", requireRole("ADMIN"), async (req: AuthedRequest, res: Response) => {
  if (!isValidId(req.params.id)) return res.status(404).json({ error: "Mapping not found." });
  const db = getDb();
  const [mapping] = await db.select().from(metaAdFormMappings).where(eq(metaAdFormMappings._id, req.params.id)).limit(1);
  if (!mapping) return res.status(404).json({ error: "Mapping not found." });

  const token = process.env.META_LEADS_ACCESS_TOKEN?.trim();
  if (!token) {
    return res.status(400).json({
      error: "META_LEADS_ACCESS_TOKEN is not configured in .env. Please configure it or use the 'Import Meta CSV' option.",
    });
  }

  const graphVersion = (process.env.META_GRAPH_API_VERSION?.trim() || "v27.0").replace(/^v?/, "v");
  let nextUrl: string | null = `https://graph.facebook.com/${graphVersion}/${encodeURIComponent(mapping.formId)}/leads?fields=id,created_time,field_data,ad_id,ad_name,form_id,campaign_id,campaign_name,adset_id,adset_name&limit=100&access_token=${encodeURIComponent(token)}`;

  let totalFetched = 0;
  let inserted = 0;
  let duplicates = 0;
  let skipped = 0;
  let pagesCount = 0;

  try {
    while (nextUrl && pagesCount < 10) {
      pagesCount += 1;
      const resp = await fetch(nextUrl, { signal: AbortSignal.timeout(20_000) });
      if (!resp.ok) {
        const errText = await resp.text().catch(() => "");
        throw new Error(`Meta Graph API error (${resp.status}): ${errText}`);
      }
      const pageData = await resp.json() as { data?: MetaLead[]; paging?: { next?: string } };
      const list = Array.isArray(pageData.data) ? pageData.data : [];
      if (!list.length) break;

      for (const item of list) {
        totalFetched += 1;
        const providerLeadId = safeText(item.id, 160);
        const fields = fieldsToMap(item.field_data);
        const extracted = extractMetaFieldValues(fields);

        // Name, Phone, and Email are mandatory
        if (!extracted.isValidLead) {
          skipped += 1;
          continue;
        }

        const purpose = firstField(fields, "purchase_purpose", "purpose").toLowerCase();
        const normalizedPurpose = purpose.includes("invest") ? "INVESTMENT" : purpose.includes("self") || purpose.includes("live") ? "SELF_USE" : purpose ? "UNDECIDED" : null;
        const consentField = ["contact_consent", "consent_to_contact", "marketing_consent", "agree_to_contact", "consent"]
          .map((f) => fields.get(f)).find(Boolean);
        const consentGranted = Boolean(consentField && /^(?:yes\b|true\b|1$|i\s+agree\b|agree(?:d)?\b|opt[\s-]?in\b)/i.test(consentField.trim()));

        const [existing] = await db.select({
          _id: buyerCrmLeads._id,
          duplicateCount: buyerCrmLeads.duplicateCount,
          projectId: buyerCrmLeads.projectId,
          email: buyerCrmLeads.email,
          preferredLocation: buyerCrmLeads.preferredLocation,
          budgetRange: buyerCrmLeads.budgetRange,
          propertyType: buyerCrmLeads.propertyType,
          purchaseTimeline: buyerCrmLeads.purchaseTimeline,
          requirement: buyerCrmLeads.requirement,
        })
          .from(buyerCrmLeads)
          .where(or(
            eq(buyerCrmLeads.phone, extracted.phone),
            ...(providerLeadId ? [eq(buyerCrmLeads.providerLeadId, providerLeadId)] : [])
          )!)
          .limit(1);

        if (existing) {
          duplicates += 1;
          const updates: Partial<typeof buyerCrmLeads.$inferInsert> = {
            isDuplicate: true,
            duplicateCount: (existing.duplicateCount || 1) + 1,
            updatedAt: new Date(),
          };
          if (!existing.projectId && mapping.projectId) updates.projectId = mapping.projectId;
          if (!existing.email && extracted.email) updates.email = extracted.email;
          if (!existing.preferredLocation && extracted.city) updates.preferredLocation = extracted.city;
          if (!existing.budgetRange && extracted.budget) updates.budgetRange = extracted.budget;
          if (!existing.propertyType && extracted.propertyType) updates.propertyType = extracted.propertyType;
          if (!existing.purchaseTimeline && extracted.siteVisitPreference) updates.purchaseTimeline = extracted.siteVisitPreference;
          if (!existing.requirement && extracted.requirement) updates.requirement = extracted.requirement;

          await db.update(buyerCrmLeads).set(updates).where(eq(buyerCrmLeads._id, existing._id));
          continue;
        }

        const rawCreatedAt = item.created_time ? new Date(String(item.created_time)) : new Date();
        const leadCreatedAt = isNaN(rawCreatedAt.getTime()) ? new Date() : rawCreatedAt;

        await db.insert(buyerCrmLeads).values({
          fullName: extracted.fullName,
          phone: extracted.phone,
          email: extracted.email,
          source: "META_AD",
          status: "NEW",
          projectId: mapping.projectId,
          propertyType: extracted.propertyType,
          preferredLocation: extracted.city,
          budgetRange: extracted.budget,
          purchasePurpose: normalizedPurpose,
          purchaseTimeline: extracted.siteVisitPreference,
          requirement: extracted.requirement,
          contactConsent: consentGranted,
          consentBasis: consentGranted ? `Meta form consent: ${consentField}` : "Synced from Meta Lead Form history",
          providerLeadId: providerLeadId || null,
          providerFormId: mapping.formId,
          providerAdId: safeText(item.ad_id, 160) || mapping.adId || null,
          providerAdName: safeText(item.ad_name, 250) || mapping.adName || null,
          providerCampaignId: safeText(item.campaign_id, 160) || mapping.campaignId || null,
          providerCampaignName: safeText(item.campaign_name, 250) || mapping.campaignName || null,
          providerAdsetId: safeText(item.adset_id, 160) || null,
          providerAdsetName: safeText(item.adset_name, 250) || null,
          isDuplicate: false,
          duplicateCount: 1,
          createdAt: leadCreatedAt,
          createdById: req.user!.userId,
        }).onConflictDoNothing();

        inserted += 1;
      }

      nextUrl = pageData.paging?.next || null;
    }

    await logAudit({
      userId: req.user!.userId,
      action: "META_FORM_LEADS_SYNCED",
      resourceType: "meta_ad_form_mapping",
      resourceId: mapping._id,
      metadata: { formId: mapping.formId, projectId: mapping.projectId, totalFetched, inserted, duplicates, skipped },
    });

    res.json({ success: true, totalFetched, inserted, duplicates, skipped });
  } catch (err: any) {
    console.warn("Meta lead form sync failed:", err?.message || err);
    res.status(502).json({ error: err?.message || "Failed to fetch leads from Meta Graph API." });
  }
});

router.post("/admin/import-leads-csv", requireRole("ADMIN"), upload.single("file"), async (req: AuthedRequest, res: Response) => {
  if (!req.file) return res.status(400).json({ error: "Choose a CSV file to upload." });
  const targetProjectId = req.body.projectId && isValidId(req.body.projectId) ? req.body.projectId : null;
  const db = getDb();

  const csvText = req.file.buffer.toString("utf8");
  const parsed = Papa.parse<Record<string, string>>(csvText, { header: true, skipEmptyLines: true });
  if (!parsed.data || !parsed.data.length) {
    return res.status(400).json({ error: "The CSV file contains no data rows." });
  }

  let inserted = 0;
  let duplicates = 0;
  let skipped = 0;

  const mappings = await db.select().from(metaAdFormMappings).where(eq(metaAdFormMappings.isActive, true));

  for (const row of parsed.data) {
    const fields = new Map<string, string>();
    for (const [k, v] of Object.entries(row)) {
      const cleanKey = normalizeFieldKey(k);
      if (cleanKey && v != null && String(v).trim()) {
        fields.set(cleanKey, String(v).trim());
      }
    }

    const extracted = extractMetaFieldValues(fields);

    // Name, Phone, and Email are mandatory
    if (!extracted.isValidLead) {
      skipped += 1;
      continue;
    }

    const keys = Object.keys(row);
    const adKey = keys.find((k) => /ad_?name/i.test(k));
    const campaignKey = keys.find((k) => /campaign_?name/i.test(k));
    const formIdKey = keys.find((k) => /form_?id/i.test(k));
    const formId = formIdKey ? String(row[formIdKey] || "").trim() : null;

    let resolvedProjectId = targetProjectId;
    if (!resolvedProjectId && formId) {
      const match = mappings.find((m) => m.formId === formId);
      if (match) resolvedProjectId = match.projectId;
    }

    const leadIdKey = keys.find((k) => /^id$|lead_?id/i.test(k));
    const providerLeadId = leadIdKey ? String(row[leadIdKey] || "").trim() : null;

    const createdTimeKey = keys.find((k) => /created_?time|date/i.test(k));
    const rawTime = createdTimeKey ? row[createdTimeKey] : null;
    const rawCreatedAt = rawTime ? new Date(String(rawTime)) : new Date();
    const createdAt = isNaN(rawCreatedAt.getTime()) ? new Date() : rawCreatedAt;

    const [existing] = await db.select({
      _id: buyerCrmLeads._id,
      duplicateCount: buyerCrmLeads.duplicateCount,
      projectId: buyerCrmLeads.projectId,
      email: buyerCrmLeads.email,
      preferredLocation: buyerCrmLeads.preferredLocation,
      budgetRange: buyerCrmLeads.budgetRange,
      propertyType: buyerCrmLeads.propertyType,
      purchaseTimeline: buyerCrmLeads.purchaseTimeline,
      requirement: buyerCrmLeads.requirement,
    })
      .from(buyerCrmLeads)
      .where(eq(buyerCrmLeads.phone, extracted.phone))
      .limit(1);

    if (existing) {
      duplicates += 1;
      const updates: Partial<typeof buyerCrmLeads.$inferInsert> = {
        isDuplicate: true,
        duplicateCount: (existing.duplicateCount || 1) + 1,
        updatedAt: new Date(),
      };
      if (!existing.projectId && resolvedProjectId) updates.projectId = resolvedProjectId;
      if (!existing.email && extracted.email) updates.email = extracted.email;
      if (!existing.preferredLocation && extracted.city) updates.preferredLocation = extracted.city;
      if (!existing.budgetRange && extracted.budget) updates.budgetRange = extracted.budget;
      if (!existing.propertyType && extracted.propertyType) updates.propertyType = extracted.propertyType;
      if (!existing.purchaseTimeline && extracted.siteVisitPreference) updates.purchaseTimeline = extracted.siteVisitPreference;
      if (!existing.requirement && extracted.requirement) updates.requirement = extracted.requirement;

      await db.update(buyerCrmLeads).set(updates).where(eq(buyerCrmLeads._id, existing._id));
      continue;
    }

    await db.insert(buyerCrmLeads).values({
      fullName: extracted.fullName,
      phone: extracted.phone,
      email: extracted.email,
      source: "META_AD",
      status: "NEW",
      projectId: resolvedProjectId,
      propertyType: extracted.propertyType,
      preferredLocation: extracted.city,
      budgetRange: extracted.budget,
      purchaseTimeline: extracted.siteVisitPreference,
      requirement: extracted.requirement,
      contactConsent: true,
      consentBasis: "Imported from Meta Lead Ads CSV export",
      providerLeadId: providerLeadId || null,
      providerFormId: formId || null,
      providerAdName: adKey ? String(row[adKey] || "").slice(0, 250) : null,
      providerCampaignName: campaignKey ? String(row[campaignKey] || "").slice(0, 250) : null,
      isDuplicate: false,
      duplicateCount: 1,
      createdAt,
      createdById: req.user!.userId,
    }).onConflictDoNothing();

    inserted += 1;
  }

  await logAudit({
    userId: req.user!.userId,
    action: "BUYER_CRM_LEADS_CSV_IMPORTED",
    resourceType: "buyer_crm_lead",
    resourceId: targetProjectId || "all",
    metadata: { totalRows: parsed.data.length, inserted, duplicates, skipped },
  });

  res.json({ success: true, totalRows: parsed.data.length, inserted, duplicates, skipped });
});

export default router;

/* =========================================================================
 * Meta Lead Ads Webhook Receiver & Processor
 * ========================================================================= */

function textEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function verifyMetaSignature(body: Buffer, header: string | undefined, appSecret: string): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const received = Buffer.from(header.slice(7), "hex");
  const expected = createHmac("sha256", appSecret).update(body).digest();
  return received.length === expected.length && timingSafeEqual(received, expected);
}

/** Meta verifies the endpoint with a GET challenge and signs notifications with X-Hub-Signature-256. */
export async function metaLeadWebhookHandler(req: Request, res: Response) {
  const verifyToken = process.env.META_LEADS_VERIFY_TOKEN?.trim() ?? "";
  const appSecret = process.env.META_LEADS_APP_SECRET?.trim() ?? "";
  if (req.method === "GET") {
    if (!verifyToken) return res.status(503).send("Meta lead capture is not configured.");
    const mode = safeText(req.query["hub.mode"]);
    const token = safeText(req.query["hub.verify_token"]);
    const challenge = safeText(req.query["hub.challenge"], 100);
    if (mode !== "subscribe" || !textEquals(token, verifyToken) || !challenge) return res.status(403).send("Verification failed.");
    return res.status(200).type("text/plain").send(challenge);
  }
  if (!getDatabaseStatus().connected) return res.status(503).send("Truvi is starting; retry shortly.");
  if (!verifyToken || !appSecret || !process.env.META_LEADS_ACCESS_TOKEN?.trim()) {
    return res.status(503).json({ error: "Meta lead capture is not configured." });
  }
  if (!Buffer.isBuffer(req.body)) return res.status(400).json({ error: "Expected a raw JSON webhook body." });
  if (!verifyMetaSignature(req.body, req.get("x-hub-signature-256"), appSecret)) return res.status(401).json({ error: "Invalid webhook signature." });

  let event: { object?: unknown; entry?: Array<{ id?: unknown; changes?: Array<{ field?: unknown; value?: Record<string, unknown> }> }> };
  try { event = JSON.parse(req.body.toString("utf8")) as typeof event; }
  catch { return res.status(400).json({ error: "Invalid webhook JSON." }); }
  if (event.object !== "page" || !Array.isArray(event.entry)) return res.status(200).json({ received: true, ignored: true });

  const graphVersion = (process.env.META_GRAPH_API_VERSION?.trim() || "v27.0").replace(/^v?/, "v");
  if (!/^v\d+\.\d+$/.test(graphVersion)) return res.status(500).json({ error: "Meta Graph API version is not configured correctly." });
  const db = getDb();
  let captured = 0;
  try {
    for (const entry of event.entry) {
      for (const change of entry.changes ?? []) {
        if (change.field !== "leadgen") continue;
        const leadId = safeText(change.value?.leadgen_id, 160);
        if (!leadId) throw new Error("Meta notification was missing a lead ID.");

        const url = new URL(`https://graph.facebook.com/${graphVersion}/${encodeURIComponent(leadId)}`);
        url.searchParams.set("fields", "id,created_time,field_data,ad_id,ad_name,form_id,campaign_id,campaign_name,adset_id,adset_name");
        url.searchParams.set("access_token", process.env.META_LEADS_ACCESS_TOKEN!.trim());

        const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
        if (!response.ok) throw new Error(`Meta lead details could not be fetched (${response.status}).`);
        const data = await response.json() as MetaLead;
        const providerLeadId = safeText(data.id ?? leadId, 160);
        if (!providerLeadId) throw new Error("Meta lead details did not include a lead ID.");

        const fields = fieldsToMap(data.field_data);
        const extracted = extractMetaFieldValues(fields);
        if (!extracted.isValidLead) throw new Error("Meta lead details did not include valid name, email, and Indian mobile number.");

        const providerFormId = safeText(data.form_id ?? change.value?.form_id, 160) || null;
        const providerAdId = safeText(data.ad_id ?? change.value?.ad_id, 160) || null;
        const providerAdName = safeText(data.ad_name, 250) || null;
        const providerCampaignId = safeText(data.campaign_id ?? change.value?.campaign_id, 160) || null;
        const providerCampaignName = safeText(data.campaign_name, 250) || null;
        const providerAdsetId = safeText(data.adset_id ?? change.value?.adset_id, 160) || null;
        const providerAdsetName = safeText(data.adset_name, 250) || null;
        const providerPageId = safeText(change.value?.page_id ?? entry.id, 160) || null;

        // 1. Site attribution: Check metaAdFormMappings table
        let projectId: string | null = null;
        const mappingOrs = [];
        if (providerFormId) mappingOrs.push(eq(metaAdFormMappings.formId, providerFormId));
        if (providerAdId) mappingOrs.push(eq(metaAdFormMappings.adId, providerAdId));
        if (providerCampaignId) mappingOrs.push(eq(metaAdFormMappings.campaignId, providerCampaignId));

        if (mappingOrs.length > 0) {
          const [mapping] = await db.select({ projectId: metaAdFormMappings.projectId })
            .from(metaAdFormMappings)
            .where(and(eq(metaAdFormMappings.isActive, true), or(...mappingOrs)!))
            .limit(1);
          if (mapping) projectId = mapping.projectId;
        }

        // 2. Fallback to form field value (project_id, project_name, etc.)
        if (!projectId) {
          const rawAnswer = firstField(fields, "project_id", "project", "project_name", "site", "property_name");
          const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawAnswer);
          if (isUuid) {
            const [p] = await db.select({ _id: projects._id }).from(projects).where(and(eq(projects._id, rawAnswer), eq(projects.approvalStatus, "APPROVED"))).limit(1);
            projectId = p?._id ?? null;
          } else if (rawAnswer) {
            const exactProjectName = rawAnswer.replace(/[\\%_]/g, "\\$&");
            const [p] = await db.select({ _id: projects._id }).from(projects).where(and(eq(projects.approvalStatus, "APPROVED"), ilike(projects.name, `%${exactProjectName}%`))).limit(1);
            projectId = p?._id ?? null;
          }
        }

        // 3. Fallback to scanning ad_name or campaign_name for approved project names
        if (!projectId) {
          const textToScan = `${providerCampaignName ?? ""} ${providerAdName ?? ""}`.toLowerCase();
          if (textToScan.trim()) {
            const approvedProjects = await db.select({ _id: projects._id, name: projects.name }).from(projects).where(eq(projects.approvalStatus, "APPROVED"));
            for (const p of approvedProjects) {
              if (textToScan.includes(p.name.toLowerCase())) {
                projectId = p._id;
                break;
              }
            }
          }
        }

        const purpose = firstField(fields, "purchase_purpose", "purpose").toLowerCase();
        const normalizedPurpose = purpose.includes("invest") ? "INVESTMENT" : purpose.includes("self") || purpose.includes("live") ? "SELF_USE" : purpose ? "UNDECIDED" : null;
        const consentField = ["contact_consent", "consent_to_contact", "marketing_consent", "agree_to_contact", "consent"]
          .map((f) => fields.get(f)).find(Boolean);
        const consentGranted = Boolean(consentField && /^(?:yes\b|true\b|1$|i\s+agree\b|agree(?:d)?\b|opt[\s-]?in\b)/i.test(consentField.trim()));

        const [buyer] = await db.select({ _id: users._id }).from(users)
          .where(and(eq(users.role, "BUYER"), or(
            sql`right(regexp_replace(coalesce(${users.phone}, ''), '\\D', '', 'g'), 10) = ${extracted.phone}`,
            ...(extracted.email ? [eq(users.email, extracted.email)] : []),
          )!)).limit(1);

        // Deduplication check: check if phone already exists
        const [existingLead] = await db.select().from(buyerCrmLeads).where(eq(buyerCrmLeads.phone, extracted.phone)).limit(1);

        if (existingLead) {
          const newCount = (existingLead.duplicateCount || 1) + 1;
          const updates: Partial<typeof buyerCrmLeads.$inferInsert> = {
            isDuplicate: true,
            duplicateCount: newCount,
            updatedAt: new Date(),
          };
          if (!existingLead.projectId && projectId) updates.projectId = projectId;
          if (!existingLead.email && extracted.email) updates.email = extracted.email;
          if (!existingLead.preferredLocation && extracted.city) updates.preferredLocation = extracted.city;
          if (!existingLead.budgetRange && extracted.budget) updates.budgetRange = extracted.budget;
          if (!existingLead.propertyType && extracted.propertyType) updates.propertyType = extracted.propertyType;
          if (!existingLead.purchaseTimeline && extracted.siteVisitPreference) updates.purchaseTimeline = extracted.siteVisitPreference;
          if (extracted.requirement) {
            updates.requirement = existingLead.requirement
              ? `${existingLead.requirement} | ${extracted.requirement}`
              : extracted.requirement;
          }
          if (providerCampaignName && !existingLead.providerCampaignName) updates.providerCampaignName = providerCampaignName;
          if (providerAdName && !existingLead.providerAdName) updates.providerAdName = providerAdName;

          await db.update(buyerCrmLeads).set(updates).where(eq(buyerCrmLeads._id, existingLead._id));

          const adDetail = [
            providerCampaignName ? `Campaign: ${providerCampaignName}` : null,
            providerAdName ? `Ad: ${providerAdName}` : null,
            providerFormId ? `Form: ${providerFormId}` : null,
          ].filter(Boolean).join(" | ");

          await db.insert(buyerCrmActivities).values({
            leadId: existingLead._id,
            type: "NOTE",
            content: `Repeat Meta Ad submission received (${adDetail || "Instant Form"}). Submission #${newCount}.${extracted.requirement ? ` Details: "${extracted.requirement}".` : ""}`,
          });

          const admins = await db.select({ id: users._id }).from(users).where(and(eq(users.role, "ADMIN"), eq(users.disabled, false)));
          if (admins.length > 0) {
            let projName = "General Buyer CRM";
            if (projectId || existingLead.projectId) {
              const [p] = await db.select({ name: projects.name }).from(projects).where(eq(projects._id, (projectId || existingLead.projectId)!)).limit(1);
              if (p) projName = p.name;
            }
            await createNotifications(admins.map((a) => a.id), {
              type: "new_lead",
              title: `Repeat Lead (${newCount}x): ${extracted.fullName}`,
              message: `${extracted.fullName} (${extracted.phone}) submitted another Meta lead form for ${projName}.`,
              data: { href: "/admin/buyer-crm" },
              priority: "normal",
              dedupeKey: `meta-repeat:${existingLead._id}:${newCount}`,
            }).catch(() => []);
          }

          captured += 1;
          continue;
        }

        // New lead insert
        const [lead] = await db.insert(buyerCrmLeads).values({
          buyerUserId: buyer?._id ?? null,
          fullName: extracted.fullName,
          phone: extracted.phone,
          email: extracted.email,
          source: "META_AD",
          status: "NEW",
          projectId,
          propertyType: extracted.propertyType,
          preferredLocation: extracted.city,
          budgetRange: extracted.budget,
          purchasePurpose: normalizedPurpose,
          purchaseTimeline: extracted.siteVisitPreference,
          requirement: extracted.requirement,
          contactConsent: consentGranted,
          consentBasis: consentGranted ? `Meta form consent field: ${consentField}` : null,
          providerLeadId,
          providerPageId,
          providerFormId,
          providerAdId,
          providerAdName,
          providerCampaignId,
          providerCampaignName,
          providerAdsetId,
          providerAdsetName,
          isDuplicate: false,
          duplicateCount: 1,
          assignedToId: null,
        }).onConflictDoNothing().returning();

        if (!lead) continue;

        const adDetail = [
          providerCampaignName ? `Campaign: ${providerCampaignName}` : null,
          providerAdName ? `Ad: ${providerAdName}` : null,
          providerFormId ? `Form: ${providerFormId}` : null,
        ].filter(Boolean).join(" | ");

        await db.insert(buyerCrmActivities).values({
          leadId: lead._id,
          type: "CREATED",
          content: `Captured from Meta Lead Ad (${adDetail || "Instant Form"}).`,
        });

        // Real-time notification to admins
        const admins = await db.select({ id: users._id }).from(users).where(and(eq(users.role, "ADMIN"), eq(users.disabled, false)));
        if (admins.length > 0) {
          let projName = "General Buyer CRM";
          if (projectId) {
            const [p] = await db.select({ name: projects.name }).from(projects).where(eq(projects._id, projectId)).limit(1);
            if (p) projName = p.name;
          }
          await createNotifications(admins.map((a) => a.id), {
            type: "new_lead",
            title: `New Meta Ad Lead: ${extracted.fullName}`,
            message: `${extracted.fullName} (${extracted.phone}) registered interest for ${projName}. Budget: ${extracted.budget || "Not specified"}.`,
            data: { href: "/admin/buyer-crm" },
            priority: "high",
            dedupeKey: `meta-lead:${lead._id}`,
          }).catch(() => []);
        }

        await logAudit({
          action: "BUYER_CRM_META_LEAD_RECEIVED",
          resourceType: "buyer_crm_lead",
          resourceId: lead._id,
          metadata: { projectId, campaign: providerCampaignName, ad: providerAdName, consentRecorded: consentGranted },
        });

        captured += 1;
      }
    }
    return res.status(200).json({ received: true, captured });
  } catch (error) {
    console.warn("Meta buyer lead webhook processing failed:", error instanceof Error ? error.message : "unknown error");
    return res.status(503).json({ error: "Meta lead notification could not be processed; it can be retried." });
  }
}
