import { Router } from "express";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../config/db";
import {
  financeEntries, bankAccounts, loans,
  FinanceDirection, FinanceCategory, IFinanceEntry,
} from "../db/schema";
import { authenticate, requireRole, AuthedRequest } from "../middleware/auth";
import { isValidId } from "../lib/ids";
import { emitToRole } from "../sockets";
import { logAudit } from "../services/audit";

const router = Router();
router.use(authenticate, requireRole("ADMIN"));

// Any successful write pushes a live event so every open Founder Dashboard /
// Finance screen refetches immediately (real-time, no manual refresh).
const pushLive = () => emitToRole("ADMIN", "finance:update", { at: new Date().toISOString() });

const DIRECTIONS: FinanceDirection[] = ["INFLOW", "OUTFLOW"];
const CATEGORIES: FinanceCategory[] = [
  "SALES", "COMMISSION_PAYOUT", "DEVELOPER_PAYMENT", "SUBSCRIPTION",
  "OPERATING_EXPENSE", "SALARY", "MARKETING", "TAX", "REFUND", "OTHER",
];

const entrySchema = z.object({
  direction: z.enum(DIRECTIONS as [FinanceDirection, ...FinanceDirection[]]),
  category: z.enum(CATEGORIES as [FinanceCategory, ...FinanceCategory[]]).default("OTHER"),
  description: z.string().min(1).max(300),
  party: z.string().max(200).optional().nullable(),
  amountPaise: z.number().int().nonnegative(),
  gstPaise: z.number().int().nonnegative().default(0),
  tdsPaise: z.number().int().nonnegative().default(0),
  settled: z.boolean().default(true),
  dueDate: z.string().datetime().optional().nullable(),
  projectId: z.string().optional().nullable(),
});

/* ------------------------------------------------------------- entries CRUD */
// GET /api/finance?direction=&settled=&category=
router.get("/", async (req, res) => {
  const db = getDb();
  const conds = [];
  if (typeof req.query.direction === "string" && DIRECTIONS.includes(req.query.direction as FinanceDirection))
    conds.push(eq(financeEntries.direction, req.query.direction as FinanceDirection));
  if (req.query.settled === "true") conds.push(eq(financeEntries.settled, true));
  if (req.query.settled === "false") conds.push(eq(financeEntries.settled, false));
  const rows = await db.select().from(financeEntries)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(financeEntries.createdAt));
  res.json({ entries: rows });
});

// POST /api/finance
router.post("/", async (req: AuthedRequest, res) => {
  const p = entrySchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Validation failed", issues: p.error.flatten() });
  const d = p.data;
  if (d.projectId && !isValidId(d.projectId)) return res.status(400).json({ error: "Invalid projectId" });
  const db = getDb();
  const [row] = await db.insert(financeEntries).values({
    direction: d.direction,
    category: d.category,
    description: d.description,
    party: d.party ?? null,
    amountPaise: d.amountPaise,
    gstPaise: d.gstPaise,
    tdsPaise: d.tdsPaise,
    settled: d.settled,
    dueDate: d.dueDate ? new Date(d.dueDate) : null,
    settledAt: d.settled ? new Date() : null,
    projectId: d.projectId ?? null,
    createdById: req.user!.userId,
  }).returning();
  await logAudit({ userId: req.user!.userId, action: "finance.entry.create", resourceType: "finance_entry", resourceId: String(row._id), metadata: { direction: d.direction, category: d.category, amountPaise: d.amountPaise } });
  pushLive();
  res.status(201).json({ entry: row });
});

// PATCH /api/finance/:id  (edit fields or mark settled)
router.patch("/:id", async (req, res) => {
  if (!isValidId(req.params.id)) return res.status(404).json({ error: "Not found" });
  const p = entrySchema.partial().safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Validation failed", issues: p.error.flatten() });
  const d = p.data;
  const db = getDb();
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  for (const k of ["direction", "category", "description", "party", "amountPaise", "gstPaise", "tdsPaise"] as const)
    if (d[k] !== undefined) patch[k] = d[k];
  if (d.dueDate !== undefined) patch.dueDate = d.dueDate ? new Date(d.dueDate) : null;
  if (d.settled !== undefined) {
    patch.settled = d.settled;
    patch.settledAt = d.settled ? new Date() : null;
  }
  const [row] = await db.update(financeEntries).set(patch).where(eq(financeEntries._id, req.params.id)).returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  pushLive();
  res.json({ entry: row });
});

// DELETE /api/finance/:id
router.delete("/:id", async (req: AuthedRequest, res) => {
  if (!isValidId(req.params.id)) return res.status(404).json({ error: "Not found" });
  const db = getDb();
  await db.delete(financeEntries).where(eq(financeEntries._id, req.params.id));
  await logAudit({ userId: req.user!.userId, action: "finance.entry.delete", resourceType: "finance_entry", resourceId: req.params.id });
  pushLive();
  res.json({ ok: true });
});

/* --------------------------------------------------------- bank accounts */
const accountSchema = z.object({ name: z.string().min(1).max(120), balancePaise: z.number().int() });

router.get("/accounts", async (_req, res) => {
  const rows = await getDb().select().from(bankAccounts).orderBy(desc(bankAccounts.createdAt));
  res.json({ accounts: rows });
});
router.post("/accounts", async (req, res) => {
  const p = accountSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Validation failed", issues: p.error.flatten() });
  const [row] = await getDb().insert(bankAccounts).values(p.data).returning();
  pushLive();
  res.status(201).json({ account: row });
});
router.patch("/accounts/:id", async (req, res) => {
  if (!isValidId(req.params.id)) return res.status(404).json({ error: "Not found" });
  const p = accountSchema.partial().safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Validation failed", issues: p.error.flatten() });
  const [row] = await getDb().update(bankAccounts).set({ ...p.data, updatedAt: new Date() }).where(eq(bankAccounts._id, req.params.id)).returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  pushLive();
  res.json({ account: row });
});
router.delete("/accounts/:id", async (req, res) => {
  if (!isValidId(req.params.id)) return res.status(404).json({ error: "Not found" });
  await getDb().delete(bankAccounts).where(eq(bankAccounts._id, req.params.id));
  pushLive();
  res.json({ ok: true });
});

/* ---------------------------------------------------------------- loans */
const loanSchema = z.object({
  lender: z.string().min(1).max(160),
  principalPaise: z.number().int().nonnegative(),
  outstandingPaise: z.number().int().nonnegative(),
  emiPaise: z.number().int().nonnegative().default(0),
  nextDueDate: z.string().datetime().optional().nullable(),
  status: z.enum(["ACTIVE", "CLOSED"]).default("ACTIVE"),
});

router.get("/loans", async (_req, res) => {
  const rows = await getDb().select().from(loans).orderBy(desc(loans.createdAt));
  res.json({ loans: rows });
});
router.post("/loans", async (req: AuthedRequest, res) => {
  const p = loanSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Validation failed", issues: p.error.flatten() });
  const d = p.data;
  const [row] = await getDb().insert(loans).values({
    lender: d.lender, principalPaise: d.principalPaise, outstandingPaise: d.outstandingPaise,
    emiPaise: d.emiPaise, nextDueDate: d.nextDueDate ? new Date(d.nextDueDate) : null,
    status: d.status, createdById: req.user!.userId,
  }).returning();
  pushLive();
  res.status(201).json({ loan: row });
});
router.patch("/loans/:id", async (req, res) => {
  if (!isValidId(req.params.id)) return res.status(404).json({ error: "Not found" });
  const p = loanSchema.partial().safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Validation failed", issues: p.error.flatten() });
  const d = p.data;
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  for (const k of ["lender", "principalPaise", "outstandingPaise", "emiPaise", "status"] as const)
    if (d[k] !== undefined) patch[k] = d[k];
  if (d.nextDueDate !== undefined) patch.nextDueDate = d.nextDueDate ? new Date(d.nextDueDate) : null;
  const [row] = await getDb().update(loans).set(patch).where(eq(loans._id, req.params.id)).returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  pushLive();
  res.json({ loan: row });
});
router.delete("/loans/:id", async (req, res) => {
  if (!isValidId(req.params.id)) return res.status(404).json({ error: "Not found" });
  await getDb().delete(loans).where(eq(loans._id, req.params.id));
  pushLive();
  res.json({ ok: true });
});

/* -------------------------------------------------------------- summary */
// GET /api/finance/summary — the live aggregate consumed by the Founder
// Dashboard Finance & Company-Health sections. Rupees, computed from real rows.
router.get("/summary", async (_req, res) => {
  const db = getDb();
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  const [entries, accounts, loanRows] = await Promise.all([
    db.select().from(financeEntries),
    db.select().from(bankAccounts),
    db.select().from(loans),
  ]);
  const r = (paise: number) => Math.round(paise) / 100;

  const inflow = entries.filter((e) => e.direction === "INFLOW");
  const outflow = entries.filter((e) => e.direction === "OUTFLOW");
  const sum = (rows: IFinanceEntry[], f: (e: IFinanceEntry) => number) => rows.reduce((s, e) => s + f(e), 0);

  const cashInflow = sum(inflow.filter((e) => e.settled), (e) => e.amountPaise);
  const cashOutflow = sum(outflow.filter((e) => e.settled), (e) => e.amountPaise);
  const receivables = sum(inflow.filter((e) => !e.settled), (e) => e.amountPaise);
  const payables = sum(outflow.filter((e) => !e.settled), (e) => e.amountPaise);

  const gstCollected = sum(inflow, (e) => e.gstPaise);
  const gstPaid = sum(outflow, (e) => e.gstPaise);
  const tdsWithheld = sum(entries, (e) => e.tdsPaise);

  const bankBalance = accounts.reduce((s, a) => s + a.balancePaise, 0);

  // Burn = average monthly settled operating outflow over the last 90 days.
  const recentOut = outflow.filter((e) => e.settled && e.settledAt && e.settledAt >= ninetyDaysAgo && e.category !== "COMMISSION_PAYOUT" && e.category !== "DEVELOPER_PAYMENT");
  const burnRatePaise = Math.round(sum(recentOut, (e) => e.amountPaise) / 3);
  const runwayMonths = burnRatePaise > 0 ? Math.floor(bankBalance / burnRatePaise) : null;

  const netProfitPaise = cashInflow - cashOutflow;
  const grossInflowExTax = sum(inflow.filter((e) => e.settled), (e) => e.amountPaise - e.gstPaise);
  const directCosts = sum(outflow.filter((e) => e.settled && (e.category === "COMMISSION_PAYOUT" || e.category === "DEVELOPER_PAYMENT")), (e) => e.amountPaise);
  const grossProfitPaise = grossInflowExTax - directCosts;

  const activeLoans = loanRows.filter((l) => l.status === "ACTIVE");
  const totalOutstanding = activeLoans.reduce((s, l) => s + l.outstandingPaise, 0);
  const monthlyEmi = activeLoans.reduce((s, l) => s + l.emiPaise, 0);

  const upcoming = [
    ...outflow.filter((e) => !e.settled && e.dueDate).map((e) => ({
      kind: "PAYABLE", label: e.description, party: e.party, amount: r(e.amountPaise), dueDate: e.dueDate,
    })),
    ...activeLoans.filter((l) => l.nextDueDate).map((l) => ({
      kind: "EMI", label: `${l.lender} EMI`, party: l.lender, amount: r(l.emiPaise), dueDate: l.nextDueDate,
    })),
  ].sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime()).slice(0, 10);

  const mtdInflow = sum(inflow.filter((e) => e.settled && e.settledAt && e.settledAt >= startOfMonth), (e) => e.amountPaise);
  const mtdOutflow = sum(outflow.filter((e) => e.settled && e.settledAt && e.settledAt >= startOfMonth), (e) => e.amountPaise);

  res.json({
    hasData: entries.length > 0 || accounts.length > 0 || loanRows.length > 0,
    cashInflow: r(cashInflow),
    cashOutflow: r(cashOutflow),
    netCashFlow: r(netProfitPaise),
    mtdInflow: r(mtdInflow),
    mtdOutflow: r(mtdOutflow),
    receivables: r(receivables),
    payables: r(payables),
    gstCollected: r(gstCollected),
    gstPaid: r(gstPaid),
    gstNet: r(gstCollected - gstPaid),
    tdsWithheld: r(tdsWithheld),
    bankBalance: r(bankBalance),
    grossProfit: r(grossProfitPaise),
    netProfit: r(netProfitPaise),
    burnRate: r(burnRatePaise),
    runwayMonths,
    totalLoanOutstanding: r(totalOutstanding),
    monthlyEmi: r(monthlyEmi),
    activeLoanCount: activeLoans.length,
    upcomingPayments: upcoming,
    accounts: accounts.map((a) => ({ id: String(a._id), name: a.name, balance: r(a.balancePaise) })),
    entryCount: entries.length,
  });
});

export default router;
