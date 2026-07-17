import type { Lead, LeadStage, Project, Unit } from "@/types";

/**
 * Deterministic "AI" layer for the CP CRM — lead scoring, deal probability,
 * copilot matching and script generation. Runs entirely client-side over data
 * the CP already has, so it works with zero external model calls and never
 * blocks on network. (The /api/ai/chat route remains available for free-form
 * generation.)
 */

// ── Lead scoring ────────────────────────────────────────────────────────────

const STAGE_WEIGHT: Record<LeadStage, number> = {
  GENERATED: 15,
  ASSIGNED: 20,
  CONTACTED: 35,
  INTERESTED: 50,
  SITE_VISIT: 65,
  NEGOTIATION: 80,
  BOOKING: 92,
  REGISTRATION: 97,
  COMPLETED: 100,
  LOST: 0,
};

export interface LeadScore {
  score: number; // 0–100 "Buyer Score"
  closeProbability: number; // 0–100 "Probability to Close"
  temperature: "HOT" | "WARM" | "COLD";
  reasons: string[];
}

export function scoreLead(lead: Lead, activityCount = 0): LeadScore {
  const reasons: string[] = [];
  let score = STAGE_WEIGHT[lead.stage] ?? 20;

  const daysSinceUpdate = (Date.now() - new Date(lead.updatedAt).getTime()) / 86_400_000;
  if (daysSinceUpdate <= 2) {
    score += 8;
    reasons.push("Active in the last 48 hours");
  } else if (daysSinceUpdate > 14) {
    score -= 15;
    reasons.push(`Inactive for ${Math.floor(daysSinceUpdate)} days`);
  } else if (daysSinceUpdate > 7) {
    score -= 8;
    reasons.push("No movement this week");
  }

  if (activityCount >= 5) {
    score += 6;
    reasons.push("High engagement — 5+ touchpoints");
  } else if (activityCount >= 2) {
    score += 3;
  }

  const tags = (lead.tags ?? []).map((t) => t.toLowerCase());
  if (tags.includes("hot")) {
    score += 5;
    reasons.push("Tagged Hot by you");
  }
  if (lead.clientEmail) score += 2;

  score = Math.max(0, Math.min(100, Math.round(score)));
  const closeProbability = Math.max(0, Math.min(100, Math.round(score * 0.9)));
  const temperature = score >= 70 ? "HOT" : score >= 40 ? "WARM" : "COLD";
  if (reasons.length === 0) reasons.push(`Currently at ${lead.stage.replace("_", " ").toLowerCase()} stage`);

  return { score, closeProbability, temperature, reasons };
}

// ── Follow-up suggestions ───────────────────────────────────────────────────

export function suggestFollowUp(lead: Lead): string {
  const days = Math.floor((Date.now() - new Date(lead.updatedAt).getTime()) / 86_400_000);
  switch (lead.stage) {
    case "GENERATED":
    case "ASSIGNED":
      return `Call ${lead.clientName} today to introduce yourself — first-hour response triples conversion.`;
    case "CONTACTED":
      return `Send ${lead.clientName} a project brochure on WhatsApp and ask 2 qualifying questions (budget, timeline).`;
    case "INTERESTED":
      return `Invite ${lead.clientName} for a site visit this weekend — interested buyers cool off within 5 days.`;
    case "SITE_VISIT":
      return `Follow up within 24h of the visit: share unit options + payment plan, then ask for a token discussion.`;
    case "NEGOTIATION":
      return `Send a limited-period offer to ${lead.clientName} and set a decision date — open negotiations decay after a week.`;
    case "BOOKING":
    case "REGISTRATION":
      return `Guide ${lead.clientName} through documentation and loan steps; a smooth registration earns referrals.`;
    case "COMPLETED":
      return `Ask ${lead.clientName} for a referral — happy buyers bring 2–3 new leads on average.`;
    default:
      return days > 30
        ? `Re-engage ${lead.clientName} with a new project matching their budget — old leads revive at ~12%.`
        : `Check in with ${lead.clientName} and log what you learn.`;
  }
}

// ── Copilot: budget parsing + project matching ──────────────────────────────

/** Parses Hinglish/English budget phrases: "5 crore", "75 lakh", "₹1.2cr", "90L". */
export function parseBudget(query: string): number | null {
  const m = query.toLowerCase().match(/(?:₹\s*)?([\d,.]+)\s*(crore|cr|lakh|lac|lakhs|l\b|k\b)?/i);
  if (!m || !m[1]) return null;
  const num = parseFloat(m[1].replace(/,/g, ""));
  if (!Number.isFinite(num) || num <= 0) return null;
  const unit = (m[2] || "").toLowerCase();
  if (unit.startsWith("cr")) return num * 1_00_00_000;
  if (unit.startsWith("l")) return num * 1_00_000;
  if (unit === "k") return num * 1000;
  // Bare numbers below 100 are almost certainly lakhs/crores shorthand missing
  // a unit — treat < 10 as crore, < 1000 as lakh, else rupees.
  if (num < 10) return num * 1_00_00_000;
  if (num < 1000) return num * 1_00_000;
  return num;
}

export interface CopilotMatch {
  project: Project;
  fitPrice: number; // representative price for the budget
  closingEstimate: number; // %
  expectedCommission: number; // ₹
}

export interface CopilotResult {
  budget: number | null;
  city: string | null;
  matches: CopilotMatch[];
}

export function runCopilot(query: string, projects: Project[], unitsByProject: Record<string, Unit[]>): CopilotResult {
  const budget = parseBudget(query);
  const q = query.toLowerCase();
  const city = projects.map((p) => p.city).find((c) => c && q.includes(c.toLowerCase())) || null;

  const scored = projects
    .map((project) => {
      const units = unitsByProject[project._id] || [];
      const available = units.filter((u) => u.status === "AVAILABLE");
      const prices = available.map((u) => u.price);
      const minPrice = prices.length ? Math.min(...prices) : project.minPrice ?? null;
      const maxPrice = prices.length ? Math.max(...prices) : project.maxPrice ?? null;

      let fit = 0;
      let fitPrice = minPrice ?? 0;
      if (budget && minPrice != null && maxPrice != null) {
        if (budget >= minPrice && budget <= maxPrice * 1.1) {
          fit = 3;
          fitPrice = Math.min(budget, maxPrice);
        } else if (budget >= minPrice * 0.8) {
          fit = 1;
          fitPrice = minPrice;
        }
      } else if (!budget) {
        fit = 1;
        fitPrice = minPrice ?? 0;
      }
      if (city && project.city.toLowerCase() === city.toLowerCase()) fit += 2;
      if (project.listingTier === "FEATURED") fit += 1;
      if (available.length > 0) fit += 1;

      const closingEstimate = Math.min(90, 40 + fit * 8 + Math.round(project.commissionPercent * 2));
      const expectedCommission = Math.round(((fitPrice || 0) * project.commissionPercent) / 100);

      return { project, fitPrice: fitPrice || 0, closingEstimate, expectedCommission, fit };
    })
    .filter((m) => m.fit > 0)
    .sort((a, b) => b.fit - a.fit || b.expectedCommission - a.expectedCommission)
    .slice(0, 3)
    .map(({ fit: _fit, ...rest }) => rest);

  return { budget, city, matches: scored };
}

// ── Script generation ───────────────────────────────────────────────────────

const inr = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

export function callScript(clientName: string, project: Project, price: number): string {
  return `Hi ${clientName || "sir/ma'am"}, this is your Truvi property partner.

I found a project that fits your budget perfectly — ${project.name} in ${project.location}, ${project.city}${price ? `, starting around ${inr(price)}` : ""}.

Three quick reasons it stands out:
1. ${project.isVerified ? "Fully Truvi-verified — RERA, title and approvals checked." : "Strong location with good connectivity."}
2. Inventory is moving fast — I can hold a unit for 30 minutes while we talk.
3. Flexible payment plans are available directly from the developer.

Can I book you a site visit this weekend? Saturday or Sunday — which works better?`;
}

export function whatsAppScript(clientName: string, project: Project, price: number): string {
  return `Hi ${clientName || "there"} 👋

Sharing a handpicked option for you:

🏙️ *${project.name}* — ${project.location}, ${project.city}
${price ? `💰 Starting ~ ${inr(price)}` : ""}
${project.isVerified ? "✅ Truvi Verified (RERA + title checked)" : ""}
📈 Strong appreciation potential in this micro-market

Units here are moving quickly. Shall I arrange a quick site visit this weekend? Just reply YES and I'll set it up.`;
}

export function emailScript(clientName: string, project: Project, price: number): string {
  return `Subject: ${project.name}, ${project.city} — shortlisted for your budget

Dear ${clientName || "Sir/Madam"},

Based on our discussion, I've shortlisted ${project.name} in ${project.location}, ${project.city}${price ? ` with options starting around ${inr(price)}` : ""}.

Why this project:
• ${project.isVerified ? "Truvi-verified: RERA registration, title clearance and approvals checked" : "Well-located project with active inventory"}
• Developer payment plans available
• Site visits can be scheduled at your convenience

I'd recommend a site visit before this weekend's price revision. Please share a convenient slot and I'll arrange everything.

Warm regards,
Your Truvi Channel Partner`;
}
