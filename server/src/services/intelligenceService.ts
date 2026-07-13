import crypto from "crypto";
import { IProject } from "../db/schema";

/**
 * Raw Data Sources & AI Intelligence Engine.
 *
 * Builds a unified intelligence profile for a listing: every data point is
 * attributed to the source it comes from and carries a verification status,
 * so a buyer can open a listing's arrow panel and see exactly where each
 * fact was sourced and whether it has been verified.
 *
 * Statuses are anchored to the project's real verification fields
 * (verificationDetails, reraStatus, risk levels) where they exist; the
 * remaining data points are simulated deterministically per listing — the
 * same convention the rest of the platform uses for demo intelligence
 * (trust score, legal risk, price fairness).
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

export interface AIVerification {
  crossVerifiedSources: number;
  evidenceCount: number;
  riskFlags: string[];
  fraudSignals: string[];
  confidenceScore: number;
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

// Deterministic per (projectId, label) so a listing's profile is stable
// across requests without needing a stored document per data point.
function hashStatus(projectId: string, label: string): IntelStatus {
  const h = crypto.createHash("sha256").update(`${projectId}:${label}`).digest();
  const n = h[0] % 100;
  if (n < 72) return "VERIFIED";
  if (n < 92) return "PENDING";
  return "UNAVAILABLE";
}

type ItemDef = [label: string, source: string] | [label: string, source: string, override: () => IntelItem | null];

function buildCategory(
  project: IProject,
  key: string,
  title: string,
  defs: ItemDef[],
  fullyVerified: boolean,
): IntelCategory {
  const id = String(project._id);
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
    return { label, source, status: hashStatus(id, label) };
  });
  return {
    key,
    title,
    items,
    verifiedCount: items.filter((i) => i.status === "VERIFIED").length,
    totalCount: items.length,
  };
}

export function buildIntelligenceProfile(project: IProject): IntelligenceProfile {
  const vd = project.verificationDetails;
  const reraVerified = !!vd?.reraVerified || project.reraStatus === "REGISTERED";
  const reraSource = project.reraNumber
    ? `UP RERA Portal (Reg. No. ${project.reraNumber})`
    : "UP RERA Portal";

  // Fully admin-verified = the listing has been marked Verified AND every core
  // verification check has been ticked by an admin (all documents uploaded and
  // verified). When true, every intelligence option reads VERIFIED (100%).
  const coreChecks = [
    vd?.reraVerified,
    vd?.titleClearance,
    vd?.encumbranceFree,
    vd?.constructionApproval,
    vd?.portfolioVerified,
  ];
  const fullyAdminVerified = project.isVerified === true && coreChecks.every(Boolean);

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
      "RERA Projects",
      reraSource,
      () =>
        reraVerified
          ? { label: "RERA Projects", source: reraSource, status: "VERIFIED", detail: "RERA registration confirmed." }
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
  ], fullyAdminVerified);

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
  ], fullyAdminVerified);

  const location = buildCategory(project, "location", "Location Intelligence", [
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
  ], fullyAdminVerified);

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
  ], fullyAdminVerified);

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
  ], fullyAdminVerified);

  const gis = buildCategory(project, "gis", "Satellite & GIS Intelligence", [
    ["Satellite Imagery", "ISRO Bhuvan + Sentinel-2"],
    ["GIS Layers", "State GIS Portal + OpenStreetMap"],
    ["Plot Boundaries", "Revenue Department Cadastral Maps"],
    ["Road Connectivity", "OpenStreetMap Road Network"],
    ["Nearby Amenities", "GIS Amenity Layers + Field Survey"],
    ["Elevation", "SRTM Digital Elevation Model"],
    ["Land Cover", "Sentinel-2 Land Cover Classification"],
  ], fullyAdminVerified);

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
  ], fullyAdminVerified);

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
  if (!reraVerified) riskFlags.push("RERA registration not yet confirmed.");

  const fraudSignals: string[] = [];
  // Cross-verification passed if the core legal documents corroborate each other.
  const coreLegalOk = !!vd?.titleClearance && !!vd?.encumbranceFree;
  if (!coreLegalOk && project.isVerified === false) {
    fraudSignals.push("Ownership documents not yet cross-verified against registry records.");
  }

  // Confidence: share of verified data points, with a boost for
  // admin-confirmed core verifications and a penalty per risk flag.
  let confidence = Math.round((verified / allItems.length) * 100);
  if (vd) {
    const coreChecks = [vd.reraVerified, vd.titleClearance, vd.encumbranceFree, vd.constructionApproval, vd.portfolioVerified];
    confidence += coreChecks.filter(Boolean).length * 2;
  }
  confidence -= riskFlags.length * 4;
  confidence = Math.max(5, Math.min(99, confidence));

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
      evidenceCount: verified + pending,
      riskFlags,
      fraudSignals,
      confidenceScore: confidence,
      overallStatus,
      decisionSummary,
    },
  };
}
