import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { getDb } from "../config/db";
import { payments, subscriptions, users } from "../db/schema";
import { getPlan, intervalEnd } from "../config/pricing";
import { authenticate, requireRole, AuthedRequest } from "../middleware/auth";

/**
 * Developer OS entitlements — the single source of truth for which paid tools a
 * developer has unlocked. Unlike the CP CRM (one linear tier ladder), a
 * developer buys independent add-ons: the Verified Badge, Developer CRM, AI
 * Analytics and the fully-managed Marketing Campaign are all separate SKUs, and
 * Developer Pro unlocks everything at once.
 *
 * The client mirrors this shape in `lib/devEntitlements.ts` and gates dashboard
 * sections on the individual booleans (see PART 2 of the product spec:
 * FREE users see the basic dashboard, CRM users unlock the pipeline/team tools,
 * AI users unlock the analytics intelligence).
 */

export type DeveloperPlanTier = "FREE" | "VERIFIED" | "CRM" | "AI" | "PRO";

// Plan-id groupings (must match server/src/config/pricing.ts).
const VERIFIED_PLAN_IDS = new Set(["dev_verified_badge"]);
const CRM_PLAN_IDS = new Set(["dev_crm"]);
const AI_PLAN_IDS = new Set(["dev_ai_analytics"]);
const THREE_D_PLAN_IDS = new Set(["dev_3d_mapping"]);
const CAMPAIGN_PLAN_IDS = new Set(["dev_marketing_campaign"]);
const PRO_PLAN_IDS = new Set(["dev_pro_monthly", "dev_pro_yearly"]);

export interface DeveloperEntitlement {
  /** Highest label the developer qualifies for — used for the header chip. */
  tier: DeveloperPlanTier;
  verified: boolean; // Verified Developer Badge + prime listing (trust)
  crm: boolean; // Developer CRM — pipeline mgmt, notes, tasks, team, finance
  ai: boolean; // AI Analytics — demand, pricing, competitor, forecasts
  campaign: boolean; // Fully-managed marketing campaign purchased
  threeDMapping: boolean; // 3D mapping add-on
  pro: boolean; // Developer Pro — unlocks everything
  /** Nearest expiry across the developer's active paid plans (null = lifetime). */
  expiresAt: string | null;
}

export function freeDeveloperEntitlement(): DeveloperEntitlement {
  return { tier: "FREE", verified: false, crm: false, ai: false, campaign: false, threeDMapping: false, pro: false, expiresAt: null };
}

export async function resolveDeveloperEntitlement(userId: string): Promise<DeveloperEntitlement> {
  const db = getDb();
  const now = Date.now();

  const [pays, subs] = await Promise.all([
    db.select().from(payments).where(and(eq(payments.userId, userId), eq(payments.status, "PAID"))),
    db.select().from(subscriptions).where(and(eq(subscriptions.userId, userId), eq(subscriptions.status, "ACTIVE"))),
  ]);

  const ent = freeDeveloperEntitlement();
  // Track the soonest expiry among the plans that grant an active flag.
  let soonestExpiry: number | null = null;
  const noteExpiry = (ends: Date | null) => {
    if (!ends) return; // lifetime plan — never narrows the window
    const t = ends.getTime();
    soonestExpiry = soonestExpiry === null ? t : Math.min(soonestExpiry, t);
  };

  const consider = (planId: string, ends: Date | null) => {
    if (ends && ends.getTime() < now) return; // expired — ignore
    if (PRO_PLAN_IDS.has(planId)) {
      ent.pro = true;
      ent.verified = ent.crm = ent.ai = ent.campaign = ent.threeDMapping = true;
      noteExpiry(ends);
    } else if (AI_PLAN_IDS.has(planId)) {
      ent.ai = true;
      noteExpiry(ends);
    } else if (CRM_PLAN_IDS.has(planId)) {
      ent.crm = true;
      noteExpiry(ends);
    } else if (VERIFIED_PLAN_IDS.has(planId)) {
      ent.verified = true;
      noteExpiry(ends);
    } else if (CAMPAIGN_PLAN_IDS.has(planId)) {
      ent.campaign = true;
      noteExpiry(ends);
    } else if (THREE_D_PLAN_IDS.has(planId)) {
      ent.threeDMapping = true;
      noteExpiry(ends);
    }
  };

  for (const p of pays) consider(p.planId, intervalEnd(p.createdAt, getPlan(p.planId)?.interval));
  for (const s of subs) consider(s.internalPlanId, intervalEnd(s.createdAt, s.interval));

  // Highest-label tier for the header chip.
  if (ent.pro) ent.tier = "PRO";
  else if (ent.ai) ent.tier = "AI";
  else if (ent.crm) ent.tier = "CRM";
  else if (ent.verified) ent.tier = "VERIFIED";
  else ent.tier = "FREE";

  ent.expiresAt = soonestExpiry === null ? null : new Date(soonestExpiry).toISOString();
  return ent;
}

const router = Router();
router.use(authenticate);
router.use(requireRole("DEVELOPER"));

/** Tells the developer dashboard which paid tools are unlocked. */
router.get("/entitlement", async (req: AuthedRequest, res) => {
  // A user row lookup keeps parity with the CP resolver and lets us fail
  // gracefully (free tier) if the account was removed mid-session.
  const db = getDb();
  const [user] = await db.select({ _id: users._id }).from(users).where(eq(users._id, req.user!.userId)).limit(1);
  if (!user) return res.json({ entitlement: freeDeveloperEntitlement() });

  const entitlement = await resolveDeveloperEntitlement(req.user!.userId);
  res.json({ entitlement });
});

export default router;
