import { User } from "../models/User";
import { Project } from "../models/Project";
import { Unit } from "../models/Unit";
import { Lead } from "../models/Lead";
import { Commission } from "../models/Commission";
import { LeadPurchase } from "../models/LeadPurchase";
import { VerificationTask } from "../models/VerificationTask";

/**
 * Founder OS — Phase 1 automated problem detection.
 *
 * Rule-based (deterministic, no AI): every alert is computed from live
 * collections and carries a plain-language recommended action. Phase 2
 * layers the Anthropic-generated Founder Brief on top of this output.
 */

export type AlertSeverity = "HIGH" | "MEDIUM" | "LOW";

export interface FounderAlert {
  id: string;
  severity: AlertSeverity;
  title: string;
  detail: string;
  action: string;
}

const DAY = 24 * 60 * 60 * 1000;

export async function detectFounderAlerts(): Promise<FounderAlert[]> {
  const now = Date.now();
  const alerts: FounderAlert[] = [];

  const [
    staleLeads,
    pendingApprovals,
    monthlyRevenue,
    coldProjects,
    inactiveCps,
    pendingPayouts,
    expiredLockedTasks,
  ] = await Promise.all([
    // Leads sitting in an active stage with no movement for 7+ days
    Lead.countDocuments({
      stage: { $nin: ["REGISTRATION", "LOST"] },
      updatedAt: { $lt: new Date(now - 7 * DAY) },
    }),

    // Developer/CP accounts waiting on approval for 3+ days
    User.countDocuments({
      role: { $in: ["DEVELOPER", "CP"] },
      approvalStatus: "PENDING",
      createdAt: { $lt: new Date(now - 3 * DAY) },
    }),

    // Platform revenue for this month vs last month (fees + lead sales)
    (async () => {
      const startOfThis = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
      const startOfLast = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1);
      const [feeThis, feeLast, lpThis, lpLast] = await Promise.all([
        Commission.aggregate([{ $match: { createdAt: { $gte: startOfThis } } }, { $group: { _id: null, v: { $sum: "$platformFeeAmount" } } }]),
        Commission.aggregate([{ $match: { createdAt: { $gte: startOfLast, $lt: startOfThis } } }, { $group: { _id: null, v: { $sum: "$platformFeeAmount" } } }]),
        LeadPurchase.aggregate([{ $match: { createdAt: { $gte: startOfThis } } }, { $group: { _id: null, v: { $sum: "$amountPaid" } } }]),
        LeadPurchase.aggregate([{ $match: { createdAt: { $gte: startOfLast, $lt: startOfThis } } }, { $group: { _id: null, v: { $sum: "$amountPaid" } } }]),
      ]);
      return {
        thisMonth: (feeThis[0]?.v ?? 0) + (lpThis[0]?.v ?? 0),
        lastMonth: (feeLast[0]?.v ?? 0) + (lpLast[0]?.v ?? 0),
      };
    })(),

    // Approved projects with no leads in the last 14 days
    (async () => {
      const activeProjectIds = await Lead.distinct("projectId", { createdAt: { $gte: new Date(now - 14 * DAY) } });
      return Project.find({ approvalStatus: "APPROVED", _id: { $nin: activeProjectIds } })
        .select("name city")
        .limit(5)
        .lean();
    })(),

    // High-value CPs (2+ bookings) with no lead activity in 21 days
    (async () => {
      const activeCpIds = await Lead.distinct("assignedToId", { updatedAt: { $gte: new Date(now - 21 * DAY) } });
      return User.countDocuments({
        role: "CP",
        approvalStatus: "APPROVED",
        "cpProfile.totalBookings": { $gte: 2 },
        _id: { $nin: activeCpIds },
      });
    })(),

    // Completed verification tasks with an unpaid ₹500 payout
    VerificationTask.countDocuments({ status: "RED", payoutStatus: "PENDING" }),

    // Yellow tasks whose 6-hour lock has expired (need the sweep / follow-up)
    VerificationTask.countDocuments({ status: "YELLOW", lockExpiresAt: { $lt: new Date() } }),
  ]);

  if (staleLeads > 0) {
    alerts.push({
      id: "stale-leads",
      severity: staleLeads >= 10 ? "HIGH" : "MEDIUM",
      title: `${staleLeads} lead${staleLeads > 1 ? "s" : ""} stuck with no movement for 7+ days`,
      detail: "Leads in active pipeline stages haven't been updated in over a week — deals are cooling.",
      action: "Ask the assigned CPs for a status update today, or reassign the oldest leads to active partners.",
    });
  }

  if (pendingApprovals > 0) {
    alerts.push({
      id: "aging-approvals",
      severity: pendingApprovals >= 5 ? "HIGH" : "MEDIUM",
      title: `${pendingApprovals} account approval${pendingApprovals > 1 ? "s" : ""} waiting 3+ days`,
      detail: "Developers or Channel Partners signed up but are still un-reviewed — you may be losing supply.",
      action: "Clear the approval queue in Admin → Dashboard; aim for a same-day approval SLA.",
    });
  }

  if (monthlyRevenue.lastMonth > 0) {
    const change = ((monthlyRevenue.thisMonth - monthlyRevenue.lastMonth) / monthlyRevenue.lastMonth) * 100;
    if (change <= -20) {
      alerts.push({
        id: "revenue-drop",
        severity: "HIGH",
        title: `Platform revenue is down ${Math.abs(Math.round(change))}% month-over-month`,
        detail: `₹${Math.round(monthlyRevenue.thisMonth).toLocaleString("en-IN")} so far this month vs ₹${Math.round(monthlyRevenue.lastMonth).toLocaleString("en-IN")} last month.`,
        action: "Check the funnel panel for the leaking stage, and review whether commission-generating bookings slowed or lead-marketplace purchases dried up.",
      });
    }
  }

  if (coldProjects.length > 0) {
    alerts.push({
      id: "cold-projects",
      severity: coldProjects.length >= 3 ? "HIGH" : "MEDIUM",
      title: `${coldProjects.length} live project${coldProjects.length > 1 ? "s" : ""} with zero new leads in 14 days`,
      detail: coldProjects.map((p) => `${p.name} (${p.city})`).join(", "),
      action: "Consider making these Featured/Prime on the Inventory page, or push them to CPs via the marketplace.",
    });
  }

  if (inactiveCps > 0) {
    alerts.push({
      id: "inactive-cps",
      severity: "MEDIUM",
      title: `${inactiveCps} proven Channel Partner${inactiveCps > 1 ? "s are" : " is"} inactive for 3 weeks`,
      detail: "Partners with 2+ historical bookings have no lead activity in 21 days — your best sellers are drifting.",
      action: "Personally reach out to re-engage them; offer premium leads or a spotlight in the marketplace.",
    });
  }

  if (pendingPayouts > 0) {
    alerts.push({
      id: "ambassador-payouts",
      severity: pendingPayouts >= 5 ? "MEDIUM" : "LOW",
      title: `${pendingPayouts} ambassador payout${pendingPayouts > 1 ? "s" : ""} pending (₹${(pendingPayouts * 500).toLocaleString("en-IN")})`,
      detail: "Completed verification tasks are waiting on their ₹500 payment — slow payouts hurt ambassador trust.",
      action: "Settle payouts from the Founder OS ambassador panel and mark them paid.",
    });
  }

  if (expiredLockedTasks > 0) {
    alerts.push({
      id: "expired-task-locks",
      severity: "LOW",
      title: `${expiredLockedTasks} verification task${expiredLockedTasks > 1 ? "s" : ""} timed out (6h lock expired)`,
      detail: "Ambassadors accepted these site-verification tasks but didn't finish within the window.",
      action: "They've returned to the available pool automatically; consider extending deadlines or checking task difficulty.",
    });
  }

  // Fully-sold-out check — a growth signal rather than a problem
  const sellableUnits = await Unit.countDocuments({ status: "AVAILABLE" });
  if (sellableUnits === 0) {
    const totalUnits = await Unit.estimatedDocumentCount();
    if (totalUnits > 0) {
      alerts.push({
        id: "no-inventory",
        severity: "HIGH",
        title: "No available units left on the platform",
        detail: "Every unit is locked, reserved or sold — buyers arriving now have nothing to buy.",
        action: "Onboard new developer inventory this week; fast-track pending project approvals.",
      });
    }
  }

  const order: Record<AlertSeverity, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  return alerts.sort((a, b) => order[a.severity] - order[b.severity]);
}
