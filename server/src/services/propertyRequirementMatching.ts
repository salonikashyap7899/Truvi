import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "../config/db";
import {
  notificationPreferences,
  propertyRequirementMatches,
  propertyRequirements,
  projects,
  units,
  users,
  type IPropertyRequirement,
  type IProject,
  type IUnit,
} from "../db/schema";
import { notifyUser, NotificationType } from "./notificationService";
import { sendEmail } from "./emailService";

type MatchableRequirement = IPropertyRequirement;
type MatchableProject = IProject;

export function normalize(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function locationMatches(requirement: MatchableRequirement, project: MatchableProject): boolean {
  const requestedCity = normalize(requirement.city);
  const projectCity = normalize(project.city);
  if (!requestedCity || !projectCity) return false;
  const sameCity = requestedCity === projectCity || requestedCity.includes(projectCity) || projectCity.includes(requestedCity);
  if (!sameCity) return false;

  const requestedLocation = normalize(requirement.location);
  const projectLocation = normalize(project.location);
  // A city entered in the locality box means the user is open to the whole city.
  const broadLocation = requestedLocation === requestedCity || requestedLocation === projectCity;
  return broadLocation || Boolean(
    requestedLocation &&
    projectLocation &&
    (projectLocation.includes(requestedLocation) || requestedLocation.includes(projectLocation)),
  );
}

export function typeBucket(value: unknown): string {
  const valueNorm = normalize(value);
  if (!valueNorm || valueNorm === "any" || valueNorm === "any property") return "ANY";
  if (/plot|plotted|land|parcel/.test(valueNorm)) return "PLOT";
  if (/apartment|flat/.test(valueNorm)) return "APARTMENT";
  if (/residential/.test(valueNorm)) return "RESIDENTIAL";
  if (/villa|bungalow|independent house/.test(valueNorm)) return "VILLA";
  if (/commercial|office|shop|retail/.test(valueNorm)) return "COMMERCIAL";
  if (/industrial|warehouse|factory/.test(valueNorm)) return "INDUSTRIAL";
  if (/mixed/.test(valueNorm)) return "MIXED";
  return valueNorm;
}

function typeMatches(requirement: MatchableRequirement, project: MatchableProject, unit: IUnit): boolean {
  const wanted = typeBucket(requirement.propertyType);
  if (wanted === "ANY") return true;
  return [project.projectType, unit.type].some((value) => typeBucket(value) === wanted);
}

export function matchingUnits(requirement: MatchableRequirement, project: MatchableProject, availableUnits: IUnit[]): IUnit[] {
  if (!locationMatches(requirement, project)) return [];
  const minBudget = requirement.minBudget == null ? 0 : Number(requirement.minBudget);
  const maxBudget = Number(requirement.maxBudget);
  if (!Number.isFinite(maxBudget) || maxBudget <= 0) return [];

  return availableUnits.filter((unit) => {
    const price = Number(unit.price);
    const area = Number(unit.areaSqft);
    if (unit.status !== "AVAILABLE" || !Number.isFinite(price) || price < minBudget || price > maxBudget) return false;
    if (!typeMatches(requirement, project, unit)) return false;
    if (requirement.minAreaSqft != null && (!Number.isFinite(area) || area < Number(requirement.minAreaSqft))) return false;
    if (requirement.maxAreaSqft != null && (!Number.isFinite(area) || area > Number(requirement.maxAreaSqft))) return false;
    return true;
  });
}

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char] ?? char);
}

function inr(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

function propertyUrl(projectId: string): string {
  const base = (process.env.CLIENT_URL || process.env.PUBLIC_SITE_URL || "https://truviventures.com").replace(/\/+$/, "");
  return `${base}/inventory/${encodeURIComponent(projectId)}/presentation`;
}

/**
 * Record one pair exactly once, then dispatch idempotent in-app and SMTP email
 * notifications. Provider failures are non-fatal: publishing a project or
 * submitting a requirement must never depend on SMTP being available.
 */
async function recordAndNotifyMatch(
  requirement: MatchableRequirement,
  project: MatchableProject,
  availableUnits: IUnit[],
): Promise<void> {
  const db = getDb();
  const matching = matchingUnits(requirement, project, availableUnits);
  if (!matching.length) return;

  const [inserted] = await db
    .insert(propertyRequirementMatches)
    .values({ requirementId: requirement._id, projectId: project._id })
    .onConflictDoNothing()
    .returning();

  let matchRow = inserted;
  if (!matchRow) {
    const [existing] = await db
      .select()
      .from(propertyRequirementMatches)
      .where(and(
        eq(propertyRequirementMatches.requirementId, requirement._id),
        eq(propertyRequirementMatches.projectId, project._id),
      ))
      .limit(1);
    matchRow = existing;
  }
  if (!matchRow) return;

  const [recipient] = await db
    .select({
      id: users._id,
      name: users.name,
      email: users.email,
      emailVerified: users.emailVerified,
    })
    .from(users)
    .where(eq(users._id, requirement.submittedById))
    .limit(1);
  if (!recipient) return;

  const href = `/inventory/${project._id}/presentation`;
  const message = `A ${project.projectType || requirement.propertyType || "property"} matching your requirement is available in ${project.location}, ${project.city}. Available inventory starts at ${inr(Math.min(...matching.map((unit) => Number(unit.price))))}. Tap to check the project details.`;

  if (!matchRow.inAppNotifiedAt) {
    try {
      const created = await notifyUser(String(recipient.id), {
        type: NotificationType.PROPERTY_MATCH,
        title: "A property matches your requirement",
        message,
        priority: "high",
        data: { href, requirementId: String(requirement._id), projectId: String(project._id) },
        dedupeKey: `property-requirement:${requirement._id}:${project._id}`,
      });
      if (created.length > 0) {
        await db.update(propertyRequirementMatches)
          .set({ inAppNotifiedAt: new Date() })
          .where(eq(propertyRequirementMatches._id, matchRow._id));
      }
    } catch (error) {
      console.warn("[property-matching] in-app notification failed:", error instanceof Error ? error.message : "unknown error");
    }
  }

  if (!matchRow.emailSentAt && recipient.emailVerified && recipient.email) {
    try {
      const [muted] = await db
        .select({ id: notificationPreferences._id })
        .from(notificationPreferences)
        .where(and(
          eq(notificationPreferences.userId, recipient.id),
          eq(notificationPreferences.category, "properties"),
          eq(notificationPreferences.enabled, false),
        ))
        .limit(1);

      if (!muted) {
        const projectLink = propertyUrl(String(project._id));
        const prices = matching.map((unit) => Number(unit.price)).filter(Number.isFinite);
        const low = Math.min(...prices);
        const high = Math.max(...prices);
        const priceText = low === high ? inr(low) : `${inr(low)} – ${inr(high)}`;
        const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#172033;line-height:1.6">
          <h2 style="color:#0f766e">A new property matches your Truvi requirement</h2>
          <p>Hello ${escapeHtml(recipient.name)},</p>
          <p>A newly available Truvi project matches your saved property requirement.</p>
          <div style="border:1px solid #dbe3ea;border-radius:12px;padding:18px;margin:18px 0">
            <h3 style="margin:0 0 8px">${escapeHtml(project.name)}</h3>
            <p style="margin:4px 0"><strong>Location:</strong> ${escapeHtml(project.location)}, ${escapeHtml(project.city)}</p>
            <p style="margin:4px 0"><strong>Property type:</strong> ${escapeHtml(project.projectType || "Property")}</p>
            <p style="margin:4px 0"><strong>Matching available inventory:</strong> ${escapeHtml(priceText)}</p>
          </div>
          <p><a href="${projectLink}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#0f766e;color:#fff;text-decoration:none">View Property Details</a></p>
          <p style="font-size:12px;color:#64748b">You received this email because property recommendations are enabled for your Truvi account.</p>
          <p>Team Truvi</p>
        </div>`;
        const sent = await sendEmail(String(recipient.email), "A new property matches your Truvi requirement", html);
        if (sent) {
          await db.update(propertyRequirementMatches)
            .set({ emailSentAt: new Date() })
            .where(eq(propertyRequirementMatches._id, matchRow._id));
        }
      }
    } catch (error) {
      // Don't log addresses or email contents; provider configuration can be checked separately.
      console.warn("[property-matching] email notification failed:", error instanceof Error ? error.message : "unknown error");
    }
  }
}

/** Match a newly submitted/updated active requirement against currently live inventory. */
export async function matchRequirementAgainstAvailableProjects(requirementId: string): Promise<void> {
  const db = getDb();
  const [requirement] = await db
    .select()
    .from(propertyRequirements)
    .where(and(eq(propertyRequirements._id, requirementId), eq(propertyRequirements.status, "ACTIVE")))
    .limit(1);
  if (!requirement) return;

  const candidates = await db
    .select()
    .from(projects)
    .where(and(
      eq(projects.approvalStatus, "APPROVED"),
      eq(projects.availabilityStatus, "AVAILABLE"),
    ));
  const possible = candidates.filter((project) => locationMatches(requirement, project));
  if (!possible.length) return;

  const ids = possible.map((project) => project._id);
  const allUnits = await db
    .select()
    .from(units)
    .where(and(inArray(units.projectId, ids), eq(units.status, "AVAILABLE")));
  const byProject = new Map<string, IUnit[]>();
  for (const unit of allUnits) {
    const id = String(unit.projectId);
    byProject.set(id, [...(byProject.get(id) ?? []), unit]);
  }

  for (const project of possible) {
    const projectUnits = byProject.get(String(project._id)) ?? [];
    if (projectUnits.length) await recordAndNotifyMatch(requirement, project, projectUnits);
  }
}

/** Match a newly approved project or newly added inventory against active requirements. */
export async function matchRequirementsForPublishedProject(projectId: string): Promise<void> {
  const db = getDb();
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects._id, projectId))
    .limit(1);
  if (!project || project.approvalStatus !== "APPROVED" || project.availabilityStatus !== "AVAILABLE") return;

  const availableUnits = await db
    .select()
    .from(units)
    .where(and(eq(units.projectId, project._id), eq(units.status, "AVAILABLE")));
  if (!availableUnits.length) return;

  const activeRequirements = await db
    .select()
    .from(propertyRequirements)
    .where(eq(propertyRequirements.status, "ACTIVE"))
    .orderBy(desc(propertyRequirements.createdAt));

  for (const requirement of activeRequirements) {
    if (locationMatches(requirement, project)) {
      await recordAndNotifyMatch(requirement, project, availableUnits);
    }
  }
}
