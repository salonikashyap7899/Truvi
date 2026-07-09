import { and, count, eq, inArray, lte, or, sql, desc } from "drizzle-orm";
import { getDb } from "../config/db";
import { projects, units, users, siteVisits, type IProject } from "../db/schema";

/* ============================================================
   Ask Truvi AI — Decision Intelligence data layer
   Every fact handed to the model carries a source label and,
   where known, a last-updated date. The model is instructed to
   surface these verbatim (spec features 6, 8, 15).
   ============================================================ */

export type SourceLabel =
  | "TRUVI_VERIFIED"
  | "PUBLIC_RECORD"
  | "BUILDER_SUBMITTED"
  | "USER_SUBMITTED";

export type Intent =
  | "PROJECT_SEARCH"
  | "COMPARE"
  | "BUILDER"
  | "LOCATION"
  | "BUDGET_SEARCH"
  | "VERIFICATION"
  | "SCORE_EXPLAIN"
  | "DOCUMENTS"
  | "RED_FLAGS"
  | "INVESTMENT"
  | "GENERAL";

export interface RetrievedContext {
  intent: Intent;
  projects: ProjectFacts[];
  builders: BuilderFacts[];
  location: LocationFacts | null;
  budgetQuery: BudgetQuery | null;
  retrievalNotes: string[];
}

interface FactValue {
  value: string | number | boolean | null;
  source: SourceLabel;
  lastUpdated?: string;
}

export interface ProjectFacts {
  id: string;
  name: string;
  facts: Record<string, FactValue>;
}

export interface BuilderFacts {
  id: string;
  name: string;
  companyName?: string;
  projectCount: number;
  verifiedProjectCount: number;
  avgTrustScore: number | null;
  projects: string[];
  source: SourceLabel;
}

export interface LocationFacts {
  query: string;
  projectCount: number;
  verifiedCount: number;
  avgTrustScore: number | null;
  priceRange: { min: number; max: number } | null;
  projectNames: string[];
  source: SourceLabel;
}

export interface BudgetQuery {
  maxBudget: number | null;
  bhk: string | null;
  city: string | null;
}

/* ---------------- Intent detection (spec: Conversational Interface) ---------------- */

export function detectIntent(message: string): Intent {
  const m = message.toLowerCase();
  const has = (...words: string[]) => words.some((w) => m.includes(w));

  if (has(" vs ", "compare", "comparison", "muqabla", "beech mein", "better hai ya")) return "COMPARE";
  if (parseBudgetQuery(message).maxBudget !== null && has("bhk", "flat", "apartment", "ghar", "home", "budget"))
    return "BUDGET_SEARCH";
  if (has("builder", "developer ke", "developer ka", "track record", "kaun bana raha", "who is building"))
    return "BUILDER";
  if (has("verify kiya", "verification", "verified kaise", "how was", "kaise check")) return "VERIFICATION";
  if (has("score kyun", "score why", "trust score", "score explain", "score ka matlab")) return "SCORE_EXPLAIN";
  if (has("document", "rera", "brochure", "approval", "papers", "kagaz")) return "DOCUMENTS";
  if (has("red flag", "risk", "concern", "problem", "dikkat", "issue", "safe hai")) return "RED_FLAGS";
  if (has("investment", "rental", "appreciation", "returns", "roi", "self-use", "self use", "kiraya"))
    return "INVESTMENT";
  if (has("area", "location kaisa", "kaisa hai", "locality", "neighbourhood", "neighborhood", "invest ke liye"))
    return "LOCATION";
  return "PROJECT_SEARCH";
}

/* ---------------- Budget parsing: "₹70 lakh, 3BHK, Lucknow" ---------------- */

export function parseBudgetQuery(message: string): BudgetQuery {
  const m = message.toLowerCase();
  let maxBudget: number | null = null;

  const lakh = m.match(/(\d+(?:\.\d+)?)\s*(?:lakh|lac|lakhs|l\b)/);
  const cr = m.match(/(\d+(?:\.\d+)?)\s*(?:crore|cr\b|crores)/);
  const plain = m.match(/(?:₹|rs\.?|inr)\s*([\d,]{5,})/);
  if (cr) maxBudget = Math.round(parseFloat(cr[1]) * 1_00_00_000);
  else if (lakh) maxBudget = Math.round(parseFloat(lakh[1]) * 1_00_000);
  else if (plain) maxBudget = parseInt(plain[1].replace(/,/g, ""), 10);

  const bhkMatch = m.match(/(\d)\s*bhk/);
  const bhk = bhkMatch ? `${bhkMatch[1]}BHK` : null;

  return { maxBudget, bhk, city: null };
}

/* ---------------- Helpers ---------------- */

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function fmtDate(d?: Date | null): string | undefined {
  return d ? new Date(d).toISOString().slice(0, 10) : undefined;
}

const STOPWORDS = new Set([
  "the", "and", "for", "with", "kaise", "kaisa", "kya", "hai", "mein", "ke", "ka", "ki", "ko",
  "baare", "batao", "about", "tell", "compare", "karo", "project", "projects", "builder",
  "investment", "liye", "better", "budget", "bhk", "flat", "lakh", "crore", "this", "that",
  "score", "trust", "verify", "verification", "document", "documents", "location", "area",
]);

function meaningfulTokens(message: string): string[] {
  return message
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t.toLowerCase()));
}

/* ---------------- Fact assembly ---------------- */

async function buildProjectFacts(project: IProject): Promise<ProjectFacts> {
  const db = getDb();
  const unitRows = await db.select().from(units).where(eq(units.projectId, project._id));
  const [developer] = await db.select().from(users).where(eq(users._id, project.developerId)).limit(1);
  const [{ value: visitCount }] = await db
    .select({ value: count() })
    .from(siteVisits)
    .where(and(eq(siteVisits.projectId, project._id), eq(siteVisits.attendanceConfirmed, true)));

  const prices = unitRows.map((u) => u.price).filter((p) => p > 0);
  const psf = unitRows.filter((u) => u.areaSqft > 0).map((u) => u.price / u.areaSqft);
  const available = unitRows.filter((u) => u.status === "AVAILABLE").length;
  const types = [...new Set(unitRows.map((u) => u.type))];
  const verifiedDate = fmtDate(project.verifiedAt) ?? fmtDate(project.createdAt);

  const facts: Record<string, FactValue> = {
    city: { value: project.city, source: "BUILDER_SUBMITTED" },
    location: { value: project.location, source: "BUILDER_SUBMITTED" },
    description: { value: project.description?.slice(0, 400) ?? null, source: "BUILDER_SUBMITTED" },
    truviVerified: { value: project.isVerified, source: "TRUVI_VERIFIED", lastUpdated: verifiedDate },
    trustScore: { value: project.trustScore ?? null, source: "TRUVI_VERIFIED", lastUpdated: verifiedDate },
    legalRiskLevel: { value: project.legalRiskLevel ?? null, source: "TRUVI_VERIFIED", lastUpdated: verifiedDate },
    floodRiskLevel: { value: project.floodRiskLevel ?? null, source: "TRUVI_VERIFIED", lastUpdated: verifiedDate },
    crimeIndexLevel: { value: project.crimeIndexLevel ?? null, source: "TRUVI_VERIFIED", lastUpdated: verifiedDate },
    reraStatus: { value: project.reraStatus ?? null, source: "PUBLIC_RECORD" },
    reraNumber: { value: project.reraNumber ?? null, source: "PUBLIC_RECORD" },
    reraValidityDate: { value: fmtDate(project.reraValidityDate) ?? null, source: "PUBLIC_RECORD" },
    unitTypes: { value: types.join(", ") || null, source: "BUILDER_SUBMITTED" },
    priceMin: { value: prices.length ? Math.min(...prices) : null, source: "BUILDER_SUBMITTED" },
    priceMax: { value: prices.length ? Math.max(...prices) : null, source: "BUILDER_SUBMITTED" },
    avgPricePerSqft: {
      value: psf.length ? Math.round(psf.reduce((a, b) => a + b, 0) / psf.length) : null,
      source: "BUILDER_SUBMITTED",
    },
    availableUnits: { value: available, source: "BUILDER_SUBMITTED" },
    totalUnits: { value: unitRows.length, source: "BUILDER_SUBMITTED" },
    builderName: { value: developer?.name ?? null, source: "BUILDER_SUBMITTED" },
    builderCompany: {
      value: developer?.developerProfile?.companyName ?? null,
      source: "BUILDER_SUBMITTED",
    },
    confirmedSiteVisits: { value: Number(visitCount), source: "USER_SUBMITTED" },
    brochureAvailable: { value: Boolean(project.brochureUrl), source: "BUILDER_SUBMITTED" },
    priceListAvailable: { value: Boolean(project.priceListUrl), source: "BUILDER_SUBMITTED" },
  };

  return { id: String(project._id), name: project.name, facts };
}

/* ---------------- Retrieval orchestration ---------------- */

async function findProjectsInMessage(message: string, limit = 4): Promise<IProject[]> {
  const tokens = meaningfulTokens(message);
  if (tokens.length === 0) return [];
  const pattern = tokens.map(escapeRegex).join("|");
  const db = getDb();
  const candidates = await db
    .select()
    .from(projects)
    .where(and(eq(projects.approvalStatus, "APPROVED"), sql`${projects.name} ~* ${pattern}`))
    .limit(20);

  // Rank by how many tokens the name matches so "ABC Residency" beats "ABC"
  const scored = candidates
    .map((p) => ({
      p,
      score: tokens.filter((t) => p.name.toLowerCase().includes(t.toLowerCase())).length,
    }))
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.p);
}

async function findBuilders(message: string, limit = 2): Promise<BuilderFacts[]> {
  const tokens = meaningfulTokens(message);
  if (tokens.length === 0) return [];
  const pattern = tokens.map(escapeRegex).join("|");
  const db = getDb();
  const devs = await db
    .select()
    .from(users)
    .where(
      and(
        eq(users.role, "DEVELOPER"),
        or(sql`${users.name} ~* ${pattern}`, sql`COALESCE(${users.developerProfile}->>'companyName', '') ~* ${pattern}`)
      )
    )
    .limit(limit);

  const out: BuilderFacts[] = [];
  for (const d of devs) {
    const devProjects = await db
      .select()
      .from(projects)
      .where(and(eq(projects.developerId, d._id), eq(projects.approvalStatus, "APPROVED")));
    const scores = devProjects.map((p) => p.trustScore).filter((s): s is number => typeof s === "number");
    out.push({
      id: String(d._id),
      name: d.name,
      companyName: d.developerProfile?.companyName,
      projectCount: devProjects.length,
      verifiedProjectCount: devProjects.filter((p) => p.isVerified).length,
      avgTrustScore: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
      projects: devProjects.map((p) => p.name).slice(0, 8),
      source: "TRUVI_VERIFIED",
    });
  }
  return out;
}

async function detectCity(message: string): Promise<string | null> {
  const db = getDb();
  const rows = await db.selectDistinct({ city: projects.city }).from(projects).where(eq(projects.approvalStatus, "APPROVED"));
  const m = message.toLowerCase();
  const hit = rows.find((c) => c.city && m.includes(String(c.city).toLowerCase()));
  return hit?.city ?? null;
}

async function buildLocationFacts(city: string): Promise<LocationFacts> {
  const db = getDb();
  const cityProjects = await db
    .select()
    .from(projects)
    .where(and(eq(projects.approvalStatus, "APPROVED"), sql`${projects.city} ~* ${"^" + escapeRegex(city) + "$"}`));
  const ids = cityProjects.map((p) => p._id);
  const unitRows = ids.length ? await db.select().from(units).where(inArray(units.projectId, ids)) : [];
  const prices = unitRows.map((u) => u.price).filter((p) => p > 0);
  const scores = cityProjects.map((p) => p.trustScore).filter((s): s is number => typeof s === "number");
  return {
    query: city,
    projectCount: cityProjects.length,
    verifiedCount: cityProjects.filter((p) => p.isVerified).length,
    avgTrustScore: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
    priceRange: prices.length ? { min: Math.min(...prices), max: Math.max(...prices) } : null,
    projectNames: cityProjects.map((p) => p.name).slice(0, 10),
    source: "TRUVI_VERIFIED",
  };
}

async function budgetSearch(q: BudgetQuery, city: string | null, limit = 5): Promise<IProject[]> {
  const db = getDb();
  const unitConds = [eq(units.status, "AVAILABLE")];
  if (q.maxBudget) unitConds.push(lte(units.price, q.maxBudget));
  if (q.bhk) unitConds.push(sql`${units.type} ~* ${q.bhk.replace("BHK", "\\s*BHK")}`);
  const unitProjectRows = await db.selectDistinct({ projectId: units.projectId }).from(units).where(and(...unitConds));
  const projectIds = unitProjectRows.map((u) => u.projectId);
  if (projectIds.length === 0) return [];

  const conds = [inArray(projects._id, projectIds), eq(projects.approvalStatus, "APPROVED")];
  if (city) conds.push(sql`${projects.city} ~* ${"^" + escapeRegex(city) + "$"}`);
  return db.select().from(projects).where(and(...conds)).orderBy(desc(projects.trustScore)).limit(limit);
}

export async function retrieveContext(message: string): Promise<RetrievedContext> {
  const intent = detectIntent(message);
  const notes: string[] = [];
  const city = await detectCity(message);
  const budgetQuery = parseBudgetQuery(message);
  budgetQuery.city = city;

  let matchedProjects: IProject[] = [];
  let builders: BuilderFacts[] = [];
  let location: LocationFacts | null = null;

  try {
    if (intent === "BUDGET_SEARCH" && budgetQuery.maxBudget) {
      matchedProjects = await budgetSearch(budgetQuery, city);
      if (matchedProjects.length === 0)
        notes.push("No available units matched the budget/requirements in Truvi data.");
    } else {
      matchedProjects = await findProjectsInMessage(message);
      if (matchedProjects.length === 0 && intent !== "GENERAL" && intent !== "LOCATION")
        notes.push("No project in Truvi's approved listings matched the query by name.");
    }

    if (intent === "BUILDER" || builders.length === 0) {
      builders = await findBuilders(message);
    }

    if (city) {
      location = await buildLocationFacts(city);
    } else if (intent === "LOCATION") {
      notes.push("The mentioned area is not a city Truvi currently has approved projects in.");
    }
  } catch (err) {
    notes.push("Some Truvi data could not be retrieved for this query.");
    console.error("Ask Truvi retrieval error:", err);
  }

  const projectFacts: ProjectFacts[] = [];
  for (const p of matchedProjects.slice(0, 4)) {
    projectFacts.push(await buildProjectFacts(p));
  }

  return { intent, projects: projectFacts, builders, location, budgetQuery, retrievalNotes: notes };
}
