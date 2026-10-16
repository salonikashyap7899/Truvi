import { randomBytes, randomUUID } from "crypto";
import { Router } from "express";
import { and, desc, eq, gt, inArray, isNull, lte, notInArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../config/db";
import {
  habitatBookingStatusHistory,
  habitatBookings,
  habitatCommissionRules,
  habitatDeveloperAccess,
  habitatDisputes,
  habitatInvitations,
  habitatLedgerEntries,
  habitatMemberships,
  habitatPayments,
  habitatProviders,
  habitatProjectCategories,
  habitatQuotes,
  habitatRefunds,
  habitatReviews,
  habitatSettings,
  habitatServiceCategories,
  habitatServices,
  habitatTransfers,
  projects,
  users,
  type HabitatBookingStatus,
} from "../db/schema";
import { isValidId } from "../lib/ids";
import { authenticate, AuthedRequest, requireRole } from "../middleware/auth";
import {
  assertHabitatJournalBalanced,
  buildHabitatChargeJournal,
  calculateHabitatCancellation,
  calculateHabitatMoneySplit,
  canTransitionHabitatBooking,
  habitatEstimatePaise,
  isHabitatPayoutEligible,
  isHabitatAreaCovered,
  type HabitatLedgerLine,
} from "../services/habitat";
import {
  createHabitatLinkedAccount,
  createHabitatOrder,
  createHabitatRefund,
  createHabitatTransfer,
  habitatPaymentsEnabled,
  verifyHabitatPayment,
  verifyHabitatWebhook,
} from "../services/habitatPayments";

const router = Router();
const serviceAreaSchema = z.array(z.string().trim().min(2).max(80)).min(1).max(30);

const applicationSchema = z.object({
  businessName: z.string().trim().min(2).max(120),
  description: z.string().trim().min(20).max(2000),
  categoryIds: z.array(z.string().uuid()).min(1).max(15),
  serviceAreas: serviceAreaSchema,
  experienceYears: z.number().int().min(0).max(60),
});

const createServiceSchema = z.object({
  categoryId: z.string().uuid(),
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().min(20).max(3000),
  pricingModel: z.enum(["FIXED", "STARTING_PRICE", "QUOTE"]),
  pricePaise: z.number().int().positive().safe().nullable(),
  durationMinutes: z.number().int().positive().max(1440).nullable().optional(),
  includes: z.array(z.string().trim().min(1).max(200)).max(30).default([]),
  excludes: z.array(z.string().trim().min(1).max(200)).max(30).default([]),
  cancellationPolicy: z.string().trim().min(10).max(1000),
});

const addressSchema = z.object({
  label: z.string().trim().min(1).max(60),
  street: z.string().trim().min(3).max(200),
  locality: z.string().trim().min(2).max(120),
  city: z.string().trim().min(2).max(100),
  postalCode: z.string().trim().regex(/^\d{6}$/, "Enter a valid 6-digit Indian PIN code"),
  instructions: z.string().trim().max(500).optional(),
});

const createBookingSchema = z.object({
  projectId: z.string().uuid(),
  serviceId: z.string().uuid(),
  address: addressSchema,
  preferredAt: z.string().datetime(),
  requestDetails: z.string().trim().max(1500).optional(),
  termsAccepted: z.literal(true),
  idempotencyKey: z.string().uuid(),
});

const providerStatusSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED", "SUSPENDED"]),
  reviewNote: z.string().trim().min(3).max(1000),
});

const bookingStatusSchema = z.object({
  status: z.enum([
    "ACCEPTED",
    "REJECTED",
    "IN_PROGRESS",
    "COMPLETION_SUBMITTED",
    "COMPLETED",
    "CANCELLED",
    "DISPUTED",
  ]),
  reason: z.string().trim().max(1000).optional(),
});

function validationError(res: import("express").Response, error: z.ZodError) {
  return res.status(400).json({ error: error.issues[0]?.message ?? "Invalid request", issues: error.flatten() });
}

function activeInvitationWhere(code: string) {
  const now = new Date();
  return and(
    eq(habitatInvitations.code, code),
    isNull(habitatInvitations.revokedAt),
    or(isNull(habitatInvitations.expiresAt), gt(habitatInvitations.expiresAt, now)),
  );
}

async function getApprovedProviderForUser(userId: string) {
  const [provider] = await getDb()
    .select()
    .from(habitatProviders)
    .where(eq(habitatProviders.ownerUserId, userId))
    .limit(1);
  return provider;
}

async function recordBookingStatus(
  bookingId: string,
  fromStatus: HabitatBookingStatus,
  toStatus: HabitatBookingStatus,
  actorUserId: string,
  reason?: string,
) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select({ autoCompleteAt: habitatBookings.autoCompleteAt })
      .from(habitatBookings)
      .where(and(eq(habitatBookings._id, bookingId), eq(habitatBookings.status, fromStatus)))
      .limit(1);
    if (!current) return null;
    const now = new Date();
    const [settings] = toStatus === "COMPLETION_SUBMITTED"
      ? await tx.select().from(habitatSettings).where(eq(habitatSettings.singletonKey, "default")).limit(1)
      : [];
    const autoCompleteAt = toStatus === "COMPLETION_SUBMITTED"
      ? new Date(now.getTime() + (settings?.autoCompleteHours ?? 72) * 60 * 60 * 1000)
      : current.autoCompleteAt;
    const [updated] = await tx
      .update(habitatBookings)
      .set({
        status: toStatus,
        ...(toStatus === "COMPLETION_SUBMITTED" ? { completionSubmittedAt: now, autoCompleteAt } : {}),
        ...(toStatus === "COMPLETED" ? {
          completedAt: now,
          payoutEligibleAt: autoCompleteAt ?? now,
          payoutStatus: "ON_HOLD",
        } : {}),
        updatedAt: now,
      })
      .where(and(eq(habitatBookings._id, bookingId), eq(habitatBookings.status, fromStatus)))
      .returning();
    if (!updated) return null;
    await tx.insert(habitatBookingStatusHistory).values({
      bookingId,
      actorUserId,
      fromStatus,
      toStatus,
      reason: reason || null,
    });
    return updated;
  });
}

function habitatLedgerRows(
  bookingId: string,
  paymentId: string | null,
  operationKey: string,
  lines: HabitatLedgerLine[],
) {
  assertHabitatJournalBalanced(lines);
  const journalId = randomUUID();
  return lines.map((line, index) => ({
    journalId,
    bookingId,
    paymentId,
    accountCode: line.accountCode,
    direction: line.direction,
    amountPaise: line.amountPaise,
    idempotencyKey: `${operationKey}:${index}`,
    metadata: {},
  }));
}

async function getActiveCommissionRule(categoryId: string, projectId: string, providerId: string) {
  const now = new Date();
  const candidates = await getDb()
    .select()
    .from(habitatCommissionRules)
    .where(and(
      eq(habitatCommissionRules.categoryId, categoryId),
      or(isNull(habitatCommissionRules.projectId), eq(habitatCommissionRules.projectId, projectId)),
      or(isNull(habitatCommissionRules.providerId), eq(habitatCommissionRules.providerId, providerId)),
      lte(habitatCommissionRules.effectiveFrom, now),
      or(isNull(habitatCommissionRules.effectiveUntil), gt(habitatCommissionRules.effectiveUntil, now)),
    ));
  return candidates.sort((left, right) => {
    const leftSpecificity = Number(left.projectId !== null) + Number(left.providerId !== null);
    const rightSpecificity = Number(right.projectId !== null) + Number(right.providerId !== null);
    return rightSpecificity - leftSpecificity || right.effectiveFrom.getTime() - left.effectiveFrom.getTime();
  })[0] ?? null;
}

// Public catalog. Prices are integer paise and quote-based work is explicitly
// returned without a fabricated amount.
router.get("/categories", async (_req, res) => {
  const categories = await getDb()
    .select()
    .from(habitatServiceCategories)
    .where(eq(habitatServiceCategories.active, true))
    .orderBy(habitatServiceCategories.sortOrder, habitatServiceCategories.name);
  res.json({ categories });
});

router.get("/services", async (req, res) => {
  const categoryId = typeof req.query.categoryId === "string" ? req.query.categoryId : undefined;
  const projectId = typeof req.query.projectId === "string" ? req.query.projectId : undefined;
  const city = typeof req.query.city === "string" ? req.query.city.trim() : undefined;
  if (categoryId && !isValidId(categoryId)) return res.status(400).json({ error: "Invalid categoryId" });
  if (projectId && !isValidId(projectId)) return res.status(400).json({ error: "Invalid projectId" });
  if (city !== undefined && (city.length < 2 || city.length > 100)) return res.status(400).json({ error: "Invalid city" });
  const db = getDb();
  let disabledProjectCategoryIds: string[] = [];
  if (projectId) {
    const [project] = await db.select({
      habitatEnabled: projects.habitatEnabled,
      approvalStatus: projects.approvalStatus,
    }).from(projects).where(eq(projects._id, projectId)).limit(1);
    if (!project || !project.habitatEnabled || project.approvalStatus !== "APPROVED") {
      return res.status(404).json({ error: "Habitat project not found" });
    }
    const projectCategories = await db.select({
      categoryId: habitatProjectCategories.categoryId,
      enabled: habitatProjectCategories.enabled,
    }).from(habitatProjectCategories).where(eq(habitatProjectCategories.projectId, projectId));
    if (projectCategories.length) {
      disabledProjectCategoryIds = projectCategories.filter((entry) => !entry.enabled).map((entry) => entry.categoryId);
    }
  }
  const conditions = and(
    eq(habitatServices.active, true),
    eq(habitatServiceCategories.active, true),
    ...(categoryId ? [eq(habitatServices.categoryId, categoryId)] : []),
    ...(disabledProjectCategoryIds.length ? [notInArray(habitatServices.categoryId, disabledProjectCategoryIds)] : []),
  );
  const rows = await db
    .select({ service: habitatServices, category: habitatServiceCategories })
    .from(habitatServices)
    .innerJoin(habitatServiceCategories, eq(habitatServices.categoryId, habitatServiceCategories._id))
    .where(conditions)
    .orderBy(habitatServiceCategories.sortOrder, habitatServices.title)
    .limit(100);

  const ids = rows.map(({ service }) => service._id);
  const reviews = ids.length
    ? await db.select({ serviceId: habitatReviews.serviceId, rating: habitatReviews.rating }).from(habitatReviews).where(inArray(habitatReviews.serviceId, ids))
    : [];
  const providers = await db
    .select({
      id: habitatProviders._id,
      businessName: habitatProviders.businessName,
      description: habitatProviders.description,
      categoryIds: habitatProviders.categoryIds,
      serviceAreas: habitatProviders.serviceAreas,
      experienceYears: habitatProviders.experienceYears,
    })
    .from(habitatProviders)
    .where(eq(habitatProviders.status, "APPROVED"));
  const reviewTotals = new Map<string, { sum: number; count: number }>();
  for (const review of reviews) {
    const current = reviewTotals.get(review.serviceId) ?? { sum: 0, count: 0 };
    current.sum += review.rating;
    current.count++;
    reviewTotals.set(review.serviceId, current);
  }

  const visibleServices = rows.map(({ service, category }) => {
      const rating = reviewTotals.get(service._id);
      const matchingProviders = providers.filter((provider) =>
        provider.categoryIds.includes(category._id) &&
        (!city || isHabitatAreaCovered(provider.serviceAreas, city)),
      );
      return {
        ...service,
        category: { _id: category._id, name: category.name, slug: category.slug, icon: category.icon },
        availableProviderCount: matchingProviders.length,
        availableProviders: matchingProviders.map(({ categoryIds: _categoryIds, ...provider }) => provider),
        averageRating: rating ? Math.round((rating.sum / rating.count) * 10) / 10 : null,
        reviewCount: rating?.count ?? 0,
      };
    });
  res.json({ services: city ? visibleServices.filter((service) => service.availableProviderCount > 0) : visibleServices });
});

router.get("/services/:serviceId", async (req, res) => {
  const { serviceId } = req.params;
  if (!isValidId(serviceId)) return res.status(400).json({ error: "Invalid serviceId" });
  const [row] = await getDb()
    .select({ service: habitatServices, category: habitatServiceCategories })
    .from(habitatServices)
    .innerJoin(habitatServiceCategories, eq(habitatServices.categoryId, habitatServiceCategories._id))
    .where(and(eq(habitatServices._id, serviceId), eq(habitatServices.active, true), eq(habitatServiceCategories.active, true)))
    .limit(1);
  if (!row) return res.status(404).json({ error: "Service not found" });
  res.json({ service: { ...row.service, category: row.category } });
});

router.get("/services/:serviceId/providers", async (req, res) => {
  const { serviceId } = req.params;
  const city = typeof req.query.city === "string" ? req.query.city.trim() : "";
  const locality = typeof req.query.locality === "string" ? req.query.locality.trim() : undefined;
  if (!isValidId(serviceId)) return res.status(400).json({ error: "Invalid serviceId" });
  if (city.length < 2 || city.length > 100 || (locality && locality.length > 120)) {
    return res.status(400).json({ error: "A valid city is required to check provider availability" });
  }
  const [service] = await getDb()
    .select({ categoryId: habitatServices.categoryId })
    .from(habitatServices)
    .innerJoin(habitatServiceCategories, eq(habitatServices.categoryId, habitatServiceCategories._id))
    .where(and(
      eq(habitatServices._id, serviceId),
      eq(habitatServices.active, true),
      eq(habitatServiceCategories.active, true),
    ))
    .limit(1);
  if (!service) return res.status(404).json({ error: "Service not found" });
  const all = await getDb()
    .select({
      id: habitatProviders._id,
      businessName: habitatProviders.businessName,
      description: habitatProviders.description,
      categoryIds: habitatProviders.categoryIds,
      serviceAreas: habitatProviders.serviceAreas,
      experienceYears: habitatProviders.experienceYears,
    })
    .from(habitatProviders)
    .where(eq(habitatProviders.status, "APPROVED"))
    .limit(200);
  res.json({
    providers: all
      .filter((provider) => provider.categoryIds.includes(service.categoryId))
      .filter((provider) => isHabitatAreaCovered(provider.serviceAreas, city, locality))
      .map(({ categoryIds: _categoryIds, ...provider }) => provider),
  });
});

router.get("/invitations/:code", async (req, res) => {
  const code = typeof req.params.code === "string" ? req.params.code : "";
  if (!/^[A-Za-z0-9_-]{20,40}$/.test(code)) return res.status(404).json({ error: "Invitation not found or expired" });
  const [invitation] = await getDb()
    .select({
      invitation: habitatInvitations,
      projectName: projects.name,
      city: projects.city,
    })
    .from(habitatInvitations)
    .innerJoin(projects, eq(habitatInvitations.projectId, projects._id))
    .where(and(
      activeInvitationWhere(code),
      eq(projects.approvalStatus, "APPROVED"),
      eq(projects.habitatEnabled, true),
    ))
    .limit(1);
  if (!invitation) return res.status(404).json({ error: "Invitation not found or expired" });
  res.json({
    invitation: {
      code: invitation.invitation.code,
      projectName: invitation.projectName,
      city: invitation.city,
      expiresAt: invitation.invitation.expiresAt,
    },
  });
});

router.post("/invitations/:code/claim", authenticate, requireRole("BUYER"), async (req: AuthedRequest, res) => {
  const code = typeof req.params.code === "string" ? req.params.code : "";
  const consent = z.object({ consented: z.literal(true) }).safeParse(req.body);
  if (!consent.success) return validationError(res, consent.error);
  const db = getDb();
  const [invitation] = await db
    .select({ invitation: habitatInvitations, projectApprovalStatus: projects.approvalStatus })
    .from(habitatInvitations)
    .innerJoin(projects, eq(habitatInvitations.projectId, projects._id))
    .where(and(
      activeInvitationWhere(code),
      eq(projects.approvalStatus, "APPROVED"),
      eq(projects.habitatEnabled, true),
    ))
    .limit(1);
  if (!invitation) return res.status(404).json({ error: "Invitation not found or expired" });

  await db
    .insert(habitatMemberships)
    .values({
      buyerId: req.user!.userId,
      projectId: invitation.invitation.projectId,
      invitationId: invitation.invitation._id,
      consentedAt: new Date(),
    })
    .onConflictDoNothing({
      target: [habitatMemberships.buyerId, habitatMemberships.projectId],
    });
  const [membershipRow] = await db
    .select({ membership: habitatMemberships })
    .from(habitatMemberships)
    .where(and(
      eq(habitatMemberships.buyerId, req.user!.userId),
      eq(habitatMemberships.projectId, invitation.invitation.projectId),
    ))
    .limit(1);
  const membership = membershipRow?.membership;
  res.status(200).json({ membership });
});

router.get("/memberships", authenticate, requireRole("BUYER"), async (req: AuthedRequest, res) => {
  const memberships = await getDb()
    .select({
      membership: habitatMemberships,
      projectName: projects.name,
      city: projects.city,
    })
    .from(habitatMemberships)
    .innerJoin(projects, eq(habitatMemberships.projectId, projects._id))
    .where(and(
      eq(habitatMemberships.buyerId, req.user!.userId),
      eq(projects.habitatEnabled, true),
      eq(projects.approvalStatus, "APPROVED"),
    ))
    .orderBy(desc(habitatMemberships.createdAt));
  res.json({
    memberships: memberships.map(({ membership, projectName, city }) => ({
      ...membership,
      projectName,
      city,
    })),
  });
});

router.post("/providers/apply", authenticate, async (req: AuthedRequest, res) => {
  const parsed = applicationSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error);
  const { categoryIds, serviceAreas } = parsed.data;
  const uniqueCategoryIds = [...new Set(categoryIds)];
  if (uniqueCategoryIds.length !== categoryIds.length) {
    return res.status(400).json({ error: "Choose each service category only once" });
  }
  const db = getDb();
  const categories = await db
    .select({ id: habitatServiceCategories._id })
    .from(habitatServiceCategories)
    .where(and(inArray(habitatServiceCategories._id, uniqueCategoryIds), eq(habitatServiceCategories.active, true)));
  if (categories.length !== uniqueCategoryIds.length) {
    return res.status(400).json({ error: "One or more selected service categories are unavailable" });
  }
  const [existing] = await db.select().from(habitatProviders).where(eq(habitatProviders.ownerUserId, req.user!.userId)).limit(1);
  if (existing && existing.status !== "REJECTED") {
    return res.status(409).json({ error: "A provider application already exists for this account" });
  }

  const values = {
    businessName: parsed.data.businessName,
    description: parsed.data.description,
    categoryIds: uniqueCategoryIds,
    serviceAreas: [...new Set(serviceAreas.map((area) => area.trim()))],
    experienceYears: parsed.data.experienceYears,
    status: "PENDING" as const,
    reviewNote: null,
    reviewedById: null,
    reviewedAt: null,
    updatedAt: new Date(),
  };
  const [provider] = existing
    ? await db.update(habitatProviders).set(values).where(eq(habitatProviders._id, existing._id)).returning()
    : await db.insert(habitatProviders).values({ ...values, ownerUserId: req.user!.userId }).returning();
  res.status(existing ? 200 : 201).json({ provider });
});

router.get("/provider/me", authenticate, async (req: AuthedRequest, res) => {
  const [provider] = await getDb()
    .select()
    .from(habitatProviders)
    .where(eq(habitatProviders.ownerUserId, req.user!.userId))
    .limit(1);
  res.json({ provider: provider ?? null });
});

router.get("/provider/bookings", authenticate, async (req: AuthedRequest, res) => {
  const provider = await getApprovedProviderForUser(req.user!.userId);
  if (!provider || provider.status !== "APPROVED") {
    return res.status(403).json({ error: "An approved provider profile is required to view assigned bookings" });
  }
  const bookings = await getDb()
    .select({ booking: habitatBookings, serviceTitle: habitatServices.title })
    .from(habitatBookings)
    .innerJoin(habitatServices, eq(habitatBookings.serviceId, habitatServices._id))
    .where(eq(habitatBookings.providerId, provider._id))
    .orderBy(desc(habitatBookings.preferredAt))
    .limit(100);
  res.json({ bookings: bookings.map(({ booking, serviceTitle }) => ({ ...booking, serviceTitle })) });
});

router.patch("/bookings/:bookingId/provider-status", authenticate, async (req: AuthedRequest, res) => {
  const { bookingId } = req.params;
  if (!isValidId(bookingId)) return res.status(400).json({ error: "Invalid bookingId" });
  const parsed = bookingStatusSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error);
  const provider = await getApprovedProviderForUser(req.user!.userId);
  if (!provider || provider.status !== "APPROVED") {
    return res.status(403).json({ error: "An approved provider profile is required" });
  }
  const [booking] = await getDb().select().from(habitatBookings).where(eq(habitatBookings._id, bookingId)).limit(1);
  if (!booking || booking.providerId !== provider._id) return res.status(404).json({ error: "Assigned booking not found" });
  if (!canTransitionHabitatBooking("PROVIDER", booking.status, parsed.data.status)) {
    return res.status(409).json({ error: `Cannot change booking from ${booking.status} to ${parsed.data.status}` });
  }
  const updated = await recordBookingStatus(bookingId, booking.status, parsed.data.status, req.user!.userId, parsed.data.reason);
  if (!updated) return res.status(409).json({ error: "Booking changed; refresh and try again" });
  res.json({ booking: updated });
});

router.get("/bookings", authenticate, requireRole("BUYER"), async (req: AuthedRequest, res) => {
  const rows = await getDb()
    .select({ booking: habitatBookings, serviceTitle: habitatServices.title, providerName: habitatProviders.businessName })
    .from(habitatBookings)
    .innerJoin(habitatServices, eq(habitatBookings.serviceId, habitatServices._id))
    .leftJoin(habitatProviders, eq(habitatBookings.providerId, habitatProviders._id))
    .where(eq(habitatBookings.buyerId, req.user!.userId))
    .orderBy(desc(habitatBookings.createdAt))
    .limit(100);
  res.json({
    bookings: rows.map(({ booking, serviceTitle, providerName }) => ({
      ...booking,
      serviceTitle,
      providerName,
    })),
  });
});

router.post("/bookings", authenticate, requireRole("BUYER"), async (req: AuthedRequest, res) => {
  const parsed = createBookingSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error);
  const { projectId, serviceId, preferredAt } = parsed.data;
  const requestedAt = new Date(preferredAt);
  if (requestedAt <= new Date() || requestedAt.getTime() > Date.now() + 180 * 24 * 60 * 60 * 1000) {
    return res.status(400).json({ error: "Choose a service time within the next 180 days" });
  }

  const db = getDb();
  const [membership] = await db
    .select({ membership: habitatMemberships })
    .from(habitatMemberships)
    .innerJoin(projects, eq(habitatMemberships.projectId, projects._id))
    .where(and(
      eq(habitatMemberships.buyerId, req.user!.userId),
      eq(habitatMemberships.projectId, projectId),
      eq(projects.habitatEnabled, true),
      eq(projects.approvalStatus, "APPROVED"),
    ))
    .limit(1);
  const selectedMembership = membership?.membership;
  if (!selectedMembership) return res.status(403).json({ error: "Claim a valid project invitation before booking a Habitat service" });
  const [service] = await db
    .select({ service: habitatServices })
    .from(habitatServices)
    .innerJoin(habitatServiceCategories, eq(habitatServices.categoryId, habitatServiceCategories._id))
    .where(and(
      eq(habitatServices._id, serviceId),
      eq(habitatServices.active, true),
      eq(habitatServiceCategories.active, true),
    ))
    .limit(1);
  const selectedService = service?.service;
  if (!selectedService) return res.status(404).json({ error: "Service is not currently available" });
  const projectCategories = await db.select({
    categoryId: habitatProjectCategories.categoryId,
    enabled: habitatProjectCategories.enabled,
  }).from(habitatProjectCategories).where(eq(habitatProjectCategories.projectId, projectId));
  if (projectCategories.some((entry) =>
    entry.categoryId === selectedService.categoryId && !entry.enabled,
  )) {
    return res.status(409).json({ error: "This service category is not enabled for the selected project" });
  }

  let estimate: number | null;
  try {
    estimate = habitatEstimatePaise(selectedService.pricingModel, selectedService.pricePaise);
  } catch {
    return res.status(409).json({ error: "The service pricing is not configured correctly; contact support" });
  }
  const eligibleProviders = await db
    .select({
      categoryIds: habitatProviders.categoryIds,
      serviceAreas: habitatProviders.serviceAreas,
    })
    .from(habitatProviders)
    .where(eq(habitatProviders.status, "APPROVED"));
  if (!eligibleProviders.some((provider) =>
    provider.categoryIds.includes(selectedService.categoryId) &&
    isHabitatAreaCovered(provider.serviceAreas, parsed.data.address.city, parsed.data.address.locality),
  )) {
    return res.status(409).json({ error: "No approved provider currently covers this service area" });
  }

  const created = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(habitatBookings)
      .where(and(
        eq(habitatBookings.buyerId, req.user!.userId),
        eq(habitatBookings.idempotencyKey, parsed.data.idempotencyKey),
      ))
      .limit(1);
    if (existing) return { booking: existing, replayed: true };

    const reference = `HAB-${randomBytes(8).toString("hex").toUpperCase()}`;
    const [booking] = await tx
      .insert(habitatBookings)
      .values({
        reference,
        buyerId: req.user!.userId,
        projectId,
        invitationId: selectedMembership.invitationId,
        serviceId,
        status: "REQUESTED",
        serviceTitleSnapshot: selectedService.title,
        pricingModelSnapshot: selectedService.pricingModel,
        estimatedAmountPaise: estimate,
        serviceAddress: parsed.data.address,
        preferredAt: requestedAt,
        requestDetails: parsed.data.requestDetails || null,
        termsAcceptedAt: new Date(),
        idempotencyKey: parsed.data.idempotencyKey,
      })
      .onConflictDoNothing({
        target: [habitatBookings.buyerId, habitatBookings.idempotencyKey],
      })
      .returning();
    if (booking) {
      await tx.insert(habitatBookingStatusHistory).values({
        bookingId: booking._id,
        actorUserId: req.user!.userId,
        fromStatus: null,
        toStatus: "REQUESTED",
        reason: "Buyer submitted the booking request",
      });
      return { booking, replayed: false };
    }

    const [racedBooking] = await tx
      .select()
      .from(habitatBookings)
      .where(and(
        eq(habitatBookings.buyerId, req.user!.userId),
        eq(habitatBookings.idempotencyKey, parsed.data.idempotencyKey),
      ))
      .limit(1);
    if (!racedBooking) throw new Error("Booking idempotency conflict could not be resolved");
    return { booking: racedBooking, replayed: true };
  });
  res.status(created.replayed ? 200 : 201).json({ booking: created.booking, replayed: created.replayed });
});

router.patch("/bookings/:bookingId/buyer-status", authenticate, requireRole("BUYER"), async (req: AuthedRequest, res) => {
  const { bookingId } = req.params;
  if (!isValidId(bookingId)) return res.status(400).json({ error: "Invalid bookingId" });
  const parsed = bookingStatusSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error);
  if (["COMPLETED", "CANCELLED", "DISPUTED"].includes(parsed.data.status)) {
    return res.status(409).json({ error: "Use the Habitat completion, cancellation, or dispute workflow so payment records stay consistent" });
  }
  const [booking] = await getDb()
    .select()
    .from(habitatBookings)
    .where(and(eq(habitatBookings._id, bookingId), eq(habitatBookings.buyerId, req.user!.userId)))
    .limit(1);
  if (!booking) return res.status(404).json({ error: "Booking not found" });
  if (!canTransitionHabitatBooking("BUYER", booking.status, parsed.data.status)) {
    return res.status(409).json({ error: `Cannot change booking from ${booking.status} to ${parsed.data.status}` });
  }
  const updated = await recordBookingStatus(bookingId, booking.status, parsed.data.status, req.user!.userId, parsed.data.reason);
  if (!updated) return res.status(409).json({ error: "Booking changed; refresh and try again" });
  res.json({ booking: updated });
});

router.post("/bookings/:bookingId/reviews", authenticate, requireRole("BUYER"), async (req: AuthedRequest, res) => {
  const { bookingId } = req.params;
  if (!isValidId(bookingId)) return res.status(400).json({ error: "Invalid bookingId" });
  const parsed = z.object({
    rating: z.number().int().min(1).max(5),
    comment: z.string().trim().max(1000).optional(),
  }).safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error);
  const db = getDb();
  const [booking] = await db
    .select()
    .from(habitatBookings)
    .where(and(eq(habitatBookings._id, bookingId), eq(habitatBookings.buyerId, req.user!.userId)))
    .limit(1);
  if (!booking || booking.status !== "COMPLETED" || !booking.providerId) {
    return res.status(409).json({ error: "Only a completed service with an assigned provider can be reviewed" });
  }
  const [review] = await db
    .insert(habitatReviews)
    .values({
      bookingId,
      buyerId: req.user!.userId,
      providerId: booking.providerId,
      serviceId: booking.serviceId,
      rating: parsed.data.rating,
      comment: parsed.data.comment || null,
    })
    .onConflictDoNothing({ target: habitatReviews.bookingId })
    .returning();
  if (!review) return res.status(409).json({ error: "This booking has already been reviewed" });
  res.status(201).json({ review });
});

// Provider, booking assignment, catalog, and invitation administration.
router.get("/admin/overview", authenticate, requireRole("ADMIN"), async (_req, res) => {
  const db = getDb();
  const [providers, bookings, services, categories, memberships] = await Promise.all([
    db.select({ status: habitatProviders.status, total: sql<number>`count(*)::int` }).from(habitatProviders).groupBy(habitatProviders.status),
    db.select({ status: habitatBookings.status, total: sql<number>`count(*)::int` }).from(habitatBookings).groupBy(habitatBookings.status),
    db.select({ total: sql<number>`count(*)::int` }).from(habitatServices).where(eq(habitatServices.active, true)),
    db.select({ total: sql<number>`count(*)::int` }).from(habitatServiceCategories).where(eq(habitatServiceCategories.active, true)),
    db.select({ total: sql<number>`count(*)::int` }).from(habitatMemberships),
  ]);
  res.json({
    providers: Object.fromEntries(providers.map(({ status, total }) => [status, total])),
    bookings: Object.fromEntries(bookings.map(({ status, total }) => [status, total])),
    activeServices: services[0]?.total ?? 0,
    activeCategories: categories[0]?.total ?? 0,
    attributedBuyers: memberships[0]?.total ?? 0,
  });
});

router.get("/admin/projects", authenticate, requireRole("ADMIN"), async (_req, res) => {
  const db = getDb();
  const approvedProjects = await db
    .select({
      id: projects._id,
      name: projects.name,
      city: projects.city,
      location: projects.location,
      habitatEnabled: projects.habitatEnabled,
    })
    .from(projects)
    .where(eq(projects.approvalStatus, "APPROVED"))
    .orderBy(projects.name)
    .limit(500);
  const accessRows = approvedProjects.length
    ? await db.select({
      projectId: habitatDeveloperAccess.projectId,
      active: habitatDeveloperAccess.active,
    }).from(habitatDeveloperAccess)
      .where(inArray(habitatDeveloperAccess.projectId, approvedProjects.map((project) => project.id)))
    : [];
  const accessByProject = new Map(accessRows.map(({ projectId, active }) => [projectId, active]));
  res.json({ projects: approvedProjects.map((project) => ({
    ...project,
    habitatDeveloperAccess: accessByProject.get(project.id) ?? false,
  })) });
});

router.patch("/admin/projects/:projectId/habitat", authenticate, requireRole("ADMIN"), async (req: AuthedRequest, res) => {
  const { projectId } = req.params;
  if (!isValidId(projectId)) return res.status(400).json({ error: "Invalid projectId" });
  const parsed = z.object({ enabled: z.boolean() }).safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error);
  const now = new Date();
  const [project] = await getDb()
    .update(projects)
    .set({
      habitatEnabled: parsed.data.enabled,
      habitatEnabledAt: parsed.data.enabled ? now : null,
      habitatEnabledById: parsed.data.enabled ? req.user!.userId : null,
    })
    .where(and(eq(projects._id, projectId), eq(projects.approvalStatus, "APPROVED")))
    .returning({ id: projects._id, name: projects.name, habitatEnabled: projects.habitatEnabled });
  if (!project) return res.status(404).json({ error: "Approved project not found" });
  res.json({ project });
});

router.get("/admin/categories", authenticate, requireRole("ADMIN"), async (_req, res) => {
  const categories = await getDb()
    .select()
    .from(habitatServiceCategories)
    .orderBy(habitatServiceCategories.sortOrder, habitatServiceCategories.name)
    .limit(100);
  res.json({ categories });
});

router.get("/admin/providers", authenticate, requireRole("ADMIN"), async (_req, res) => {
  const rows = await getDb()
    .select({
      provider: habitatProviders,
      ownerName: users.name,
      ownerEmail: users.email,
      ownerPhone: users.phone,
    })
    .from(habitatProviders)
    .innerJoin(users, eq(habitatProviders.ownerUserId, users._id))
    .orderBy(desc(habitatProviders.createdAt))
    .limit(100);
  res.json({ providers: rows.map(({ provider, ...owner }) => ({ ...provider, owner })) });
});

router.patch("/admin/providers/:providerId", authenticate, requireRole("ADMIN"), async (req: AuthedRequest, res) => {
  const { providerId } = req.params;
  if (!isValidId(providerId)) return res.status(400).json({ error: "Invalid providerId" });
  const parsed = providerStatusSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error);
  const [provider] = await getDb()
    .update(habitatProviders)
    .set({
      status: parsed.data.status,
      reviewNote: parsed.data.reviewNote,
      reviewedById: req.user!.userId,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(habitatProviders._id, providerId))
    .returning();
  if (!provider) return res.status(404).json({ error: "Provider application not found" });
  res.json({ provider });
});

router.get("/admin/bookings", authenticate, requireRole("ADMIN"), async (_req, res) => {
  const bookings = await getDb()
    .select({
      booking: habitatBookings,
      buyerName: users.name,
      buyerPhone: users.phone,
      serviceTitle: habitatServices.title,
      providerName: habitatProviders.businessName,
    })
    .from(habitatBookings)
    .innerJoin(users, eq(habitatBookings.buyerId, users._id))
    .innerJoin(habitatServices, eq(habitatBookings.serviceId, habitatServices._id))
    .leftJoin(habitatProviders, eq(habitatBookings.providerId, habitatProviders._id))
    .orderBy(desc(habitatBookings.createdAt))
    .limit(100);
  res.json({
    bookings: bookings.map(({ booking, ...display }) => ({ ...booking, ...display })),
  });
});

router.patch("/admin/bookings/:bookingId/assign", authenticate, requireRole("ADMIN"), async (req: AuthedRequest, res) => {
  const { bookingId } = req.params;
  const parsed = z.object({ providerId: z.string().uuid() }).safeParse(req.body);
  if (!isValidId(bookingId)) return res.status(400).json({ error: "Invalid bookingId" });
  if (!parsed.success) return validationError(res, parsed.error);
  const db = getDb();
  const [provider] = await db
    .select()
    .from(habitatProviders)
    .where(and(eq(habitatProviders._id, parsed.data.providerId), eq(habitatProviders.status, "APPROVED")))
    .limit(1);
  if (!provider) return res.status(404).json({ error: "Approved provider not found" });
  const [booking] = await db.select().from(habitatBookings).where(eq(habitatBookings._id, bookingId)).limit(1);
  if (!booking) return res.status(404).json({ error: "Booking not found" });
  const [service] = await db.select().from(habitatServices).where(eq(habitatServices._id, booking.serviceId)).limit(1);
  if (!service || !provider.categoryIds.includes(service.categoryId)) {
    return res.status(400).json({ error: "Provider is not approved for this service category" });
  }
  if (!isHabitatAreaCovered(
    provider.serviceAreas,
    booking.serviceAddress.city,
    booking.serviceAddress.locality,
  )) {
    return res.status(400).json({ error: "Provider does not cover the booking's service area" });
  }
  if (booking.status !== "REQUESTED" && booking.status !== "REJECTED") {
    return res.status(409).json({ error: "Only unassigned or rejected bookings can be assigned" });
  }

  const assigned = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(habitatBookings)
      .set({ providerId: provider._id, status: "PROVIDER_ASSIGNED", updatedAt: new Date() })
      .where(and(
        eq(habitatBookings._id, bookingId),
        eq(habitatBookings.status, booking.status),
      ))
      .returning();
    if (!updated) return null;
    await tx.insert(habitatBookingStatusHistory).values({
      bookingId,
      actorUserId: req.user!.userId,
      fromStatus: booking.status,
      toStatus: "PROVIDER_ASSIGNED",
      reason: "Administrator assigned an approved provider",
    });
    return updated;
  });
  if (!assigned) return res.status(409).json({ error: "Booking changed; refresh and try again" });
  res.json({ booking: assigned });
});

router.patch("/admin/bookings/:bookingId/status", authenticate, requireRole("ADMIN"), async (req: AuthedRequest, res) => {
  const { bookingId } = req.params;
  if (!isValidId(bookingId)) return res.status(400).json({ error: "Invalid bookingId" });
  const parsed = z.object({
    status: z.literal("CANCELLED"),
    reason: z.string().trim().min(3).max(1000),
  }).safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error);
  return res.status(409).json({ error: "Use the Habitat finance cancellation workflow so any captured payment can be refunded" });
});

router.get("/admin/services", authenticate, requireRole("ADMIN"), async (_req, res) => {
  const services = await getDb()
    .select({ service: habitatServices, categoryName: habitatServiceCategories.name })
    .from(habitatServices)
    .innerJoin(habitatServiceCategories, eq(habitatServices.categoryId, habitatServiceCategories._id))
    .orderBy(desc(habitatServices.createdAt))
    .limit(100);
  res.json({ services: services.map(({ service, categoryName }) => ({ ...service, categoryName })) });
});

router.post("/admin/services", authenticate, requireRole("ADMIN"), async (req: AuthedRequest, res) => {
  const parsed = createServiceSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error);
  const db = getDb();
  const [category] = await db
    .select()
    .from(habitatServiceCategories)
    .where(and(eq(habitatServiceCategories._id, parsed.data.categoryId), eq(habitatServiceCategories.active, true)))
    .limit(1);
  if (!category) return res.status(404).json({ error: "Active service category not found" });
  let pricePaise: number | null;
  try {
    pricePaise = habitatEstimatePaise(parsed.data.pricingModel, parsed.data.pricePaise);
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : "Invalid price" });
  }
  const [service] = await db
    .insert(habitatServices)
    .values({
      ...parsed.data,
      pricePaise,
      createdById: req.user!.userId,
    })
    .returning();
  res.status(201).json({ service });
});

router.patch("/admin/services/:serviceId", authenticate, requireRole("ADMIN"), async (req, res) => {
  const { serviceId } = req.params;
  if (!isValidId(serviceId)) return res.status(400).json({ error: "Invalid serviceId" });
  const parsed = z.object({ active: z.boolean() }).safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error);
  const [service] = await getDb()
    .update(habitatServices)
    .set({ active: parsed.data.active, updatedAt: new Date() })
    .where(eq(habitatServices._id, serviceId))
    .returning();
  if (!service) return res.status(404).json({ error: "Service not found" });
  res.json({ service });
});

router.post("/admin/categories", authenticate, requireRole("ADMIN"), async (req, res) => {
  const parsed = z.object({
    name: z.string().trim().min(2).max(80),
    description: z.string().trim().max(500).optional(),
    icon: z.string().trim().max(60).optional(),
    sortOrder: z.number().int().min(0).max(1000).default(100),
  }).safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error);
  const slug = parsed.data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const [category] = await getDb()
    .insert(habitatServiceCategories)
    .values({ ...parsed.data, slug })
    .onConflictDoNothing({ target: habitatServiceCategories.slug })
    .returning();
  if (!category) return res.status(409).json({ error: "A category with this name already exists" });
  res.status(201).json({ category });
});

router.patch("/admin/categories/:categoryId", authenticate, requireRole("ADMIN"), async (req, res) => {
  const { categoryId } = req.params;
  if (!isValidId(categoryId)) return res.status(400).json({ error: "Invalid categoryId" });
  const parsed = z.object({ active: z.boolean() }).safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error);
  const [category] = await getDb()
    .update(habitatServiceCategories)
    .set({ active: parsed.data.active, updatedAt: new Date() })
    .where(eq(habitatServiceCategories._id, categoryId))
    .returning();
  if (!category) return res.status(404).json({ error: "Service category not found" });
  res.json({ category });
});

router.post("/admin/invitations", authenticate, requireRole("ADMIN"), async (req: AuthedRequest, res) => {
  const parsed = z.object({
    projectId: z.string().uuid(),
    campaign: z.string().trim().max(120).optional(),
    expiresAt: z.string().datetime().optional(),
  }).safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error);
  const expiresAt = parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null;
  if (expiresAt && expiresAt <= new Date()) return res.status(400).json({ error: "Invitation expiry must be in the future" });
  const [project] = await getDb()
    .select({ id: projects._id })
    .from(projects)
    .where(and(
      eq(projects._id, parsed.data.projectId),
      eq(projects.approvalStatus, "APPROVED"),
      eq(projects.habitatEnabled, true),
    ))
    .limit(1);
  if (!project) return res.status(404).json({ error: "Approved project not found" });
  const [invitation] = await getDb()
    .insert(habitatInvitations)
    .values({
      code: randomBytes(18).toString("base64url"),
      projectId: project.id,
      campaign: parsed.data.campaign || null,
      createdById: req.user!.userId,
      expiresAt,
    })
    .returning();
  res.status(201).json({ invitation });
});

router.get("/admin/invitations", authenticate, requireRole("ADMIN"), async (_req, res) => {
  const invitations = await getDb()
    .select({
      invitation: habitatInvitations,
      projectName: projects.name,
      city: projects.city,
    })
    .from(habitatInvitations)
    .innerJoin(projects, eq(habitatInvitations.projectId, projects._id))
    .orderBy(desc(habitatInvitations.createdAt))
    .limit(100);
  const ids = invitations.map(({ invitation }) => invitation._id);
  const membershipCounts = ids.length
    ? await getDb()
        .select({ invitationId: habitatMemberships.invitationId, total: sql<number>`count(*)::int` })
        .from(habitatMemberships)
        .where(inArray(habitatMemberships.invitationId, ids))
        .groupBy(habitatMemberships.invitationId)
    : [];
  const counts = new Map(membershipCounts.map(({ invitationId, total }) => [invitationId, total]));
  res.json({
    invitations: invitations.map(({ invitation, projectName, city }) => ({
      ...invitation,
      projectName,
      city,
      registrations: counts.get(invitation._id) ?? 0,
      revoked: Boolean(invitation.revokedAt),
    })),
  });
});

router.patch("/admin/invitations/:invitationId/revoke", authenticate, requireRole("ADMIN"), async (req, res) => {
  const { invitationId } = req.params;
  if (!isValidId(invitationId)) return res.status(400).json({ error: "Invalid invitationId" });
  const [invitation] = await getDb()
    .update(habitatInvitations)
    .set({ revokedAt: new Date() })
    .where(and(eq(habitatInvitations._id, invitationId), isNull(habitatInvitations.revokedAt)))
    .returning();
  if (!invitation) return res.status(404).json({ error: "Active invitation not found" });
  res.json({ invitation });
});

router.get("/bookings/:bookingId/history", authenticate, async (req: AuthedRequest, res) => {
  const { bookingId } = req.params;
  if (!isValidId(bookingId)) return res.status(400).json({ error: "Invalid bookingId" });
  const [booking] = await getDb().select().from(habitatBookings).where(eq(habitatBookings._id, bookingId)).limit(1);
  if (!booking) return res.status(404).json({ error: "Booking not found" });
  if (req.user!.role !== "ADMIN") {
    const ownsBooking = booking.buyerId === req.user!.userId;
    const provider = await getApprovedProviderForUser(req.user!.userId);
    const isAssignedProvider = provider?._id === booking.providerId;
    if (!ownsBooking && !isAssignedProvider) return res.status(404).json({ error: "Booking not found" });
  }
  const history = await getDb()
    .select({
      fromStatus: habitatBookingStatusHistory.fromStatus,
      toStatus: habitatBookingStatusHistory.toStatus,
      reason: habitatBookingStatusHistory.reason,
      createdAt: habitatBookingStatusHistory.createdAt,
    })
    .from(habitatBookingStatusHistory)
    .where(eq(habitatBookingStatusHistory.bookingId, bookingId))
    .orderBy(habitatBookingStatusHistory.createdAt);
  res.json({ history });
});

export default router;
