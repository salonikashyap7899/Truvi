import { Router } from "express";
import { z } from "zod";
import { and, asc, count, desc, eq, gte, ilike, inArray, lte, or, sql, SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb } from "../config/db";
import {
  leads, leadActivities, projects, units, users, siteVisits, offers,
  LeadStage, Role, LeadReferralLink,
} from "../db/schema";
import { isValidId } from "../lib/ids";
import { zodMessage } from "../lib/validationError";
import { authenticate, requireRole, AuthedRequest } from "../middleware/auth";
import { emitLeadUpdate } from "../sockets";
import { logAudit } from "../services/audit";
import { notifyRole, notifyUser, NotificationType } from "../services/notificationService";
import { sendLeadAlert } from "../services/leadAlertService";
import { computeOfferReward, findEligibleOffer, istToday, publicOffer } from "../services/offerService";
import { DUPLICATE_LEAD_WINDOW_DAYS } from "../config/constants";

/**
 * Inventory leads + admin Lead Management.
 *
 *  POST /api/leads/from-inventory      Buyer / Channel Partner / Ambassador adds a
 *                                      lead from an inventory card (+ site visit).
 *  GET  /api/leads/mine                The caller's own submitted leads.
 *  GET  /api/leads/admin/list          Admin: filterable list of every lead.
 *  GET  /api/leads/admin/stats         Admin: dashboard counts + breakdowns.
 *  GET  /api/leads/admin/filters       Admin: options for the filter menus.
 *  GET  /api/leads/admin/:id           Admin: one lead with its full history.
 *  PATCH /api/leads/admin/:id/status   Admin: move a lead to a new status.
 *
 * Everything that matters (who created the lead, their role, the project, the
 * unit, the offer, referral links) is resolved on the server — nothing in the
 * request body is trusted for identity, ownership or eligibility.
 */

const router = Router();
router.use(authenticate);

// ── Lead statuses (a view over the existing pipeline stages) ────────────────
// Lead Management speaks in seven simple statuses; they map onto the existing
// CRM stages, so the Channel Partner pipeline keeps working unchanged.
export const LEAD_STATUSES = [
  "NEW", "CONTACTED", "SITE_VISIT_SCHEDULED", "SITE_VISIT_COMPLETED", "FOLLOW_UP", "CONVERTED", "LOST",
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

const visitDoneSql = sql`exists (select 1 from site_visits sv where sv.lead_id = ${leads._id} and sv.status = 'COMPLETED')`;
const visitOpenSql = sql`exists (select 1 from site_visits sv where sv.lead_id = ${leads._id} and sv.status in ('SCHEDULED','CONFIRMED'))`;
const statusSql = sql<LeadStatus>`case
  when ${leads.stage} in ('GENERATED','ASSIGNED') then 'NEW'
  when ${leads.stage} = 'CONTACTED' then 'CONTACTED'
  when ${leads.stage} = 'SITE_VISIT' and ${visitDoneSql} then 'SITE_VISIT_COMPLETED'
  when ${leads.stage} = 'SITE_VISIT' then 'SITE_VISIT_SCHEDULED'
  when ${leads.stage} in ('INTERESTED','NEGOTIATION') then 'FOLLOW_UP'
  when ${leads.stage} in ('BOOKING','REGISTRATION','COMPLETED') then 'CONVERTED'
  when ${leads.stage} = 'LOST' then 'LOST'
  else 'NEW' end`;

export const displayLeadId = (n: number | null | undefined) => (n ? `TRV-L-${String(n).padStart(6, "0")}` : "—");

const ROLE_LABEL: Record<string, string> = { BUYER: "Buyer", CP: "Channel Partner", AMBASSADOR: "Ambassador", ADMIN: "Admin", DEVELOPER: "Developer" };

function formatVisitDate(d: string): string {
  const dt = new Date(`${d}T00:00:00+05:30`);
  return dt.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });
}
function formatVisitTime(t: string): string {
  const [h, m] = t.split(":").map(Number);
  const hh = ((h + 11) % 12) + 1;
  return `${hh}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}
function unitLabel(u: { unitNumber: string; type: string; areaSqft: number } | null | undefined): string {
  if (!u) return "Any unit (whole project)";
  return `${u.unitNumber} · ${u.type}${u.areaSqft ? ` · ${Math.round(u.areaSqft).toLocaleString("en-IN")} sq ft` : ""}`;
}

/** Indian mobile → 10 digits, or null. Accepts +91 / 0 prefixes and spaces. */
function normalizeMobile(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let d = raw.replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? d : null;
}

// ── Create a lead from an inventory card ────────────────────────────────────
const VISIT_TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;
const fromInventorySchema = z.object({
  projectId: z.string().refine(isValidId, "Choose a valid project"),
  unitId: z.string().refine(isValidId, "Choose a valid unit").optional().nullable(),
  customerName: z.string().trim().min(2, "Enter the customer's name").max(80).optional(),
  customerPhone: z.string().trim().max(20).optional(),
  customerEmail: z.string().trim().email("Enter a valid email").max(120).optional().or(z.literal("")),
  visitDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a site visit date"),
  visitTime: z.string().regex(VISIT_TIME, "Pick a preferred time"),
  requirement: z.string().trim().min(2, "Add the purpose / requirement").max(300),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
  confirmDuplicate: z.boolean().optional(),
});

const MAX_LEADS_PER_HOUR = 20;

router.post("/from-inventory", requireRole("BUYER", "CP", "AMBASSADOR"), async (req: AuthedRequest, res) => {
  const parsed = fromInventorySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: zodMessage(parsed.error), issues: parsed.error.flatten() });
  const d = parsed.data;
  const role = req.user!.role as Role;
  const db = getDb();

  // Visit date/time: today or later (IST), within 6 months, 8 AM–8 PM.
  const today = istToday();
  if (d.visitDate < today) return res.status(400).json({ error: "The site visit date can't be in the past" });
  if (d.visitDate > istToday(180)) return res.status(400).json({ error: "Pick a site visit date within the next 6 months" });
  if (d.visitTime < "08:00" || d.visitTime > "20:00") {
    return res.status(400).json({ error: "Pick a visit time between 8:00 AM and 8:00 PM" });
  }
  const scheduledAt = new Date(`${d.visitDate}T${d.visitTime}:00+05:30`);
  if (Number.isNaN(scheduledAt.getTime())) return res.status(400).json({ error: "Pick a valid site visit date" });
  if (scheduledAt.getTime() < Date.now()) return res.status(400).json({ error: "That visit time has already passed — pick a later time" });

  // Creator, from the session — never from the body.
  const [me] = await db
    .select({ _id: users._id, name: users.name, email: users.email, phone: users.phone, role: users.role, disabled: users.disabled, referralCode: users.referralCode, referredBy: users.referredBy })
    .from(users)
    .where(eq(users._id, req.user!.userId));
  if (!me || me.disabled || me.role !== role) return res.status(403).json({ error: "Your account can't add leads" });

  // Project must be live; the unit (if any) must belong to it and be unsold.
  const [project] = await db
    .select({ _id: projects._id, name: projects.name, approvalStatus: projects.approvalStatus, developerId: projects.developerId })
    .from(projects)
    .where(eq(projects._id, d.projectId));
  if (!project || project.approvalStatus !== "APPROVED") return res.status(404).json({ error: "This project isn't available" });
  let unit: { _id: string; unitNumber: string; type: string; areaSqft: number; status: string } | null = null;
  if (d.unitId) {
    const [u] = await db
      .select({ _id: units._id, unitNumber: units.unitNumber, type: units.type, areaSqft: units.areaSqft, status: units.status, projectId: units.projectId })
      .from(units)
      .where(eq(units._id, d.unitId));
    if (!u || String(u.projectId) !== String(project._id)) return res.status(400).json({ error: "That unit doesn't belong to this project" });
    if (u.status === "SOLD") return res.status(409).json({ error: "This unit is already sold — pick another unit" });
    unit = u;
  }

  // Customer details. A buyer's own account details are used (they can only
  // add a mobile number if their account doesn't have one yet).
  let clientName: string;
  let clientPhone: string | null;
  let clientEmail: string | null;
  if (role === "BUYER") {
    clientName = me.name;
    clientPhone = normalizeMobile(me.phone) ?? normalizeMobile(d.customerPhone);
    clientEmail = me.email || null;
    if (!clientPhone) return res.status(400).json({ error: "Add your 10-digit mobile number" });
  } else {
    if (!d.customerName) return res.status(400).json({ error: "Enter the customer's name" });
    clientName = d.customerName;
    clientPhone = normalizeMobile(d.customerPhone);
    clientEmail = d.customerEmail || null;
    if (!clientPhone) return res.status(400).json({ error: "Enter a valid 10-digit mobile number" });
  }

  // Abuse guard — the owner gets a WhatsApp/SMS per lead.
  const hourAgo = new Date(Date.now() - 3600 * 1000);
  const [{ n: recent }] = await db
    .select({ n: count() })
    .from(leads)
    .where(and(eq(leads.submittedById, me._id), gte(leads.createdAt, hourAgo)));
  if (recent >= MAX_LEADS_PER_HOUR) return res.status(429).json({ error: "Too many leads in the last hour — please try again later" });

  // Same customer + project recently? Ask before creating a duplicate.
  const windowStart = new Date(Date.now() - DUPLICATE_LEAD_WINDOW_DAYS * 86400 * 1000);
  const [dup] = await db
    .select({ _id: leads._id })
    .from(leads)
    .where(and(eq(leads.projectId, project._id), eq(leads.clientPhone, clientPhone), gte(leads.createdAt, windowStart)))
    .limit(1);
  if (dup && !d.confirmDuplicate) {
    return res.status(409).json({
      warning: "DUPLICATE_DETECTED",
      message: role === "BUYER"
        ? "You already sent a request for this project recently. Send another one anyway?"
        : "A lead with this mobile number was added for this project recently. Add it anyway?",
    });
  }

  // Referral / commission source — references only, extensible by level.
  const chain: LeadReferralLink[] = [];
  if (role === "CP" || role === "AMBASSADOR") {
    chain.push({ level: 1, userId: me._id });
    if (me.referredBy) chain.push({ level: 2, userId: String(me.referredBy) });
  } else if (me.referredBy) {
    chain.push({ level: 1, userId: String(me.referredBy) });
  }

  const offer = await findEligibleOffer(project._id, unit?._id ?? null, role).catch(() => null);

  const created = await db.transaction(async (tx) => {
    const [lead] = await tx
      .insert(leads)
      .values({
        projectId: project._id,
        unitId: unit?._id ?? null,
        submittedById: me._id,
        // A Channel Partner works their own lead; buyer/ambassador leads go to
        // the Truvi team (unassigned, and kept out of the lead marketplace).
        assignedToId: role === "CP" ? me._id : null,
        clientName,
        clientPhone,
        clientEmail,
        stage: (role === "CP" ? "ASSIGNED" : "GENERATED") as LeadStage,
        source: `INVENTORY_${role}`,
        notes: d.notes || null,
        requirement: d.requirement,
        visitDate: d.visitDate,
        visitTime: d.visitTime,
        creatorRole: role,
        referralCode: role === "CP" || role === "AMBASSADOR" ? me.referralCode ?? null : null,
        referralChain: chain.length ? chain : null,
        offerId: offer?._id ?? null,
        isDuplicate: !!dup,
      })
      .returning();
    await tx.insert(siteVisits).values({
      leadId: lead._id,
      projectId: project._id,
      cpId: role === "CP" ? me._id : null,
      buyerId: role === "BUYER" ? me._id : null,
      scheduledAt,
      timeSlot: formatVisitTime(d.visitTime),
      contactNumber: clientPhone,
    });
    await tx.insert(leadActivities).values({
      leadId: lead._id,
      cpId: me._id,
      type: "SYSTEM",
      content: `Lead created from inventory by ${ROLE_LABEL[role] ?? role} — site visit requested for ${formatVisitDate(d.visitDate)} at ${formatVisitTime(d.visitTime)}`,
      metadata: { by: me._id, role, unitId: unit?._id ?? null, offerId: offer?._id ?? null },
    });
    return lead;
  });

  const leadId = displayLeadId(created.leadNo);
  const visitText = `${formatVisitDate(d.visitDate)} at ${formatVisitTime(d.visitTime)}`;
  emitLeadUpdate(created, project.developerId);
  void logAudit({ userId: me._id, action: "lead.create.inventory", resourceType: "lead", resourceId: String(created._id), metadata: { role, projectId: project._id, unitId: unit?._id ?? null } });

  // Notifications — never fail the request on them.
  void (async () => {
    try {
      await notifyRole("ADMIN", {
        type: NotificationType.NEW_LEAD,
        title: "New Lead Received",
        message: `${clientName} · ${project.name} · visit ${visitText} (${ROLE_LABEL[role] ?? role})`,
        actorUserId: me._id,
        priority: "high",
        data: { href: `/admin/leads?lead=${created._id}` },
      });
      if (project.developerId) {
        await notifyUser(String(project.developerId), {
          type: NotificationType.NEW_LEAD,
          title: "New lead",
          message: `A new lead came in for "${project.name}".`,
          actorUserId: me._id,
          data: { href: "/crm/pipeline" },
        });
      }
      await sendLeadAlert({
        leadId,
        customerName: clientName,
        customerPhone: clientPhone!,
        project: project.name,
        inventory: unitLabel(unit),
        source: ROLE_LABEL[role] ?? role,
        visitDate: formatVisitDate(d.visitDate),
        visitTime: formatVisitTime(d.visitTime),
        notes: [d.requirement, d.notes].filter(Boolean).join(" — "),
      });
    } catch {
      /* non-fatal */
    }
  })();

  res.status(201).json({
    lead: { leadId, visitDate: d.visitDate, visitTime: d.visitTime, status: "NEW" as LeadStatus },
    message: `Lead submitted successfully. Site visit scheduled for ${visitText}.`,
  });
});

// ── The caller's own submitted leads ────────────────────────────────────────
router.get("/mine", requireRole("BUYER", "CP", "AMBASSADOR"), async (req: AuthedRequest, res) => {
  const db = getDb();
  const rows = await db
    .select({
      leadNo: leads.leadNo,
      clientName: leads.clientName,
      visitDate: leads.visitDate,
      visitTime: leads.visitTime,
      createdAt: leads.createdAt,
      status: statusSql,
      project: projects.name,
      unitNumber: units.unitNumber,
    })
    .from(leads)
    .leftJoin(projects, eq(leads.projectId, projects._id))
    .leftJoin(units, eq(leads.unitId, units._id))
    .where(eq(leads.submittedById, req.user!.userId))
    .orderBy(desc(leads.createdAt))
    .limit(50);
  res.json({ leads: rows.map(({ leadNo, ...r }) => ({ leadId: displayLeadId(leadNo), ...r })) });
});

// ── Admin: Lead Management ──────────────────────────────────────────────────
const submitter = alias(users, "lead_submitter");
const sourceRoleSql = sql<string>`coalesce(${leads.creatorRole}, ${submitter.role})`;

const listQuery = z.object({
  status: z.enum(LEAD_STATUSES).optional(),
  projectId: z.string().refine(isValidId).optional(),
  unitId: z.string().refine(isValidId).optional(),
  role: z.enum(["BUYER", "CP", "AMBASSADOR", "DEVELOPER", "ADMIN"]).optional(),
  creatorId: z.string().refine(isValidId).optional(),
  visitFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  visitTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  q: z.string().trim().max(80).optional(),
  page: z.coerce.number().int().min(1).max(10000).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

function listConditions(f: z.infer<typeof listQuery>): SQL[] {
  const c: SQL[] = [];
  if (f.status) c.push(sql`(${statusSql}) = ${f.status}`);
  if (f.projectId) c.push(eq(leads.projectId, f.projectId));
  if (f.unitId) c.push(eq(leads.unitId, f.unitId));
  if (f.role) c.push(sql`(${sourceRoleSql}) = ${f.role}`);
  if (f.creatorId) c.push(eq(leads.submittedById, f.creatorId));
  if (f.visitFrom) c.push(gte(leads.visitDate, f.visitFrom));
  if (f.visitTo) c.push(lte(leads.visitDate, f.visitTo));
  if (f.q) {
    const term = `%${f.q.replace(/[%_\\]/g, "\\$&")}%`;
    const digits = f.q.replace(/\D/g, "");
    const conds: SQL[] = [ilike(leads.clientName, term), ilike(leads.clientPhone, term)];
    if (digits) conds.push(sql`${leads.leadNo}::text = ${String(Number(digits))}`);
    c.push(or(...conds)!);
  }
  return c;
}

router.get("/admin/list", requireRole("ADMIN"), async (req: AuthedRequest, res) => {
  const parsed = listQuery.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: zodMessage(parsed.error) });
  const f = parsed.data;
  const page = f.page ?? 1;
  const limit = f.limit ?? 25;
  const db = getDb();
  const where = and(...listConditions(f));

  const [{ total }] = await db
    .select({ total: count() })
    .from(leads)
    .leftJoin(submitter, eq(leads.submittedById, submitter._id))
    .where(where);

  const rows = await db
    .select({
      _id: leads._id,
      leadNo: leads.leadNo,
      clientName: leads.clientName,
      clientPhone: leads.clientPhone,
      requirement: leads.requirement,
      notes: leads.notes,
      visitDate: leads.visitDate,
      visitTime: leads.visitTime,
      stage: leads.stage,
      status: statusSql,
      sourceRole: sourceRoleSql,
      createdAt: leads.createdAt,
      project: { _id: projects._id, name: projects.name },
      unit: { _id: units._id, unitNumber: units.unitNumber, type: units.type },
      creator: { _id: submitter._id, name: submitter.name },
      offerName: offers.name,
    })
    .from(leads)
    .leftJoin(submitter, eq(leads.submittedById, submitter._id))
    .leftJoin(projects, eq(leads.projectId, projects._id))
    .leftJoin(units, eq(leads.unitId, units._id))
    .leftJoin(offers, eq(leads.offerId, offers._id))
    .where(where)
    .orderBy(desc(leads.createdAt))
    .limit(limit)
    .offset((page - 1) * limit);

  res.json({
    leads: rows.map((r) => ({ ...r, leadId: displayLeadId(r.leadNo), unit: r.unit?._id ? r.unit : null })),
    total,
    page,
    limit,
  });
});

router.get("/admin/stats", requireRole("ADMIN"), async (_req: AuthedRequest, res) => {
  const db = getDb();
  const [totals] = await db
    .select({
      total: count(),
      new: sql<number>`count(*) filter (where ${leads.stage} in ('GENERATED','ASSIGNED'))`.mapWith(Number),
      visitsScheduled: sql<number>`count(*) filter (where ${visitOpenSql})`.mapWith(Number),
      visitsCompleted: sql<number>`count(*) filter (where ${visitDoneSql})`.mapWith(Number),
      converted: sql<number>`count(*) filter (where ${leads.stage} in ('BOOKING','REGISTRATION','COMPLETED'))`.mapWith(Number),
      lost: sql<number>`count(*) filter (where ${leads.stage} = 'LOST')`.mapWith(Number),
      today: sql<number>`count(*) filter (where ${leads.createdAt} >= date_trunc('day', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata')`.mapWith(Number),
    })
    .from(leads);

  const byRole = await db
    .select({ role: sourceRoleSql, count: count() })
    .from(leads)
    .leftJoin(submitter, eq(leads.submittedById, submitter._id))
    .groupBy(sourceRoleSql);

  const byProject = await db
    .select({ _id: projects._id, name: projects.name, count: count() })
    .from(leads)
    .innerJoin(projects, eq(leads.projectId, projects._id))
    .groupBy(projects._id, projects.name)
    .orderBy(desc(count()))
    .limit(10);

  const byInventory = await db
    .select({ _id: units._id, unitNumber: units.unitNumber, type: units.type, project: projects.name, count: count() })
    .from(leads)
    .innerJoin(units, eq(leads.unitId, units._id))
    .innerJoin(projects, eq(units.projectId, projects._id))
    .groupBy(units._id, units.unitNumber, units.type, projects.name)
    .orderBy(desc(count()))
    .limit(10);

  const byCreator = await db
    .select({ _id: submitter._id, name: submitter.name, role: sourceRoleSql, count: count() })
    .from(leads)
    .innerJoin(submitter, eq(leads.submittedById, submitter._id))
    .groupBy(submitter._id, submitter.name, sourceRoleSql)
    .orderBy(desc(count()))
    .limit(60);

  res.json({ totals, byRole, byProject, byInventory, byCreator });
});

router.get("/admin/filters", requireRole("ADMIN"), async (_req: AuthedRequest, res) => {
  const db = getDb();
  const projectRows = await db
    .selectDistinct({ _id: projects._id, name: projects.name })
    .from(leads)
    .innerJoin(projects, eq(leads.projectId, projects._id))
    .orderBy(asc(projects.name));
  const unitRows = await db
    .selectDistinct({ _id: units._id, unitNumber: units.unitNumber, projectId: units.projectId })
    .from(leads)
    .innerJoin(units, eq(leads.unitId, units._id))
    .orderBy(asc(units.unitNumber));
  const creatorRows = await db
    .selectDistinct({ _id: submitter._id, name: submitter.name, role: sourceRoleSql })
    .from(leads)
    .innerJoin(submitter, eq(leads.submittedById, submitter._id))
    .orderBy(asc(submitter.name));
  res.json({ projects: projectRows, units: unitRows, creators: creatorRows });
});

router.get("/admin/:id", requireRole("ADMIN"), async (req: AuthedRequest, res) => {
  if (!isValidId(req.params.id)) return res.status(404).json({ error: "Lead not found" });
  const db = getDb();
  const assignee = alias(users, "lead_assignee");
  const [row] = await db
    .select({
      lead: leads,
      status: statusSql,
      sourceRole: sourceRoleSql,
      project: { _id: projects._id, name: projects.name, city: projects.city, location: projects.location },
      unit: { _id: units._id, unitNumber: units.unitNumber, type: units.type, areaSqft: units.areaSqft, price: units.price, status: units.status },
      creator: { _id: submitter._id, name: submitter.name, email: submitter.email, phone: submitter.phone, role: submitter.role, referralCode: submitter.referralCode },
      assignee: { _id: assignee._id, name: assignee.name },
    })
    .from(leads)
    .leftJoin(submitter, eq(leads.submittedById, submitter._id))
    .leftJoin(assignee, eq(leads.assignedToId, assignee._id))
    .leftJoin(projects, eq(leads.projectId, projects._id))
    .leftJoin(units, eq(leads.unitId, units._id))
    .where(eq(leads._id, req.params.id));
  if (!row) return res.status(404).json({ error: "Lead not found" });

  const chain = row.lead.referralChain ?? [];
  const chainIds = chain.map((l) => l.userId).filter(isValidId);
  const chainUsers = chainIds.length
    ? await db.select({ _id: users._id, name: users.name, role: users.role, referralCode: users.referralCode }).from(users).where(inArray(users._id, chainIds))
    : [];
  const referral = chain.map((l) => ({ level: l.level, user: chainUsers.find((u) => String(u._id) === l.userId) ?? null }));

  let offer = null;
  if (row.lead.offerId) {
    const [o] = await db.select().from(offers).where(eq(offers._id, row.lead.offerId));
    if (o) {
      offer = {
        ...publicOffer(o),
        estimatedReward: row.unit?._id
          ? computeOfferReward(o, { areaSqft: row.unit.areaSqft, units: 1, bookingValue: row.unit.price })
          : null,
      };
    }
  }

  const visits = await db.select().from(siteVisits).where(eq(siteVisits.leadId, row.lead._id)).orderBy(desc(siteVisits.scheduledAt));
  const actor = alias(users, "activity_actor");
  const activities = await db
    .select({ _id: leadActivities._id, type: leadActivities.type, content: leadActivities.content, metadata: leadActivities.metadata, createdAt: leadActivities.createdAt, by: actor.name })
    .from(leadActivities)
    .leftJoin(actor, sql`${actor._id}::text = ${leadActivities.metadata}->>'by'`)
    .where(eq(leadActivities.leadId, row.lead._id))
    .orderBy(desc(leadActivities.createdAt));

  res.json({
    lead: { ...row.lead, leadId: displayLeadId(row.lead.leadNo), status: row.status, sourceRole: row.sourceRole },
    project: row.project?._id ? row.project : null,
    unit: row.unit?._id ? row.unit : null,
    creator: row.creator?._id ? row.creator : null,
    assignee: row.assignee?._id ? row.assignee : null,
    referral,
    offer,
    visits,
    activities,
  });
});

const statusSchema = z.object({
  status: z.enum(LEAD_STATUSES),
  note: z.string().trim().max(500).optional(),
  visitDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  visitTime: z.string().regex(VISIT_TIME).optional(),
});

const STATUS_LABEL: Record<LeadStatus, string> = {
  NEW: "New", CONTACTED: "Contacted", SITE_VISIT_SCHEDULED: "Site Visit Scheduled", SITE_VISIT_COMPLETED: "Site Visit Completed",
  FOLLOW_UP: "Follow-up", CONVERTED: "Converted", LOST: "Lost",
};

router.patch("/admin/:id/status", requireRole("ADMIN"), async (req: AuthedRequest, res) => {
  if (!isValidId(req.params.id)) return res.status(404).json({ error: "Lead not found" });
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: zodMessage(parsed.error) });
  const { status, note, visitDate, visitTime } = parsed.data;
  if ((visitDate && !visitTime) || (!visitDate && visitTime)) return res.status(400).json({ error: "Pick both a visit date and time" });
  const db = getDb();
  const [lead] = await db.select().from(leads).where(eq(leads._id, req.params.id));
  if (!lead) return res.status(404).json({ error: "Lead not found" });

  const [latestVisit] = await db.select().from(siteVisits).where(eq(siteVisits.leadId, lead._id)).orderBy(desc(siteVisits.scheduledAt)).limit(1);

  let stage: LeadStage = lead.stage;
  let visitStatus: "CONFIRMED" | "COMPLETED" | null = null;
  switch (status) {
    case "NEW": stage = lead.assignedToId ? "ASSIGNED" : "GENERATED"; break;
    case "CONTACTED": stage = "CONTACTED"; break;
    case "SITE_VISIT_SCHEDULED": stage = "SITE_VISIT"; visitStatus = "CONFIRMED"; break;
    case "SITE_VISIT_COMPLETED": stage = "SITE_VISIT"; visitStatus = "COMPLETED"; break;
    case "FOLLOW_UP": stage = lead.stage === "NEGOTIATION" ? "NEGOTIATION" : "INTERESTED"; break;
    case "CONVERTED": stage = ["REGISTRATION", "COMPLETED"].includes(lead.stage) ? lead.stage : "BOOKING"; break;
    case "LOST": stage = "LOST"; break;
  }

  const newVisitAt = visitDate && visitTime ? new Date(`${visitDate}T${visitTime}:00+05:30`) : null;
  const worked = !["GENERATED", "ASSIGNED"].includes(stage);

  await db.transaction(async (tx) => {
    await tx
      .update(leads)
      .set({
        stage,
        lostReason: stage === "LOST" ? note || lead.lostReason || null : null,
        firstContactedAt: lead.firstContactedAt || (worked ? new Date() : null),
        ...(newVisitAt ? { visitDate, visitTime } : {}),
      })
      .where(eq(leads._id, lead._id));

    if (visitStatus || newVisitAt) {
      if (latestVisit && (latestVisit.status !== "COMPLETED" || visitStatus === "COMPLETED" || newVisitAt)) {
        await tx
          .update(siteVisits)
          .set({
            ...(visitStatus ? { status: visitStatus, ...(visitStatus === "COMPLETED" ? { attendanceConfirmed: true } : {}) } : {}),
            ...(newVisitAt ? { scheduledAt: newVisitAt, timeSlot: formatVisitTime(visitTime!) } : {}),
          })
          .where(eq(siteVisits._id, latestVisit._id));
      } else {
        await tx.insert(siteVisits).values({
          leadId: lead._id,
          projectId: lead.projectId,
          cpId: lead.assignedToId,
          scheduledAt: newVisitAt ?? new Date(),
          timeSlot: visitTime ? formatVisitTime(visitTime) : null,
          contactNumber: lead.clientPhone,
          status: visitStatus ?? "SCHEDULED",
        });
      }
    }

    await tx.insert(leadActivities).values({
      leadId: lead._id,
      cpId: (lead.assignedToId || lead.submittedById) as string,
      type: "STAGE_CHANGE",
      content: `Status set to ${STATUS_LABEL[status]}${newVisitAt ? ` — visit ${formatVisitDate(visitDate!)} at ${formatVisitTime(visitTime!)}` : ""}${note ? ` — ${note}` : ""}`,
      metadata: { by: req.user!.userId, status, from: lead.stage, to: stage },
    });
  });

  const [updated] = await db.select().from(leads).where(eq(leads._id, lead._id));
  const [proj] = await db.select({ name: projects.name, developerId: projects.developerId }).from(projects).where(eq(projects._id, lead.projectId));
  emitLeadUpdate(updated, proj?.developerId);
  void logAudit({ userId: req.user!.userId, action: "lead.status.update", resourceType: "lead", resourceId: String(lead._id), metadata: { status, from: lead.stage, to: stage } });

  // Tell whoever brought the lead (CP / ambassador / buyer) about the change.
  if (String(lead.submittedById) !== req.user!.userId) {
    void notifyUser(String(lead.submittedById), {
      type: status === "CONVERTED" ? NotificationType.LEAD_CONVERTED : NotificationType.LEAD_UPDATED,
      title: "Lead update",
      message: `${displayLeadId(lead.leadNo)} (${lead.clientName}) · ${proj?.name ?? "project"} is now "${STATUS_LABEL[status]}".`,
      actorUserId: req.user!.userId,
    }).catch(() => {});
  }

  res.json({ ok: true, status, stage });
});

export default router;
