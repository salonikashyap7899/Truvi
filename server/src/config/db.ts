import { connectDb, closeDb, getDb } from "../db";

let isConnected = false;
let connectionError: Error | null = null;

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
