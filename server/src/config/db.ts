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
    // Admin can deactivate ("remove") an account without destroying its history.
    `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "disabled" boolean NOT NULL DEFAULT false`,
    // Developer-managed project details + legal-doc verification gate.
    `ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "possession_date" timestamptz`,
    `ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "sales_contact" jsonb`,
    `ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "payment_plans" jsonb`,
    `ALTER TABLE "project_assets" ADD COLUMN IF NOT EXISTS "verified" boolean NOT NULL DEFAULT true`,
    // CP CRM (paid tier): lead tags + activity/follow-up/task tables.
    `ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "tags" jsonb`,
    `CREATE TABLE IF NOT EXISTS "lead_activities" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       "lead_id" uuid NOT NULL REFERENCES "leads"("id"),
       "cp_id" uuid NOT NULL REFERENCES "users"("id"),
       "type" text NOT NULL,
       "content" text NOT NULL,
       "metadata" jsonb,
       "created_at" timestamptz NOT NULL DEFAULT now()
     )`,
    `CREATE INDEX IF NOT EXISTS "lead_activities_lead_idx" ON "lead_activities" ("lead_id", "created_at")`,
    `CREATE INDEX IF NOT EXISTS "lead_activities_cp_idx" ON "lead_activities" ("cp_id", "created_at")`,
    `CREATE TABLE IF NOT EXISTS "lead_follow_ups" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       "lead_id" uuid NOT NULL REFERENCES "leads"("id"),
       "cp_id" uuid NOT NULL REFERENCES "users"("id"),
       "due_at" timestamptz NOT NULL,
       "channel" text NOT NULL DEFAULT 'CALL',
       "note" text,
       "status" text NOT NULL DEFAULT 'PENDING',
       "created_at" timestamptz NOT NULL DEFAULT now()
     )`,
    `CREATE INDEX IF NOT EXISTS "lead_follow_ups_cp_status_idx" ON "lead_follow_ups" ("cp_id", "status", "due_at")`,
    `CREATE INDEX IF NOT EXISTS "lead_follow_ups_lead_idx" ON "lead_follow_ups" ("lead_id")`,
    `CREATE TABLE IF NOT EXISTS "crm_tasks" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       "cp_id" uuid NOT NULL REFERENCES "users"("id"),
       "lead_id" uuid REFERENCES "leads"("id"),
       "title" text NOT NULL,
       "due_at" timestamptz,
       "priority" text NOT NULL DEFAULT 'MEDIUM',
       "status" text NOT NULL DEFAULT 'OPEN',
       "created_at" timestamptz NOT NULL DEFAULT now()
     )`,
    `CREATE INDEX IF NOT EXISTS "crm_tasks_cp_status_idx" ON "crm_tasks" ("cp_id", "status")`,
    // Admin-managed Learning Academy content (videos + PDFs) shown to CPs.
    `CREATE TABLE IF NOT EXISTS "academy_content" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       "course_id" text NOT NULL,
       "title" text NOT NULL,
       "type" text NOT NULL,
       "url" text NOT NULL,
       "description" text,
       "duration" text,
       "sort_order" integer NOT NULL DEFAULT 0,
       "created_by_id" uuid REFERENCES "users"("id"),
       "created_at" timestamptz NOT NULL DEFAULT now()
     )`,
    `CREATE INDEX IF NOT EXISTS "academy_content_course_idx" ON "academy_content" ("course_id", "sort_order")`,
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
    // Founder-only operating modules (Team, Marketing, Land Bank, Investor).
    `CREATE TABLE IF NOT EXISTS "employees" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       "name" text NOT NULL,
       "title" text,
       "department" text NOT NULL DEFAULT 'General',
       "status" text NOT NULL DEFAULT 'ACTIVE',
       "present_today" boolean NOT NULL DEFAULT true,
       "performance_score" integer NOT NULL DEFAULT 0,
       "tasks_pending" integer NOT NULL DEFAULT 0,
       "monthly_ctc" double precision NOT NULL DEFAULT 0,
       "joined_at" timestamptz NOT NULL DEFAULT now(),
       "created_at" timestamptz NOT NULL DEFAULT now()
     )`,
    `CREATE TABLE IF NOT EXISTS "marketing_campaigns" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       "name" text NOT NULL,
       "channel" text NOT NULL DEFAULT 'Other',
       "status" text NOT NULL DEFAULT 'ACTIVE',
       "spend" double precision NOT NULL DEFAULT 0,
       "leads" integer NOT NULL DEFAULT 0,
       "conversions" integer NOT NULL DEFAULT 0,
       "revenue" double precision NOT NULL DEFAULT 0,
       "started_at" timestamptz,
       "created_at" timestamptz NOT NULL DEFAULT now()
     )`,
    `CREATE TABLE IF NOT EXISTS "land_parcels" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       "name" text NOT NULL,
       "location" text NOT NULL,
       "area" double precision NOT NULL DEFAULT 0,
       "area_unit" text NOT NULL DEFAULT 'ACRE',
       "status" text NOT NULL DEFAULT 'OPPORTUNITY',
       "estimated_value" double precision NOT NULL DEFAULT 0,
       "due_diligence_done" boolean NOT NULL DEFAULT false,
       "priority" text NOT NULL DEFAULT 'MEDIUM',
       "notes" text,
       "created_at" timestamptz NOT NULL DEFAULT now()
     )`,
    `CREATE TABLE IF NOT EXISTS "cap_table_entries" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       "holder_name" text NOT NULL,
       "holder_type" text NOT NULL DEFAULT 'INVESTOR',
       "equity_percent" double precision NOT NULL DEFAULT 0,
       "invested_amount" double precision NOT NULL DEFAULT 0,
       "created_at" timestamptz NOT NULL DEFAULT now()
     )`,
    `CREATE TABLE IF NOT EXISTS "fundraise_rounds" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       "name" text NOT NULL,
       "target_amount" double precision NOT NULL DEFAULT 0,
       "committed_amount" double precision NOT NULL DEFAULT 0,
       "valuation" double precision NOT NULL DEFAULT 0,
       "status" text NOT NULL DEFAULT 'OPEN',
       "close_date" timestamptz,
       "created_at" timestamptz NOT NULL DEFAULT now()
     )`,
    `CREATE TABLE IF NOT EXISTS "investor_updates" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       "title" text NOT NULL,
       "body" text,
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
