import { Router } from "express";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../config/db";
import { employees, employeePayments, IEmployee, IEmployeePayment } from "../db/schema";
import { authenticate, requireRole, AuthedRequest } from "../middleware/auth";
import { isValidId } from "../lib/ids";
import { emitToRole } from "../sockets";

/**
 * Employer Management — the founder-facing "Total Employer" module. Employers
 * (team members) are stored in the shared `employees` table; this route adds
 * salary-payment tracking on top, supporting full and partial payments with a
 * per-month history. The founder is an ADMIN, so every route is ADMIN-gated.
 * Amounts are whole rupees. Every write emits command-finance:update so the
 * dashboard cards refresh live.
 */
const router = Router();
router.use(authenticate, requireRole("ADMIN"));

const pushLive = () => emitToRole("ADMIN", "command-finance:update", { at: new Date().toISOString() });
const round2 = (n: number) => Math.round(n * 100) / 100;
const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const clampDay = (day: number) => Math.min(Math.max(Math.round(day) || 1, 1), 28);

type PayStatus = "PAID" | "PARTIAL" | "PENDING";
function payStatus(salary: number, paid: number): PayStatus {
  if (paid <= 0) return "PENDING";
  if (paid >= salary) return "PAID";
  return "PARTIAL";
}

const parseDate = (raw?: string | null): Date | null => {
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
};

/** Shape one employer row with its current-month salary status. */
function shapeEmployer(e: IEmployee, payments: IEmployeePayment[], curKey: string, now: Date) {
  const paidThisMonth = round2(payments.filter((p) => p.monthKey === curKey).reduce((s, p) => s + p.amount, 0));
  const salary = round2(e.monthlyCtc);
  const remaining = round2(Math.max(0, salary - paidThisMonth));
  const dueDay = clampDay(e.salaryDueDay || 1);
  return {
    id: String(e._id),
    name: e.name,
    designation: e.title,
    department: e.department,
    status: e.status,
    monthlySalary: salary,
    salaryStartDate: e.salaryStartDate,
    salaryDueDay: dueDay,
    dueDate: new Date(now.getFullYear(), now.getMonth(), dueDay),
    notes: e.notes,
    paidThisMonth,
    remaining,
    paymentStatus: payStatus(salary, paidThisMonth),
  };
}

/* --------------------------------------------------------------- schemas */
const employerSchema = z.object({
  name: z.string().min(1).max(160),
  designation: z.string().max(160).optional().nullable(),
  monthlySalary: z.coerce.number().min(0),
  salaryStartDate: z.string().optional().nullable(),
  salaryDueDay: z.coerce.number().int().min(1).max(28).default(1),
  status: z.enum(["ACTIVE", "ON_LEAVE", "INACTIVE"]).optional(),
  notes: z.string().max(1000).optional().nullable(),
});

const paymentSchema = z.object({
  amount: z.coerce.number().positive(),
  note: z.string().max(500).optional().nullable(),
  monthKey: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  paidAt: z.string().optional().nullable(),
});

/* ------------------------------------------------------------ list + summary */
router.get("/", async (_req, res) => {
  const db = getDb();
  const now = new Date();
  const curKey = monthKey(now);
  const [emps, pays] = await Promise.all([
    db.select().from(employees).orderBy(desc(employees.createdAt)),
    db.select().from(employeePayments),
  ]);
  const byEmp = new Map<string, IEmployeePayment[]>();
  for (const p of pays) {
    const k = String(p.employeeId);
    (byEmp.get(k) || byEmp.set(k, []).get(k)!).push(p);
  }
  res.json({ monthKey: curKey, employers: emps.map((e) => shapeEmployer(e, byEmp.get(String(e._id)) || [], curKey, now)) });
});

router.get("/summary", async (_req, res) => {
  const db = getDb();
  const now = new Date();
  const curKey = monthKey(now);
  const [emps, pays] = await Promise.all([
    db.select().from(employees),
    db.select().from(employeePayments).where(eq(employeePayments.monthKey, curKey)),
  ]);
  const active = emps.filter((e) => e.status !== "INACTIVE");
  const paidByEmp = new Map<string, number>();
  for (const p of pays) paidByEmp.set(String(p.employeeId), (paidByEmp.get(String(p.employeeId)) || 0) + p.amount);

  let totalMonthlySalary = 0, totalPaid = 0;
  const upcoming: { id: string; name: string; amount: number; remaining: number; dueDate: Date; status: PayStatus }[] = [];
  for (const e of active) {
    const salary = e.monthlyCtc;
    const paid = Math.min(paidByEmp.get(String(e._id)) || 0, salary);
    totalMonthlySalary += salary;
    totalPaid += paid;
    const remaining = Math.max(0, salary - paid);
    const status = payStatus(salary, paidByEmp.get(String(e._id)) || 0);
    if (remaining > 0) {
      const dueDay = clampDay(e.salaryDueDay || 1);
      upcoming.push({ id: String(e._id), name: e.name, amount: round2(salary), remaining: round2(remaining), dueDate: new Date(now.getFullYear(), now.getMonth(), dueDay), status });
    }
  }
  upcoming.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());

  res.json({
    monthKey: curKey,
    monthLabel: now.toLocaleString("en-IN", { month: "long", year: "numeric" }),
    totalEmployers: active.length,
    totalMonthlySalary: round2(totalMonthlySalary),
    totalPaid: round2(totalPaid),
    totalPending: round2(Math.max(0, totalMonthlySalary - totalPaid)),
    upcomingCount: upcoming.length,
    upcoming: upcoming.slice(0, 12),
  });
});

/* --------------------------------------------------------- single + history */
router.get("/:id", async (req, res) => {
  if (!isValidId(req.params.id)) return res.status(404).json({ error: "Not found" });
  const db = getDb();
  const now = new Date();
  const curKey = monthKey(now);
  const [emp] = await db.select().from(employees).where(eq(employees._id, req.params.id));
  if (!emp) return res.status(404).json({ error: "Not found" });
  const pays = await db.select().from(employeePayments).where(eq(employeePayments.employeeId, req.params.id)).orderBy(desc(employeePayments.paidAt));
  res.json({
    employer: shapeEmployer(emp, pays, curKey, now),
    payments: pays.map((p) => ({ id: String(p._id), monthKey: p.monthKey, amount: round2(p.amount), note: p.note, paidAt: p.paidAt })),
  });
});

/* ------------------------------------------------------------------- CRUD */
router.post("/", async (req: AuthedRequest, res) => {
  const p = employerSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Validation failed", issues: p.error.flatten() });
  const [row] = await getDb().insert(employees).values({
    name: p.data.name,
    title: p.data.designation ?? null,
    monthlyCtc: p.data.monthlySalary,
    salaryDueDay: p.data.salaryDueDay,
    salaryStartDate: parseDate(p.data.salaryStartDate),
    status: p.data.status ?? "ACTIVE",
    notes: p.data.notes ?? null,
  }).returning();
  pushLive();
  res.status(201).json({ employer: row });
});

router.patch("/:id", async (req, res) => {
  if (!isValidId(req.params.id)) return res.status(404).json({ error: "Not found" });
  const p = employerSchema.partial().safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Validation failed", issues: p.error.flatten() });
  const d = p.data;
  const patch: Record<string, unknown> = {};
  if (d.name !== undefined) patch.name = d.name;
  if (d.designation !== undefined) patch.title = d.designation;
  if (d.monthlySalary !== undefined) patch.monthlyCtc = d.monthlySalary;
  if (d.salaryDueDay !== undefined) patch.salaryDueDay = d.salaryDueDay;
  if (d.salaryStartDate !== undefined) patch.salaryStartDate = parseDate(d.salaryStartDate);
  if (d.status !== undefined) patch.status = d.status;
  if (d.notes !== undefined) patch.notes = d.notes;
  if (Object.keys(patch).length === 0) return res.status(400).json({ error: "Nothing to update" });
  const [row] = await getDb().update(employees).set(patch).where(eq(employees._id, req.params.id)).returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  pushLive();
  res.json({ employer: row });
});

router.delete("/:id", async (req, res) => {
  if (!isValidId(req.params.id)) return res.status(404).json({ error: "Not found" });
  const db = getDb();
  await db.delete(employeePayments).where(eq(employeePayments.employeeId, req.params.id));
  const [row] = await db.delete(employees).where(eq(employees._id, req.params.id)).returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  pushLive();
  res.json({ ok: true });
});

/* ---------------------------------------------------------------- payments */
router.post("/:id/payments", async (req: AuthedRequest, res) => {
  if (!isValidId(req.params.id)) return res.status(404).json({ error: "Not found" });
  const p = paymentSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Validation failed", issues: p.error.flatten() });
  const db = getDb();
  const [emp] = await db.select().from(employees).where(eq(employees._id, req.params.id));
  if (!emp) return res.status(404).json({ error: "Not found" });
  const paidAt = parseDate(p.data.paidAt) ?? new Date();
  const [row] = await db.insert(employeePayments).values({
    employeeId: req.params.id,
    monthKey: p.data.monthKey ?? monthKey(paidAt),
    amount: p.data.amount,
    note: p.data.note ?? null,
    paidAt,
    createdById: req.user!.userId,
  }).returning();
  pushLive();
  res.status(201).json({ payment: row });
});

router.delete("/:id/payments/:pid", async (req, res) => {
  if (!isValidId(req.params.id) || !isValidId(req.params.pid)) return res.status(404).json({ error: "Not found" });
  const [row] = await getDb().delete(employeePayments)
    .where(and(eq(employeePayments._id, req.params.pid), eq(employeePayments.employeeId, req.params.id)))
    .returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  pushLive();
  res.json({ ok: true });
});

export default router;
