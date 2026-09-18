import { inArray, eq, sql } from "drizzle-orm";
import type { Db } from "../db";
import { CATEGORY_TABLES, type DataCategory } from "../db/verificationSchema";
import type { IntelCategoryKey, IntelItem, RagInput } from "./intelligenceService";

/** Map each admin-ingested RAG category table to its intelligence/score bucket. */
const RAG_TO_INTEL: Record<DataCategory, IntelCategoryKey> = {
  government_legal: "government",
  infrastructure: "infrastructure",
  location_intelligence: "location",
  market_intelligence: "market",
  environmental_data: "environmental",
  satellite_gis: "gis",
  community_intelligence: "community",
};

const CATEGORY_ENTRIES = Object.entries(CATEGORY_TABLES) as [DataCategory, (typeof CATEGORY_TABLES)[DataCategory]][];

/**
 * Load every admin-uploaded data point for one project as intelligence items —
 * each carrying its real source and whether it's verified — grouped by intel
 * category, for the listing's full Truvi Score breakdown panel.
 */
export async function fetchRagItemsForProject(db: Db, projectId: string): Promise<RagInput> {
  const out: RagInput = {};
  await Promise.all(
    CATEGORY_ENTRIES.map(async ([category, table]) => {
      const rows = await db
        .select({ label: table.label, sourceType: table.sourceType, verified: table.verified })
        .from(table)
        .where(eq(table.projectId, projectId));
      if (rows.length === 0) return;
      const key = RAG_TO_INTEL[category];
      const items: IntelItem[] = rows.map((r) => ({
        label: r.label,
        source: r.sourceType?.trim() || "Truvi ingested data",
        status: r.verified ? "VERIFIED" : "PENDING",
        detail: r.verified
          ? "Uploaded and verified by Truvi."
          : "Uploaded — verification pending.",
      }));
      out[key] = { items };
    }),
  );
  return out;
}

/**
 * Aggregate verified/total RAG counts per project across all categories — the
 * lightweight input used to compute each listing card's Truvi Score without
 * pulling every data point.
 */
export async function fetchRagCountsForProjects(
  db: Db,
  projectIds: string[],
): Promise<Map<string, RagInput>> {
  const byProject = new Map<string, RagInput>();
  if (projectIds.length === 0) return byProject;

  await Promise.all(
    CATEGORY_ENTRIES.map(async ([category, table]) => {
      const rows = await db
        .select({
          projectId: table.projectId,
          verified: sql<number>`sum(case when ${table.verified} then 1 else 0 end)::int`,
          total: sql<number>`count(*)::int`,
        })
        .from(table)
        .where(inArray(table.projectId, projectIds))
        .groupBy(table.projectId);

      const key = RAG_TO_INTEL[category];
      for (const r of rows) {
        const id = String(r.projectId);
        const verified = Number(r.verified) || 0;
        const total = Number(r.total) || 0;
        const entry = byProject.get(id) ?? {};
        entry[key] = { verified, pending: Math.max(0, total - verified) };
        byProject.set(id, entry);
      }
    }),
  );
  return byProject;
}
