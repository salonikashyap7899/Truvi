import { MAIL_FROM, sendEmailWithStatus } from "./emailService";

export type TeamRequirementNotificationStatus = "SENT_TO_PROVIDER" | "SKIPPED" | "FAILED";

export interface RequirementSubmissionForEmail {
  _id: string;
  title: string;
  requirementKind: string;
  submittedByRole: string;
  propertyType: string;
  city: string;
  location: string;
  minBudget: number | null;
  maxBudget: number;
  minAreaSqft: number | null;
  maxAreaSqft: number | null;
  purpose: string | null;
  timeline: string;
  visibility: string;
  publicSummary: string | null;
  details: string | null;
  clientName: string | null;
  clientPhone: string | null;
  clientEmail: string | null;
  contactConsent: boolean;
  createdAt: Date;
}

export interface RequirementSubmitterProfile {
  name: string | null;
  email: string | null;
  role: string;
}

export function escapeEmailHtml(value: unknown): string {
  return String(value ?? "—").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

function validEmail(value: unknown): value is string {
  return typeof value === "string"
    && value.length <= 254
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
    && !/[\r\n]/.test(value);
}

function getTeamRecipients(): string[] {
  // Prefer an explicitly configured team inbox. SMTP_USER is a safe backward-
  // compatible fallback for deployments where that existing mailbox receives mail.
  const configured = process.env.REQUIREMENT_TEAM_EMAIL?.trim();
  const rawRecipients = configured
    ? configured.split(/[;,]/)
    : [process.env.SMTP_USER ?? ""];
  return Array.from(new Set(rawRecipients.map((value) => value.trim().toLowerCase()).filter(validEmail)));
}

function money(value: number | null): string {
  return value == null
    ? "Not specified"
    : new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);
}

function areaRange(min: number | null, max: number | null): string {
  if (min == null && max == null) return "Not specified";
  if (min != null && max != null) return `${min.toLocaleString("en-IN")}–${max.toLocaleString("en-IN")} sq ft`;
  if (min != null) return `At least ${min.toLocaleString("en-IN")} sq ft`;
  return `Up to ${max!.toLocaleString("en-IN")} sq ft`;
}

export function buildRequirementSubmissionEmail(
  requirement: RequirementSubmissionForEmail,
  submitter: RequirementSubmitterProfile,
): { subject: string; html: string; replyTo?: string } {
  const cleanTitle = requirement.title.replace(/[\r\n]+/g, " ").trim().slice(0, 120);
  const subject = `New Truvi requirement [${requirement._id.slice(0, 8)}]: ${cleanTitle || "Property request"}`;
  const submittedAt = requirement.createdAt instanceof Date && !Number.isNaN(requirement.createdAt.getTime())
    ? requirement.createdAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })
    : "Not available";

  const rows: Array<[string, string]> = [
    ["Reference", requirement._id],
    ["Requirement", requirement.title],
    ["Type", requirement.propertyType],
    ["City", requirement.city],
    ["Locality", requirement.location],
    ["Budget", `${money(requirement.minBudget)} to ${money(requirement.maxBudget)}`],
    ["Property size", areaRange(requirement.minAreaSqft, requirement.maxAreaSqft)],
    ["Purpose", requirement.purpose || "Not specified"],
    ["Timeline", requirement.timeline],
    ["Visibility", requirement.visibility],
    ["Submitted by role", submitter.role || requirement.submittedByRole],
    ["Submitted by", submitter.name || "Truvi user"],
    ["Submitter email", submitter.email || "Not available"],
    ["Submitted at (IST)", submittedAt],
  ];

  if (requirement.publicSummary) rows.push(["Summary", requirement.publicSummary]);
  if (requirement.details) rows.push(["Private details", requirement.details]);

  // Third-party client contacts are placed in the internal alert only when the
  // submitter recorded client consent. Buyer requirements cannot attach these fields.
  if (requirement.contactConsent) {
    if (requirement.clientName) rows.push(["Consented client name", requirement.clientName]);
    if (requirement.clientPhone) rows.push(["Consented client phone", requirement.clientPhone]);
    if (requirement.clientEmail) rows.push(["Consented client email", requirement.clientEmail]);
  }

  const tableRows = rows.map(([label, value]) =>
    `<tr><th align="left" valign="top" style="padding:9px 12px;border-bottom:1px solid #e5e7eb;color:#475569;font-size:13px;width:180px">${escapeEmailHtml(label)}</th><td style="padding:9px 12px;border-bottom:1px solid #e5e7eb;color:#0f172a;font-size:14px;white-space:pre-wrap;overflow-wrap:anywhere">${escapeEmailHtml(value)}</td></tr>`,
  ).join("");

  const baseUrlCandidate = process.env.CLIENT_URL || process.env.FRONTEND_URL || "https://truviventures.com";
  let adminUrl = "https://truviventures.com/admin/requirements";
  try {
    const baseUrl = new URL(baseUrlCandidate);
    if (baseUrl.protocol === "https:" || baseUrl.hostname === "localhost") {
      adminUrl = new URL("/admin/requirements", baseUrl).toString();
    }
  } catch {
    // Keep the known HTTPS production URL if environment configuration is invalid.
  }

  return {
    subject,
    html: `<!doctype html><html><body style="margin:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#0f172a"><main style="max-width:760px;margin:0 auto;padding:24px"><div style="background:#0f172a;color:#fff;border-radius:14px;padding:20px 22px"><p style="margin:0 0 8px;color:#5eead4;font-size:12px;letter-spacing:1.5px;text-transform:uppercase">Truvi Requirements</p><h1 style="margin:0;font-size:22px">New property requirement submitted</h1><p style="margin:10px 0 0;color:#cbd5e1;font-size:14px">A new request has been saved and is ready for admin review.</p></div><table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin-top:18px;border:1px solid #e5e7eb;border-radius:10px;border-collapse:separate;border-spacing:0;background:#fff;overflow:hidden">${tableRows}</table><p style="margin:22px 0"><a href="${escapeEmailHtml(adminUrl)}" style="display:inline-block;padding:12px 16px;background:#0f766e;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">Open Admin Requirements</a></p><p style="font-size:12px;line-height:1.6;color:#64748b">This internal notification was sent by Truvi, not by the submitter. Use Reply to respond to the submitter's registered Truvi email address. Private client contact details are included only when consent was recorded.</p></main></body></html>`,
    ...(validEmail(submitter.email) ? { replyTo: submitter.email.trim() } : {}),
  };
}

/**
 * Send an internal admin alert using Truvi's existing SMTP transport. This is
 * deliberately separate from property-match email delivery and never uses a
 * user-controlled address as the From header.
 */
export async function sendRequirementTeamEmail(
  requirement: RequirementSubmissionForEmail,
  submitter: RequirementSubmitterProfile,
): Promise<TeamRequirementNotificationStatus> {
  const recipients = getTeamRecipients();
  if (recipients.length === 0) return "SKIPPED";

  const message = buildRequirementSubmissionEmail(requirement, submitter);
  const outcomes = await Promise.allSettled(recipients.map((to) =>
    sendEmailWithStatus(
      to,
      message.subject,
      message.html,
      MAIL_FROM,
      message.replyTo ? { replyTo: message.replyTo } : undefined,
    ),
  ));

  if (outcomes.some((outcome) => outcome.status === "fulfilled" && outcome.value.status === "SENT_TO_PROVIDER")) {
    return "SENT_TO_PROVIDER";
  }
  if (outcomes.some((outcome) => outcome.status === "rejected")) return "FAILED";
  return "SKIPPED";
}
