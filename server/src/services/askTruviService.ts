import { Types } from "mongoose";
import { Project, IProject } from "../models/Project";
import { Unit } from "../models/Unit";
import { User } from "../models/User";
import { SiteVisit } from "../models/SiteVisit";

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
  const units = await Unit.find({ projectId: project._id }).lean();
  const developer = await User.findById(project.developerId).lean();
  const visitCount = await SiteVisit.countDocuments({
    projectId: project._id,
    attendanceConfirmed: true,
  });

  const prices = units.map((u) => u.price).filter((p) => p > 0);
  const psf = units.filter((u) => u.areaSqft > 0).map((u) => u.price / u.areaSqft);
  const available = units.filter((u) => u.status === "AVAILABLE").length;
  const types = [...new Set(units.map((u) => u.type))];
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
    totalUnits: { value: units.length, source: "BUILDER_SUBMITTED" },
    builderName: { value: developer?.name ?? null, source: "BUILDER_SUBMITTED" },
    builderCompany: {
      value: (developer as { companyName?: string } | null)?.companyName ?? null,
      source: "BUILDER_SUBMITTED",
    },
    confirmedSiteVisits: { value: visitCount, source: "USER_SUBMITTED" },
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
  const candidates = await Project.find({
    approvalStatus: "APPROVED",
    name: { $regex: pattern, $options: "i" },
  })
    .limit(20)
    .lean<IProject[]>();

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
  const devs = await User.find({
    role: "DEVELOPER",
    $or: [
      { name: { $regex: pattern, $options: "i" } },
      { "developerProfile.companyName": { $regex: pattern, $options: "i" } },
      { companyName: { $regex: pattern, $options: "i" } },
    ],
  })
    .limit(limit)
    .lean();

  const out: BuilderFacts[] = [];
  for (const d of devs) {
    const projects = await Project.find({ developerId: d._id, approvalStatus: "APPROVED" }).lean<IProject[]>();
    const scores = projects.map((p) => p.trustScore).filter((s): s is number => typeof s === "number");
    out.push({
      id: String(d._id),
      name: d.name,
      companyName: (d as { companyName?: string }).companyName,
      projectCount: projects.length,
      verifiedProjectCount: projects.filter((p) => p.isVerified).length,
      avgTrustScore: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
      projects: projects.map((p) => p.name).slice(0, 8),
      source: "TRUVI_VERIFIED",
    });
  }
  return out;
}

async function detectCity(message: string): Promise<string | null> {
  const cities: string[] = await Project.distinct("city", { approvalStatus: "APPROVED" });
  const m = message.toLowerCase();
  const hit = cities.find((c) => c && m.includes(String(c).toLowerCase()));
  return hit ?? null;
}

async function buildLocationFacts(city: string): Promise<LocationFacts> {
  const projects = await Project.find({ approvalStatus: "APPROVED", city: { $regex: `^${escapeRegex(city)}$`, $options: "i" } }).lean<IProject[]>();
  const ids = projects.map((p) => p._id as Types.ObjectId);
  const units = ids.length ? await Unit.find({ projectId: { $in: ids } }).lean() : [];
  const prices = units.map((u) => u.price).filter((p) => p > 0);
  const scores = projects.map((p) => p.trustScore).filter((s): s is number => typeof s === "number");
  return {
    query: city,
    projectCount: projects.length,
    verifiedCount: projects.filter((p) => p.isVerified).length,
    avgTrustScore: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
    priceRange: prices.length ? { min: Math.min(...prices), max: Math.max(...prices) } : null,
    projectNames: projects.map((p) => p.name).slice(0, 10),
    source: "TRUVI_VERIFIED",
  };
}

async function budgetSearch(q: BudgetQuery, city: string | null, limit = 5): Promise<IProject[]> {
  const unitFilter: Record<string, unknown> = { status: "AVAILABLE" };
  if (q.maxBudget) unitFilter.price = { $lte: q.maxBudget };
  if (q.bhk) unitFilter.type = { $regex: q.bhk.replace("BHK", "\\s*BHK"), $options: "i" };
  const projectIds = await Unit.distinct("projectId", unitFilter);
  const filter: Record<string, unknown> = { _id: { $in: projectIds }, approvalStatus: "APPROVED" };
  if (city) filter.city = { $regex: `^${escapeRegex(city)}$`, $options: "i" };
  return Project.find(filter).sort({ trustScore: -1 }).limit(limit).lean<IProject[]>();
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

  const projects: ProjectFacts[] = [];
  for (const p of matchedProjects.slice(0, 4)) {
    projects.push(await buildProjectFacts(p));
  }

  return { intent, projects, builders, location, budgetQuery, retrievalNotes: notes };
}
