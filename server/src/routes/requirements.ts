import { Router } from "express";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../config/db";
import {
  propertyRequirementMatches,
  propertyRequirements,
  projects,
} from "../db/schema";
import { zodMessage } from "../lib/validationError";
import { isValidId } from "../lib/ids";
import { authenticate, requireRole, type AuthedRequest } from "../middleware/auth";
import { withoutPrivateProjectFields } from "../lib/projectPrivacy";
import { matchRequirementAgainstAvailableProjects } from "../services/propertyRequirementMatching";

const router = Router();
router.use(authenticate);
router.use(requireRole("ADMIN", "DEVELOPER", "CP", "BUYER", "AMBASSADOR"));

const propertyTypes = ["ANY", "PLOTTED", "APARTMENT", "VILLA", "COMMERCIAL", "INDUSTRIAL", "LAND", "MIXED"] as const;
const timelines = ["IMMEDIATE", "WITHIN_30_DAYS", "WITHIN_3_MONTHS", "WITHIN_6_MONTHS", "FLEXIBLE"] as const;
const purposes = ["INVESTMENT", "SELF_USE", "BUSINESS", "OTHER"] as const;

const fields = {
  title: z.string().trim().max(120).optional().or(z.literal("")),
  propertyType: z.enum(propertyTypes),
  city: z.string().trim().min(2).max(100),
  location: z.string().trim().min(2).max(160),
  minBudget: z.number().finite().min(0).nullable().optional(),
  maxBudget: z.number().finite().positive(),
  minAreaSqft: z.number().finite().positive().nullable().optional(),
  maxAreaSqft: z.number().finite().positive().nullable().optional(),
  purpose: z.enum(purposes).nullable().optional(),
  timeline: z.enum(timelines),
  details: z.string().trim().max(1200).nullable().optional(),
};
const createRequirementSchema = z.object(fields);
const updateRequirementSchema = z.object({
  title: z.string().trim().max(120).optional().or(z.literal("")),
  propertyType: z.enum(propertyTypes).optional(),
  city: z.string().trim().min(2).max(100).optional(),
  location: z.string().trim().min(2).max(160).optional(),
  minBudget: z.number().finite().min(0).nullable().optional(),
  maxBudget: z.number().finite().positive().optional(),
  minAreaSqft: z.number().finite().positive().nullable().optional(),
  maxAreaSqft: z.number().finite().positive().nullable().optional(),
  purpose: z.enum(purposes).nullable().optional(),
  timeline: z.enum(timelines).optional(),
  details: z.string().trim().max(1200).nullable().optional(),
  status: z.enum(["ACTIVE", "CLOSED"]).optional(),
});

function validateBounds(values: {
  minBudget?: number | null;
  maxBudget?: number | null;
  minAreaSqft?: number | null;
  maxAreaSqft?: number | null;
}): string | null {
  if (values.minBudget != null && values.maxBudget != null && values.minBudget > values.maxBudget) {
    return "Minimum budget cannot exceed maximum budget.";
  }
  if (values.minAreaSqft != null && values.maxAreaSqft != null && values.minAreaSqft > values.maxAreaSqft) {
    return "Minimum property size cannot exceed maximum property size.";
  }
  return null;
}

function displayType(value: string): string {
  return value === "ANY" ? "Property" : value.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
}

/**
 * GET /api/requirements/mine
 * Only the signed-in submitter's records are returned, including their private notes.
 */
router.get("/mine", async (req: AuthedRequest, res) => {
  const rows = await getDb()
    .select()
    .from(propertyRequirements)
    .where(eq(propertyRequirements.submittedById, req.user!.userId))
    .orderBy(desc(propertyRequirements.createdAt))
    .limit(100);
  res.json({ requirements: rows });
});

/**
 * GET /api/requirements/board
 * A privacy-safe board summary. Never return submitter IDs, contact details, or private notes.
 */
router.get("/board", async (_req: AuthedRequest, res) => {
  const rows = await getDb()
    .select({
      _id: propertyRequirements._id,
      title: propertyRequirements.title,
      propertyType: propertyRequirements.propertyType,
      city: propertyRequirements.city,
      location: propertyRequirements.location,
      minBudget: propertyRequirements.minBudget,
      maxBudget: propertyRequirements.maxBudget,
      minAreaSqft: propertyRequirements.minAreaSqft,
      maxAreaSqft: propertyRequirements.maxAreaSqft,
      purpose: propertyRequirements.purpose,
      timeline: propertyRequirements.timeline,
      submittedByRole: propertyRequirements.submittedByRole,
      status: propertyRequirements.status,
      createdAt: propertyRequirements.createdAt,
    })
    .from(propertyRequirements)
    .where(eq(propertyRequirements.status, "ACTIVE"))
    .orderBy(desc(propertyRequirements.createdAt))
    .limit(100);
  res.json({ requirements: rows });
});

/** GET /api/requirements/matches — live, published projects matched to this user's active requirements. */
router.get("/matches", async (req: AuthedRequest, res) => {
  const userId = req.user!.userId;
  const rows = await getDb()
    .select({
      match: propertyRequirementMatches,
      requirementTitle: propertyRequirements.title,
      project: projects,
    })
    .from(propertyRequirementMatches)
    .innerJoin(
      propertyRequirements,
      and(
        eq(propertyRequirementMatches.requirementId, propertyRequirements._id),
        eq(propertyRequirements.submittedById, userId),
        eq(propertyRequirements.status, "ACTIVE"),
      ),
    )
    .innerJoin(
      projects,
      and(
        eq(propertyRequirementMatches.projectId, projects._id),
        eq(projects.approvalStatus, "APPROVED"),
        eq(projects.availabilityStatus, "AVAILABLE"),
      ),
    )
    .orderBy(desc(propertyRequirementMatches.createdAt))
    .limit(100);

  res.json({
    matches: rows.map((row) => ({
      match: row.match,
      requirementTitle: row.requirementTitle,
      project: withoutPrivateProjectFields(
        row.project,
        { userId, role: req.user!.role },
        String(row.project.developerId),
      ),
    })),
  });
});

/** POST /api/requirements — submit an unmet requirement even when no project is currently listed. */
router.post("/", async (req: AuthedRequest, res) => {
  const parsed = createRequirementSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: zodMessage(parsed.error), issues: parsed.error.flatten() });
  }
  const invalidBounds = validateBounds(parsed.data);
  if (invalidBounds) return res.status(400).json({ error: invalidBounds });

  const data = parsed.data;
  const title = data.title?.trim() || `${displayType(data.propertyType)} requirement in ${data.city.trim()}`;
  const [requirement] = await getDb()
    .insert(propertyRequirements)
    .values({
      submittedById: req.user!.userId,
      // Derive the role from the authenticated session; never trust client input.
      submittedByRole: req.user!.role,
      title,
      propertyType: data.propertyType,
      city: data.city.trim(),
      location: data.location.trim(),
      minBudget: data.minBudget ?? null,
      maxBudget: data.maxBudget,
      minAreaSqft: data.minAreaSqft ?? null,
      maxAreaSqft: data.maxAreaSqft ?? null,
      purpose: data.purpose ?? null,
      timeline: data.timeline,
      details: data.details?.trim() || null,
      status: "ACTIVE",
    })
    .returning();

  // Matching is deliberately isolated from the HTTP success path: a delayed email
  // provider must not cause a submitted requirement to fail.
  void matchRequirementAgainstAvailableProjects(String(requirement._id)).catch((error) => {
    console.warn("[property-matching] new requirement matching failed:", error instanceof Error ? error.message : "unknown error");
  });

  res.status(201).json({ requirement });
});

/** PATCH /api/requirements/:id — only the owner or an administrator can update/close a requirement. */
router.patch("/:id", async (req: AuthedRequest, res) => {
  if (!isValidId(req.params.id)) return res.status(404).json({ error: "Requirement not found" });
  const parsed = updateRequirementSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: zodMessage(parsed.error), issues: parsed.error.flatten() });
  }

  const db = getDb();
  const [existing] = await db
    .select()
    .from(propertyRequirements)
    .where(eq(propertyRequirements._id, req.params.id))
    .limit(1);
  if (!existing) return res.status(404).json({ error: "Requirement not found" });
  if (req.user!.role !== "ADMIN" && String(existing.submittedById) !== req.user!.userId) {
    return res.status(403).json({ error: "You can only update your own requirements." });
  }

  const combined = { ...existing, ...parsed.data };
  const invalidBounds = validateBounds(combined);
  if (invalidBounds) return res.status(400).json({ error: invalidBounds });

  const data = parsed.data;
  const update: Record<string, unknown> = { updatedAt: new Date() };
  if (data.title !== undefined) update.title = data.title.trim() || `${displayType(String(combined.propertyType))} requirement in ${String(combined.city)}`;
  if (data.propertyType !== undefined) update.propertyType = data.propertyType;
  if (data.city !== undefined) update.city = data.city.trim();
  if (data.location !== undefined) update.location = data.location.trim();
  if (data.minBudget !== undefined) update.minBudget = data.minBudget;
  if (data.maxBudget !== undefined) update.maxBudget = data.maxBudget;
  if (data.minAreaSqft !== undefined) update.minAreaSqft = data.minAreaSqft;
  if (data.maxAreaSqft !== undefined) update.maxAreaSqft = data.maxAreaSqft;
  if (data.purpose !== undefined) update.purpose = data.purpose;
  if (data.timeline !== undefined) update.timeline = data.timeline;
  if (data.details !== undefined) update.details = data.details?.trim() || null;
  if (data.status !== undefined) update.status = data.status;

  const [requirement] = await db
    .update(propertyRequirements)
    .set(update)
    .where(eq(propertyRequirements._id, existing._id))
    .returning();

  if (requirement.status === "ACTIVE") {
    void matchRequirementAgainstAvailableProjects(String(requirement._id)).catch((error) => {
      console.warn("[property-matching] requirement update matching failed:", error instanceof Error ? error.message : "unknown error");
    });
  }
  res.json({ requirement });
});

export default router;
