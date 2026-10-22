/**
 * Additive migration for auth-version based refresh-token invalidation.
 *
 * Run from the server folder BEFORE deploying code that reads auth_version:
 *   npm run db:auth-version
 *
 * The migration only adds one non-null integer column with a default, so
 * existing users start at version zero and old refresh tokens remain valid
 * until that user resets their password.
 */
import "dotenv/config";
import postgres from "postgres";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set (expected in server/.env).");
  }

  const sql = postgres(url, {
    prepare: false,
    ssl: url.includes("localhost") || url.includes("127.0.0.1") ? undefined : "require",
    max: 1,
  });

  try {
    await sql.unsafe(
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_version integer NOT NULL DEFAULT 0",
    );
    console.log("Auth-version migration applied successfully.");
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error("Failed to apply auth-version migration:", error);
  process.exitCode = 1;
});
