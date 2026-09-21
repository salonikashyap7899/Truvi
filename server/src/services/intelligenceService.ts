import { IProject } from "../db/schema";

/**
 * Raw Data Sources & AI Intelligence Engine.
 *
 * The Truvi Score is built from SEVEN fields the founder actually fills per
 * listing — nothing speculative. Each category shows only its real data point(s)
 * plus any admin-uploaded (RAG) evidence, each attributed to its source and
 * carrying a verification status. A category contributes its full weight once
 * its primary field is filled (or the whole listing is admin-Verified); until
 * then it earns partial credit from uploaded data. Physical site visit is the
 * one thing only a real Truvi visit can confirm.
 */

export type IntelStatus = "VERIFIED" | "PENDING" | "UNAVAILABLE";

export interface IntelItem {
  label: string;
  source: string;
  status: IntelStatus;
  detail?: string;
}

export interface IntelCategory {
  key: string;
  title: string;
  items: IntelItem[];
  verifiedCount: number;
  totalCount: number;
}

/** One line of the Truvi Score breakdown — what an area scored, out of how
 *  much, where the evidence comes from, and when it was last confirmed. */
export interface ScoreSignal {
  label: string;
  score: number;
  max: number;
  sourceLabel: string;
  verified: boolean;
  lastUpdated: string | null;
}

export interface AIVerification {
  crossVerifiedSources: number;
  evidenceCount: number;
  riskFlags: string[];
  fraudSignals: string[];
  confidenceScore: number;
  /** The per-signal contributions that add up to the Truvi Score. */
  scoreBreakdown: ScoreSignal[];
  overallStatus: IntelStatus;
  decisionSummary: string;
}

export interface IntelligenceProfile {
  projectId: string;
  projectName: string;
  generatedAt: string;
  categories: IntelCategory[];
  ai: AIVerification;
}

/** One score/intel category key — the seven fields the Truvi Score is built on. */
export type IntelCategoryKey =
  | "government" | "infrastructure" | "sitevisit" | "market" | "environmental" | "gis" | "community";

/** Admin-uploaded (RAG-ingested) data for one category. Either the actual data
 *  points (shown on the detail panel, each with its real source) or, for the
 *  lightweight list score, just aggregate counts. */
export interface RagCategoryInput {
  items?: IntelItem[];
  verified?: number;
  pending?: number;
}
export type RagInput = Partial<Record<IntelCategoryKey, RagCategoryInput>>;

/** Per-category weight — the seven founder-filled fields, summing to 100.
 *  Physical site visit is worth 20 and stays locked until a real visit, so an
 *  un-visited listing caps at 80. */
const CATEGORY_WEIGHT: Record<IntelCategoryKey, number> = {
  government: 20,
  infrastructure: 15,
  sitevisit: 20,
  market: 15,
  environmental: 10,
  gis: 10,
  community: 10,
};

const AUTHORITY_LABEL: Record<string, string> = {
  RERA: "RERA",
  DISTRICT_PANCHAYAT: "District Panchayat",
  DTCP: "Development Authority (DTCP)",
};

export function buildIntelligenceProfile(project: IProject, rag: RagInput = {}): IntelligenceProfile {
  const vd = project.verificationDetails;
  const isVerified = project.isVerified === true;
  const verifiedDate = project.verifiedAt ? new Date(project.verifiedAt).toISOString() : null;

  // 1) Government & Legal — the approval number the founder fills (RERA /
  // District Panchayat / Developer Authority). The number itself is the
  // evidence; the authority dropdown is just its label.
  const hasApproval = !!project.reraNumber;
  const reraOk = !!vd?.reraVerified || project.reraStatus === "REGISTERED" || hasApproval;
  const authorityName = project.approvalAuthority ? AUTHORITY_LABEL[project.approvalAuthority] ?? "RERA" : "RERA";
  const approvalSource = project.reraNumber ? `${authorityName} · Reg. No. ${project.reraNumber}` : authorityName;

  // 6) Coordinates, 3) Site visit, 2) Connectivity, 5) Crime/Flood.
  const hasCoords = typeof project.lat === "number" && typeof project.lng === "number";
  const siteVisited = project.teamSiteVisited === true;
  const info = project.presentationInfo;
  const hasConnectivity = !!(info?.connectivityNotes && info.connectivityNotes.trim());
  const hasRisk = !!project.crimeIndexLevel && !!project.floodRiskLevel;

  // Admin-uploaded (RAG) evidence for a category: appended items + counts.
  const ragOf = (key: IntelCategoryKey) => {
    const r = rag[key];
    const items = r?.items ?? [];
    const verifiedN = r?.items ? items.filter((i) => i.status === "VERIFIED").length : r?.verified ?? 0;
    const pendingN = r?.items ? items.filter((i) => i.status === "PENDING").length : r?.pending ?? 0;
    return { items, verifiedN, pendingN };
  };

  // Build a category from one primary "real" data point + any uploaded RAG rows.
  // Each category is verified strictly by ITS OWN field being filled — the
  // Verified toggle does NOT blanket-flip everything (that made every listing an
  // identical 80). So the score differentiates: a project with more fields
  // filled scores higher than one with fewer.
  function buildCat(
    key: IntelCategoryKey,
    title: string,
    primary: { label: string; source: string; verified: boolean; detailV: string; detailP: string },
  ): IntelCategory {
    const primaryVerified = primary.verified;
    const ragI = ragOf(key).items;
    const items: IntelItem[] = [];
    // Show the primary data point when its own field is set, or as a prompt when
    // there's no uploaded evidence yet. If uploaded evidence exists but the field
    // isn't set, the uploaded rows ARE the data — don't also show the pending
    // placeholder (that produced a duplicate "Crime & Flood Index", etc.).
    if (primaryVerified || ragI.length === 0) {
      items.push({
        label: primary.label,
        source: primary.source,
        status: primaryVerified ? "VERIFIED" : "PENDING",
        detail: primaryVerified ? primary.detailV : primary.detailP,
      });
    }
    items.push(...ragI);
    return {
      key,
      title,
      items,
      verifiedCount: items.filter((i) => i.status === "VERIFIED").length,
      totalCount: items.length,
    };
  }

  const government = buildCat("government", "Government & Legal Data", {
    label: "Approval — RERA / District Panchayat / Developer Authority",
    source: approvalSource,
    verified: reraOk,
    detailV: `${authorityName} approval on record.`,
    detailP: "Add the approving authority + registration/approval number.",
  });

  const infrastructure = buildCat("infrastructure", "Infrastructure & Connectivity", {
    label: "Connectivity",
    source: hasConnectivity ? "Developer / Truvi field survey" : "Pending",
    verified: hasConnectivity,
    detailV: info?.connectivityNotes ?? "Connectivity captured.",
    detailP: "Add connectivity (roads, highways, metro, key distances).",
  });

  const sitevisit = buildCat(
    "sitevisit",
    "Site Visit by Truvi",
    {
      label: "Physical Site Visit by Truvi",
      source: "Truvi field team",
      verified: siteVisited,
      detailV: "Truvi team has physically visited and inspected the site.",
      detailP: "Awaiting a Truvi team site visit.",
    },
  );

  const market = buildCat("market", "Market Intelligence", {
    label: "Market Rate Analysis",
    source: "Comparable listings · IGRS circle rates",
    verified: ragOf("market").verifiedN > 0,
    detailV: "Asking price checked against the observed market range.",
    detailP: "Add local rate evidence to validate the asking price.",
  });

  const environmental = buildCat("environmental", "Environmental Intelligence", {
    label: "Crime & Flood Index",
    source: "NCRB · UP Irrigation flood maps",
    verified: hasRisk,
    detailV: `Crime index ${project.crimeIndexLevel ?? "—"} · Flood risk ${project.floodRiskLevel ?? "—"}.`,
    detailP: "Set the crime index and flood risk for this locality.",
  });

  const gis = buildCat("gis", "Satellite & GIS — Coordinates", {
    label: "Exact Site Coordinates",
    source: hasCoords ? `Truvi field GPS (${project.lat!.toFixed(5)}, ${project.lng!.toFixed(5)})` : "Pending",
    verified: hasCoords,
    detailV: "Precise location captured on site.",
    detailP: "Drop the exact map pin for this project.",
  });

  const community = buildCat("community", "Community Intelligence", {
    label: "Truvi Assessment",
    source: "Truvi Research",
    verified: isVerified,
    detailV: "Truvi's overall read on this project and locality.",
    detailP: "Truvi's assessment is added once the listing is verified.",
  });

  const categories = [government, infrastructure, sitevisit, market, environmental, gis, community];

  // ── Score: each category contributes its full weight once its primary field
  // is verified; otherwise partial credit from uploaded (pending) evidence. ──
  const RAG_TARGET = 3; // ~3 uploaded points fully cover a category on their own
  const PENDING_WEIGHT = 0.4;
  const signalFor = (cat: IntelCategory, label: string): ScoreSignal => {
    const key = cat.key as IntelCategoryKey;
    const max = CATEGORY_WEIGHT[key];
    const { verifiedN, pendingN } = ragOf(key);
    // Full weight when the category's own field is set OR it has verified
    // uploaded evidence; otherwise partial credit from pending uploads.
    const fullyBacked = cat.items[0]?.status === "VERIFIED" || verifiedN > 0;
    let score: number;
    if (fullyBacked) score = max;
    else {
      const cov = Math.min((PENDING_WEIGHT * pendingN) / RAG_TARGET, 1);
      score = Math.round(max * cov);
    }
    return {
      label,
      score,
      max,
      sourceLabel: cat.items[0]?.source ?? "",
      verified: fullyBacked,
      lastUpdated: fullyBacked ? verifiedDate : null,
    };
  };

  const scoreBreakdown: ScoreSignal[] = [
    signalFor(government, "Government & Legal"),
    signalFor(infrastructure, "Infrastructure & Connectivity"),
    signalFor(sitevisit, "Site Visit by Truvi"),
    signalFor(market, "Market & Price"),
    signalFor(environmental, "Environmental (Crime/Flood)"),
    signalFor(gis, "Coordinates (GIS)"),
    signalFor(community, "Community (Truvi's take)"),
  ];

  // ── Risk flags ──
  const riskFlags: string[] = [];
  if (project.legalRiskLevel === "HIGH") riskFlags.push("Elevated legal risk — litigation records under review.");
  if (project.floodRiskLevel === "HIGH") riskFlags.push("Located in or near a flood-prone zone.");
  if (project.crimeIndexLevel === "HIGH") riskFlags.push("Higher-than-average crime index in the locality.");
  if (!reraOk && !isVerified) riskFlags.push("Approval / RERA not yet confirmed.");

  const fraudSignals: string[] = [];
  if (!isVerified && !vd?.titleClearance && !vd?.encumbranceFree) {
    fraudSignals.push("Ownership documents not yet cross-verified against registry records.");
  }

  let confidence = scoreBreakdown.reduce((sum, s) => sum + s.score, 0);
  confidence -= riskFlags.length * 4; // each open risk flag costs points
  confidence = Math.max(0, Math.min(100, confidence));

  const allItems = categories.flatMap((c) => c.items);
  const verified = allItems.filter((i) => i.status === "VERIFIED").length;
  const pending = allItems.filter((i) => i.status === "PENDING").length;

  const overallStatus: IntelStatus =
    isVerified || confidence >= 75 ? "VERIFIED" : pending > 0 ? "PENDING" : "UNAVAILABLE";

  const decisionSummary =
    overallStatus === "VERIFIED"
      ? `${verified} of ${allItems.length} checks verified across ${categories.length} categories. ` +
        (riskFlags.length === 0
          ? "No material risks detected — this listing is decision-ready."
          : `${riskFlags.length} risk flag${riskFlags.length > 1 ? "s" : ""} to review before deciding.`)
      : `Verification in progress — ${verified} of ${allItems.length} checks confirmed so far.`;

  return {
    projectId: String(project._id),
    projectName: project.name,
    generatedAt: new Date().toISOString(),
    categories,
    ai: {
      crossVerifiedSources: new Set(allItems.filter((i) => i.status === "VERIFIED").map((i) => i.source)).size,
      evidenceCount: verified,
      riskFlags,
      fraudSignals,
      confidenceScore: confidence,
      scoreBreakdown,
      overallStatus,
      decisionSummary,
    },
  };
}
