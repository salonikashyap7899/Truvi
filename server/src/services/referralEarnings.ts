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

/** Buyer-referral revenue share: the referrer earns this % of Truvi's sale
 *  commission on bookings made by a buyer they referred. Ambassadors earn 35%,
 *  Channel Partners 45%. */
export const BUYER_REFERRAL_RATE_AMBASSADOR = 0.35;
export const BUYER_REFERRAL_RATE_CP = 0.45;
export function buyerReferralRateForRole(role?: string | null): number {
  return role === "CP" ? BUYER_REFERRAL_RATE_CP : BUYER_REFERRAL_RATE_AMBASSADOR;
}

/** A half-open date window [from, to) used to scope referral earnings to a
 *  period (e.g. This Month / Last Month). Omit for lifetime totals. */
export interface DateRange { from: Date; to: Date }
const inRange = (d: Date, range?: DateRange) => !range || (d >= range.from && d < range.to);

/** Resolve a period keyword to a concrete [from, to) window. */
export function rangeForPeriod(period?: string | null): DateRange | undefined {
  const now = new Date();
  if (period === "this_month") {
    return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: new Date(now.getFullYear(), now.getMonth() + 1, 1) };
  }
  if (period === "last_month") {
    return { from: new Date(now.getFullYear(), now.getMonth() - 1, 1), to: new Date(now.getFullYear(), now.getMonth(), 1) };
  }
  return undefined; // "all" or unknown → lifetime
}

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
export async function computeDeveloperReferralEarnings(db: Db, referrerId: string, range?: DateRange) {
  const referred = await db
    .select({ _id: users._id, name: users.name, email: users.email, createdAt: users.createdAt })
    .from(users)
    .where(and(eq(users.referredBy, referrerId), eq(users.role, "DEVELOPER")))
    .orderBy(desc(users.createdAt));

  const devIds = referred.map((r) => String(r._id));
  // `first` is the developer's FIRST-EVER transaction date (used to award the
  // one-time bonus in the period it happened); count/sales/last are scoped to
  // `range` when one is given, else lifetime.
  const stats = new Map<string, { count: number; sales: number; last: Date | null; first: Date | null; properties: number }>();
  const blank = () => ({ count: 0, sales: 0, last: null as Date | null, first: null as Date | null, properties: 0 });

  if (devIds.length) {
    const devProjects = await db
      .select({ _id: projects._id, developerId: projects.developerId })
      .from(projects)
      .where(inArray(projects.developerId, devIds));
    const projectToDev = new Map(devProjects.map((p) => [String(p._id), String(p.developerId)]));
    for (const p of devProjects) {
      const cur = stats.get(String(p.developerId)) ?? blank();
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
          const cur = stats.get(devId) ?? blank();
          const at = new Date(t.createdAt);
          if (!cur.first || at < cur.first) cur.first = at; // first-ever, ignores range
          if (inRange(at, range)) {
            cur.count += 1;
            cur.sales += Number(t.bookingValue || 0);
            if (!cur.last || at > cur.last) cur.last = at;
          }
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
    // One-time bonus counts in the period that contains the first-ever txn.
    const firstTxnBonus = s?.first && inRange(s.first, range) ? bonusAmount : 0;
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
export async function computeCpReferralEarnings(db: Db, referrerId: string, range?: DateRange) {
  const referredCps = await db
    .select({ _id: users._id, name: users.name, email: users.email, createdAt: users.createdAt })
    .from(users)
    .where(and(eq(users.referredBy, referrerId), eq(users.role, "CP")))
    .orderBy(desc(users.createdAt));

  const cpIds = referredCps.map((c) => String(c._id));
  const stats = new Map<string, { amount: number; count: number; last: Date | null; first: Date | null }>();
  const bump = (id: string, amount: number, at: Date) => {
    const c = stats.get(id) ?? { amount: 0, count: 0, last: null, first: null };
    if (!c.first || at < c.first) c.first = at; // first-ever, ignores range
    if (inRange(at, range)) {
      c.amount += Number(amount || 0);
      c.count += 1;
      if (!c.last || at > c.last) c.last = at;
    }
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
    const firstTxnBonus = s?.first && inRange(s.first, range) ? bonusAmount : 0;
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

export interface BuyerReferralRow {
  _id: string;
  name: string;
  email: string | null;
  createdAt: Date;
  status: "ACTIVE" | "PENDING";
  totalTransactions: number;
  totalSalesValue: number;
  /** Truvi's sale commission generated on this buyer's bookings. */
  saleCommission: number;
  /** The referrer's cut = rate × saleCommission. */
  percentEarned: number;
  incentiveEarned: number;
  lastTransactionAt: string | null;
}

const last10 = (p?: string | null) => (p || "").replace(/\D/g, "").slice(-10);

/**
 * Buyer-referral earnings: a referrer earns a % (35% Ambassador / 45% CP) of
 * Truvi's sale commission on bookings made by buyers they referred. A referred
 * buyer's bookings are matched to leads by phone (last 10 digits) or email, and
 * the sale commission is booking value × the project's commission %.
 */
export async function computeBuyerReferralEarnings(db: Db, referrerId: string, rate: number, range?: DateRange) {
  const buyers = await db
    .select({ _id: users._id, name: users.name, email: users.email, phone: users.phone, createdAt: users.createdAt })
    .from(users)
    .where(and(eq(users.referredBy, referrerId), eq(users.role, "BUYER")))
    .orderBy(desc(users.createdAt));

  const stats = new Map<string, { count: number; sales: number; commission: number; first: Date | null; last: Date | null }>();
  const blank = () => ({ count: 0, sales: 0, commission: 0, first: null as Date | null, last: null as Date | null });
  const bump = (buyerId: string, bookingValue: number, saleComm: number, at: Date) => {
    const s = stats.get(buyerId) ?? blank();
    if (!s.first || at < s.first) s.first = at; // first-ever, ignores range
    if (inRange(at, range)) {
      s.count += 1;
      s.sales += bookingValue;
      s.commission += saleComm;
      if (!s.last || at > s.last) s.last = at;
    }
    stats.set(buyerId, s);
  };

  if (buyers.length) {
    const phoneToBuyer = new Map<string, string>();
    const emailToBuyer = new Map<string, string>();
    for (const b of buyers) {
      const p = last10(b.phone);
      if (p.length === 10) phoneToBuyer.set(p, String(b._id));
      if (b.email) emailToBuyer.set(b.email.toLowerCase(), String(b._id));
    }

    // Match the buyer's own leads (bookings) by phone / email.
    const allLeads = await db.select({ _id: leads._id, projectId: leads.projectId, clientPhone: leads.clientPhone, clientEmail: leads.clientEmail }).from(leads);
    const leadToBuyer = new Map<string, string>();
    const leadToProject = new Map<string, string>();
    for (const l of allLeads) {
      const buyerId = phoneToBuyer.get(last10(l.clientPhone)) || (l.clientEmail ? emailToBuyer.get(l.clientEmail.toLowerCase()) : undefined);
      if (buyerId) {
        leadToBuyer.set(String(l._id), buyerId);
        leadToProject.set(String(l._id), String(l.projectId));
      }
    }
    const matchedLeadIds = [...leadToBuyer.keys()];

    if (matchedLeadIds.length) {
      const projIds = [...new Set(leadToProject.values())];
      const projs = projIds.length ? await db.select({ _id: projects._id, commissionPercent: projects.commissionPercent }).from(projects).where(inArray(projects._id, projIds)) : [];
      const projPct = new Map(projs.map((p) => [String(p._id), Number(p.commissionPercent || 0)]));

      const comms = await db.select({ leadId: commissions.leadId, bookingValue: commissions.bookingValue, commissionPercent: commissions.commissionPercent, createdAt: commissions.createdAt }).from(commissions).where(inArray(commissions.leadId, matchedLeadIds));
      for (const c of comms) {
        const buyerId = leadToBuyer.get(String(c.leadId));
        if (!buyerId) continue;
        const bv = Number(c.bookingValue || 0);
        const pct = Number(c.commissionPercent || projPct.get(leadToProject.get(String(c.leadId)) ?? "") || 0);
        bump(buyerId, bv, (bv * pct) / 100, new Date(c.createdAt));
      }

      const manual = await db.select({ leadId: cpManualCommissions.leadId, amount: cpManualCommissions.amount, bookingValue: cpManualCommissions.bookingValue, percent: cpManualCommissions.percent, createdAt: cpManualCommissions.createdAt }).from(cpManualCommissions).where(inArray(cpManualCommissions.leadId, matchedLeadIds));
      for (const m of manual) {
        const buyerId = m.leadId ? leadToBuyer.get(String(m.leadId)) : undefined;
        if (!buyerId) continue;
        const bv = Number(m.bookingValue || 0);
        const saleComm = m.percent && bv ? (bv * Number(m.percent)) / 100 : Number(m.amount || 0);
        bump(buyerId, bv, saleComm, new Date(m.createdAt));
      }
    }
  }

  const referredBuyers: BuyerReferralRow[] = buyers.map((b) => {
    const s = stats.get(String(b._id));
    const saleCommission = Math.round(s?.commission ?? 0);
    const percentEarned = Math.round((s?.commission ?? 0) * rate);
    return {
      _id: String(b._id),
      name: b.name,
      email: b.email,
      createdAt: b.createdAt,
      status: "ACTIVE" as const,
      totalTransactions: s?.count ?? 0,
      totalSalesValue: Math.round(s?.sales ?? 0),
      saleCommission,
      percentEarned,
      incentiveEarned: percentEarned,
      lastTransactionAt: s?.last ? s.last.toISOString() : null,
    };
  });

  const summary = {
    referredCount: referredBuyers.length,
    active: referredBuyers.length,
    totalTransactions: referredBuyers.reduce((a, r) => a + r.totalTransactions, 0),
    totalEarnings: referredBuyers.reduce((a, r) => a + r.incentiveEarned, 0),
  };
  return { referredBuyers, summary, rate };
}

export interface ReferralBreakdown {
  counts: { developers: number; channelPartners: number; buyers: number; others: number; total: number };
  developerReferral: number;
  cpReferral: number;
  buyerReferral: number;
  buyerRatePercent: number;
  totalReferralEarnings: number;
  developers: DeveloperReferralRow[];
  channelPartners: CpReferralRow[];
  buyers: BuyerReferralRow[];
}

/**
 * A full referral breakdown for one referrer — who they brought in (by type),
 * and the payable 2%+bonus each stream has generated. Used by the Ambassador,
 * Admin and Founder dashboards so all three see identical figures.
 */
export async function getReferralBreakdown(db: Db, referrerId: string, range?: DateRange): Promise<ReferralBreakdown> {
  // The referrer's own role sets their buyer-referral rate (Ambassador 35% / CP 45%).
  const [me] = await db.select({ role: users.role }).from(users).where(eq(users._id, referrerId));
  const buyerRate = buyerReferralRateForRole(me?.role);

  const [referred, dev, cp, buyer] = await Promise.all([
    db.select({ role: users.role }).from(users).where(eq(users.referredBy, referrerId)),
    computeDeveloperReferralEarnings(db, referrerId, range),
    computeCpReferralEarnings(db, referrerId, range),
    computeBuyerReferralEarnings(db, referrerId, buyerRate, range),
  ]);

  let developers = 0;
  let channelPartners = 0;
  let buyers = 0;
  let others = 0;
  for (const r of referred) {
    if (r.role === "DEVELOPER") developers += 1;
    else if (r.role === "CP") channelPartners += 1;
    else if (r.role === "BUYER") buyers += 1;
    else others += 1;
  }

  const developerReferral = dev.summary.totalEarnings;
  const cpReferral = cp.summary.totalEarnings;
  const buyerReferral = buyer.summary.totalEarnings;

  return {
    counts: { developers, channelPartners, buyers, others, total: referred.length },
    developerReferral,
    cpReferral,
    buyerReferral,
    buyerRatePercent: Math.round(buyerRate * 100),
    totalReferralEarnings: developerReferral + cpReferral + buyerReferral,
    developers: dev.referredDevelopers,
    channelPartners: cp.referredPartners,
    buyers: buyer.referredBuyers,
  };
}
