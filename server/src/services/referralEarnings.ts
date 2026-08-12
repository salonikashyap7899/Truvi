import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "../config/db";
import { users, projects, leads, commissions, cpManualCommissions } from "../db/schema";

type Db = ReturnType<typeof getDb>;

/** The referral incentive a CP/Ambassador/Developer earns on a referred
 *  developer's sales — 2% for lifetime on every transaction. */
export const REFERRAL_INCENTIVE_PERCENT = 2;

/** One-time first-transaction bonus, by the TYPE of person onboarded:
 *  onboarding a Developer pays ₹100, onboarding a Channel Partner pays ₹75.
 *  (The amount is fixed per referral type — it does not depend on who refers.) */
export const DEVELOPER_REFERRAL_BONUS = 100;
export const CP_REFERRAL_BONUS = 75;

export interface DeveloperReferralRow {
  _id: string;
  name: string;
  email: string | null;
  createdAt: Date;
  status: "ACTIVE" | "PENDING";
  propertiesListed: number;
  totalTransactions: number;
  totalSalesValue: number;
  percentEarned: number;
  firstTxnBonus: number;
  incentiveEarned: number;
  lastTransactionAt: string | null;
}

/**
 * The referral earnings a CP/Ambassador/Developer has made from the developers
 * they referred: 2% lifetime on each referred developer's booking transactions
 * plus a one-time bonus on the developer's first transaction.
 *
 * This is the single source of truth used by BOTH the referral panels
 * (routes/onboarding.ts) and the payable commission wallet
 * (services/commissionLedger.ts), so the numbers always match across the
 * Ambassador, Admin and Founder dashboards.
 */
export async function computeDeveloperReferralEarnings(db: Db, referrerId: string) {
  const referred = await db
    .select({ _id: users._id, name: users.name, email: users.email, createdAt: users.createdAt })
    .from(users)
    .where(and(eq(users.referredBy, referrerId), eq(users.role, "DEVELOPER")))
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
  const bonusAmount = DEVELOPER_REFERRAL_BONUS;
  const referredDevelopers: DeveloperReferralRow[] = referred.map((r) => {
    const s = stats.get(String(r._id));
    const txns = s?.count ?? 0;
    const percentEarned = Math.round((s?.sales ?? 0) * rate);
    const firstTxnBonus = txns >= 1 ? bonusAmount : 0;
    return {
      _id: String(r._id),
      name: r.name,
      email: r.email,
      createdAt: r.createdAt,
      status: "ACTIVE" as const,
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

export interface CpReferralRow {
  _id: string;
  name: string;
  email: string | null;
  createdAt: Date;
  status: "ACTIVE";
  totalTransactions: number;
  cpCommission: number;
  percentEarned: number;
  firstTxnBonus: number;
  incentiveEarned: number;
  lastTransactionAt: string | null;
}

/**
 * The referral earnings from Channel Partners a referrer onboarded: a one-time
 * first-transaction bonus (₹75 for a partner referrer) + 2% lifetime on each
 * referred CP's own commission earnings.
 */
export async function computeCpReferralEarnings(db: Db, referrerId: string) {
  const referredCps = await db
    .select({ _id: users._id, name: users.name, email: users.email, createdAt: users.createdAt })
    .from(users)
    .where(and(eq(users.referredBy, referrerId), eq(users.role, "CP")))
    .orderBy(desc(users.createdAt));

  const cpIds = referredCps.map((c) => String(c._id));
  const stats = new Map<string, { amount: number; count: number; last: Date | null }>();
  const bump = (id: string, amount: number, at: Date) => {
    const c = stats.get(id) ?? { amount: 0, count: 0, last: null };
    c.amount += Number(amount || 0);
    c.count += 1;
    if (!c.last || at > c.last) c.last = at;
    stats.set(id, c);
  };

  if (cpIds.length) {
    const manual = await db
      .select({ cpId: cpManualCommissions.cpId, amount: cpManualCommissions.amount, createdAt: cpManualCommissions.createdAt })
      .from(cpManualCommissions)
      .where(inArray(cpManualCommissions.cpId, cpIds));
    for (const m of manual) bump(String(m.cpId), Number(m.amount || 0), new Date(m.createdAt));

    const auto = await db
      .select({ cpId: commissions.cpId, amount: commissions.cpCommissionAmount, createdAt: commissions.createdAt })
      .from(commissions)
      .where(inArray(commissions.cpId, cpIds));
    for (const a of auto) bump(String(a.cpId), Number(a.amount || 0), new Date(a.createdAt));
  }

  const rate = REFERRAL_INCENTIVE_PERCENT / 100;
  const bonusAmount = CP_REFERRAL_BONUS;
  const referredPartners: CpReferralRow[] = referredCps.map((c) => {
    const s = stats.get(String(c._id));
    const cpCommission = Math.round(s?.amount ?? 0);
    const txns = s?.count ?? 0;
    const percentEarned = Math.round(cpCommission * rate);
    const firstTxnBonus = txns >= 1 ? bonusAmount : 0;
    return {
      _id: String(c._id),
      name: c.name,
      email: c.email,
      createdAt: c.createdAt,
      status: "ACTIVE" as const,
      totalTransactions: txns,
      cpCommission,
      percentEarned,
      firstTxnBonus,
      incentiveEarned: percentEarned + firstTxnBonus,
      lastTransactionAt: s?.last ? s.last.toISOString() : null,
    };
  });

  const summary = {
    referredCount: referredPartners.length,
    active: referredPartners.length,
    totalTransactions: referredPartners.reduce((a, r) => a + r.totalTransactions, 0),
    totalBonus: referredPartners.reduce((a, r) => a + r.firstTxnBonus, 0),
    totalEarnings: referredPartners.reduce((a, r) => a + r.incentiveEarned, 0),
  };
  return { referredPartners, summary, bonusAmount };
}

export interface ReferralBreakdown {
  counts: { developers: number; channelPartners: number; others: number; total: number };
  developerReferral: number;
  cpReferral: number;
  totalReferralEarnings: number;
  developers: DeveloperReferralRow[];
  channelPartners: CpReferralRow[];
}

/**
 * A full referral breakdown for one referrer — who they brought in (by type),
 * and the payable 2%+bonus each stream has generated. Used by the Ambassador,
 * Admin and Founder dashboards so all three see identical figures.
 */
export async function getReferralBreakdown(db: Db, referrerId: string): Promise<ReferralBreakdown> {
  const [referred, dev, cp] = await Promise.all([
    db.select({ role: users.role }).from(users).where(eq(users.referredBy, referrerId)),
    computeDeveloperReferralEarnings(db, referrerId),
    computeCpReferralEarnings(db, referrerId),
  ]);

  let developers = 0;
  let channelPartners = 0;
  let others = 0;
  for (const r of referred) {
    if (r.role === "DEVELOPER") developers += 1;
    else if (r.role === "CP") channelPartners += 1;
    else others += 1;
  }

  const developerReferral = dev.summary.totalEarnings;
  const cpReferral = cp.summary.totalEarnings;

  return {
    counts: { developers, channelPartners, others, total: referred.length },
    developerReferral,
    cpReferral,
    totalReferralEarnings: developerReferral + cpReferral,
    developers: dev.referredDevelopers,
    channelPartners: cp.referredPartners,
  };
}
