/**
 * Integration check: the Ambassador wallet, the Admin partner summary and the
 * Admin partner detail must all report the SAME referral earnings for a given
 * ambassador. Run against the local test DB:
 *
 *   DATABASE_URL=postgres://pg@127.0.0.1:5433/truvi_test \
 *   JWT_SECRET=x JWT_REFRESH_SECRET=y FOUNDER_PASSWORD=z \
 *   npx tsx src/scripts/verify-referral-sync.ts
 */
import { connectDB, getDb, disconnectDB } from "../config/db";
import { users, projects, leads, commissions } from "../db/schema";
import { eq, inArray } from "drizzle-orm";
import { getCpWallet, getPartnersSummary, getPartnerDetail } from "../services/commissionLedger";
import { getReferralBreakdown, rangeForPeriod } from "../services/referralEarnings";

const TAG = "reftest_" + Date.now();
function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("ASSERT FAILED: " + msg);
  console.log("  ✓ " + msg);
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL required");
  await connectDB(url);
  const db = getDb();

  // --- Seed: ambassador → developer → project → lead → commission (₹10,00,000)
  const [amb] = await db.insert(users).values({ name: "Amb " + TAG, email: `${TAG}_amb@t.dev`, password: "x", role: "AMBASSADOR" }).returning();
  const [seller] = await db.insert(users).values({ name: "Seller " + TAG, email: `${TAG}_cp@t.dev`, password: "x", role: "CP" }).returning();
  const [dev] = await db.insert(users).values({ name: "Dev " + TAG, email: `${TAG}_dev@t.dev`, password: "x", role: "DEVELOPER", referredBy: amb._id }).returning();
  const [proj] = await db.insert(projects).values({ developerId: dev._id, name: "Proj " + TAG, description: "d", city: "Pune", location: "x", commissionPercent: 3 }).returning();
  const [lead] = await db.insert(leads).values({ projectId: proj._id, submittedById: seller._id, assignedToId: seller._id, clientName: "C", clientPhone: "9", source: "TEST", stage: "BOOKING" }).returning();
  const BOOKING = 1_000_000;
  await db.insert(commissions).values({
    leadId: lead._id, cpId: seller._id, bookingValue: BOOKING, commissionPercent: 3,
    cpCommissionAmount: 30000, platformFeeAmount: 0, tdsAmount: 0, status: "PENDING",
  });

  // Expected: 2% of ₹10,00,000 = ₹20,000, + ₹100 first-transaction bonus.
  const EXPECTED = Math.round(BOOKING * 0.02) + 100; // 20100
  console.log(`\nExpected ambassador referral earnings = ₹${EXPECTED}\n`);

  const ambId = String(amb._id);

  // 1. Shared source of truth
  const breakdown = await getReferralBreakdown(db, ambId);
  console.log("getReferralBreakdown:");
  assert(breakdown.totalReferralEarnings === EXPECTED, `breakdown.totalReferralEarnings = ${breakdown.totalReferralEarnings}`);
  assert(breakdown.counts.developers === 1, `counts.developers = ${breakdown.counts.developers}`);
  assert(breakdown.developers[0]?.incentiveEarned === EXPECTED, `developer row incentive = ${breakdown.developers[0]?.incentiveEarned}`);

  // 2. Ambassador wallet
  const wallet = await getCpWallet(ambId);
  console.log("getCpWallet (Ambassador dashboard):");
  assert(wallet.referralCommission === EXPECTED, `wallet.referralCommission = ${wallet.referralCommission}`);
  assert(wallet.totalEarnings >= EXPECTED, `wallet.totalEarnings includes referral (${wallet.totalEarnings})`);
  assert(wallet.pending === wallet.totalEarnings - wallet.paid, `pending = total - paid`);

  // 3. Admin partner summary
  const summary = await getPartnersSummary();
  const row = summary.find((p) => p.id === ambId);
  console.log("getPartnersSummary (Admin/Founder list):");
  assert(!!row, "ambassador appears in partner summary");
  assert(row!.referralCommission === EXPECTED, `summary.referralCommission = ${row!.referralCommission}`);
  assert(row!.referredDevelopers === 1, `summary.referredDevelopers = ${row!.referredDevelopers}`);

  // 4. Admin partner detail
  const detail = await getPartnerDetail(ambId);
  console.log("getPartnerDetail (Admin/Founder drill-down):");
  assert(!!detail, "detail loads");
  assert(detail!.wallet.referralCommission === EXPECTED, `detail.wallet.referralCommission = ${detail!.wallet.referralCommission}`);
  assert(detail!.wallet.referral.developers[0]?.incentiveEarned === EXPECTED, `detail developer row = ${detail!.wallet.referral.developers[0]?.incentiveEarned}`);

  // 5. All three agree
  console.log("Cross-check (all three surfaces must match):");
  assert(
    wallet.referralCommission === row!.referralCommission &&
    row!.referralCommission === detail!.wallet.referralCommission &&
    detail!.wallet.referralCommission === breakdown.totalReferralEarnings,
    "Ambassador wallet == Admin summary == Admin detail == shared source",
  );

  // 6. Period filter (This Month / Last Month) — the booking is dated now.
  const thisMonth = await getReferralBreakdown(db, ambId, rangeForPeriod("this_month"));
  const lastMonth = await getReferralBreakdown(db, ambId, rangeForPeriod("last_month"));
  console.log("Period filter (date range):");
  assert(thisMonth.totalReferralEarnings === EXPECTED, `this_month = ${thisMonth.totalReferralEarnings} (includes the txn + bonus)`);
  assert(lastMonth.totalReferralEarnings === 0, `last_month = ${lastMonth.totalReferralEarnings} (no txn, no double-counted bonus)`);

  // --- Cleanup
  await db.delete(commissions).where(eq(commissions.leadId, lead._id));
  await db.delete(leads).where(eq(leads._id, lead._id));
  await db.delete(projects).where(eq(projects._id, proj._id));
  await db.delete(users).where(inArray(users._id, [amb._id, seller._id, dev._id]));

  console.log("\n✅ ALL CHECKS PASSED — numbers are synchronized across all three dashboards.\n");
  await disconnectDB();
}

main().catch(async (e) => { console.error("\n❌ " + (e instanceof Error ? e.message : e)); await disconnectDB().catch(() => {}); process.exit(1); });
