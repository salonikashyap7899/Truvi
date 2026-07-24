import "dotenv/config";
import { connectDb, closeDb } from "../db";
import { syncFounders } from "../db/bootstrapFounder";

/**
 * Create-or-update the two Founder (ADMIN) accounts to match the configured
 * names / emails / passwords, WITHOUT touching any other data. Safe to run on a
 * live deployment — unlike `npm run seed`, it never wipes the database.
 *
 * Usage on the VPS (values come from server/.env or the shell):
 *   cd server
 *   FOUNDER1_EMAIL=Sandeep@truviventures.com FOUNDER1_PASSWORD='...' \
 *   FOUNDER2_EMAIL=Meraj@truviventures.com   FOUNDER2_PASSWORD='...' \
 *   npm run founders
 */
async function main() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL is not set. Add it to server/.env before running founder sync.");

  const db = connectDb(url);
  await db.execute("select 1");

  const results = await syncFounders(db);
  console.log("--- Founder accounts synced ---");
  for (const r of results) console.log(`  ${r.action.padEnd(7)} → ${r.email}`);
  console.log("Founders can now sign in at /login → CEO OS at /founder/dashboard");

  await closeDb();
}

main().catch((err) => {
  console.error("Founder sync failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
