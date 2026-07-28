import "dotenv/config";
import { connectDb, getSqlClient, closeDb } from "../db";

/**
 * DESTRUCTIVE maintenance script — wipe all dummy/user data and keep ONLY the
 * two Truvi founder (ADMIN) accounts.
 *
 *   Keeps:  the founder logins (sandeep@ / meraj@truviventures.com), plus the
 *           platform settings and Razorpay plan mapping (pure configuration).
 *   Removes: every other user AND all of their data — projects, units, leads,
 *           commissions, site visits, documents/KYC, referrals, payments,
 *           subscriptions, notifications, audit logs, founder-module records,
 *           verification results, everything.
 *
 * How it works: every public table except `users`, `platform_settings` and
 * `subscription_plans` is TRUNCATE … CASCADE'd (order-independent, no
 * superuser needed), then every non-founder row is deleted from `users`.
 * `users` has no outgoing foreign keys, so the founder rows (and their rotated
 * passwords) are preserved untouched.
 *
 * Self-healing config: on the next server boot, ensureDefaultFounder re-creates
 * either founder if it were missing, and ensureVerificationDefaults re-seeds the
 * score thresholds + default AI prompt. Optional AI-verification config
 * (verification_checks / fraud_rules / government_legal) is cleared and can be
 * restored with `npm run seed:verification`.
 *
 * Safety: runs a read-only PREVIEW by default. To actually delete, re-run with
 *   CONFIRM_RESET=REMOVE_ALL_EXCEPT_FOUNDERS npm run reset:founders
 *
 * The kept accounts default to the two founders but can be overridden with a
 * comma-separated KEEP_EMAILS env var.
 */

const CONFIRM_TOKEN = "REMOVE_ALL_EXCEPT_FOUNDERS";

// Tables that are pure configuration (no per-user data, no user foreign keys) —
// preserved so the platform keeps working after the reset.
const KEEP_TABLES = new Set(["users", "platform_settings", "subscription_plans"]);

// The founder accounts to keep. These are Truvi's two founders; override with
// KEEP_EMAILS="a@x.com,b@y.com" if ever needed.
const DEFAULT_KEEP_EMAILS = ["sandeep@truviventures.com", "meraj@truviventures.com"];

async function main() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL is not set. Add it to server/.env before running this.");

  const keepEmails = [
    ...new Set(
      (process.env.KEEP_EMAILS?.trim()
        ? process.env.KEEP_EMAILS.split(",")
        : DEFAULT_KEEP_EMAILS
      )
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];

  connectDb(url);
  const sql = getSqlClient();
  await sql`select 1`;

  // What we'd keep / remove.
  const [{ n: totalUsers }] = (await sql`SELECT count(*)::int AS n FROM users`) as unknown as { n: number }[];
  const keepRows = (await sql`
    SELECT email, role FROM users WHERE lower(email) = ANY(${keepEmails}) ORDER BY email
  `) as unknown as { email: string; role: string }[];
  const removeCount = totalUsers - keepRows.length;

  const tableRows = (await sql`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename
  `) as unknown as { tablename: string }[];
  const toTruncate = tableRows.map((r) => r.tablename).filter((t) => !KEEP_TABLES.has(t));

  console.log("──────────────────────────────────────────────");
  console.log("Reset to founders — PLAN");
  console.log("──────────────────────────────────────────────");
  console.log(`Users in database:      ${totalUsers}`);
  console.log(`Accounts to KEEP:       ${keepRows.length}`);
  keepRows.forEach((r) => console.log(`   · ${r.email} (${r.role})`));
  if (keepRows.length < keepEmails.length) {
    const present = new Set(keepRows.map((r) => r.email.toLowerCase()));
    keepEmails
      .filter((e) => !present.has(e))
      .forEach((e) => console.log(`   · ${e} — NOT FOUND (will be re-provisioned on next server boot)`));
  }
  console.log(`Users to REMOVE:        ${removeCount}`);
  console.log(`Tables to TRUNCATE:     ${toTruncate.length} (everything except ${[...KEEP_TABLES].join(", ")})`);

  if (process.env.CONFIRM_RESET !== CONFIRM_TOKEN) {
    console.log("\nThis was a PREVIEW — nothing was changed.");
    console.log(`To execute the wipe, re-run with:\n   CONFIRM_RESET=${CONFIRM_TOKEN} npm run reset:founders`);
    await closeDb();
    return;
  }

  console.log("\nCONFIRM_RESET set — executing the wipe now…");
  await sql.begin(async (tx) => {
    if (toTruncate.length) {
      const idents = toTruncate.map((t) => `"${t.replace(/"/g, '""')}"`).join(", ");
      await tx.unsafe(`TRUNCATE TABLE ${idents} RESTART IDENTITY CASCADE`);
    }
    await tx`DELETE FROM users WHERE NOT (lower(email) = ANY(${keepEmails}))`;
  });

  const [{ n: after }] = (await sql`SELECT count(*)::int AS n FROM users`) as unknown as { n: number }[];
  console.log("──────────────────────────────────────────────");
  console.log(`Done. Truncated ${toTruncate.length} table(s). Users remaining: ${after}.`);
  console.log(`Kept: ${keepEmails.join(", ")}`);
  console.log("(Optional AI-verification config was cleared — run `npm run seed:verification` to restore it.)");
  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
