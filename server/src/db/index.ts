/**
 * Drizzle + postgres.js connection to Supabase (PostgreSQL).
 *
 * The pool is created lazily on the first `getDb()` call so importing this
 * module never opens a connection (important for tests and drizzle-kit).
 *
 * `prepare: false` is required when using Supabase's transaction-mode
 * connection pooler (port 6543), and is harmless on direct/session
 * connections.
 */
import { drizzle, PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Db = PostgresJsDatabase<typeof schema>;

let client: ReturnType<typeof postgres> | null = null;
let dbInstance: Db | null = null;

export function connectDb(url: string): Db {
  if (dbInstance) return dbInstance;
  client = postgres(url, {
    prepare: false,
    ssl: url.includes("localhost") || url.includes("127.0.0.1") ? undefined : "require",
    max: 10,
  });
  dbInstance = drizzle(client, { schema });
  return dbInstance;
}

export function getDb(): Db {
  if (!dbInstance) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error(
        "DATABASE_URL is not set. Add your Supabase Postgres connection string to server/.env"
      );
    }
    return connectDb(url);
  }
  return dbInstance;
}

export async function closeDb(): Promise<void> {
  if (client) {
    await client.end({ timeout: 5 });
    client = null;
    dbInstance = null;
  }
}

export * from "./schema";
