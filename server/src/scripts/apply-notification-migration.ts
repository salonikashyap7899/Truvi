/**
 * Safe, targeted migration for the notification engine.
 *
 * Why this exists: `drizzle-kit push` is all-or-nothing and aborts the whole
 * push when it detects an unrelated data-loss statement (on this DB, it wants
 * to drop the `kyc_documents` table, which is created outside the Drizzle
 * schema and holds real KYC files). That abort also blocked the additive
 * notification columns from landing.
 *
 * This script applies ONLY the notification changes, idempotently
 * (`IF NOT EXISTS` everywhere), and never touches any other table — so there is
 * no data-loss risk. Safe to run repeatedly.
 *
 * Run from the server folder:  npm run db:notify
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
  `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'general'`,
  `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS title text`,
  `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS actor_user_id uuid REFERENCES users(id)`,
  `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS data jsonb`,
  `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'normal'`,
  `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS read_at timestamptz`,
  `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS expires_at timestamptz`,
  `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS pushed_at timestamptz`,
  `CREATE INDEX IF NOT EXISTS notifications_user_created_idx ON notifications (user_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS notifications_type_idx ON notifications (type)`,
  `CREATE TABLE IF NOT EXISTS notification_preferences (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     user_id uuid NOT NULL REFERENCES users(id),
     category text NOT NULL,
     enabled boolean NOT NULL DEFAULT true,
     updated_at timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS notification_prefs_user_category_idx ON notification_preferences (user_id, category)`,
  `CREATE TABLE IF NOT EXISTS user_push_tokens (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     user_id uuid NOT NULL REFERENCES users(id),
     token text NOT NULL,
     platform text NOT NULL DEFAULT 'android',
     device_id text,
     created_at timestamptz NOT NULL DEFAULT now(),
     updated_at timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS user_push_tokens_token_idx ON user_push_tokens (token)`,
  `CREATE INDEX IF NOT EXISTS user_push_tokens_user_idx ON user_push_tokens (user_id)`,
];

async function main() {
  console.log("Applying notification schema (safe / additive)…\n");
  for (const stmt of statements) {
    await sql.unsafe(stmt);
    console.log("  ✓", stmt.replace(/\s+/g, " ").trim().slice(0, 72));
  }
  console.log("\n✅ Notification schema applied. No other tables were touched.");
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
