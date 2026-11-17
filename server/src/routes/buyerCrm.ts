import { createHmac, timingSafeEqual } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { and, asc, count, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { getDatabaseStatus, getDb } from "../config/db";
import { buyerCrmActivities, buyerCrmLeads, leads, projects, propertyRequirements, users } from "../db/schema";
import { authenticate, requireRole, type AuthedRequest } from "../middleware/auth";
import { isValidId } from "../lib/ids";
import { logAudit } from "../services/audit";

const router = Router();
const SOURCES = ["META_AD", "GOOGLE_AD", "TELECALLER", "WHATSAPP", "WEBSITE", "CUSTOMER_REFERRAL", "OTHER"] as const;
const STATUSES = ["NEW", "CONTACTED", "QUALIFIED", "SITE_VISIT_SCHEDULED", "CONVERTED", "LOST"] as const;
const ACTIVITY_TYPES = ["CALL", "WHATSAPP", "NOTE", "FOLLOW_UP"] as const;
const terminalStatuses = ["CONVERTED", "LOST"] as const;

function normalizePhone(value: string): string {
  let digits = value.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return digits;
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

function listFilters(query: Record<string, unknown>): { conditions: SQL[]; page: number; limit: number } {
  const page = Math.max(1, Math.min(10000, Number(query.page) || 1));
  const limit = Math.max(1, Math.min(100, Number(query.limit) || 50));
  const conditions: SQL[] = [];
  if (typeof query.status === "string" && STATUSES.includes(query.status as typeof STATUSES[number])) conditions.push(eq(buyerCrmLeads.status, query.status));
  if (typeof query.source === "string" && SOURCES.includes(query.source as typeof SOURCES[number])) conditions.push(eq(buyerCrmLeads.source, query.source));
  if (typeof query.projectId === "string") {
    if (query.projectId === "GENERAL") conditions.push(sql`${buyerCrmLeads.projectId} IS NULL`);
    else if (isValidId(query.projectId)) conditions.push(eq(buyerCrmLeads.projectId, query.projectId));
  }
  if (typeof query.q === "string" && query.q.trim()) {
    const escaped = `%${query.q.trim().replace(/[\\%_]/g, "\\$&")}%`;
    conditions.push(or(
      ilike(buyerCrmLeads.fullName, escaped),
      ilike(buyerCrmLeads.phone, escaped),
      ilike(buyerCrmLeads.email, escaped),
      ilike(buyerCrmLeads.requirement, escaped),
      ilike(projects.name, escaped),
    )!);
  }
  return { conditions, page, limit };
}

router.use(authenticate);

router.get("/admin/summary", requireRole("ADMIN"), async (_req: AuthedRequest, res: Response) => {
  const db = getDb();
  const [crmStats] = await db.select({
    total: count(),
    new: sql<number>`count(*) FILTER (WHERE ${buyerCrmLeads.status} = 'NEW')::int`,
    projectInterests: sql<number>`count(*) FILTER (WHERE ${buyerCrmLeads.projectId} IS NOT NULL)::int`,
    broaderRequirements: sql<number>`count(*) FILTER (WHERE ${buyerCrmLeads.projectId} IS NULL AND ${buyerCrmLeads.requirement} IS NOT NULL AND ${buyerCrmLeads.requirement} <> '')::int`,
    followUpsDue: sql<number>`count(*) FILTER (WHERE ${buyerCrmLeads.nextFollowUpAt} <= now() AND ${buyerCrmLeads.status} NOT IN ('CONVERTED','LOST'))::int`,
  }).from(buyerCrmLeads);
  const [registeredBuyers] = await db.select({ total: count() }).from(users).where(eq(users.role, "BUYER"));
  const bySource = await db.select({ source: buyerCrmLeads.source, total: count() })
    .from(buyerCrmLeads).groupBy(buyerCrmLeads.source).orderBy(desc(count()));
  res.json({
    leads: crmStats,
    registeredBuyers: registeredBuyers?.total ?? 0,
    bySource,
    metaAdsConfigured: Boolean(process.env.META_LEADS_VERIFY_TOKEN?.trim() && process.env.META_LEADS_APP_SECRET?.trim() && process.env.META_LEADS_ACCESS_TOKEN?.trim()),
  });
});

router.get("/admin/projects", requireRole("ADMIN"), async (_req: AuthedRequest, res: Response) => {
  const rows = await getDb().select({ _id: projects._id, name: projects.name, city: projects.city, location: projects.location })
    .from(projects).where(eq(projects.approvalStatus, "APPROVED")).orderBy(asc(projects.name));
  res.json({ projects: rows });
});

router.get("/admin/staff", requireRole("ADMIN"), async (_req: AuthedRequest, res: Response) => {
  const rows = await getDb().select({ _id: users._id, name: users.name, role: users.role })
    .from(users).where(and(inArray(users.role, ["ADMIN", "EMPLOYEE"]), eq(users.disabled, false))).orderBy(asc(users.name));
  res.json({ staff: rows });
});

router.get("/admin/leads", requireRole("ADMIN"), async (req: AuthedRequest, res: Response) => {
  const db = getDb();
  const { conditions, page, limit } = listFilters(req.query as Record<string, unknown>);
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
    createdAt: buyerCrmLeads.createdAt,
    updatedAt: buyerCrmLeads.updatedAt,
    project: { _id: projects._id, name: projects.name, city: projects.city },
    assignedTo: { _id: assignee._id, name: assignee.name },
  }).from(buyerCrmLeads)
    .leftJoin(projects, eq(buyerCrmLeads.projectId, projects._id))
    .leftJoin(assignee, eq(buyerCrmLeads.assignedToId, assignee._id))
    .where(where).orderBy(desc(buyerCrmLeads.updatedAt)).limit(limit).offset((page - 1) * limit);
  res.json({ leads: rows.map((row) => ({ ...row, project: row.project?._id ? row.project : null, assignedTo: row.assignedTo?._id ? row.assignedTo : null })), total: countRow?.total ?? 0, page, limit });
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

router.patch("/admin/leads/:id", requireRole("ADMIN"), async (req: AuthedRequest, res: Response) => {
  if (!isValidId(req.params.id)) return res.status(404).json({ error: "Buyer lead not found." });
  const parsed = updateLeadSchema.safeParse(req.body);
  if (!parsed.success || Object.keys(parsed.data ?? {}).length === 0) return res.status(400).json({ error: parsed.success ? "No changes supplied." : parsed.error.issues[0]?.message });
  const db = getDb();
  const [current] = await db.select().from(buyerCrmLeads).where(eq(buyerCrmLeads._id, req.params.id)).limit(1);
  if (!current) return res.status(404).json({ error: "Buyer lead not found." });
  const d = parsed.data;
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
  if (d.projectId !== undefined) update.projectId = d.projectId;
  if (d.nextFollowUpAt !== undefined) update.nextFollowUpAt = d.nextFollowUpAt ? new Date(d.nextFollowUpAt) : null;
  if (d.assignedToId !== undefined) update.assignedToId = d.assignedToId;
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

router.post("/admin/leads/:id/activities", requireRole("ADMIN"), async (req: AuthedRequest, res: Response) => {
  if (!isValidId(req.params.id)) return res.status(404).json({ error: "Buyer lead not found." });
  const parsed = z.object({ type: z.enum(ACTIVITY_TYPES), content: z.string().trim().min(2).max(1200) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Enter a short activity note." });
  const db = getDb();
  const [lead] = await db.select({ _id: buyerCrmLeads._id }).from(buyerCrmLeads).where(eq(buyerCrmLeads._id, req.params.id)).limit(1);
  if (!lead) return res.status(404).json({ error: "Buyer lead not found." });
  const [activity] = await db.insert(buyerCrmActivities).values({ leadId: lead._id, actorUserId: req.user!.userId, type: parsed.data.type, content: parsed.data.content }).returning();
  await db.update(buyerCrmLeads).set({ updatedAt: new Date() }).where(eq(buyerCrmLeads._id, lead._id));
  res.status(201).json({ activity });
});

router.get("/admin/leads/:id/activities", requireRole("ADMIN"), async (req: AuthedRequest, res: Response) => {
  if (!isValidId(req.params.id)) return res.status(404).json({ error: "Buyer lead not found." });
  const rows = await getDb().select({ _id: buyerCrmActivities._id, type: buyerCrmActivities.type, content: buyerCrmActivities.content, createdAt: buyerCrmActivities.createdAt, actor: users.name })
    .from(buyerCrmActivities).leftJoin(users, eq(buyerCrmActivities.actorUserId, users._id))
    .where(eq(buyerCrmActivities.leadId, req.params.id)).orderBy(desc(buyerCrmActivities.createdAt)).limit(100);
  res.json({ activities: rows });
});

export default router;

type MetaField = { name?: unknown; values?: unknown };
type MetaLead = {
  id?: unknown;
  created_time?: unknown;
  form_id?: unknown;
  ad_id?: unknown;
  ad_name?: unknown;
  field_data?: unknown;
};

function safeText(value: unknown, limit = 250): string {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function fieldsToMap(value: unknown): Map<string, string> {
  const map = new Map<string, string>();
  if (!Array.isArray(value)) return map;
  for (const item of value as MetaField[]) {
    const name = safeText(item.name, 100).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    const raw = Array.isArray(item.values) ? item.values[0] : item.values;
    const answer = safeText(raw, 1200);
    if (name && answer) map.set(name, answer);
  }
  return map;
}

function firstField(fields: Map<string, string>, ...names: string[]): string {
  for (const name of names) {
    const result = fields.get(name);
    if (result) return result;
  }
  return "";
}

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
        url.searchParams.set("fields", "id,created_time,field_data,ad_id,ad_name,form_id");
        url.searchParams.set("access_token", process.env.META_LEADS_ACCESS_TOKEN!.trim());
        const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
        if (!response.ok) throw new Error("Meta lead details could not be fetched.");
        const data = await response.json() as MetaLead;
        const providerLeadId = safeText(data.id ?? leadId, 160);
        if (!providerLeadId) throw new Error("Meta lead details did not include a lead ID.");
        const fields = fieldsToMap(data.field_data);
        const phone = normalizePhone(firstField(fields, "phone_number", "mobile_number", "phone"));
        if (!/^[6-9]\d{9}$/.test(phone)) throw new Error("Meta lead details did not include a valid Indian mobile number.");
        const email = firstField(fields, "email", "email_address").toLowerCase();
        const fullName = firstField(fields, "full_name", "name") || [firstField(fields, "first_name"), firstField(fields, "last_name")].filter(Boolean).join(" ") || "Ad lead";
        const projectAnswer = firstField(fields, "project_id", "project", "project_name");
        const possibleProjectId: unknown = projectAnswer;
        let projectId: string | null = null;
        if (isValidId(possibleProjectId)) {
          const [project] = await db.select({ _id: projects._id }).from(projects).where(and(eq(projects._id, projectAnswer), eq(projects.approvalStatus, "APPROVED"))).limit(1);
          projectId = project?._id ?? null;
        } else if (projectAnswer) {
          const exactProjectName = projectAnswer.replace(/[\\%_]/g, "\\$&");
          const [project] = await db.select({ _id: projects._id }).from(projects).where(and(eq(projects.approvalStatus, "APPROVED"), ilike(projects.name, exactProjectName))).limit(1);
          projectId = project?._id ?? null;
        }
        const purpose = firstField(fields, "purchase_purpose", "purpose").toLowerCase();
        const normalizedPurpose = purpose.includes("invest") ? "INVESTMENT" : purpose.includes("self") || purpose.includes("live") ? "SELF_USE" : purpose ? "UNDECIDED" : null;
        const consentField = ["contact_consent", "consent_to_contact", "marketing_consent", "agree_to_contact", "consent"]
          .map((field) => fields.get(field)).find(Boolean);
        const consentGranted = Boolean(consentField && /^(?:yes\b|true\b|1$|i\s+agree\b|agree(?:d)?\b|opt[\s-]?in\b)/i.test(consentField.trim()));
        const followup = firstField(fields, "requirement", "property_requirement", "what_are_you_looking_for", "additional_requirements");
        const [buyer] = await db.select({ _id: users._id }).from(users)
          .where(and(eq(users.role, "BUYER"), or(
            sql`right(regexp_replace(coalesce(${users.phone}, ''), '\\D', '', 'g'), 10) = ${phone}`,
            ...(email ? [eq(users.email, email)] : []),
          )!)).limit(1);
        const [lead] = await db.insert(buyerCrmLeads).values({
          buyerUserId: buyer?._id ?? null,
          fullName: fullName.slice(0, 100), phone, email: email || null, source: "META_AD", status: "NEW",
          projectId,
          propertyType: firstField(fields, "property_type", "type_of_property") || null,
          preferredLocation: firstField(fields, "preferred_location", "location", "city") || null,
          budgetRange: firstField(fields, "budget", "budget_range") || null,
          purchasePurpose: normalizedPurpose,
          purchaseTimeline: firstField(fields, "timeline", "purchase_timeline") || null,
          requirement: followup || null,
          contactConsent: consentGranted,
          consentBasis: consentGranted ? `Meta form consent field: ${consentField}` : null,
          providerLeadId,
          providerPageId: safeText(change.value?.page_id ?? entry.id, 160) || null,
          providerFormId: safeText(data.form_id ?? change.value?.form_id, 160) || null,
          providerAdId: safeText(data.ad_id ?? change.value?.ad_id, 160) || null,
          providerAdName: safeText(data.ad_name, 250) || null,
        }).onConflictDoNothing().returning();
        if (!lead) continue;
        await db.insert(buyerCrmActivities).values({ leadId: lead._id, type: "CREATED", content: "Automatically fetched from a Meta Lead Ad." });
        await logAudit({ action: "BUYER_CRM_META_LEAD_RECEIVED", resourceType: "buyer_crm_lead", resourceId: lead._id, metadata: { projectId, consentRecorded: consentGranted } });
        captured += 1;
      }
    }
    return res.status(200).json({ received: true, captured });
  } catch (error) {
    // Provider retries are safe: providerLeadId is unique, so prior records in
    // a partially handled webhook cannot be inserted a second time.
    console.warn("Meta buyer lead webhook processing failed:", error instanceof Error ? error.message : "unknown error");
    return res.status(503).json({ error: "Meta lead notification could not be processed; it can be retried." });
  }
}
