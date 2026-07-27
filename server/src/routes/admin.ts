import { Router } from "express";
import fs from "fs";
import path from "path";
import { z } from "zod";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "../config/db";
import {
  users,
  projects,
  units,
  leads,
  siteVisits,
  commissions,
  enquiries,
  sharedDocuments,
  projectAssets,
  legalDocuments,
  buyerDocuments,
  notifications,
  payments,
  subscriptions,
  leadPurchases,
  leadFollowUps,
  leadActivities,
  crmTasks,
  ambassadorTasks,
  financeEntries,
  marketingCampaigns,
  customerFeedback,
  platformSettings,
  IPlatformSettings,
  LeadStage,
  Role,
  ApprovalStatus,
  VerificationDetails,
  OnboardingChecks,
  UserVerification,
  DEFAULT_ONBOARDING_CHECKS,
  isOnboardingComplete,
} from "../db/schema";
import { isValidId } from "../lib/ids";
import { authenticate, requireRole, AuthedRequest } from "../middleware/auth";
import { DEFAULT_PLATFORM_FEE_PERCENT } from "../config/constants";
import { emitNotification } from "../sockets";
import { logAudit } from "../services/audit";
import { kycDir } from "./auth";
import { runLifecycleReminders } from "../services/lifecycleEmails";

const router = Router();
router.use(authenticate);

// POST /api/admin/lifecycle/run-reminders — trigger the onboarding-reminder
// sweep on demand (verify account / complete KYC / activate a plan). The same
// sweep also runs automatically once a day; this lets a founder fire it now.
router.post("/lifecycle/run-reminders", requireRole("ADMIN"), async (_req, res) => {
  const result = await runLifecycleReminders();
  res.json({ ok: true, ...result });
});

// GET /api/admin/investor-metrics — the live valuation-driving numbers
// (users, MRR/ARR, LTV, CAC, churn, revenue, conversion) for the admin /
// investor dashboard.
router.get("/investor-metrics", requireRole("ADMIN"), async (_req, res) => {
  const db = getDb();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [allUsers, allSubs, allPays, allCommissions, allLeads] = await Promise.all([
    db.select({ _id: users._id, role: users.role, createdAt: users.createdAt, onboardingChecks: users.onboardingChecks }).from(users),
    db.select().from(subscriptions),
    db.select().from(payments).where(eq(payments.status, "PAID")),
    db.select().from(commissions),
    db.select({ _id: leads._id, updatedAt: leads.updatedAt }).from(leads),
  ]);

  const byRole = (role: Role) => allUsers.filter((u) => u.role === role).length;
  const activeSubs = allSubs.filter((s) => s.status === "ACTIVE");
  const monthlyPaise = (s: (typeof allSubs)[number]) =>
    s.interval === "yearly" ? Math.round((s.basePaise + s.gstPaise) / 12) : s.basePaise + s.gstPaise;

  const mrrPaise = activeSubs.reduce((sum, s) => sum + monthlyPaise(s), 0);
  const oneTimeRevenuePaise = allPays.reduce((sum, p) => sum + p.amountPaise + p.gstPaise, 0);
  const platformFeePaise = Math.round(allCommissions.reduce((sum, c) => sum + c.platformFeeAmount, 0) * 100);

  const payingUserIds = new Set([
    ...allPays.map((p) => p.userId).filter(Boolean),
    ...activeSubs.map((s) => s.userId).filter(Boolean),
  ]);
  const cancelled = allSubs.filter((s) => s.status === "CANCELLED").length;

  res.json({
    metrics: {
      totalBuyers: byRole("BUYER"),
      totalDevelopers: byRole("DEVELOPER"),
      totalCPs: byRole("CP"),
      activeUsers: new Set(allLeads.filter((l) => l.updatedAt >= thirtyDaysAgo).map((l) => l._id)).size + activeSubs.length,
      newUsers30d: allUsers.filter((u) => u.createdAt >= thirtyDaysAgo).length,
      mrrPaise,
      arrPaise: mrrPaise * 12,
      totalRevenuePaise: oneTimeRevenuePaise + platformFeePaise,
      ltvPaise: payingUserIds.size ? Math.round((oneTimeRevenuePaise + platformFeePaise) / payingUserIds.size) : 0,
      // No paid-acquisition spend is tracked yet, so CAC is organic (₹0).
      cacPaise: 0,
      churnPercent: allSubs.length ? Math.round((cancelled / allSubs.length) * 100) : 0,
      conversionPercent: allUsers.length ? Math.round((payingUserIds.size / allUsers.length) * 100) : 0,
      payingUsers: payingUserIds.size,
      gmvPaise: Math.round(allCommissions.reduce((sum, c) => sum + c.bookingValue, 0) * 100),
    },
  });
});

// GET /api/admin/kpi-trends — month-over-month growth % for the dashboard's
// headline cards. "Growth this month" = value added since the 1st, relative to
// the total that existed before this month — so it reads as "↑X% this month"
// next to a running total. All from real dated records; no fabricated numbers.
router.get("/kpi-trends", requireRole("ADMIN"), async (_req, res) => {
  const db = getDb();
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [userRows, projectRows, commissionRows, purchaseRows] = await Promise.all([
    db.select({ createdAt: users.createdAt }).from(users),
    db.select({ createdAt: projects.createdAt }).from(projects),
    db.select({ createdAt: commissions.createdAt, platformFeeAmount: commissions.platformFeeAmount }).from(commissions),
    db.select({ createdAt: leadPurchases.createdAt, amountPaid: leadPurchases.amountPaid }).from(leadPurchases),
  ]);

  const growth = (thisMonth: number, before: number) =>
    before > 0 ? Math.round((thisMonth / before) * 100) : thisMonth > 0 ? 100 : 0;

  const countGrowth = (rows: { createdAt: Date }[]) => {
    const thisMonth = rows.filter((r) => new Date(r.createdAt) >= startOfMonth).length;
    return growth(thisMonth, rows.length - thisMonth);
  };
  const sumGrowth = (rows: { createdAt: Date }[], amount: (r: any) => number) => {
    let thisMonth = 0, before = 0;
    for (const r of rows) {
      const v = amount(r);
      if (new Date(r.createdAt) >= startOfMonth) thisMonth += v;
      else before += v;
    }
    return growth(thisMonth, before);
  };

  res.json({
    trends: {
      users: countGrowth(userRows),
      projects: countGrowth(projectRows),
      platformFeeRevenue: sumGrowth(commissionRows, (r) => Number(r.platformFeeAmount || 0)),
      leadRevenue: sumGrowth(purchaseRows, (r) => Number(r.amountPaid || 0)),
    },
  });
});

// GET /api/admin/founder-overview — the Founder Dashboard ("CEO Operating
// System") aggregate. Every number here is derived from ACTUAL platform data
// (users, projects, leads, site visits, commissions, payments, subscriptions,
// lead purchases). Sections that have no data source yet (finance ledger,
// legal/ROC, team/HR, marketing, land bank, investor/cap-table) are NOT
// invented here — they are returned as `tracked: false` so the client renders
// an honest "awaiting data source" state instead of fake numbers.
router.get("/founder-overview", requireRole("ADMIN"), async (_req, res) => {
  const db = getDb();
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    allUsers, allProjects, allUnits, allLeads, allSiteVisits,
    allCommissions, allPurchases, paidPayments, allSubs, allEnquiries,
    pendingLegal, openFollowUps, allCampaigns, allFeedback,
  ] = await Promise.all([
    db.select({ _id: users._id, name: users.name, role: users.role, createdAt: users.createdAt, disabled: users.disabled, lastActiveAt: users.lastActiveAt, onboardingVerified: users.onboardingVerified, onboardingChecks: users.onboardingChecks }).from(users),
    db.select().from(projects),
    db.select({ _id: units._id, status: units.status, price: units.price }).from(units),
    db.select({ _id: leads._id, projectId: leads.projectId, stage: leads.stage, createdAt: leads.createdAt, updatedAt: leads.updatedAt, lostReason: leads.lostReason, assignedToId: leads.assignedToId, clientPhone: leads.clientPhone, firstContactedAt: leads.firstContactedAt }).from(leads),
    db.select({ _id: siteVisits._id, status: siteVisits.status, scheduledAt: siteVisits.scheduledAt }).from(siteVisits),
    db.select().from(commissions),
    db.select().from(leadPurchases),
    db.select().from(payments).where(eq(payments.status, "PAID")),
    db.select().from(subscriptions),
    db.select({ _id: enquiries._id, createdAt: enquiries.createdAt }).from(enquiries),
    db.select({ _id: legalDocuments._id }).from(legalDocuments).where(eq(legalDocuments.verified, false)),
    db.select({ _id: leadFollowUps._id, dueAt: leadFollowUps.dueAt, status: leadFollowUps.status }).from(leadFollowUps),
    db.select({ spend: marketingCampaigns.spend }).from(marketingCampaigns),
    db.select().from(customerFeedback),
  ]);

  const byRole = (r: Role) => allUsers.filter((u) => u.role === r).length;
  const rupees = (n: number) => Math.round(n * 100) / 100;

  // ---- Revenue (rupees) from real, dated sources -------------------------
  // Commission platform fee (fee is booked when the commission row is created),
  // lead-marketplace purchases, and one-off / subscription payments.
  const feeInRange = (from: Date) =>
    allCommissions.filter((c) => c.createdAt >= from).reduce((s, c) => s + Number(c.platformFeeAmount || 0), 0);
  const purchasesInRange = (from: Date) =>
    allPurchases.filter((p) => p.createdAt >= from).reduce((s, p) => s + Number(p.amountPaid || 0), 0);
  const paymentsInRange = (from: Date) =>
    paidPayments.filter((p) => p.createdAt >= from).reduce((s, p) => s + (p.amountPaise + p.gstPaise) / 100, 0);
  const revenueSince = (from: Date) => rupees(feeInRange(from) + purchasesInRange(from) + paymentsInRange(from));

  const platformFeeAll = allCommissions.reduce((s, c) => s + Number(c.platformFeeAmount || 0), 0);
  const leadServiceAll = allPurchases.reduce((s, p) => s + Number(p.amountPaid || 0), 0);
  const paymentsAll = paidPayments.reduce((s, p) => s + (p.amountPaise + p.gstPaise) / 100, 0);
  const totalRevenue = rupees(platformFeeAll + leadServiceAll + paymentsAll);
  const gmv = rupees(allCommissions.reduce((s, c) => s + Number(c.bookingValue || 0), 0));

  // ---- Sales pipeline (real lead stages) ---------------------------------
  const stageCount = (st: LeadStage) => allLeads.filter((l) => l.stage === st).length;
  const leadsToday = allLeads.filter((l) => l.createdAt >= startOfToday).length;
  const qualifiedLeads = allLeads.filter((l) => !["GENERATED", "LOST"].includes(l.stage)).length;
  const bookings = stageCount("BOOKING");
  const registrations = stageCount("REGISTRATION") + stageCount("COMPLETED");
  const siteVisitCount = allSiteVisits.length;
  const closedWon = bookings + registrations;
  const conversionRate = allLeads.length ? Math.round((closedWon / allLeads.length) * 100) : 0;

  const funnel = [
    { stage: "Generated", count: stageCount("GENERATED") + stageCount("ASSIGNED") },
    { stage: "Contacted", count: stageCount("CONTACTED") },
    { stage: "Interested", count: stageCount("INTERESTED") },
    { stage: "Site Visit", count: stageCount("SITE_VISIT") },
    { stage: "Negotiation", count: stageCount("NEGOTIATION") },
    { stage: "Booking", count: bookings },
    { stage: "Registration", count: registrations },
  ];

  // Revenue by project = booking value routed through that project's leads.
  const projectName = new Map(allProjects.map((p) => [String(p._id), p.name]));
  const leadProject = new Map(allLeads.map((l) => [String(l._id), String(l.projectId)]));
  const revByProject = new Map<string, number>();
  for (const c of allCommissions) {
    const pid = leadProject.get(String(c.leadId));
    if (!pid) continue;
    revByProject.set(pid, (revByProject.get(pid) || 0) + Number(c.bookingValue || 0));
  }
  const revenueByProject = [...revByProject.entries()]
    .map(([pid, value]) => ({ project: projectName.get(pid) || "Unknown", value: rupees(value) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  // ---- Projects ----------------------------------------------------------
  const approvedProjects = allProjects.filter((p) => p.approvalStatus === "APPROVED");
  const verifiedProjects = allProjects.filter((p) => p.isVerified);
  const pendingProjects = allProjects.filter((p) => p.approvalStatus === "PENDING");
  const projectRows = allProjects
    .map((p) => ({
      id: String(p._id),
      name: p.name,
      city: p.city,
      approvalStatus: p.approvalStatus,
      verified: Boolean(p.isVerified),
      listingTier: p.listingTier,
      constructionStatus: p.constructionStatus ?? null,
      constructionProgress: typeof p.constructionProgress === "number" ? p.constructionProgress : null,
    }))
    .slice(0, 12);

  // ---- Verification queue ------------------------------------------------
  // Count only submissions actually awaiting manual review (docs submitted →
  // kycStatus PENDING), matching exactly what GET /admin/kyc/pending returns.
  // kycStatus is unset until a user actually submits, so filtering on PENDING
  // alone never inflates the box with accounts that never submitted — and it
  // stays role-agnostic so a Developer (or any role) submission is counted too,
  // not silently dropped.
  const pendingKyc = allUsers.filter(
    (u) => u.onboardingChecks?.kycStatus === "PENDING",
  ).length;

  // ---- CRM (real) --------------------------------------------------------
  const newCustomers30d = allUsers.filter((u) => u.role === "BUYER" && u.createdAt >= thirtyDaysAgo).length;
  const activeCustomers = byRole("BUYER");
  const followUpsDue = openFollowUps.filter((f) => f.status === "PENDING" && f.dueAt <= now).length;

  // ---- Subscriptions / MRR ----------------------------------------------
  const activeSubs = allSubs.filter((s) => s.status === "ACTIVE");
  const mrr = rupees(activeSubs.reduce((s, x) => s + (x.interval === "yearly" ? (x.basePaise + x.gstPaise) / 12 : x.basePaise + x.gstPaise) / 100, 0));

  // ---- Company Health Score (0-100) from real signals only --------------
  const verifiedRatio = approvedProjects.length ? verifiedProjects.length / approvedProjects.length : 0;
  const pipelineActivity = allLeads.length ? allLeads.filter((l) => l.updatedAt >= thirtyDaysAgo).length / allLeads.length : 0;
  const verifBacklog = approvedProjects.length ? 1 - Math.min(pendingProjects.length / approvedProjects.length, 1) : 1;
  const healthScore = Math.round(
    verifiedRatio * 30 +
    Math.min(conversionRate / 100, 1) * 25 +
    pipelineActivity * 20 +
    (totalRevenue > 0 ? 15 : 0) +
    verifBacklog * 10
  );

  const pendingActions = pendingProjects.length + pendingLegal.length + pendingKyc + allEnquiries.length;

  // ---- Derived founder metrics (all from real, dated sources) ------------
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const revenueBetween = (from: Date, to: Date) =>
    rupees(
      allCommissions.filter((c) => c.createdAt >= from && c.createdAt < to).reduce((s, c) => s + Number(c.platformFeeAmount || 0), 0) +
        allPurchases.filter((p) => p.createdAt >= from && p.createdAt < to).reduce((s, p) => s + Number(p.amountPaid || 0), 0) +
        paidPayments.filter((p) => p.createdAt >= from && p.createdAt < to).reduce((s, p) => s + (p.amountPaise + p.gstPaise) / 100, 0),
    );
  const revenueThisMonth = revenueSince(startOfMonth);
  const revenueLastMonth = revenueBetween(startOfLastMonth, startOfMonth);
  const revenueGrowthMoM = revenueLastMonth > 0 ? Math.round(((revenueThisMonth - revenueLastMonth) / revenueLastMonth) * 100) : null;
  const dealCount = allCommissions.length;
  const totalDevelopers = byRole("DEVELOPER");
  const totalCPs = byRole("CP");
  const metrics = {
    avgDealSize: dealCount ? rupees(gmv / dealCount) : 0,
    dealCount,
    revenuePerDeveloper: totalDevelopers ? rupees(totalRevenue / totalDevelopers) : 0,
    revenuePerCP: totalCPs ? rupees(totalRevenue / totalCPs) : 0,
    revenueThisMonth,
    revenueLastMonth,
    revenueGrowthMoM,
    arr: rupees(mrr * 12),
  };

  // ---- Efficiency & growth (CAC, LTV, sales cycle, lost-deal reasons) ----
  // All from real data; each returns null/0 when its inputs are absent so the
  // client can show an honest "—" instead of a fabricated ratio.
  const marketingSpend = rupees(allCampaigns.reduce((s, c) => s + Number(c.spend || 0), 0));
  // Distinct paying accounts = subscribers + CPs who bought commissions/leads.
  const payingIds = new Set<string>([
    ...activeSubs.map((s) => String(s.userId)),
    ...allCommissions.map((c) => String(c.cpId)),
    ...allPurchases.map((p) => String(p.cpId)),
  ]);
  const payingCustomers = payingIds.size;
  const cac = marketingSpend > 0 && activeCustomers > 0 ? rupees(marketingSpend / activeCustomers) : null;
  const ltv = payingCustomers > 0 ? rupees(totalRevenue / payingCustomers) : null;

  // Average sales cycle = mean days from lead creation to reaching a closed-won
  // stage (updatedAt is the last transition, a fair proxy for the close date).
  const wonLeads = allLeads.filter((l) => ["BOOKING", "REGISTRATION", "COMPLETED"].includes(l.stage));
  const cycleDays = wonLeads
    .map((l) => (l.updatedAt.getTime() - l.createdAt.getTime()) / (24 * 60 * 60 * 1000))
    .filter((d) => d >= 0);
  const avgSalesCycleDays = cycleDays.length ? Math.round(cycleDays.reduce((s, d) => s + d, 0) / cycleDays.length) : null;

  // Lost deals + reasons (from the lostReason captured in the CRM).
  const lostLeads = allLeads.filter((l) => l.stage === "LOST");
  const lostReasonMap = new Map<string, number>();
  for (const l of lostLeads) {
    if (!l.lostReason) continue;
    lostReasonMap.set(l.lostReason, (lostReasonMap.get(l.lostReason) || 0) + 1);
  }
  const lostByReason = [...lostReasonMap.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count);
  const totalClosed = closedWon + lostLeads.length;
  const efficiency = {
    cac, ltv,
    marketingSpend,
    avgSalesCycleDays,
    lostDeals: lostLeads.length,
    winRate: totalClosed ? Math.round((closedWon / totalClosed) * 100) : null,
    lostByReason,
    lostReasonsTracked: lostReasonMap.size > 0,
  };

  // ---- Marketplace KPIs (the two-sided-network health at a glance) -------
  const activeOf = (r: Role) => allUsers.filter((u) => u.role === r && !u.disabled).length;
  const rejectedProjects = allProjects.filter((p) => p.approvalStatus === "REJECTED");
  // Returning buyers = phone numbers that appear on more than one lead
  // (someone who came back for a second property enquiry).
  const phoneCounts = new Map<string, number>();
  for (const l of allLeads) if (l.clientPhone) phoneCounts.set(l.clientPhone, (phoneCounts.get(l.clientPhone) || 0) + 1);
  const returningBuyers = [...phoneCounts.values()].filter((c) => c > 1).length;
  const marketplace = {
    activeDevelopers: activeOf("DEVELOPER"),
    activeCPs: activeOf("CP"),
    activeBuyers: activeOf("BUYER"),
    activeProjects: approvedProjects.length,
    verifiedProjects: verifiedProjects.length,
    suspendedProjects: rejectedProjects.length,
    newBuyers30d: newCustomers30d,
    returningBuyers,
  };

  // ---- Sales team performance (leaderboard + first-response time) --------
  const userName = new Map(allUsers.map((u) => [String(u._id), u.name]));
  const cpRevenue = new Map<string, number>();
  for (const c of allCommissions) cpRevenue.set(String(c.cpId), (cpRevenue.get(String(c.cpId)) || 0) + Number(c.platformFeeAmount || 0) + Number(c.cpCommissionAmount || 0));
  const repStats = new Map<string, { leads: number; conversions: number }>();
  for (const l of allLeads) {
    if (!l.assignedToId) continue;
    const id = String(l.assignedToId);
    const cur = repStats.get(id) || { leads: 0, conversions: 0 };
    cur.leads += 1;
    if (["BOOKING", "REGISTRATION", "COMPLETED"].includes(l.stage)) cur.conversions += 1;
    repStats.set(id, cur);
  }
  const salesLeaderboard = [...repStats.entries()]
    .map(([id, s]) => ({
      name: userName.get(id) || "Unknown",
      leads: s.leads,
      conversions: s.conversions,
      conversionRate: s.leads ? Math.round((s.conversions / s.leads) * 100) : 0,
      revenue: rupees(cpRevenue.get(id) || 0),
    }))
    .sort((a, b) => b.conversions - a.conversions || b.leads - a.leads)
    .slice(0, 8);
  // Average first-response time (hours) across leads that were worked.
  const responded = allLeads.filter((l) => l.firstContactedAt);
  const avgResponseHours = responded.length
    ? Math.round((responded.reduce((s, l) => s + (l.firstContactedAt!.getTime() - l.createdAt.getTime()) / 3600000, 0) / responded.length) * 10) / 10
    : null;
  const salesTeam = {
    leaderboard: salesLeaderboard,
    avgResponseHours,
    respondedCount: responded.length,
    tracked: salesLeaderboard.length > 0,
  };

  // ---- Operations queues (what the team must clear today) ----------------
  const svToday = allSiteVisits.filter((s) => s.scheduledAt && s.scheduledAt >= startOfToday && s.scheduledAt < new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000));
  const operations = {
    siteVisitsToday: svToday.length,
    siteVisitsCompleted: allSiteVisits.filter((s) => s.status === "COMPLETED").length,
    kycPending: pendingKyc,
    verificationPending: pendingProjects.length,
    legalPending: pendingLegal.length,
    agreementPending: stageCount("BOOKING"),
    registrationPending: stageCount("REGISTRATION"),
    followUpsDue,
  };

  // ---- Active users (MAU / DAU) — real, from last-active tracking --------
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const activeUsers = {
    dau: allUsers.filter((u) => u.lastActiveAt && u.lastActiveAt >= oneDayAgo).length,
    mau: allUsers.filter((u) => u.lastActiveAt && u.lastActiveAt >= thirtyDaysAgo).length,
    tracked: allUsers.some((u) => u.lastActiveAt),
  };

  // ---- Customer experience (NPS / complaints) — from logged feedback -----
  const npsRows = allFeedback.filter((f) => f.kind === "NPS" && typeof f.score === "number");
  const promoters = npsRows.filter((f) => (f.score as number) >= 9).length;
  const detractors = npsRows.filter((f) => (f.score as number) <= 6).length;
  const nps = npsRows.length ? Math.round(((promoters - detractors) / npsRows.length) * 100) : null;
  const avgRating = npsRows.length ? Math.round((npsRows.reduce((s, f) => s + (f.score as number), 0) / npsRows.length) * 10) / 10 : null;
  const complaints = allFeedback.filter((f) => f.kind === "COMPLAINT");
  const complaintsOpen = complaints.filter((c) => c.status === "OPEN").length;
  const resolved = complaints.filter((c) => c.status === "RESOLVED" && c.resolvedAt);
  const avgResolutionHours = resolved.length
    ? Math.round(resolved.reduce((s, c) => s + (c.resolvedAt!.getTime() - c.createdAt.getTime()) / 3600000, 0) / resolved.length)
    : null;
  const cx = {
    nps, avgRating,
    responses: npsRows.length,
    complaintsOpen,
    complaintsResolved: resolved.length,
    avgResolutionHours,
    tracked: allFeedback.length > 0,
  };

  // ---- Live notifications feed (computed from what actually needs the
  // founder's attention — no fabricated events). Highest-urgency first.
  const notifications: { tone: string; icon: string; text: string }[] = [];
  if (pendingKyc > 0) notifications.push({ tone: "amber", icon: "shield", text: `${pendingKyc} channel-partner KYC awaiting review` });
  if (pendingProjects.length > 0) notifications.push({ tone: "amber", icon: "building", text: `${pendingProjects.length} project${pendingProjects.length > 1 ? "s" : ""} awaiting approval` });
  if (pendingLegal.length > 0) notifications.push({ tone: "red", icon: "doc", text: `${pendingLegal.length} legal document${pendingLegal.length > 1 ? "s" : ""} unverified` });
  if (followUpsDue > 0) notifications.push({ tone: "red", icon: "phone", text: `${followUpsDue} lead follow-up${followUpsDue > 1 ? "s" : ""} overdue` });
  if (allEnquiries.length > 0) notifications.push({ tone: "blue", icon: "mail", text: `${allEnquiries.length} enquir${allEnquiries.length > 1 ? "ies" : "y"} to respond to` });
  if (leadsToday > 0) notifications.push({ tone: "green", icon: "user", text: `${leadsToday} new lead${leadsToday > 1 ? "s" : ""} generated today` });
  if (metrics.revenueGrowthMoM !== null) notifications.push({ tone: metrics.revenueGrowthMoM >= 0 ? "green" : "amber", icon: "trendUp", text: `Revenue ${metrics.revenueGrowthMoM >= 0 ? "up" : "down"} ${Math.abs(metrics.revenueGrowthMoM)}% vs last month` });

  res.json({
    generatedAt: now.toISOString(),
    executive: {
      totalRevenue, gmv,
      totalDevelopers: byRole("DEVELOPER"),
      totalCPs: byRole("CP"),
      totalBuyers: byRole("BUYER"),
      activeListings: approvedProjects.length,
      todaysBookings: allLeads.filter((l) => l.stage === "BOOKING" && l.updatedAt >= startOfToday).length,
      pendingActions,
    },
    companyHealth: {
      revenueToday: revenueSince(startOfToday),
      revenueMTD: revenueSince(startOfMonth),
      revenueYTD: revenueSince(startOfYear),
      activeProjects: approvedProjects.length,
      healthScore,
      mrr,
    },
    sales: {
      leadsToday, qualifiedLeads,
      siteVisits: siteVisitCount,
      bookings, agreements: bookings, registrations,
      conversionRate, funnel, revenueByProject,
    },
    projects: {
      total: allProjects.length,
      approved: approvedProjects.length,
      verified: verifiedProjects.length,
      pending: pendingProjects.length,
      rows: projectRows,
    },
    crm: {
      newCustomers: newCustomers30d,
      activeCustomers,
      followUpsDue,
      enquiries: allEnquiries.length,
    },
    verification: {
      pendingProjects: pendingProjects.length,
      pendingLegal: pendingLegal.length,
      pendingKyc,
    },
    kpi: {
      totalRevenue, gmv, mrr, conversionRate, healthScore,
      totalUnits: allUnits.length,
      soldUnits: allUnits.filter((u) => u.status === "SOLD").length,
    },
    metrics,
    efficiency,
    marketplace,
    operations,
    activeUsers,
    cx,
    salesTeam,
    notifications,
    // Investor-facing snapshot — the numbers we can derive honestly from
    // platform data. Ratios that need cost/usage tracking (CAC, LTV, MAU/DAU,
    // burn multiple) are left to the client to combine with the finance ledger
    // or flagged as awaiting a data source.
    investor: {
      mrr, arr: metrics.arr, gmv,
      totalRevenue,
      growthMoM: metrics.revenueGrowthMoM,
      payingAccounts: activeSubs.length,
      totalCustomers: activeCustomers,
      mau: activeUsers.mau,
      dau: activeUsers.dau,
      activeUsersTracked: activeUsers.tracked,
    },
    // Sections with no data source yet — the client shows an honest
    // "connect a data source" state; NEVER fabricated numbers (rule #6).
    untracked: {
      finance: false, legal: false, team: false,
      marketing: false, landBank: false, investor: false,
    },
  });
});

// GET /api/admin/founder-analytics — live analytics for the Founder Dashboard
// charts. Every series is computed from REAL platform data (commissions,
// payments, lead purchases, leads, projects, units) — no mock numbers.
router.get("/founder-analytics", requireRole("ADMIN"), async (_req, res) => {
  const db = getDb();
  const now = new Date();
  const rupees = (n: number) => Math.round(n * 100) / 100;

  const [allCommissions, allPurchases, paidPayments, allLeads, allProjects, allUnits] = await Promise.all([
    db.select().from(commissions),
    db.select().from(leadPurchases),
    db.select().from(payments).where(eq(payments.status, "PAID")),
    db.select({ _id: leads._id, source: leads.source, createdAt: leads.createdAt, projectId: leads.projectId, stage: leads.stage }).from(leads),
    db.select({ _id: projects._id, name: projects.name, city: projects.city }).from(projects),
    db.select({ _id: units._id, status: units.status }).from(units),
  ]);

  // ---- Monthly revenue / GMV / bookings trend (last 6 months) --------------
  const months: { label: string; start: Date; end: Date }[] = [];
  for (let i = 5; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    months.push({ label: start.toLocaleString("en-US", { month: "short" }), start, end });
  }
  const inRange = (d: Date, m: { start: Date; end: Date }) => d >= m.start && d < m.end;
  const revenueTrend = months.map((m) => {
    const fee = allCommissions.filter((c) => inRange(c.createdAt, m)).reduce((s, c) => s + Number(c.platformFeeAmount || 0), 0);
    const purch = allPurchases.filter((p) => inRange(p.createdAt, m)).reduce((s, p) => s + Number(p.amountPaid || 0), 0);
    const pay = paidPayments.filter((p) => inRange(p.createdAt, m)).reduce((s, p) => s + (p.amountPaise + p.gstPaise) / 100, 0);
    const gmv = allCommissions.filter((c) => inRange(c.createdAt, m)).reduce((s, c) => s + Number(c.bookingValue || 0), 0);
    const bookings = allCommissions.filter((c) => inRange(c.createdAt, m)).length;
    return { month: m.label, revenue: rupees(fee + purch + pay), gmv: rupees(gmv), bookings };
  });

  // ---- Leads by source + conversion rate by source -------------------------
  const sourceMap = new Map<string, { count: number; converted: number }>();
  for (const l of allLeads) {
    const cur = sourceMap.get(l.source) || { count: 0, converted: 0 };
    cur.count += 1;
    if (["BOOKING", "REGISTRATION", "COMPLETED"].includes(l.stage)) cur.converted += 1;
    sourceMap.set(l.source, cur);
  }
  const leadsBySource = [...sourceMap.entries()].map(([source, v]) => ({ source, count: v.count })).sort((a, b) => b.count - a.count);
  const conversionBySource = [...sourceMap.entries()]
    .map(([source, v]) => ({ source, leads: v.count, converted: v.converted, rate: v.count ? Math.round((v.converted / v.count) * 100) : 0 }))
    .sort((a, b) => b.leads - a.leads);

  // ---- GMV & bookings by city ----------------------------------------------
  const projCity = new Map(allProjects.map((p) => [String(p._id), p.city]));
  const leadProj = new Map(allLeads.map((l) => [String(l._id), String(l.projectId)]));
  const cityMap = new Map<string, { gmv: number; bookings: number }>();
  for (const c of allCommissions) {
    const pid = leadProj.get(String(c.leadId));
    const city = pid ? projCity.get(pid) : undefined;
    if (!city) continue;
    const cur = cityMap.get(city) || { gmv: 0, bookings: 0 };
    cur.gmv += Number(c.bookingValue || 0);
    cur.bookings += 1;
    cityMap.set(city, cur);
  }
  const revenueByCity = [...cityMap.entries()]
    .map(([city, v]) => ({ city, gmv: rupees(v.gmv), bookings: v.bookings }))
    .sort((a, b) => b.gmv - a.gmv)
    .slice(0, 8);

  // ---- Inventory by status --------------------------------------------------
  const invMap = new Map<string, number>();
  for (const u of allUnits) invMap.set(u.status, (invMap.get(u.status) || 0) + 1);
  const inventoryByStatus = ["AVAILABLE", "RESERVED", "LOCKED", "SOLD"].map((status) => ({ status, count: invMap.get(status) || 0 }));

  res.json({ revenueTrend, leadsBySource, conversionBySource, revenueByCity, inventoryByStatus, totalUnits: allUnits.length });
});

// GET /api/admin/cp-performance — live Channel Partner network dashboard.
router.get("/cp-performance", requireRole("ADMIN"), async (_req, res) => {
  const db = getDb();
  const rupees = (n: number) => Math.round(n * 100) / 100;
  const [cpUsers, allCommissions, allLeads] = await Promise.all([
    db.select({ _id: users._id, name: users.name, email: users.email, cpTier: users.cpTier, onboardingChecks: users.onboardingChecks, createdAt: users.createdAt })
      .from(users).where(inArray(users.role, ["CP", "AMBASSADOR"])),
    db.select({ cpId: commissions.cpId, cpCommissionAmount: commissions.cpCommissionAmount, bookingValue: commissions.bookingValue }).from(commissions),
    db.select({ assignedToId: leads.assignedToId }).from(leads),
  ]);

  const commByCp = new Map<string, { earned: number; gmv: number; bookings: number }>();
  for (const c of allCommissions) {
    const k = String(c.cpId);
    const cur = commByCp.get(k) || { earned: 0, gmv: 0, bookings: 0 };
    cur.earned += Number(c.cpCommissionAmount || 0);
    cur.gmv += Number(c.bookingValue || 0);
    cur.bookings += 1;
    commByCp.set(k, cur);
  }
  const leadsByCp = new Map<string, number>();
  for (const l of allLeads) {
    if (!l.assignedToId) continue;
    const k = String(l.assignedToId);
    leadsByCp.set(k, (leadsByCp.get(k) || 0) + 1);
  }

  const partners = cpUsers.map((u) => {
    const c = commByCp.get(String(u._id)) || { earned: 0, gmv: 0, bookings: 0 };
    return {
      id: String(u._id), name: u.name, email: u.email,
      tier: u.cpTier || "SILVER",
      kycStatus: u.onboardingChecks?.kycStatus || "PENDING",
      leads: leadsByCp.get(String(u._id)) || 0,
      bookings: c.bookings, gmv: rupees(c.gmv), earned: rupees(c.earned),
    };
  }).sort((a, b) => b.earned - a.earned || b.bookings - a.bookings);

  const tierMap = new Map<string, number>();
  for (const p of partners) tierMap.set(p.tier, (tierMap.get(p.tier) || 0) + 1);
  res.json({
    summary: {
      total: partners.length,
      active: partners.filter((p) => p.bookings > 0).length,
      pendingKyc: partners.filter((p) => p.kycStatus === "PENDING").length,
      totalEarned: rupees(partners.reduce((s, p) => s + p.earned, 0)),
      totalGmv: rupees(partners.reduce((s, p) => s + p.gmv, 0)),
      byTier: ["DIAMOND", "PLATINUM", "GOLD", "SILVER"].map((tier) => ({ tier, count: tierMap.get(tier) || 0 })),
    },
    partners: partners.slice(0, 50),
  });
});

// GET /api/admin/developer-performance — live Developer network dashboard.
router.get("/developer-performance", requireRole("ADMIN"), async (_req, res) => {
  const db = getDb();
  const [devUsers, allProjects] = await Promise.all([
    db.select({ _id: users._id, name: users.name, email: users.email, developerProfile: users.developerProfile, approvalStatus: users.approvalStatus, createdAt: users.createdAt })
      .from(users).where(eq(users.role, "DEVELOPER")),
    db.select({ _id: projects._id, developerId: projects.developerId, approvalStatus: projects.approvalStatus, isVerified: projects.isVerified }).from(projects),
  ]);

  const byDev = new Map<string, { total: number; approved: number; verified: number; pending: number }>();
  for (const p of allProjects) {
    const k = String(p.developerId);
    const cur = byDev.get(k) || { total: 0, approved: 0, verified: 0, pending: 0 };
    cur.total += 1;
    if (p.approvalStatus === "APPROVED") cur.approved += 1;
    if (p.isVerified) cur.verified += 1;
    if (p.approvalStatus === "PENDING") cur.pending += 1;
    byDev.set(k, cur);
  }

  const developers = devUsers.map((u) => {
    const s = byDev.get(String(u._id)) || { total: 0, approved: 0, verified: 0, pending: 0 };
    return {
      id: String(u._id), name: u.name, email: u.email,
      company: u.developerProfile?.companyName || u.name,
      rera: u.developerProfile?.reraNumber || null,
      status: u.approvalStatus, ...s,
    };
  }).sort((a, b) => b.total - a.total);

  res.json({
    summary: {
      total: developers.length,
      totalProjects: allProjects.length,
      verified: allProjects.filter((p) => p.isVerified).length,
      pending: allProjects.filter((p) => p.approvalStatus === "PENDING").length,
    },
    developers: developers.slice(0, 50),
  });
});

// GET /api/admin/inventory-overview — live unit inventory across all projects.
router.get("/inventory-overview", requireRole("ADMIN"), async (_req, res) => {
  const db = getDb();
  const rupees = (n: number) => Math.round(n * 100) / 100;
  const [allUnits, allProjects] = await Promise.all([
    db.select({ _id: units._id, projectId: units.projectId, unitNumber: units.unitNumber, type: units.type, areaSqft: units.areaSqft, price: units.price, status: units.status }).from(units),
    db.select({ _id: projects._id, name: projects.name, city: projects.city }).from(projects),
  ]);
  const projInfo = new Map(allProjects.map((p) => [String(p._id), { name: p.name, city: p.city }]));
  const statusCount = (s: string) => allUnits.filter((u) => u.status === s).length;

  const byProjMap = new Map<string, { total: number; available: number; sold: number; value: number }>();
  for (const u of allUnits) {
    const k = String(u.projectId);
    const cur = byProjMap.get(k) || { total: 0, available: 0, sold: 0, value: 0 };
    cur.total += 1;
    if (u.status === "AVAILABLE") cur.available += 1;
    if (u.status === "SOLD") cur.sold += 1;
    cur.value += Number(u.price || 0);
    byProjMap.set(k, cur);
  }
  const byProject = [...byProjMap.entries()]
    .map(([pid, v]) => ({ project: projInfo.get(pid)?.name || "Unknown", city: projInfo.get(pid)?.city || "", total: v.total, available: v.available, sold: v.sold, value: rupees(v.value) }))
    .sort((a, b) => b.total - a.total);

  res.json({
    summary: {
      total: allUnits.length,
      available: statusCount("AVAILABLE"),
      reserved: statusCount("RESERVED"),
      locked: statusCount("LOCKED"),
      sold: statusCount("SOLD"),
      totalValue: rupees(allUnits.reduce((s, u) => s + Number(u.price || 0), 0)),
      soldValue: rupees(allUnits.filter((u) => u.status === "SOLD").reduce((s, u) => s + Number(u.price || 0), 0)),
    },
    byProject,
    units: allUnits.slice(0, 80).map((u) => ({
      id: String(u._id), project: projInfo.get(String(u.projectId))?.name || "Unknown",
      unitNumber: u.unitNumber, type: u.type, areaSqft: u.areaSqft, price: rupees(Number(u.price || 0)), status: u.status,
    })),
  });
});

// GET /api/admin/bookings-overview — live booking activity (from commissions).
router.get("/bookings-overview", requireRole("ADMIN"), async (_req, res) => {
  const db = getDb();
  const rupees = (n: number) => Math.round(n * 100) / 100;
  const [allCommissions, allLeads, allProjects, allUsers] = await Promise.all([
    db.select().from(commissions),
    db.select({ _id: leads._id, projectId: leads.projectId, clientName: leads.clientName }).from(leads),
    db.select({ _id: projects._id, name: projects.name }).from(projects),
    db.select({ _id: users._id, name: users.name }).from(users),
  ]);
  const projName = new Map(allProjects.map((p) => [String(p._id), p.name]));
  const userName = new Map(allUsers.map((u) => [String(u._id), u.name]));
  const leadInfo = new Map(allLeads.map((l) => [String(l._id), { projectId: String(l.projectId), client: l.clientName }]));

  const bookings = allCommissions.map((c) => {
    const li = leadInfo.get(String(c.leadId));
    const ms = c.milestones || [];
    return {
      id: String(c._id),
      date: c.createdAt,
      project: li ? projName.get(li.projectId) || "Unknown" : "Unknown",
      client: li?.client || "—",
      cp: userName.get(String(c.cpId)) || "—",
      bookingValue: rupees(Number(c.bookingValue || 0)),
      commission: rupees(Number(c.cpCommissionAmount || 0)),
      status: c.status,
      milestones: ms.length,
      released: ms.filter((m) => m.isReleased).length,
    };
  }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const statusMap = new Map<string, number>();
  for (const b of bookings) statusMap.set(b.status, (statusMap.get(b.status) || 0) + 1);
  res.json({
    summary: {
      total: bookings.length,
      totalGmv: rupees(bookings.reduce((s, b) => s + b.bookingValue, 0)),
      totalCommission: rupees(bookings.reduce((s, b) => s + b.commission, 0)),
      paid: bookings.filter((b) => b.status === "PAID").length,
      pending: bookings.filter((b) => b.status !== "PAID").length,
      byStatus: [...statusMap.entries()].map(([status, count]) => ({ status, count })),
    },
    bookings: bookings.slice(0, 60),
  });
});

// GET /api/admin/legal-overview — live legal-document register & verification.
router.get("/legal-overview", requireRole("ADMIN"), async (_req, res) => {
  const db = getDb();
  const [allDocs, allProjects] = await Promise.all([
    db.select({ _id: legalDocuments._id, projectId: legalDocuments.projectId, title: legalDocuments.title, docType: legalDocuments.docType, verified: legalDocuments.verified, verifiedAt: legalDocuments.verifiedAt, createdAt: legalDocuments.createdAt }).from(legalDocuments),
    db.select({ _id: projects._id, name: projects.name }).from(projects),
  ]);
  const projName = new Map(allProjects.map((p) => [String(p._id), p.name]));
  const typeMap = new Map<string, number>();
  for (const d of allDocs) typeMap.set(d.docType, (typeMap.get(d.docType) || 0) + 1);
  res.json({
    summary: {
      total: allDocs.length,
      verified: allDocs.filter((d) => d.verified).length,
      pending: allDocs.filter((d) => !d.verified).length,
      byType: [...typeMap.entries()].map(([type, count]) => ({ type, count })),
    },
    docs: allDocs
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 60)
      .map((d) => ({ id: String(d._id), project: projName.get(String(d.projectId)) || "Unknown", title: d.title, docType: d.docType, verified: d.verified, date: d.createdAt })),
  });
});

// GET /api/admin/support-overview — live customer enquiries / support queue.
router.get("/support-overview", requireRole("ADMIN"), async (_req, res) => {
  const db = getDb();
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const allEnquiries = await db.select().from(enquiries);
  const purposeMap = new Map<string, number>();
  for (const e of allEnquiries) purposeMap.set(e.purposeType, (purposeMap.get(e.purposeType) || 0) + 1);
  res.json({
    summary: {
      total: allEnquiries.length,
      thisWeek: allEnquiries.filter((e) => e.createdAt >= weekAgo).length,
      byPurpose: [...purposeMap.entries()].map(([purpose, count]) => ({ purpose, count })),
    },
    tickets: allEnquiries
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 60)
      .map((e) => ({ id: String(e._id), name: e.name, email: e.email, purpose: e.purposeType, project: e.projectName || null, message: e.message || null, date: e.createdAt })),
  });
});

// GET /api/admin/ops-overview — consolidated operations queues (live).
router.get("/ops-overview", requireRole("ADMIN"), async (_req, res) => {
  const db = getDb();
  const now = new Date();
  const [tasks, followUps, crm, pendingProjects, pendingLegalDocs] = await Promise.all([
    db.select({ _id: ambassadorTasks._id, title: ambassadorTasks.title, status: ambassadorTasks.status, deadline: ambassadorTasks.deadline }).from(ambassadorTasks),
    db.select({ _id: leadFollowUps._id, dueAt: leadFollowUps.dueAt, status: leadFollowUps.status }).from(leadFollowUps),
    db.select({ _id: crmTasks._id, status: crmTasks.status }).from(crmTasks),
    db.select({ _id: projects._id }).from(projects).where(eq(projects.approvalStatus, "PENDING")),
    db.select({ _id: legalDocuments._id }).from(legalDocuments).where(eq(legalDocuments.verified, false)),
  ]);
  const taskStatusMap = new Map<string, number>();
  for (const t of tasks) taskStatusMap.set(t.status, (taskStatusMap.get(t.status) || 0) + 1);
  res.json({
    summary: {
      siteTasks: tasks.length,
      siteTasksOpen: tasks.filter((t) => t.status === "AVAILABLE" || t.status === "LOCKED").length,
      followUpsPending: followUps.filter((f) => f.status === "PENDING").length,
      followUpsOverdue: followUps.filter((f) => f.status === "PENDING" && f.dueAt <= now).length,
      crmTasksOpen: crm.filter((c) => c.status === "OPEN").length,
      pendingApprovals: pendingProjects.length,
      pendingLegal: pendingLegalDocs.length,
      byTaskStatus: [...taskStatusMap.entries()].map(([status, count]) => ({ status, count })),
    },
    siteVisitTasks: tasks
      .sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime())
      .slice(0, 40)
      .map((t) => ({ id: String(t._id), title: t.title, status: t.status, deadline: t.deadline })),
  });
});

// GET /api/admin/users?role=&approvalStatus=
router.get("/users", requireRole("ADMIN"), async (req, res) => {
  const { role, approvalStatus, all } = req.query;

  const conditions = [];
  if (typeof role === "string" && role) {
    conditions.push(eq(users.role, role as Role));
  } else if (all !== "true") {
    // Default view stays scoped to the marketplace-facing roles; the user
    // management screen passes ?all=true to include every account.
    conditions.push(inArray(users.role, ["DEVELOPER", "CP", "BUYER"]));
  }

  if (typeof approvalStatus === "string" && approvalStatus) {
    conditions.push(eq(users.approvalStatus, approvalStatus as ApprovalStatus));
  }

  const db = getDb();
  const rows = await db
    .select()
    .from(users)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(users.createdAt));

  // Attach a TRUTHFUL subscription summary per user so the admin UI only offers
  // "Cancel subscription" to users who actually have one. Two real signals:
  //   1) a `subscriptions` row that reached ACTIVE (a paid Razorpay plan), and
  //   2) live CP Premium (cpProfile.isPremium, not past its expiry).
  const now = Date.now();
  const activeSubs = await db
    .select({ userId: subscriptions.userId, planLabel: subscriptions.planLabel, createdAt: subscriptions.createdAt })
    .from(subscriptions)
    .where(eq(subscriptions.status, "ACTIVE"))
    .orderBy(desc(subscriptions.createdAt));
  const subsByUser = new Map<string, { count: number; label: string }>();
  for (const s of activeSubs) {
    if (!s.userId) continue;
    const prev = subsByUser.get(s.userId);
    subsByUser.set(s.userId, { count: (prev?.count ?? 0) + 1, label: prev?.label ?? s.planLabel });
  }

  const safeUsers = rows.map(({ password, ...u }) => {
    const paid = subsByUser.get(u._id);
    const premiumExpiry = u.cpProfile?.premiumExpiresAt ? Date.parse(u.cpProfile.premiumExpiresAt) : null;
    const premiumActive = Boolean(u.cpProfile?.isPremium) && (premiumExpiry === null || Number.isNaN(premiumExpiry) || premiumExpiry > now);
    const active = Boolean(paid) || premiumActive;
    return {
      ...u,
      subscription: {
        active,
        count: paid?.count ?? 0,
        label: paid?.label ?? (premiumActive ? "CP Premium" : null),
        premiumExpiresAt: premiumActive ? u.cpProfile?.premiumExpiresAt ?? null : null,
      },
    };
  });
  res.json({ users: safeUsers });
});

// PATCH /api/admin/users/:id — deactivate ("remove") or reactivate an account.
// The row is kept so its history/financial records stay intact; a disabled
// user simply can't log in and drops out of active counts. Admins can't
// disable themselves or another admin.
const userStatusSchema = z
  .object({
    disabled: z.boolean().optional(),
    approvalStatus: z.enum(["APPROVED", "REJECTED", "PENDING"]).optional(),
  })
  .refine((d) => d.disabled !== undefined || d.approvalStatus !== undefined, { message: "Nothing to update" });
router.patch("/users/:id", requireRole("ADMIN"), async (req: AuthedRequest, res) => {
  const parsed = userStatusSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });

  const userId = req.params.id;
  if (!isValidId(userId)) return res.status(404).json({ error: "User not found" });
  if (userId === req.user!.userId) return res.status(400).json({ error: "You can't change your own account status" });

  const db = getDb();
  const [target] = await db.select().from(users).where(eq(users._id, userId));
  if (!target) return res.status(404).json({ error: "User not found" });
  if (target.role === "ADMIN") return res.status(403).json({ error: "Admin accounts can't be changed here" });

  const update: { disabled?: boolean; approvalStatus?: ApprovalStatus } = {};
  if (parsed.data.disabled !== undefined) update.disabled = parsed.data.disabled;
  if (parsed.data.approvalStatus !== undefined) update.approvalStatus = parsed.data.approvalStatus as ApprovalStatus;

  const [updated] = await db.update(users).set(update).where(eq(users._id, userId)).returning();
  const { password: _pw, ...safeUser } = updated;
  const action = parsed.data.approvalStatus
    ? `user.${parsed.data.approvalStatus.toLowerCase()}`
    : parsed.data.disabled
      ? "user.disable"
      : "user.enable";
  await logAudit({ userId: req.user!.userId, action, resourceType: "user", resourceId: userId, metadata: { name: target.name, role: target.role } });
  res.json({ user: safeUser });
});

// POST /api/admin/users/:id/cancel-subscription — cancel a user's paid plan.
// Marks their active/pending subscription rows CANCELLED and clears the
// premium flags (CP premium + tier). Truthful state only — no fake numbers.
router.post("/users/:id/cancel-subscription", requireRole("ADMIN"), async (req: AuthedRequest, res) => {
  const userId = req.params.id;
  if (!isValidId(userId)) return res.status(404).json({ error: "User not found" });

  const db = getDb();
  const [target] = await db.select().from(users).where(eq(users._id, userId));
  if (!target) return res.status(404).json({ error: "User not found" });

  const cancelled = await db
    .update(subscriptions)
    .set({ status: "CANCELLED", updatedAt: new Date() })
    .where(and(eq(subscriptions.userId, userId), inArray(subscriptions.status, ["CREATED", "ACTIVE"])))
    .returning({ _id: subscriptions._id });

  // Reset any premium entitlement carried on the user record.
  const cpProfile = { ...(target.cpProfile ?? {}), isPremium: false, premiumExpiresAt: null };
  const [updated] = await db
    .update(users)
    .set({ cpProfile: cpProfile as typeof target.cpProfile, cpTier: "SILVER" })
    .where(eq(users._id, userId))
    .returning();
  const { password: _pw, ...safeUser } = updated;

  res.json({ cancelledCount: cancelled.length, user: safeUser });
});

// Admin account-approval has been removed — accounts self-approve on signup
// and are gated by email OTP verification instead, so there is no longer a
// user approval/rejection endpoint here.

// GET /api/admin/projects?approvalStatus=
router.get("/projects", requireRole("ADMIN"), async (req, res) => {
  const { approvalStatus } = req.query;

  const conditions = [];
  if (typeof approvalStatus === "string" && approvalStatus) {
    conditions.push(eq(projects.approvalStatus, approvalStatus as ApprovalStatus));
  }

  const db = getDb();
  const rows = await db
    .select({
      project: projects,
      developer: { _id: users._id, name: users.name },
    })
    .from(projects)
    .leftJoin(users, eq(projects.developerId, users._id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(projects.createdAt));

  const result = rows.map(({ project, developer }) => ({
    ...project,
    developerId: developer ? { _id: String(developer._id), name: developer.name } : null,
  }));

  res.json({ projects: result });
});

const verificationDetailsSchema = z.object({
  reraVerified: z.boolean().optional(),
  titleClearance: z.boolean().optional(),
  encumbranceFree: z.boolean().optional(),
  constructionApproval: z.boolean().optional(),
  verificationSource: z.string().optional(),
  portfolioVerified: z.boolean().optional(),
  lastVerifiedAt: z.string().datetime().optional().nullable(),
  notes: z.string().optional(),
}).optional();

const patchProjectSchema = z.object({
  projectId: z.string().min(1),
  approvalStatus: z.enum(["APPROVED", "REJECTED", "PENDING"]).optional(),
  listingTier: z.enum(["STANDARD", "FEATURED"]).optional(),
  featuredUntil: z.string().datetime().optional().nullable(),
  isVerified: z.boolean().optional(),
  isPrimeListing: z.boolean().optional(),
  threeDModelUrl: z.string().url().or(z.literal("")).nullable().optional(),
  masterPlanUrl: z.string().min(1).or(z.literal("")).nullable().optional(),
  verificationDetails: verificationDetailsSchema,
});

router.patch("/projects", requireRole("ADMIN"), async (req: AuthedRequest, res) => {
  const parsed = patchProjectSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });

  const { projectId, ...data } = parsed.data;
  if (!isValidId(projectId)) return res.status(404).json({ error: "Project not found" });

  const db = getDb();
  const [existing] = await db.select().from(projects).where(eq(projects._id, projectId));
  if (!existing) return res.status(404).json({ error: "Project not found" });

  const update: Record<string, unknown> = {};
  if (data.approvalStatus) update.approvalStatus = data.approvalStatus;
  if (data.listingTier) update.listingTier = data.listingTier;
  if (data.featuredUntil !== undefined) update.featuredUntil = data.featuredUntil ? new Date(data.featuredUntil) : null;
  if (data.isVerified !== undefined) {
    update.isVerified = data.isVerified;
    update.verifiedAt = data.isVerified ? new Date() : null;
  }
  if (data.isPrimeListing !== undefined) update.isPrimeListing = data.isPrimeListing;
  if (data.threeDModelUrl !== undefined) update.threeDModelUrl = data.threeDModelUrl || null;
  if (data.masterPlanUrl !== undefined) update.masterPlanUrl = data.masterPlanUrl || null;
  if (data.verificationDetails !== undefined) {
    const merged = {
      reraVerified: false,
      titleClearance: false,
      encumbranceFree: false,
      constructionApproval: false,
      portfolioVerified: false,
      ...(existing.verificationDetails ?? {}),
      ...data.verificationDetails,
    } as VerificationDetails;

    if (data.verificationDetails.lastVerifiedAt !== undefined) {
      merged.lastVerifiedAt = data.verificationDetails.lastVerifiedAt;
    }

    update.verificationDetails = merged;
  }

  if (Object.keys(update).length === 0) {
    return res.json({ project: existing });
  }

  const [project] = await db
    .update(projects)
    .set(update)
    .where(eq(projects._id, projectId))
    .returning();
  if (!project) return res.status(404).json({ error: "Project not found" });

  await logAudit({ userId: req.user!.userId, action: "project.update", resourceType: "project", resourceId: projectId, metadata: { fields: Object.keys(update), approvalStatus: data.approvalStatus, isVerified: data.isVerified } });
  res.json({ project });
});

// DELETE /api/admin/projects/:id — permanently delete ANY project (admin only).
// Removes the project and every dependent row (units, leads, visits,
// commissions, enquiries, shared docs, assets, legal docs). This cannot be
// undone, so it is gated to ADMIN.
router.delete("/projects/:id", requireRole("ADMIN"), async (req: AuthedRequest, res) => {
  const projectId = req.params.id;
  if (!isValidId(projectId)) return res.status(404).json({ error: "Project not found" });

  const db = getDb();
  const [existing] = await db.select().from(projects).where(eq(projects._id, projectId));
  if (!existing) return res.status(404).json({ error: "Project not found" });

  // Delete every dependent row before the project itself. Postgres enforces the
  // foreign keys, so a single missed child table (e.g. a lead's CRM
  // activities/follow-ups/tasks) makes the whole delete fail with a FK
  // violation — which is exactly the error this endpoint used to raise. The
  // work runs inside ONE transaction so a partial delete can never leave
  // orphaned units/leads behind (those orphans inflated the dashboard counts).
  try {
    await db.transaction(async (tx) => {
      const projectLeads = await tx.select({ _id: leads._id }).from(leads).where(eq(leads.projectId, projectId));
      const leadIds = projectLeads.map((l) => l._id);
      if (leadIds.length) {
        await tx.delete(commissions).where(inArray(commissions.leadId, leadIds));
        await tx.delete(siteVisits).where(inArray(siteVisits.leadId, leadIds));
        await tx.delete(leadActivities).where(inArray(leadActivities.leadId, leadIds));
        await tx.delete(leadFollowUps).where(inArray(leadFollowUps.leadId, leadIds));
        await tx.delete(crmTasks).where(inArray(crmTasks.leadId, leadIds));
      }
      await tx.delete(siteVisits).where(eq(siteVisits.projectId, projectId));
      await tx.delete(leads).where(eq(leads.projectId, projectId));
      await tx.delete(units).where(eq(units.projectId, projectId));
      await tx.delete(projectAssets).where(eq(projectAssets.projectId, projectId));
      await tx.delete(sharedDocuments).where(eq(sharedDocuments.projectId, projectId));
      await tx.delete(enquiries).where(eq(enquiries.projectId, projectId));
      await tx.delete(legalDocuments).where(eq(legalDocuments.projectId, projectId));
      await tx.delete(financeEntries).where(eq(financeEntries.projectId, projectId));
      await tx.delete(projects).where(eq(projects._id, projectId));
    });
  } catch (err) {
    console.error("Failed to delete project", projectId, err);
    return res.status(500).json({ error: "Could not delete project — please retry." });
  }

  await logAudit({ userId: req.user!.userId, action: "project.delete", resourceType: "project", resourceId: projectId, metadata: { name: existing.name, city: existing.city } });
  res.json({ ok: true, deleted: existing.name });
});

// Cached platform-fee for any synchronous caller; kept in sync on read/write.
let cachedFeePercent = DEFAULT_PLATFORM_FEE_PERCENT;

/** Ensure the single platform-settings row exists and return it. */
async function loadSettings(): Promise<IPlatformSettings> {
  const db = getDb();
  const [row] = await db.select().from(platformSettings).limit(1);
  if (row) return row;
  const [created] = await db.insert(platformSettings).values({}).returning();
  return created;
}

function settingsResponse(s: IPlatformSettings) {
  cachedFeePercent = s.platformFeePercent;
  return {
    platformFeePercent: s.platformFeePercent,
    gstPercent: s.gstPercent,
    defaultCommissionPercent: s.defaultCommissionPercent,
    notifications: { email: s.notifyEmail, sms: s.notifySms, whatsapp: s.notifyWhatsapp },
    // Read-only integration status derived from server env (never the secrets),
    // so admins can see at a glance what's wired up.
    integrations: {
      razorpay: Boolean(process.env.RAZORPAY_KEY_ID),
      email: Boolean(process.env.SMTP_HOST),
      sms: Boolean(process.env.TWILIO_ACCOUNT_SID),
      ai: Boolean(process.env.ANTHROPIC_API_KEY),
    },
  };
}

router.get("/settings", requireRole("ADMIN", "DEVELOPER", "CP"), async (_req, res) => {
  res.json(settingsResponse(await loadSettings()));
});

const settingsPatchSchema = z.object({
  platformFeePercent: z.number().min(0).max(100).optional(),
  gstPercent: z.number().min(0).max(100).optional(),
  defaultCommissionPercent: z.number().min(0).max(100).optional(),
  notifications: z
    .object({ email: z.boolean().optional(), sms: z.boolean().optional(), whatsapp: z.boolean().optional() })
    .optional(),
});

router.patch("/settings", requireRole("ADMIN"), async (req: AuthedRequest, res) => {
  const parsed = settingsPatchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });
  const d = parsed.data;

  const current = await loadSettings();
  const update: Partial<IPlatformSettings> = { updatedAt: new Date() };
  if (d.platformFeePercent !== undefined) update.platformFeePercent = d.platformFeePercent;
  if (d.gstPercent !== undefined) update.gstPercent = d.gstPercent;
  if (d.defaultCommissionPercent !== undefined) update.defaultCommissionPercent = d.defaultCommissionPercent;
  if (d.notifications?.email !== undefined) update.notifyEmail = d.notifications.email;
  if (d.notifications?.sms !== undefined) update.notifySms = d.notifications.sms;
  if (d.notifications?.whatsapp !== undefined) update.notifyWhatsapp = d.notifications.whatsapp;

  const db = getDb();
  const [saved] = await db.update(platformSettings).set(update).where(eq(platformSettings._id, current._id)).returning();
  void logAudit({ userId: req.user!.userId, action: "settings.update", resourceType: "settings", metadata: { fields: Object.keys(d) } });
  res.json(settingsResponse(saved));
});

export function getPlatformFeePercent(): number {
  return cachedFeePercent;
}

// ── CP identity (KYC) review ────────────────────────────────────────────────

// GET /api/admin/kyc/pending — submissions awaiting manual review. Any account
// that submitted KYC is included regardless of role (CP, Ambassador, Developer,
// …). kycStatus is only set once a user actually submits, so the PENDING filter
// alone is enough — no role restriction, otherwise non-CP submissions would be
// silently dropped and the queue would look empty even with real submissions.
router.get("/kyc/pending", requireRole("ADMIN"), async (_req, res) => {
  const db = getDb();
  const rows = await db
    .select({
      _id: users._id,
      name: users.name,
      email: users.email,
      phone: users.phone,
      role: users.role,
      onboardingChecks: users.onboardingChecks,
      verification: users.verification,
    })
    .from(users);

  const pending = rows
    .filter((u) => u.onboardingChecks?.kycStatus === "PENDING")
    .map((u) => ({
      _id: u._id,
      name: u.name,
      email: u.email,
      phone: u.phone,
      role: u.role,
      panNumberMasked: u.verification?.panNumberMasked ?? null,
      // Presence flags only — the actual images are fetched through the
      // authenticated file route below, never exposed as public URLs.
      hasAadhaar: Boolean(u.verification?.kycFiles?.aadhaar),
      hasPan: Boolean(u.verification?.kycFiles?.pan),
      hasSelfie: Boolean(u.verification?.kycFiles?.selfie),
      submittedAt: u.verification?.kycSubmittedAt ?? null,
    }));

  res.json({ submissions: pending });
});

// GET /api/admin/kyc/:userId/file/:type — stream a KYC document to an admin.
// This is the ONLY way to view identity docs; they are not statically served.
router.get("/kyc/:userId/file/:type", requireRole("ADMIN"), async (req: AuthedRequest, res) => {
  const userId = String(req.params.userId);
  const type = String(req.params.type);
  if (!isValidId(userId)) return res.status(404).json({ error: "Not found" });
  if (!["aadhaar", "pan", "selfie"].includes(type)) return res.status(400).json({ error: "Bad type" });

  const db = getDb();
  const [user] = await db.select({ verification: users.verification }).from(users).where(eq(users._id, userId));
  const entry = user?.verification?.kycFiles?.[type as "aadhaar" | "pan" | "selfie"];
  if (!entry) return res.status(404).json({ error: "Not found" });

  const filePath = path.join(kycDir, entry.file);
  // Guard against path traversal — the resolved path must stay inside kycDir.
  if (!path.resolve(filePath).startsWith(path.resolve(kycDir)) || !fs.existsSync(filePath)) {
    return res.status(404).json({ error: "Not found" });
  }
  res.setHeader("Content-Type", entry.mime || "application/octet-stream");
  res.setHeader("Cache-Control", "private, no-store");
  fs.createReadStream(filePath).pipe(res);
});

const kycDecisionSchema = z.object({ approve: z.boolean(), reason: z.string().max(300).optional() });

// POST /api/admin/kyc/:userId/decision — approve or reject a submission.
router.post("/kyc/:userId/decision", requireRole("ADMIN"), async (req: AuthedRequest, res) => {
  const { userId } = req.params;
  if (!isValidId(userId)) return res.status(404).json({ error: "User not found" });
  const parsed = kycDecisionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });

  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users._id, userId));
  if (!user) return res.status(404).json({ error: "User not found" });

  const { approve, reason } = parsed.data;
  const onboardingChecks: OnboardingChecks = {
    ...(user.onboardingChecks ?? DEFAULT_ONBOARDING_CHECKS),
    aadhaarVerified: approve,
    panVerified: approve,
    kycStatus: approve ? "APPROVED" : "REJECTED",
    kycRejectionReason: approve ? null : reason ?? "Documents could not be verified.",
  };
  const onboardingVerified = isOnboardingComplete(onboardingChecks);

  // Data-retention minimisation: once a decision is made we no longer need the
  // raw identity images. Delete the files from disk and drop the references.
  const kycFiles = user.verification?.kycFiles;
  if (kycFiles) {
    for (const entry of Object.values(kycFiles)) {
      if (!entry?.file) continue;
      const p = path.join(kycDir, entry.file);
      if (path.resolve(p).startsWith(path.resolve(kycDir))) fs.promises.unlink(p).catch(() => null);
    }
  }
  const verification: UserVerification = { ...(user.verification ?? {}), kycFiles: undefined };

  await db
    .update(users)
    .set({ onboardingChecks, onboardingVerified, verification })
    .where(eq(users._id, user._id));

  // Tell the CP the outcome in real time.
  try {
    const message = approve
      ? "Your identity has been verified — full access is now unlocked."
      : `Your identity verification was rejected. ${onboardingChecks.kycRejectionReason ?? ""} Please re-submit.`;
    const [n] = await db.insert(notifications).values({ userId: user._id, message }).returning();
    emitNotification(String(user._id), n);
  } catch {
    /* non-fatal */
  }

  await logAudit({ userId: req.user!.userId, action: approve ? "kyc.approve" : "kyc.reject", resourceType: "user", resourceId: String(user._id), metadata: { reason: approve ? undefined : reason } });
  res.json({ ok: true, userId: user._id, kycStatus: onboardingChecks.kycStatus, onboardingVerified });
});

// ---------------------------------------------------------------------------
// Documents console — every uploaded document across the platform in one list
// so an admin can review and approve/reject each. Aggregates four sources:
//   BUYER  → buyerDocuments  (buyer KYC: ID / address / income proof)
//   LEGAL  → legalDocuments  (RERA cert, approvals, NOCs, title docs)
//   ASSET  → projectAssets   (developer Vault uploads)
//   SHARED → sharedDocuments (brochures, floor plans, price lists)
// Each row carries a normalised status so the UI is uniform regardless of the
// underlying table's own state model.
// ---------------------------------------------------------------------------

type DocStatus = "APPROVED" | "PENDING" | "REJECTED";
type DocSource = "BUYER" | "LEGAL" | "ASSET" | "SHARED";
interface AdminDocument {
  _id: string;
  source: DocSource;
  category: string;
  fileName: string;
  fileUrl: string;
  status: DocStatus;
  approvable: boolean;
  uploader: { name: string; role: string } | null;
  project: { name: string } | null;
  createdAt: Date | null;
}

// GET /api/admin/documents — unified list of every document, newest first.
router.get("/documents", requireRole("ADMIN"), async (_req, res) => {
  const db = getDb();

  const [buyerRows, legalRows, assetRows, sharedRows] = await Promise.all([
    db
      .select({ doc: buyerDocuments, uploader: { name: users.name, role: users.role } })
      .from(buyerDocuments)
      .leftJoin(users, eq(buyerDocuments.buyerId, users._id)),
    db
      .select({ doc: legalDocuments, project: { name: projects.name }, uploader: { name: users.name, role: users.role } })
      .from(legalDocuments)
      .leftJoin(projects, eq(legalDocuments.projectId, projects._id))
      .leftJoin(users, eq(legalDocuments.uploadedById, users._id)),
    db
      .select({ doc: projectAssets, project: { name: projects.name }, uploader: { name: users.name, role: users.role } })
      .from(projectAssets)
      .leftJoin(projects, eq(projectAssets.projectId, projects._id))
      .leftJoin(users, eq(projectAssets.uploadedBy, users._id)),
    db
      .select({ doc: sharedDocuments, project: { name: projects.name }, uploader: { name: users.name, role: users.role } })
      .from(sharedDocuments)
      .leftJoin(projects, eq(sharedDocuments.projectId, projects._id))
      .leftJoin(users, eq(sharedDocuments.uploadedById, users._id)),
  ]);

  const docs: AdminDocument[] = [];

  for (const r of buyerRows) {
    docs.push({
      _id: r.doc._id,
      source: "BUYER",
      category: r.doc.docType.replace(/_/g, " "),
      fileName: r.doc.fileName,
      fileUrl: r.doc.fileUrl,
      status: r.doc.status === "VERIFIED" ? "APPROVED" : r.doc.status === "REJECTED" ? "REJECTED" : "PENDING",
      approvable: true,
      uploader: r.uploader?.name ? { name: r.uploader.name, role: r.uploader.role } : null,
      project: null,
      createdAt: r.doc.createdAt,
    });
  }
  for (const r of legalRows) {
    docs.push({
      _id: r.doc._id,
      source: "LEGAL",
      category: r.doc.docType,
      fileName: r.doc.fileName,
      fileUrl: r.doc.fileUrl,
      status: r.doc.verified ? "APPROVED" : "PENDING",
      approvable: true,
      uploader: r.uploader?.name ? { name: r.uploader.name, role: r.uploader.role } : null,
      project: r.project?.name ? { name: r.project.name } : null,
      createdAt: r.doc.createdAt,
    });
  }
  for (const r of assetRows) {
    docs.push({
      _id: r.doc._id,
      source: "ASSET",
      category: r.doc.category.replace(/_/g, " "),
      fileName: r.doc.fileName,
      fileUrl: r.doc.fileUrl,
      status: r.doc.verified ? "APPROVED" : "PENDING",
      approvable: true,
      uploader: r.uploader?.name ? { name: r.uploader.name, role: r.uploader.role } : null,
      project: r.project?.name ? { name: r.project.name } : null,
      createdAt: r.doc.createdAt,
    });
  }
  for (const r of sharedRows) {
    docs.push({
      _id: r.doc._id,
      source: "SHARED",
      category: r.doc.fileType.replace(/_/g, " "),
      fileName: r.doc.fileName,
      fileUrl: r.doc.fileUrl,
      status: "APPROVED",
      approvable: false, // brochures/price lists have no gated state
      uploader: r.uploader?.name ? { name: r.uploader.name, role: r.uploader.role } : null,
      project: r.project?.name ? { name: r.project.name } : null,
      createdAt: r.doc.createdAt,
    });
  }

  docs.sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
  res.json({ documents: docs });
});

// PATCH /api/admin/documents/:source/:id — approve or reject one document.
const docDecisionSchema = z.object({ status: z.enum(["APPROVED", "REJECTED"]) });
router.patch("/documents/:source/:id", requireRole("ADMIN"), async (req: AuthedRequest, res) => {
  const source = req.params.source as DocSource;
  const id = req.params.id;
  if (!isValidId(id)) return res.status(404).json({ error: "Document not found" });
  const parsed = docDecisionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });
  const approve = parsed.data.status === "APPROVED";

  const db = getDb();
  let ok = false;
  if (source === "BUYER") {
    const [row] = await db.update(buyerDocuments).set({ status: approve ? "VERIFIED" : "REJECTED" }).where(eq(buyerDocuments._id, id)).returning({ _id: buyerDocuments._id });
    ok = Boolean(row);
  } else if (source === "LEGAL") {
    const [row] = await db.update(legalDocuments).set({ verified: approve, verifiedById: req.user!.userId, verifiedAt: new Date() }).where(eq(legalDocuments._id, id)).returning({ _id: legalDocuments._id });
    ok = Boolean(row);
  } else if (source === "ASSET") {
    const [row] = await db.update(projectAssets).set({ verified: approve }).where(eq(projectAssets._id, id)).returning({ _id: projectAssets._id });
    ok = Boolean(row);
  } else {
    return res.status(400).json({ error: "This document type has no approval state" });
  }

  if (!ok) return res.status(404).json({ error: "Document not found" });
  await logAudit({ userId: req.user!.userId, action: approve ? "document.approve" : "document.reject", resourceType: "document", resourceId: id, metadata: { source } });
  res.json({ ok: true, status: parsed.data.status });
});

export default router;
