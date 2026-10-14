/**
 * Add project-level sales availability without changing approval status or
 * touching existing project, inventory, booking, or lead records.
 *
 * Run from the server folder: npm run db:sold-out
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

async function main() {
  try {
    await sql.unsafe(
      `ALTER TABLE projects
       ADD COLUMN IF NOT EXISTS availability_status text NOT NULL DEFAULT 'AVAILABLE'`,
    );
    console.log("Project availability migration applied (additive and idempotent).");
  } finally {
    await sql.end();
  }
}

main().catch((err: unknown) => {
  console.error("Project availability migration failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
