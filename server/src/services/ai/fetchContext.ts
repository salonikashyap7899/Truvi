import { eq, desc } from "drizzle-orm";
import { getDb, getSqlClient } from "../../db";
import { projects } from "../../db/schema";
import {
  CATEGORY_TABLES,
  DATA_CATEGORIES,
  verificationResults,
  fraudFlags,
} from "../../db/verificationSchema";

/**
 * Retrieval for RAG. Anthropic has no embeddings API, so retrieval is
 * structured (property-scoped) + lexical (open-ended, via Postgres full-text +
 * pg_trgm). Every fact carries a source so the model can cite it. The pgvector
 * `document_embeddings` table stays in place for a future semantic upgrade.
 */

export interface Source {
  category: string;
  dataKey?: string;
  label?: string;
  verified?: boolean;
  projectId?: string;
}

export interface RagContext {
  contextText: string;
  sources: Source[];
}

const clip = (s: string, n = 600) => (s.length > n ? s.slice(0, n) + "…" : s);

/** All verified/known data for one property + its verification + fraud flags. */
async function propertyContext(projectId: string): Promise<RagContext | null> {
  const db = getDb();
  const [project] = await db.select().from(projects).where(eq(projects._id, projectId));
  if (!project) return null;

  const lines: string[] = [];
  const sources: Source[] = [];

  lines.push(
    `PROPERTY: ${project.name} — ${project.location ?? ""}, ${project.city ?? ""}` +
      (project.reraNumber ? ` (RERA: ${project.reraNumber})` : "")
  );

  for (const category of DATA_CATEGORIES) {
    const table = CATEGORY_TABLES[category as keyof typeof CATEGORY_TABLES];
    if (!table) continue;
    const rows = await db.select().from(table as any).where(eq((table as any).projectId, projectId));
    if (!rows.length) continue;
    lines.push(`\n[${category}]`);
    for (const r of rows as any[]) {
      const src = r.sourceType ? `, source: ${r.sourceType}` : "";
      const vf = r.verified ? "VERIFIED" : "unverified";
      lines.push(`- ${r.label} (${vf}${src}): ${clip(JSON.stringify(r.rawData ?? {}))}`);
      sources.push({ category, dataKey: r.dataKey, label: r.label, verified: r.verified, projectId });
    }
  }

  const [vr] = await db.select().from(verificationResults).where(eq(verificationResults.projectId, projectId));
  if (vr) {
    lines.push(
      `\n[verification_result] status: ${vr.status}, confidence: ${vr.confidenceScore}%, risk_flags: ${JSON.stringify(vr.riskFlags)}`
    );
    sources.push({ category: "verification_result", projectId });
  }

  const flags = await db.select().from(fraudFlags).where(eq(fraudFlags.projectId, projectId)).orderBy(desc(fraudFlags.flaggedAt));
  if (flags.length) {
    lines.push(`\n[fraud_flags] ${flags.map((f) => `${f.severity}: ${clip(JSON.stringify(f.evidence))}`).join(" | ")}`);
    sources.push({ category: "fraud_flags", projectId });
  }

  return { contextText: lines.join("\n"), sources };
}

/** Lexical search across every category table (full-text + trigram ranking). */
async function searchContext(question: string): Promise<RagContext> {
  const sqlc = getSqlClient();

  // Build a UNION over the known category tables (names are constants, not user input).
  const tables = Object.keys(CATEGORY_TABLES);
  const union = tables
    .map(
      (t) => `
      SELECT '${t}'::text AS category, project_id, data_key, label, raw_data, verified,
             ts_rank(to_tsvector('simple', coalesce(label,'') || ' ' || coalesce(raw_data::text,'')), q.tsq) AS rank
      FROM ${t}, (SELECT plainto_tsquery('simple', $1) AS tsq) q
      WHERE to_tsvector('simple', coalesce(label,'') || ' ' || coalesce(raw_data::text,'')) @@ q.tsq`
    )
    .join("\n      UNION ALL");

  const query = `SELECT * FROM (${union}) m ORDER BY rank DESC LIMIT 10`;
  const rows = (await sqlc.unsafe(query, [question])) as unknown as Array<Record<string, any>>;

  const lines: string[] = [];
  const sources: Source[] = [];
  if (!rows.length) return { contextText: "", sources };

  // Attach the project name for each matched row.
  const db = getDb();
  const ids = [...new Set(rows.map((r) => r.project_id))];
  const projRows = await db.select({ _id: projects._id, name: projects.name, city: projects.city }).from(projects);
  const nameOf = new Map(projRows.filter((p) => ids.includes(p._id)).map((p) => [p._id, `${p.name}, ${p.city ?? ""}`]));

  for (const r of rows) {
    const pname = nameOf.get(r.project_id) ?? r.project_id;
    lines.push(`- [${r.category}] ${pname} — ${r.label} (${r.verified ? "VERIFIED" : "unverified"}): ${clip(JSON.stringify(r.raw_data ?? {}))}`);
    sources.push({ category: r.category, dataKey: r.data_key, label: r.label, verified: r.verified, projectId: r.project_id });
  }

  return { contextText: `SEARCH RESULTS for the question:\n${lines.join("\n")}`, sources };
}

export async function fetchContext(question: string, projectId?: string): Promise<RagContext> {
  if (projectId) {
    const ctx = await propertyContext(projectId);
    if (ctx) return ctx;
  }
  return searchContext(question);
}
