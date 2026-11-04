import "dotenv/config";
import Razorpay from "razorpay";
import { connectDb, closeDb } from "../db";
import { subscriptionPlans } from "../db/schema";
import { eq } from "drizzle-orm";
import { getEnv, isRazorpayConfigured } from "../config/env";
import { getSubscriptionPlans, razorpayPeriod, withGst } from "../config/pricing";

/**
 * Creates a Razorpay Plan for every subscription tier (Buyer/CP/Developer Pro,
 * monthly + yearly) and stores the resulting `plan_id` in the
 * `subscription_plans` table. The amount uses configured tax treatment (zero unless enabled and approved).
 *
 * Idempotent: a stored plan is reused only when its recorded amount matches
 * the currently approved price. If tax configuration changes, a new Razorpay
 * plan is created and the internal mapping is moved to it. Razorpay plans cannot
 * be deleted; existing customer subscriptions remain attached to their old plan.
 *
 * Run with:  npm --prefix server run razorpay:plans
 */
async function run() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL is not set. Add it to server/.env first.");
  if (!isRazorpayConfigured()) throw new Error("RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are not set in server/.env.");

  const env = getEnv();
  const rzp = new Razorpay({ key_id: env.razorpayKeyId, key_secret: env.razorpayKeySecret });
  const db = connectDb(url);
  await db.execute("select 1");

  for (const plan of getSubscriptionPlans()) {
    const [existing] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.internalPlanId, plan.id));
    const amount = withGst(plan.pricePaise, env.gstPercent);
    if (existing?.razorpayPlanId && Number(existing.amountPaise) === amount) {
      console.log(`✓ ${plan.id} already mapped → ${existing.razorpayPlanId} (₹${(amount / 100).toLocaleString("en-IN")}, unchanged)`);
      continue;
    }
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new Error(
        `Computed a bad amount (${amount}) for ${plan.id}. Check the approved GST_COLLECTION_ENABLED, GSTIN and GST_PERCENT server configuration.`
      );
    }
    const created = await rzp.plans.create({
      period: razorpayPeriod(plan.interval),
      interval: 1,
      item: {
        name: plan.label,
        amount, // paise
        currency: "INR",
        description: env.gstPercent > 0
          ? `${plan.label} — Truvi Ventures (incl. ${env.gstPercent}% GST)`
          : `${plan.label} — Truvi Ventures`,
      },
    });

    await db
      .insert(subscriptionPlans)
      .values({ internalPlanId: plan.id, razorpayPlanId: created.id, amountPaise: amount })
      .onConflictDoUpdate({
        target: subscriptionPlans.internalPlanId,
        set: { razorpayPlanId: created.id, amountPaise: amount },
      });

    console.log(`＋ ${plan.id} → ${created.id}  (₹${(amount / 100).toLocaleString("en-IN")}/${plan.interval})`);
    if (existing?.razorpayPlanId) {
      console.warn(`  Previous plan ${existing.razorpayPlanId} was not deleted. Existing active subscriptions remain on that plan until they are separately reviewed and migrated with appropriate customer notice/consent.`);
    }
  }

  console.log("\nDone. Subscription plans are ready — the Subscribe buttons will now charge.");
  await closeDb();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
