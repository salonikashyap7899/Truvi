/**
 * Safe, targeted migration for the Marketing module.
 *
 * Like `db:notify`, this applies ONLY the marketing tables/indexes,
 * idempotently (`IF NOT EXISTS` everywhere), and never touches any other
 * table — so there is no data-loss risk and it sidesteps the all-or-nothing
 * `drizzle-kit push` abort (which wants to drop the out-of-Drizzle
 * `kyc_documents` table). Safe to run repeatedly.
 *
 * Run from the server folder:  npm run db:marketing
 */
import "dotenv/config";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set (expected in server/.env).");
  process.exit(1);
}

const sql = postgres(url, {
  prepare: false,
  ssl: url.includes("localhost") || url.includes("127.0.0.1") ? undefined : "require",
  max: 1,
});

const statements: string[] = [
  `CREATE TABLE IF NOT EXISTS marketing_access (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     user_id uuid NOT NULL REFERENCES users(id),
     status text NOT NULL DEFAULT 'ACTIVE',
     package_name text NOT NULL DEFAULT 'Marketing Access',
     budget_paise integer NOT NULL DEFAULT 0,
     valid_from timestamptz NOT NULL DEFAULT now(),
     valid_until timestamptz,
     granted_by_id uuid REFERENCES users(id),
     notes text,
     created_at timestamptz NOT NULL DEFAULT now(),
     updated_at timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS marketing_access_user_idx ON marketing_access (user_id)`,

  `CREATE TABLE IF NOT EXISTS marketing_payments (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     user_id uuid NOT NULL REFERENCES users(id),
     partner_name text NOT NULL,
     partner_email text,
     partner_phone text,
     package_name text NOT NULL DEFAULT 'Marketing Access',
     amount_paise integer NOT NULL DEFAULT 0,
     gst_percent double precision NOT NULL DEFAULT 18,
     gst_paise integer NOT NULL DEFAULT 0,
     total_paise integer NOT NULL DEFAULT 0,
     method text NOT NULL DEFAULT 'OTHER',
     reference text,
     status text NOT NULL DEFAULT 'VERIFIED',
     paid_at timestamptz NOT NULL DEFAULT now(),
     verified_by_id uuid REFERENCES users(id),
     notes text,
     created_at timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS marketing_payments_user_idx ON marketing_payments (user_id, created_at)`,

  `CREATE TABLE IF NOT EXISTS marketing_expenses (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     user_id uuid NOT NULL REFERENCES users(id),
     activity text NOT NULL,
     amount_paise integer NOT NULL DEFAULT 0,
     status text NOT NULL DEFAULT 'ACTIVE',
     spent_at timestamptz NOT NULL DEFAULT now(),
     notes text,
     created_by_id uuid REFERENCES users(id),
     created_at timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS marketing_expenses_user_idx ON marketing_expenses (user_id, spent_at)`,

  `CREATE TABLE IF NOT EXISTS marketing_leads (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     user_id uuid NOT NULL REFERENCES users(id),
     name text NOT NULL,
     phone text,
     email text,
     source text NOT NULL DEFAULT 'Marketing',
     status text NOT NULL DEFAULT 'NEW',
     value_paise integer NOT NULL DEFAULT 0,
     notes text,
     created_by_id uuid REFERENCES users(id),
     created_at timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS marketing_leads_user_idx ON marketing_leads (user_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS marketing_leads_status_idx ON marketing_leads (status)`,

  `CREATE TABLE IF NOT EXISTS marketing_partner_campaigns (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     user_id uuid NOT NULL REFERENCES users(id),
     name text NOT NULL,
     channel text NOT NULL DEFAULT 'Other',
     status text NOT NULL DEFAULT 'ACTIVE',
     spend_paise integer NOT NULL DEFAULT 0,
     leads_count integer NOT NULL DEFAULT 0,
     started_at timestamptz,
     created_by_id uuid REFERENCES users(id),
     created_at timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS marketing_partner_campaigns_user_idx ON marketing_partner_campaigns (user_id)`,
];

async function main() {
  console.log("Applying marketing schema (safe / additive)…\n");
  for (const stmt of statements) {
    await sql.unsafe(stmt);
    console.log("  ✓", stmt.replace(/\s+/g, " ").trim().slice(0, 72));
  }
  console.log("\n✅ Marketing schema applied. No other tables were touched.");
  await sql.end();
}

main().catch(async (err) => {
  console.error("\n❌ Migration failed:", err instanceof Error ? err.message : err);
  try {
    await sql.end();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
