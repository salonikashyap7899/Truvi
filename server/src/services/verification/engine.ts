import { eq } from "drizzle-orm";
import { getDb, getSqlClient } from "../../db";
import {
  verificationChecks,
  verificationResults,
  scoreThresholds,
  VerificationStatus,
} from "../../db/verificationSchema";

/**
 * FULLY DYNAMIC verification engine.
 *
 * Nothing about *what* is checked, *how much* each check is worth, or *where*
 * the Verified/Pending cutoffs sit is hardcoded — it all comes from the
 * `verification_checks` and `score_thresholds` tables, which admins edit live.
 *
 * Each enabled check carries a `sql_query` that is run with `$1 = projectId`
 * and MUST return a single row shaped `{ passed boolean, evidence jsonb }`.
 * Queries run inside a READ ONLY transaction so an admin check can never mutate
 * data, and each is wrapped in its own try/catch so one bad query can't sink
 * the whole run.
 */

export interface CheckOutcome {
  checkId: string;
  name: string;
  category: string;
  weight: number;
  passed: boolean;
  evidence: Record<string, unknown> | null;
  error?: string;
}

export interface VerificationOutcome {
  projectId: string;
  status: VerificationStatus;
  confidenceScore: number;
  checks: CheckOutcome[];
  riskFlags: string[];
}

export async function runVerification(projectId: string): Promise<VerificationOutcome> {
  const db = getDb();
  const sqlc = getSqlClient();

  const checks = await db
    .select()
    .from(verificationChecks)
    .where(eq(verificationChecks.enabled, true));

  const outcomes: CheckOutcome[] = [];

  for (const check of checks) {
    try {
      // READ ONLY transaction — admin SQL cannot write, even by accident.
      const rows = await sqlc.begin(async (tx) => {
        await tx.unsafe("SET TRANSACTION READ ONLY");
        return tx.unsafe(check.sqlQuery, [projectId]);
      });
      const row = (rows as unknown as Array<Record<string, unknown>>)[0];
      const passed = Boolean(row?.passed);
      const evidence = (row?.evidence as Record<string, unknown> | undefined) ?? (row ? { ...row } : null);
      outcomes.push({
        checkId: check._id,
        name: check.name,
        category: check.category,
        weight: check.weight,
        passed,
        evidence: passed ? evidence : evidence,
      });
    } catch (err) {
      // A broken check counts as "not passed" but is recorded so admins can fix it.
      outcomes.push({
        checkId: check._id,
        name: check.name,
        category: check.category,
        weight: check.weight,
        passed: false,
        evidence: null,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const totalWeight = outcomes.reduce((s, o) => s + o.weight, 0);
  const passedWeight = outcomes.filter((o) => o.passed).reduce((s, o) => s + o.weight, 0);
  const confidenceScore = totalWeight === 0 ? 0 : Math.round((passedWeight / totalWeight) * 100);

  // Thresholds are admin-editable (single row); fall back to sensible defaults.
  const [thresholds] = await db.select().from(scoreThresholds).limit(1);
  const verifiedMin = thresholds?.verifiedMin ?? 85;
  const pendingMin = thresholds?.pendingMin ?? 50;

  let status: VerificationStatus;
  if (totalWeight === 0) status = "UNAVAILABLE";
  else if (confidenceScore >= verifiedMin) status = "VERIFIED";
  else if (confidenceScore >= pendingMin) status = "PENDING";
  else status = "UNAVAILABLE";

  const riskFlags = outcomes
    .filter((o) => !o.passed)
    .map((o) => `${o.category}: ${o.name}${o.error ? " (check error)" : ""}`);

  const evidenceSources = outcomes
    .filter((o) => o.passed && o.evidence)
    .map((o) => ({ check: o.name, category: o.category, evidence: o.evidence }));

  const checksRun = outcomes.map((o) => ({
    check: o.name,
    category: o.category,
    weight: o.weight,
    passed: o.passed,
    ...(o.error ? { error: o.error } : {}),
  }));

  // Upsert the single result row for this project.
  await db
    .insert(verificationResults)
    .values({
      projectId,
      status,
      confidenceScore,
      riskFlags,
      evidenceSources,
      checksRun,
      lastVerifiedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: verificationResults.projectId,
      set: {
        status,
        confidenceScore,
        riskFlags,
        evidenceSources,
        checksRun,
        lastVerifiedAt: new Date(),
      },
    });

  return { projectId, status, confidenceScore, checks: outcomes, riskFlags };
}
