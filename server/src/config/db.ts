import type { Db } from "../db";
import { connectDb, closeDb, getDb } from "../db";

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
  ];
  for (const stmt of statements) {
    try {
      await db.execute(stmt);
    } catch (err) {
      console.warn(`ensureSchema failed for "${stmt}":`, err instanceof Error ? err.message : err);
    }
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
