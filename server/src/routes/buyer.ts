import { Router } from "express";
import { z } from "zod";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "../config/db";
import { users, projects, units, BuyerProfile, IUser, IProject } from "../db/schema";
import { isValidId } from "../lib/ids";
import { authenticate, requireRole, AuthedRequest } from "../middleware/auth";

const router = Router();
router.use(authenticate);

const saveProjectSchema = z.object({ projectId: z.string().min(1) });

// Replicates the old `.populate("developerId", "name developerProfile")` shape:
// the `developerId` key becomes a nested `{ _id, name, developerProfile }` object.
function withDeveloper(row: { project: IProject; developer: IUser | null }) {
  return {
    ...row.project,
    developerId: row.developer
      ? {
          _id: row.developer._id,
          name: row.developer.name,
          developerProfile: row.developer.developerProfile,
        }
      : null,
  };
}

function emptyBuyerProfile(): BuyerProfile {
  return { savedProjectIds: [], compareProjectIds: [], loanEligibilityNotes: "", investmentGoals: "" };
}

router.get("/dashboard", requireRole("BUYER"), async (req: AuthedRequest, res) => {
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users._id, req.user!.userId));
  if (!user) return res.status(404).json({ error: "User not found" });

  const savedProjects = (user.buyerProfile?.savedProjectIds || []).filter(isValidId);

  let saved: object[] = [];
  if (savedProjects.length > 0) {
    const rows = await db
      .select({ project: projects, developer: users })
      .from(projects)
      .leftJoin(users, eq(projects.developerId, users._id))
      .where(and(inArray(projects._id, savedProjects), eq(projects.approvalStatus, "APPROVED")));
    saved = rows.map(withDeveloper);
  }

  res.json({ savedProjects: saved });
});

router.post("/save", requireRole("BUYER"), async (req: AuthedRequest, res) => {
  const parsed = saveProjectSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });

  if (!isValidId(parsed.data.projectId)) {
    return res.status(400).json({ error: "Invalid projectId" });
  }

  const db = getDb();
  const [project] = await db.select().from(projects).where(eq(projects._id, parsed.data.projectId));
  if (!project || project.approvalStatus !== "APPROVED") {
    return res.status(404).json({ error: "Project not found or not available" });
  }

  const [user] = await db.select().from(users).where(eq(users._id, req.user!.userId));
  if (!user) return res.status(404).json({ error: "User not found" });

  const profile: BuyerProfile = user.buyerProfile || emptyBuyerProfile();
  const savedProjectIds = profile.savedProjectIds || [];
  if (!savedProjectIds.some((id) => String(id) === parsed.data.projectId)) {
    savedProjectIds.push(parsed.data.projectId);
  }
  const newProfile: BuyerProfile = { ...profile, savedProjectIds };
  await db.update(users).set({ buyerProfile: newProfile }).where(eq(users._id, user._id));

  res.json({ savedProjectIds: newProfile.savedProjectIds });
});

router.delete("/save/:projectId", requireRole("BUYER"), async (req: AuthedRequest, res) => {
  const { projectId } = req.params;
  if (!isValidId(projectId)) {
    return res.status(400).json({ error: "Invalid projectId" });
  }

  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users._id, req.user!.userId));
  if (!user) return res.status(404).json({ error: "User not found" });

  const profile: BuyerProfile = user.buyerProfile || emptyBuyerProfile();
  const savedProjectIds = (profile.savedProjectIds || []).filter((id) => String(id) !== projectId);
  const newProfile: BuyerProfile = { ...profile, savedProjectIds };
  await db.update(users).set({ buyerProfile: newProfile }).where(eq(users._id, user._id));

  res.json({ savedProjectIds: newProfile.savedProjectIds });
});

// Returns the requested projects (by comma-separated IDs) enriched with their units,
// for the side-by-side comparison table. Max 4 IDs; only APPROVED projects are returned.
router.get("/compare", requireRole("BUYER"), async (req: AuthedRequest, res) => {
  const idsParam = (req.query.ids as string) || "";
  const ids = idsParam
    .split(",")
    .map((s) => s.trim())
    .filter((s) => isValidId(s))
    .slice(0, 4);

  if (ids.length < 2) {
    return res.status(400).json({ error: "Provide at least 2 valid project IDs" });
  }

  const db = getDb();
  const rows = await db
    .select({ project: projects, developer: users })
    .from(projects)
    .leftJoin(users, eq(projects.developerId, users._id))
    .where(and(inArray(projects._id, ids), eq(projects.approvalStatus, "APPROVED")));

  const projectList = rows.map(withDeveloper);

  const projectIds = projectList.map((p) => p._id);
  const allUnits =
    projectIds.length > 0
      ? await db.select().from(units).where(inArray(units.projectId, projectIds))
      : [];

  const result = projectList.map((p) => ({
    ...p,
    units: allUnits.filter((u) => String(u.projectId) === String(p._id)),
  }));

  res.json({ projects: result });
});

// Returns all APPROVED projects with an `isSaved` flag for the heart icon state
router.get("/projects", requireRole("BUYER"), async (req: AuthedRequest, res) => {
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users._id, req.user!.userId));
  if (!user) return res.status(404).json({ error: "User not found" });

  const savedSet = new Set(
    (user.buyerProfile?.savedProjectIds || []).map((id) => String(id))
  );

  const rows = await db
    .select({ project: projects, developer: users })
    .from(projects)
    .leftJoin(users, eq(projects.developerId, users._id))
    .where(eq(projects.approvalStatus, "APPROVED"))
    .orderBy(desc(projects.listingTier), desc(projects.createdAt));

  const result = rows.map(withDeveloper).map((p) => ({
    ...p,
    isSaved: savedSet.has(String(p._id)),
  }));

  res.json({ projects: result });
});

router.post("/compare", requireRole("BUYER"), async (req: AuthedRequest, res) => {
  const parsed = saveProjectSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });

  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users._id, req.user!.userId));
  if (!user) return res.status(404).json({ error: "User not found" });

  const profile: BuyerProfile = user.buyerProfile || emptyBuyerProfile();
  const compareProjectIds = profile.compareProjectIds || [];
  if (!compareProjectIds.some((id) => String(id) === parsed.data.projectId)) {
    compareProjectIds.push(parsed.data.projectId);
  }
  const newProfile: BuyerProfile = { ...profile, compareProjectIds };
  await db.update(users).set({ buyerProfile: newProfile }).where(eq(users._id, user._id));

  res.json({ compareProjectIds: newProfile.compareProjectIds });
});

router.post("/loan-eligibility", requireRole("BUYER"), async (req: AuthedRequest, res) => {
  const parsed = z.object({ notes: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });

  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users._id, req.user!.userId));
  if (!user) return res.status(404).json({ error: "User not found" });

  const profile: BuyerProfile = user.buyerProfile || emptyBuyerProfile();
  const newProfile: BuyerProfile = { ...profile, loanEligibilityNotes: parsed.data.notes };
  await db.update(users).set({ buyerProfile: newProfile }).where(eq(users._id, user._id));

  res.json({ loanEligibilityNotes: newProfile.loanEligibilityNotes });
});

router.post("/investment-goals", requireRole("BUYER"), async (req: AuthedRequest, res) => {
  const parsed = z.object({ goals: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });

  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users._id, req.user!.userId));
  if (!user) return res.status(404).json({ error: "User not found" });

  const profile: BuyerProfile = user.buyerProfile || emptyBuyerProfile();
  const newProfile: BuyerProfile = { ...profile, investmentGoals: parsed.data.goals };
  await db.update(users).set({ buyerProfile: newProfile }).where(eq(users._id, user._id));

  res.json({ investmentGoals: newProfile.investmentGoals });
});

export default router;
