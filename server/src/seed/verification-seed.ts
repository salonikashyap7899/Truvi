import "dotenv/config";
import { sql } from "drizzle-orm";
import { connectDb, closeDb, getDb } from "../db";
import {
  verificationChecks,
  fraudRules,
  aiPrompts,
  scoreThresholds,
} from "../db/verificationSchema";

/**
 * Seeds the DYNAMIC engine's config tables with sensible starters. Everything
 * here is editable by admins afterwards (no redeploy). Idempotent: it skips
 * inserting checks/rules if any already exist, and ensures one active prompt +
 * a thresholds row.
 *
 * Run with:  npm --prefix server run seed:verification
 */

// Each check's sql_query is parameterised with $1 = projectId and returns a
// single row: { passed boolean, evidence jsonb }.
const CHECKS: {
  name: string;
  category: string;
  weight: number;
  logic: string;
  description: string;
  sql: string;
}[] = [
  {
    name: "RERA Registered",
    category: "government_legal",
    weight: 10,
    logic: "exists",
    description: "Project has a verified RERA registration record.",
    sql: `SELECT EXISTS(SELECT 1 FROM government_legal WHERE project_id=$1 AND data_key='rera_registration' AND verified=true) AS passed,
                 (SELECT jsonb_build_object('source','government_legal','data_key','rera_registration','raw',raw_data) FROM government_legal WHERE project_id=$1 AND data_key='rera_registration' LIMIT 1) AS evidence`,
  },
  {
    name: "Title / Land Registry Clear",
    category: "government_legal",
    weight: 10,
    logic: "exists",
    description: "A verified land-registry / title record exists.",
    sql: `SELECT EXISTS(SELECT 1 FROM government_legal WHERE project_id=$1 AND data_key='land_registry' AND verified=true) AS passed,
                 (SELECT jsonb_build_object('source','government_legal','data_key','land_registry','raw',raw_data) FROM government_legal WHERE project_id=$1 AND data_key='land_registry' LIMIT 1) AS evidence`,
  },
  {
    name: "Encumbrance Free",
    category: "government_legal",
    weight: 8,
    logic: "compare",
    description: "Encumbrance certificate present and status is clear.",
    sql: `SELECT coalesce((SELECT lower(raw_data->>'status')='clear' FROM government_legal WHERE project_id=$1 AND data_key='encumbrance' LIMIT 1), false) AS passed,
                 (SELECT jsonb_build_object('source','government_legal','data_key','encumbrance','status',raw_data->>'status') FROM government_legal WHERE project_id=$1 AND data_key='encumbrance' LIMIT 1) AS evidence`,
  },
  {
    name: "No Active Court Cases",
    category: "government_legal",
    weight: 8,
    logic: "absence",
    description: "No active litigation recorded against the property.",
    sql: `SELECT NOT EXISTS(SELECT 1 FROM government_legal WHERE project_id=$1 AND data_key='court_case' AND coalesce((raw_data->>'active')::boolean,false)=true) AS passed,
                 jsonb_build_object('source','government_legal','check','no_active_court_cases') AS evidence`,
  },
  {
    name: "Approved Land Use",
    category: "government_legal",
    weight: 7,
    logic: "compare",
    description: "Master-plan land use is residential/approved.",
    sql: `SELECT coalesce((SELECT lower(raw_data->>'land_use') IN ('residential','mixed','approved') FROM government_legal WHERE project_id=$1 AND data_key='land_use' LIMIT 1), false) AS passed,
                 (SELECT jsonb_build_object('source','government_legal','land_use',raw_data->>'land_use') FROM government_legal WHERE project_id=$1 AND data_key='land_use' LIMIT 1) AS evidence`,
  },
  {
    name: "Property Tax Paid",
    category: "government_legal",
    weight: 4,
    logic: "compare",
    description: "Property tax dues are cleared.",
    sql: `SELECT coalesce((SELECT lower(raw_data->>'status')='paid' FROM government_legal WHERE project_id=$1 AND data_key='property_tax' LIMIT 1), false) AS passed,
                 (SELECT jsonb_build_object('source','government_legal','tax_status',raw_data->>'status') FROM government_legal WHERE project_id=$1 AND data_key='property_tax' LIMIT 1) AS evidence`,
  },
  {
    name: "Road Connectivity",
    category: "infrastructure",
    weight: 5,
    logic: "exists",
    description: "Motorable road access recorded.",
    sql: `SELECT EXISTS(SELECT 1 FROM infrastructure WHERE project_id=$1 AND data_key='roads') AS passed,
                 (SELECT jsonb_build_object('source','infrastructure','data_key','roads','raw',raw_data) FROM infrastructure WHERE project_id=$1 AND data_key='roads' LIMIT 1) AS evidence`,
  },
  {
    name: "Public Transit Access",
    category: "infrastructure",
    weight: 4,
    logic: "exists",
    description: "Metro / rail / bus terminal recorded nearby.",
    sql: `SELECT EXISTS(SELECT 1 FROM infrastructure WHERE project_id=$1 AND data_key IN ('metro','railway','bus_terminal')) AS passed,
                 (SELECT jsonb_agg(jsonb_build_object('data_key',data_key,'raw',raw_data)) FROM infrastructure WHERE project_id=$1 AND data_key IN ('metro','railway','bus_terminal')) AS evidence`,
  },
  {
    name: "Schools Nearby",
    category: "location_intelligence",
    weight: 3,
    logic: "exists",
    description: "At least one school recorded in the vicinity.",
    sql: `SELECT EXISTS(SELECT 1 FROM location_intelligence WHERE project_id=$1 AND data_key='schools') AS passed,
                 (SELECT jsonb_build_object('source','location_intelligence','data_key','schools','raw',raw_data) FROM location_intelligence WHERE project_id=$1 AND data_key='schools' LIMIT 1) AS evidence`,
  },
  {
    name: "Healthcare Nearby",
    category: "location_intelligence",
    weight: 3,
    logic: "exists",
    description: "Hospital / clinic recorded in the vicinity.",
    sql: `SELECT EXISTS(SELECT 1 FROM location_intelligence WHERE project_id=$1 AND data_key='hospitals') AS passed,
                 (SELECT jsonb_build_object('source','location_intelligence','data_key','hospitals','raw',raw_data) FROM location_intelligence WHERE project_id=$1 AND data_key='hospitals' LIMIT 1) AS evidence`,
  },
  {
    name: "Not in Flood Zone",
    category: "environmental_data",
    weight: 7,
    logic: "absence",
    description: "Not located in a high/severe flood-risk zone.",
    sql: `SELECT coalesce((SELECT lower(raw_data->>'risk') NOT IN ('high','severe') FROM environmental_data WHERE project_id=$1 AND data_key='flood_zone' LIMIT 1), true) AS passed,
                 (SELECT jsonb_build_object('source','environmental_data','flood_risk',raw_data->>'risk') FROM environmental_data WHERE project_id=$1 AND data_key='flood_zone' LIMIT 1) AS evidence`,
  },
  {
    name: "Acceptable Air Quality",
    category: "environmental_data",
    weight: 3,
    logic: "range",
    description: "Recorded AQI is at or below 150.",
    sql: `SELECT coalesce((SELECT (raw_data->>'aqi') ~ '^[0-9.]+$' AND (raw_data->>'aqi')::numeric <= 150 FROM environmental_data WHERE project_id=$1 AND data_key='air_quality' LIMIT 1), false) AS passed,
                 (SELECT jsonb_build_object('source','environmental_data','aqi',raw_data->>'aqi') FROM environmental_data WHERE project_id=$1 AND data_key='air_quality' LIMIT 1) AS evidence`,
  },
  {
    name: "Plot Boundaries Mapped",
    category: "satellite_gis",
    weight: 5,
    logic: "exists",
    description: "GIS plot boundary recorded from satellite/survey.",
    sql: `SELECT EXISTS(SELECT 1 FROM satellite_gis WHERE project_id=$1 AND data_key='plot_boundary') AS passed,
                 (SELECT jsonb_build_object('source','satellite_gis','data_key','plot_boundary','raw',raw_data) FROM satellite_gis WHERE project_id=$1 AND data_key='plot_boundary' LIMIT 1) AS evidence`,
  },
  {
    name: "Low Crime Area",
    category: "community_intelligence",
    weight: 4,
    logic: "range",
    description: "Safety index at or above 60 (0–100).",
    sql: `SELECT coalesce((SELECT (raw_data->>'safety_index') ~ '^[0-9.]+$' AND (raw_data->>'safety_index')::numeric >= 60 FROM community_intelligence WHERE project_id=$1 AND data_key='safety_index' LIMIT 1), false) AS passed,
                 (SELECT jsonb_build_object('source','community_intelligence','safety_index',raw_data->>'safety_index') FROM community_intelligence WHERE project_id=$1 AND data_key='safety_index' LIMIT 1) AS evidence`,
  },
  {
    name: "Positive Price Appreciation",
    category: "market_intelligence",
    weight: 3,
    logic: "range",
    description: "Recorded YoY price appreciation is positive.",
    sql: `SELECT coalesce((SELECT (raw_data->>'appreciation_pct') ~ '^-?[0-9.]+$' AND (raw_data->>'appreciation_pct')::numeric > 0 FROM market_intelligence WHERE project_id=$1 AND data_key='price_appreciation' LIMIT 1), false) AS passed,
                 (SELECT jsonb_build_object('source','market_intelligence','appreciation_pct',raw_data->>'appreciation_pct') FROM market_intelligence WHERE project_id=$1 AND data_key='price_appreciation' LIMIT 1) AS evidence`,
  },
];

// Each rule returns ROWS; any row = a fraud flag (the row is stored as evidence).
const RULES: { name: string; severity: string; description: string; sql: string }[] = [
  {
    name: "Sale value below 70% of circle rate",
    severity: "high",
    description: "Recorded sale value is under 70% of the government circle rate.",
    sql: `SELECT m.raw_data->>'sale_value' AS sale_value, g.raw_data->>'circle_rate' AS circle_rate
          FROM market_intelligence m
          JOIN government_legal g ON g.project_id=m.project_id AND g.data_key='circle_rate'
          WHERE m.project_id=$1 AND m.data_key='last_transaction'
            AND (m.raw_data->>'sale_value') ~ '^[0-9.]+$' AND (g.raw_data->>'circle_rate') ~ '^[0-9.]+$'
            AND (m.raw_data->>'sale_value')::numeric < 0.7 * (g.raw_data->>'circle_rate')::numeric`,
  },
  {
    name: "Sold 3+ times in 12 months",
    severity: "high",
    description: "Unusually frequent ownership churn.",
    sql: `SELECT count(*) AS transactions FROM market_intelligence
          WHERE project_id=$1 AND data_key='past_transactions'
            AND (raw_data->>'date') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' AND (raw_data->>'date')::date > now() - interval '12 months'
          HAVING count(*) >= 3`,
  },
  {
    name: "Marketed as RERA-approved but no RERA record",
    severity: "high",
    description: "Claims RERA approval with no verified RERA registration.",
    sql: `SELECT p.id FROM projects p
          WHERE p.id=$1 AND lower(coalesce(p.rera_status::text,''))='registered'
            AND NOT EXISTS(SELECT 1 FROM government_legal WHERE project_id=$1 AND data_key='rera_registration' AND verified=true)`,
  },
  {
    name: "Active encumbrance present",
    severity: "medium",
    description: "Encumbrance certificate shows an active charge.",
    sql: `SELECT raw_data FROM government_legal WHERE project_id=$1 AND data_key='encumbrance' AND lower(coalesce(raw_data->>'status',''))<>'clear'`,
  },
  {
    name: "Active court case",
    severity: "high",
    description: "Active litigation recorded against the property.",
    sql: `SELECT raw_data FROM government_legal WHERE project_id=$1 AND data_key='court_case' AND coalesce((raw_data->>'active')::boolean,false)=true`,
  },
  {
    name: "High flood-risk zone",
    severity: "medium",
    description: "Located in a high/severe flood-risk zone.",
    sql: `SELECT raw_data FROM environmental_data WHERE project_id=$1 AND data_key='flood_zone' AND lower(coalesce(raw_data->>'risk','')) IN ('high','severe')`,
  },
  {
    name: "Land-use mismatch (agricultural sold as residential)",
    severity: "high",
    description: "Master-plan land use is agricultural.",
    sql: `SELECT raw_data FROM government_legal WHERE project_id=$1 AND data_key='land_use' AND lower(coalesce(raw_data->>'land_use',''))='agricultural'`,
  },
  {
    name: "Duplicate land-registry number",
    severity: "high",
    description: "The same registry number appears on another project.",
    sql: `SELECT g.raw_data->>'registry_no' AS registry_no, count(*) AS occurrences
          FROM government_legal g
          WHERE g.data_key='land_registry' AND g.raw_data->>'registry_no' IS NOT NULL
            AND g.raw_data->>'registry_no' = (SELECT raw_data->>'registry_no' FROM government_legal WHERE project_id=$1 AND data_key='land_registry' LIMIT 1)
          GROUP BY 1 HAVING count(*) > 1`,
  },
];

const DEFAULT_PROMPT = `You are Truvi's real-estate verification assistant for the Indian market.

STRICT RULES:
- Answer ONLY from the DATA provided in the context. Never use outside knowledge or assumptions.
- Cite the exact source (category + data_key, or verification result) for every factual claim.
- If the answer is not present in the provided data, reply exactly: "Data unavailable for this."
- Never guess, estimate, or fabricate numbers, approvals, prices, or legal status.
- Be concise, neutral and evidence-led. Do not give investment advice or legal opinions.
- If data appears contradictory or a fraud flag is present, state that plainly and cite it.`;

async function run() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL is not set. Add it to server/.env first.");
  connectDb(url);
  const db = getDb();
  await db.execute(sql`select 1`);

  const [{ count: checkCount }] = (await db.execute(
    sql`SELECT count(*)::int AS count FROM verification_checks`
  )) as unknown as { count: number }[];

  if (checkCount > 0) {
    console.log(`verification_checks already has ${checkCount} row(s) — skipping check seed.`);
  } else {
    await db.insert(verificationChecks).values(
      CHECKS.map((c) => ({
        name: c.name,
        category: c.category as any,
        weight: c.weight,
        enabled: true,
        logicType: c.logic as any,
        sqlQuery: c.sql,
        description: c.description,
      }))
    );
    console.log(`Seeded ${CHECKS.length} verification checks.`);
  }

  const [{ count: ruleCount }] = (await db.execute(
    sql`SELECT count(*)::int AS count FROM fraud_rules`
  )) as unknown as { count: number }[];

  if (ruleCount > 0) {
    console.log(`fraud_rules already has ${ruleCount} row(s) — skipping rule seed.`);
  } else {
    await db.insert(fraudRules).values(
      RULES.map((r) => ({
        name: r.name,
        enabled: true,
        sqlQuery: r.sql,
        severity: r.severity as any,
        description: r.description,
      }))
    );
    console.log(`Seeded ${RULES.length} fraud rules.`);
  }

  const [{ count: promptCount }] = (await db.execute(
    sql`SELECT count(*)::int AS count FROM ai_prompts WHERE active=true`
  )) as unknown as { count: number }[];

  if (promptCount === 0) {
    await db.insert(aiPrompts).values({
      name: "Default verification assistant",
      systemPrompt: DEFAULT_PROMPT,
      active: true,
      version: 1,
    });
    console.log("Seeded default active AI prompt.");
  } else {
    console.log("An active AI prompt already exists — leaving it as is.");
  }

  const [{ count: thrCount }] = (await db.execute(
    sql`SELECT count(*)::int AS count FROM score_thresholds`
  )) as unknown as { count: number }[];
  if (thrCount === 0) {
    await db.insert(scoreThresholds).values({ verifiedMin: 85, pendingMin: 50 });
    console.log("Seeded default score thresholds (Verified 85 / Pending 50).");
  }

  console.log("Verification engine seed complete.");
  await closeDb();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
