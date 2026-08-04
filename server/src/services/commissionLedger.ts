import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { getDb } from "../config/db";
import {
  users,
  subscriptions,
  commissions,
  developerCommissionAccruals,
  cpCommissionPayments,
  cpManualCommissions,
  leads,
  siteVisits,
  PayoutDetails,
} from "../db/schema";

/** Developer-onboarding commission rate — 2% of the referred developer's
 *  monthly subscription, every month. */
export const DEVELOPER_COMMISSION_RATE = 0.02;

const round2 = (n: number) => Math.round(n * 100) / 100;

/** "YYYY-MM" key for the given date (defaults to now). */
export function monthKeyOf(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** A subscription's monthly value in rupees (yearly plans are divided by 12). */
function monthlySubRupees(s: { interval: string | null; basePaise: number; gstPaise: number }): number {
  const perCyclePaise = s.basePaise + s.gstPaise;
  const monthlyPaise = s.interval === "yearly" ? perCyclePaise / 12 : perCyclePaise;
  return monthlyPaise / 100;
}

/**
 * Accrue the 2% developer-onboarding commission for `monthKey` (default: this
 * month). One row per referred developer per month (idempotent — re-running is
 * safe). A developer counts if they signed up under a CP's referral code
 * (`referredBy`) AND currently hold an ACTIVE subscription.
 */
export async function accrueDeveloperCommissions(monthKey: string = monthKeyOf()): Promise<{ created: number; monthKey: string }> {
  const db = getDb();

  const referredDevs = await db
    .select({ _id: users._id, referredBy: users.referredBy })
    .from(users)
    .where(and(eq(users.role, "DEVELOPER"), isNotNull(users.referredBy)));
  if (!referredDevs.length) return { created: 0, monthKey };

  const activeSubs = await db.select().from(subscriptions).where(eq(subscriptions.status, "ACTIVE"));
  const subValueByUser = new Map<string, number>();
  for (const s of activeSubs) {
    if (!s.userId) continue;
    subValueByUser.set(String(s.userId), (subValueByUser.get(String(s.userId)) ?? 0) + monthlySubRupees(s));
  }

  const rows = referredDevs
    .map((d) => {
      const subValue = subValueByUser.get(String(d._id)) ?? 0;
      if (subValue <= 0 || !d.referredBy) return null;
      return {
        cpId: String(d.referredBy),
        developerId: String(d._id),
        monthKey,
        subscriptionAmount: round2(subValue),
        amount: round2(subValue * DEVELOPER_COMMISSION_RATE),
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (!rows.length) return { created: 0, monthKey };

  const inserted = await db
    .insert(developerCommissionAccruals)
    .values(rows)
    .onConflictDoNothing({ target: [developerCommissionAccruals.developerId, developerCommissionAccruals.monthKey] })
    .returning({ _id: developerCommissionAccruals._id });

  return { created: inserted.length, monthKey };
}

export interface CpWallet {
  developerCommission: number;
  saleCommission: number;
  totalEarnings: number;
  paid: number;
  pending: number;
  nextPayable: number;
  history: {
    _id: string;
    type: "DEVELOPER_ONBOARDING" | "PROPERTY_SALE";
    amount: number;
    date: Date;
    description: string;
    status: string;
  }[];
  payments: {
    _id: string;
    amount: number;
    mode: string;
    transactionId: string | null;
    paymentDate: Date;
    notes: string | null;
  }[];
}

/** The full commission wallet for one Channel Partner. */
export async function getCpWallet(cpId: string): Promise<CpWallet> {
  const db = getDb();

  const [saleRows, manualRows, accrualRows, payRows] = await Promise.all([
    db
      .select({ _id: commissions._id, amount: commissions.cpCommissionAmount, status: commissions.status, createdAt: commissions.createdAt, leadId: commissions.leadId })
      .from(commissions)
      .where(eq(commissions.cpId, cpId)),
    db
      .select()
      .from(cpManualCommissions)
      .where(eq(cpManualCommissions.cpId, cpId)),
    db
      .select({ _id: developerCommissionAccruals._id, amount: developerCommissionAccruals.amount, monthKey: developerCommissionAccruals.monthKey, developerId: developerCommissionAccruals.developerId, createdAt: developerCommissionAccruals.createdAt })
      .from(developerCommissionAccruals)
      .where(eq(developerCommissionAccruals.cpId, cpId)),
    db
      .select()
      .from(cpCommissionPayments)
      .where(eq(cpCommissionPayments.cpId, cpId)),
  ]);

  // Resolve referred-developer names for nicer history rows.
  const devIds = [...new Set(accrualRows.map((a) => String(a.developerId)))];
  const devNames = new Map<string, string>();
  if (devIds.length) {
    const devs = await db.select({ _id: users._id, name: users.name }).from(users).where(inArray(users._id, devIds));
    devs.forEach((d) => devNames.set(String(d._id), d.name));
  }

  // Property-sale commission = legacy auto commissions + admin-added manual ones.
  const saleCommission = round2(
    saleRows.reduce((s, r) => s + Number(r.amount || 0), 0) +
    manualRows.reduce((s, r) => s + Number(r.amount || 0), 0),
  );
  const developerCommission = round2(accrualRows.reduce((s, r) => s + Number(r.amount || 0), 0));
  const totalEarnings = round2(saleCommission + developerCommission);
  const paid = round2(payRows.reduce((s, r) => s + Number(r.amount || 0), 0));
  const pending = round2(totalEarnings - paid);

  const history = [
    ...saleRows.map((r) => ({
      _id: String(r._id),
      type: "PROPERTY_SALE" as const,
      amount: round2(Number(r.amount || 0)),
      date: r.createdAt,
      description: "Property sale commission",
      status: r.status,
    })),
    ...manualRows.map((r) => ({
      _id: String(r._id),
      type: "PROPERTY_SALE" as const,
      amount: round2(Number(r.amount || 0)),
      date: r.createdAt,
      description: r.label || "Sale commission",
      status: r.status,
    })),
    ...accrualRows.map((r) => ({
      _id: String(r._id),
      type: "DEVELOPER_ONBOARDING" as const,
      amount: round2(Number(r.amount || 0)),
      date: r.createdAt,
      description: `Developer onboarding — 2% (${devNames.get(String(r.developerId)) || "developer"}, ${r.monthKey})`,
      status: "ACCRUED",
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const payments = payRows
    .map((p) => ({ _id: String(p._id), amount: round2(Number(p.amount || 0)), mode: p.mode, transactionId: p.transactionId, paymentDate: p.paymentDate, notes: p.notes }))
    .sort((a, b) => new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime());

  // "Next payable" is simply the outstanding balance the CP is owed right now.
  return { developerCommission, saleCommission, totalEarnings, paid, pending, nextPayable: pending, history, payments };
}

export interface PartnerSummary {
  id: string;
  name: string;
  email: string;
  role: string;
  developerCommission: number;
  saleCommission: number;
  total: number;
  paid: number;
  pending: number;
  nextPayable: number;
  payoutDetails: PayoutDetails | null;
}

/** Commission summary for every Channel Partner / Ambassador (admin view). */
export async function getPartnersSummary(): Promise<PartnerSummary[]> {
  const db = getDb();
  const [cps, saleRows, manualRows, accrualRows, payRows] = await Promise.all([
    db.select({ _id: users._id, name: users.name, email: users.email, role: users.role, payoutDetails: users.payoutDetails }).from(users).where(inArray(users.role, ["CP", "AMBASSADOR"])),
    db.select({ cpId: commissions.cpId, amount: commissions.cpCommissionAmount }).from(commissions),
    db.select({ cpId: cpManualCommissions.cpId, amount: cpManualCommissions.amount }).from(cpManualCommissions),
    db.select({ cpId: developerCommissionAccruals.cpId, amount: developerCommissionAccruals.amount }).from(developerCommissionAccruals),
    db.select({ cpId: cpCommissionPayments.cpId, amount: cpCommissionPayments.amount }).from(cpCommissionPayments),
  ]);

  const sumBy = (rows: { cpId: string; amount: number }[]) => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(String(r.cpId), (m.get(String(r.cpId)) ?? 0) + Number(r.amount || 0));
    return m;
  };
  const sale = sumBy(saleRows as any);
  const manual = sumBy(manualRows as any);
  const dev = sumBy(accrualRows as any);
  const paidM = sumBy(payRows as any);

  return cps
    .map((c) => {
      const saleCommission = round2((sale.get(String(c._id)) ?? 0) + (manual.get(String(c._id)) ?? 0));
      const developerCommission = round2(dev.get(String(c._id)) ?? 0);
      const total = round2(saleCommission + developerCommission);
      const paid = round2(paidM.get(String(c._id)) ?? 0);
      const pending = round2(total - paid);
      return {
        id: String(c._id),
        name: c.name,
        email: c.email,
        role: c.role,
        developerCommission,
        saleCommission,
        total,
        paid,
        pending,
        nextPayable: pending,
        payoutDetails: (c.payoutDetails as PayoutDetails | null) ?? null,
      };
    })
    .sort((a, b) => b.pending - a.pending || b.total - a.total);
}

export interface PartnerDetail {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  payoutDetails: PayoutDetails | null;
  stats: { totalLeads: number; siteVisits: number; bookings: number };
  wallet: CpWallet;
  manualCommissions: {
    _id: string;
    label: string | null;
    bookingValue: number | null;
    percent: number | null;
    amount: number;
    status: string;
    paidAmount: number | null;
    paymentDate: Date | null;
    transactionRef: string | null;
    paymentMode: string | null;
    notes: string | null;
    createdAt: Date;
  }[];
}

/** Everything the admin needs to manage one Channel Partner's commissions:
 *  CRM stats, bank details, the wallet totals and every manual commission. */
export async function getPartnerDetail(cpId: string): Promise<PartnerDetail | null> {
  const db = getDb();
  const [cp] = await db
    .select({ _id: users._id, name: users.name, email: users.email, phone: users.phone, role: users.role, payoutDetails: users.payoutDetails })
    .from(users)
    .where(eq(users._id, cpId));
  if (!cp) return null;

  const [leadRows, visitRows, manualRows, wallet] = await Promise.all([
    db.select({ _id: leads._id, stage: leads.stage }).from(leads).where(eq(leads.assignedToId, cpId)),
    db.select({ _id: siteVisits._id }).from(siteVisits).where(eq(siteVisits.cpId, cpId)),
    db.select().from(cpManualCommissions).where(eq(cpManualCommissions.cpId, cpId)),
    getCpWallet(cpId),
  ]);

  const bookings = leadRows.filter((l) => l.stage === "BOOKING" || l.stage === "REGISTRATION" || l.stage === "COMPLETED").length;

  return {
    id: String(cp._id),
    name: cp.name,
    email: cp.email,
    phone: cp.phone,
    role: cp.role,
    payoutDetails: (cp.payoutDetails as PayoutDetails | null) ?? null,
    stats: { totalLeads: leadRows.length, siteVisits: visitRows.length, bookings },
    wallet,
    manualCommissions: manualRows
      .map((m) => ({
        _id: String(m._id),
        label: m.label,
        bookingValue: m.bookingValue,
        percent: m.percent,
        amount: round2(Number(m.amount || 0)),
        status: m.status,
        paidAmount: m.paidAmount,
        paymentDate: m.paymentDate,
        transactionRef: m.transactionRef,
        paymentMode: m.paymentMode,
        notes: m.notes,
        createdAt: m.createdAt,
      }))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
  };
}
