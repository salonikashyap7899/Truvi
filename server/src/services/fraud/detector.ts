import { eq } from "drizzle-orm";
import { getDb, getSqlClient } from "../../db";
import { fraudRules, fraudFlags } from "../../db/verificationSchema";

/**
 * FULLY DYNAMIC fraud detection.
 *
 * Every rule lives in `fraud_rules` as a `sql_query` run with `$1 = projectId`.
 * ANY row the query returns is treated as a hit and recorded in `fraud_flags`
 * (the returned row is stored as evidence). Admins add/disable rules live —
 * e.g. "sold 3+ times in 12 months" or "sale value < 70% of circle rate" —
 * with no code change. Queries run READ ONLY for safety.
 */

export interface FraudHit {
  ruleId: string;
  name: string;
  severity: string;
  evidence: Record<string, unknown>;
}

export async function runFraudDetection(projectId: string): Promise<FraudHit[]> {
  const db = getDb();
  const sqlc = getSqlClient();

  const rules = await db.select().from(fraudRules).where(eq(fraudRules.enabled, true));

  // Replace this project's previous flags so results are idempotent.
  await db.delete(fraudFlags).where(eq(fraudFlags.projectId, projectId));

  const hits: FraudHit[] = [];

  for (const rule of rules) {
    try {
      const rows = (await sqlc.begin(async (tx) => {
        await tx.unsafe("SET TRANSACTION READ ONLY");
        return tx.unsafe(rule.sqlQuery, [projectId]);
      })) as unknown as Array<Record<string, unknown>>;

      for (const row of rows) {
        hits.push({ ruleId: rule._id, name: rule.name, severity: rule.severity, evidence: row });
      }
    } catch (err) {
      // A broken rule is logged as a low-severity meta-flag so admins notice it.
      hits.push({
        ruleId: rule._id,
        name: rule.name,
        severity: "low",
        evidence: { ruleError: err instanceof Error ? err.message : String(err) },
      });
    }
  }

  if (hits.length > 0) {
    await db.insert(fraudFlags).values(
      hits.map((h) => ({
        projectId,
        ruleId: h.ruleId,
        severity: h.severity as "low" | "medium" | "high",
        evidence: h.evidence,
      }))
    );
  }

  return hits;
}
