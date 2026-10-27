import { and, desc, eq, gte, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import { getDb } from "../config/db";
import {
  propertyRequirementMatches,
  propertyRequirementMatchJobs,
  emailDeliveryEvents,
  propertyRequirements,
  projects,
  units,
  users,
  userNotificationChannelPreferences,
  type IPropertyRequirement,
  type IProject,
  type IUnit,
} from "../db/schema";
import { notifyUser, NotificationType } from "./notificationService";
import { sendEmailWithStatus } from "./emailService";

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
  const sameCity =
    requestedCity === projectCity ||
    requestedCity.includes(projectCity) ||
    projectCity.includes(requestedCity);
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

  const projectBucket = typeBucket(project.projectType);
  const unitBucket = typeBucket(unit.type);
  const knownCategories = new Set(["PLOT", "APARTMENT", "VILLA", "COMMERCIAL", "INDUSTRIAL", "MIXED", "RESIDENTIAL"]);
  const projectIsCompatible = projectBucket === wanted
    || projectBucket === "MIXED"
    || projectBucket === "RESIDENTIAL"
    || projectBucket === "ANY";

  // "Residential" is a broad requirement, so it matches residential plots,
  // apartments and villas; a specific type still rejects mismatched units.
  if (wanted === "RESIDENTIAL") {
    return projectIsCompatible && ["PLOT", "APARTMENT", "VILLA", "RESIDENTIAL", "ANY"].includes(unitBucket);
  }
  // A clearly categorized unit takes precedence over a broad project label.
  if (knownCategories.has(unitBucket)) return unitBucket === wanted && projectIsCompatible;
  return projectIsCompatible;
}

export function matchingUnits(
  requirement: MatchableRequirement,
  project: MatchableProject,
  availableUnits: IUnit[],
): IUnit[] {
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

/** Retain match history but remove it from active recommendations when criteria no longer hold. */
async function markMatchIneligible(requirementId: string, projectId: string, reason: string): Promise<void> {
  const db = getDb();
  const [existing] = await db.select({
    id: propertyRequirementMatches._id,
    matchStatus: propertyRequirementMatches.matchStatus,
    emailStatus: propertyRequirementMatches.emailStatus,
    matchReasons: propertyRequirementMatches.matchReasons,
  }).from(propertyRequirementMatches).where(and(
    eq(propertyRequirementMatches.requirementId, requirementId),
    eq(propertyRequirementMatches.projectId, projectId),
  )).limit(1);
  if (!existing || existing.matchStatus === "NO_LONGER_ELIGIBLE") return;

  const pendingEmail = ["QUEUED", "RETRY_PENDING"].includes(existing.emailStatus);
  await db.update(propertyRequirementMatches).set({
    matchStatus: "NO_LONGER_ELIGIBLE",
    matchReasons: [...(existing.matchReasons ?? []), `NO_LONGER_ELIGIBLE:${reason}`].slice(-12),
    ...(pendingEmail ? {
      emailStatus: "SKIPPED" as const,
      emailNextAttemptAt: null,
      emailClaimedAt: null,
      emailLastError: reason,
    } : {}),
  }).where(eq(propertyRequirementMatches._id, existing.id));
}

async function invalidateRequirementMatches(requirementId: string, reason: string): Promise<void> {
  const db = getDb();
  const rows = await db.select({
    projectId: propertyRequirementMatches.projectId,
  }).from(propertyRequirementMatches).where(and(
    eq(propertyRequirementMatches.requirementId, requirementId),
    inArray(propertyRequirementMatches.matchStatus, ["MATCHED", "ENQUIRY_CREATED"]),
  ));
  for (const row of rows) await markMatchIneligible(requirementId, String(row.projectId), reason);
}

async function invalidateProjectMatches(projectId: string, reason: string): Promise<void> {
  const db = getDb();
  const rows = await db.select({
    requirementId: propertyRequirementMatches.requirementId,
  }).from(propertyRequirementMatches).where(and(
    eq(propertyRequirementMatches.projectId, projectId),
    inArray(propertyRequirementMatches.matchStatus, ["MATCHED", "ENQUIRY_CREATED"]),
  ));
  for (const row of rows) await markMatchIneligible(String(row.requirementId), projectId, reason);
}

function matchReasons(requirement: MatchableRequirement, project: MatchableProject): string[] {
  return [
    "CITY_MATCH",
    normalize(requirement.location) === normalize(requirement.city) ? "CITY_WIDE_LOCATION" : "LOCALITY_MATCH",
    `PROPERTY_TYPE:${typeBucket(requirement.propertyType)}`,
    `BUDGET:${requirement.minBudget == null ? 0 : Number(requirement.minBudget)}-${Number(requirement.maxBudget)}`,
    ...(requirement.minAreaSqft != null || requirement.maxAreaSqft != null ? ["AREA_MATCH"] : []),
    `PROJECT_TYPE:${typeBucket(project.projectType)}`,
  ];
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

function siteBaseUrl(): string {
  let base = process.env.CLIENT_URL || process.env.PUBLIC_SITE_URL || "https://truviventures.com";
  while (base.endsWith("/")) base = base.slice(0, -1);
  return base;
}

function propertyUrl(projectId: string, requirementMatchId?: string): string {
  const base = `${siteBaseUrl()}/inventory/${encodeURIComponent(projectId)}/presentation`;
  return requirementMatchId ? `${base}?requirementMatchId=${encodeURIComponent(requirementMatchId)}` : base;
}

/**
 * Matching itself is non-blocking relative to the project/requirement API.
 * Durable match rows are the email queue; SMTP is processed by a server
 * scheduler, with atomic claims and a bounded retry count.
 */
async function recordAndNotifyMatch(
  requirement: MatchableRequirement,
  project: MatchableProject,
  availableUnits: IUnit[],
): Promise<void> {
  const db = getDb();
  const matching = matchingUnits(requirement, project, availableUnits);
  if (requirement.status !== "ACTIVE") {
    await markMatchIneligible(String(requirement._id), String(project._id), "REQUIREMENT_NOT_ACTIVE");
    return;
  }
  if (!matching.length) {
    await markMatchIneligible(String(requirement._id), String(project._id), "NO_MATCHING_AVAILABLE_UNIT");
    return;
  }

  const reasons = matchReasons(requirement, project);
  const [inserted] = await db
    .insert(propertyRequirementMatches)
    .values({
      requirementId: requirement._id,
      projectId: project._id,
      matchStatus: "MATCHED",
      matchReasons: reasons,
      notificationStatus: "PENDING",
      emailStatus: "QUEUED",
      emailNextAttemptAt: new Date(),
    })
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
    if (matchRow?.matchStatus === "NO_LONGER_ELIGIBLE") {
      const [reopened] = await db.update(propertyRequirementMatches)
        .set({
          matchStatus: "MATCHED",
          matchReasons: reasons,
          notificationStatus: "PENDING",
          emailStatus: "QUEUED",
          emailAttempts: 0,
          emailLastError: null,
          emailNextAttemptAt: new Date(),
          inAppNotifiedAt: null,
          emailSentAt: null,
          emailProviderMessageId: null,
          emailDeliveredAt: null,
        })
        .where(eq(propertyRequirementMatches._id, matchRow._id))
        .returning();
      matchRow = reopened ?? matchRow;
    }
  }
  if (!matchRow) return;

  // A failed notification is eligible for bounded retry through the durable
  // matching job. The job itself stops retrying after five attempts.
  if (matchRow.notificationStatus === "FAILED") {
    const [reset] = await db.update(propertyRequirementMatches)
      .set({ notificationStatus: "PENDING" })
      .where(eq(propertyRequirementMatches._id, matchRow._id))
      .returning();
    matchRow = reset ?? matchRow;
  }

  if (matchRow.notificationStatus === "PENDING") {
    try {
      const created = await notifyUser(String(requirement.submittedById), {
        type: NotificationType.PROPERTY_MATCH,
        title: "New property in your preferred area",
        message: `A new ${project.projectType || requirement.propertyType || "property"} has been listed in ${project.location}, ${project.city}, matching your requirement. View the project for verified details and available inventory.`,
        priority: "high",
        data: {
          href: `/inventory/${project._id}/presentation?requirementMatchId=${encodeURIComponent(String(matchRow._id))}`,
          requirementId: String(requirement._id),
          projectId: String(project._id),
        },
        dedupeKey: `property-requirement:${requirement._id}:${project._id}`,
      });
      await db.update(propertyRequirementMatches)
        .set({
          notificationStatus: created.length > 0 ? "CREATED" : "SKIPPED",
          ...(created.length > 0 ? { inAppNotifiedAt: new Date() } : {}),
        })
        .where(eq(propertyRequirementMatches._id, matchRow._id));
    } catch {
      await db.update(propertyRequirementMatches)
        .set({ notificationStatus: "FAILED" })
        .where(eq(propertyRequirementMatches._id, matchRow._id))
        .catch(() => {});
      console.warn("[property-matching] in-app notification failed");
      // Re-throw so the durable job queue applies its bounded retry policy.
      throw new Error("IN_APP_NOTIFICATION_FAILED");
    }
  }
}

/** Match a submitted or updated active requirement against currently live inventory. */
export async function matchRequirementAgainstAvailableProjects(requirementId: string): Promise<void> {
  const db = getDb();
  const [requirement] = await db
    .select()
    .from(propertyRequirements)
    .where(eq(propertyRequirements._id, requirementId))
    .limit(1);
  if (!requirement) return;
  if (requirement.status !== "ACTIVE") {
    await invalidateRequirementMatches(String(requirement._id), "REQUIREMENT_NOT_ACTIVE");
    return;
  }

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

/** Match existing active requirements after a project goes live or inventory changes. */
export async function matchRequirementsForPublishedProject(projectId: string): Promise<void> {
  const db = getDb();
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects._id, projectId))
    .limit(1);
  if (!project) {
    await invalidateProjectMatches(projectId, "PROJECT_NOT_FOUND");
    return;
  }
  if (project.approvalStatus !== "APPROVED" || project.availabilityStatus !== "AVAILABLE") {
    await invalidateProjectMatches(projectId, "PROJECT_NOT_PUBLISHED_OR_UNAVAILABLE");
    return;
  }

  const availableUnits = await db
    .select()
    .from(units)
    .where(and(eq(units.projectId, project._id), eq(units.status, "AVAILABLE")));
  if (!availableUnits.length) {
    await invalidateProjectMatches(String(project._id), "NO_AVAILABLE_UNITS");
    return;
  }

  const activeRequirements = await db
    .select()
    .from(propertyRequirements)
    .where(eq(propertyRequirements.status, "ACTIVE"))
    .orderBy(desc(propertyRequirements.createdAt));

  for (const requirement of activeRequirements) {
    // Passing non-matches through recordAndNotifyMatch also invalidates stale
    // previously matched rows after a locality, type, price, or size change.
    await recordAndNotifyMatch(requirement, project, availableUnits);
  }
}

/** Enqueue matching work without extending a public API request's lifetime. */
export async function enqueueRequirementMatchJob(
  jobType: "REQUIREMENT" | "PROJECT",
  ids: { requirementId?: string; projectId?: string },
): Promise<void> {
  if (jobType === "REQUIREMENT" && !ids.requirementId) throw new Error("requirementId is required");
  if (jobType === "PROJECT" && !ids.projectId) throw new Error("projectId is required");

  await getDb().insert(propertyRequirementMatchJobs).values({
    jobType,
    requirementId: ids.requirementId ?? null,
    projectId: ids.projectId ?? null,
    status: "QUEUED",
    nextAttemptAt: new Date(),
  }).onConflictDoNothing();
}

/**
 * Durable matching job worker. Each job is atomically claimed by moving it to
 * RUNNING; two PM2 replicas cannot process the same job concurrently. Match
 * result rows provide the second line of idempotency.
 */
export async function processPropertyRequirementMatchJobs(limit = 25): Promise<{
  scanned: number; completed: number; retried: number; failed: number;
}> {
  const db = getDb();
  const now = new Date();
  const staleBefore = new Date(now.getTime() - 10 * 60_000);
  // Recover jobs left RUNNING if the process exited after claiming them.
  await db.update(propertyRequirementMatchJobs).set({
    status: "RETRY_PENDING",
    nextAttemptAt: now,
    updatedAt: now,
    lastError: "STALE_JOB_RECOVERED",
  }).where(and(
    eq(propertyRequirementMatchJobs.status, "RUNNING"),
    lt(propertyRequirementMatchJobs.attempts, 5),
    lt(propertyRequirementMatchJobs.updatedAt, staleBefore),
  ));
  await db.update(propertyRequirementMatchJobs).set({
    status: "FAILED",
    updatedAt: now,
    lastError: "STALE_JOB_EXHAUSTED",
  }).where(and(
    eq(propertyRequirementMatchJobs.status, "RUNNING"),
    gte(propertyRequirementMatchJobs.attempts, 5),
    lt(propertyRequirementMatchJobs.updatedAt, staleBefore),
  ));
  const pending = await db.select({ id: propertyRequirementMatchJobs._id })
    .from(propertyRequirementMatchJobs)
    .where(and(
      inArray(propertyRequirementMatchJobs.status, ["QUEUED", "RETRY_PENDING"]),
      lt(propertyRequirementMatchJobs.attempts, 5),
      lte(propertyRequirementMatchJobs.nextAttemptAt, now),
    ))
    .orderBy(desc(propertyRequirementMatchJobs.createdAt))
    .limit(Math.max(1, Math.min(100, Math.floor(limit))));

  let completed = 0;
  let retried = 0;
  let failed = 0;
  for (const item of pending) {
    const [job] = await db.update(propertyRequirementMatchJobs)
      .set({
        status: "RUNNING",
        attempts: sql`${propertyRequirementMatchJobs.attempts} + 1`,
        updatedAt: new Date(),
        lastError: null,
      })
      .where(and(
        eq(propertyRequirementMatchJobs._id, item.id),
        inArray(propertyRequirementMatchJobs.status, ["QUEUED", "RETRY_PENDING"]),
        lt(propertyRequirementMatchJobs.attempts, 5),
        lte(propertyRequirementMatchJobs.nextAttemptAt, now),
      ))
      .returning();
    if (!job) continue;

    try {
      if (job.jobType === "REQUIREMENT" && job.requirementId) {
        await matchRequirementAgainstAvailableProjects(String(job.requirementId));
      } else if (job.jobType === "PROJECT" && job.projectId) {
        await matchRequirementsForPublishedProject(String(job.projectId));
      } else {
        throw new Error("INVALID_MATCH_JOB_PAYLOAD");
      }
      await db.update(propertyRequirementMatchJobs)
        .set({ status: "COMPLETED", completedAt: new Date(), updatedAt: new Date(), lastError: null })
        .where(eq(propertyRequirementMatchJobs._id, job._id));
      completed++;
    } catch {
      const terminal = job.attempts >= 5;
      const retryDelayMinutes = job.attempts === 1 ? 1 : job.attempts === 2 ? 2 : job.attempts === 3 ? 5 : 15;
      await db.update(propertyRequirementMatchJobs).set({
        status: terminal ? "FAILED" : "RETRY_PENDING",
        nextAttemptAt: terminal ? now : new Date(Date.now() + retryDelayMinutes * 60_000),
        updatedAt: new Date(),
        lastError: "MATCH_PROCESSING_FAILED",
      }).where(eq(propertyRequirementMatchJobs._id, job._id));
      if (terminal) failed++;
      else retried++;
      console.warn("[property-matching] matching job failed");
    }
  }

  return { scanned: pending.length, completed, retried, failed };
}

/**
 * Durable queued email worker. Atomic status transition to SENDING means two
 * server replicas cannot send the same queue row. Retry policy is capped at
 * three attempts; SMTP acceptance is NOT reported as recipient delivery.
 */
export async function processPendingRequirementEmails(limit = 25): Promise<{ scanned: number; sentToProvider: number; retried: number; failed: number }> {
  const db = getDb();
  const now = new Date();
  const staleBefore = new Date(now.getTime() - 10 * 60_000);
  // Recover email jobs left SENDING by a crashed/restarted process.
  await db.update(propertyRequirementMatches).set({
    emailStatus: "RETRY_PENDING",
    emailNextAttemptAt: now,
    emailClaimedAt: null,
    emailLastError: "STALE_SEND_RECOVERED",
  }).where(and(
    eq(propertyRequirementMatches.emailStatus, "SENDING"),
    lt(propertyRequirementMatches.emailAttempts, 3),
    or(isNull(propertyRequirementMatches.emailClaimedAt), lt(propertyRequirementMatches.emailClaimedAt, staleBefore)),
  ));
  await db.update(propertyRequirementMatches).set({
    emailStatus: "FAILED",
    emailNextAttemptAt: null,
    emailClaimedAt: null,
    emailLastError: "STALE_SEND_EXHAUSTED",
  }).where(and(
    eq(propertyRequirementMatches.emailStatus, "SENDING"),
    gte(propertyRequirementMatches.emailAttempts, 3),
    or(isNull(propertyRequirementMatches.emailClaimedAt), lt(propertyRequirementMatches.emailClaimedAt, staleBefore)),
  ));
  const pending = await db
    .select({ id: propertyRequirementMatches._id })
    .from(propertyRequirementMatches)
    .where(and(
      inArray(propertyRequirementMatches.emailStatus, ["QUEUED", "RETRY_PENDING"]),
      lt(propertyRequirementMatches.emailAttempts, 3),
      or(isNull(propertyRequirementMatches.emailNextAttemptAt), lte(propertyRequirementMatches.emailNextAttemptAt, now)),
    ))
    .orderBy(desc(propertyRequirementMatches.createdAt))
    .limit(Math.max(1, Math.min(100, Math.floor(limit))));

  let sentToProvider = 0;
  let retried = 0;
  let failed = 0;

  for (const item of pending) {
    const [claimed] = await db.update(propertyRequirementMatches)
      .set({
        emailStatus: "SENDING",
        emailAttempts: sql`${propertyRequirementMatches.emailAttempts} + 1`,
        emailNextAttemptAt: null,
        emailClaimedAt: now,
      })
      .where(and(
        eq(propertyRequirementMatches._id, item.id),
        inArray(propertyRequirementMatches.emailStatus, ["QUEUED", "RETRY_PENDING"]),
        lt(propertyRequirementMatches.emailAttempts, 3),
        or(isNull(propertyRequirementMatches.emailNextAttemptAt), lte(propertyRequirementMatches.emailNextAttemptAt, now)),
      ))
      .returning();
    if (!claimed) continue;

    const attempt = claimed.emailAttempts;
    try {
      const [requirement] = await db.select().from(propertyRequirements)
        .where(eq(propertyRequirements._id, claimed.requirementId)).limit(1);
      const [project] = await db.select().from(projects)
        .where(eq(projects._id, claimed.projectId)).limit(1);
      if (claimed.matchStatus === "ENQUIRY_CREATED") {
        await db.update(propertyRequirementMatches).set({
          emailStatus: "SKIPPED",
          emailNextAttemptAt: null,
          emailClaimedAt: null,
          emailLastError: "ENQUIRY_ALREADY_CREATED",
        }).where(eq(propertyRequirementMatches._id, claimed._id));
        continue;
      }

      if (!requirement || requirement.status !== "ACTIVE" || !project
        || project.approvalStatus !== "APPROVED" || project.availabilityStatus !== "AVAILABLE") {
        await db.update(propertyRequirementMatches)
          .set({ matchStatus: "NO_LONGER_ELIGIBLE", emailStatus: "SKIPPED", emailLastError: "MATCH_NO_LONGER_ELIGIBLE" })
          .where(eq(propertyRequirementMatches._id, claimed._id));
        continue;
      }

      const availableUnits = await db.select().from(units).where(and(
        eq(units.projectId, project._id),
        eq(units.status, "AVAILABLE"),
      ));
      const matching = matchingUnits(requirement, project, availableUnits);
      if (!matching.length) {
        await db.update(propertyRequirementMatches)
          .set({ matchStatus: "NO_LONGER_ELIGIBLE", emailStatus: "SKIPPED", emailLastError: "NO_MATCHING_AVAILABLE_UNIT" })
          .where(eq(propertyRequirementMatches._id, claimed._id));
        continue;
      }

      const [recipient] = await db.select({
        id: users._id,
        name: users.name,
        email: users.email,
        emailVerified: users.emailVerified,
        disabled: users.disabled,
      }).from(users).where(eq(users._id, requirement.submittedById)).limit(1);

      if (!recipient || recipient.disabled || !recipient.email || !recipient.emailVerified) {
        await db.update(propertyRequirementMatches)
          .set({ emailStatus: "SKIPPED", emailLastError: "RECIPIENT_EMAIL_NOT_ELIGIBLE" })
          .where(eq(propertyRequirementMatches._id, claimed._id));
        continue;
      }

      const [emailOff] = await db.select({ id: userNotificationChannelPreferences._id })
        .from(userNotificationChannelPreferences)
        .where(and(
          eq(userNotificationChannelPreferences.userId, recipient.id),
          eq(userNotificationChannelPreferences.channel, "EMAIL"),
          eq(userNotificationChannelPreferences.category, "properties"),
          eq(userNotificationChannelPreferences.enabled, false),
        )).limit(1);
      if (emailOff) {
        await db.update(propertyRequirementMatches)
          .set({ emailStatus: "SKIPPED", emailLastError: "EMAIL_PREFERENCE_DISABLED" })
          .where(eq(propertyRequirementMatches._id, claimed._id));
        continue;
      }

      const prices = matching.map((unit) => Number(unit.price)).filter(Number.isFinite);
      const minPrice = Math.min(...prices);
      const maxPrice = Math.max(...prices);
      const priceText = minPrice === maxPrice ? inr(minPrice) : `${inr(minPrice)} – ${inr(maxPrice)}`;
      const projectLink = propertyUrl(String(project._id), String(claimed._id));
      const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#172033;line-height:1.6">
        <h2 style="color:#0f766e">A new property matches your Truvi requirement</h2>
        <p>Hello ${escapeHtml(recipient.name)},</p>
        <p>A newly available Truvi project matches your active property requirement.</p>
        <div style="border:1px solid #dbe3ea;border-radius:12px;padding:18px;margin:18px 0">
          <h3 style="margin:0 0 8px">${escapeHtml(project.name)}</h3>
          <p style="margin:4px 0"><strong>Location:</strong> ${escapeHtml(project.location)}, ${escapeHtml(project.city)}</p>
          <p style="margin:4px 0"><strong>Property type:</strong> ${escapeHtml(project.projectType || "Property")}</p>
          <p style="margin:4px 0"><strong>Matching available inventory:</strong> ${escapeHtml(priceText)}</p>
        </div>
        <p><a href="${projectLink}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#0f766e;color:#fff;text-decoration:none">View Property Details</a></p>
        <p style="font-size:12px;color:#64748b">You received this email because property recommendations are enabled for your Truvi account. <a href="${siteBaseUrl()}/settings/notifications" style="color:#0f766e">Manage notification preferences</a>.</p>
        <p>Team Truvi</p>
      </div>`;

      const result = await sendEmailWithStatus(
        String(recipient.email),
        "A New Property Matches Your Truvi Requirement",
        html,
      );
      if (result.status === "SENT_TO_PROVIDER") {
        await db.update(propertyRequirementMatches).set({
          emailStatus: "SENT_TO_PROVIDER",
          emailSentAt: new Date(),
          emailProviderMessageId: result.messageId,
          emailLastError: null,
          emailNextAttemptAt: null,
        }).where(eq(propertyRequirementMatches._id, claimed._id));

        // A provider webhook can arrive before the message ID has been persisted.
        // Reconcile any such early event so DELIVERED/FAILED is not lost to a race.
        const earlyEvents = await db.select({
          eventType: emailDeliveryEvents.eventType,
          providerCreatedAt: emailDeliveryEvents.providerCreatedAt,
        }).from(emailDeliveryEvents)
          .where(eq(emailDeliveryEvents.providerMessageId, result.messageId))
          .orderBy(desc(emailDeliveryEvents.receivedAt))
          .limit(20);
        const deliveredEvent = earlyEvents.find((event) => event.eventType === "email.delivered");
        const failedEvent = earlyEvents.find((event) => ["email.bounced", "email.complained", "email.failed"].includes(event.eventType));
        if (deliveredEvent) {
          await db.update(propertyRequirementMatches).set({
            emailStatus: "DELIVERED",
            emailDeliveredAt: deliveredEvent.providerCreatedAt ?? new Date(),
            emailLastError: null,
          }).where(eq(propertyRequirementMatches._id, claimed._id));
        } else if (failedEvent) {
          await db.update(propertyRequirementMatches).set({
            emailStatus: "FAILED",
            emailLastError: `RESEND_${failedEvent.eventType.replace(/[^a-z.]/g, "").toUpperCase().replace(/\./g, "_")}`,
            emailNextAttemptAt: null,
          }).where(eq(propertyRequirementMatches._id, claimed._id));
        }
        sentToProvider++;
      } else {
        // A missing SMTP configuration is a terminal operational issue until an
        // admin fixes config and manually retries; never claim that mail was sent.
        await db.update(propertyRequirementMatches).set({
          emailStatus: "FAILED",
          emailLastError: "SMTP_NOT_CONFIGURED",
          emailNextAttemptAt: null,
        }).where(eq(propertyRequirementMatches._id, claimed._id));
        failed++;
      }
    } catch {
      const terminal = attempt >= 3;
      const delayMinutes = attempt === 1 ? 1 : attempt === 2 ? 5 : 15;
      await db.update(propertyRequirementMatches).set({
        emailStatus: terminal ? "FAILED" : "RETRY_PENDING",
        emailLastError: "SMTP_SEND_FAILED",
        emailNextAttemptAt: terminal ? null : new Date(Date.now() + delayMinutes * 60_000),
      }).where(eq(propertyRequirementMatches._id, claimed._id));
      if (terminal) failed++;
      else retried++;
      console.warn("[property-matching] queued email attempt failed");
    }
  }

  return { scanned: pending.length, sentToProvider, retried, failed };
}

/** Start durable matching + email workers. DB claims make them safe on PM2 replicas. */
export function startPropertyRequirementBackgroundWorkers(): void {
  const runMatching = () => {
    processPropertyRequirementMatchJobs()
      .then((result) => {
        if (result.scanned > 0) {
          console.log(`[property-matching] jobs scanned=${result.scanned}, complete=${result.completed}, retry=${result.retried}, failed=${result.failed}`);
        }
      })
      .catch(() => console.warn("[property-matching] matching queue sweep failed"));
  };
  const runEmail = () => {
    processPendingRequirementEmails()
      .then((result) => {
        if (result.scanned > 0) {
          console.log(`[property-matching] email queue scanned=${result.scanned}, accepted=${result.sentToProvider}, retry=${result.retried}, failed=${result.failed}`);
        }
      })
      .catch(() => console.warn("[property-matching] email queue sweep failed"));
  };
  setTimeout(runMatching, 20_000).unref();
  setInterval(runMatching, 30_000).unref();
  setTimeout(runEmail, 45_000).unref();
  setInterval(runEmail, 60_000).unref();
}
