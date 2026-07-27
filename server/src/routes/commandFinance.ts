import { Router } from "express";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { getDb } from "../config/db";
import {
  commandInvestments,
  commandRevenues,
  recurringExpenses,
  employees,
  RecurringExpenseCategory,
} from "../db/schema";
import { authenticate, requireRole, AuthedRequest } from "../middleware/auth";
import { isValidId } from "../lib/ids";
import { emitToRole } from "../sockets";

/**
 * Command Center Financials — the founder-facing money module behind the
 * dashboard cards: Total/Monthly Investment, Total/Monthly Revenue, Monthly
 * Payments (recurring costs) and Employee Salaries. The founder account is an
 * ADMIN role, so every route is ADMIN-gated. All figures are derived from rows
 * founders actually enter here (no fabricated numbers), consistent with the
 * platform data-integrity rule. Amounts are in whole rupees.
 */
const router = Router();
router.use(authenticate, requireRole("ADMIN"));

// Any successful write pushes a live event so every open Founder Dashboard
// refetches immediately (real-time cards, no manual refresh).
const pushLive = () => emitToRole("ADMIN", "command-finance:update", { at: new Date().toISOString() });

const round2 = (n: number) => Math.round(n * 100) / 100;
const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const isThisMonth = (d: Date, now: Date) =>
  d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();

const RECURRING_CATEGORIES: RecurringExpenseCategory[] = [
  "API", "SOFTWARE", "HOSTING", "TWILIO", "OFFICE", "MARKETING", "OTHER",
];

/* --------------------------------------------------------------- schemas */
const entrySchema = z.object({
  title: z.string().min(1).max(200),
  category: z.string().min(1).max(80).default("General"),
  amount: z.coerce.number().min(0),
  date: z.string().optional(),
  notes: z.string().max(1000).optional().nullable(),
});

const recurringSchema = z.object({
  label: z.string().min(1).max(200),
  category: z.enum(RECURRING_CATEGORIES as [RecurringExpenseCategory, ...RecurringExpenseCategory[]]).default("OTHER"),
  amount: z.coerce.number().min(0),
  notes: z.string().max(1000).optional().nullable(),
  active: z.coerce.boolean().default(true),
});

const parseDate = (raw?: string): Date => {
  if (!raw) return new Date();
  const d = new Date(raw);
  return isNaN(d.getTime()) ? new Date() : d;
};

/* ============================================================ investments */
router.get("/investments", async (_req, res) => {
  const rows = await getDb().select().from(commandInvestments).orderBy(desc(commandInvestments.date));
  res.json({ investments: rows });
});

router.post("/investments", async (req: AuthedRequest, res) => {
  const p = entrySchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Validation failed", issues: p.error.flatten() });
  const [row] = await getDb().insert(commandInvestments).values({
    title: p.data.title,
    category: p.data.category,
    amount: p.data.amount,
    date: parseDate(p.data.date),
    notes: p.data.notes ?? null,
    createdById: req.user!.userId,
  }).returning();
  pushLive();
  res.status(201).json({ investment: row });
});

router.delete("/investments/:id", async (req, res) => {
  if (!isValidId(req.params.id)) return res.status(404).json({ error: "Not found" });
  const [row] = await getDb().delete(commandInvestments).where(eq(commandInvestments._id, req.params.id)).returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  pushLive();
  res.json({ ok: true });
});

/* ================================================================ revenue */
router.get("/revenues", async (_req, res) => {
  const rows = await getDb().select().from(commandRevenues).orderBy(desc(commandRevenues.date));
  res.json({ revenues: rows });
});

router.post("/revenues", async (req: AuthedRequest, res) => {
  const p = entrySchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Validation failed", issues: p.error.flatten() });
  const [row] = await getDb().insert(commandRevenues).values({
    title: p.data.title,
    category: p.data.category,
    amount: p.data.amount,
    date: parseDate(p.data.date),
    notes: p.data.notes ?? null,
    createdById: req.user!.userId,
  }).returning();
  pushLive();
  res.status(201).json({ revenue: row });
});

router.delete("/revenues/:id", async (req, res) => {
  if (!isValidId(req.params.id)) return res.status(404).json({ error: "Not found" });
  const [row] = await getDb().delete(commandRevenues).where(eq(commandRevenues._id, req.params.id)).returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  pushLive();
  res.json({ ok: true });
});

/* ================================================= recurring monthly payments */
router.get("/recurring", async (_req, res) => {
  const rows = await getDb().select().from(recurringExpenses).orderBy(desc(recurringExpenses.createdAt));
  res.json({ recurring: rows });
});

router.post("/recurring", async (req: AuthedRequest, res) => {
  const p = recurringSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Validation failed", issues: p.error.flatten() });
  const [row] = await getDb().insert(recurringExpenses).values({
    label: p.data.label,
    category: p.data.category,
    amount: p.data.amount,
    notes: p.data.notes ?? null,
    active: p.data.active,
    createdById: req.user!.userId,
  }).returning();
  pushLive();
  res.status(201).json({ recurring: row });
});

router.patch("/recurring/:id", async (req, res) => {
  if (!isValidId(req.params.id)) return res.status(404).json({ error: "Not found" });
  const p = recurringSchema.partial().safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Validation failed", issues: p.error.flatten() });
  const patch: Record<string, unknown> = {};
  for (const k of ["label", "category", "amount", "notes", "active"] as const)
    if (p.data[k] !== undefined) patch[k] = p.data[k];
  if (Object.keys(patch).length === 0) return res.status(400).json({ error: "Nothing to update" });
  const [row] = await getDb().update(recurringExpenses).set(patch).where(eq(recurringExpenses._id, req.params.id)).returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  pushLive();
  res.json({ recurring: row });
});

router.delete("/recurring/:id", async (req, res) => {
  if (!isValidId(req.params.id)) return res.status(404).json({ error: "Not found" });
  const [row] = await getDb().delete(recurringExpenses).where(eq(recurringExpenses._id, req.params.id)).returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  pushLive();
  res.json({ ok: true });
});

/* =============================================================== salaries */
// Employee salary roster with each employee's current-month paid state, for the
// Employee Salary Management page. Salary amounts come from employees.monthlyCtc
// (managed in the Team module); this view adds the payment tracking on top.
router.get("/salaries", async (_req, res) => {
  const rows = await getDb().select().from(employees).orderBy(desc(employees.createdAt));
  const curKey = monthKey(new Date());
  res.json({
    monthKey: curKey,
    employees: rows.map((e) => ({
      id: String(e._id),
      name: e.name,
      title: e.title,
      department: e.department,
      status: e.status,
      monthlyCtc: round2(e.monthlyCtc),
      salaryDueDay: e.salaryDueDay,
      paidThisMonth: e.salaryPaidForMonth === curKey,
    })),
  });
});

// Mark (or un-mark) an employee's salary as paid for the CURRENT month. Storing
// the month key means a new calendar month automatically flips everyone back to
// "pending" with no reset job.
router.post("/salaries/:id/pay", async (req, res) => {
  if (!isValidId(req.params.id)) return res.status(404).json({ error: "Not found" });
  const paid = req.body?.paid !== false; // default: mark paid
  const key = paid ? monthKey(new Date()) : null;
  const [row] = await getDb().update(employees)
    .set({ salaryPaidForMonth: key })
    .where(eq(employees._id, req.params.id))
    .returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  pushLive();
  res.json({ employee: row });
});

/* ---------------------------------------------------------- combined summary */
// GET /api/command-finance/summary — the live aggregate that feeds every
// Command Center financial card. Recomputed on each request so totals always
// reflect the latest rows and roll over automatically at month boundaries.
router.get("/summary", async (_req, res) => {
  const db = getDb();
  const now = new Date();
  const curKey = monthKey(now);

  const [investRows, revenueRows, recurringRows, empRows] = await Promise.all([
    db.select().from(commandInvestments),
    db.select().from(commandRevenues),
    db.select().from(recurringExpenses),
    db.select().from(employees),
  ]);

  const sum = <T,>(rows: T[], f: (r: T) => number) => round2(rows.reduce((s, r) => s + f(r), 0));

  // ---- Investments ----
  const investMonthRows = investRows.filter((r) => isThisMonth(r.date, now));
  const investments = {
    total: sum(investRows, (r) => r.amount),
    thisMonth: sum(investMonthRows, (r) => r.amount),
    count: investRows.length,
    monthCount: investMonthRows.length,
  };

  // ---- Revenue ----
  const revenueMonthRows = revenueRows.filter((r) => isThisMonth(r.date, now));
  const revenue = {
    total: sum(revenueRows, (r) => r.amount),
    thisMonth: sum(revenueMonthRows, (r) => r.amount),
    count: revenueRows.length,
    monthCount: revenueMonthRows.length,
  };

  // ---- Monthly recurring payments ----
  const activeRecurring = recurringRows.filter((r) => r.active);
  const byCategory = Object.entries(
    activeRecurring.reduce<Record<string, number>>((acc, r) => ((acc[r.category] = (acc[r.category] || 0) + r.amount), acc), {})
  ).map(([category, amount]) => ({ category, amount: round2(amount) }));
  const monthlyPayments = {
    total: sum(activeRecurring, (r) => r.amount),
    activeCount: activeRecurring.length,
    totalCount: recurringRows.length,
    byCategory,
  };

  // ---- Employee salaries ----
  const activeEmps = empRows.filter((e) => e.status !== "INACTIVE");
  const payable = sum(activeEmps, (e) => e.monthlyCtc);
  const paidEmps = activeEmps.filter((e) => e.salaryPaidForMonth === curKey);
  const paid = sum(paidEmps, (e) => e.monthlyCtc);
  const pendingEmps = activeEmps.filter((e) => e.salaryPaidForMonth !== curKey);
  const upcoming = pendingEmps
    .map((e) => {
      const day = Math.min(Math.max(e.salaryDueDay || 1, 1), 28);
      return { id: String(e._id), name: e.name, amount: round2(e.monthlyCtc), dueDate: new Date(now.getFullYear(), now.getMonth(), day) };
    })
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())
    .slice(0, 12);
  const salaries = {
    payable,
    paid,
    pending: round2(payable - paid),
    employeeCount: activeEmps.length,
    paidCount: paidEmps.length,
    pendingCount: pendingEmps.length,
    upcoming,
  };

  res.json({
    monthKey: curKey,
    monthLabel: now.toLocaleString("en-IN", { month: "long", year: "numeric" }),
    investments,
    revenue,
    monthlyPayments,
    salaries,
  });
});

export default router;
