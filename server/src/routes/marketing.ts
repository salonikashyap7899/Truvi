/**
 * Marketing module routes.
 *
 * Two routers exported:
 *   • default  → `/api/marketing`        (partner-facing, gated by access)
 *   • adminRouter → `/api/admin/marketing` (admin/founder management)
 *
 * The module is fully self-contained: it never touches the Developer pricing
 * catalog, `payments`, or `subscriptions`. GST on direct/offline payments is
 * charged on top of the base amount and stored explicitly — never bypassed.
 */
import { Router } from "express";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../config/db";
import { getEnv } from "../config/env";
import { withGst } from "../config/pricing";
import { isValidId } from "../lib/ids";
import {
  users,
  marketingAccess,
  marketingPayments,
  marketingExpenses,
  marketingLeads,
  marketingPartnerCampaigns,
} from "../db/schema";
import { authenticate, requireRole, AuthedRequest } from "../middleware/auth";
import { requireMarketingAccess } from "../middleware/marketingAccess";
import { getMarketingDashboard, getAccess } from "../services/marketingService";
import { notifyUser, NotificationType } from "../services/notificationService";
import { logAudit } from "../services/audit";

const rupeesToPaise = (r: number) => Math.round(Number(r) * 100);

// ──────────────────────────────────────────────────────────────────────────
// PARTNER ROUTER — /api/marketing
// ──────────────────────────────────────────────────────────────────────────
const router = Router();
router.use(authenticate);

/** Lightweight access probe for nav gating — never gated itself. */
router.get("/access", async (req: AuthedRequest, res) => {
  const access = await getAccess(req.user!.userId);
  const now = Date.now();
  const active =
    !!access &&
    access.status === "ACTIVE" &&
    (!access.validFrom || new Date(access.validFrom).getTime() <= now) &&
    (!access.validUntil || new Date(access.validUntil).getTime() >= now);
  res.json({
    hasAccess: req.user!.role === "ADMIN" || active,
    isAdmin: req.user!.role === "ADMIN",
    access: access
      ? {
          packageName: access.packageName,
          status: access.status,
          validFrom: access.validFrom,
          validUntil: access.validUntil,
          budgetPaise: access.budgetPaise,
        }
      : null,
  });
});

/** Full dashboard (summary cards + expense/lead/campaign tables). */
router.get("/dashboard", requireMarketingAccess, async (req: AuthedRequest, res) => {
  const data = await getMarketingDashboard(req.user!.userId);
  res.json(data);
});

/** Partner can log a lead their marketing generated. */
const leadInput = z.object({
  name: z.string().min(1),
  phone: z.string().optional(),
  email: z.string().optional(),
  source: z.string().optional(),
  status: z.enum(["NEW", "QUALIFIED", "CONVERTED", "PENDING"]).optional(),
  valueRupees: z.number().nonnegative().optional(),
  notes: z.string().optional(),
});

router.post("/leads", requireMarketingAccess, async (req: AuthedRequest, res) => {
  const parsed = leadInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid lead" });
  const db = getDb();
  const [row] = await db
    .insert(marketingLeads)
    .values({
      userId: req.user!.userId,
      name: parsed.data.name.trim(),
      phone: parsed.data.phone?.trim() || null,
      email: parsed.data.email?.trim() || null,
      source: parsed.data.source?.trim() || "Marketing",
      status: parsed.data.status ?? "NEW",
      valuePaise: parsed.data.valueRupees ? rupeesToPaise(parsed.data.valueRupees) : 0,
      notes: parsed.data.notes?.trim() || null,
      createdById: req.user!.userId,
    })
    .returning();
  res.status(201).json({ lead: row });
});

router.patch("/leads/:id", requireMarketingAccess, async (req: AuthedRequest, res) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ error: "Invalid id" });
  const parsed = leadInput.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid lead" });
  const db = getDb();
  const patch: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) patch.name = parsed.data.name.trim();
  if (parsed.data.phone !== undefined) patch.phone = parsed.data.phone?.trim() || null;
  if (parsed.data.email !== undefined) patch.email = parsed.data.email?.trim() || null;
  if (parsed.data.source !== undefined) patch.source = parsed.data.source?.trim() || "Marketing";
  if (parsed.data.status !== undefined) patch.status = parsed.data.status;
  if (parsed.data.valueRupees !== undefined) patch.valuePaise = rupeesToPaise(parsed.data.valueRupees);
  if (parsed.data.notes !== undefined) patch.notes = parsed.data.notes?.trim() || null;
  // Scope the update to this partner's own leads.
  const [row] = await db
    .update(marketingLeads)
    .set(patch)
    .where(and(eq(marketingLeads._id, req.params.id), eq(marketingLeads.userId, req.user!.userId)))
    .returning();
  if (!row) return res.status(404).json({ error: "Lead not found" });
  res.json({ lead: row });
});

export default router;

// ──────────────────────────────────────────────────────────────────────────
// ADMIN ROUTER — /api/admin/marketing  (mounted in app.ts)
// ──────────────────────────────────────────────────────────────────────────
export const adminRouter = Router();
adminRouter.use(authenticate);
adminRouter.use(requireRole("ADMIN"));

/** All access grants, newest first, with the partner's identity. */
adminRouter.get("/access", async (_req, res) => {
  const db = getDb();
  const rows = await db
    .select({
      access: marketingAccess,
      userName: users.name,
      userEmail: users.email,
      userRole: users.role,
    })
    .from(marketingAccess)
    .leftJoin(users, eq(marketingAccess.userId, users._id))
    .orderBy(desc(marketingAccess.createdAt));
  res.json({
    access: rows.map((r) => ({
      ...r.access,
      user: { name: r.userName, email: r.userEmail, role: r.userRole },
    })),
  });
});

/** Grant (or update) marketing access. Upserts on the unique user_id. */
const grantSchema = z.object({
  userId: z.string(),
  packageName: z.string().optional(),
  budgetRupees: z.number().nonnegative().optional(),
  validUntil: z.string().optional().nullable(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  notes: z.string().optional(),
});

adminRouter.post("/access", async (req: AuthedRequest, res) => {
  const parsed = grantSchema.safeParse(req.body);
  if (!parsed.success || !isValidId(parsed.data.userId)) {
    return res.status(400).json({ error: "Invalid input" });
  }
  const db = getDb();
  const [target] = await db.select({ id: users._id, name: users.name }).from(users).where(eq(users._id, parsed.data.userId)).limit(1);
  if (!target) return res.status(404).json({ error: "User not found" });

  const values = {
    userId: parsed.data.userId,
    packageName: parsed.data.packageName?.trim() || "Marketing Access",
    budgetPaise: parsed.data.budgetRupees != null ? rupeesToPaise(parsed.data.budgetRupees) : 0,
    validUntil: parsed.data.validUntil ? new Date(parsed.data.validUntil) : null,
    status: parsed.data.status ?? "ACTIVE",
    grantedById: req.user!.userId,
    notes: parsed.data.notes?.trim() || null,
    updatedAt: new Date(),
  };

  const existing = await getAccess(parsed.data.userId);
  let row;
  if (existing) {
    [row] = await db.update(marketingAccess).set(values).where(eq(marketingAccess.userId, parsed.data.userId)).returning();
  } else {
    [row] = await db.insert(marketingAccess).values(values).returning();
  }

  await logAudit({
    userId: req.user!.userId,
    action: existing ? "marketing.access.update" : "marketing.access.grant",
    resourceType: "marketing_access",
    resourceId: parsed.data.userId,
    metadata: { packageName: values.packageName, budgetPaise: values.budgetPaise, status: values.status },
  });

  if (row?.status === "ACTIVE") {
    void notifyUser(parsed.data.userId, {
      type: NotificationType.MARKETING_ACCESS_GRANTED,
      title: "Marketing access activated 🎯",
      message: "You now have access to the Marketing Dashboard. Track your budget, campaigns and leads.",
      data: { href: "/marketing" },
      dedupeKey: `mkt-access:${row._id}`,
    });
  }
  res.json({ access: row });
});

/** Activate / deactivate / adjust an existing grant. */
adminRouter.patch("/access/:userId", async (req: AuthedRequest, res) => {
  if (!isValidId(req.params.userId)) return res.status(400).json({ error: "Invalid id" });
  const parsed = grantSchema.omit({ userId: true }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });
  const db = getDb();
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.packageName !== undefined) patch.packageName = parsed.data.packageName.trim() || "Marketing Access";
  if (parsed.data.budgetRupees !== undefined) patch.budgetPaise = rupeesToPaise(parsed.data.budgetRupees);
  if (parsed.data.validUntil !== undefined) patch.validUntil = parsed.data.validUntil ? new Date(parsed.data.validUntil) : null;
  if (parsed.data.status !== undefined) patch.status = parsed.data.status;
  if (parsed.data.notes !== undefined) patch.notes = parsed.data.notes?.trim() || null;
  const [row] = await db.update(marketingAccess).set(patch).where(eq(marketingAccess.userId, req.params.userId)).returning();
  if (!row) return res.status(404).json({ error: "Access not found" });
  await logAudit({
    userId: req.user!.userId,
    action: "marketing.access.update",
    resourceType: "marketing_access",
    resourceId: req.params.userId,
    metadata: { status: row.status },
  });
  res.json({ access: row });
});

/** Revoke access entirely (immediate — the next request is blocked). */
adminRouter.delete("/access/:userId", async (req: AuthedRequest, res) => {
  if (!isValidId(req.params.userId)) return res.status(400).json({ error: "Invalid id" });
  const db = getDb();
  const [row] = await db.delete(marketingAccess).where(eq(marketingAccess.userId, req.params.userId)).returning();
  if (!row) return res.status(404).json({ error: "Access not found" });
  await logAudit({
    userId: req.user!.userId,
    action: "marketing.access.revoke",
    resourceType: "marketing_access",
    resourceId: req.params.userId,
  });
  void notifyUser(req.params.userId, {
    type: NotificationType.MARKETING_ACCESS_REVOKED,
    title: "Marketing access ended",
    message: "Your marketing access has been deactivated. Contact the Truvi team to renew.",
  });
  res.json({ ok: true });
});

/** A partner's dashboard, as the admin sees it. */
adminRouter.get("/dashboard/:userId", async (req, res) => {
  if (!isValidId(req.params.userId)) return res.status(400).json({ error: "Invalid id" });
  const data = await getMarketingDashboard(req.params.userId);
  res.json(data);
});

// ── Direct / offline payments (GST charged, never bypassed) ────────────────
const paymentSchema = z.object({
  userId: z.string(),
  partnerName: z.string().min(1),
  partnerEmail: z.string().optional(),
  partnerPhone: z.string().optional(),
  packageName: z.string().optional(),
  amountRupees: z.number().nonnegative(),
  gstPercent: z.number().nonnegative().optional(),
  method: z.enum(["CASH", "BANK_TRANSFER", "UPI", "CHEQUE", "CARD", "OTHER"]).optional(),
  reference: z.string().optional(),
  status: z.enum(["PENDING", "VERIFIED", "FAILED", "REFUNDED"]).optional(),
  paidAt: z.string().optional(),
  notes: z.string().optional(),
  /** When true, the base amount is added to the partner's spendable budget. */
  addToBudget: z.boolean().optional(),
});

adminRouter.get("/payments", async (req, res) => {
  const db = getDb();
  const userId = typeof req.query.userId === "string" ? req.query.userId : null;
  const base = db
    .select({
      payment: marketingPayments,
      userName: users.name,
      userEmail: users.email,
    })
    .from(marketingPayments)
    .leftJoin(users, eq(marketingPayments.userId, users._id))
    .orderBy(desc(marketingPayments.createdAt));
  const rows = userId && isValidId(userId) ? await base.where(eq(marketingPayments.userId, userId)) : await base;
  res.json({
    payments: rows.map((r) => ({ ...r.payment, user: { name: r.userName, email: r.userEmail } })),
  });
});

adminRouter.post("/payments", async (req: AuthedRequest, res) => {
  const parsed = paymentSchema.safeParse(req.body);
  if (!parsed.success || !isValidId(parsed.data.userId)) return res.status(400).json({ error: "Invalid input" });
  const db = getDb();
  const [target] = await db.select({ id: users._id }).from(users).where(eq(users._id, parsed.data.userId)).limit(1);
  if (!target) return res.status(404).json({ error: "User not found" });

  const env = getEnv();
  const basePaise = rupeesToPaise(parsed.data.amountRupees);
  const gstPercent = parsed.data.gstPercent != null ? parsed.data.gstPercent : env.gstPercent;
  const gstPaise = withGst(basePaise, gstPercent) - basePaise;
  const totalPaise = basePaise + gstPaise;

  const [row] = await db
    .insert(marketingPayments)
    .values({
      userId: parsed.data.userId,
      partnerName: parsed.data.partnerName.trim(),
      partnerEmail: parsed.data.partnerEmail?.trim() || null,
      partnerPhone: parsed.data.partnerPhone?.trim() || null,
      packageName: parsed.data.packageName?.trim() || "Marketing Access",
      amountPaise: basePaise,
      gstPercent,
      gstPaise,
      totalPaise,
      method: parsed.data.method ?? "OTHER",
      reference: parsed.data.reference?.trim() || null,
      status: parsed.data.status ?? "VERIFIED",
      paidAt: parsed.data.paidAt ? new Date(parsed.data.paidAt) : new Date(),
      verifiedById: req.user!.userId,
      notes: parsed.data.notes?.trim() || null,
    })
    .returning();

  // Optionally roll the base amount into the partner's spendable budget.
  if (parsed.data.addToBudget) {
    const existing = await getAccess(parsed.data.userId);
    if (existing) {
      await db
        .update(marketingAccess)
        .set({ budgetPaise: existing.budgetPaise + basePaise, updatedAt: new Date() })
        .where(eq(marketingAccess.userId, parsed.data.userId));
    }
  }

  await logAudit({
    userId: req.user!.userId,
    action: "marketing.payment.record",
    resourceType: "marketing_payment",
    resourceId: row._id,
    metadata: { userId: parsed.data.userId, basePaise, gstPaise, totalPaise, method: row.method },
  });

  void notifyUser(parsed.data.userId, {
    type: NotificationType.MARKETING_PAYMENT_RECORDED,
    title: "Marketing payment recorded",
    message: `A payment of ₹${(totalPaise / 100).toLocaleString("en-IN")} (incl. GST) has been recorded on your account.`,
    data: { href: "/marketing" },
    dedupeKey: `mkt-pay:${row._id}`,
  });
  res.status(201).json({ payment: row });
});

// ── Expenses (admin-tracked spend) ─────────────────────────────────────────
const expenseSchema = z.object({
  userId: z.string(),
  activity: z.string().min(1),
  amountRupees: z.number().nonnegative(),
  status: z.enum(["PLANNED", "ACTIVE", "COMPLETED"]).optional(),
  spentAt: z.string().optional(),
  notes: z.string().optional(),
});

adminRouter.post("/expenses", async (req: AuthedRequest, res) => {
  const parsed = expenseSchema.safeParse(req.body);
  if (!parsed.success || !isValidId(parsed.data.userId)) return res.status(400).json({ error: "Invalid input" });
  const db = getDb();
  const [row] = await db
    .insert(marketingExpenses)
    .values({
      userId: parsed.data.userId,
      activity: parsed.data.activity.trim(),
      amountPaise: rupeesToPaise(parsed.data.amountRupees),
      status: parsed.data.status ?? "ACTIVE",
      spentAt: parsed.data.spentAt ? new Date(parsed.data.spentAt) : new Date(),
      notes: parsed.data.notes?.trim() || null,
      createdById: req.user!.userId,
    })
    .returning();
  res.status(201).json({ expense: row });
});

adminRouter.patch("/expenses/:id", async (req, res) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ error: "Invalid id" });
  const parsed = expenseSchema.omit({ userId: true }).partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });
  const db = getDb();
  const patch: Record<string, unknown> = {};
  if (parsed.data.activity !== undefined) patch.activity = parsed.data.activity.trim();
  if (parsed.data.amountRupees !== undefined) patch.amountPaise = rupeesToPaise(parsed.data.amountRupees);
  if (parsed.data.status !== undefined) patch.status = parsed.data.status;
  if (parsed.data.spentAt !== undefined) patch.spentAt = parsed.data.spentAt ? new Date(parsed.data.spentAt) : new Date();
  if (parsed.data.notes !== undefined) patch.notes = parsed.data.notes?.trim() || null;
  const [row] = await db.update(marketingExpenses).set(patch).where(eq(marketingExpenses._id, req.params.id)).returning();
  if (!row) return res.status(404).json({ error: "Expense not found" });
  res.json({ expense: row });
});

adminRouter.delete("/expenses/:id", async (req, res) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ error: "Invalid id" });
  const db = getDb();
  const [row] = await db.delete(marketingExpenses).where(eq(marketingExpenses._id, req.params.id)).returning();
  if (!row) return res.status(404).json({ error: "Expense not found" });
  res.json({ ok: true });
});

// ── Leads (admin-managed) ──────────────────────────────────────────────────
const adminLeadSchema = z.object({
  userId: z.string(),
  name: z.string().min(1),
  phone: z.string().optional(),
  email: z.string().optional(),
  source: z.string().optional(),
  status: z.enum(["NEW", "QUALIFIED", "CONVERTED", "PENDING"]).optional(),
  valueRupees: z.number().nonnegative().optional(),
  notes: z.string().optional(),
});

adminRouter.post("/leads", async (req: AuthedRequest, res) => {
  const parsed = adminLeadSchema.safeParse(req.body);
  if (!parsed.success || !isValidId(parsed.data.userId)) return res.status(400).json({ error: "Invalid input" });
  const db = getDb();
  const [row] = await db
    .insert(marketingLeads)
    .values({
      userId: parsed.data.userId,
      name: parsed.data.name.trim(),
      phone: parsed.data.phone?.trim() || null,
      email: parsed.data.email?.trim() || null,
      source: parsed.data.source?.trim() || "Marketing",
      status: parsed.data.status ?? "NEW",
      valuePaise: parsed.data.valueRupees ? rupeesToPaise(parsed.data.valueRupees) : 0,
      notes: parsed.data.notes?.trim() || null,
      createdById: req.user!.userId,
    })
    .returning();
  void notifyUser(parsed.data.userId, {
    type: NotificationType.MARKETING_LEAD,
    title: "New marketing lead 🎯",
    message: `${row.name} was added to your marketing leads.`,
    data: { href: "/marketing" },
  });
  res.status(201).json({ lead: row });
});

adminRouter.patch("/leads/:id", async (req, res) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ error: "Invalid id" });
  const parsed = adminLeadSchema.omit({ userId: true }).partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });
  const db = getDb();
  const patch: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) patch.name = parsed.data.name.trim();
  if (parsed.data.phone !== undefined) patch.phone = parsed.data.phone?.trim() || null;
  if (parsed.data.email !== undefined) patch.email = parsed.data.email?.trim() || null;
  if (parsed.data.source !== undefined) patch.source = parsed.data.source?.trim() || "Marketing";
  if (parsed.data.status !== undefined) patch.status = parsed.data.status;
  if (parsed.data.valueRupees !== undefined) patch.valuePaise = rupeesToPaise(parsed.data.valueRupees);
  if (parsed.data.notes !== undefined) patch.notes = parsed.data.notes?.trim() || null;
  const [row] = await db.update(marketingLeads).set(patch).where(eq(marketingLeads._id, req.params.id)).returning();
  if (!row) return res.status(404).json({ error: "Lead not found" });
  res.json({ lead: row });
});

adminRouter.delete("/leads/:id", async (req, res) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ error: "Invalid id" });
  const db = getDb();
  const [row] = await db.delete(marketingLeads).where(eq(marketingLeads._id, req.params.id)).returning();
  if (!row) return res.status(404).json({ error: "Lead not found" });
  res.json({ ok: true });
});

// ── Campaigns (admin-managed) ──────────────────────────────────────────────
const campaignSchema = z.object({
  userId: z.string(),
  name: z.string().min(1),
  channel: z.string().optional(),
  status: z.enum(["ACTIVE", "PAUSED", "COMPLETED"]).optional(),
  spendRupees: z.number().nonnegative().optional(),
  leadsCount: z.number().int().nonnegative().optional(),
  startedAt: z.string().optional(),
});

adminRouter.post("/campaigns", async (req: AuthedRequest, res) => {
  const parsed = campaignSchema.safeParse(req.body);
  if (!parsed.success || !isValidId(parsed.data.userId)) return res.status(400).json({ error: "Invalid input" });
  const db = getDb();
  const [row] = await db
    .insert(marketingPartnerCampaigns)
    .values({
      userId: parsed.data.userId,
      name: parsed.data.name.trim(),
      channel: parsed.data.channel?.trim() || "Other",
      status: parsed.data.status ?? "ACTIVE",
      spendPaise: parsed.data.spendRupees ? rupeesToPaise(parsed.data.spendRupees) : 0,
      leadsCount: parsed.data.leadsCount ?? 0,
      startedAt: parsed.data.startedAt ? new Date(parsed.data.startedAt) : null,
      createdById: req.user!.userId,
    })
    .returning();
  res.status(201).json({ campaign: row });
});

adminRouter.patch("/campaigns/:id", async (req, res) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ error: "Invalid id" });
  const parsed = campaignSchema.omit({ userId: true }).partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });
  const db = getDb();
  const patch: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) patch.name = parsed.data.name.trim();
  if (parsed.data.channel !== undefined) patch.channel = parsed.data.channel?.trim() || "Other";
  if (parsed.data.status !== undefined) patch.status = parsed.data.status;
  if (parsed.data.spendRupees !== undefined) patch.spendPaise = rupeesToPaise(parsed.data.spendRupees);
  if (parsed.data.leadsCount !== undefined) patch.leadsCount = parsed.data.leadsCount;
  if (parsed.data.startedAt !== undefined) patch.startedAt = parsed.data.startedAt ? new Date(parsed.data.startedAt) : null;
  const [row] = await db.update(marketingPartnerCampaigns).set(patch).where(eq(marketingPartnerCampaigns._id, req.params.id)).returning();
  if (!row) return res.status(404).json({ error: "Campaign not found" });
  res.json({ campaign: row });
});

adminRouter.delete("/campaigns/:id", async (req, res) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ error: "Invalid id" });
  const db = getDb();
  const [row] = await db.delete(marketingPartnerCampaigns).where(eq(marketingPartnerCampaigns._id, req.params.id)).returning();
  if (!row) return res.status(404).json({ error: "Campaign not found" });
  res.json({ ok: true });
});
