import { Router } from "express";
import { z } from "zod";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "../config/db";
import { projects, projectAssets, users, projectInvestmentTerms, projectInvestments, notifications } from "../db/schema";
import { isValidId } from "../lib/ids";
import { authenticate, requireRole, AuthedRequest } from "../middleware/auth";
import { createOrder, verifyPaymentSignature, isPaymentGatewayConfigured } from "../services/paymentService";
import { getEnv } from "../config/env";
import { emitNotification } from "../sockets";

const router = Router();

/** Load cover images for a set of projects (best verified gallery image). */
async function coversFor(db: ReturnType<typeof getDb>, ids: string[]) {
  const map = new Map<string, string>();
  if (!ids.length) return map;
  const rows = await db
    .select({ projectId: projectAssets.projectId, fileUrl: projectAssets.fileUrl })
    .from(projectAssets)
    .where(and(inArray(projectAssets.projectId, ids), eq(projectAssets.category, "GALLERY_IMAGE"), eq(projectAssets.verified, true)))
    .orderBy(desc(projectAssets.createdAt));
  for (const r of rows) if (!map.has(String(r.projectId))) map.set(String(r.projectId), r.fileUrl);
  return map;
}

// GET /api/invest/opportunities — projects currently OPEN for investment, with
// their admin-set terms. Public (discovery); investing itself requires login.
router.get("/opportunities", async (_req, res) => {
  const db = getDb();
  const rows = await db
    .select({
      terms: projectInvestmentTerms,
      project: { _id: projects._id, name: projects.name, city: projects.city, location: projects.location, isVerified: projects.isVerified, reraNumber: projects.reraNumber },
      developer: { name: users.name },
    })
    .from(projectInvestmentTerms)
    .innerJoin(projects, eq(projectInvestmentTerms.projectId, projects._id))
    .leftJoin(users, eq(projects.developerId, users._id))
    .where(and(eq(projectInvestmentTerms.isOpen, true), eq(projects.approvalStatus, "APPROVED")))
    .orderBy(desc(projectInvestmentTerms.updatedAt));

  const covers = await coversFor(db, rows.map((r) => String(r.project._id)));
  res.json({
    gatewayReady: isPaymentGatewayConfigured,
    opportunities: rows.map((r) => ({
      projectId: r.project._id,
      name: r.project.name,
      city: r.project.city,
      location: r.project.location,
      developer: r.developer?.name ?? null,
      isVerified: r.project.isVerified,
      reraNumber: r.project.reraNumber ?? null,
      coverImageUrl: covers.get(String(r.project._id)) ?? null,
      minAmount: r.terms.minAmount,
      maxAmount: r.terms.maxAmount,
      targetAnnualReturnPercent: r.terms.targetAnnualReturnPercent,
      tenureMonths: r.terms.tenureMonths,
      monthlyPayoutPercent: r.terms.monthlyPayoutPercent,
      notes: r.terms.notes,
    })),
  });
});

// POST /api/invest/create-order — begin an investment. Server validates the
// amount against the admin's terms and creates a Razorpay order.
const createOrderSchema = z.object({ projectId: z.string(), amount: z.number().positive() });
router.post("/create-order", authenticate, async (req: AuthedRequest, res) => {
  const parsed = createOrderSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });
  const { projectId, amount } = parsed.data;
  if (!isValidId(projectId)) return res.status(404).json({ error: "Project not found" });
  if (!isPaymentGatewayConfigured) return res.status(503).json({ error: "Payments are not configured yet. Please contact the Truvi team." });

  const db = getDb();
  const [terms] = await db.select().from(projectInvestmentTerms).where(eq(projectInvestmentTerms.projectId, projectId));
  if (!terms || !terms.isOpen) return res.status(400).json({ error: "This project is not open for investment." });
  if (amount < terms.minAmount) return res.status(400).json({ error: `Minimum investment is ₹${terms.minAmount.toLocaleString("en-IN")}.` });
  if (terms.maxAmount && amount > terms.maxAmount) return res.status(400).json({ error: `Maximum investment is ₹${terms.maxAmount.toLocaleString("en-IN")}.` });

  const [inv] = await db
    .insert(projectInvestments)
    .values({
      investorId: req.user!.userId,
      projectId,
      amountPaise: Math.round(amount * 100),
      targetAnnualReturnPercent: terms.targetAnnualReturnPercent,
      tenureMonths: terms.tenureMonths,
      monthlyPayoutPercent: terms.monthlyPayoutPercent,
      status: "CREATED",
    })
    .returning();

  try {
    const order = await createOrder(amount, inv._id);
    await db.update(projectInvestments).set({ razorpayOrderId: order.id, updatedAt: new Date() }).where(eq(projectInvestments._id, inv._id));
    res.json({ orderId: order.id, amount: Math.round(amount * 100), currency: "INR", keyId: getEnv().razorpayKeyId, investmentId: inv._id });
  } catch (err: any) {
    await db.update(projectInvestments).set({ status: "CANCELLED", updatedAt: new Date() }).where(eq(projectInvestments._id, inv._id));
    res.status(502).json({ error: err?.error?.description || "Could not start payment. Please try again." });
  }
});

// POST /api/invest/verify — confirm a completed Razorpay payment.
const verifySchema = z.object({ razorpay_order_id: z.string(), razorpay_payment_id: z.string(), razorpay_signature: z.string() });
router.post("/verify", authenticate, async (req: AuthedRequest, res) => {
  const parsed = verifySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Validation failed" });
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = parsed.data;
  if (!verifyPaymentSignature(razorpay_order_id, razorpay_payment_id, razorpay_signature)) {
    return res.status(400).json({ error: "Payment signature verification failed" });
  }

  const db = getDb();
  const [inv] = await db.select().from(projectInvestments).where(eq(projectInvestments.razorpayOrderId, razorpay_order_id));
  if (!inv) return res.status(404).json({ error: "Investment not found" });
  if (inv.status !== "PAID") {
    await db.update(projectInvestments).set({ status: "PAID", razorpayPaymentId: razorpay_payment_id, updatedAt: new Date() }).where(eq(projectInvestments._id, inv._id));
    try {
      const admins = await db.select({ _id: users._id }).from(users).where(eq(users.role, "ADMIN"));
      const rows = await db.insert(notifications).values(admins.map((a) => ({ userId: a._id, message: `New investment of ₹${(inv.amountPaise / 100).toLocaleString("en-IN")} received.` }))).returning();
      rows.forEach((n) => emitNotification(String(n.userId), n));
    } catch { /* non-fatal */ }
  }
  res.json({ ok: true, investmentId: inv._id });
});

// GET /api/invest/portfolio — the logged-in user's projectInvestments.
router.get("/portfolio", authenticate, async (req: AuthedRequest, res) => {
  const db = getDb();
  const rows = await db
    .select({ inv: projectInvestments, project: { name: projects.name, city: projects.city } })
    .from(projectInvestments)
    .innerJoin(projects, eq(projectInvestments.projectId, projects._id))
    .where(and(eq(projectInvestments.investorId, req.user!.userId), eq(projectInvestments.status, "PAID")))
    .orderBy(desc(projectInvestments.createdAt));

  const items = rows.map(({ inv, project }) => {
    const amount = inv.amountPaise / 100;
    const years = inv.tenureMonths / 12;
    const maturityValue = Math.round(amount * Math.pow(1 + inv.targetAnnualReturnPercent / 100, years));
    const monthlyPayout = inv.monthlyPayoutPercent ? Math.round((amount * inv.monthlyPayoutPercent) / 100) : 0;
    return {
      _id: inv._id,
      projectName: project.name,
      city: project.city,
      amount,
      targetAnnualReturnPercent: inv.targetAnnualReturnPercent,
      tenureMonths: inv.tenureMonths,
      monthlyPayout,
      maturityValue,
      projectedGain: maturityValue - amount,
      createdAt: inv.createdAt,
    };
  });
  const totalInvested = items.reduce((a, i) => a + i.amount, 0);
  const totalMaturity = items.reduce((a, i) => a + i.maturityValue, 0);
  res.json({ items, summary: { count: items.length, totalInvested, totalMaturity, projectedGain: totalMaturity - totalInvested } });
});

// ── Admin: set per-project terms + view all projectInvestments ─────────────────────
router.get("/admin/list", authenticate, requireRole("ADMIN"), async (_req, res) => {
  const db = getDb();
  const rows = await db
    .select({ _id: projects._id, name: projects.name, city: projects.city, approvalStatus: projects.approvalStatus, terms: projectInvestmentTerms })
    .from(projects)
    .leftJoin(projectInvestmentTerms, eq(projectInvestmentTerms.projectId, projects._id))
    .orderBy(desc(projects.createdAt));
  res.json({ projects: rows });
});

const termsSchema = z.object({
  isOpen: z.boolean().optional(),
  minAmount: z.number().nonnegative().optional(),
  maxAmount: z.number().nonnegative().nullable().optional(),
  targetAnnualReturnPercent: z.number().min(0).max(100).optional(),
  tenureMonths: z.number().int().min(1).max(600).optional(),
  monthlyPayoutPercent: z.number().min(0).max(100).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});
router.put("/admin/terms/:projectId", authenticate, requireRole("ADMIN"), async (req: AuthedRequest, res) => {
  if (!isValidId(req.params.projectId)) return res.status(404).json({ error: "Project not found" });
  const parsed = termsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });

  const db = getDb();
  const [proj] = await db.select({ _id: projects._id }).from(projects).where(eq(projects._id, req.params.projectId));
  if (!proj) return res.status(404).json({ error: "Project not found" });

  const [existing] = await db.select().from(projectInvestmentTerms).where(eq(projectInvestmentTerms.projectId, req.params.projectId));
  let row;
  if (existing) {
    [row] = await db.update(projectInvestmentTerms).set({ ...parsed.data, updatedById: req.user!.userId, updatedAt: new Date() }).where(eq(projectInvestmentTerms._id, existing._id)).returning();
  } else {
    [row] = await db.insert(projectInvestmentTerms).values({ projectId: req.params.projectId, ...parsed.data, updatedById: req.user!.userId }).returning();
  }
  res.json({ ok: true, terms: row });
});

router.get("/admin/investments", authenticate, requireRole("ADMIN"), async (_req, res) => {
  const db = getDb();
  const rows = await db
    .select({ inv: projectInvestments, investor: { name: users.name, email: users.email }, project: { name: projects.name } })
    .from(projectInvestments)
    .innerJoin(users, eq(projectInvestments.investorId, users._id))
    .innerJoin(projects, eq(projectInvestments.projectId, projects._id))
    .orderBy(desc(projectInvestments.createdAt));
  res.json({
    investments: rows.map(({ inv, investor, project }) => ({
      _id: inv._id, investorName: investor.name, investorEmail: investor.email, projectName: project.name,
      amount: inv.amountPaise / 100, status: inv.status, targetAnnualReturnPercent: inv.targetAnnualReturnPercent,
      tenureMonths: inv.tenureMonths, razorpayPaymentId: inv.razorpayPaymentId, createdAt: inv.createdAt,
    })),
  });
});

export default router;
