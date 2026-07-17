import type { Lead, LeadStage, Project, Unit } from "@/types";
import { scoreLead } from "@/lib/crmAi";

/**
 * Developer OS intelligence layer — the deterministic "AI" that powers the
 * developer dashboard and AI Analytics hub. Everything here runs client-side
 * over data the developer already has (projects, units, leads), so it needs no
 * external model calls and never blocks on the network. Same philosophy as the
 * CP CRM's `crmAi.ts`: grounded, explainable numbers the developer can trust.
 */

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(n)));

// ── The live booking pipeline (spec PART 5.6) ───────────────────────────────
// The data model tracks these forward stages; the dashboard shows count + value
// at each. LOST is handled separately (leakage), never in the forward funnel.
export const PIPELINE_STAGES: { stage: LeadStage; label: string }[] = [
  { stage: "GENERATED", label: "Generated" },
  { stage: "ASSIGNED", label: "Assigned" },
  { stage: "CONTACTED", label: "Contacted" },
  { stage: "INTERESTED", label: "Interested" },
  { stage: "SITE_VISIT", label: "Site Visit" },
  { stage: "NEGOTIATION", label: "Negotiation" },
  { stage: "BOOKING", label: "Booking" },
  { stage: "REGISTRATION", label: "Registration" },
  { stage: "COMPLETED", label: "Possession" },
];

export const BOOKED_STAGES: LeadStage[] = ["BOOKING", "REGISTRATION", "COMPLETED"];

/** Average price of a project's units, preferring live unit rows over aggregates. */
export function avgUnitPrice(units: Unit[], project?: Project): number {
  const priced = units.filter((u) => u.price > 0);
  if (priced.length) return Math.round(priced.reduce((s, u) => s + u.price, 0) / priced.length);
  if (project?.minPrice && project?.maxPrice) return Math.round((project.minPrice + project.maxPrice) / 2);
  return project?.minPrice ?? 0;
}

/** A representative deal value for a lead — used to price the pipeline. */
export function leadValue(lead: Lead, avgPriceByProject: Record<string, number>): number {
  const pid = typeof lead.projectId === "string" ? lead.projectId : lead.projectId?._id;
  return (pid && avgPriceByProject[pid]) || 0;
}

export interface PipelineStageStat {
  stage: LeadStage;
  label: string;
  count: number;
  value: number;
}

/** Count + rupee value at every forward pipeline stage. */
export function pipelineStats(leads: Lead[], avgPriceByProject: Record<string, number>): PipelineStageStat[] {
  return PIPELINE_STAGES.map(({ stage, label }) => {
    const inStage = leads.filter((l) => l.stage === stage);
    return {
      stage,
      label,
      count: inStage.length,
      value: inStage.reduce((s, l) => s + leadValue(l, avgPriceByProject), 0),
    };
  });
}

// ── Extract a tower/block label from a unit number ("A-1203" → "A") ──────────
export function unitTower(unit: Unit): string {
  const m = unit.unitNumber.match(/^([A-Za-z]+\d*)/);
  if (m && m[1]) return m[1].toUpperCase();
  return unit.type || "Block";
}

export interface HeatBand {
  label: string;
  total: number;
  sold: number;
  soldPercent: number;
}

/** Inventory heat map (spec PART 5.2) — % sold per tower/block. */
export function inventoryHeatMap(units: Unit[]): HeatBand[] {
  const byTower: Record<string, Unit[]> = {};
  for (const u of units) (byTower[unitTower(u)] ??= []).push(u);
  return Object.entries(byTower)
    .map(([label, list]) => {
      const sold = list.filter((u) => u.status === "SOLD" || u.status === "RESERVED").length;
      return { label, total: list.length, sold, soldPercent: list.length ? Math.round((sold / list.length) * 100) : 0 };
    })
    .sort((a, b) => b.soldPercent - a.soldPercent);
}

export interface InventoryHealth {
  score: number; // 0–100
  label: "Excellent" | "Healthy" | "Watch" | "At Risk";
  soldPercent: number;
  availablePercent: number;
  lockedPercent: number;
}

/** Inventory health score (spec PART 6) — how well inventory is moving. */
export function inventoryHealth(units: Unit[]): InventoryHealth {
  const total = units.length || 1;
  const sold = units.filter((u) => u.status === "SOLD").length;
  const reserved = units.filter((u) => u.status === "RESERVED").length;
  const locked = units.filter((u) => u.status === "LOCKED").length;
  const available = units.filter((u) => u.status === "AVAILABLE").length;

  const soldPercent = Math.round((sold / total) * 100);
  const reservedPercent = Math.round((reserved / total) * 100);
  const lockedPercent = Math.round((locked / total) * 100);
  const availablePercent = Math.round((available / total) * 100);

  // Movement (sold + reserved) is the strongest signal; active interest (locked)
  // helps; a large idle available pool drags the score down.
  const score = clamp(soldPercent + reservedPercent * 0.7 + lockedPercent * 0.4 + (availablePercent < 40 ? 12 : 0));
  const label = score >= 75 ? "Excellent" : score >= 50 ? "Healthy" : score >= 30 ? "Watch" : "At Risk";
  return { score, label, soldPercent, availablePercent, lockedPercent };
}

export interface SalesIntelligence {
  closingProbability: number; // %
  expectedRevenue: number; // ₹ still to come from the live pipeline
  expectedUnitsSold: number; // projected additional units
  recommendedDiscount: number; // %
  bestSellingType: string | null;
  worstSellingType: string | null;
  velocityNote: string;
}

/** AI Sales Intelligence per project (spec PART 5.1). */
export function salesIntelligence(project: Project, units: Unit[], leads: Lead[]): SalesIntelligence {
  const total = units.length || 1;
  const sold = units.filter((u) => u.status === "SOLD").length;
  const available = units.filter((u) => u.status === "AVAILABLE");
  const soldRatio = sold / total;

  const activeLeads = leads.filter((l) => !["COMPLETED", "LOST"].includes(l.stage));
  const hotLeads = leads.filter((l) => ["SITE_VISIT", "NEGOTIATION", "BOOKING"].includes(l.stage)).length;

  // Closing probability blends demand (hot leads vs available units), current
  // momentum (sold ratio) and listing strength (featured/verified).
  const demandPressure = available.length ? Math.min(1, hotLeads / available.length) : 1;
  let closing = 45 + demandPressure * 30 + soldRatio * 15;
  if (project.listingTier === "FEATURED") closing += 5;
  if (project.isVerified) closing += 3;
  const closingProbability = clamp(closing, 5, 95);

  // Projected additional units = a share of hot leads that convert, capped by
  // available inventory.
  const expectedUnitsSold = Math.min(available.length, Math.round(hotLeads * 0.55 + activeLeads.length * 0.12));
  const avgAvailPrice = avgUnitPrice(available.length ? available : units, project);
  const expectedRevenue = expectedUnitsSold * avgAvailPrice;

  // Recommended discount rises as inventory sits idle and demand thins.
  let discount = 0;
  if (soldRatio < 0.3 && demandPressure < 0.4) discount = 4;
  else if (soldRatio < 0.5 && demandPressure < 0.6) discount = 2;
  else if (demandPressure > 0.8) discount = 0; // hot — hold price
  else discount = 1;

  // Best / worst selling unit type by sold ratio within type.
  const byType: Record<string, { total: number; sold: number }> = {};
  for (const u of units) {
    const t = (byType[u.type] ??= { total: 0, sold: 0 });
    t.total++;
    if (u.status === "SOLD" || u.status === "RESERVED") t.sold++;
  }
  const ranked = Object.entries(byType)
    .filter(([, v]) => v.total > 0)
    .map(([type, v]) => ({ type, ratio: v.sold / v.total }))
    .sort((a, b) => b.ratio - a.ratio);
  const bestSellingType = ranked[0]?.type ?? null;
  const worstSellingType = ranked.length > 1 ? ranked[ranked.length - 1].type : null;

  const velocityNote =
    demandPressure > 0.8
      ? "High demand — hold pricing and prioritise site visits."
      : soldRatio < 0.3
        ? "Slow absorption — consider a limited-period offer to spark urgency."
        : "Steady absorption — keep the pipeline warm with follow-ups.";

  return { closingProbability, expectedRevenue, expectedUnitsSold, recommendedDiscount: discount, bestSellingType, worstSellingType, velocityNote };
}

export interface CampaignRoi {
  cost: number;
  leads: number;
  qualified: number;
  siteVisits: number;
  bookings: number;
  revenue: number;
  roi: number; // multiple, e.g. 64 → "64X"
  live: boolean; // true when a real campaign is purchased
}

/**
 * Campaign ROI (spec PART 5.3). When the developer has bought a managed
 * campaign we surface the funnel that campaign drove (derived from live leads +
 * a spend baseline); otherwise we project what a ₹1,00,000 campaign would return
 * from the developer's current conversion rates.
 */
export function campaignRoi(leads: Lead[], avgDealValue: number, campaignActive: boolean, spend = 100000): CampaignRoi {
  const qualified = leads.filter((l) => !["GENERATED", "LOST"].includes(l.stage)).length;
  const siteVisits = leads.filter((l) => ["SITE_VISIT", "NEGOTIATION", ...BOOKED_STAGES].includes(l.stage)).length;
  const bookings = leads.filter((l) => BOOKED_STAGES.includes(l.stage)).length;

  if (campaignActive && leads.length > 0) {
    const revenue = bookings * avgDealValue;
    return {
      cost: spend,
      leads: leads.length,
      qualified,
      siteVisits,
      bookings,
      revenue,
      roi: spend ? Math.round((revenue / spend) * 10) / 10 : 0,
      live: true,
    };
  }

  // Projection from current funnel ratios against a standard ₹1L spend.
  const projLeads = 480;
  const qRate = leads.length ? qualified / leads.length : 0.4;
  const vRate = leads.length ? siteVisits / leads.length : 0.13;
  const bRate = leads.length ? bookings / leads.length : 0.019;
  const projBookings = Math.max(1, Math.round(projLeads * bRate));
  const revenue = projBookings * (avgDealValue || 7000000);
  return {
    cost: spend,
    leads: projLeads,
    qualified: Math.round(projLeads * qRate),
    siteVisits: Math.round(projLeads * vRate),
    bookings: projBookings,
    revenue,
    roi: spend ? Math.round((revenue / spend) * 10) / 10 : 0,
    live: false,
  };
}

export interface Distribution {
  label: string;
  count: number;
  percent: number;
}

/** Buyer analytics (spec PART 5.4) — demand profile derived from inventory. */
export interface BuyerAnalytics {
  budgetBands: Distribution[];
  preferredSizes: Distribution[];
  loanRequirementPercent: number;
  topLocalities: Distribution[];
}

function toDistribution(counts: Record<string, number>): Distribution[] {
  const total = Object.values(counts).reduce((s, n) => s + n, 0) || 1;
  return Object.entries(counts)
    .map(([label, count]) => ({ label, count, percent: Math.round((count / total) * 100) }))
    .sort((a, b) => b.count - a.count);
}

const BUDGET_BANDS: { label: string; max: number }[] = [
  { label: "< ₹50 L", max: 5000000 },
  { label: "₹50 L–1 Cr", max: 10000000 },
  { label: "₹1–2 Cr", max: 20000000 },
  { label: "₹2–5 Cr", max: 50000000 },
  { label: "₹5 Cr+", max: Infinity },
];

export function buyerAnalytics(units: Unit[], projects: Project[], leads: Lead[]): BuyerAnalytics {
  // Budget demand is weighted by how many leads each project attracts, spread
  // across that project's unit price bands.
  const leadsByProject: Record<string, number> = {};
  for (const l of leads) {
    const pid = typeof l.projectId === "string" ? l.projectId : l.projectId?._id;
    if (pid) leadsByProject[pid] = (leadsByProject[pid] || 0) + 1;
  }

  const budget: Record<string, number> = {};
  const sizes: Record<string, number> = {};
  for (const u of units) {
    const weight = 1 + (leadsByProject[u.projectId] || 0);
    const band = BUDGET_BANDS.find((b) => u.price <= b.max)?.label ?? "₹5 Cr+";
    budget[band] = (budget[band] || 0) + weight;
    sizes[u.type] = (sizes[u.type] || 0) + weight;
  }

  const locality: Record<string, number> = {};
  for (const p of projects) {
    const key = p.location || p.city;
    if (key) locality[key] = (locality[key] || 0) + (leadsByProject[p._id] || 0) + 1;
  }

  // Loan requirement — a stable market estimate scaled by mid-band budget share.
  const dist = toDistribution(budget);
  const affordable = dist.filter((d) => d.label === "< ₹50 L" || d.label === "₹50 L–1 Cr").reduce((s, d) => s + d.percent, 0);
  const loanRequirementPercent = clamp(60 + affordable * 0.25, 45, 92);

  return {
    budgetBands: dist,
    preferredSizes: toDistribution(sizes).slice(0, 5),
    loanRequirementPercent,
    topLocalities: toDistribution(locality).slice(0, 5),
  };
}

export interface CompetitorRow {
  name: string;
  ratePerSqft: number;
  isYou: boolean;
}
export interface CompetitorAnalysis {
  rows: CompetitorRow[];
  yourRate: number;
  marketAvg: number;
  recommendedRate: number;
}

/** Competitor analytics (spec PART 5.5) — price positioning vs same-city projects. */
export function competitorAnalysis(
  project: Project,
  units: Unit[],
  allProjects: Project[],
): CompetitorAnalysis | null {
  const rate = (u: Unit) => (u.areaSqft > 0 ? u.price / u.areaSqft : 0);
  const yourRates = units.map(rate).filter((r) => r > 0);
  const yourRate = yourRates.length
    ? Math.round(yourRates.reduce((s, r) => s + r, 0) / yourRates.length)
    : project.minRate ?? 0;
  if (!yourRate) return null;

  const peers = allProjects.filter(
    (p) => p._id !== project._id && p.city === project.city && (p.minRate || p.minPrice),
  );

  // Synthesise a comparable per-sqft rate for peers from their min rate/price;
  // when a city has no peers we still show the developer their own positioning.
  const rows: CompetitorRow[] = peers.slice(0, 4).map((p) => {
    const peerRate = p.minRate ? Math.round(p.minRate) : Math.round((p.minPrice ?? 0) / 900);
    return { name: p.name, ratePerSqft: peerRate || Math.round(yourRate * 1.05), isYou: false };
  });
  rows.push({ name: `${project.name} (You)`, ratePerSqft: yourRate, isYou: true });
  rows.sort((a, b) => b.ratePerSqft - a.ratePerSqft);

  const peerRates = rows.filter((r) => !r.isYou).map((r) => r.ratePerSqft);
  const marketAvg = peerRates.length ? Math.round(peerRates.reduce((s, r) => s + r, 0) / peerRates.length) : yourRate;
  // Recommend nudging toward the market — halfway between you and the average,
  // rounded to the nearest ₹50.
  const recommendedRate = Math.round(((yourRate + marketAvg) / 2) / 50) * 50;
  return { rows, yourRate, marketAvg, recommendedRate };
}

export interface Forecast {
  demandNext30: number; // projected new leads next 30 days
  bookingsNext30: number; // projected new bookings next 30 days
  revenueNext90: number; // projected revenue next 90 days
  trend: "up" | "flat" | "down";
}

/** Demand + revenue forecast (spec PART 6) from recent lead velocity. */
export function forecast(leads: Lead[], avgDealValue: number): Forecast {
  const now = Date.now();
  const last30 = leads.filter((l) => now - new Date(l.createdAt).getTime() <= 30 * 86400000).length;
  const prev30 = leads.filter((l) => {
    const age = now - new Date(l.createdAt).getTime();
    return age > 30 * 86400000 && age <= 60 * 86400000;
  }).length;

  const bookRate = leads.length ? leads.filter((l) => BOOKED_STAGES.includes(l.stage)).length / leads.length : 0.05;
  const momentum = prev30 ? last30 / prev30 : last30 ? 1.15 : 1;
  const demandNext30 = Math.max(last30, Math.round(last30 * momentum)) || Math.round(leads.length * 0.15);
  const bookingsNext30 = Math.max(0, Math.round(demandNext30 * bookRate));
  const revenueNext90 = bookingsNext30 * 3 * (avgDealValue || 0);
  const trend = momentum > 1.1 ? "up" : momentum < 0.9 ? "down" : "flat";
  return { demandNext30, bookingsNext30, revenueNext90, trend };
}

export interface LeadQuality {
  hot: number;
  warm: number;
  cold: number;
  qualityScore: number; // 0–100 average buyer score of active leads
}

/** Lead quality score (spec PART 6) — reuses the shared CP lead scorer. */
export function leadQuality(leads: Lead[]): LeadQuality {
  const active = leads.filter((l) => !["COMPLETED", "LOST"].includes(l.stage));
  let hot = 0;
  let warm = 0;
  let cold = 0;
  let sum = 0;
  for (const l of active) {
    const s = scoreLead(l);
    sum += s.score;
    if (s.temperature === "HOT") hot++;
    else if (s.temperature === "WARM") warm++;
    else cold++;
  }
  return { hot, warm, cold, qualityScore: active.length ? Math.round(sum / active.length) : 0 };
}

export interface FinanceSummary {
  expectedRevenue: number; // full inventory value
  collected: number; // sold units (booked)
  inPipeline: number; // reserved + locked value
  outstanding: number; // available value still to sell
  pendingRegistration: number; // booked-but-not-registered value
  gstOnCollected: number; // 5% under-construction GST estimate
}

/** Finance dashboard figures (spec PART 5.8) from live inventory + leads. */
export function financeSummary(units: Unit[], leads: Lead[], avgDealValue: number): FinanceSummary {
  const valueOf = (status: Unit["status"]) => units.filter((u) => u.status === status).reduce((s, u) => s + u.price, 0);
  const collected = valueOf("SOLD");
  const inPipeline = valueOf("RESERVED") + valueOf("LOCKED");
  const outstanding = valueOf("AVAILABLE");
  const expectedRevenue = collected + inPipeline + outstanding;
  const pendingRegistration =
    leads.filter((l) => l.stage === "BOOKING").length * (avgDealValue || 0);
  return {
    expectedRevenue,
    collected,
    inPipeline,
    outstanding,
    pendingRegistration,
    gstOnCollected: Math.round(collected * 0.05),
  };
}

export interface TeamMemberPerf {
  id: string;
  name: string;
  leads: number;
  siteVisits: number;
  bookings: number;
  revenue: number;
  conversion: number; // %
}

/** Sales team performance (spec PART 5.7) — per assignee/submitter. */
export function teamPerformance(leads: Lead[], avgPriceByProject: Record<string, number>): TeamMemberPerf[] {
  const by: Record<string, TeamMemberPerf> = {};
  for (const l of leads) {
    const ref = l.assignedToId || l.submittedById;
    const id = typeof ref === "string" ? ref : ref?._id;
    const name = typeof ref === "string" ? "Unassigned" : ref?.name || "Unassigned";
    if (!id) continue;
    const m = (by[id] ??= { id, name, leads: 0, siteVisits: 0, bookings: 0, revenue: 0, conversion: 0 });
    m.leads++;
    if (["SITE_VISIT", "NEGOTIATION", ...BOOKED_STAGES].includes(l.stage)) m.siteVisits++;
    if (BOOKED_STAGES.includes(l.stage)) {
      m.bookings++;
      m.revenue += leadValue(l, avgPriceByProject);
    }
  }
  return Object.values(by)
    .map((m) => ({ ...m, conversion: m.leads ? Math.round((m.bookings / m.leads) * 100) : 0 }))
    .sort((a, b) => b.bookings - a.bookings || b.revenue - a.revenue);
}
