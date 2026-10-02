import "dotenv/config";
import { inArray, and, eq } from "drizzle-orm";
import { connectDb, closeDb } from "../db";
import {
  users,
  projects,
  units,
  leads,
  siteVisits,
  commissions,
  enquiries,
  sharedDocuments,
  projectAssets,
  legalDocuments,
} from "../db/schema";

/**
 * Non-destructive cleanup: removes the demo/dummy inventory listings that the
 * original seed created (Emerald/Sapphire/Crest… placeholders) WITHOUT touching
 * users, the Prime Estate showcase, or any real developer's projects.
 *
 * A listing is considered "demo" when it is owned by one of the seed developer
 * accounts (dev1–dev4@truvi.app) and is not the Prime Estate showcase
 * (isPrimeListing = false). Real developers who registered on the site own
 * their projects under their own accounts, so those are never affected.
 *
 * Run with:  npm --prefix server run cleanup:demo
 */
async function cleanup() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL is not set. Add it to server/.env before running cleanup.");

  const db = connectDb(url);
  await db.execute("select 1");

  const seedDevEmails = ["dev1@truvi.app", "dev2@truvi.app", "dev3@truvi.app", "dev4@truvi.app"];
  const seedDevs = await db.select({ _id: users._id }).from(users).where(inArray(users.email, seedDevEmails));
  const seedDevIds = seedDevs.map((d) => d._id);

  if (seedDevIds.length === 0) {
    console.log("No seed developer accounts found — nothing to clean up.");
    await closeDb();
    return;
  }

  // The old seed pre-filled Truvi verification (verified badges, trust score,
  // risk levels) on its projects. Reset all of that to PENDING — verification
  // must only ever come from a real admin action in the admin panel.
  const resetCount = await db
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
    .where(inArray(projects.developerId, seedDevIds))
    .returning({ _id: projects._id });
  console.log(`Reset seeded verification to PENDING on ${resetCount.length} project(s).`);

  // Demo projects = owned by a seed developer AND not the Prime Estate showcase.
  const demoProjects = await db
    .select({ _id: projects._id, name: projects.name })
    .from(projects)
    .where(and(inArray(projects.developerId, seedDevIds), eq(projects.isPrimeListing, false)));

  const projIds = demoProjects.map((p) => p._id);
  if (projIds.length === 0) {
    console.log("No demo listings to remove. Inventory is already clean.");
    await closeDb();
    return;
  }

  console.log(`Removing ${projIds.length} demo listing(s):`);
  demoProjects.forEach((p) => console.log(`  · ${p.name}`));

  // Delete dependent rows first (Postgres enforces the foreign keys).
  const demoLeads = await db.select({ _id: leads._id }).from(leads).where(inArray(leads.projectId, projIds));
  const leadIds = demoLeads.map((l) => l._id);
  if (leadIds.length) {
    await db.delete(commissions).where(inArray(commissions.leadId, leadIds));
    await db.delete(siteVisits).where(inArray(siteVisits.leadId, leadIds));
  }
  await db.delete(siteVisits).where(inArray(siteVisits.projectId, projIds));
  await db.delete(leads).where(inArray(leads.projectId, projIds));
  await db.delete(units).where(inArray(units.projectId, projIds));
  await db.delete(projectAssets).where(inArray(projectAssets.projectId, projIds));
  await db.delete(sharedDocuments).where(inArray(sharedDocuments.projectId, projIds));
  await db.delete(enquiries).where(inArray(enquiries.projectId, projIds));
  await db.delete(legalDocuments).where(inArray(legalDocuments.projectId, projIds));
  await db.delete(projects).where(inArray(projects._id, projIds));

  console.log("Cleanup complete — Prime Estate and all real projects/users are untouched.");
  await closeDb();
}

cleanup().catch((err) => {
  console.error(err);
  process.exit(1);
});
