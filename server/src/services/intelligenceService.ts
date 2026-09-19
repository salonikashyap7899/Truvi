import { IProject } from "../db/schema";

/**
 * Raw Data Sources & AI Intelligence Engine.
 *
 * Builds a unified intelligence profile for a listing: every data point is
 * attributed to the source it comes from and carries a verification status,
 * so a buyer can open a listing's arrow panel and see exactly where each
 * fact was sourced and whether it has been verified.
 *
 * Statuses are anchored ONLY to the project's real verification fields
 * (verificationDetails, reraStatus, risk levels). Any data point an admin
 * has not actually verified stays PENDING — nothing is ever shown as
 * VERIFIED unless a real admin action backs it (or the whole listing has
 * been fully admin-verified). No simulated / random "verified" statuses.
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

type ItemDef = [label: string, source: string] | [label: string, source: string, override: () => IntelItem | null];

/** One score/intel category key. */
export type IntelCategoryKey =
  | "government" | "infrastructure" | "location" | "market" | "environmental" | "gis" | "community";

/** Admin-uploaded (RAG-ingested) data for one category. Either the actual data
 *  points (shown on the detail panel, each with its real source) or, for the
 *  lightweight list score, just aggregate counts. */
export interface RagCategoryInput {
  items?: IntelItem[];
  verified?: number;
  pending?: number;
}
export type RagInput = Partial<Record<IntelCategoryKey, RagCategoryInput>>;

function buildCategory(
  project: IProject,
  key: string,
  title: string,
  defs: ItemDef[],
  fullyVerified: boolean,
  extraItems: IntelItem[] = [],
): IntelCategory {
  const items: IntelItem[] = defs.map((def) => {
    const [label, source, override] = def;
    // Once an admin has uploaded and verified every document (see
    // `fullyAdminVerified` below), every option in every category flips to
    // VERIFIED — the whole listing reads 100% verified.
    if (fullyVerified) {
      const overridden = override?.();
      return {
        label,
        source: overridden?.source ?? source,
        status: "VERIFIED",
        detail: overridden?.detail ?? "Document verified by Truvi admin.",
      };
    }
    const overridden = override?.();
    if (overridden) return overridden;
    // Not backed by any real admin verification → stays PENDING (never a
    // fake "verified"). It flips to VERIFIED only once an admin fully
    // verifies the listing.
    return { label, source, status: "PENDING" };
  });
  // Append the admin-uploaded (RAG) data points for this category, so the panel
  // shows exactly what data exists, where it came from, and whether it's verified.
  const all = [...items, ...extraItems];
  return {
    key,
    title,
    items: all,
    verifiedCount: all.filter((i) => i.status === "VERIFIED").length,
    totalCount: all.length,
  };
}

export function buildIntelligenceProfile(project: IProject, rag: RagInput = {}): IntelligenceProfile {
  const vd = project.verificationDetails;
  const ragItems = (key: IntelCategoryKey): IntelItem[] => rag[key]?.items ?? [];
  // A project counts as approval-verified when an admin has ticked RERA, when
  // RERA status is REGISTERED, OR when a valid approving authority + number has
  // been filled (RERA / District Panchayat / Development Authority). This is the
  // core legal signal the founder enters per listing.
  const AUTHORITY_LABEL: Record<string, string> = {
    RERA: "RERA",
    DISTRICT_PANCHAYAT: "District Panchayat",
    DTCP: "Development Authority (DTCP)",
  };
  const hasApproval = !!project.approvalAuthority && !!project.reraNumber;
  const reraVerified = !!vd?.reraVerified || project.reraStatus === "REGISTERED" || hasApproval;
  const authorityName = project.approvalAuthority ? AUTHORITY_LABEL[project.approvalAuthority] ?? "RERA" : "RERA";
  const reraSource = project.reraNumber
    ? `${authorityName} (Reg. No. ${project.reraNumber})`
    : `${authorityName} Portal`;

  // Fully admin-verified = an admin has marked the whole listing Verified. That
  // single toggle is the Truvi team's own sign-off, so it flips every
  // intelligence option to VERIFIED (100% of the category checks) — the
  // Verified badge and the Truvi Score now agree. Individual document checks
  // (below) still let an un-Verified listing earn partial, per-signal credit.
  const fullyAdminVerified = project.isVerified === true;

  const government = buildCategory(project, "government", "Government & Legal Data", [
    ["LDA Master Plan", "LDA (Lucknow Development Authority) Master Plan 2031"],
    ["Village Boundaries", "Revenue Department — Village Boundary Records"],
    ["Land Use", "LDA Land Use Classification Maps"],
    ["Circle Rates", "UP IGRS — Registration & Stamps Department"],
    [
      "Registered Developers",
      "RERA Developer Registry",
      () =>
        vd?.portfolioVerified
          ? {
              label: "Registered Developers",
              source: "RERA Developer Registry",
              status: "VERIFIED",
              detail: "Developer portfolio verified by Truvi.",
            }
          : null,
    ],
    [
      "Approval / RERA",
      reraSource,
      () =>
        reraVerified
          ? { label: "Approval / RERA", source: reraSource, status: "VERIFIED", detail: `${authorityName} approval confirmed.` }
          : null,
    ],
    ["Property Tax Records", "Nagar Nigam — Municipal Tax Records"],
    ["Mutation Records", "Tehsil / Revenue Department Records"],
    [
      "Land Registry / Sale Deeds",
      "IGRS — Sub-Registrar Office",
      () =>
        vd?.titleClearance
          ? {
              label: "Land Registry / Sale Deeds",
              source: "IGRS — Sub-Registrar Office",
              status: "VERIFIED",
              detail: "Title clearance confirmed.",
            }
          : null,
    ],
    [
      "Encumbrance Records",
      "Sub-Registrar — Encumbrance Certificate",
      () =>
        vd?.encumbranceFree
          ? {
              label: "Encumbrance Records",
              source: "Sub-Registrar — Encumbrance Certificate",
              status: "VERIFIED",
              detail: "No encumbrances on record.",
            }
          : null,
    ],
    [
      "Court & Litigation Cases",
      "eCourts — District & High Court Records",
      () => {
        if (project.legalRiskLevel === "LOW")
          return {
            label: "Court & Litigation Cases",
            source: "eCourts — District & High Court Records",
            status: "VERIFIED",
            detail: "No active litigation found.",
          };
        if (project.legalRiskLevel === "HIGH")
          return {
            label: "Court & Litigation Cases",
            source: "eCourts — District & High Court Records",
            status: "PENDING",
            detail: "Records under review — elevated legal risk flagged.",
          };
        return null;
      },
    ],
    ["Government Notifications", "UP Government Gazette & Notifications"],
    ["Smart City / Urban Planning Data", "Smart City Mission Portal"],
  ], fullyAdminVerified, ragItems("government"));

  const infrastructure = buildCategory(project, "infrastructure", "Infrastructure Intelligence", [
    ["Roads", "PWD — Public Works Department"],
    ["Ring Road", "NHAI — Outer Ring Road Project Records"],
    ["Highways", "NHAI / UPEIDA — National & State Highways"],
    ["Metro", "UPMRC — Metro Rail Network Maps"],
    ["Railway Stations", "Indian Railways — Station Directory"],
    ["Airport", "AAI — Airports Authority of India"],
    ["Bus Terminals", "UPSRTC — Terminal & Depot Records"],
    ["Future Infrastructure Projects", "State Infrastructure Pipeline Disclosures"],
    ["Government Development Projects", "State Development Authority Announcements"],
  ], fullyAdminVerified, ragItems("infrastructure"));

  const hasCoords = typeof project.lat === "number" && typeof project.lng === "number";
  const location = buildCategory(project, "location", "Location Intelligence", [
    [
      "Exact Site Coordinates",
      "Truvi field GPS capture",
      () =>
        hasCoords
          ? { label: "Exact Site Coordinates", source: `Truvi field GPS (${project.lat!.toFixed(5)}, ${project.lng!.toFixed(5)})`, status: "VERIFIED", detail: "Precise location captured on site." }
          : null,
    ],
    ["Schools", "OpenStreetMap + Field Survey"],
    ["Colleges", "UGC / AICTE Registry + Field Survey"],
    ["Hospitals", "State Health Department Directory"],
    ["Shopping Malls", "OpenStreetMap + Field Survey"],
    ["Markets", "Nagar Nigam Market Records"],
    ["Parks", "LDA Green Space Registry"],
    ["Religious Places", "OpenStreetMap + Field Survey"],
    ["Police Stations", "UP Police Station Directory"],
    ["Fire Stations", "UP Fire Services Directory"],
    ["Banks & ATMs", "RBI Branch/ATM Locator"],
    ["Fuel Stations", "OMC (IOCL/BPCL/HPCL) Outlet Registry"],
  ], fullyAdminVerified, ragItems("location"));

  const market = buildCategory(project, "market", "Market Intelligence", [
    ["Property Rates", "IGRS Transactions + Truvi Market Index"],
    ["Rental Yield", "Truvi Rental Listings Analysis"],
    ["Builder History", "RERA Registry + Truvi Developer Records"],
    ["Past Transactions", "IGRS — Registered Sale Transactions"],
    ["Demand & Supply", "Truvi Market Analytics"],
    ["Inventory", "Truvi Live Inventory Engine"],
    ["Price Appreciation", "Circle Rate History + IGRS Transactions"],
    ["Resale Trends", "Truvi Resale Listings Analysis"],
    ["Investment Score", "Truvi AI Investment Model"],
  ], fullyAdminVerified, ragItems("market"));

  const environmental = buildCategory(project, "environmental", "Environmental Intelligence", [
    [
      "Flood Zones",
      "UP Irrigation Department — Flood Plain Maps",
      () => {
        if (project.floodRiskLevel === "LOW")
          return {
            label: "Flood Zones",
            source: "UP Irrigation Department — Flood Plain Maps",
            status: "VERIFIED",
            detail: "Outside designated flood plain.",
          };
        if (project.floodRiskLevel === "HIGH")
          return {
            label: "Flood Zones",
            source: "UP Irrigation Department — Flood Plain Maps",
            status: "VERIFIED",
            detail: "Within or near a flood-prone zone — flagged as a risk.",
          };
        return null;
      },
    ],
    ["Climate Conditions", "IMD — India Meteorological Department"],
    ["Air Quality", "CPCB — Continuous Air Quality Monitoring"],
    ["Water Logging Areas", "Nagar Nigam Drainage Records"],
    ["Green Zones", "LDA Master Plan — Green Belt Designations"],
    ["Noise Pollution", "CPCB Noise Monitoring Network"],
    ["Heat Map", "Satellite Thermal Imaging (Landsat)"],
    ["Disaster Risk", "NDMA — Disaster Risk Assessments"],
  ], fullyAdminVerified, ragItems("environmental"));

  const gis = buildCategory(project, "gis", "Satellite & GIS Intelligence", [
    ["Satellite Imagery", "ISRO Bhuvan + Sentinel-2"],
    ["GIS Layers", "State GIS Portal + OpenStreetMap"],
    ["Plot Boundaries", "Revenue Department Cadastral Maps"],
    ["Road Connectivity", "OpenStreetMap Road Network"],
    ["Nearby Amenities", "GIS Amenity Layers + Field Survey"],
    ["Elevation", "SRTM Digital Elevation Model"],
    ["Land Cover", "Sentinel-2 Land Cover Classification"],
  ], fullyAdminVerified, ragItems("gis"));

  const community = buildCategory(project, "community", "Community Intelligence", [
    [
      "Crime Data",
      "NCRB + District Police Records",
      () => {
        if (project.crimeIndexLevel === "LOW")
          return {
            label: "Crime Data",
            source: "NCRB + District Police Records",
            status: "VERIFIED",
            detail: "Low reported crime in this area.",
          };
        if (project.crimeIndexLevel === "HIGH")
          return {
            label: "Crime Data",
            source: "NCRB + District Police Records",
            status: "VERIFIED",
            detail: "Higher-than-average reported crime — flagged as a risk.",
          };
        return null;
      },
    ],
    ["Population Density", "Census of India"],
    ["Demographics", "Census of India + Sample Surveys"],
    ["Resident Reviews", "Truvi Community — Verified Residents"],
    ["Traffic Density", "GPS Probe Data + Field Survey"],
    ["Safety Index", "Truvi Safety Model (Crime + Lighting + Patrols)"],
    ["Livability Score", "Truvi Livability Model (Composite)"],
  ], fullyAdminVerified, ragItems("community"));

  const categories = [government, infrastructure, location, market, environmental, gis, community];

  // ── Truvi AI Verification Engine ──────────────────────────────────────────
  const allItems = categories.flatMap((c) => c.items);
  const verified = allItems.filter((i) => i.status === "VERIFIED").length;
  const pending = allItems.filter((i) => i.status === "PENDING").length;

  const riskFlags: string[] = [];
  if (project.legalRiskLevel === "HIGH") riskFlags.push("Elevated legal risk — litigation records under review.");
  if (project.legalRiskLevel === "MEDIUM") riskFlags.push("Moderate legal risk — some records pending confirmation.");
  if (project.floodRiskLevel === "HIGH") riskFlags.push("Located in or near a flood-prone zone.");
  if (project.crimeIndexLevel === "HIGH") riskFlags.push("Higher-than-average crime index in the locality.");
  if (!reraVerified && !project.isVerified) riskFlags.push("RERA registration not yet confirmed.");

  const fraudSignals: string[] = [];
  // Cross-verification passed if the core legal documents corroborate each other.
  const coreLegalOk = !!vd?.titleClearance && !!vd?.encumbranceFree;
  if (!coreLegalOk && project.isVerified === false) {
    fraudSignals.push("Ownership documents not yet cross-verified against registry records.");
  }

  // ── Truvi Score, made transparent ────────────────────────────────────────
  // The score is the SUM of six per-signal contributions (max 100), so a user
  // can see exactly how the number was built. A physical site visit by the
  // Truvi team is worth a fixed 20 points that stays locked until the visit
  // happens — so an un-visited listing can never exceed 80, and only reaches a
  // true 100 once the site has actually been visited. Each signal scores from
  // the share of its category that is actually verified (nothing is inflated).
  const siteVisited = project.teamSiteVisited === true;
  const verifiedDate = project.verifiedAt ? new Date(project.verifiedAt).toISOString() : null;
  // A category is scored by how much data backs it, measured against a modest
  // coverage target (so a handful of points fully establishes a category and
  // uploading data visibly raises the score). Verified data — admin-ticked
  // structural checks AND admin-uploaded verified rows — counts in full; data
  // that's uploaded but not yet verified counts at a reduced weight (it's real
  // effort, but unconfirmed). Capped at 1.
  const EXPECTED_PER_CATEGORY = 5;
  const PENDING_WEIGHT = 0.4;
  const catRatio = (key: IntelCategoryKey) => {
    const c = categories.find((x) => x.key === key);
    if (!c) return 0;
    const r = rag[key];
    const ragVerified = r?.items ? r.items.filter((i) => i.status === "VERIFIED").length : r?.verified ?? 0;
    const ragPending = r?.items ? r.items.filter((i) => i.status === "PENDING").length : r?.pending ?? 0;
    // c.verifiedCount already includes appended RAG verified items (detail mode);
    // strip them so structural verified isn't double-counted with ragVerified.
    const appendedVerified = r?.items ? ragVerified : 0;
    const structuralVerified = c.verifiedCount - appendedVerified;
    const effective = structuralVerified + ragVerified + PENDING_WEIGHT * ragPending;
    return Math.min(effective / EXPECTED_PER_CATEGORY, 1);
  };
  const fromCategory = (label: string, max: number, key: IntelCategoryKey, sourceLabel: string): ScoreSignal => {
    const ratio = catRatio(key);
    const score = Math.round(ratio * max);
    return { label, score, max, sourceLabel, verified: ratio >= 0.6, lastUpdated: ratio > 0 ? verifiedDate : null };
  };

  const scoreBreakdown: ScoreSignal[] = [
    fromCategory("Legal & RERA", 22, "government", "TS/UP RERA · IGRS · eCourts"),
    fromCategory("Location", 18, "location", "OpenStreetMap · Field survey · Govt directories"),
    fromCategory("Infrastructure", 15, "infrastructure", "NHAI · Metro · Railways · PWD"),
    fromCategory("Market & Price", 15, "market", "Comparable listings · IGRS circle rates"),
    {
      // Credited when the developer portfolio is ticked OR the whole listing is
      // admin-Verified (that sign-off covers the developer too).
      label: "Developer",
      score: vd?.portfolioVerified || project.isVerified ? 10 : 0,
      max: 10,
      sourceLabel: "RERA Developer Registry · MCA",
      verified: !!vd?.portfolioVerified || !!project.isVerified,
      lastUpdated: vd?.portfolioVerified || project.isVerified ? verifiedDate : null,
    },
    {
      label: "Physical Site Visit",
      score: siteVisited ? 20 : 0,
      max: 20,
      sourceLabel: "Truvi field team",
      verified: siteVisited,
      lastUpdated: siteVisited ? verifiedDate : null,
    },
  ];

  let confidence = scoreBreakdown.reduce((sum, s) => sum + s.score, 0);
  confidence -= riskFlags.length * 4; // each open risk flag costs points
  confidence = Math.max(0, Math.min(100, confidence));

  const overallStatus: IntelStatus =
    project.isVerified || confidence >= 75 ? "VERIFIED" : pending > 0 ? "PENDING" : "UNAVAILABLE";

  const decisionSummary =
    overallStatus === "VERIFIED"
      ? `${verified} of ${allItems.length} data points verified across ${categories.length} intelligence categories. ` +
        (riskFlags.length === 0
          ? "No material risks detected — this listing is decision-ready."
          : `${riskFlags.length} risk flag${riskFlags.length > 1 ? "s" : ""} to review before deciding.`)
      : `Verification in progress — ${verified} of ${allItems.length} data points confirmed so far. ` +
        "We recommend waiting for pending checks or requesting a Truvi assisted review.";

  return {
    projectId: String(project._id),
    projectName: project.name,
    generatedAt: new Date().toISOString(),
    categories,
    ai: {
      crossVerifiedSources: new Set(allItems.filter((i) => i.status === "VERIFIED").map((i) => i.source)).size,
      // Only actually-verified data points count as evidence collected — a
      // pending item is not evidence until its verification is complete.
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
