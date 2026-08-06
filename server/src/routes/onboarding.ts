import { Router } from "express";
import { z } from "zod";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "../config/db";
import { developerReferrals, users, notifications, projects, leads, commissions } from "../db/schema";
import { isValidId } from "../lib/ids";
import { authenticate, requireRole, AuthedRequest } from "../middleware/auth";
import { emitNotification } from "../sockets";

/** The referral incentive a CP/Ambassador/Developer earns on a referred
 *  developer's sales — 2% for lifetime on every transaction. */
const REFERRAL_INCENTIVE_PERCENT = 2;

/** One-time bonus paid on the referred developer's FIRST transaction. It's
 *  larger when a Developer refers another Developer, smaller for a Channel
 *  Partner / Ambassador. */
const FIRST_TXN_BONUS_DEVELOPER = 100;
const FIRST_TXN_BONUS_PARTNER = 75;
const firstTxnBonusFor = (role?: string) => (role === "DEVELOPER" ? FIRST_TXN_BONUS_DEVELOPER : FIRST_TXN_BONUS_PARTNER);

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

/**
 * The referral earnings a CP/Ambassador/Developer has made from the developers
 * they referred: 2% lifetime on each referred developer's booking transactions
 * plus the one-time first-transaction bonus (₹100 dev-referrer / ₹75 partner).
 */
async function computeReferralEarnings(db: Db, referrerId: string, referrerRole: string) {
  const referred = await db
    .select({ _id: users._id, name: users.name, email: users.email, createdAt: users.createdAt })
    .from(users)
    .where(eq(users.referredBy, referrerId))
    .orderBy(desc(users.createdAt));

  const devIds = referred.map((r) => String(r._id));
  const stats = new Map<string, { count: number; sales: number; last: Date | null; properties: number }>();

  if (devIds.length) {
    const devProjects = await db
      .select({ _id: projects._id, developerId: projects.developerId })
      .from(projects)
      .where(inArray(projects.developerId, devIds));
    const projectToDev = new Map(devProjects.map((p) => [String(p._id), String(p.developerId)]));
    for (const p of devProjects) {
      const cur = stats.get(String(p.developerId)) ?? { count: 0, sales: 0, last: null, properties: 0 };
      cur.properties += 1;
      stats.set(String(p.developerId), cur);
    }

    const projectIds = devProjects.map((p) => String(p._id));
    if (projectIds.length) {
      const projLeads = await db
        .select({ _id: leads._id, projectId: leads.projectId })
        .from(leads)
        .where(inArray(leads.projectId, projectIds));
      const leadToProject = new Map(projLeads.map((l) => [String(l._id), String(l.projectId)]));
      const leadIds = projLeads.map((l) => String(l._id));

      if (leadIds.length) {
        const txns = await db
          .select({ leadId: commissions.leadId, bookingValue: commissions.bookingValue, createdAt: commissions.createdAt })
          .from(commissions)
          .where(inArray(commissions.leadId, leadIds));
        for (const t of txns) {
          const devId = projectToDev.get(leadToProject.get(String(t.leadId)) ?? "");
          if (!devId) continue;
          const cur = stats.get(devId) ?? { count: 0, sales: 0, last: null, properties: 0 };
          cur.count += 1;
          cur.sales += Number(t.bookingValue || 0);
          const at = new Date(t.createdAt);
          if (!cur.last || at > cur.last) cur.last = at;
          stats.set(devId, cur);
        }
      }
    }
  }

  const rate = REFERRAL_INCENTIVE_PERCENT / 100;
  const bonusAmount = firstTxnBonusFor(referrerRole);
  const referredDevelopers = referred.map((r) => {
    const s = stats.get(String(r._id));
    const txns = s?.count ?? 0;
    const percentEarned = Math.round((s?.sales ?? 0) * rate);
    const firstTxnBonus = txns >= 1 ? bonusAmount : 0;
    return {
      ...r,
      status: "ACTIVE" as "ACTIVE" | "PENDING",
      propertiesListed: s?.properties ?? 0,
      totalTransactions: txns,
      totalSalesValue: Math.round(s?.sales ?? 0),
      percentEarned,
      firstTxnBonus,
      incentiveEarned: percentEarned + firstTxnBonus,
      lastTransactionAt: s?.last ? s.last.toISOString() : null,
    };
  });

  const summary = {
    referredCount: referredDevelopers.length,
    active: referredDevelopers.filter((r) => r.status === "ACTIVE").length,
    totalTransactions: referredDevelopers.reduce((a, r) => a + r.totalTransactions, 0),
    totalBonus: referredDevelopers.reduce((a, r) => a + r.firstTxnBonus, 0),
    totalEarnings: referredDevelopers.reduce((a, r) => a + r.incentiveEarned, 0),
  };
  return { referredDevelopers, summary, bonusAmount };
}

// GET /api/onboarding/referral — a CP/Ambassador/Developer's referral code +
// referred developers + earnings summary (get-or-create the code on first view).
router.get("/referral", requireRole("CP", "AMBASSADOR", "DEVELOPER"), async (req: AuthedRequest, res) => {
  const db = getDb();
  const [me] = await db.select().from(users).where(eq(users._id, req.user!.userId));
  const code = await getOrCreateReferralCode(db, req.user!.userId, me?.name ?? "TRV", me?.referralCode ?? null);
  const { referredDevelopers, summary, bonusAmount } = await computeReferralEarnings(db, req.user!.userId, me?.role ?? "");
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
    const { summary } = await computeReferralEarnings(db, String(b._id), "AMBASSADOR");
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
