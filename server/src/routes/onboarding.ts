import { Router } from "express";
import { z } from "zod";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "../config/db";
import { developerReferrals, users, notifications, projects, leads, commissions, cpManualCommissions } from "../db/schema";
import { isValidId } from "../lib/ids";
import { authenticate, requireRole, AuthedRequest } from "../middleware/auth";
import { emitNotification } from "../sockets";
import {
  REFERRAL_INCENTIVE_PERCENT,
  computeDeveloperReferralEarnings,
  computeCpReferralEarnings,
  computeBuyerReferralEarnings,
  buyerReferralRateForRole,
  rangeForPeriod,
} from "../services/referralEarnings";

/**
 * Developer onboarding referrals. A Channel Partner, Ambassador OR an existing
 * Developer refers a developer / landowner to list their inventory on Truvi;
 * the referrer earns a 2% incentive on sales from that developer's inventory —
 * whether the referrer sells it themselves or anyone else does. The referral
 * system is identical across all referrer roles.
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

type Db = ReturnType<typeof getDb>;

/** Get the user's referral code, creating a unique one on first use. */
async function getOrCreateReferralCode(db: Db, userId: string, name: string, current: string | null): Promise<string | null> {
  if (current) return current;
  let code: string | null = null;
  for (let i = 0; i < 6; i++) {
    const candidate = genReferralCode(name || "TRV");
    const [clash] = await db.select({ _id: users._id }).from(users).where(eq(users.referralCode, candidate));
    if (!clash) { code = candidate; break; }
  }
  if (code) await db.update(users).set({ referralCode: code }).where(eq(users._id, userId));
  return code;
}

// GET /api/onboarding/referral — a CP/Ambassador/Developer's referral code +
// referred developers + earnings summary (get-or-create the code on first view).
router.get("/referral", requireRole("CP", "AMBASSADOR", "DEVELOPER"), async (req: AuthedRequest, res) => {
  const db = getDb();
  const [me] = await db.select().from(users).where(eq(users._id, req.user!.userId));
  const code = await getOrCreateReferralCode(db, req.user!.userId, me?.name ?? "TRV", me?.referralCode ?? null);
  const range = rangeForPeriod(typeof req.query.period === "string" ? req.query.period : null);
  const { referredDevelopers, summary, bonusAmount } = await computeDeveloperReferralEarnings(db, req.user!.userId, range);
  res.json({ referralCode: code, incentivePercent: REFERRAL_INCENTIVE_PERCENT, firstTxnBonus: bonusAmount, referredDevelopers, summary });
});

/** Ambassador → Ambassador (Level 2): extra 0.5% on a directly-referred
 *  Ambassador's own referral earnings. */
const LEVEL2_PERCENT = 0.5;

// GET /api/onboarding/level2 — the Ambassador-to-Ambassador (Level 2) view:
// every Ambassador this Ambassador referred, what THEY have earned, and the
// referrer's 0.5% Level 2 cut on it.
router.get("/level2", requireRole("AMBASSADOR"), async (req: AuthedRequest, res) => {
  const db = getDb();
  const [me] = await db.select().from(users).where(eq(users._id, req.user!.userId));
  const code = await getOrCreateReferralCode(db, req.user!.userId, me?.name ?? "TRV", me?.referralCode ?? null);

  // Only Ambassadors that THIS ambassador referred count for Level 2.
  const referredAmbs = await db
    .select({ _id: users._id, name: users.name, email: users.email, createdAt: users.createdAt })
    .from(users)
    .where(and(eq(users.referredBy, req.user!.userId), eq(users.role, "AMBASSADOR")))
    .orderBy(desc(users.createdAt));

  const rate = LEVEL2_PERCENT / 100;
  const referredAmbassadors = [];
  for (const b of referredAmbs) {
    const { summary } = await computeDeveloperReferralEarnings(db, String(b._id));
    const earnedByThem = summary.totalEarnings;
    referredAmbassadors.push({
      _id: b._id,
      name: b.name,
      email: b.email,
      createdAt: b.createdAt,
      theirReferrals: summary.referredCount,
      theirTransactions: summary.totalTransactions,
      earnedByThem,
      level2Commission: Math.round(earnedByThem * rate),
    });
  }

  const summary = {
    referredAmbassadors: referredAmbassadors.length,
    totalDownlineEarnings: referredAmbassadors.reduce((a, r) => a + r.earnedByThem, 0),
    totalLevel2Commission: referredAmbassadors.reduce((a, r) => a + r.level2Commission, 0),
  };

  res.json({ level2Percent: LEVEL2_PERCENT, referralCode: code, referredAmbassadors, summary });
});

// GET /api/onboarding/cp-referrals — Channel Partners this Ambassador referred,
// each CP's own commission, and the ambassador's ₹75 + 2% lifetime on it.
router.get("/cp-referrals", requireRole("AMBASSADOR"), async (req: AuthedRequest, res) => {
  const db = getDb();
  const [me] = await db.select().from(users).where(eq(users._id, req.user!.userId));
  const code = await getOrCreateReferralCode(db, req.user!.userId, me?.name ?? "TRV", me?.referralCode ?? null);
  const range = rangeForPeriod(typeof req.query.period === "string" ? req.query.period : null);
  const { referredPartners, summary, bonusAmount } = await computeCpReferralEarnings(db, req.user!.userId, range);
  res.json({ referralCode: code, incentivePercent: REFERRAL_INCENTIVE_PERCENT, firstTxnBonus: bonusAmount, referredPartners, summary });
});

// GET /api/onboarding/buyer-referrals — buyers this CP/Ambassador referred and
// their revenue share (35% Ambassador / 45% CP) of Truvi's sale commission.
router.get("/buyer-referrals", requireRole("CP", "AMBASSADOR"), async (req: AuthedRequest, res) => {
  const db = getDb();
  const [me] = await db.select().from(users).where(eq(users._id, req.user!.userId));
  const code = await getOrCreateReferralCode(db, req.user!.userId, me?.name ?? "TRV", me?.referralCode ?? null);
  const range = rangeForPeriod(typeof req.query.period === "string" ? req.query.period : null);
  const rate = buyerReferralRateForRole(req.user!.role);
  const { referredBuyers, summary } = await computeBuyerReferralEarnings(db, req.user!.userId, rate, range);
  res.json({ referralCode: code, ratePercent: Math.round(rate * 100), referredBuyers, summary });
});

// GET /api/onboarding/developers — the CP's own referrals (admins see all,
// with the referring CP's name so the admin panel shows who referred whom).
router.get("/developers", async (req: AuthedRequest, res) => {
  const db = getDb();
  const rows = await db
    .select({
      _id: developerReferrals._id,
      cpId: developerReferrals.cpId,
      cpName: users.name,
      developerName: developerReferrals.developerName,
      companyName: developerReferrals.companyName,
      phone: developerReferrals.phone,
      email: developerReferrals.email,
      city: developerReferrals.city,
      landDetails: developerReferrals.landDetails,
      notes: developerReferrals.notes,
      status: developerReferrals.status,
      incentivePercent: developerReferrals.incentivePercent,
      createdAt: developerReferrals.createdAt,
      updatedAt: developerReferrals.updatedAt,
    })
    .from(developerReferrals)
    .leftJoin(users, eq(developerReferrals.cpId, users._id))
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
