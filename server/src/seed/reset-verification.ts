import "dotenv/config";
import { connectDb, closeDb } from "../db";
import { projects, legalDocuments } from "../db/schema";

/**
 * Reset ALL projects' verification back to PENDING — owner-independent.
 *
 * The original seed baked fabricated Truvi verification (verified badges, a
 * trust score and risk levels) straight into the project rows. That data lives
 * in the database, so a listing can read "13/13 verified" even though no admin
 * ever verified it. This wipes every verification field on every project so
 * nothing shows as verified until an admin actually verifies it in the panel.
 *
 * It is safe to run repeatedly and never deletes a project — it only clears
 * verification state (and un-verifies any legal documents so they go back to
 * "awaiting review"). Use it whenever inventory is showing verification that no
 * admin approved.
 *
 * Run with:  npm --prefix server run reset:verification
 */
async function resetVerification() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL is not set. Add it to server/.env before running this.");

  const db = connectDb(url);
  await db.execute("select 1");

  const reset = await db
    .update(projects)
    .set({
      isVerified: false,
      verifiedAt: null,
      trustScore: null,
      legalRiskLevel: null,
      floodRiskLevel: null,
      crimeIndexLevel: null,
      reraStatus: null,
      verificationDetails: null,
    })
    .returning({ _id: projects._id, name: projects.name });

  console.log(`Reset verification to PENDING on ${reset.length} project(s):`);
  reset.forEach((p) => console.log(`  · ${p.name}`));

  // Any legal documents that were auto-marked verified go back to pending too.
  const docs = await db
    .update(legalDocuments)
    .set({ verified: false, verifiedById: null, verifiedAt: null })
    .returning({ _id: legalDocuments._id });
  if (docs.length) console.log(`Un-verified ${docs.length} legal document(s).`);

  console.log("Done — every listing now shows Pending until an admin verifies it.");
  await closeDb();
}

resetVerification().catch((err) => {
  console.error(err);
  process.exit(1);
});
