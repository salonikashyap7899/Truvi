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
 * `subscription_plans` table. The amount includes only tax configured after CA review.
 *
 * Idempotent at the amount level: a matching plan is skipped. If the tax or
 * price changes, a new provider plan is created and the internal mapping is
 * updated. Existing active subscriptions retain their original provider plan.
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
    const amount = withGst(plan.pricePaise, env.gstPercent); // paise, including configured tax only
    const [existing] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.internalPlanId, plan.id));
    if (existing?.razorpayPlanId && existing.amountPaise === amount) {
      console.log(`✓ ${plan.id} already mapped to the current amount → ${existing.razorpayPlanId} (skipped)`);
      continue;
    }
    if (existing?.razorpayPlanId) {
      console.warn(`! ${plan.id} amount changed from ₹${(existing.amountPaise / 100).toLocaleString("en-IN")} to ₹${(amount / 100).toLocaleString("en-IN")}; creating a new Razorpay plan mapping. Existing active subscriptions are not changed.`);
    }
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new Error(
        `Computed a bad amount (${amount}) for ${plan.id}. Check the plan price and approved GST configuration.`
      );
    }
    const created = await rzp.plans.create({
      period: razorpayPeriod(plan.interval),
      interval: 1,
      item: {
        name: plan.label,
        amount, // paise
        currency: "INR",
        description: `${plan.label} — Truvi Ventures`,
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
  }

  console.log("\nDone. Subscription plans are ready — the Subscribe buttons will now charge.");
  await closeDb();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
