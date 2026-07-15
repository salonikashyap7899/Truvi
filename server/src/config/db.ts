import type { Db } from "../db";
import { connectDb, closeDb, getDb } from "../db";
import { VERIFICATION_BOOT_SQL, ensureVerificationDefaults } from "../db/verificationBootSql";

let isConnected = false;
let connectionError: Error | null = null;

/**
 * Idempotent, additive schema reconciliation run on every boot so a deploy
 * doesn't require a manual `drizzle-kit push` for newly-added columns. Only
 * ever ADDs columns with `IF NOT EXISTS` (never drops/alters), so it's safe to
 * run repeatedly and can't lose data. Keep each statement in sync with the
 * Drizzle schema (same column name/type/default) so a later `drizzle-kit push`
 * sees them as already-present.
 */
async function ensureSchema(db: Db): Promise<void> {
  const statements = [
    `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_verified" boolean NOT NULL DEFAULT true`,
    `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "phone_verified" boolean NOT NULL DEFAULT true`,
    // Developer-managed project details + legal-doc verification gate.
    `ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "possession_date" timestamptz`,
    `ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "sales_contact" jsonb`,
    `ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "payment_plans" jsonb`,
    `ALTER TABLE "project_assets" ADD COLUMN IF NOT EXISTS "verified" boolean NOT NULL DEFAULT true`,
    // Config tables ensureVerificationDefaults depends on — created here too so
    // a deploy without `drizzle-kit push` never spams boot warnings.
    `CREATE TABLE IF NOT EXISTS "score_thresholds" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       "verified_min" integer NOT NULL DEFAULT 85,
       "pending_min" integer NOT NULL DEFAULT 50,
       "updated_at" timestamptz NOT NULL DEFAULT now()
     )`,
    `CREATE TABLE IF NOT EXISTS "ai_prompts" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       "name" text NOT NULL,
       "system_prompt" text NOT NULL,
       "active" boolean NOT NULL DEFAULT false,
       "version" integer NOT NULL DEFAULT 1,
       "created_at" timestamptz NOT NULL DEFAULT now()
     )`,
    // Verification-engine extensions + vector/pgcrypto objects (Phase 1).
    ...VERIFICATION_BOOT_SQL,
  ];
  for (const stmt of statements) {
    try {
      await db.execute(stmt);
    } catch (err) {
      console.warn(`ensureSchema failed for "${stmt.split("\n")[0]}…":`, err instanceof Error ? err.message : err);
    }
  }

  // Seed single-row config defaults (thresholds + active AI prompt). Depends on
  // the Drizzle tables existing (`drizzle-kit push`); best-effort until then.
  try {
    await ensureVerificationDefaults(db);
  } catch (err) {
    console.warn("ensureVerificationDefaults skipped:", err instanceof Error ? err.message : err);
  }
}

export async function connectDB(url: string): Promise<boolean> {
  if (isConnected) return true;

  if (!url || url.trim() === "") {
    connectionError = new Error("No DATABASE_URL configured. Set it in server/.env to enable the database-backed API routes.");
    console.warn(connectionError.message);
    return false;
  }

  try {
    const db = connectDb(url);
    await db.execute("select 1");
    await ensureSchema(db);
    isConnected = true;
    connectionError = null;
    console.log("Supabase (Postgres) connected");
    return true;
  } catch (error) {
    connectionError = error instanceof Error ? error : new Error(String(error));
    isConnected = false;
    await closeDb();
    console.warn(`Database connection unavailable; continuing without it: ${connectionError.message}`);
    return false;
  }
}

export async function disconnectDB(): Promise<void> {
  if (!isConnected) return;
  await closeDb();
  isConnected = false;
  connectionError = null;
}

export function getDatabaseStatus(): { connected: boolean; error: string | null } {
  return {
    connected: isConnected,
    error: connectionError?.message ?? null,
  };
}

export { getDb };
