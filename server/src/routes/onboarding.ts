import { Router } from "express";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../config/db";
import { developerReferrals, users, notifications } from "../db/schema";
import { isValidId } from "../lib/ids";
import { authenticate, requireRole, AuthedRequest } from "../middleware/auth";
import { emitNotification } from "../sockets";

/**
 * Developer onboarding referrals. A Channel Partner refers a developer /
 * landowner to list their inventory on Truvi; the referring CP earns a +10%
 * commission incentive on sales from that developer's inventory — whether the
 * CP sells it themselves or anyone else does.
 */
const router = Router();
router.use(authenticate);

const referralSchema = z.object({
  developerName: z.string().min(2, "Developer / landowner name is required"),
  companyName: z.string().optional(),
  phone: z.string().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit Indian mobile number"),
  email: z.string().email().or(z.literal("")).optional(),
  city: z.string().optional(),
  landDetails: z.string().optional(),
  notes: z.string().optional(),
});

// POST /api/onboarding/developers — a CP or developer submits a developer to onboard.
router.post("/developers", requireRole("CP", "DEVELOPER"), async (req: AuthedRequest, res) => {
  const parsed = referralSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });
  const d = parsed.data;

  const db = getDb();
  const [referral] = await db
    .insert(developerReferrals)
    .values({
      cpId: req.user!.userId,
      developerName: d.developerName,
      companyName: d.companyName || null,
      phone: d.phone,
      email: d.email || null,
      city: d.city || null,
      landDetails: d.landDetails || null,
      notes: d.notes || null,
    })
    .returning();

  // Alert admins there's a new developer to onboard (real-time bell).
  try {
    const [cp] = await db.select({ name: users.name }).from(users).where(eq(users._id, req.user!.userId));
    const admins = await db.select({ _id: users._id }).from(users).where(eq(users.role, "ADMIN"));
    if (admins.length) {
      const message = `New developer onboarding: ${cp?.name ?? "A CP"} referred ${d.developerName}${d.companyName ? ` (${d.companyName})` : ""}.`;
      const rows = await db.insert(notifications).values(admins.map((a) => ({ userId: a._id, message }))).returning();
      rows.forEach((n) => emitNotification(String(n.userId), n));
    }
  } catch {
    /* non-fatal */
  }

  res.status(201).json({ referral });
});

/** Short, human-friendly, unique referral code (e.g. RAK4X9Q2). */
function genReferralCode(name: string): string {
  const prefix = (name.replace(/[^a-zA-Z]/g, "").slice(0, 3) || "TRV").toUpperCase();
  return `${prefix}${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

// GET /api/onboarding/referral — a CP/Ambassador's referral code + referred
// developers + earnings summary (get-or-create the code on first view).
router.get("/referral", requireRole("CP", "AMBASSADOR"), async (req: AuthedRequest, res) => {
  const db = getDb();
  const [me] = await db.select().from(users).where(eq(users._id, req.user!.userId));
  let code = me?.referralCode ?? null;
  if (!code) {
    for (let i = 0; i < 6; i++) {
      const candidate = genReferralCode(me?.name ?? "TRV");
      const [clash] = await db.select({ _id: users._id }).from(users).where(eq(users.referralCode, candidate));
      if (!clash) { code = candidate; break; }
    }
    if (code) await db.update(users).set({ referralCode: code }).where(eq(users._id, req.user!.userId));
  }

  const referred = await db
    .select({ _id: users._id, name: users.name, email: users.email, createdAt: users.createdAt })
    .from(users)
    .where(eq(users.referredBy, req.user!.userId))
    .orderBy(desc(users.createdAt));

  res.json({
    referralCode: code,
    // Transactions/earnings are 0 until a sale is attributed (payout wiring).
    referredDevelopers: referred.map((r) => ({
      ...r,
      status: "ACTIVE" as const,
      totalTransactions: 0,
      totalSalesValue: 0,
      incentiveEarned: 0,
      lastTransactionAt: null,
    })),
    summary: { referredCount: referred.length, active: referred.length, totalTransactions: 0, totalEarnings: 0 },
  });
});

// GET /api/onboarding/developers — the CP's own referrals (admins see all).
router.get("/developers", async (req: AuthedRequest, res) => {
  const db = getDb();
  const rows = await db
    .select()
    .from(developerReferrals)
    .where(req.user!.role === "ADMIN" ? undefined : eq(developerReferrals.cpId, req.user!.userId))
    .orderBy(desc(developerReferrals.createdAt));
  res.json({ referrals: rows });
});

// PATCH /api/onboarding/developers/:id — admin updates a referral's status.
const statusSchema = z.object({ status: z.enum(["PENDING", "VERIFIED", "ACTIVE", "REJECTED"]) });
router.patch("/developers/:id", requireRole("ADMIN"), async (req: AuthedRequest, res) => {
  if (!isValidId(req.params.id)) return res.status(404).json({ error: "Referral not found" });
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });

  const db = getDb();
  const [updated] = await db
    .update(developerReferrals)
    .set({ status: parsed.data.status, updatedAt: new Date() })
    .where(and(eq(developerReferrals._id, req.params.id)))
    .returning();
  if (!updated) return res.status(404).json({ error: "Referral not found" });
  res.json({ referral: updated });
});

export default router;
