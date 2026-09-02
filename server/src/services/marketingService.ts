import { and, desc, eq, gte, sql } from "drizzle-orm";
import { getDb } from "../config/db";
import {
  marketingAccess,
  marketingExpenses,
  marketingLeads,
  marketingPartnerCampaigns,
  type IMarketingAccess,
} from "../db/schema";

/** Fetch a user's marketing access row (or null). */
export async function getAccess(userId: string): Promise<IMarketingAccess | null> {
  const db = getDb();
  const [row] = await db.select().from(marketingAccess).where(eq(marketingAccess.userId, userId)).limit(1);
  return row ?? null;
}

/** Sum a paise column for a user, coalescing null → 0. */
async function sumPaise(table: typeof marketingExpenses, col: "amountPaise", userId: string): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ total: sql<number>`COALESCE(SUM(${table[col]}), 0)::int` })
    .from(table)
    .where(eq(table.userId, userId));
  return Number(row?.total ?? 0);
}

export interface MarketingDashboard {
  access: {
    packageName: string;
    status: string;
    validFrom: string | null;
    validUntil: string | null;
    budgetPaise: number;
  } | null;
  cards: {
    totalSpendPaise: number;
    totalUsedPaise: number;
    remainingPaise: number;
    todaysLeads: number;
    totalLeads: number;
    leadsGenerated: number;
    campaigns: number;
    qualifiedLeads: number;
    convertedLeads: number;
    pendingLeads: number;
  };
  expenses: (typeof marketingExpenses.$inferSelect)[];
  leads: (typeof marketingLeads.$inferSelect)[];
  campaigns: (typeof marketingPartnerCampaigns.$inferSelect)[];
}

/**
 * Everything the Marketing Dashboard needs for one partner. All money in paise.
 * "Total Marketing Spend" is the purchased budget; "Total Amount Used" is the
 * sum of tracked expenses; "Remaining Budget" is the difference (never below 0).
 */
export async function getMarketingDashboard(userId: string): Promise<MarketingDashboard> {
  const db = getDb();
  const access = await getAccess(userId);

  const budgetPaise = access?.budgetPaise ?? 0;
  const totalUsedPaise = await sumPaise(marketingExpenses, "amountPaise", userId);

  // Lead counts by status + today.
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const [leadStats] = await db
    .select({
      total: sql<number>`COUNT(*)::int`,
      qualified: sql<number>`COUNT(*) FILTER (WHERE ${marketingLeads.status} = 'QUALIFIED')::int`,
      converted: sql<number>`COUNT(*) FILTER (WHERE ${marketingLeads.status} = 'CONVERTED')::int`,
      pending: sql<number>`COUNT(*) FILTER (WHERE ${marketingLeads.status} = 'PENDING')::int`,
    })
    .from(marketingLeads)
    .where(eq(marketingLeads.userId, userId));
  const [todayStat] = await db
    .select({ today: sql<number>`COUNT(*)::int` })
    .from(marketingLeads)
    .where(and(eq(marketingLeads.userId, userId), gte(marketingLeads.createdAt, startOfDay)));
  const [campaignStat] = await db
    .select({ n: sql<number>`COUNT(*)::int` })
    .from(marketingPartnerCampaigns)
    .where(eq(marketingPartnerCampaigns.userId, userId));

  const expenses = await db
    .select()
    .from(marketingExpenses)
    .where(eq(marketingExpenses.userId, userId))
    .orderBy(desc(marketingExpenses.spentAt))
    .limit(100);
  const leads = await db
    .select()
    .from(marketingLeads)
    .where(eq(marketingLeads.userId, userId))
    .orderBy(desc(marketingLeads.createdAt))
    .limit(100);
  const campaigns = await db
    .select()
    .from(marketingPartnerCampaigns)
    .where(eq(marketingPartnerCampaigns.userId, userId))
    .orderBy(desc(marketingPartnerCampaigns.createdAt))
    .limit(100);

  const converted = Number(leadStats?.converted ?? 0);
  return {
    access: access
      ? {
          packageName: access.packageName,
          status: access.status,
          validFrom: access.validFrom ? new Date(access.validFrom).toISOString() : null,
          validUntil: access.validUntil ? new Date(access.validUntil).toISOString() : null,
          budgetPaise,
        }
      : null,
    cards: {
      totalSpendPaise: budgetPaise,
      totalUsedPaise,
      remainingPaise: Math.max(0, budgetPaise - totalUsedPaise),
      todaysLeads: Number(todayStat?.today ?? 0),
      totalLeads: Number(leadStats?.total ?? 0),
      // "Leads generated" = leads that progressed to conversion.
      leadsGenerated: converted,
      campaigns: Number(campaignStat?.n ?? 0),
      qualifiedLeads: Number(leadStats?.qualified ?? 0),
      convertedLeads: converted,
      pendingLeads: Number(leadStats?.pending ?? 0),
    },
    expenses,
    leads,
    campaigns,
  };
}
