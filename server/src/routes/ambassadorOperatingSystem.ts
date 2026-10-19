import { NextFunction, Response, Router } from "express";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../config/db";
import {
  ambassadorOsCampaigns,
  ambassadorOsCampaignGuidelines,
  ambassadorOsCampaignAcknowledgements,
  ambassadorOsStaffAssignments,
  ambassadorOsMarketingMaterials,
  ambassadorOsCareerApplications,
  ambassadorOsCareerAssessments,
  ambassadorOsCareerOpportunities,
  ambassadorOsChannelCosts,
  ambassadorOsFollowUps,
  ambassadorOsIncentivePolicies,
  ambassadorOsIncentives,
  ambassadorOsPerformanceReviews,
  ambassadorOsProfiles,
  ambassadorOsScorecardPolicies,
  ambassadorOsPropertyBookingHistory,
  ambassadorOsPropertyBookings,
  ambassadorOsTasks,
  ambassadorOsTrainingModules,
  ambassadorOsTrainingProgress,
  leadActivities,
  leads,
  projects,
  siteVisits,
  units,
  users,
} from "../db/schema";
import { authenticate, requireRole, AuthedRequest } from "../middleware/auth";
import { logAudit } from "../services/audit";
import { createNotifications, type NotificationInput } from "../services/notificationService";
import {
  canActivateAmbassador,
  calculateIncentiveAmount,
  canTransitionIncentiveStatus,
  computeAmbassadorQualityScore,
  areValidScorecardWeights,
  calculateWeightedPerformanceScore,
  DEFAULT_AMBASSADOR_SCORECARD_WEIGHTS,
  isEligibleAmbassadorSale,
  isTrainingDayComplete,
  hasCompleteSevenDayCurriculum,
  statusAfterTrainingReview,
} from "../services/ambassadorOperatingSystem.rules";

const router = Router();
router.use(authenticate);

const OS_STAFF_ROLES = ["PROGRAM_MANAGER", "SALES_COORDINATOR", "TRAINING_COORDINATOR"] as const;
type OsStaffRole = (typeof OS_STAFF_ROLES)[number];

async function getOsStaffRoles(userId: string): Promise<OsStaffRole[]> {
  const assignments = await getDb().select({ osRole: ambassadorOsStaffAssignments.osRole })
    .from(ambassadorOsStaffAssignments)
    .where(and(eq(ambassadorOsStaffAssignments.userId, userId), eq(ambassadorOsStaffAssignments.active, true)));
  return assignments.map((row) => row.osRole).filter((role): role is OsStaffRole => (OS_STAFF_ROLES as readonly string[]).includes(role));
}

async function hasOsStaffRole(userId: string, role: OsStaffRole): Promise<boolean> {
  const [assignment] = await getDb().select({ _id: ambassadorOsStaffAssignments._id })
    .from(ambassadorOsStaffAssignments)
    .where(and(eq(ambassadorOsStaffAssignments.userId, userId), eq(ambassadorOsStaffAssignments.osRole, role), eq(ambassadorOsStaffAssignments.active, true)))
    .limit(1);
  return Boolean(assignment);
}

function requireOsStaffRole(...allowedRoles: OsStaffRole[]) {
  return async (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: "Not authenticated" });
    if (req.user.role === "ADMIN") return next();
    try {
      const active = await getOsStaffRoles(req.user.userId);
      if (active.some((role) => allowedRoles.includes(role))) return next();
      return res.status(403).json({ error: "You do not have an active Ambassador OS staff assignment for this workflow." });
    } catch (error) { return next(error); }
  };
}

function taskCategoryRoles(category: string): OsStaffRole[] {
  if (category === "TRAINING") return ["TRAINING_COORDINATOR", "PROGRAM_MANAGER"];
  if (["SALES", "LEAD_MANAGEMENT", "SITE_VISIT"].includes(category)) return ["SALES_COORDINATOR", "PROGRAM_MANAGER"];
  return ["PROGRAM_MANAGER", "TRAINING_COORDINATOR"];
}

async function canReviewTaskCategory(userId: string, category: string): Promise<boolean> {
  const roles = await getOsStaffRoles(userId);
  return taskCategoryRoles(category).some((role) => roles.includes(role));
}


type ScorecardWeightSet = {
  genuineLeadQuality: number;
  customerCommunication: number;
  siteVisitContribution: number;
  verifiedSalesContribution: number;
  crmDiscipline: number;
  trainingSkillDevelopment: number;
  ethicsCompliance: number;
};

function publicScorecardWeights(policy: typeof ambassadorOsScorecardPolicies.$inferSelect): ScorecardWeightSet {
  return {
    genuineLeadQuality: policy.genuineLeadQualityWeight,
    customerCommunication: policy.customerCommunicationWeight,
    siteVisitContribution: policy.siteVisitContributionWeight,
    verifiedSalesContribution: policy.verifiedSalesContributionWeight,
    crmDiscipline: policy.crmDisciplineWeight,
    trainingSkillDevelopment: policy.trainingSkillDevelopmentWeight,
    ethicsCompliance: policy.ethicsComplianceWeight,
  };
}

async function getActiveScorecardPolicy(createdById: string) {
  const db = getDb();
  const [active] = await db.select().from(ambassadorOsScorecardPolicies)
    .where(eq(ambassadorOsScorecardPolicies.active, true))
    .orderBy(desc(ambassadorOsScorecardPolicies.version)).limit(1);
  if (active) return active;
  const [created] = await db.insert(ambassadorOsScorecardPolicies).values({
    version: 1,
    genuineLeadQualityWeight: DEFAULT_AMBASSADOR_SCORECARD_WEIGHTS.genuineLeadQuality,
    customerCommunicationWeight: DEFAULT_AMBASSADOR_SCORECARD_WEIGHTS.customerCommunication,
    siteVisitContributionWeight: DEFAULT_AMBASSADOR_SCORECARD_WEIGHTS.siteVisitContribution,
    verifiedSalesContributionWeight: DEFAULT_AMBASSADOR_SCORECARD_WEIGHTS.verifiedSalesContribution,
    crmDisciplineWeight: DEFAULT_AMBASSADOR_SCORECARD_WEIGHTS.crmDiscipline,
    trainingSkillDevelopmentWeight: DEFAULT_AMBASSADOR_SCORECARD_WEIGHTS.trainingSkillDevelopment,
    ethicsComplianceWeight: DEFAULT_AMBASSADOR_SCORECARD_WEIGHTS.ethicsCompliance,
    active: true,
    approvalReference: "TRUVI_AMBASSADOR_OS_PDF_V1",
    createdById,
  }).returning();
  return created;
}

async function notifySafely(userIds: string[], input: NotificationInput) {
  try {
    await createNotifications(userIds, input);
  } catch (error) {
    // Notification failure must not undo or mask a successful business operation.
    console.error("Ambassador OS notification failed:", error instanceof Error ? error.message : "unknown error");
  }
}

type Question = { prompt: string; options: string[]; answer: number };
type TrainingModule = {
  day: number; title: string; summary: string; lesson: string;
  keyPoints: string[]; assignment: string; questions: Question[];
  videoUrl?: string | null; version?: number;
};

// Quiz answer keys stay on the server. Each quiz is five questions x 20 points;
// passing requires at least 80/100, as specified in the pilot blueprint.
const MODULES: TrainingModule[] = [
  {
    day: 1, title: "Truvi & Entrepreneurship", summary: "Brand, trust and the Ambassador role",
    lesson: "Truvi helps people make more informed property decisions. An Ambassador builds trust by sharing approved information, listening to buyer needs and connecting interested people with the authorized sales team.",
    keyPoints: ["Use approved Truvi material only.", "Be clear that you are an Ambassador, not a property lawyer.", "Never promise guaranteed returns or unapproved discounts.", "Protect customer information and respect consent."],
    assignment: "Write a short introduction explaining Truvi and your role without making unsupported property or return claims.",
    questions: [
      {prompt:"What is the Ambassador's primary responsibility?",options:["Guarantee appreciation","Share approved information and connect interested buyers to Truvi","Approve legal documents","Change official property prices"],answer:1},
      {prompt:"Which claim may an Ambassador make?",options:["Guaranteed 3x returns","Legal title is clear without checking","Only claims supported by current approved material","Every buyer will get a discount"],answer:2},
      {prompt:"A buyer asks a legal question you cannot verify. What should you do?",options:["Guess confidently","Use approved information and refer the question to an authorized team member","Promise that there is no risk","Ignore the buyer"],answer:1},
      {prompt:"How should customer information be handled?",options:["Post it in a public group","Share it with friends","Collect and share only what is needed with appropriate consent","Keep it in an unsecured public spreadsheet"],answer:2},
      {prompt:"What best builds long-term trust?",options:["Pressure every contact to book","Honest communication and accurate follow-up","Overstate urgency","Hide uncertainty"],answer:1},
    ],
  },
  {
    day: 2, title: "Real Estate Fundamentals", summary: "Basic property and transaction knowledge",
    lesson: "Understand the difference between a project, unit, plot area, price, booking and registration. Use official project documents and the current approved price list rather than assumptions.",
    keyPoints: ["An enquiry is not a booking.", "Booking and registration are separate milestones.", "Use the latest approved inventory and price information.", "Refer legal and financial advice to qualified professionals."],
    assignment: "Explain the difference between an enquiry, site visit, booking and registration in your own words.",
    questions: [
      {prompt:"What does a property inventory record represent?",options:["A verified set of listed units or plots and their current state","A guaranteed investment return","A customer phone list","An unofficial price estimate"],answer:0},
      {prompt:"Is an enquiry the same as a verified sale?",options:["Always","Only when a student says so","No; it must move through the authorized sales and verification process","Yes, if a site visit is requested"],answer:2},
      {prompt:"Which source should determine a quoted price?",options:["An old social post","A friend's message","The current approved price list","A guess based on nearby prices"],answer:2},
      {prompt:"Who should answer complex legal questions?",options:["Any student ambassador","An authorized, qualified professional or designated Truvi reviewer","A random social media user","No one"],answer:1},
      {prompt:"Why must booking and registration be separate statuses?",options:["To confuse the dashboard","They represent different business milestones and evidence","To count one customer twice","They are identical"],answer:1},
    ],
  },
  {
    day: 3, title: "Paradise Town Mastery", summary: "Campaign facts and responsible presentation",
    lesson: "The pilot blueprint names Paradise Town on Sultanpur Road, Lucknow, with a target of 114 units, 1,250 sq ft per unit and a 60-day campaign. These are planning inputs, not proof of current availability, price or legal approval. Publish only after the authorized Truvi team verifies current documents.",
    keyPoints: ["Treat campaign targets as internal planning settings.", "Never claim a unit is available without checking current inventory.", "Do not claim legal approval without official evidence.", "Record buyer requirements accurately and avoid investment guarantees."],
    assignment: "Create a buyer FAQ using only facts confirmed in the admin-approved campaign material. Mark any unverified item as 'confirm with Truvi'.",
    questions: [
      {prompt:"The pilot blueprint's target inventory is:",options:["14 units","114 units","1,140 units","1,250 units"],answer:1},
      {prompt:"The blueprint's target area per unit is:",options:["125 sq ft","1,000 sq ft","1,250 sq ft","12,500 sq ft"],answer:2},
      {prompt:"Can the planned 114 units be described as currently available without checking inventory?",options:["Yes, always","Only on social media","No, availability must be checked in current approved inventory","Yes, if the buyer is interested"],answer:2},
      {prompt:"A buyer asks whether all approvals are complete. What is correct?",options:["Say yes to keep the lead","Verify official approved documents or refer the question to Truvi","Rely on a rumour","Avoid recording the question"],answer:1},
      {prompt:"What does the 60-day campaign duration represent?",options:["A guaranteed sale date for all units","A planning target, not a guarantee","A legal approval","A promised return period"],answer:1},
    ],
  },
  {
    day: 4, title: "Sales & Communication", summary: "Discovery, qualification and ethical follow-up",
    lesson: "Ask open questions about the buyer's purpose, budget range, preferred size and timeline. Confirm permission before passing contact information to the sales team, then record a useful next step.",
    keyPoints: ["Listen before pitching.", "Ask rather than assume.", "Record objections and next steps neutrally.", "Do not pressure or mislead prospects."],
    assignment: "Write a sample first-contact script with an introduction, two discovery questions, a consent request and a clear next step.",
    questions: [
      {prompt:"What is a strong first step in a buyer conversation?",options:["Start with pressure to book","Understand the buyer's needs and preferences","Promise a return","Collect sensitive documents immediately"],answer:1},
      {prompt:"How should an Ambassador respond to an objection?",options:["Argue until the buyer agrees","Listen, clarify the concern and provide verified information","Hide relevant information","Mark the buyer as booked"],answer:1},
      {prompt:"Before sharing contact details with sales, the Ambassador should:",options:["Assume consent","Get appropriate consent and record it","Post the details publicly","Ask another student to decide"],answer:1},
      {prompt:"What is a good follow-up note?",options:["A factual summary and the agreed next action","An insult about the buyer","A made-up budget","A guarantee of purchase"],answer:0},
      {prompt:"If a prospect asks not to be contacted again, what should happen?",options:["Keep calling daily","Respect the request and update the record appropriately","Share the number with others","Create a second lead"],answer:1},
    ],
  },
  {
    day: 5, title: "Digital Marketing", summary: "Approved content and responsible outreach",
    lesson: "Use only current Truvi-approved posters, videos, project facts and campaign links. Label promotional content honestly, respect platform rules and avoid misleading urgency, fake testimonials or unsupported financial claims.",
    keyPoints: ["Use approved assets and current links.", "Do not alter prices or legal claims.", "Respect opt-outs and channel rules.", "Submit content for review where required."],
    assignment: "Draft a short social post using approved campaign facts and add a note identifying the source material used.",
    questions: [
      {prompt:"Which content is appropriate to publish?",options:["An altered price list","An approved, current marketing asset","A fabricated testimonial","A guaranteed-return claim"],answer:1},
      {prompt:"What should be done with a new promotional creative if approval is required?",options:["Publish first and ignore review","Submit it for review before publishing","Use another brand's logo","Invent approval details"],answer:1},
      {prompt:"How should urgency be communicated?",options:["Use fake countdowns","Make up scarcity","Use only accurate, verifiable availability information","Claim every plot will sell today"],answer:2},
      {prompt:"What should an Ambassador do when a contact opts out?",options:["Switch to a different channel to keep messaging","Respect the opt-out","Sell the contact list","Ignore the request"],answer:1},
      {prompt:"Why keep a source for campaign claims?",options:["To make content longer","To support accuracy and review","To avoid checking facts","To guarantee a sale"],answer:1},
    ],
  },
  {
    day: 6, title: "CRM & Lead Management", summary: "Accurate records, consent and next steps",
    lesson: "Submit genuine enquiries, check for duplicates, preserve the original referral source and record consent. Lead owners and sales coordinators may change, but referral attribution should remain visible in the audit history.",
    keyPoints: ["A lead needs a real interested prospect.", "Capture consent and required fields.", "Do not create duplicates to inflate results.", "Never edit booking or sale verification yourself."],
    assignment: "Complete a sample lead record with fictional data and explain how you would handle a potential duplicate.",
    questions: [
      {prompt:"What should happen before a new lead is accepted into the workflow?",options:["Skip validation","Check required fields, consent and possible duplicates","Mark it as sold","Delete the source"],answer:1},
      {prompt:"A similar lead already exists. What is correct?",options:["Create a new copy anyway","Review the duplicate rule and let the authorized team resolve ownership","Change the phone number to bypass checks","Delete the original attribution"],answer:1},
      {prompt:"If a sales owner changes, what must be preserved?",options:["Nothing","The original referral source and audit history","Only the new owner's name","The ability to rewrite the timestamp"],answer:1},
      {prompt:"Who can verify a booking or sale in the operating system?",options:["Any ambassador","The authorized sales/admin reviewer","The person submitting the lead alone","A public visitor"],answer:1},
      {prompt:"What is an acceptable lead?",options:["A scraped list with no permission","A fabricated phone number","A genuine enquiry shared with appropriate consent","A copied duplicate"],answer:2},
    ],
  },
  {
    day: 7, title: "Final Assessment", summary: "Knowledge, ethics and practical readiness",
    lesson: "The final day checks knowledge and professional conduct. A written score is only one part of certification: practical communication and ethics must also be reviewed and approved by a Truvi coordinator.",
    keyPoints: ["80/100 is the proposed written passing threshold.", "Practical communication needs reviewer approval.", "Ethics/compliance is a separate mandatory check.", "Certification is an internal Truvi certificate, not a government qualification."],
    assignment: "Submit a short role-play plan showing how you would handle a buyer enquiry from first contact to a documented sales-team handoff.",
    questions: [
      {prompt:"What is the proposed passing threshold for the written quiz?",options:["40/100","60/100","80/100","100/100 only"],answer:2},
      {prompt:"Does passing the written quiz alone complete certification?",options:["Yes","No; practical and ethics assessments also need approval","Only if there are many leads","Only if a booking is promised"],answer:1},
      {prompt:"What kind of certificate is described in the blueprint?",options:["Government licence","Government-recognized qualification","Internal Truvi training certificate","Property title deed"],answer:2},
      {prompt:"A student generates many leads but seriously misleads customers. What should the scorecard do?",options:["Let lead volume override misconduct","Ignore misconduct if sales are high","Treat ethics as an independent requirement","Automatically promote the student"],answer:2},
      {prompt:"What is the safest route for an unverified claim?",options:["Publish it with a disclaimer after the fact","Verify it with an authorized source before sharing","Ask the buyer to verify it","Treat it as true if repeated often"],answer:1},
    ],
  },
];

async function getEffectiveModules(): Promise<TrainingModule[]> {
  const publishedRows = await getDb().select().from(ambassadorOsTrainingModules)
    .where(eq(ambassadorOsTrainingModules.isPublished, true))
    .orderBy(desc(ambassadorOsTrainingModules.version));
  const latestByDay = new Map<number, typeof publishedRows[number]>();
  for (const row of publishedRows) if (!latestByDay.has(row.day)) latestByDay.set(row.day, row);
  return MODULES.map((fallback) => {
    const row = latestByDay.get(fallback.day);
    if (!row) return fallback;
    return {
      day: row.day,
      title: row.title,
      summary: row.summary,
      lesson: row.lesson,
      keyPoints: row.keyPoints ?? fallback.keyPoints,
      assignment: row.assignment,
      questions: row.questions?.length === 5 ? row.questions : fallback.questions,
      videoUrl: row.videoUrl,
      version: row.version,
    };
  });
}

function safeModule(module: TrainingModule) {
  return {
    day: module.day,
    title: module.title,
    summary: module.summary,
    lesson: module.lesson,
    keyPoints: module.keyPoints,
    assignment: module.assignment,
    questions: module.questions.map(({ prompt, options }) => ({ prompt, options })),
    videoUrl: module.videoUrl ?? null,
    version: module.version ?? 1,
  };
}

function displayProfile(profile: typeof ambassadorOsProfiles.$inferSelect) {
  return {
    ...profile,
    ambassadorId: `TRUVI-${profile.cityCode}-${String(profile.ambassadorNo).padStart(4, "0")}`,
    termsAccepted: Boolean(profile.termsAcceptedAt),
  };
}

async function ensureProfile(userId: string) {
  const db = getDb();
  let [profile] = await db.select().from(ambassadorOsProfiles).where(eq(ambassadorOsProfiles.userId, userId));
  if (!profile) {
    await db.insert(ambassadorOsProfiles).values({ userId }).onConflictDoNothing({ target: ambassadorOsProfiles.userId });
    [profile] = await db.select().from(ambassadorOsProfiles).where(eq(ambassadorOsProfiles.userId, userId));
  }
  if (!profile) throw new Error("Could not initialize Ambassador OS profile");
  return profile;
}

const profileSchema = z.object({
  college: z.string().trim().max(160).optional(),
  course: z.string().trim().max(120).optional(),
  academicYear: z.string().trim().max(40).optional(),
  city: z.string().trim().min(2).max(100).optional(),
  preferredRole: z.enum(["SALES", "MARKETING", "RESEARCH", "OPERATIONS"]).optional(),
  weeklyAvailabilityHours: z.number().int().min(1).max(60).optional(),
  acceptTerms: z.boolean().optional(),
});

router.get("/me", async (req: AuthedRequest, res) => {
  if (req.user!.role !== "AMBASSADOR") return res.status(403).json({ error: "Ambassadors only" });
  const db = getDb();
  const profile = await ensureProfile(req.user!.userId);
  const effectiveModules = await getEffectiveModules();
  const [account] = await db.select().from(users).where(eq(users._id, req.user!.userId));
  const [progress, tasks, campaigns, incentives, ownLeads, registeredLeadRows, verifiedBookingRows, campaignGuidelines, campaignAcknowledgements] = await Promise.all([
    db.select().from(ambassadorOsTrainingProgress).where(eq(ambassadorOsTrainingProgress.userId, req.user!.userId)),
    db.select().from(ambassadorOsTasks).where(eq(ambassadorOsTasks.assignedToId, req.user!.userId)).orderBy(desc(ambassadorOsTasks.createdAt)),
    db.select().from(ambassadorOsCampaigns).where(and(eq(ambassadorOsCampaigns.status, "ACTIVE"), eq(ambassadorOsCampaigns.officialDataVerified, true))).orderBy(desc(ambassadorOsCampaigns.createdAt)),
    db.select().from(ambassadorOsIncentives).where(eq(ambassadorOsIncentives.userId, req.user!.userId)).orderBy(desc(ambassadorOsIncentives.createdAt)),
    db.select({ _id: leads._id, stage: leads.stage, isDuplicate: leads.isDuplicate }).from(leads).where(eq(leads.submittedById, req.user!.userId)),
    db.select({ projectId: leads.projectId, isDuplicate: leads.isDuplicate }).from(leads).where(or(eq(leads.stage, "REGISTRATION"), eq(leads.stage, "COMPLETED"))),
    db.select({ projectId: ambassadorOsPropertyBookings.projectId, unitId: ambassadorOsPropertyBookings.unitId })
      .from(ambassadorOsPropertyBookings).where(eq(ambassadorOsPropertyBookings.status, "SALE_VERIFIED")),
    db.select().from(ambassadorOsCampaignGuidelines),
    db.select().from(ambassadorOsCampaignAcknowledgements).where(eq(ambassadorOsCampaignAcknowledgements.ambassadorId, req.user!.userId)),
  ]);
  const progressByDay = new Map(progress.map((row) => [row.day, row]));
  const modules = MODULES.map((module) => {
    const row = progressByDay.get(module.day);
    const previousComplete = module.day === 1 || progressByDay.get(module.day - 1)?.status === "COMPLETED";
    const unlocked = previousComplete && Boolean(profile.termsAcceptedAt) && account?.onboardingVerified === true;
    return { ...safeModule(module), unlocked, progress: row ?? null };
  });
  const leadSummary = {
    total: ownLeads.length,
    new: ownLeads.filter((l) => l.stage === "GENERATED").length,
    contacted: ownLeads.filter((l) => ["CONTACTED", "INTERESTED"].includes(l.stage)).length,
    siteVisit: ownLeads.filter((l) => l.stage === "SITE_VISIT").length,
    booking: ownLeads.filter((l) => l.stage === "BOOKING").length,
    registered: ownLeads.filter((l) => !l.isDuplicate && ["REGISTRATION", "COMPLETED"].includes(l.stage)).length,
    lost: ownLeads.filter((l) => l.stage === "LOST").length,
  };
  res.json({
    profile: displayProfile(profile),
    verification: { emailVerified: account?.emailVerified ?? false, phoneVerified: account?.phoneVerified ?? false, onboardingVerified: account?.onboardingVerified ?? false },
    modules,
    tasks,
    campaigns: campaigns.map((c) => {
      const latestGuideline = campaignGuidelines.filter((item) => item.campaignId === c._id).sort((a, b) => b.version - a.version)[0];
      const guidelinesAcknowledged = Boolean(latestGuideline && campaignAcknowledgements.some((ack) => ack.campaignId === c._id && ack.guidelineVersion === latestGuideline.version));
      const verifiedUnitIds = new Set(verifiedBookingRows.filter((booking) => booking.projectId === c.projectId && booking.unitId).map((booking) => booking.unitId));
      return {
        id: c._id, projectId: c.projectId, name: c.name, projectName: c.projectName, location: c.location,
        targetInventory: c.targetInventory, salesTarget: c.salesTarget,
        verifiedSales: verifiedUnitIds.size,
        unitAreaSqFt: c.unitAreaSqFt, targetDays: c.targetDays, status: c.status,
        marketingGuidelines: latestGuideline ? { version: latestGuideline.version, content: latestGuideline.content, approvalReference: latestGuideline.approvalReference, publishedAt: latestGuideline.publishedAt } : null,
        guidelinesAcknowledged,
      };
    }),
    leadSummary,
    incentives,
    performance: {
      modulesCompleted: progress.filter((p) => p.status === "COMPLETED").length,
      approvedTasks: tasks.filter((t) => t.status === "APPROVED").length,
      pendingReviews: progress.filter((p) => p.status === "ASSESSMENT_PENDING").length,
      verifiedSales: leadSummary.registered,
    },
    careerLevels: [
      { level: "L0", title: "Registered Student", requirement: "Registration complete" },
      { level: "L1", title: "Certified Ambassador", requirement: "Seven modules, written quiz, practical and ethics assessment approved" },
      { level: "L2", title: "Active Ambassador", requirement: "Activation checks and conduct standards approved" },
      { level: "L3", title: "Sales Ambassador", requirement: "Customer handling and verified sales contribution" },
      { level: "L4", title: "Senior Ambassador", requirement: "Consistent performance and mentoring" },
      { level: "L5", title: "Campus Leader", requirement: "Team leadership assessment" },
      { level: "L6", title: "Truvi Young Leader", requirement: "Advanced assessment and role eligibility" },
    ],
  });
});

/**
 * Privacy-safe quality leaderboard. Only active Ambassadors appear, and the
 * response intentionally contains aggregate performance only—never buyer names,
 * phone numbers, emails, lead notes, or payout details.
 *
 * Transparent internal score: +2 per approved learning module, +5 per approved
 * task, +8 per unique completed site visit, +25 per non-duplicate registered
 * sale; -2 per lost lead and -3 per duplicate lead. This is recognition only,
 * not a commission formula or a promise of income.
 */

const scorecardWeightsSchema = z.object({
  genuineLeadQuality: z.number().int().min(0).max(100),
  customerCommunication: z.number().int().min(0).max(100),
  siteVisitContribution: z.number().int().min(0).max(100),
  verifiedSalesContribution: z.number().int().min(0).max(100),
  crmDiscipline: z.number().int().min(0).max(100),
  trainingSkillDevelopment: z.number().int().min(0).max(100),
  ethicsCompliance: z.number().int().min(0).max(100),
  approvalReference: z.string().trim().min(5).max(500),
}).refine((v) => areValidScorecardWeights({
  genuineLeadQuality: v.genuineLeadQuality,
  customerCommunication: v.customerCommunication,
  siteVisitContribution: v.siteVisitContribution,
  verifiedSalesContribution: v.verifiedSalesContribution,
  crmDiscipline: v.crmDiscipline,
  trainingSkillDevelopment: v.trainingSkillDevelopment,
  ethicsCompliance: v.ethicsCompliance,
}), { message: "The seven scorecard weights must total exactly 100%" });

router.get("/admin/scorecard/weights", requireOsStaffRole("PROGRAM_MANAGER"), async (req: AuthedRequest, res) => {
  const policy = await getActiveScorecardPolicy(req.user!.userId);
  const weights = publicScorecardWeights(policy);
  res.json({ policy, weights, totalWeight: Object.values(weights).reduce((sum, value) => sum + value, 0) });
});

router.put("/admin/scorecard/weights", requireOsStaffRole("PROGRAM_MANAGER"), async (req: AuthedRequest, res) => {
  const parsed = scorecardWeightsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid performance weights" });
  const db = getDb();
  const existingRows = await db.select().from(ambassadorOsScorecardPolicies).orderBy(desc(ambassadorOsScorecardPolicies.version));
  const nextVersion = (existingRows[0]?.version ?? 0) + 1;
  await db.update(ambassadorOsScorecardPolicies).set({ active: false }).where(eq(ambassadorOsScorecardPolicies.active, true));
  const [policy] = await db.insert(ambassadorOsScorecardPolicies).values({
    version: nextVersion,
    genuineLeadQualityWeight: parsed.data.genuineLeadQuality,
    customerCommunicationWeight: parsed.data.customerCommunication,
    siteVisitContributionWeight: parsed.data.siteVisitContribution,
    verifiedSalesContributionWeight: parsed.data.verifiedSalesContribution,
    crmDisciplineWeight: parsed.data.crmDiscipline,
    trainingSkillDevelopmentWeight: parsed.data.trainingSkillDevelopment,
    ethicsComplianceWeight: parsed.data.ethicsCompliance,
    active: true,
    approvalReference: parsed.data.approvalReference,
    createdById: req.user!.userId,
  }).returning();
  await logAudit({ userId: req.user!.userId, action: "ambassador_os.scorecard_weights.update", resourceType: "ambassador_os_scorecard_policy", resourceId: policy._id, metadata: { version: policy.version, weights: publicScorecardWeights(policy), approvalReference: policy.approvalReference } });
  const weights = publicScorecardWeights(policy);
  res.json({ policy, weights, totalWeight: 100 });
});

const performanceReviewSchema = z.object({
  ambassadorId: z.string().uuid(),
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
  genuineLeadQualityScore: z.number().int().min(0).max(100),
  customerCommunicationScore: z.number().int().min(0).max(100),
  siteVisitContributionScore: z.number().int().min(0).max(100),
  verifiedSalesContributionScore: z.number().int().min(0).max(100),
  crmDisciplineScore: z.number().int().min(0).max(100),
  trainingSkillDevelopmentScore: z.number().int().min(0).max(100),
  ethicsComplianceScore: z.number().int().min(0).max(100),
  seriousMisconduct: z.boolean().default(false),
  complianceNotes: z.string().trim().max(2000).optional(),
  reviewNotes: z.string().trim().min(5).max(3000),
}).refine((v) => new Date(v.periodEnd).getTime() >= new Date(v.periodStart).getTime(), { message: "Review period end must be on or after its start" })
  .refine((v) => !v.seriousMisconduct || Boolean(v.complianceNotes?.trim()), { message: "Serious misconduct requires the specific compliance finding to be recorded" });

router.get("/admin/performance-reviews", requireOsStaffRole("PROGRAM_MANAGER"), async (req: AuthedRequest, res) => {
  const db = getDb();
  const policy = await getActiveScorecardPolicy(req.user!.userId);
  const [profiles, reviewRows, progress, tasks, allLeads, completedVisits, bookings, followUps] = await Promise.all([
    db.select({ profile: ambassadorOsProfiles, name: users.name, email: users.email, onboardingVerified: users.onboardingVerified })
      .from(ambassadorOsProfiles).innerJoin(users, eq(ambassadorOsProfiles.userId, users._id)).orderBy(ambassadorOsProfiles.ambassadorNo),
    db.select().from(ambassadorOsPerformanceReviews).orderBy(desc(ambassadorOsPerformanceReviews.periodEnd), desc(ambassadorOsPerformanceReviews.reviewedAt)),
    db.select().from(ambassadorOsTrainingProgress),
    db.select().from(ambassadorOsTasks),
    db.select().from(leads),
    db.select({ leadId: siteVisits.leadId }).from(siteVisits).where(eq(siteVisits.status, "COMPLETED")),
    db.select().from(ambassadorOsPropertyBookings),
    db.select().from(ambassadorOsFollowUps),
  ]);
  const latestByUser = new Map<string, typeof reviewRows[number]>();
  for (const review of reviewRows) if (!latestByUser.has(review.ambassadorId)) latestByUser.set(review.ambassadorId, review);
  const completedVisitIds = new Set(completedVisits.map((row) => row.leadId).filter(Boolean));
  res.json({
    policy,
    weights: publicScorecardWeights(policy),
    ambassadors: profiles.map(({ profile, name, email, onboardingVerified }) => {
      const attributed = allLeads.filter((lead) => lead.submittedById === profile.userId || (lead.referralChain ?? []).some((r) => r.userId === profile.userId));
      const genuineLeads = attributed.filter((lead) => !lead.isDuplicate && (
        lead.creatorRole === "BUYER" || (lead.contactConsent === true && Boolean(lead.contactConsentAt) && Boolean(lead.consentTextVersion))
      ));
      const review = latestByUser.get(profile.userId);
      return {
        profile: displayProfile(profile),
        name,
        email,
        onboardingVerified,
        latestReview: review ?? null,
        metrics: {
          totalAttributedLeads: attributed.length,
          genuineLeads: genuineLeads.length,
          qualifiedLeads: genuineLeads.filter((lead) => Boolean(lead.qualifiedAt) || ["INTERESTED", "SITE_VISIT", "NEGOTIATION", "BOOKING", "REGISTRATION", "COMPLETED"].includes(lead.stage)).length,
          duplicateLeads: attributed.filter((lead) => lead.isDuplicate).length,
          completedSiteVisits: genuineLeads.filter((lead) => completedVisitIds.has(lead._id)).length,
          verifiedSales: bookings.filter((booking) => booking.status === "SALE_VERIFIED" && genuineLeads.some((lead) => lead._id === booking.leadId)).length,
          completedTrainingDays: progress.filter((row) => row.userId === profile.userId && row.status === "COMPLETED").length,
          approvedTasks: tasks.filter((row) => row.assignedToId === profile.userId && row.status === "APPROVED").length,
          totalTasks: tasks.filter((row) => row.assignedToId === profile.userId).length,
          followUpsCompleted: followUps.filter((row) => row.ambassadorId === profile.userId && row.status === "DONE").length,
          followUpsDueOrMissed: followUps.filter((row) => row.ambassadorId === profile.userId && ["PENDING", "MISSED"].includes(row.status)).length,
          lostLeads: attributed.filter((lead) => lead.stage === "LOST" && !lead.isDuplicate).length,
        },
      };
    }),
  });
});

router.post("/admin/performance-reviews", requireOsStaffRole("PROGRAM_MANAGER"), async (req: AuthedRequest, res) => {
  const parsed = performanceReviewSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid performance review" });
  const db = getDb();
  const [profile] = await db.select().from(ambassadorOsProfiles).where(eq(ambassadorOsProfiles.userId, parsed.data.ambassadorId));
  if (!profile) return res.status(404).json({ error: "Ambassador profile not found" });
  const policy = await getActiveScorecardPolicy(req.user!.userId);
  const scores = {
    genuineLeadQuality: parsed.data.genuineLeadQualityScore,
    customerCommunication: parsed.data.customerCommunicationScore,
    siteVisitContribution: parsed.data.siteVisitContributionScore,
    verifiedSalesContribution: parsed.data.verifiedSalesContributionScore,
    crmDiscipline: parsed.data.crmDisciplineScore,
    trainingSkillDevelopment: parsed.data.trainingSkillDevelopmentScore,
    ethicsCompliance: parsed.data.ethicsComplianceScore,
  };
  const weighted = calculateWeightedPerformanceScore({ scores, weights: publicScorecardWeights(policy), seriousMisconduct: parsed.data.seriousMisconduct });
  if (!weighted) return res.status(400).json({ error: "Active performance scorecard policy is invalid" });
  const [review] = await db.insert(ambassadorOsPerformanceReviews).values({
    ambassadorId: profile.userId,
    periodStart: new Date(parsed.data.periodStart),
    periodEnd: new Date(parsed.data.periodEnd),
    scorecardPolicyVersion: policy.version,
    genuineLeadQualityScore: scores.genuineLeadQuality,
    customerCommunicationScore: scores.customerCommunication,
    siteVisitContributionScore: scores.siteVisitContribution,
    verifiedSalesContributionScore: scores.verifiedSalesContribution,
    crmDisciplineScore: scores.crmDiscipline,
    trainingSkillDevelopmentScore: scores.trainingSkillDevelopment,
    ethicsComplianceScore: scores.ethicsCompliance,
    weightedScore: weighted.score,
    seriousMisconduct: parsed.data.seriousMisconduct,
    complianceNotes: parsed.data.complianceNotes ?? null,
    reviewNotes: parsed.data.reviewNotes,
    reviewedById: req.user!.userId,
  }).returning();
  if (parsed.data.seriousMisconduct) {
    await db.update(ambassadorOsProfiles).set({ status: "SUSPENDED", updatedAt: new Date() }).where(eq(ambassadorOsProfiles.userId, profile.userId));
    await notifySafely([profile.userId], {
      type: "ambassador_compliance_review",
      title: "Ambassador account suspended pending conduct review",
      message: "A serious conduct finding was recorded by Truvi. Contact the program administrator for the review outcome.",
      data: { screen: "AmbassadorOperatingSystem", status: "SUSPENDED" },
      actorUserId: req.user!.userId,
      priority: "high",
      dedupeKey: String(review._id) + ":serious-misconduct",
    });
  }
  await logAudit({ userId: req.user!.userId, action: "ambassador_os.performance.review", resourceType: "ambassador_os_performance_review", resourceId: review._id, metadata: { ambassadorId: profile.userId, periodStart: review.periodStart, periodEnd: review.periodEnd, weightedScore: review.weightedScore, policyVersion: policy.version, seriousMisconduct: review.seriousMisconduct } });
  res.status(201).json({ review, weightedScore: review.weightedScore, eligibleForLeaderboard: weighted.eligibleForLeaderboard });
});

router.get("/leaderboard", requireRole("ADMIN", "AMBASSADOR"), async (req: AuthedRequest, res) => {
  const db = getDb();
  const policy = await getActiveScorecardPolicy(req.user!.userId);
  const [profileRows, completedModules, approvedTasks, allLeads, completedVisits, reviewRows, propertyBookings] = await Promise.all([
    db.select({ profile: ambassadorOsProfiles, name: users.name })
      .from(ambassadorOsProfiles)
      .innerJoin(users, eq(ambassadorOsProfiles.userId, users._id))
      .where(eq(ambassadorOsProfiles.status, "ACTIVE")),
    db.select({ userId: ambassadorOsTrainingProgress.userId, day: ambassadorOsTrainingProgress.day })
      .from(ambassadorOsTrainingProgress)
      .where(eq(ambassadorOsTrainingProgress.status, "COMPLETED")),
    db.select({ userId: ambassadorOsTasks.assignedToId })
      .from(ambassadorOsTasks)
      .where(eq(ambassadorOsTasks.status, "APPROVED")),
    db.select({
      _id: leads._id, submittedById: leads.submittedById, referralChain: leads.referralChain,
      stage: leads.stage, isDuplicate: leads.isDuplicate, creatorRole: leads.creatorRole,
      contactConsent: leads.contactConsent, contactConsentAt: leads.contactConsentAt, consentTextVersion: leads.consentTextVersion,
    }).from(leads),
    db.select({ leadId: siteVisits.leadId }).from(siteVisits).where(eq(siteVisits.status, "COMPLETED")),
    db.select().from(ambassadorOsPerformanceReviews).orderBy(desc(ambassadorOsPerformanceReviews.periodEnd), desc(ambassadorOsPerformanceReviews.reviewedAt)),
    db.select({ leadId: ambassadorOsPropertyBookings.leadId, status: ambassadorOsPropertyBookings.status })
      .from(ambassadorOsPropertyBookings).where(eq(ambassadorOsPropertyBookings.status, "SALE_VERIFIED")),
  ]);
  const completedVisitIds = new Set(completedVisits.map((v) => v.leadId).filter(Boolean));
  const verifiedSaleLeadIds = new Set(propertyBookings.map((b) => b.leadId));
  const latestReviews = new Map<string, typeof reviewRows[number]>();
  for (const review of reviewRows) if (!latestReviews.has(review.ambassadorId)) latestReviews.set(review.ambassadorId, review);
  const weights = publicScorecardWeights(policy);
  const rows = profileRows.map(({ profile, name }) => {
    const attributed = allLeads.filter((lead) =>
      lead.submittedById === profile.userId || (lead.referralChain ?? []).some((referral) => referral.userId === profile.userId)
    );
    const consentEligible = (lead: typeof attributed[number]) => lead.creatorRole === "BUYER" ||
      (lead.contactConsent === true && Boolean(lead.contactConsentAt) && Boolean(lead.consentTextVersion));
    const genuine = attributed.filter((lead) => !lead.isDuplicate && consentEligible(lead));
    const latestReview = latestReviews.get(profile.userId);
    const nameParts = name.trim().split(/\s+/).filter(Boolean);
    const displayName = nameParts.length > 1 ? nameParts[0] + " " + nameParts[nameParts.length - 1][0] + "." : (nameParts[0] ?? "Ambassador");
    const saleCount = genuine.filter((lead) => verifiedSaleLeadIds.has(lead._id)).length;
    return {
      userId: profile.userId,
      displayName,
      ambassadorId: "TRUVI-" + profile.cityCode + "-" + String(profile.ambassadorNo).padStart(4, "0"),
      currentLevel: profile.currentLevel,
      modulesCompleted: completedModules.filter((module) => module.userId === profile.userId).length,
      approvedTasks: approvedTasks.filter((task) => task.userId === profile.userId).length,
      genuineEnquiries: genuine.length,
      qualifiedLeads: genuine.filter((lead) => Boolean((lead as any).qualifiedAt) || ["INTERESTED", "SITE_VISIT", "NEGOTIATION", "BOOKING", "REGISTRATION", "COMPLETED"].includes(lead.stage)).length,
      completedSiteVisits: genuine.filter((lead) => completedVisitIds.has(lead._id)).length,
      verifiedSales: saleCount,
      lostLeads: attributed.filter((lead) => lead.stage === "LOST" && !lead.isDuplicate).length,
      duplicateLeads: attributed.filter((lead) => lead.isDuplicate).length,
      scorecardReviewed: Boolean(latestReview),
      seriousMisconduct: latestReview?.seriousMisconduct ?? false,
      weightedScore: latestReview?.weightedScore ?? null,
      scores: latestReview ? {
        genuineLeadQuality: latestReview.genuineLeadQualityScore,
        customerCommunication: latestReview.customerCommunicationScore,
        siteVisitContribution: latestReview.siteVisitContributionScore,
        verifiedSalesContribution: latestReview.verifiedSalesContributionScore,
        crmDiscipline: latestReview.crmDisciplineScore,
        trainingSkillDevelopment: latestReview.trainingSkillDevelopmentScore,
        ethicsCompliance: latestReview.ethicsComplianceScore,
      } : null,
      scorecardPolicyVersion: latestReview?.scorecardPolicyVersion ?? null,
      reviewPeriodEnd: latestReview?.periodEnd ?? null,
    };
  });
  const rankable = rows.filter((row) => row.scorecardReviewed && !row.seriousMisconduct && row.weightedScore !== null)
    .sort((a, b) => (b.weightedScore ?? 0) - (a.weightedScore ?? 0) || a.ambassadorId.localeCompare(b.ambassadorId))
    .map((row, index) => ({ ...row, rank: index + 1 }));
  const rankByUser = new Map(rankable.map((row) => [row.userId, row.rank]));
  const rankedPublic = rankable.map(({ userId, ...row }) => ({ ...row, isMine: userId === req.user!.userId }));
  const ownRow = rows.find((row) => row.userId === req.user!.userId) ?? null;
  const mine = ownRow ? {
    ...ownRow,
    rank: rankByUser.get(ownRow.userId) ?? null,
    isMine: true,
  } : null;
  res.json({
    scoring: weights,
    totalWeight: Object.values(weights).reduce((sum, value) => sum + value, 0),
    leaderboard: rankedPublic.slice(0, 10),
    mine,
    unscoredActiveAmbassadors: rows.filter((row) => !row.scorecardReviewed && !row.seriousMisconduct).length,
    excludedForComplianceReview: rows.filter((row) => row.seriousMisconduct).length,
  });
});

router.put("/profile", async (req: AuthedRequest, res) => {
  if (req.user!.role !== "AMBASSADOR") return res.status(403).json({ error: "Ambassadors only" });
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid profile" });
  const db = getDb();
  const current = await ensureProfile(req.user!.userId);
  const data = parsed.data;
  const now = new Date();
  const normalizedCity = (data.city ?? current.city).trim().toUpperCase();
  const cityCodes: Record<string, string> = { LUCKNOW: "LKO", MEERUT: "MRT", DELHI: "DEL", "NEW DELHI": "DEL", NOIDA: "NOI", GURUGRAM: "GGN", GURGAON: "GGN", KANPUR: "KNP", AGRA: "AGR", VARANASI: "VNS", JAIPUR: "JAI", MUMBAI: "MUM", PUNE: "PUN", BENGALURU: "BLR", BANGALORE: "BLR", HYDERABAD: "HYD", CHENNAI: "MAA", KOLKATA: "CCU" };
  const [updated] = await db.update(ambassadorOsProfiles).set({
    college: data.college ?? current.college,
    course: data.course ?? current.course,
    academicYear: data.academicYear ?? current.academicYear,
    city: data.city ?? current.city,
    preferredRole: data.preferredRole ?? current.preferredRole,
    weeklyAvailabilityHours: data.weeklyAvailabilityHours ?? current.weeklyAvailabilityHours,
    termsAcceptedAt: data.acceptTerms === true ? (current.termsAcceptedAt ?? now) : current.termsAcceptedAt,
    termsVersion: data.acceptTerms === true ? (current.termsVersion ?? "TRUVI_AMBASSADOR_TERMS_V1") : current.termsVersion,
    cityCode: !current.termsAcceptedAt && data.acceptTerms === true
      ? (cityCodes[normalizedCity] ?? (normalizedCity.replace(/[^A-Z0-9]/g, "").slice(0, 3) || "TRU"))
      : current.cityCode,
    status: data.acceptTerms === true && !current.termsAcceptedAt && !req.user!.onboardingVerified
      ? "VERIFICATION_PENDING"
      : current.status,
    updatedAt: now,
  }).where(eq(ambassadorOsProfiles.userId, req.user!.userId)).returning();
  await logAudit({ userId: req.user!.userId, action: "ambassador_os.profile.update", resourceType: "ambassador_os_profile", resourceId: updated._id, metadata: { termsAccepted: Boolean(updated.termsAcceptedAt), city: updated.city } });
  res.json({ profile: displayProfile(updated) });
});

router.get("/training", async (req: AuthedRequest, res) => {
  if (req.user!.role !== "AMBASSADOR") return res.status(403).json({ error: "Ambassadors only" });
  const db = getDb();
  const profile = await ensureProfile(req.user!.userId);
  const effectiveModules = await getEffectiveModules();
  const [account] = await db.select().from(users).where(eq(users._id, req.user!.userId));
  const progress = await db.select().from(ambassadorOsTrainingProgress).where(eq(ambassadorOsTrainingProgress.userId, req.user!.userId));
  const byDay = new Map(progress.map((p) => [p.day, p]));
  res.json({ modules: effectiveModules.map((m) => {
    const previousComplete = m.day === 1 || byDay.get(m.day - 1)?.status === "COMPLETED";
    return { ...safeModule(m), unlocked: previousComplete && Boolean(profile.termsAcceptedAt) && account?.onboardingVerified === true, progress: byDay.get(m.day) ?? null };
  })});
});

const quizSubmitSchema = z.object({
  answers: z.array(z.number().int().min(0).max(4)).length(5),
  assignmentText: z.string().trim().min(5).max(5000),
});

router.post("/training/:day/submit", async (req: AuthedRequest, res) => {
  if (req.user!.role !== "AMBASSADOR") return res.status(403).json({ error: "Ambassadors only" });
  const day = Number(String(req.params.day));
  if (!Number.isInteger(day) || day < 1 || day > 7) return res.status(400).json({ error: "Training day must be between 1 and 7" });
  const parsed = quizSubmitSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid assessment" });
  const db = getDb();
  const profile = await ensureProfile(req.user!.userId);
  const [account] = await db.select().from(users).where(eq(users._id, req.user!.userId));
  if (!account?.onboardingVerified) return res.status(403).json({ error: "Complete identity verification before training assessments" });
  if (!profile.termsAcceptedAt) return res.status(403).json({ error: "Complete your profile and accept the program terms first" });
  const existing = await db.select().from(ambassadorOsTrainingProgress).where(eq(ambassadorOsTrainingProgress.userId, req.user!.userId));
  const existingDay = existing.find((row) => row.day === day);
  if (existingDay?.status === "COMPLETED") {
    return res.status(409).json({ error: "This module is already completed and certified; completed scores cannot be overwritten." });
  }
  if (existingDay?.status === "ASSESSMENT_PENDING") {
    return res.status(409).json({ error: "This assessment is waiting for trainer review. Wait for review feedback before submitting again." });
  }
  if (day > 1 && existing.find((row) => row.day === day - 1)?.status !== "COMPLETED") {
    return res.status(409).json({ error: "Complete the previous training day and receive trainer approval before proceeding" });
  }
  const currentModules = await getEffectiveModules();
  const module = currentModules.find((m) => m.day === day) ?? MODULES[day - 1];
  if (parsed.data.answers.some((answer, index) => answer >= module.questions[index].options.length)) {
    return res.status(400).json({ error: "One or more quiz answers are outside the published answer options" });
  }
  const correct = parsed.data.answers.reduce((sum, answer, i) => sum + (answer === module.questions[i].answer ? 1 : 0), 0);
  const quizScore = correct * 20;
  const status = quizScore >= 80 ? "ASSESSMENT_PENDING" as const : "RETAKE_REQUIRED" as const;
  const now = new Date();
  const [progress] = await db.insert(ambassadorOsTrainingProgress).values({
    userId: req.user!.userId, day, quizScore, answers: parsed.data.answers, assignmentText: parsed.data.assignmentText,
    practicalStatus: "PENDING", ethicsStatus: "PENDING", status, trainerFeedback: null,
    lessonVersion: module.version ?? 1,
    reviewedById: null, reviewedAt: null, completedAt: null, updatedAt: now,
  }).onConflictDoUpdate({
    target: [ambassadorOsTrainingProgress.userId, ambassadorOsTrainingProgress.day],
    set: { quizScore, answers: parsed.data.answers, assignmentText: parsed.data.assignmentText, practicalStatus: "PENDING", ethicsStatus: "PENDING", status, trainerFeedback: null, reviewedById: null, reviewedAt: null, completedAt: null, updatedAt: now },
  }).returning();
  if (!["ACTIVE", "SUSPENDED", "EXITED"].includes(profile.status)) {
    await db.update(ambassadorOsProfiles).set({ status: status === "ASSESSMENT_PENDING" ? "ASSESSMENT_PENDING" : "TRAINING_IN_PROGRESS", updatedAt: now }).where(eq(ambassadorOsProfiles.userId, req.user!.userId));
  }
  await logAudit({ userId: req.user!.userId, action: "ambassador_os.training.submit", resourceType: "ambassador_os_training", resourceId: progress._id, metadata: { day, quizScore, status } });
  res.json({ progress, passedWrittenAssessment: quizScore >= 80, message: quizScore >= 80 ? "Written assessment passed. Practical and ethics review are still required." : "Score below 80/100. Review the lesson and retake this module." });
});

router.get("/tasks", async (req: AuthedRequest, res) => {
  if (req.user!.role !== "AMBASSADOR") return res.status(403).json({ error: "Ambassadors only" });
  const tasks = await getDb().select().from(ambassadorOsTasks).where(eq(ambassadorOsTasks.assignedToId, req.user!.userId)).orderBy(desc(ambassadorOsTasks.createdAt));
  res.json({ tasks });
});

router.post("/tasks/:id/accept", async (req: AuthedRequest, res) => {
  if (req.user!.role !== "AMBASSADOR") return res.status(403).json({ error: "Ambassadors only" });
  const db = getDb();
  const [task] = await db.select().from(ambassadorOsTasks)
    .where(and(eq(ambassadorOsTasks._id, String(req.params.id)), eq(ambassadorOsTasks.assignedToId, req.user!.userId)));
  if (!task) return res.status(404).json({ error: "Task not found" });
  if (task.status !== "ASSIGNED") return res.status(409).json({ error: "Only a newly assigned task can be accepted" });
  const [updated] = await db.update(ambassadorOsTasks).set({ status: "ACCEPTED" })
    .where(and(eq(ambassadorOsTasks._id, task._id), eq(ambassadorOsTasks.status, "ASSIGNED"))).returning();
  if (!updated) return res.status(409).json({ error: "This task changed; refresh and try again" });
  await logAudit({ userId: req.user!.userId, action: "ambassador_os.task.accept", resourceType: "ambassador_os_task", resourceId: updated._id, metadata: { title: updated.title, category: updated.category } });
  res.json({ task: updated });
});

router.post("/tasks/:id/start", async (req: AuthedRequest, res) => {
  if (req.user!.role !== "AMBASSADOR") return res.status(403).json({ error: "Ambassadors only" });
  const db = getDb();
  const [task] = await db.select().from(ambassadorOsTasks).where(and(eq(ambassadorOsTasks._id, String(req.params.id)), eq(ambassadorOsTasks.assignedToId, req.user!.userId)));
  if (!task) return res.status(404).json({ error: "Task not found" });
  if (task.status !== "ACCEPTED") return res.status(409).json({ error: "Accept the assigned task before starting it" });
  if (task.category !== "TRAINING") {
    const [profile] = await db.select().from(ambassadorOsProfiles).where(eq(ambassadorOsProfiles.userId, req.user!.userId));
    const [account] = await db.select({ onboardingVerified: users.onboardingVerified }).from(users).where(eq(users._id, req.user!.userId));
    if (!profile?.termsAcceptedAt || !account?.onboardingVerified || profile.status !== "ACTIVE") {
      return res.status(403).json({ error: "Complete verification, certification and activation before starting sales or field tasks", code: "AMBASSADOR_ACTIVATION_REQUIRED" });
    }
  }
  const [updated] = await db.update(ambassadorOsTasks).set({ status: "IN_PROGRESS" }).where(and(eq(ambassadorOsTasks._id, task._id), eq(ambassadorOsTasks.status, "ACCEPTED"))).returning();
  if (!updated) return res.status(409).json({ error: "The task changed. Refresh and try again." });
  await logAudit({ userId: req.user!.userId, action: "ambassador_os.task.start", resourceType: "ambassador_os_task", resourceId: updated._id, metadata: { title: updated.title, category: updated.category } });
  res.json({ task: updated });
});

const evidenceSchema = z.object({ evidenceText: z.string().trim().min(5).max(5000), evidenceUrl: z.string().url().optional().or(z.literal("")) });

router.post("/tasks/:id/submit", async (req: AuthedRequest, res) => {
  if (req.user!.role !== "AMBASSADOR") return res.status(403).json({ error: "Ambassadors only" });
  const parsed = evidenceSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid task evidence" });
  const db = getDb();
  const [task] = await db.select().from(ambassadorOsTasks).where(and(eq(ambassadorOsTasks._id, String(req.params.id)), eq(ambassadorOsTasks.assignedToId, req.user!.userId)));
  if (!task) return res.status(404).json({ error: "Task not found" });
  if (!["ACCEPTED", "IN_PROGRESS", "REJECTED"].includes(task.status)) return res.status(409).json({ error: "Accept and start the task before submitting it, or resubmit a rejected task" });
  if (task.category !== "TRAINING") {
    const [profile] = await db.select().from(ambassadorOsProfiles).where(eq(ambassadorOsProfiles.userId, req.user!.userId));
    const [account] = await db.select({ onboardingVerified: users.onboardingVerified }).from(users).where(eq(users._id, req.user!.userId));
    if (!profile?.termsAcceptedAt || !account?.onboardingVerified || profile.status !== "ACTIVE") {
      return res.status(403).json({ error: "Complete verification, certification and activation before submitting sales or field work", code: "AMBASSADOR_ACTIVATION_REQUIRED" });
    }
  }
  const [updated] = await db.update(ambassadorOsTasks).set({
    status: "SUBMITTED", evidenceText: parsed.data.evidenceText, evidenceUrl: parsed.data.evidenceUrl || null,
    reviewReason: null, reviewedById: null, reviewedAt: null,
  }).where(and(eq(ambassadorOsTasks._id, task._id), eq(ambassadorOsTasks.status, task.status))).returning();
  if (!updated) return res.status(409).json({ error: "The task changed while you were submitting it. Refresh and try again." });
  await logAudit({ userId: req.user!.userId, action: "ambassador_os.task.submit", resourceType: "ambassador_os_task", resourceId: updated._id, metadata: { status: updated.status, category: updated.category } });
  const admins = await db.select({ userId: users._id }).from(users).where(eq(users.role, "ADMIN"));
  await notifySafely(admins.map((admin) => admin.userId), {
    type: "ambassador_task_submission",
    title: "Ambassador task submitted for review",
    message: `An Ambassador submitted evidence for: ${updated.title}`,
    data: { screen: "AdminAmbassadorOperatingSystem", taskId: updated._id },
    actorUserId: req.user!.userId,
    priority: "normal",
    dedupeKey: `${updated._id}:SUBMITTED:${Date.now()}`,
  });
  res.json({ task: updated });
});


const adminLeadReviewSchema = z.object({
  stage: z.enum(["GENERATED", "ASSIGNED", "CONTACTED", "INTERESTED", "SITE_VISIT", "NEGOTIATION", "BOOKING", "REGISTRATION", "COMPLETED", "LOST"]).optional(),
  assignedToId: z.string().uuid().nullable().optional(),
  budgetRange: z.string().trim().max(80).optional().or(z.literal("")),
  purchasePurpose: z.enum(["SELF_USE", "INVESTMENT", "UNDECIDED"]).optional(),
  preferredPlotSize: z.string().trim().max(100).optional().or(z.literal("")),
  purchaseTimeline: z.enum(["IMMEDIATE", "WITHIN_3_MONTHS", "3_TO_6_MONTHS", "6_TO_12_MONTHS", "MORE_THAN_12_MONTHS", "NOT_DECIDED"]).optional(),
  sourceChannel: z.enum(["AMBASSADOR_REFERRAL", "WHATSAPP", "INSTAGRAM", "FACEBOOK", "ORGANIC_WEBSITE", "PAID_ADVERTISEMENT", "CUSTOMER_REFERRAL", "TELECALLER", "CHANNEL_PARTNER", "DIRECT_ENQUIRY", "OTHER"]).optional(),
  ownershipReviewStatus: z.enum(["NOT_REQUIRED", "OPEN", "UNDER_REVIEW", "RESOLVED"]).optional(),
  ownershipReviewNotes: z.string().trim().max(2000).optional(),
  nextFollowUpAt: z.string().datetime().nullable().optional(),
  lostReason: z.string().trim().max(1000).optional(),
});


router.get("/admin/sales-dashboard", requireOsStaffRole("SALES_COORDINATOR", "PROGRAM_MANAGER"), async (_req: AuthedRequest, res) => {
  const db = getDb();
  const sourceKey = sql<string>`coalesce(${leads.sourceChannel}, ${leads.source})`;
  const [
    campaigns,
    leadsByProject,
    visitsByProject,
    bookingsByProject,
    commissionsByProject,
    leadsByChannel,
    visitsByChannel,
    bookingsByChannel,
    costsByCampaignChannel,
  ] = await Promise.all([
    db.select().from(ambassadorOsCampaigns).orderBy(desc(ambassadorOsCampaigns.createdAt)),
    db.select({
      projectId: leads.projectId,
      total: sql<number>`count(*)`.mapWith(Number),
      newLeads: sql<number>`count(*) filter (where ${leads.stage} in ('GENERATED','ASSIGNED'))`.mapWith(Number),
      contacted: sql<number>`count(*) filter (where ${leads.contactAttemptedAt} is not null or ${leads.stage} in ('CONTACTED','INTERESTED','SITE_VISIT','NEGOTIATION','BOOKING','REGISTRATION','COMPLETED'))`.mapWith(Number),
      qualified: sql<number>`count(*) filter (where ${leads.qualifiedAt} is not null or ${leads.stage} in ('INTERESTED','SITE_VISIT','NEGOTIATION','BOOKING','REGISTRATION','COMPLETED'))`.mapWith(Number),
      lost: sql<number>`count(*) filter (where ${leads.stage} = 'LOST')`.mapWith(Number),
      duplicates: sql<number>`count(*) filter (where ${leads.isDuplicate} = true)`.mapWith(Number),
      ownershipDisputes: sql<number>`count(*) filter (where ${leads.ownershipReviewStatus} in ('OPEN','UNDER_REVIEW'))`.mapWith(Number),
    }).from(leads).groupBy(leads.projectId),
    db.select({
      projectId: siteVisits.projectId,
      scheduled: sql<number>`count(*) filter (where ${siteVisits.status} in ('SCHEDULED','CONFIRMED'))`.mapWith(Number),
      completed: sql<number>`count(*) filter (where ${siteVisits.status} = 'COMPLETED')`.mapWith(Number),
      cancelled: sql<number>`count(*) filter (where ${siteVisits.status} in ('CANCELLED','NO_SHOW'))`.mapWith(Number),
      total: sql<number>`count(*)`.mapWith(Number),
    }).from(siteVisits).groupBy(siteVisits.projectId),
    db.select({
      projectId: ambassadorOsPropertyBookings.projectId,
      total: sql<number>`count(*)`.mapWith(Number),
      pending: sql<number>`count(*) filter (where ${ambassadorOsPropertyBookings.status} in ('SUBMITTED','UNDER_REVIEW'))`.mapWith(Number),
      verified: sql<number>`count(*) filter (where ${ambassadorOsPropertyBookings.status} = 'VERIFIED')`.mapWith(Number),
      verifiedSales: sql<number>`count(distinct ${ambassadorOsPropertyBookings.unitId}) filter (where ${ambassadorOsPropertyBookings.status} = 'SALE_VERIFIED')`.mapWith(Number),
      cancelled: sql<number>`count(*) filter (where ${ambassadorOsPropertyBookings.cancelledAt} is not null)`.mapWith(Number),
    }).from(ambassadorOsPropertyBookings).groupBy(ambassadorOsPropertyBookings.projectId),
    db.select({
      projectId: ambassadorOsPropertyBookings.projectId,
      total: sql<number>`coalesce(sum(${ambassadorOsIncentives.amount}) filter (where ${ambassadorOsIncentives.status} in ('APPROVED','PAYABLE','PAID')), 0)`.mapWith(Number),
      paid: sql<number>`coalesce(sum(${ambassadorOsIncentives.amount}) filter (where ${ambassadorOsIncentives.status} = 'PAID'), 0)`.mapWith(Number),
    }).from(ambassadorOsIncentives)
      .innerJoin(ambassadorOsPropertyBookings, eq(ambassadorOsIncentives.propertyBookingId, ambassadorOsPropertyBookings._id))
      .groupBy(ambassadorOsPropertyBookings.projectId),
    db.select({
      projectId: leads.projectId,
      sourceChannel: sourceKey,
      total: sql<number>`count(*)`.mapWith(Number),
      qualified: sql<number>`count(*) filter (where ${leads.qualifiedAt} is not null or ${leads.stage} in ('INTERESTED','SITE_VISIT','NEGOTIATION','BOOKING','REGISTRATION','COMPLETED'))`.mapWith(Number),
      lost: sql<number>`count(*) filter (where ${leads.stage} = 'LOST')`.mapWith(Number),
    }).from(leads).groupBy(leads.projectId, sourceKey),
    db.select({
      projectId: leads.projectId,
      sourceChannel: sourceKey,
      scheduled: sql<number>`count(*) filter (where ${siteVisits.status} in ('SCHEDULED','CONFIRMED'))`.mapWith(Number),
      completed: sql<number>`count(*) filter (where ${siteVisits.status} = 'COMPLETED')`.mapWith(Number),
    }).from(siteVisits).innerJoin(leads, eq(siteVisits.leadId, leads._id)).groupBy(leads.projectId, sourceKey),
    db.select({
      projectId: ambassadorOsPropertyBookings.projectId,
      sourceChannel: sourceKey,
      verifiedSales: sql<number>`count(distinct ${ambassadorOsPropertyBookings.unitId}) filter (where ${ambassadorOsPropertyBookings.status} = 'SALE_VERIFIED')`.mapWith(Number),
    }).from(ambassadorOsPropertyBookings)
      .innerJoin(leads, eq(ambassadorOsPropertyBookings.leadId, leads._id))
      .groupBy(ambassadorOsPropertyBookings.projectId, sourceKey),
    db.select({
      campaignId: ambassadorOsChannelCosts.campaignId,
      sourceChannel: ambassadorOsChannelCosts.sourceChannel,
      cost: sql<number>`coalesce(sum(${ambassadorOsChannelCosts.amount}), 0)`.mapWith(Number),
    }).from(ambassadorOsChannelCosts).groupBy(ambassadorOsChannelCosts.campaignId, ambassadorOsChannelCosts.sourceChannel),
  ]);
  const leadMap = new Map(leadsByProject.map((row) => [row.projectId, row]));
  const visitMap = new Map(visitsByProject.map((row) => [row.projectId, row]));
  const bookingMap = new Map(bookingsByProject.map((row) => [row.projectId, row]));
  const commissionMap = new Map(commissionsByProject.map((row) => [row.projectId, row]));
  const ratio = (numerator: number, denominator: number) => denominator > 0 ? Math.round((numerator / denominator) * 1000) / 10 : null;
  const now = Date.now();
  const results = campaigns.map((campaign) => {
    const l = campaign.projectId ? leadMap.get(campaign.projectId) : undefined;
    const v = campaign.projectId ? visitMap.get(campaign.projectId) : undefined;
    const b = campaign.projectId ? bookingMap.get(campaign.projectId) : undefined;
    const commission = campaign.projectId ? commissionMap.get(campaign.projectId) : undefined;
    const start = campaign.startsAt ?? campaign.createdAt;
    const end = start.getTime() + campaign.targetDays * 86400000;
    const campaignDaysRemaining = campaign.status === "COMPLETED" ? 0 : Math.max(0, Math.ceil((end - now) / 86400000));
    const total = l?.total ?? 0;
    const contacted = l?.contacted ?? 0;
    const qualified = l?.qualified ?? 0;
    const visitsScheduled = v?.scheduled ?? 0;
    const visitsCompleted = v?.completed ?? 0;
    const bookingRecords = b?.total ?? 0;
    const verifiedSales = b?.verifiedSales ?? 0;
    const channels = leadsByChannel.filter((row) => row.projectId === campaign.projectId).map((row) => {
      const visit = visitsByChannel.find((item) => item.projectId === row.projectId && item.sourceChannel === row.sourceChannel);
      const sale = bookingsByChannel.find((item) => item.projectId === row.projectId && item.sourceChannel === row.sourceChannel);
      const campaignCost = costsByCampaignChannel.filter((cost) => cost.campaignId === campaign._id && cost.sourceChannel === row.sourceChannel).reduce((sum, cost) => sum + cost.cost, 0);
      return {
        sourceChannel: row.sourceChannel,
        cost: campaignCost,
        leads: row.total,
        qualifiedLeads: row.qualified,
        siteVisits: visit?.scheduled ?? 0,
        completedSiteVisits: visit?.completed ?? 0,
        verifiedSales: sale?.verifiedSales ?? 0,
        costPerQualifiedLead: row.qualified > 0 ? Math.round((campaignCost / row.qualified) * 100) / 100 : null,
      };
    });
    return {
      campaignId: campaign._id,
      campaignName: campaign.name,
      projectName: campaign.projectName,
      location: campaign.location,
      status: campaign.status,
      targetUnits: campaign.salesTarget,
      verifiedUnitsSold: verifiedSales,
      unitsRemaining: Math.max(0, campaign.salesTarget - verifiedSales),
      totalEnquiries: total,
      newEnquiries: l?.newLeads ?? 0,
      contacted,
      qualifiedLeads: qualified,
      lostLeads: l?.lost ?? 0,
      duplicateLeads: l?.duplicates ?? 0,
      ownershipDisputes: l?.ownershipDisputes ?? 0,
      siteVisitsScheduled: visitsScheduled,
      siteVisitsCompleted: visitsCompleted,
      cancelledSiteVisits: v?.cancelled ?? 0,
      bookingsPendingVerification: b?.pending ?? 0,
      verifiedBookings: b?.verified ?? 0,
      cancelledBookings: b?.cancelled ?? 0,
      totalBookingRecords: bookingRecords,
      campaignDaysRemaining,
      commissionEarned: commission?.total ?? 0,
      commissionPaid: commission?.paid ?? 0,
      conversion: {
        leadToContacted: ratio(contacted, total),
        contactedToQualified: ratio(qualified, contacted),
        qualifiedToVisitScheduled: ratio(visitsScheduled, qualified),
        scheduledToCompleted: ratio(visitsCompleted, visitsScheduled),
        completedToBooking: ratio(bookingRecords, visitsCompleted),
        bookingToVerifiedSale: ratio(verifiedSales, bookingRecords),
      },
      channels,
    };
  });
  const totals = results.reduce((a, r) => ({
    campaigns: a.campaigns + 1,
    targetUnits: a.targetUnits + r.targetUnits,
    verifiedUnitsSold: a.verifiedUnitsSold + r.verifiedUnitsSold,
    unitsRemaining: a.unitsRemaining + r.unitsRemaining,
    totalEnquiries: a.totalEnquiries + r.totalEnquiries,
    qualifiedLeads: a.qualifiedLeads + r.qualifiedLeads,
    siteVisitsScheduled: a.siteVisitsScheduled + r.siteVisitsScheduled,
    siteVisitsCompleted: a.siteVisitsCompleted + r.siteVisitsCompleted,
    bookingsPendingVerification: a.bookingsPendingVerification + r.bookingsPendingVerification,
    cancelledBookings: a.cancelledBookings + r.cancelledBookings,
    commissionEarned: a.commissionEarned + r.commissionEarned,
  }), { campaigns: 0, targetUnits: 0, verifiedUnitsSold: 0, unitsRemaining: 0, totalEnquiries: 0, qualifiedLeads: 0, siteVisitsScheduled: 0, siteVisitsCompleted: 0, bookingsPendingVerification: 0, cancelledBookings: 0, commissionEarned: 0 });
  res.json({ campaigns: results, totals, metricBasis: "Verified bookings marked SALE_VERIFIED; enquiry and funnel metrics derive from existing Truvi leads and site visits." });
});

router.get("/admin/sales-owners", requireOsStaffRole("SALES_COORDINATOR", "PROGRAM_MANAGER"), async (_req: AuthedRequest, res) => {
  const rows = await getDb().select({ userId: users._id, name: users.name, email: users.email, role: users.role })
    .from(users)
    .where(and(inArray(users.role, ["ADMIN", "CP", "DEVELOPER"]), eq(users.disabled, false)))
    .orderBy(users.name);
  res.json({ salesOwners: rows });
});

router.get("/admin/sales-pipeline", requireOsStaffRole("SALES_COORDINATOR", "PROGRAM_MANAGER"), async (_req: AuthedRequest, res) => {
  const db = getDb();
  const [leadRows, bookingRows, campaigns, costs] = await Promise.all([
    db.select({
      lead: leads,
      projectName: projects.name,
      unitNumber: units.unitNumber,
      submitterName: users.name,
      submitterEmail: users.email,
    }).from(leads)
      .innerJoin(projects, eq(leads.projectId, projects._id))
      .leftJoin(units, eq(leads.unitId, units._id))
      .leftJoin(users, eq(leads.submittedById, users._id))
      .orderBy(desc(leads.createdAt)).limit(500),
    db.select({
      booking: ambassadorOsPropertyBookings,
      leadNo: leads.leadNo,
      customerName: leads.clientName,
      sourceChannel: leads.sourceChannel,
      submittedById: leads.submittedById,
      projectName: projects.name,
      unitNumber: units.unitNumber,
      submitterName: users.name,
    }).from(ambassadorOsPropertyBookings)
      .innerJoin(leads, eq(ambassadorOsPropertyBookings.leadId, leads._id))
      .innerJoin(projects, eq(ambassadorOsPropertyBookings.projectId, projects._id))
      .leftJoin(units, eq(ambassadorOsPropertyBookings.unitId, units._id))
      .leftJoin(users, eq(leads.submittedById, users._id))
      .orderBy(desc(ambassadorOsPropertyBookings.createdAt)).limit(300),
    db.select().from(ambassadorOsCampaigns).orderBy(desc(ambassadorOsCampaigns.createdAt)),
    db.select().from(ambassadorOsChannelCosts).orderBy(desc(ambassadorOsChannelCosts.createdAt)).limit(500),
  ]);
  const [ambassadorProfiles] = await Promise.all([
    db.select({ userId: ambassadorOsProfiles.userId, ambassadorId: ambassadorOsProfiles.ambassadorNo, cityCode: ambassadorOsProfiles.cityCode }).from(ambassadorOsProfiles),
  ]);
  const ambassadorByUser = new Map(ambassadorProfiles.map((p) => [p.userId, p]));
  res.json({
    leads: leadRows.map((r) => ({
      ...r.lead,
      leadReference: r.lead.leadNo ? `TRV-L-${String(r.lead.leadNo).padStart(6, "0")}` : r.lead._id.slice(0, 8).toUpperCase(),
      projectName: r.projectName,
      unitNumber: r.unitNumber,
      submitterName: r.submitterName,
      submitterEmail: r.submitterEmail,
      ambassadorId: ambassadorByUser.has(r.lead.submittedById)
        ? `TRUVI-${ambassadorByUser.get(r.lead.submittedById)!.cityCode}-${String(ambassadorByUser.get(r.lead.submittedById)!.ambassadorId).padStart(4, "0")}`
        : null,
    })),
    bookings: bookingRows.map((r) => ({
      ...r.booking,
      leadReference: r.leadNo ? `TRV-L-${String(r.leadNo).padStart(6, "0")}` : r.booking.leadId.slice(0, 8).toUpperCase(),
      customerName: r.customerName,
      projectName: r.projectName,
      unitNumber: r.unitNumber,
      sourceChannel: r.sourceChannel,
      submitterName: r.submitterName,
    })),
    campaigns,
    channelCosts: costs,
  });
});

const adminLeadQualificationSchema = adminLeadReviewSchema.refine(
  (body) => Object.keys(body).some((key) => (body as Record<string, unknown>)[key] !== undefined),
  { message: "Provide at least one lead update" },
);

router.patch("/admin/leads/:id/review", requireOsStaffRole("SALES_COORDINATOR", "PROGRAM_MANAGER"), async (req: AuthedRequest, res) => {
  const parsed = adminLeadQualificationSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid lead review" });
  const db = getDb();
  const [lead] = await db.select().from(leads).where(eq(leads._id, String(req.params.id)));
  if (!lead) return res.status(404).json({ error: "Lead not found" });
  if (parsed.data.assignedToId) {
    const [assignee] = await db.select({ _id: users._id, role: users.role, disabled: users.disabled }).from(users).where(eq(users._id, parsed.data.assignedToId));
    if (!assignee || assignee.disabled || !["ADMIN", "CP", "DEVELOPER"].includes(assignee.role)) {
      return res.status(400).json({ error: "Select an active Admin, Channel Partner or Developer as sales owner" });
    }
  }
  const now = new Date();
  const nextStage = parsed.data.stage ?? lead.stage;
  const [updated] = await db.update(leads).set({
    ...("stage" in parsed.data ? { stage: nextStage } : {}),
    ...("assignedToId" in parsed.data ? { assignedToId: parsed.data.assignedToId ?? null } : {}),
    ...("budgetRange" in parsed.data ? { budgetRange: parsed.data.budgetRange || null } : {}),
    ...("purchasePurpose" in parsed.data ? { purchasePurpose: parsed.data.purchasePurpose } : {}),
    ...("preferredPlotSize" in parsed.data ? { preferredPlotSize: parsed.data.preferredPlotSize || null } : {}),
    ...("purchaseTimeline" in parsed.data ? { purchaseTimeline: parsed.data.purchaseTimeline } : {}),
    ...("sourceChannel" in parsed.data ? { sourceChannel: parsed.data.sourceChannel } : {}),
    ...("ownershipReviewStatus" in parsed.data ? {
      ownershipReviewStatus: parsed.data.ownershipReviewStatus,
      ownershipReviewedById: parsed.data.ownershipReviewStatus === "RESOLVED" ? req.user!.userId : lead.ownershipReviewedById,
      ownershipReviewedAt: parsed.data.ownershipReviewStatus === "RESOLVED" ? now : lead.ownershipReviewedAt,
    } : {}),
    ...("ownershipReviewNotes" in parsed.data ? { ownershipReviewNotes: parsed.data.ownershipReviewNotes || null } : {}),
    ...("nextFollowUpAt" in parsed.data ? { nextFollowUpAt: parsed.data.nextFollowUpAt ? new Date(parsed.data.nextFollowUpAt) : null } : {}),
    ...("lostReason" in parsed.data ? { lostReason: parsed.data.lostReason || null } : {}),
    contactAttemptedAt: ["CONTACTED", "INTERESTED", "SITE_VISIT", "NEGOTIATION", "BOOKING", "REGISTRATION", "COMPLETED"].includes(nextStage)
      ? (lead.contactAttemptedAt ?? now) : lead.contactAttemptedAt,
    qualifiedAt: ["INTERESTED", "SITE_VISIT", "NEGOTIATION", "BOOKING", "REGISTRATION", "COMPLETED"].includes(nextStage)
      ? (lead.qualifiedAt ?? now) : lead.qualifiedAt,
    updatedAt: now,
  }).where(eq(leads._id, lead._id)).returning();
  await db.insert(leadActivities).values({
    leadId: lead._id,
    cpId: (lead.assignedToId ?? lead.submittedById),
    type: "STAGE_CHANGE",
    content: "Lead reviewed by Truvi Admin.",
    metadata: { actorUserId: req.user!.userId, fromStage: lead.stage, toStage: nextStage, ownershipReviewStatus: updated.ownershipReviewStatus },
  }).catch(() => []);
  await logAudit({
    userId: req.user!.userId,
    action: "ambassador_os.lead.review",
    resourceType: "lead",
    resourceId: lead._id,
    metadata: { fromStage: lead.stage, toStage: nextStage, ownershipReviewStatus: updated.ownershipReviewStatus },
  });
  res.json({ lead: updated });
});

const createPropertyBookingSchema = z.object({
  leadId: z.string().uuid(),
  campaignId: z.string().uuid().optional().nullable(),
  bookingValue: z.number().positive().max(10_000_000_000),
  amountReceived: z.number().nonnegative().max(10_000_000_000).default(0),
  paymentMilestone: z.enum(["BOOKING_CONFIRMED", "TOKEN_RECEIVED", "AGREEMENT_SIGNED", "REGISTRATION_COMPLETED", "CUSTOM_MILESTONE"]).default("BOOKING_CONFIRMED"),
  paymentMilestoneNotes: z.string().trim().max(2000).optional(),
  agreementReference: z.string().trim().max(300).optional(),
  notes: z.string().trim().max(2000).optional(),
});

router.post("/admin/bookings", requireOsStaffRole("SALES_COORDINATOR", "PROGRAM_MANAGER"), async (req: AuthedRequest, res) => {
  const parsed = createPropertyBookingSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid property booking" });
  const db = getDb();
  const [lead] = await db.select().from(leads).where(eq(leads._id, parsed.data.leadId));
  if (!lead) return res.status(404).json({ error: "Lead not found" });
  if (lead.isDuplicate) return res.status(409).json({ error: "Duplicate leads cannot be booked until an authorized reviewer resolves ownership" });
  if (lead.ownershipReviewStatus === "OPEN" || lead.ownershipReviewStatus === "UNDER_REVIEW") {
    return res.status(409).json({ error: "Resolve the lead ownership review before recording a booking" });
  }
  if (lead.creatorRole !== "BUYER" && (!lead.contactConsent || !lead.contactConsentAt || !lead.consentTextVersion)) {
    return res.status(409).json({ error: "A third-party lead needs recorded customer contact consent before booking verification" });
  }
  if (!["NEGOTIATION", "BOOKING", "REGISTRATION", "COMPLETED"].includes(lead.stage)) {
    return res.status(409).json({ error: "Move the lead through qualification/site visit/negotiation before recording a booking" });
  }
  let campaign = null as (typeof ambassadorOsCampaigns.$inferSelect) | null;
  if (parsed.data.campaignId) {
    const [found] = await db.select().from(ambassadorOsCampaigns).where(eq(ambassadorOsCampaigns._id, parsed.data.campaignId));
    if (!found || found.projectId !== lead.projectId || found.status !== "ACTIVE" || !found.officialDataVerified) {
      return res.status(409).json({ error: "Choose an active, verified campaign for the lead's project" });
    }
    campaign = found;
  }
  const [existingBookings] = await Promise.all([
    db.select().from(ambassadorOsPropertyBookings).where(eq(ambassadorOsPropertyBookings.leadId, lead._id)),
  ]);
  if (existingBookings.some((b) => ["SUBMITTED", "UNDER_REVIEW", "VERIFIED", "SALE_VERIFIED", "REFUND_PENDING"].includes(b.status))) {
    return res.status(409).json({ error: "This lead already has an open or verified booking record" });
  }
  const reference = `TRUVI-BKG-${String(lead.leadNo ?? 0).padStart(6, "0")}-${Date.now().toString(36).toUpperCase()}`;
  const now = new Date();
  const booking = await db.transaction(async (tx) => {
    if (lead.unitId) {
      const [unit] = await tx.select().from(units).where(eq(units._id, lead.unitId)).for("update");
      if (!unit || unit.projectId !== lead.projectId) throw new Error("BOOKING_UNIT_PROJECT_MISMATCH");
      if (unit.status !== "AVAILABLE") throw new Error("BOOKING_UNIT_NOT_AVAILABLE");
    }
    const [created] = await tx.insert(ambassadorOsPropertyBookings).values({
      bookingReference: reference,
      leadId: lead._id,
      campaignId: campaign?._id ?? null,
      projectId: lead.projectId,
      unitId: lead.unitId,
      status: "SUBMITTED",
      bookingValue: parsed.data.bookingValue,
      amountReceived: parsed.data.amountReceived,
      paymentMilestone: parsed.data.paymentMilestone,
      paymentMilestoneNotes: parsed.data.paymentMilestoneNotes ?? null,
      agreementReference: parsed.data.agreementReference ?? null,
      sourceSnapshot: lead.sourceChannel ?? lead.source,
      notes: parsed.data.notes ?? null,
      createdById: req.user!.userId,
      updatedAt: now,
    }).returning();
    await tx.insert(ambassadorOsPropertyBookingHistory).values({
      bookingId: created._id, fromStatus: null, toStatus: "SUBMITTED",
      reason: "Booking record created by authorized Truvi Admin.",
      metadata: { leadId: lead._id, projectId: lead.projectId, campaignId: campaign?._id ?? null },
      actorUserId: req.user!.userId,
    });
    if (!["REGISTRATION", "COMPLETED"].includes(lead.stage)) {
      await tx.update(leads).set({ stage: "BOOKING", updatedAt: now }).where(eq(leads._id, lead._id));
    }
    return created;
  }).catch((error) => {
    if (error instanceof Error && error.message === "BOOKING_UNIT_NOT_AVAILABLE") return null;
    if (error instanceof Error && error.message === "BOOKING_UNIT_PROJECT_MISMATCH") return null;
    throw error;
  });
  if (!booking) return res.status(409).json({ error: "The linked inventory unit is unavailable or does not belong to this project" });
  await logAudit({ userId: req.user!.userId, action: "ambassador_os.booking.create", resourceType: "ambassador_os_property_booking", resourceId: booking._id, metadata: { bookingReference: booking.bookingReference, leadId: lead._id, campaignId: booking.campaignId, bookingValue: booking.bookingValue } });
  res.status(201).json({ booking });
});

const propertyBookingStatusSchema = z.object({
  status: z.enum(["UNDER_REVIEW", "VERIFIED", "SALE_VERIFIED", "REJECTED", "CANCELLED", "REFUND_PENDING", "REFUNDED"]),
  reason: z.string().trim().max(2000).optional(),
  amountReceived: z.number().nonnegative().max(10_000_000_000).optional(),
  paymentMilestone: z.enum(["BOOKING_CONFIRMED", "TOKEN_RECEIVED", "AGREEMENT_SIGNED", "REGISTRATION_COMPLETED", "CUSTOM_MILESTONE"]).optional(),
  paymentMilestoneNotes: z.string().trim().max(2000).optional(),
  agreementReference: z.string().trim().max(300).optional(),
  refundAmount: z.number().nonnegative().max(10_000_000_000).optional(),
  refundReference: z.string().trim().max(300).optional(),
});

const PROPERTY_BOOKING_TRANSITIONS: Record<string, string[]> = {
  SUBMITTED: ["UNDER_REVIEW", "REJECTED", "CANCELLED", "REFUND_PENDING"],
  UNDER_REVIEW: ["VERIFIED", "REJECTED", "CANCELLED", "REFUND_PENDING"],
  VERIFIED: ["SALE_VERIFIED", "CANCELLED", "REFUND_PENDING"],
  SALE_VERIFIED: ["REFUND_PENDING"],
  REFUND_PENDING: ["REFUNDED"],
  REJECTED: [],
  CANCELLED: [],
  REFUNDED: [],
};

router.patch("/admin/bookings/:id/status", requireOsStaffRole("SALES_COORDINATOR", "PROGRAM_MANAGER"), async (req: AuthedRequest, res) => {
  const parsed = propertyBookingStatusSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid booking status update" });
  const db = getDb();
  const [current] = await db.select().from(ambassadorOsPropertyBookings).where(eq(ambassadorOsPropertyBookings._id, String(req.params.id)));
  if (!current) return res.status(404).json({ error: "Booking not found" });
  if (!PROPERTY_BOOKING_TRANSITIONS[current.status]?.includes(parsed.data.status)) {
    return res.status(409).json({ error: `Invalid booking transition: ${current.status} → ${parsed.data.status}` });
  }
  const [lead] = await db.select().from(leads).where(eq(leads._id, current.leadId));
  if (!lead) return res.status(409).json({ error: "Booking's source lead no longer exists" });
  const now = new Date();
  const nextReceived = parsed.data.amountReceived ?? current.amountReceived;
  if (nextReceived > current.bookingValue) return res.status(400).json({ error: "Recorded amount received cannot exceed the approved booking value" });
  if (parsed.data.refundAmount !== undefined && parsed.data.refundAmount > nextReceived) {
    return res.status(400).json({ error: "Refund amount cannot exceed the recorded amount received" });
  }
  const milestone = parsed.data.paymentMilestone ?? current.paymentMilestone;
  const agreementReference = parsed.data.agreementReference ?? current.agreementReference;
  if (parsed.data.status === "VERIFIED") {
    const [project] = await db.select().from(projects).where(eq(projects._id, current.projectId));
    if (!project || project.approvalStatus !== "APPROVED" || !project.isVerified || !project.priceListUrl) {
      return res.status(409).json({ error: "The booking's project must remain approved, Truvi-verified and linked to its official price list" });
    }
    if (current.unitId) {
      const [unit] = await db.select().from(units).where(eq(units._id, current.unitId));
      if (!unit || unit.projectId !== current.projectId || !["AVAILABLE", "RESERVED"].includes(unit.status)) {
        return res.status(409).json({ error: "The linked unit is not available for booking verification" });
      }
      const live = await db.select().from(ambassadorOsPropertyBookings).where(eq(ambassadorOsPropertyBookings.unitId, current.unitId));
      if (live.some((b) => b._id !== current._id && ["VERIFIED", "SALE_VERIFIED", "REFUND_PENDING"].includes(b.status))) {
        return res.status(409).json({ error: "Another active booking already holds this unit" });
      }
    }
  }
  if (parsed.data.status === "SALE_VERIFIED") {
    if (!current.unitId) return res.status(409).json({ error: "A property unit must be linked before a booking can count as a verified unit sale" });
    if (milestone !== "REGISTRATION_COMPLETED" || !agreementReference?.trim()) {
      return res.status(409).json({ error: "Sale verification requires the Registration Completed milestone and an agreement/registration reference" });
    }
  }
  if (parsed.data.status === "REFUND_PENDING" && !parsed.data.reason?.trim()) {
    return res.status(400).json({ error: "Record the cancellation/refund reason" });
  }
  if (parsed.data.status === "REFUND_PENDING" && nextReceived <= 0) {
    return res.status(409).json({ error: "No funds are recorded as received. Cancel the booking without a refund instead." });
  }
  if (parsed.data.status === "CANCELLED" && nextReceived > 0) {
    return res.status(409).json({ error: "Money has been received. Move the booking to Refund Pending and record the refund receipt before closing it." });
  }
  if (parsed.data.status === "REFUNDED") {
    if (!parsed.data.refundReference?.trim()) return res.status(400).json({ error: "Refund receipt/reference is required" });
    const amount = parsed.data.refundAmount ?? current.amountReceived;
    if (amount < current.amountReceived) return res.status(409).json({ error: "The final refund must reconcile the full recorded received amount; record partial refunds in the notes first." });
  }
  const result = await db.transaction(async (tx) => {
    const [updated] = await tx.update(ambassadorOsPropertyBookings).set({
      status: parsed.data.status,
      amountReceived: nextReceived,
      paymentMilestone: milestone,
      paymentMilestoneNotes: parsed.data.paymentMilestoneNotes ?? current.paymentMilestoneNotes,
      agreementReference,
      verifiedById: parsed.data.status === "VERIFIED" ? req.user!.userId : current.verifiedById,
      verifiedAt: parsed.data.status === "VERIFIED" ? now : current.verifiedAt,
      rejectedById: parsed.data.status === "REJECTED" ? req.user!.userId : current.rejectedById,
      rejectedAt: parsed.data.status === "REJECTED" ? now : current.rejectedAt,
      rejectionReason: parsed.data.status === "REJECTED" ? (parsed.data.reason ?? current.rejectionReason) : current.rejectionReason,
      cancelledAt: ["CANCELLED", "REFUND_PENDING"].includes(parsed.data.status) ? (current.cancelledAt ?? now) : current.cancelledAt,
      cancellationReason: ["CANCELLED", "REFUND_PENDING"].includes(parsed.data.status) ? (parsed.data.reason ?? current.cancellationReason) : current.cancellationReason,
      refundStatus: parsed.data.status === "REFUNDED" ? "REFUNDED"
        : parsed.data.status === "REFUND_PENDING" ? ((parsed.data.refundAmount ?? current.refundAmount) > 0 && (parsed.data.refundAmount ?? current.refundAmount) < nextReceived ? "PARTIAL" : "PENDING")
        : current.refundStatus,
      refundAmount: parsed.data.refundAmount ?? (parsed.data.status === "REFUNDED" ? current.amountReceived : current.refundAmount),
      refundReference: parsed.data.refundReference ?? current.refundReference,
      updatedAt: now,
    }).where(and(eq(ambassadorOsPropertyBookings._id, current._id), eq(ambassadorOsPropertyBookings.status, current.status))).returning();
    if (!updated) return null;
    await tx.insert(ambassadorOsPropertyBookingHistory).values({
      bookingId: current._id, fromStatus: current.status, toStatus: updated.status,
      reason: parsed.data.reason ?? null,
      metadata: {
        amountReceived: updated.amountReceived, paymentMilestone: updated.paymentMilestone,
        agreementReference: updated.agreementReference, refundAmount: updated.refundAmount,
        refundReference: updated.refundReference,
      },
      actorUserId: req.user!.userId,
    });
    if (current.unitId && parsed.data.status === "VERIFIED") {
      await tx.update(units).set({ status: "RESERVED" }).where(eq(units._id, current.unitId));
    }
    if (current.unitId && parsed.data.status === "SALE_VERIFIED") {
      await tx.update(units).set({ status: "SOLD" }).where(eq(units._id, current.unitId));
      await tx.update(leads).set({ stage: "REGISTRATION", updatedAt: now }).where(eq(leads._id, current.leadId));
    }
    if (current.unitId && parsed.data.status === "CANCELLED" && current.status === "VERIFIED") {
      const allForUnit = await tx.select().from(ambassadorOsPropertyBookings).where(eq(ambassadorOsPropertyBookings.unitId, current.unitId));
      const otherActive = allForUnit.some((b) => b._id !== current._id && ["VERIFIED", "SALE_VERIFIED", "REFUND_PENDING"].includes(b.status));
      if (!otherActive) await tx.update(units).set({ status: "AVAILABLE", lockedByCPId: null, lockExpiresAt: null }).where(and(eq(units._id, current.unitId), eq(units.status, "RESERVED")));
      await tx.update(leads).set({ stage: "NEGOTIATION", updatedAt: now }).where(eq(leads._id, current.leadId));
    }
    if (current.unitId && parsed.data.status === "REFUNDED") {
      const allForUnit = await tx.select().from(ambassadorOsPropertyBookings).where(eq(ambassadorOsPropertyBookings.unitId, current.unitId));
      const otherActive = allForUnit.some((b) => b._id !== current._id && ["VERIFIED", "SALE_VERIFIED", "REFUND_PENDING"].includes(b.status));
      if (!otherActive) await tx.update(units).set({ status: "AVAILABLE", lockedByCPId: null, lockExpiresAt: null }).where(and(eq(units._id, current.unitId), or(eq(units.status, "RESERVED"), eq(units.status, "SOLD"))));
      await tx.update(leads).set({ stage: "NEGOTIATION", updatedAt: now }).where(eq(leads._id, current.leadId));
    }
    return updated;
  });
  if (!result) return res.status(409).json({ error: "The booking was changed by another administrator. Refresh before updating it." });

  // Keep the payout ledger consistent with the approved cancellation policy.
  // Unpaid incentives cannot remain payable after the sale is cancelled or a refund is open.
  const cancellationEvent = ["CANCELLED", "REFUND_PENDING", "REFUNDED"].includes(result.status);
  if (cancellationEvent) {
    const linkedIncentives = await db.select().from(ambassadorOsIncentives)
      .where(eq(ambassadorOsIncentives.propertyBookingId, result._id));
    const adminRows = await db.select({ userId: users._id }).from(users).where(eq(users.role, "ADMIN"));
    for (const incentive of linkedIncentives) {
      const [policy] = await db.select().from(ambassadorOsIncentivePolicies).where(eq(ambassadorOsIncentivePolicies._id, incentive.policyId));
      const treatment = policy?.cancellationTreatment ?? "MANUAL_REVIEW";
      if (incentive.status !== "PAID" && incentive.status !== "CANCELLED") {
        if (treatment === "MANUAL_REVIEW") {
          await db.update(ambassadorOsIncentives).set({
            status: "CANCELLED",
            recoveryStatus: "PENDING_REVIEW",
            recoveryAmount: incentive.amount,
          }).where(and(eq(ambassadorOsIncentives._id, incentive._id), eq(ambassadorOsIncentives.status, incentive.status)));
        } else {
          await db.update(ambassadorOsIncentives).set({
            status: "CANCELLED",
            recoveryStatus: "NOT_REQUIRED",
            recoveryAmount: 0,
          }).where(and(eq(ambassadorOsIncentives._id, incentive._id), eq(ambassadorOsIncentives.status, incentive.status)));
        }
        await logAudit({
          userId: req.user!.userId,
          action: "ambassador_os.incentive.cancel_on_booking_cancellation",
          resourceType: "ambassador_os_incentive",
          resourceId: incentive._id,
          metadata: { bookingId: result._id, previousStatus: incentive.status, treatment, recoveryStatus: treatment === "MANUAL_REVIEW" ? "PENDING_REVIEW" : "NOT_REQUIRED" },
        });
        await notifySafely([incentive.userId], {
          type: "ambassador_incentive_status",
          title: "Incentive paused after booking cancellation/refund",
          message: treatment === "MANUAL_REVIEW"
            ? "The linked property booking was cancelled or refunded. Finance review is required before any recovery is resolved."
            : "The linked property booking was cancelled or moved to refund review, so this unpaid incentive was cancelled under its approved policy.",
          data: { screen: "AmbassadorOperatingSystem", incentiveId: incentive._id, status: "CANCELLED" },
          actorUserId: req.user!.userId,
          priority: "high",
          dedupeKey: `${incentive._id}:booking-cancelled:${result.status}`,
        });
      } else if (incentive.status === "PAID" && treatment !== "CANCEL_INCENTIVE") {
        const recoveryStatus = treatment === "RECOVER_PAID" ? "RECOVERY_REQUIRED" : "PENDING_REVIEW";
        await db.update(ambassadorOsIncentives).set({
          recoveryStatus,
          recoveryAmount: incentive.amount,
        }).where(eq(ambassadorOsIncentives._id, incentive._id));
        await logAudit({
          userId: req.user!.userId,
          action: "ambassador_os.incentive.recovery_required",
          resourceType: "ambassador_os_incentive",
          resourceId: incentive._id,
          metadata: { bookingId: result._id, treatment, recoveryAmount: incentive.amount, recoveryStatus },
        });
        await notifySafely(adminRows.map((row) => row.userId), {
          type: "ambassador_incentive_recovery_review",
          title: "Finance review required for cancelled sale",
          message: `${result.bookingReference} was cancelled/refunded after the related incentive was paid. Review the policy's ${treatment.replace(/_/g, " ").toLowerCase()} rule.`,
          data: { screen: "AdminAmbassadorOperatingSystem", bookingId: result._id, incentiveId: incentive._id },
          actorUserId: req.user!.userId,
          priority: "high",
          dedupeKey: `${incentive._id}:recovery:${result.status}`,
        });
      }
    }
  }
  await logAudit({ userId: req.user!.userId, action: "ambassador_os.booking.status", resourceType: "ambassador_os_property_booking", resourceId: current._id, metadata: { bookingReference: current.bookingReference, from: current.status, to: result.status, reason: parsed.data.reason ?? null } });
  const recipients = [lead.submittedById, ...((lead.referralChain ?? []).map((r) => r.userId))].filter((id, index, all) => Boolean(id) && all.indexOf(id) === index);
  await notifySafely(recipients, {
    type: "ambassador_booking_status",
    title: "Property booking status updated",
    message: `${result.bookingReference}: ${result.status.replace(/_/g, " ").toLowerCase()}`,
    data: { screen: "AmbassadorOperatingSystem", bookingId: result._id, status: result.status },
    actorUserId: req.user!.userId,
    priority: ["SALE_VERIFIED", "REFUND_PENDING", "REFUNDED"].includes(result.status) ? "high" : "normal",
    dedupeKey: `${result._id}:${result.status}`,
  });
  res.json({ booking: result });
});

router.get("/admin/booking-history/:id", requireOsStaffRole("SALES_COORDINATOR", "PROGRAM_MANAGER"), async (req: AuthedRequest, res) => {
  const rows = await getDb().select().from(ambassadorOsPropertyBookingHistory)
    .where(eq(ambassadorOsPropertyBookingHistory.bookingId, String(req.params.id)))
    .orderBy(desc(ambassadorOsPropertyBookingHistory.createdAt));
  res.json({ history: rows });
});

router.get("/admin/overview", requireRole("ADMIN"), async (_req: AuthedRequest, res) => {
  const db = getDb();
  // Make sure existing Ambassador accounts appear in the directory even if they
  // have not visited the new workspace yet. Bulk insert is additive and race-safe.
  const ambassadorUsers = await db.select({ userId: users._id }).from(users).where(eq(users.role, "AMBASSADOR"));
  const existingProfiles = await db.select({ userId: ambassadorOsProfiles.userId }).from(ambassadorOsProfiles);
  const existingProfileIds = new Set(existingProfiles.map((row) => row.userId));
  const missingProfiles = ambassadorUsers.filter((row) => !existingProfileIds.has(row.userId));
  if (missingProfiles.length) {
    await db.insert(ambassadorOsProfiles).values(missingProfiles.map((row) => ({ userId: row.userId }))).onConflictDoNothing();
  }
  const [profiles, progress, tasks, campaigns, policies, incentives, registeredLeadRows] = await Promise.all([
    db.select({ profile: ambassadorOsProfiles, name: users.name, email: users.email, onboardingVerified: users.onboardingVerified }).from(ambassadorOsProfiles).innerJoin(users, eq(ambassadorOsProfiles.userId, users._id)).orderBy(desc(ambassadorOsProfiles.createdAt)),
    db.select({ progress: ambassadorOsTrainingProgress, name: users.name, email: users.email }).from(ambassadorOsTrainingProgress).innerJoin(users, eq(ambassadorOsTrainingProgress.userId, users._id)).orderBy(desc(ambassadorOsTrainingProgress.updatedAt)),
    db.select({ task: ambassadorOsTasks, ambassadorName: users.name }).from(ambassadorOsTasks).innerJoin(users, eq(ambassadorOsTasks.assignedToId, users._id)).orderBy(desc(ambassadorOsTasks.createdAt)),
    db.select().from(ambassadorOsCampaigns).orderBy(desc(ambassadorOsCampaigns.createdAt)),
    db.select().from(ambassadorOsIncentivePolicies).orderBy(desc(ambassadorOsIncentivePolicies.createdAt)),
    db.select({ incentive: ambassadorOsIncentives, ambassadorName: users.name, ambassadorEmail: users.email }).from(ambassadorOsIncentives).innerJoin(users, eq(ambassadorOsIncentives.userId, users._id)).orderBy(desc(ambassadorOsIncentives.createdAt)),
    db.select({ submittedById: leads.submittedById, referralChain: leads.referralChain, projectId: leads.projectId, isDuplicate: leads.isDuplicate }).from(leads).where(or(eq(leads.stage, "REGISTRATION"), eq(leads.stage, "COMPLETED"))),
  ]);
  const ambassadorIds = new Set(profiles.map((row) => row.profile.userId));
  const registeredSales = registeredLeadRows.filter((lead) => !lead.isDuplicate && (ambassadorIds.has(lead.submittedById) || (lead.referralChain ?? []).some((referral) => ambassadorIds.has(referral.userId)))).length;
  res.json({
    profiles: profiles.map((row) => ({ ...row, profile: displayProfile(row.profile) })),
    trainingReviews: progress.filter((row) => row.progress.status === "ASSESSMENT_PENDING" || row.progress.status === "RETAKE_REQUIRED").map((row) => ({ ...row.progress, ambassadorName: row.name, ambassadorEmail: row.email })),
    tasks: tasks.map((row) => ({ ...row.task, ambassadorName: row.ambassadorName })),
    campaigns: campaigns.map((campaign) => ({
      ...campaign,
      verifiedSales: registeredLeadRows.filter((lead) => lead.projectId === campaign.projectId && !lead.isDuplicate).length,
    })),
    policies,
    incentives: incentives.map((row) => ({ ...row.incentive, ambassadorName: row.ambassadorName, ambassadorEmail: row.ambassadorEmail })),
    stats: {
      ambassadors: profiles.length,
      awaitingAssessment: progress.filter((row) => row.progress.status === "ASSESSMENT_PENDING").length,
      assignedTasks: tasks.length,
      submittedTasks: tasks.filter((row) => row.task.status === "SUBMITTED").length,
      activeCampaigns: campaigns.filter((c) => c.status === "ACTIVE").length,
      pendingIncentives: incentives.filter((row) => ["PENDING", "APPROVED", "PAYABLE"].includes(row.incentive.status)).length,
      registeredSales,
    },
  });
});

const reviewSchema = z.object({
  practicalStatus: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional(),
  ethicsStatus: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional(),
  attendanceStatus: z.enum(["NOT_RECORDED", "PRESENT", "ABSENT", "EXCUSED"]).optional(),
  realEstateKnowledgeScore: z.number().int().min(0).max(20).optional(),
  projectKnowledgeScore: z.number().int().min(0).max(20).optional(),
  customerCommunicationScore: z.number().int().min(0).max(20).optional(),
  marketingKnowledgeScore: z.number().int().min(0).max(20).optional(),
  ethicsComplianceScore: z.number().int().min(0).max(20).optional(),
  trainerFeedback: z.string().trim().max(2000).optional(),
});

router.patch("/admin/training/:userId/:day/review", requireOsStaffRole("TRAINING_COORDINATOR"), async (req: AuthedRequest, res) => {
  const day = Number(String(req.params.day));
  if (!Number.isInteger(day) || day < 1 || day > 7) return res.status(400).json({ error: "Training day must be between 1 and 7" });
  const parsed = reviewSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid review" });
  const db = getDb();
  const [current] = await db.select().from(ambassadorOsTrainingProgress).where(and(eq(ambassadorOsTrainingProgress.userId, String(req.params.userId)), eq(ambassadorOsTrainingProgress.day, day)));
  if (!current) return res.status(404).json({ error: "Training submission not found" });
  const practicalStatus = parsed.data.practicalStatus ?? current.practicalStatus;
  const ethicsStatus = parsed.data.ethicsStatus ?? current.ethicsStatus;
  const attendanceStatus = parsed.data.attendanceStatus ?? current.attendanceStatus;
  const rubric = {
    realEstateKnowledgeScore: parsed.data.realEstateKnowledgeScore ?? current.realEstateKnowledgeScore,
    projectKnowledgeScore: parsed.data.projectKnowledgeScore ?? current.projectKnowledgeScore,
    customerCommunicationScore: parsed.data.customerCommunicationScore ?? current.customerCommunicationScore,
    marketingKnowledgeScore: parsed.data.marketingKnowledgeScore ?? current.marketingKnowledgeScore,
    ethicsComplianceScore: parsed.data.ethicsComplianceScore ?? current.ethicsComplianceScore,
  };
  const rubricValues = Object.values(rubric);
  const rubricComplete = rubricValues.every((score) => typeof score === "number" && score >= 0 && score <= 20);
  const rubricTotal = rubricComplete ? rubricValues.reduce<number>((sum, score) => sum + (score ?? 0), 0) : 0;
  const rubricPassed = day !== 7 || (rubricComplete && rubricTotal >= 80);
  const attendancePassed = attendanceStatus === "PRESENT" || attendanceStatus === "EXCUSED";
  const assessmentPassed = isTrainingDayComplete(current.quizScore, practicalStatus, ethicsStatus);
  const canComplete = assessmentPassed && attendancePassed && rubricPassed;
  const needsRetake = current.quizScore < 80 || practicalStatus === "REJECTED" || ethicsStatus === "REJECTED" || attendanceStatus === "ABSENT" || (day === 7 && rubricComplete && rubricTotal < 80);
  const status = canComplete ? "COMPLETED" as const : (needsRetake ? "RETAKE_REQUIRED" as const : "ASSESSMENT_PENDING" as const);
  const now = new Date();
  const [updated] = await db.update(ambassadorOsTrainingProgress).set({
    practicalStatus, ethicsStatus, attendanceStatus,
    ...rubric,
    trainerFeedback: parsed.data.trainerFeedback ?? current.trainerFeedback,
    status, reviewedById: req.user!.userId, reviewedAt: now, completedAt: canComplete ? (current.completedAt ?? now) : null, updatedAt: now,
  }).where(eq(ambassadorOsTrainingProgress._id, current._id)).returning();
  const profile = await ensureProfile(String(req.params.userId));
  const all = await db.select().from(ambassadorOsTrainingProgress).where(eq(ambassadorOsTrainingProgress.userId, String(req.params.userId)));
  const allComplete = hasCompleteSevenDayCurriculum(all);
  const completedDaySeven = allComplete;
  const certificateNo = completedDaySeven
    ? (profile.certificateNo ?? `TRUVI-CERT-${String(profile.ambassadorNo).padStart(6, "0")}`)
    : null;
  const nextProfileStatus = statusAfterTrainingReview({
    currentStatus: profile.status,
    allTrainingComplete: allComplete,
    reviewedDayComplete: canComplete,
  });
  await db.update(ambassadorOsProfiles).set({
    status: nextProfileStatus,
    certificateNo,
    certifiedAt: completedDaySeven ? (profile.certifiedAt ?? now) : null,
    certifiedById: completedDaySeven ? (profile.certifiedById ?? req.user!.userId) : null,
    updatedAt: now,
  }).where(eq(ambassadorOsProfiles.userId, String(req.params.userId)));
  await logAudit({ userId: req.user!.userId, action: "ambassador_os.training.review", resourceType: "ambassador_os_training", resourceId: updated._id, metadata: { ambassadorId: displayProfile(profile).ambassadorId, day, status, practicalStatus, ethicsStatus } });
  await notifySafely([String(req.params.userId)], {
    type: "ambassador_training_reviewed",
    title: status === "COMPLETED" ? "Training module approved" : "Training review updated",
    message: status === "COMPLETED"
      ? `Day ${day} is approved. ${day === 7 ? "Your internal certificate is now available." : "You can continue to the next module."}`
      : `Day ${day} needs your attention. Review the trainer feedback and next steps in your Ambassador workspace.`,
    data: { screen: "AmbassadorOperatingSystem", day, status },
    actorUserId: req.user!.userId,
    priority: status === "RETAKE_REQUIRED" ? "high" : "normal",
    dedupeKey: `${updated._id}:${status}:${now.toISOString()}`,
  });
  res.json({ progress: updated });
});

const statusSchema = z.object({
  status: z.enum(["REGISTERED", "VERIFICATION_PENDING", "TRAINING_IN_PROGRESS", "ASSESSMENT_PENDING", "CERTIFIED", "ACTIVE", "TEMPORARILY_INACTIVE", "SUSPENDED", "EXITED"]).optional(),
  currentLevel: z.enum(["L0", "L1", "L2", "L3", "L4", "L5", "L6"]).optional(),
  promotionReason: z.string().trim().min(5).max(2000).optional(),
}).refine((body) => body.status !== undefined || body.currentLevel !== undefined, { message: "Provide a status or career level" })
  .refine((body) => body.currentLevel === undefined || Boolean(body.promotionReason?.trim()), { message: "A promotion reason is required for every career-level change" });

router.patch("/admin/profiles/:userId", requireOsStaffRole("PROGRAM_MANAGER"), async (req: AuthedRequest, res) => {
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid profile update" });
  const db = getDb();
  const [profile] = await db.select().from(ambassadorOsProfiles).where(eq(ambassadorOsProfiles.userId, String(req.params.userId)));
  if (!profile) return res.status(404).json({ error: "Ambassador profile not found" });
  const [account] = await db.select().from(users).where(eq(users._id, profile.userId));
  const training = await db.select().from(ambassadorOsTrainingProgress).where(eq(ambassadorOsTrainingProgress.userId, profile.userId));
  const { promotionReason, ...updates } = parsed.data;
  const currentLevelNumber = Number(profile.currentLevel.slice(1));

  if (parsed.data.currentLevel && parsed.data.currentLevel !== profile.currentLevel) {
    const levelNumber = Number(parsed.data.currentLevel.slice(1));
    if (levelNumber !== currentLevelNumber + 1) {
      return res.status(409).json({ error: "Career levels must be approved sequentially. Complete the next level's requirements before skipping a level." });
    }
    if (levelNumber >= 1 && !hasCompleteSevenDayCurriculum(training)) {
      return res.status(409).json({ error: "Complete all seven modules and receive written, practical and ethics approval before promotion to L1 or above" });
    }
    if (levelNumber >= 2 && profile.status !== "ACTIVE" && parsed.data.status !== "ACTIVE") {
      return res.status(409).json({ error: "Formal activation is required before promotion to L2 or above" });
    }
    if (levelNumber >= 3) {
      const [latestReview] = await db.select().from(ambassadorOsPerformanceReviews)
        .where(eq(ambassadorOsPerformanceReviews.ambassadorId, profile.userId))
        .orderBy(desc(ambassadorOsPerformanceReviews.periodEnd)).limit(1);
      if (!latestReview || latestReview.seriousMisconduct || latestReview.customerCommunicationScore < 70) {
        return res.status(409).json({ error: "L3 promotion requires a recent approved customer-communication review scoring at least 70/100 with no serious misconduct finding" });
      }
      const attributed = await db.select({
        booking: ambassadorOsPropertyBookings,
        leadSubmittedById: leads.submittedById,
        referralChain: leads.referralChain,
        isDuplicate: leads.isDuplicate,
      }).from(ambassadorOsPropertyBookings)
        .innerJoin(leads, eq(ambassadorOsPropertyBookings.leadId, leads._id))
        .where(eq(ambassadorOsPropertyBookings.status, "SALE_VERIFIED"));
      const hasSale = attributed.some((row) =>
        !row.isDuplicate &&
        (row.leadSubmittedById === profile.userId || (row.referralChain ?? []).some((referral) => referral.userId === profile.userId))
      );
      if (!hasSale) return res.status(409).json({ error: "L3 requires at least one authorized SALE_VERIFIED property booking attributed to this Ambassador" });
    }
    if (levelNumber === 4) {
      const cutoff = new Date(Date.now() - 180 * 86400000);
      const reviews = await db.select().from(ambassadorOsPerformanceReviews)
        .where(and(eq(ambassadorOsPerformanceReviews.ambassadorId, profile.userId), sql`${ambassadorOsPerformanceReviews.periodEnd} >= ${cutoff}`))
        .orderBy(desc(ambassadorOsPerformanceReviews.periodEnd));
      const consistent = reviews.filter((review) => review.weightedScore >= 75 && !review.seriousMisconduct).length >= 2;
      const [mentoring] = await db.select().from(ambassadorOsCareerAssessments)
        .where(and(
          eq(ambassadorOsCareerAssessments.ambassadorId, profile.userId),
          eq(ambassadorOsCareerAssessments.targetLevel, "L4"),
          eq(ambassadorOsCareerAssessments.assessmentType, "MENTORING"),
          eq(ambassadorOsCareerAssessments.passed, true),
        )).orderBy(desc(ambassadorOsCareerAssessments.reviewedAt)).limit(1);
      if (!consistent || !mentoring) return res.status(409).json({ error: "L4 requires two performance reviews scoring 75/100 or higher within six months, no serious misconduct, and a passed mentoring assessment with recorded evidence" });
    }
    if (levelNumber === 5) {
      const [teamAssessment] = await db.select().from(ambassadorOsCareerAssessments)
        .where(and(
          eq(ambassadorOsCareerAssessments.ambassadorId, profile.userId),
          eq(ambassadorOsCareerAssessments.targetLevel, "L5"),
          eq(ambassadorOsCareerAssessments.assessmentType, "TEAM_MANAGEMENT"),
          eq(ambassadorOsCareerAssessments.passed, true),
        )).orderBy(desc(ambassadorOsCareerAssessments.reviewedAt)).limit(1);
      if (profile.currentLevel !== "L4" || !teamAssessment) return res.status(409).json({ error: "L5 requires L4 status and a passed team-management assessment with evidence recorded by Admin" });
    }
    if (levelNumber === 6) {
      const [advancedAssessment] = await db.select().from(ambassadorOsCareerAssessments)
        .where(and(
          eq(ambassadorOsCareerAssessments.ambassadorId, profile.userId),
          eq(ambassadorOsCareerAssessments.targetLevel, "L6"),
          eq(ambassadorOsCareerAssessments.assessmentType, "ADVANCED"),
          eq(ambassadorOsCareerAssessments.passed, true),
        )).orderBy(desc(ambassadorOsCareerAssessments.reviewedAt)).limit(1);
      const [selectedEligibleOpportunity] = await db.select({ applicationId: ambassadorOsCareerApplications._id })
        .from(ambassadorOsCareerApplications)
        .innerJoin(ambassadorOsCareerOpportunities, eq(ambassadorOsCareerApplications.opportunityId, ambassadorOsCareerOpportunities._id))
        .where(and(
          eq(ambassadorOsCareerApplications.ambassadorId, profile.userId),
          eq(ambassadorOsCareerApplications.status, "SELECTED"),
          eq(ambassadorOsCareerOpportunities.targetLevel, "L6"),
        )).limit(1);
      if (profile.currentLevel !== "L5" || !advancedAssessment || !selectedEligibleOpportunity) {
        return res.status(409).json({ error: "L6 requires L5 status, a passed advanced assessment, and a selected application for an eligible L6 opportunity" });
      }
    }
  }
  if (parsed.data.status === "ACTIVE") {
    if (!canActivateAmbassador({
      termsAccepted: Boolean(profile.termsAcceptedAt),
      identityVerified: Boolean(account?.onboardingVerified),
      finalDayComplete: hasCompleteSevenDayCurriculum(training),
    })) {
      return res.status(409).json({ error: "Activation requires accepted terms, verified onboarding, and completed seven-day certification" });
    }
  }
  if (parsed.data.status === "CERTIFIED" && !hasCompleteSevenDayCurriculum(training)) {
    return res.status(409).json({ error: "Certification requires all seven modules, quiz, practical and ethics approvals" });
  }
  const [updated] = await db.update(ambassadorOsProfiles).set({ ...updates, updatedAt: new Date() }).where(eq(ambassadorOsProfiles.userId, profile.userId)).returning();
  await logAudit({ userId: req.user!.userId, action: "ambassador_os.profile.admin_update", resourceType: "ambassador_os_profile", resourceId: updated._id, metadata: { ...updates, promotionReason: promotionReason ?? null } });
  if (updated.status !== profile.status) {
    await notifySafely([profile.userId], {
      type: "ambassador_status_updated",
      title: "Ambassador account status updated",
      message: `Your Ambassador program status is now ${updated.status.replace(/_/g, " ").toLowerCase()}.`,
      data: { screen: "AmbassadorOperatingSystem", status: updated.status },
      actorUserId: req.user!.userId,
      priority: ["SUSPENDED", "EXITED"].includes(updated.status) ? "high" : "normal",
      dedupeKey: `${updated._id}:${updated.status}`,
    });
  }
  res.json({ profile: displayProfile(updated) });
});

const createTaskSchema = z.object({
  title: z.string().trim().min(3).max(180),
  category: z.enum(["TRAINING", "SALES", "MARKETING", "LEAD_MANAGEMENT", "SITE_VISIT", "RESEARCH", "VERIFICATION"]),
  description: z.string().trim().min(5).max(5000),
  assignedToId: z.string().uuid(),
  dueAt: z.string().datetime().optional(),
  campaignId: z.string().uuid().optional(),
});

router.get("/admin/tasks", requireOsStaffRole("PROGRAM_MANAGER", "SALES_COORDINATOR", "TRAINING_COORDINATOR"), async (_req: AuthedRequest, res) => {
  const rows = await getDb().select({ task: ambassadorOsTasks, ambassadorName: users.name, ambassadorEmail: users.email }).from(ambassadorOsTasks).innerJoin(users, eq(ambassadorOsTasks.assignedToId, users._id)).orderBy(desc(ambassadorOsTasks.createdAt));
  res.json({ tasks: rows.map((row) => ({ ...row.task, ambassadorName: row.ambassadorName, ambassadorEmail: row.ambassadorEmail })) });
});

router.post("/admin/tasks", requireOsStaffRole("PROGRAM_MANAGER", "SALES_COORDINATOR", "TRAINING_COORDINATOR"), async (req: AuthedRequest, res) => {
  const parsed = createTaskSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid task" });
  const db = getDb();
  const [assignee] = await db.select().from(users).where(eq(users._id, parsed.data.assignedToId));
  if (!assignee || assignee.role !== "AMBASSADOR") return res.status(400).json({ error: "Task assignee must be an existing Ambassador account" });
  if (parsed.data.campaignId) {
    const [campaign] = await db.select({ _id: ambassadorOsCampaigns._id }).from(ambassadorOsCampaigns).where(eq(ambassadorOsCampaigns._id, parsed.data.campaignId));
    if (!campaign) return res.status(404).json({ error: "Selected Ambassador campaign not found" });
  }
  const [task] = await db.insert(ambassadorOsTasks).values({
    title: parsed.data.title, category: parsed.data.category, description: parsed.data.description,
    assignedToId: parsed.data.assignedToId, dueAt: parsed.data.dueAt ? new Date(parsed.data.dueAt) : null,
    campaignId: parsed.data.campaignId ?? null, createdById: req.user!.userId,
  }).returning();
  await logAudit({ userId: req.user!.userId, action: "ambassador_os.task.create", resourceType: "ambassador_os_task", resourceId: task._id, metadata: { title: task.title, category: task.category, assignedToId: task.assignedToId } });
  await notifySafely([assignee._id], {
    type: "ambassador_task_assigned",
    title: "New Ambassador task assigned",
    message: `You have a new task: ${task.title}`,
    data: { screen: "AmbassadorOperatingSystem", taskId: task._id },
    actorUserId: req.user!.userId,
    priority: "normal",
    dedupeKey: task._id,
  });
  res.status(201).json({ task });
});

const taskReviewSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED", "CLOSED"]),
  reviewReason: z.string().trim().max(2000).optional(),
});

router.patch("/admin/tasks/:id/review", requireOsStaffRole("PROGRAM_MANAGER", "SALES_COORDINATOR", "TRAINING_COORDINATOR"), async (req: AuthedRequest, res) => {
  const parsed = taskReviewSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid task review" });
  const db = getDb();
  const [task] = await db.select().from(ambassadorOsTasks).where(eq(ambassadorOsTasks._id, String(req.params.id)));
  if (!task) return res.status(404).json({ error: "Task not found" });
  if (parsed.data.status !== "CLOSED" && task.status !== "SUBMITTED") return res.status(409).json({ error: "Only submitted tasks can be approved or rejected" });
  if (parsed.data.status === "REJECTED" && !parsed.data.reviewReason?.trim()) return res.status(400).json({ error: "A rejection reason is required" });
  const now = new Date();
  const [updated] = await db.update(ambassadorOsTasks).set({
    status: parsed.data.status,
    reviewReason: parsed.data.reviewReason ?? null,
    reviewedById: req.user!.userId,
    reviewedAt: now,
    completedAt: parsed.data.status === "APPROVED" ? now : null,
  }).where(and(eq(ambassadorOsTasks._id, task._id), eq(ambassadorOsTasks.status, task.status))).returning();
  if (!updated) return res.status(409).json({ error: "The task was changed by another reviewer. Refresh and review the latest status." });
  await logAudit({ userId: req.user!.userId, action: "ambassador_os.task.review", resourceType: "ambassador_os_task", resourceId: updated._id, metadata: { status: updated.status, reviewReason: updated.reviewReason } });
  await notifySafely([task.assignedToId], {
    type: "ambassador_task_reviewed",
    title: updated.status === "APPROVED" ? "Ambassador task approved" : "Ambassador task review updated",
    message: updated.status === "REJECTED"
      ? `The task "${updated.title}" needs changes: ${updated.reviewReason}`
      : updated.status === "APPROVED"
        ? `The task "${updated.title}" has been approved.`
        : `The task "${updated.title}" was closed by the program team.`,
    data: { screen: "AmbassadorOperatingSystem", taskId: updated._id, status: updated.status },
    actorUserId: req.user!.userId,
    priority: updated.status === "REJECTED" ? "high" : "normal",
    dedupeKey: `${updated._id}:${updated.status}:${now.toISOString()}`,
  });
  res.json({ task: updated });
});

const campaignSchema = z.object({
  name: z.string().trim().min(3).max(180),
  projectId: z.string().uuid().optional(),
  projectName: z.string().trim().min(2).max(180),
  location: z.string().trim().min(2).max(180),
  targetInventory: z.number().int().positive().max(1_000_000),
  salesTarget: z.number().int().positive().max(1_000_000).optional(),
  unitAreaSqFt: z.number().int().positive().max(1_000_000),
  targetDays: z.number().int().positive().max(3650),
  startsAt: z.string().datetime().optional(),
  officialDataNotes: z.string().trim().max(2000).optional(),
});

router.get("/campaigns", async (req: AuthedRequest, res) => {
  const db = getDb();
  if (req.user!.role === "ADMIN") {
    const rows = await db.select().from(ambassadorOsCampaigns).orderBy(desc(ambassadorOsCampaigns.createdAt));
    return res.json({ campaigns: rows });
  }
  if (req.user!.role !== "AMBASSADOR") return res.status(403).json({ error: "Ambassadors only" });
  const rows = await db.select().from(ambassadorOsCampaigns)
    .where(and(eq(ambassadorOsCampaigns.status, "ACTIVE"), eq(ambassadorOsCampaigns.officialDataVerified, true)))
    .orderBy(desc(ambassadorOsCampaigns.createdAt));
  if (rows.length === 0) return res.json({ campaigns: [] });
  const campaignIds = rows.map((row) => row._id);
  const [guidelines, acknowledgements] = await Promise.all([
    db.select().from(ambassadorOsCampaignGuidelines).where(inArray(ambassadorOsCampaignGuidelines.campaignId, campaignIds)),
    db.select().from(ambassadorOsCampaignAcknowledgements).where(eq(ambassadorOsCampaignAcknowledgements.ambassadorId, req.user!.userId)),
  ]);
  const campaigns = rows.map((campaign) => {
    const latest = guidelines.filter((item) => item.campaignId === campaign._id).sort((a, b) => b.version - a.version)[0];
    const acknowledged = latest && acknowledgements.some((item) => item.campaignId === campaign._id && item.guidelineVersion === latest.version);
    return { ...campaign, marketingGuidelines: latest ? { version: latest.version, content: latest.content, publishedAt: latest.publishedAt, approvalReference: latest.approvalReference } : null, guidelinesAcknowledged: Boolean(acknowledged) };
  });
  res.json({ campaigns });
});

router.post("/admin/campaigns", requireOsStaffRole("PROGRAM_MANAGER"), async (req: AuthedRequest, res) => {
  const parsed = campaignSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid campaign" });
  const db = getDb();
  const linkedProject = parsed.data.projectId
    ? (await db.select().from(projects).where(eq(projects._id, parsed.data.projectId)))[0]
    : undefined;
  if (parsed.data.projectId && !linkedProject) return res.status(404).json({ error: "Linked Truvi project not found" });
  const [campaign] = await db.insert(ambassadorOsCampaigns).values({
    ...parsed.data,
    salesTarget: parsed.data.salesTarget ?? parsed.data.targetInventory,
    projectId: linkedProject?._id ?? null,
    projectName: linkedProject?.name ?? parsed.data.projectName,
    location: linkedProject ? `${linkedProject.location}, ${linkedProject.city}` : parsed.data.location,
    startsAt: parsed.data.startsAt ? new Date(parsed.data.startsAt) : null,
    createdById: req.user!.userId, status: "PLANNED", officialDataVerified: false,
  }).returning();
  await logAudit({ userId: req.user!.userId, action: "ambassador_os.campaign.create", resourceType: "ambassador_os_campaign", resourceId: campaign._id, metadata: { name: campaign.name, targetInventory: campaign.targetInventory } });
  res.status(201).json({ campaign });
});

const campaignUpdateSchema = z.object({
  projectId: z.string().uuid().optional(),
  status: z.enum(["PLANNED", "ACTIVE", "PAUSED", "COMPLETED"]).optional(),
  officialDataVerified: z.boolean().optional(),
  officialDataNotes: z.string().trim().max(2000).optional(),
});

router.patch("/admin/campaigns/:id", requireOsStaffRole("PROGRAM_MANAGER"), async (req: AuthedRequest, res) => {
  const parsed = campaignUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid campaign update" });
  const db = getDb();
  const [current] = await db.select().from(ambassadorOsCampaigns).where(eq(ambassadorOsCampaigns._id, String(req.params.id)));
  if (!current) return res.status(404).json({ error: "Campaign not found" });
  const projectId = parsed.data.projectId ?? current.projectId;
  const effectiveStatus = parsed.data.status ?? current.status;
  if (effectiveStatus === "ACTIVE" && current.startsAt && current.startsAt.getTime() > Date.now()) {
    return res.status(409).json({ error: "This campaign's configured start date is in the future." });
  }
  const isBeingPublished = effectiveStatus === "ACTIVE" || parsed.data.officialDataVerified === true;
  if ((parsed.data.status ?? current.status) === "ACTIVE" && !(parsed.data.officialDataVerified ?? current.officialDataVerified)) {
    return res.status(409).json({ error: "Verify official project, legal, pricing and inventory information before activating a campaign" });
  }
  if (isBeingPublished) {
    if (!projectId) return res.status(409).json({ error: "Link this campaign to an existing Truvi project before verification or activation" });
    const [project] = await db.select().from(projects).where(eq(projects._id, projectId));
    if (!project) return res.status(404).json({ error: "Linked Truvi project not found" });
    if (project.approvalStatus !== "APPROVED" || !project.isVerified) {
      return res.status(409).json({ error: "The linked project must be admin-approved and Truvi-verified before this campaign can be published" });
    }
    if (!project.priceListUrl) return res.status(409).json({ error: "The linked project needs an official price list before the campaign can be published" });
    const availableUnits = await db.select({ _id: units._id }).from(units).where(and(eq(units.projectId, projectId), eq(units.status, "AVAILABLE")));
    if (availableUnits.length < current.targetInventory) {
      return res.status(409).json({ error: `The campaign target is ${current.targetInventory} units but only ${availableUnits.length} units are currently available in the verified project inventory` });
    }
    if (!(parsed.data.officialDataNotes ?? current.officialDataNotes)?.trim()) {
      return res.status(400).json({ error: "Record the official source/document review notes before marking campaign data verified" });
    }
  }
  const [updated] = await db.update(ambassadorOsCampaigns).set({ ...parsed.data, projectId, updatedAt: new Date() }).where(eq(ambassadorOsCampaigns._id, current._id)).returning();
  await logAudit({ userId: req.user!.userId, action: "ambassador_os.campaign.update", resourceType: "ambassador_os_campaign", resourceId: updated._id, metadata: parsed.data });
  if (updated.status === "ACTIVE" && current.status !== "ACTIVE") {
    const activeAmbassadors = await db.select({ userId: ambassadorOsProfiles.userId })
      .from(ambassadorOsProfiles)
      .where(eq(ambassadorOsProfiles.status, "ACTIVE"));
    await notifySafely(activeAmbassadors.map((row) => row.userId), {
      type: "ambassador_campaign_published",
      title: "A new Ambassador campaign is live",
      message: `${updated.name} is now active. Review the verified project details in your Ambassador workspace.`,
      data: { screen: "AmbassadorOperatingSystem", campaignId: updated._id },
      actorUserId: req.user!.userId,
      priority: "normal",
      dedupeKey: updated._id,
    });
  }
  res.json({ campaign: updated });
});

const policySchema = z.object({
  name: z.string().trim().min(3).max(180),
  campaignId: z.string().uuid().optional(),
  calculationType: z.enum(["FIXED", "PER_SQ_FT_BLOCK", "PERCENT_OF_VALUE"]),
  amount: z.number().positive().max(100_000_000),
  blockSizeSqFt: z.number().int().positive().max(1_000_000).optional(),
  eligibleSources: z.array(z.enum(["AMBASSADOR_REFERRAL", "WHATSAPP", "INSTAGRAM", "FACEBOOK", "ORGANIC_WEBSITE", "PAID_ADVERTISEMENT", "CUSTOMER_REFERRAL", "TELECALLER", "CHANNEL_PARTNER", "DIRECT_ENQUIRY", "OTHER"])).max(11).optional(),
  requiredBookingStatus: z.enum(["VERIFIED", "SALE_VERIFIED"]).default("SALE_VERIFIED"),
  paymentMilestone: z.enum(["BOOKING_CONFIRMED", "TOKEN_RECEIVED", "AGREEMENT_SIGNED", "REGISTRATION_COMPLETED", "CUSTOM_MILESTONE"]).default("BOOKING_CONFIRMED"),
  cancellationTreatment: z.enum(["CANCEL_INCENTIVE", "RECOVER_PAID", "MANUAL_REVIEW"]).default("CANCEL_INCENTIVE"),
  payoutDelayDays: z.number().int().min(0).max(365).default(30),
  approvalAuthority: z.string().trim().max(300).optional(),
  commissionAgreementReference: z.string().trim().max(500).optional(),
  effectiveFrom: z.string().datetime().optional(),
});

router.post("/admin/policies", requireOsStaffRole("PROGRAM_MANAGER"), async (req: AuthedRequest, res) => {
  const parsed = policySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid incentive policy" });
  if (parsed.data.calculationType === "PERCENT_OF_VALUE" && parsed.data.amount > 100) {
    return res.status(400).json({ error: "Percent-of-value policy must be between 0 and 100 percent" });
  }
  const db = getDb();
  const existing = await db.select().from(ambassadorOsIncentivePolicies).where(eq(ambassadorOsIncentivePolicies.name, parsed.data.name));
  const version = existing.reduce((max, row) => Math.max(max, row.version), 0) + 1;
  const [policy] = await db.insert(ambassadorOsIncentivePolicies).values({
    ...parsed.data,
    eligibleSources: parsed.data.eligibleSources ?? [],
    requiredBookingStatus: parsed.data.requiredBookingStatus,
    paymentMilestone: parsed.data.paymentMilestone,
    cancellationTreatment: parsed.data.cancellationTreatment,
    payoutDelayDays: parsed.data.payoutDelayDays,
    approvalAuthority: parsed.data.approvalAuthority ?? null,
    commissionAgreementReference: parsed.data.commissionAgreementReference ?? null,
    blockSizeSqFt: parsed.data.blockSizeSqFt ?? 1000,
    version, active: false, approvalReference: null,
    effectiveFrom: parsed.data.effectiveFrom ? new Date(parsed.data.effectiveFrom) : null,
    createdById: req.user!.userId,
  }).returning();
  await logAudit({ userId: req.user!.userId, action: "ambassador_os.policy.create", resourceType: "ambassador_os_incentive_policy", resourceId: policy._id, metadata: { name: policy.name, version, calculationType: policy.calculationType, requiredBookingStatus: policy.requiredBookingStatus, eligibleSources: policy.eligibleSources, active: false } });
  res.status(201).json({ policy, message: "Policy created inactive. Add written approval evidence before activation." });
});

const policyActivationSchema = z.object({
  active: z.boolean(),
  approvalReference: z.string().trim().max(500).optional(),
  effectiveFrom: z.string().datetime().optional(),
});

router.patch("/admin/policies/:id", requireOsStaffRole("PROGRAM_MANAGER"), async (req: AuthedRequest, res) => {
  const parsed = policyActivationSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid policy update" });
  const db = getDb();
  const [current] = await db.select().from(ambassadorOsIncentivePolicies).where(eq(ambassadorOsIncentivePolicies._id, String(req.params.id)));
  if (!current) return res.status(404).json({ error: "Policy not found" });
  if (parsed.data.active && !(parsed.data.approvalReference ?? current.approvalReference)?.trim()) {
    return res.status(409).json({ error: "A written approval reference is required before activating an incentive policy" });
  }
  if (parsed.data.active) {
    const siblings = await db.select().from(ambassadorOsIncentivePolicies).where(eq(ambassadorOsIncentivePolicies.name, current.name));
    for (const sibling of siblings) {
      if (sibling._id !== current._id && sibling.active) {
        await db.update(ambassadorOsIncentivePolicies).set({ active: false }).where(eq(ambassadorOsIncentivePolicies._id, sibling._id));
      }
    }
  }
  const [updated] = await db.update(ambassadorOsIncentivePolicies).set({
    active: parsed.data.active,
    approvalReference: parsed.data.approvalReference ?? current.approvalReference,
    effectiveFrom: parsed.data.effectiveFrom ? new Date(parsed.data.effectiveFrom) : current.effectiveFrom,
  }).where(eq(ambassadorOsIncentivePolicies._id, current._id)).returning();
  await logAudit({ userId: req.user!.userId, action: "ambassador_os.policy.update", resourceType: "ambassador_os_incentive_policy", resourceId: updated._id, metadata: { active: updated.active, version: updated.version, approvalReference: updated.approvalReference } });
  res.json({ policy: updated });
});

router.get("/admin/eligible-bookings/:userId", requireRole("ADMIN"), async (req: AuthedRequest, res) => {
  const db = getDb();
  const [ambassador] = await db.select({ _id: users._id, role: users.role }).from(users).where(eq(users._id, String(req.params.userId)));
  if (!ambassador || ambassador.role !== "AMBASSADOR") return res.status(404).json({ error: "Ambassador account not found" });
  const rows = await db.select({
    booking: ambassadorOsPropertyBookings,
    leadNo: leads.leadNo,
    stage: leads.stage,
    isDuplicate: leads.isDuplicate,
    creatorRole: leads.creatorRole,
    contactConsent: leads.contactConsent,
    contactConsentAt: leads.contactConsentAt,
    consentTextVersion: leads.consentTextVersion,
    submittedById: leads.submittedById,
    referralChain: leads.referralChain,
    projectName: projects.name,
    unitNumber: units.unitNumber,
    areaSqft: units.areaSqft,
  }).from(ambassadorOsPropertyBookings)
    .innerJoin(leads, eq(ambassadorOsPropertyBookings.leadId, leads._id))
    .innerJoin(projects, eq(ambassadorOsPropertyBookings.projectId, projects._id))
    .leftJoin(units, eq(ambassadorOsPropertyBookings.unitId, units._id))
    .where(or(eq(ambassadorOsPropertyBookings.status, "VERIFIED"), eq(ambassadorOsPropertyBookings.status, "SALE_VERIFIED")))
    .orderBy(desc(ambassadorOsPropertyBookings.verifiedAt));
  const eligibleBookings = rows.filter((row) => {
    const attributed = row.submittedById === ambassador._id || (row.referralChain ?? []).some((referral) => referral.userId === ambassador._id);
    const consentOK = row.creatorRole === "BUYER" || (row.contactConsent === true && Boolean(row.contactConsentAt) && Boolean(row.consentTextVersion));
    return attributed && !row.isDuplicate && consentOK && !["CANCELLED", "REFUND_PENDING", "REFUNDED"].includes(row.booking.status);
  }).map((row) => ({
    bookingId: row.booking._id,
    bookingReference: row.booking.bookingReference,
    leadReference: row.leadNo ? `TRV-L-${String(row.leadNo).padStart(6, "0")}` : `LEAD-${row.booking.leadId.slice(0, 8).toUpperCase()}`,
    projectId: row.booking.projectId,
    projectName: row.projectName,
    unitNumber: row.unitNumber,
    areaSqFt: row.areaSqft ? Math.round(row.areaSqft) : null,
    bookingValue: row.booking.bookingValue,
    amountReceived: row.booking.amountReceived,
    bookingStatus: row.booking.status,
    paymentMilestone: row.booking.paymentMilestone,
    stage: row.stage,
  }));
  res.json({ eligibleBookings });
});

const createIncentiveSchema = z.object({
  userId: z.string().uuid(),
  bookingId: z.string().uuid(),
  policyId: z.string().uuid(),
  verifiedAreaSqFt: z.number().int().positive().max(10_000_000).optional(),
});

router.get("/incentives/me", async (req: AuthedRequest, res) => {
  if (req.user!.role !== "AMBASSADOR") return res.status(403).json({ error: "Ambassadors only" });
  const incentives = await getDb().select().from(ambassadorOsIncentives)
    .where(eq(ambassadorOsIncentives.userId, req.user!.userId))
    .orderBy(desc(ambassadorOsIncentives.createdAt));
  res.json({ incentives });
});

router.post("/admin/incentives", requireRole("ADMIN"), async (req: AuthedRequest, res) => {
  const parsed = createIncentiveSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid incentive record" });
  const db = getDb();
  const [ambassador] = await db.select().from(users).where(eq(users._id, parsed.data.userId));
  if (!ambassador || ambassador.role !== "AMBASSADOR") return res.status(400).json({ error: "Incentive recipient must be an Ambassador" });
  const [profile] = await db.select().from(ambassadorOsProfiles).where(eq(ambassadorOsProfiles.userId, ambassador._id));
  if (!profile || !profile.termsAcceptedAt || !ambassador.onboardingVerified || !["ACTIVE", "CERTIFIED"].includes(profile.status)) {
    return res.status(409).json({ error: "The Ambassador must be verified, have accepted terms, and be certified/active before an incentive can be recorded" });
  }
  const [booking] = await db.select().from(ambassadorOsPropertyBookings).where(eq(ambassadorOsPropertyBookings._id, parsed.data.bookingId));
  if (!booking) return res.status(404).json({ error: "Property booking not found" });
  const [lead] = await db.select().from(leads).where(eq(leads._id, booking.leadId));
  if (!lead) return res.status(404).json({ error: "Booking source lead not found" });
  const attributed = lead.submittedById === ambassador._id || (lead.referralChain ?? []).some((referral) => referral.userId === ambassador._id);
  if (!attributed || lead.isDuplicate || lead.ownershipReviewStatus === "OPEN" || lead.ownershipReviewStatus === "UNDER_REVIEW") {
    return res.status(409).json({ error: "The booking must have resolved, non-duplicate referral attribution to this Ambassador" });
  }
  if (lead.creatorRole !== "BUYER" && (!lead.contactConsent || !lead.contactConsentAt || !lead.consentTextVersion)) {
    return res.status(409).json({ error: "Third-party lead contact consent is not recorded, so this booking is not incentive-eligible" });
  }
  const [policy] = await db.select().from(ambassadorOsIncentivePolicies).where(eq(ambassadorOsIncentivePolicies._id, parsed.data.policyId));
  if (!policy || !policy.active || !policy.approvalReference?.trim()) return res.status(409).json({ error: "The selected incentive policy is not active and approved" });
  if (policy.effectiveFrom && policy.effectiveFrom.getTime() > Date.now()) return res.status(409).json({ error: "The selected incentive policy is not effective yet" });
  if (booking.status !== policy.requiredBookingStatus) return res.status(409).json({ error: `This policy requires booking status ${policy.requiredBookingStatus}; current status is ${booking.status}` });
  const milestoneOrder: Record<string, number> = { BOOKING_CONFIRMED: 1, TOKEN_RECEIVED: 2, AGREEMENT_SIGNED: 3, REGISTRATION_COMPLETED: 4 };
  const currentMilestone = milestoneOrder[booking.paymentMilestone] ?? 0;
  const requiredMilestone = milestoneOrder[policy.paymentMilestone] ?? 0;
  if (policy.paymentMilestone === "CUSTOM_MILESTONE" ? booking.paymentMilestone !== "CUSTOM_MILESTONE" : currentMilestone < requiredMilestone) {
    return res.status(409).json({ error: `This policy requires the ${policy.paymentMilestone.replace(/_/g, " ").toLowerCase()} payment milestone` });
  }
  const source = lead.sourceChannel ?? lead.source;
  if ((policy.eligibleSources?.length ?? 0) > 0 && !policy.eligibleSources.includes(source as any)) {
    return res.status(409).json({ error: `Lead source ${source} is not allowed by this incentive policy` });
  }
  if (policy.campaignId) {
    const [campaign] = await db.select().from(ambassadorOsCampaigns).where(eq(ambassadorOsCampaigns._id, policy.campaignId));
    if (!campaign || campaign.status !== "ACTIVE" || !campaign.officialDataVerified || campaign.projectId !== booking.projectId || campaign._id !== booking.campaignId) {
      return res.status(409).json({ error: "This incentive policy only applies to bookings linked to its verified active campaign" });
    }
  }
  const [existingIncentive] = await db.select().from(ambassadorOsIncentives).where(eq(ambassadorOsIncentives.propertyBookingId, booking._id));
  if (existingIncentive) return res.status(409).json({ error: "An incentive record already exists for this property booking" });
  let verifiedAreaSqFt = parsed.data.verifiedAreaSqFt ?? 0;
  if (booking.unitId) {
    const [linkedUnit] = await db.select({ areaSqft: units.areaSqft, projectId: units.projectId }).from(units).where(eq(units._id, booking.unitId));
    if (!linkedUnit || linkedUnit.projectId !== booking.projectId) return res.status(409).json({ error: "The booking's unit could not be verified against its project" });
    verifiedAreaSqFt = Math.round(linkedUnit.areaSqft);
  }
  if (!verifiedAreaSqFt) return res.status(400).json({ error: "Verified area is required for a project-only booking with no linked unit" });
  const amount = calculateIncentiveAmount({
    calculationType: policy.calculationType,
    amount: policy.amount,
    blockSizeSqFt: policy.blockSizeSqFt,
    verifiedAreaSqFt,
    bookingValue: booking.bookingValue,
  });
  if (amount === null) return res.status(400).json({ error: "Verified area/value does not meet the selected policy's valid calculation basis" });
  const baseDate = booking.verifiedAt ?? new Date();
  const expectedPayoutAt = booking.expectedIncentivePayoutAt ?? new Date(baseDate.getTime() + policy.payoutDelayDays * 86400000);
  const [incentive] = await db.insert(ambassadorOsIncentives).values({
    userId: ambassador._id,
    campaignId: booking.campaignId,
    policyId: policy._id,
    policyNameSnapshot: policy.name,
    policyVersion: policy.version,
    bookingReference: booking.bookingReference,
    propertyBookingId: booking._id,
    expectedPayoutAt,
    verifiedAreaSqFt,
    propertyValue: booking.bookingValue,
    amount,
    status: "PENDING",
    createdById: req.user!.userId,
  }).returning();
  await db.update(ambassadorOsPropertyBookings).set({ expectedIncentivePayoutAt: expectedPayoutAt, updatedAt: new Date() }).where(eq(ambassadorOsPropertyBookings._id, booking._id));
  await logAudit({ userId: req.user!.userId, action: "ambassador_os.incentive.create", resourceType: "ambassador_os_incentive", resourceId: incentive._id, metadata: { userId: ambassador._id, bookingId: booking._id, policyId: policy._id, policyVersion: policy.version, amount, expectedPayoutAt } });
  await notifySafely([ambassador._id], {
    type: "ambassador_incentive_recorded",
    title: "Eligible sale incentive recorded",
    message: "An incentive record has been created and is waiting for approval. This is not yet a payable amount.",
    data: { screen: "AmbassadorOperatingSystem", incentiveId: incentive._id, status: incentive.status },
    actorUserId: req.user!.userId,
    priority: "normal",
    dedupeKey: incentive._id,
  });
  res.status(201).json({ incentive });
});

const incentiveStatusSchema = z.object({
  status: z.enum(["APPROVED", "PAYABLE", "PAID", "CANCELLED"]),
  paymentReference: z.string().trim().max(300).optional(),
});

router.patch("/admin/incentives/:id/status", requireRole("ADMIN"), async (req: AuthedRequest, res) => {
  const parsed = incentiveStatusSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid payout update" });
  const db = getDb();
  const [current] = await db.select().from(ambassadorOsIncentives).where(eq(ambassadorOsIncentives._id, String(req.params.id)));
  if (!current) return res.status(404).json({ error: "Incentive record not found" });
  if (!canTransitionIncentiveStatus(current.status, parsed.data.status)) return res.status(409).json({ error: `Invalid payout transition: ${current.status} → ${parsed.data.status}` });
  if (["PAYABLE", "PAID"].includes(parsed.data.status) && current.recoveryStatus && current.recoveryStatus !== "NOT_REQUIRED") {
    return res.status(409).json({ error: "This incentive has an unresolved cancellation/recovery review and cannot move to payable or paid." });
  }
  if (["PAYABLE", "PAID"].includes(parsed.data.status) && current.propertyBookingId) {
    const [linkedBooking] = await db.select().from(ambassadorOsPropertyBookings).where(eq(ambassadorOsPropertyBookings._id, current.propertyBookingId));
    if (!linkedBooking || ["CANCELLED", "REFUND_PENDING", "REFUNDED", "REJECTED"].includes(linkedBooking.status)) {
      return res.status(409).json({ error: "A cancelled, refunded, or rejected property booking cannot have a new payable/paid incentive transition." });
    }
  }
  if (parsed.data.status === "PAID" && !parsed.data.paymentReference?.trim()) return res.status(400).json({ error: "Payment reference/receipt is required before marking an incentive paid" });
  const now = new Date();
  const [updated] = await db.update(ambassadorOsIncentives).set({
    status: parsed.data.status,
    paymentReference: parsed.data.paymentReference ?? current.paymentReference,
    approvedById: parsed.data.status === "APPROVED" ? req.user!.userId : current.approvedById,
    approvedAt: parsed.data.status === "APPROVED" ? now : current.approvedAt,
    paidAt: parsed.data.status === "PAID" ? now : current.paidAt,
  }).where(and(eq(ambassadorOsIncentives._id, current._id), eq(ambassadorOsIncentives.status, current.status))).returning();
  if (!updated) return res.status(409).json({ error: "The payout was changed by another administrator. Refresh the ledger before updating it again." });
  await logAudit({ userId: req.user!.userId, action: "ambassador_os.incentive.status", resourceType: "ambassador_os_incentive", resourceId: updated._id, metadata: { from: current.status, to: updated.status, paymentReference: updated.paymentReference } });
  await notifySafely([current.userId], {
    type: "ambassador_incentive_status",
    title: updated.status === "PAID" ? "Ambassador incentive paid" : "Ambassador incentive status updated",
    message: updated.status === "PAID"
      ? "Your incentive has been marked paid. Open your private ledger to view the payment reference."
      : `Your incentive status is now ${updated.status.toLowerCase()}.`,
    data: { screen: "AmbassadorOperatingSystem", incentiveId: updated._id, status: updated.status },
    actorUserId: req.user!.userId,
    priority: updated.status === "PAID" ? "high" : "normal",
    dedupeKey: `${updated._id}:${updated.status}`,
  });
  res.json({ incentive: updated });
});


const trainingContentSchema = z.object({
  day: z.number().int().min(1).max(7),
  title: z.string().trim().min(3).max(180),
  summary: z.string().trim().min(5).max(500),
  lesson: z.string().trim().min(20).max(12000),
  keyPoints: z.array(z.string().trim().min(2).max(300)).min(3).max(12),
  assignment: z.string().trim().min(5).max(2000),
  videoUrl: z.string().url().optional().or(z.literal("")),
  questions: z.array(z.object({
    prompt: z.string().trim().min(5).max(500),
    options: z.array(z.string().trim().min(1).max(300)).min(2).max(5),
    answer: z.number().int().min(0).max(4),
  }).refine((question) => question.answer < question.options.length, { message: "Correct answer must be one of the provided options" })).length(5),
  isPublished: z.boolean().default(false),
});

router.get("/admin/training-modules", requireOsStaffRole("TRAINING_COORDINATOR"), async (_req: AuthedRequest, res) => {
  const modules = await getDb().select().from(ambassadorOsTrainingModules)
    .orderBy(ambassadorOsTrainingModules.day, desc(ambassadorOsTrainingModules.version));
  res.json({ modules });
});

router.post("/admin/training-modules", requireOsStaffRole("TRAINING_COORDINATOR"), async (req: AuthedRequest, res) => {
  const parsed = trainingContentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid training module" });
  const db = getDb();
  const existing = await db.select().from(ambassadorOsTrainingModules).where(eq(ambassadorOsTrainingModules.day, parsed.data.day));
  const version = existing.reduce((max, row) => Math.max(max, row.version), 0) + 1;
  const now = new Date();
  if (parsed.data.isPublished) {
    await db.update(ambassadorOsTrainingModules).set({ isPublished: false, updatedAt: now })
      .where(and(eq(ambassadorOsTrainingModules.day, parsed.data.day), eq(ambassadorOsTrainingModules.isPublished, true)));
  }
  const [module] = await db.insert(ambassadorOsTrainingModules).values({
    day: parsed.data.day,
    title: parsed.data.title,
    summary: parsed.data.summary,
    lesson: parsed.data.lesson,
    keyPoints: parsed.data.keyPoints,
    assignment: parsed.data.assignment,
    videoUrl: parsed.data.videoUrl || null,
    questions: parsed.data.questions,
    version,
    isPublished: parsed.data.isPublished,
    publishedById: parsed.data.isPublished ? req.user!.userId : null,
    publishedAt: parsed.data.isPublished ? now : null,
    createdById: req.user!.userId,
    updatedAt: now,
  }).returning();
  await logAudit({ userId: req.user!.userId, action: "ambassador_os.training_content.publish", resourceType: "ambassador_os_training_module", resourceId: module._id, metadata: { day: module.day, version, isPublished: module.isPublished } });
  res.status(201).json({ module });
});

/** A private list of leads attributed to this Ambassador. Customer phone/email are intentionally omitted. */
router.get("/leads/me", async (req: AuthedRequest, res) => {
  if (req.user!.role !== "AMBASSADOR") return res.status(403).json({ error: "Ambassadors only" });
  const db = getDb();
  const attributedRows = await db.select({
    lead: leads,
    projectName: projects.name,
    unitNumber: units.unitNumber,
  }).from(leads)
    .innerJoin(projects, eq(leads.projectId, projects._id))
    .leftJoin(units, eq(leads.unitId, units._id))
    .where(or(
      eq(leads.submittedById, req.user!.userId),
      sql`${leads.referralChain} @> ${JSON.stringify([{ userId: req.user!.userId }])}::jsonb`,
    ))
    .orderBy(desc(leads.createdAt)).limit(500);
  const out = attributedRows.map((row) => {
    const mine = row.lead.submittedById === req.user!.userId;
    const hasConsent = row.lead.creatorRole === "BUYER" || (row.lead.contactConsent && row.lead.contactConsentAt && row.lead.consentTextVersion);
    return {
      _id: row.lead._id,
      leadReference: row.lead.leadNo ? `TRV-L-${String(row.lead.leadNo).padStart(6, "0")}` : row.lead._id.slice(0, 8).toUpperCase(),
      projectName: row.projectName,
      unitNumber: row.unitNumber,
      stage: row.lead.stage,
      requirement: row.lead.requirement,
      budgetRange: row.lead.budgetRange,
      purchasePurpose: row.lead.purchasePurpose,
      preferredPlotSize: row.lead.preferredPlotSize,
      purchaseTimeline: row.lead.purchaseTimeline,
      sourceChannel: row.lead.sourceChannel ?? row.lead.source,
      nextFollowUpAt: row.lead.nextFollowUpAt,
      createdAt: row.lead.createdAt,
      isDuplicate: row.lead.isDuplicate,
      ownershipReviewStatus: row.lead.ownershipReviewStatus,
      contactConsentRecorded: Boolean(hasConsent),
      customerDisplayName: mine && hasConsent ? row.lead.clientName : "Referral enquiry",
      customerPhone: mine && hasConsent ? row.lead.clientPhone : null,
      canScheduleFollowUp: hasConsent && !row.lead.isDuplicate && !["LOST", "COMPLETED"].includes(row.lead.stage) && row.lead.ownershipReviewStatus !== "OPEN" && row.lead.ownershipReviewStatus !== "UNDER_REVIEW",
    };
  });
  res.json({ leads: out });
});

router.get("/follow-ups/me", async (req: AuthedRequest, res) => {
  if (req.user!.role !== "AMBASSADOR") return res.status(403).json({ error: "Ambassadors only" });
  const db = getDb();
  const rows = await db.select({
    followUp: ambassadorOsFollowUps,
    leadNo: leads.leadNo,
    leadStage: leads.stage,
    projectName: projects.name,
  }).from(ambassadorOsFollowUps)
    .innerJoin(leads, eq(ambassadorOsFollowUps.leadId, leads._id))
    .innerJoin(projects, eq(leads.projectId, projects._id))
    .where(eq(ambassadorOsFollowUps.ambassadorId, req.user!.userId))
    .orderBy(ambassadorOsFollowUps.dueAt).limit(500);
  res.json({ followUps: rows.map((row) => ({
    ...row.followUp,
    leadReference: row.leadNo ? `TRV-L-${String(row.leadNo).padStart(6, "0")}` : row.followUp.leadId.slice(0, 8).toUpperCase(),
    leadStage: row.leadStage,
    projectName: row.projectName,
    isOverdue: row.followUp.status === "PENDING" && row.followUp.dueAt.getTime() < Date.now(),
  })) });
});

const createFollowUpSchema = z.object({
  leadId: z.string().uuid(),
  dueAt: z.string().datetime(),
  channel: z.enum(["CALL", "WHATSAPP", "EMAIL", "MEETING"]),
  note: z.string().trim().min(5).max(1500),
});

router.post("/follow-ups", async (req: AuthedRequest, res) => {
  if (req.user!.role !== "AMBASSADOR") return res.status(403).json({ error: "Ambassadors only" });
  const parsed = createFollowUpSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid follow-up" });
  const db = getDb();
  const [lead] = await db.select().from(leads).where(eq(leads._id, parsed.data.leadId));
  if (!lead) return res.status(404).json({ error: "Lead not found" });
  const attributed = lead.submittedById === req.user!.userId || (lead.referralChain ?? []).some((referral) => referral.userId === req.user!.userId);
  if (!attributed) return res.status(403).json({ error: "You can only schedule follow-ups for leads attributed to you" });
  const hasConsent = lead.creatorRole === "BUYER" || (lead.contactConsent && lead.contactConsentAt && lead.consentTextVersion);
  if (!hasConsent || lead.isDuplicate || ["LOST", "COMPLETED"].includes(lead.stage) || ["OPEN", "UNDER_REVIEW"].includes(lead.ownershipReviewStatus)) {
    return res.status(409).json({ error: "This lead is not currently eligible for follow-up because consent, duplicate, lifecycle or ownership review conditions are unresolved" });
  }
  const dueAt = new Date(parsed.data.dueAt);
  if (Number.isNaN(dueAt.getTime()) || dueAt.getTime() < Date.now() - 60000) return res.status(400).json({ error: "Choose a future follow-up time" });
  const now = new Date();
  const [followUp] = await db.insert(ambassadorOsFollowUps).values({
    leadId: lead._id,
    ambassadorId: req.user!.userId,
    dueAt,
    channel: parsed.data.channel,
    note: parsed.data.note,
    status: "PENDING",
    createdAt: now,
    updatedAt: now,
  }).returning();
  await db.update(leads).set({ nextFollowUpAt: dueAt, updatedAt: now }).where(eq(leads._id, lead._id));
  await logAudit({ userId: req.user!.userId, action: "ambassador_os.followup.create", resourceType: "ambassador_os_follow_up", resourceId: followUp._id, metadata: { leadId: lead._id, dueAt, channel: followUp.channel } });
  res.status(201).json({ followUp });
});

const followUpStatusSchema = z.object({
  status: z.enum(["DONE", "MISSED", "CANCELLED"]),
  outcome: z.string().trim().max(1500).optional(),
});

router.patch("/follow-ups/:id/status", async (req: AuthedRequest, res) => {
  const parsed = followUpStatusSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid follow-up update" });
  const db = getDb();
  const conditions = [eq(ambassadorOsFollowUps._id, String(req.params.id))];
  if (req.user!.role === "AMBASSADOR") conditions.push(eq(ambassadorOsFollowUps.ambassadorId, req.user!.userId));
  else if (req.user!.role !== "ADMIN") return res.status(403).json({ error: "Not allowed to update follow-ups" });
  const [current] = await db.select().from(ambassadorOsFollowUps).where(and(...conditions));
  if (!current) return res.status(404).json({ error: "Follow-up not found" });
  if (current.status !== "PENDING") return res.status(409).json({ error: "Only pending follow-ups can be completed or closed" });
  const now = new Date();
  const [updated] = await db.update(ambassadorOsFollowUps).set({
    status: parsed.data.status,
    outcome: parsed.data.outcome ?? current.outcome,
    completedAt: parsed.data.status === "DONE" ? now : current.completedAt,
    updatedAt: now,
  }).where(and(eq(ambassadorOsFollowUps._id, current._id), eq(ambassadorOsFollowUps.status, "PENDING"))).returning();
  if (!updated) return res.status(409).json({ error: "Follow-up changed; refresh your reminders" });
  const [next] = await db.select().from(ambassadorOsFollowUps)
    .where(and(eq(ambassadorOsFollowUps.leadId, current.leadId), eq(ambassadorOsFollowUps.status, "PENDING")))
    .orderBy(ambassadorOsFollowUps.dueAt).limit(1);
  await db.update(leads).set({ nextFollowUpAt: next?.dueAt ?? null, updatedAt: now }).where(eq(leads._id, current.leadId));
  await logAudit({ userId: req.user!.userId, action: "ambassador_os.followup.update", resourceType: "ambassador_os_follow_up", resourceId: updated._id, metadata: { status: updated.status, outcome: updated.outcome } });
  res.json({ followUp: updated });
});

router.get("/admin/follow-ups", requireOsStaffRole("SALES_COORDINATOR", "PROGRAM_MANAGER"), async (_req: AuthedRequest, res) => {
  const rows = await getDb().select({
    followUp: ambassadorOsFollowUps,
    leadNo: leads.leadNo,
    leadStage: leads.stage,
    projectName: projects.name,
    ambassadorName: users.name,
    ambassadorEmail: users.email,
  }).from(ambassadorOsFollowUps)
    .innerJoin(leads, eq(ambassadorOsFollowUps.leadId, leads._id))
    .innerJoin(projects, eq(leads.projectId, projects._id))
    .innerJoin(users, eq(ambassadorOsFollowUps.ambassadorId, users._id))
    .orderBy(ambassadorOsFollowUps.dueAt).limit(1000);
  res.json({ followUps: rows.map((row) => ({
    ...row.followUp,
    leadReference: row.leadNo ? `TRV-L-${String(row.leadNo).padStart(6, "0")}` : row.followUp.leadId.slice(0, 8).toUpperCase(),
    leadStage: row.leadStage,
    projectName: row.projectName,
    ambassadorName: row.ambassadorName,
    ambassadorEmail: row.ambassadorEmail,
    isOverdue: row.followUp.status === "PENDING" && row.followUp.dueAt.getTime() < Date.now(),
  })) });
});

const channelCostSchema = z.object({
  campaignId: z.string().uuid(),
  sourceChannel: z.enum(["AMBASSADOR_REFERRAL", "WHATSAPP", "INSTAGRAM", "FACEBOOK", "ORGANIC_WEBSITE", "PAID_ADVERTISEMENT", "CUSTOMER_REFERRAL", "TELECALLER", "CHANNEL_PARTNER", "DIRECT_ENQUIRY", "OTHER"]),
  amount: z.number().nonnegative().max(1_000_000_000),
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
  evidenceReference: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(1500).optional(),
}).refine((input) => new Date(input.periodEnd).getTime() >= new Date(input.periodStart).getTime(), { message: "Cost period end must be on or after its start" });

router.post("/admin/channel-costs", requireOsStaffRole("SALES_COORDINATOR", "PROGRAM_MANAGER"), async (req: AuthedRequest, res) => {
  const parsed = channelCostSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid marketing cost" });
  const db = getDb();
  const [campaign] = await db.select().from(ambassadorOsCampaigns).where(eq(ambassadorOsCampaigns._id, parsed.data.campaignId));
  if (!campaign) return res.status(404).json({ error: "Campaign not found" });
  const [cost] = await db.insert(ambassadorOsChannelCosts).values({
    ...parsed.data,
    periodStart: new Date(parsed.data.periodStart),
    periodEnd: new Date(parsed.data.periodEnd),
    evidenceReference: parsed.data.evidenceReference ?? null,
    notes: parsed.data.notes ?? null,
    createdById: req.user!.userId,
  }).returning();
  await logAudit({ userId: req.user!.userId, action: "ambassador_os.channel_cost.create", resourceType: "ambassador_os_channel_cost", resourceId: cost._id, metadata: { campaignId: cost.campaignId, sourceChannel: cost.sourceChannel, amount: cost.amount } });
  res.status(201).json({ cost });
});



const careerOpportunitySchema = z.object({
  title: z.string().trim().min(3).max(180),
  opportunityType: z.enum(["INTERNSHIP", "JOB", "CAMPUS_LEADERSHIP", "MENTORING"]),
  description: z.string().trim().min(20).max(6000),
  location: z.string().trim().max(180).optional(),
  targetLevel: z.enum(["L1", "L2", "L3", "L4", "L5", "L6"]),
  requiredSkills: z.array(z.string().trim().min(2).max(100)).max(30).default([]),
  eligibility: z.record(z.string(), z.unknown()).default({}),
  vacancies: z.number().int().positive().max(10000).default(1),
  applicationDeadline: z.string().datetime().optional().nullable(),
  status: z.enum(["DRAFT", "PUBLISHED", "CLOSED"]).default("DRAFT"),
});

router.get("/career/opportunities", async (req: AuthedRequest, res) => {
  if (req.user!.role !== "AMBASSADOR") return res.status(403).json({ error: "Ambassadors only" });
  const db = getDb();
  const [profile] = await db.select().from(ambassadorOsProfiles).where(eq(ambassadorOsProfiles.userId, req.user!.userId));
  const [account] = await db.select({ onboardingVerified: users.onboardingVerified }).from(users).where(eq(users._id, req.user!.userId));
  const [opportunities, applications] = await Promise.all([
    db.select().from(ambassadorOsCareerOpportunities)
      .where(eq(ambassadorOsCareerOpportunities.status, "PUBLISHED"))
      .orderBy(desc(ambassadorOsCareerOpportunities.publishedAt)),
    db.select().from(ambassadorOsCareerApplications).where(eq(ambassadorOsCareerApplications.ambassadorId, req.user!.userId)),
  ]);
  const applicationByOpportunity = new Map(applications.map((application) => [application.opportunityId, application]));
  const levelNumber = Number((profile?.currentLevel ?? "L0").slice(1));
  const now = Date.now();
  res.json({
    opportunities: opportunities.map((opportunity) => ({
      ...opportunity,
      application: applicationByOpportunity.get(opportunity._id) ?? null,
      meetsLevel: levelNumber >= Number(opportunity.targetLevel.slice(1)),
      canApply: Boolean(profile?.termsAcceptedAt && account?.onboardingVerified && profile.status === "ACTIVE" &&
        levelNumber >= Number(opportunity.targetLevel.slice(1)) &&
        (!opportunity.applicationDeadline || opportunity.applicationDeadline.getTime() >= now) &&
        !applicationByOpportunity.has(opportunity._id)),
    })),
    note: "Opportunities are subject to eligibility, availability, review and selection; they are not guaranteed rewards.",
  });
});

router.get("/career/applications/me", async (req: AuthedRequest, res) => {
  if (req.user!.role !== "AMBASSADOR") return res.status(403).json({ error: "Ambassadors only" });
  const rows = await getDb().select({ application: ambassadorOsCareerApplications, opportunity: ambassadorOsCareerOpportunities })
    .from(ambassadorOsCareerApplications)
    .innerJoin(ambassadorOsCareerOpportunities, eq(ambassadorOsCareerApplications.opportunityId, ambassadorOsCareerOpportunities._id))
    .where(eq(ambassadorOsCareerApplications.ambassadorId, req.user!.userId))
    .orderBy(desc(ambassadorOsCareerApplications.createdAt));
  res.json({ applications: rows.map((row) => ({ ...row.application, opportunityTitle: row.opportunity.title, opportunityType: row.opportunity.opportunityType, targetLevel: row.opportunity.targetLevel })) });
});

const careerApplicationSchema = z.object({
  statement: z.string().trim().min(20).max(4000),
  evidenceReference: z.string().trim().max(1000).optional(),
});

router.post("/career/opportunities/:id/apply", async (req: AuthedRequest, res) => {
  if (req.user!.role !== "AMBASSADOR") return res.status(403).json({ error: "Ambassadors only" });
  const parsed = careerApplicationSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid application" });
  const db = getDb();
  const [profile] = await db.select().from(ambassadorOsProfiles).where(eq(ambassadorOsProfiles.userId, req.user!.userId));
  const [account] = await db.select({ onboardingVerified: users.onboardingVerified }).from(users).where(eq(users._id, req.user!.userId));
  if (!profile?.termsAcceptedAt || !account?.onboardingVerified || profile.status !== "ACTIVE") {
    return res.status(403).json({ error: "Applications are available to verified, active Ambassadors only" });
  }
  const [opportunity] = await db.select().from(ambassadorOsCareerOpportunities)
    .where(eq(ambassadorOsCareerOpportunities._id, String(req.params.id)));
  if (!opportunity || opportunity.status !== "PUBLISHED") return res.status(404).json({ error: "Published opportunity not found" });
  if (opportunity.applicationDeadline && opportunity.applicationDeadline.getTime() < Date.now()) {
    return res.status(409).json({ error: "The application deadline has passed" });
  }
  if (Number(profile.currentLevel.slice(1)) < Number(opportunity.targetLevel.slice(1))) {
    return res.status(403).json({ error: "Your current career level does not meet this opportunity's minimum level" });
  }
  const [existing] = await db.select().from(ambassadorOsCareerApplications)
    .where(and(eq(ambassadorOsCareerApplications.opportunityId, opportunity._id), eq(ambassadorOsCareerApplications.ambassadorId, req.user!.userId)));
  if (existing) return res.status(409).json({ error: "You have already applied to this opportunity" });
  const [application] = await db.insert(ambassadorOsCareerApplications).values({
    opportunityId: opportunity._id,
    ambassadorId: req.user!.userId,
    statement: parsed.data.statement,
    evidenceReference: parsed.data.evidenceReference ?? null,
    status: "SUBMITTED",
  }).returning();
  const admins = await db.select({ userId: users._id }).from(users).where(eq(users.role, "ADMIN"));
  await notifySafely(admins.map((a) => a.userId), {
    type: "ambassador_career_application",
    title: "Ambassador opportunity application received",
    message: `An Ambassador applied for ${opportunity.title}; review eligibility and evidence before selecting.`,
    data: { screen: "AdminAmbassadorOperatingSystem", applicationId: application._id, opportunityId: opportunity._id },
    actorUserId: req.user!.userId,
    priority: "normal",
    dedupeKey: application._id,
  });
  await logAudit({ userId: req.user!.userId, action: "ambassador_os.career.apply", resourceType: "ambassador_os_career_application", resourceId: application._id, metadata: { opportunityId: opportunity._id, targetLevel: opportunity.targetLevel } });
  res.status(201).json({ application, message: "Application submitted for review. Selection is not guaranteed." });
});

router.get("/admin/career/opportunities", requireOsStaffRole("PROGRAM_MANAGER"), async (_req: AuthedRequest, res) => {
  const [opportunities, applicationCounts] = await Promise.all([
    getDb().select().from(ambassadorOsCareerOpportunities).orderBy(desc(ambassadorOsCareerOpportunities.createdAt)),
    getDb().select({ opportunityId: ambassadorOsCareerApplications.opportunityId, count: sql<number>`count(*)`.mapWith(Number) })
      .from(ambassadorOsCareerApplications).groupBy(ambassadorOsCareerApplications.opportunityId),
  ]);
  const counts = new Map(applicationCounts.map((row) => [row.opportunityId, row.count]));
  res.json({ opportunities: opportunities.map((row) => ({ ...row, applicationsCount: counts.get(row._id) ?? 0 })) });
});

router.post("/admin/career/opportunities", requireOsStaffRole("PROGRAM_MANAGER"), async (req: AuthedRequest, res) => {
  const parsed = careerOpportunitySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid career opportunity" });
  const now = new Date();
  const [opportunity] = await getDb().insert(ambassadorOsCareerOpportunities).values({
    title: parsed.data.title,
    opportunityType: parsed.data.opportunityType,
    description: parsed.data.description,
    location: parsed.data.location ?? null,
    targetLevel: parsed.data.targetLevel,
    requiredSkills: parsed.data.requiredSkills,
    eligibility: parsed.data.eligibility,
    vacancies: parsed.data.vacancies,
    applicationDeadline: parsed.data.applicationDeadline ? new Date(parsed.data.applicationDeadline) : null,
    status: parsed.data.status,
    createdById: req.user!.userId,
    publishedAt: parsed.data.status === "PUBLISHED" ? now : null,
    closedAt: parsed.data.status === "CLOSED" ? now : null,
    updatedAt: now,
  }).returning();
  await logAudit({ userId: req.user!.userId, action: "ambassador_os.career.opportunity_create", resourceType: "ambassador_os_career_opportunity", resourceId: opportunity._id, metadata: { title: opportunity.title, type: opportunity.opportunityType, level: opportunity.targetLevel, status: opportunity.status } });
  res.status(201).json({ opportunity });
});

router.patch("/admin/career/opportunities/:id", requireOsStaffRole("PROGRAM_MANAGER"), async (req: AuthedRequest, res) => {
  const parsed = z.object({
    status: z.enum(["DRAFT", "PUBLISHED", "CLOSED"]).optional(),
    vacancies: z.number().int().positive().max(10000).optional(),
    applicationDeadline: z.string().datetime().nullable().optional(),
  }).refine((v) => v.status !== undefined || v.vacancies !== undefined || v.applicationDeadline !== undefined).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid opportunity update" });
  const db = getDb();
  const [current] = await db.select().from(ambassadorOsCareerOpportunities).where(eq(ambassadorOsCareerOpportunities._id, String(req.params.id)));
  if (!current) return res.status(404).json({ error: "Opportunity not found" });
  const now = new Date();
  const [updated] = await db.update(ambassadorOsCareerOpportunities).set({
    ...parsed.data,
    applicationDeadline: parsed.data.applicationDeadline === undefined ? current.applicationDeadline : parsed.data.applicationDeadline ? new Date(parsed.data.applicationDeadline) : null,
    publishedAt: parsed.data.status === "PUBLISHED" ? (current.publishedAt ?? now) : current.publishedAt,
    closedAt: parsed.data.status === "CLOSED" ? (current.closedAt ?? now) : parsed.data.status === "PUBLISHED" ? null : current.closedAt,
    updatedAt: now,
  }).where(eq(ambassadorOsCareerOpportunities._id, current._id)).returning();
  await logAudit({ userId: req.user!.userId, action: "ambassador_os.career.opportunity_update", resourceType: "ambassador_os_career_opportunity", resourceId: current._id, metadata: { status: updated.status, vacancies: updated.vacancies } });
  res.json({ opportunity: updated });
});

router.get("/admin/career/applications", requireOsStaffRole("PROGRAM_MANAGER"), async (_req: AuthedRequest, res) => {
  const rows = await getDb().select({
    application: ambassadorOsCareerApplications,
    opportunity: ambassadorOsCareerOpportunities,
    name: users.name,
    email: users.email,
    currentLevel: ambassadorOsProfiles.currentLevel,
    profileStatus: ambassadorOsProfiles.status,
  }).from(ambassadorOsCareerApplications)
    .innerJoin(ambassadorOsCareerOpportunities, eq(ambassadorOsCareerApplications.opportunityId, ambassadorOsCareerOpportunities._id))
    .innerJoin(users, eq(ambassadorOsCareerApplications.ambassadorId, users._id))
    .leftJoin(ambassadorOsProfiles, eq(ambassadorOsCareerApplications.ambassadorId, ambassadorOsProfiles.userId))
    .orderBy(desc(ambassadorOsCareerApplications.createdAt));
  res.json({ applications: rows.map((row) => ({ ...row.application, opportunityTitle: row.opportunity.title, opportunityType: row.opportunity.opportunityType, targetLevel: row.opportunity.targetLevel, ambassadorName: row.name, ambassadorEmail: row.email, currentLevel: row.currentLevel, profileStatus: row.profileStatus })) });
});

router.patch("/admin/career/applications/:id/review", requireOsStaffRole("PROGRAM_MANAGER"), async (req: AuthedRequest, res) => {
  const parsed = z.object({
    status: z.enum(["UNDER_REVIEW", "SHORTLISTED", "REJECTED", "SELECTED"]),
    reviewNotes: z.string().trim().min(5).max(3000),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid career application review" });
  const db = getDb();
  const [current] = await db.select().from(ambassadorOsCareerApplications).where(eq(ambassadorOsCareerApplications._id, String(req.params.id)));
  if (!current) return res.status(404).json({ error: "Application not found" });
  if (["REJECTED", "SELECTED", "WITHDRAWN"].includes(current.status)) return res.status(409).json({ error: "This application is already finalized" });
  const now = new Date();
  const [updated] = await db.update(ambassadorOsCareerApplications).set({
    status: parsed.data.status,
    reviewNotes: parsed.data.reviewNotes,
    reviewerId: req.user!.userId,
    reviewedAt: now,
    updatedAt: now,
  }).where(and(eq(ambassadorOsCareerApplications._id, current._id), eq(ambassadorOsCareerApplications.status, current.status))).returning();
  if (!updated) return res.status(409).json({ error: "The application changed while being reviewed; refresh and retry" });
  await logAudit({ userId: req.user!.userId, action: "ambassador_os.career.application_review", resourceType: "ambassador_os_career_application", resourceId: updated._id, metadata: { previousStatus: current.status, status: updated.status, opportunityId: current.opportunityId } });
  await notifySafely([current.ambassadorId], {
    type: "ambassador_career_application_review",
    title: "Career opportunity application updated",
    message: `Your career opportunity application was marked ${updated.status.toLowerCase().replace(/_/g, " ")}. ${parsed.data.reviewNotes}`,
    data: { screen: "AmbassadorOperatingSystem", applicationId: updated._id, status: updated.status },
    actorUserId: req.user!.userId,
    priority: updated.status === "REJECTED" ? "normal" : "high",
    dedupeKey: `${updated._id}:${updated.status}`,
  });
  res.json({ application: updated });
});

const careerAssessmentSchema = z.object({
  ambassadorId: z.string().uuid(),
  targetLevel: z.enum(["L4", "L5", "L6"]),
  assessmentType: z.enum(["MENTORING", "TEAM_MANAGEMENT", "ADVANCED"]),
  score: z.number().int().min(0).max(100),
  evidenceReference: z.string().trim().min(3).max(1000),
  notes: z.string().trim().min(10).max(3000),
}).refine((v) =>
  (v.targetLevel === "L4" && v.assessmentType === "MENTORING") ||
  (v.targetLevel === "L5" && v.assessmentType === "TEAM_MANAGEMENT") ||
  (v.targetLevel === "L6" && v.assessmentType === "ADVANCED"),
{ message: "Assessment type must match the target career level" });

router.get("/admin/career/assessments/:userId", requireOsStaffRole("PROGRAM_MANAGER"), async (req: AuthedRequest, res) => {
  const assessments = await getDb().select().from(ambassadorOsCareerAssessments)
    .where(eq(ambassadorOsCareerAssessments.ambassadorId, String(req.params.userId)))
    .orderBy(desc(ambassadorOsCareerAssessments.reviewedAt));
  res.json({ assessments });
});

router.post("/admin/career/assessments", requireOsStaffRole("PROGRAM_MANAGER"), async (req: AuthedRequest, res) => {
  const parsed = careerAssessmentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid career assessment" });
  const [profile] = await getDb().select().from(ambassadorOsProfiles).where(eq(ambassadorOsProfiles.userId, parsed.data.ambassadorId));
  if (!profile) return res.status(404).json({ error: "Ambassador profile not found" });
  const [assessment] = await getDb().insert(ambassadorOsCareerAssessments).values({
    ambassadorId: profile.userId,
    targetLevel: parsed.data.targetLevel,
    assessmentType: parsed.data.assessmentType,
    score: parsed.data.score,
    passed: parsed.data.score >= 80,
    evidenceReference: parsed.data.evidenceReference,
    notes: parsed.data.notes,
    reviewerId: req.user!.userId,
  }).returning();
  await logAudit({ userId: req.user!.userId, action: "ambassador_os.career.assessment", resourceType: "ambassador_os_career_assessment", resourceId: assessment._id, metadata: { ambassadorId: profile.userId, targetLevel: assessment.targetLevel, assessmentType: assessment.assessmentType, score: assessment.score, passed: assessment.passed } });
  await notifySafely([profile.userId], {
    type: "ambassador_career_assessment",
    title: "Career progression assessment recorded",
    message: `Your ${assessment.targetLevel} ${assessment.assessmentType.toLowerCase().replace(/_/g, " ")} assessment scored ${assessment.score}/100 and ${assessment.passed ? "passed" : "needs further development"}.`,
    data: { screen: "AmbassadorOperatingSystem", targetLevel: assessment.targetLevel, passed: assessment.passed },
    actorUserId: req.user!.userId,
    priority: "normal",
    dedupeKey: assessment._id,
  });
  res.status(201).json({ assessment });
});


const campaignGuidelinePublishSchema = z.object({
  content: z.string().trim().min(50).max(15000),
  approvalReference: z.string().trim().min(5).max(500),
});

router.post("/admin/campaigns/:id/guidelines", requireOsStaffRole("PROGRAM_MANAGER"), async (req: AuthedRequest, res) => {
  const parsed = campaignGuidelinePublishSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid campaign guidelines" });
  const db = getDb();
  const [campaign] = await db.select().from(ambassadorOsCampaigns).where(eq(ambassadorOsCampaigns._id, String(req.params.id)));
  if (!campaign) return res.status(404).json({ error: "Campaign not found" });
  if (campaign.status !== "ACTIVE" || !campaign.officialDataVerified) return res.status(409).json({ error: "Publish campaign guidelines only after official project details are verified and the campaign is active" });
  const previous = await db.select().from(ambassadorOsCampaignGuidelines).where(eq(ambassadorOsCampaignGuidelines.campaignId, campaign._id));
  const version = previous.reduce((max, row) => Math.max(max, row.version), 0) + 1;
  const now = new Date();
  const [guideline] = await db.insert(ambassadorOsCampaignGuidelines).values({
    campaignId: campaign._id, version, content: parsed.data.content, approvalReference: parsed.data.approvalReference,
    createdById: req.user!.userId, publishedAt: now, createdAt: now,
  }).returning();
  await logAudit({ userId: req.user!.userId, action: "ambassador_os.campaign_guidelines.publish", resourceType: "ambassador_os_campaign_guidelines", resourceId: guideline._id, metadata: { campaignId: campaign._id, version, approvalReference: guideline.approvalReference } });
  const activeAmbassadors = await db.select({ userId: ambassadorOsProfiles.userId }).from(ambassadorOsProfiles).where(eq(ambassadorOsProfiles.status, "ACTIVE"));
  await notifySafely(activeAmbassadors.map((row) => row.userId), {
    type: "ambassador_campaign_guidelines_updated", title: "Campaign marketing guidelines updated",
    message: "The current marketing guidelines for " + campaign.name + " are version " + version + ". Review and acknowledge them before submitting leads or using campaign material.",
    data: { screen: "AmbassadorOperatingSystem", campaignId: campaign._id, version }, actorUserId: req.user!.userId, priority: "high", dedupeKey: campaign._id + ":" + version,
  });
  res.status(201).json({ guideline });
});

const campaignGuidelineAckSchema = z.object({ version: z.number().int().positive(), confirmed: z.literal(true) });
router.post("/campaigns/:id/acknowledge", async (req: AuthedRequest, res) => {
  if (req.user!.role !== "AMBASSADOR") return res.status(403).json({ error: "Ambassadors only" });
  const parsed = campaignGuidelineAckSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Explicit acknowledgement is required" });
  const db = getDb();
  const [profile] = await db.select().from(ambassadorOsProfiles).where(eq(ambassadorOsProfiles.userId, req.user!.userId));
  const [account] = await db.select({ onboardingVerified: users.onboardingVerified }).from(users).where(eq(users._id, req.user!.userId));
  if (!profile?.termsAcceptedAt || !account?.onboardingVerified || profile.status !== "ACTIVE") return res.status(403).json({ error: "Only verified, terms-accepting, active Ambassadors may acknowledge campaign guidelines" });
  const [campaign] = await db.select().from(ambassadorOsCampaigns).where(eq(ambassadorOsCampaigns._id, String(req.params.id)));
  if (!campaign || campaign.status !== "ACTIVE" || !campaign.officialDataVerified) return res.status(404).json({ error: "Active verified campaign not found" });
  const published = await db.select().from(ambassadorOsCampaignGuidelines).where(eq(ambassadorOsCampaignGuidelines.campaignId, campaign._id));
  const latest = published.sort((a, b) => b.version - a.version)[0];
  if (!latest) return res.status(409).json({ error: "The program team has not published approved marketing guidelines for this campaign yet" });
  if (latest.version !== parsed.data.version) return res.status(409).json({ error: "Guidelines have changed. Reload and acknowledge the latest version." });
  const [acknowledgement] = await db.insert(ambassadorOsCampaignAcknowledgements).values({ campaignId: campaign._id, ambassadorId: req.user!.userId, guidelineVersion: latest.version })
    .onConflictDoNothing().returning();
  await logAudit({ userId: req.user!.userId, action: "ambassador_os.campaign_guidelines.acknowledge", resourceType: "ambassador_os_campaign_guidelines", resourceId: latest._id, metadata: { campaignId: campaign._id, version: latest.version } });
  res.json({ acknowledged: true, version: latest.version, acknowledgedAt: acknowledgement?.acknowledgedAt ?? new Date() });
});

const marketingMaterialCreateSchema = z.object({
  campaignId: z.string().uuid(), title: z.string().trim().min(3).max(180),
  channel: z.enum(["WHATSAPP", "INSTAGRAM", "FACEBOOK", "POSTER", "EMAIL", "BROCHURE", "OTHER"]),
  content: z.string().trim().min(10).max(12000),
  assetUrl: z.string().url().max(2000).optional().or(z.literal("")),
});

router.get("/marketing-materials", async (req: AuthedRequest, res) => {
  const db = getDb();
  if (req.user!.role === "ADMIN") {
    const materials = await db.select().from(ambassadorOsMarketingMaterials).orderBy(desc(ambassadorOsMarketingMaterials.createdAt));
    return res.json({ materials });
  }
  if (req.user!.role !== "AMBASSADOR") return res.status(403).json({ error: "Ambassadors only" });
  const now = new Date();
  const [materials, campaigns, acknowledgements, guidelines] = await Promise.all([
    db.select().from(ambassadorOsMarketingMaterials).where(eq(ambassadorOsMarketingMaterials.status, "APPROVED")).orderBy(desc(ambassadorOsMarketingMaterials.createdAt)),
    db.select().from(ambassadorOsCampaigns).where(and(eq(ambassadorOsCampaigns.status, "ACTIVE"), eq(ambassadorOsCampaigns.officialDataVerified, true))),
    db.select().from(ambassadorOsCampaignAcknowledgements).where(eq(ambassadorOsCampaignAcknowledgements.ambassadorId, req.user!.userId)),
    db.select().from(ambassadorOsCampaignGuidelines),
  ]);
  const campaignsById = new Map(campaigns.map((item) => [item._id, item]));
  const currentVersion = new Map<string, number>();
  for (const guideline of guidelines) currentVersion.set(guideline.campaignId, Math.max(currentVersion.get(guideline.campaignId) ?? 0, guideline.version));
  const visible = materials.filter((item) => {
    const campaign = campaignsById.get(item.campaignId);
    const latestVersion = currentVersion.get(item.campaignId);
    const acknowledged = latestVersion !== undefined && acknowledgements.some((ack) => ack.campaignId === item.campaignId && ack.guidelineVersion === latestVersion);
    return Boolean(campaign && acknowledged && (!item.validFrom || item.validFrom <= now) && (!item.validTo || item.validTo > now));
  });
  res.json({ materials: visible });
});

router.post("/marketing-materials", async (req: AuthedRequest, res) => {
  if (req.user!.role !== "AMBASSADOR") return res.status(403).json({ error: "Ambassadors only" });
  const parsed = marketingMaterialCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid marketing material" });
  const db = getDb();
  const [profile] = await db.select().from(ambassadorOsProfiles).where(eq(ambassadorOsProfiles.userId, req.user!.userId));
  const [account] = await db.select({ onboardingVerified: users.onboardingVerified }).from(users).where(eq(users._id, req.user!.userId));
  if (!profile?.termsAcceptedAt || !account?.onboardingVerified || profile.status !== "ACTIVE") return res.status(403).json({ error: "Only verified, terms-accepting, active Ambassadors may submit marketing material" });
  const [campaign] = await db.select().from(ambassadorOsCampaigns).where(and(eq(ambassadorOsCampaigns._id, parsed.data.campaignId), eq(ambassadorOsCampaigns.status, "ACTIVE"), eq(ambassadorOsCampaigns.officialDataVerified, true)));
  if (!campaign) return res.status(404).json({ error: "Active verified campaign not found" });
  const published = await db.select().from(ambassadorOsCampaignGuidelines).where(eq(ambassadorOsCampaignGuidelines.campaignId, campaign._id));
  const latest = published.sort((a, b) => b.version - a.version)[0];
  if (!latest) return res.status(409).json({ error: "Approved campaign marketing guidelines are not published yet" });
  const [ack] = await db.select().from(ambassadorOsCampaignAcknowledgements).where(and(eq(ambassadorOsCampaignAcknowledgements.campaignId, campaign._id), eq(ambassadorOsCampaignAcknowledgements.ambassadorId, req.user!.userId), eq(ambassadorOsCampaignAcknowledgements.guidelineVersion, latest.version)));
  if (!ack) return res.status(409).json({ error: "Acknowledge the current campaign marketing guidelines before submitting material" });
  const [material] = await db.insert(ambassadorOsMarketingMaterials).values({
    campaignId: campaign._id, title: parsed.data.title, channel: parsed.data.channel, content: parsed.data.content,
    assetUrl: parsed.data.assetUrl || null, status: "SUBMITTED", createdById: req.user!.userId, updatedAt: new Date(),
  }).returning();
  const admins = await db.select({ userId: users._id }).from(users).where(eq(users.role, "ADMIN"));
  await notifySafely(admins.map((item) => item.userId), { type: "ambassador_marketing_material_review", title: "Marketing material needs approval", message: material.title + " was submitted for review.", data: { screen: "AdminAmbassadorOperatingSystem", materialId: material._id }, actorUserId: req.user!.userId, priority: "normal", dedupeKey: material._id });
  await logAudit({ userId: req.user!.userId, action: "ambassador_os.marketing_material.submit", resourceType: "ambassador_os_marketing_material", resourceId: material._id, metadata: { campaignId: campaign._id, channel: material.channel, status: material.status } });
  res.status(201).json({ material, message: "Submitted for review. Only approved material is available for campaign sharing." });
});

const marketingMaterialReviewSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED", "RETIRED"]),
  reviewReason: z.string().trim().max(2000).optional(),
  validTo: z.string().datetime().nullable().optional(),
});
router.patch("/admin/marketing-materials/:id/review", requireOsStaffRole("PROGRAM_MANAGER"), async (req: AuthedRequest, res) => {
  const parsed = marketingMaterialReviewSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid marketing material review" });
  if (parsed.data.status === "REJECTED" && !parsed.data.reviewReason?.trim()) return res.status(400).json({ error: "A reason is required when rejecting material" });
  const db = getDb();
  const [current] = await db.select().from(ambassadorOsMarketingMaterials).where(eq(ambassadorOsMarketingMaterials._id, String(req.params.id)));
  if (!current) return res.status(404).json({ error: "Marketing material not found" });
  if (current.status !== "SUBMITTED" && !(current.status === "APPROVED" && parsed.data.status === "RETIRED")) return res.status(409).json({ error: "Only submitted material can be approved/rejected; approved material can be retired" });
  const now = new Date();
  const validTo = parsed.data.validTo === undefined ? current.validTo : parsed.data.validTo ? new Date(parsed.data.validTo) : null;
  if (parsed.data.status === "APPROVED" && validTo && validTo <= now) return res.status(400).json({ error: "The material expiry must be in the future" });
  const [updated] = await db.update(ambassadorOsMarketingMaterials).set({
    status: parsed.data.status, reviewerId: req.user!.userId, reviewedAt: now, reviewReason: parsed.data.reviewReason ?? null,
    validFrom: parsed.data.status === "APPROVED" ? now : current.validFrom, validTo, updatedAt: now,
  }).where(and(eq(ambassadorOsMarketingMaterials._id, current._id), eq(ambassadorOsMarketingMaterials.status, current.status))).returning();
  if (!updated) return res.status(409).json({ error: "Material changed during review; refresh and retry" });
  await logAudit({ userId: req.user!.userId, action: "ambassador_os.marketing_material.review", resourceType: "ambassador_os_marketing_material", resourceId: updated._id, metadata: { previousStatus: current.status, status: updated.status, reason: updated.reviewReason } });
  await notifySafely([current.createdById], {
    type: "ambassador_marketing_material_reviewed",
    title: "Marketing material review updated",
    message: "Your marketing material " + updated.title + (updated.status === "APPROVED" ? " is approved for the valid period." : updated.status === "REJECTED" ? " needs changes: " + (updated.reviewReason ?? "") : " has been retired."),
    data: { screen: "AmbassadorOperatingSystem", materialId: updated._id, status: updated.status },
    actorUserId: req.user!.userId, priority: updated.status === "REJECTED" ? "high" : "normal",
    dedupeKey: updated._id + ":" + updated.status + ":" + now.toISOString(),
  });
  res.json({ material: updated });
});

export default router;
