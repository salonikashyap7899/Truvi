import { Router } from "express";
import { and, desc, eq, or } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../config/db";
import {
  ambassadorOsCampaigns,
  ambassadorOsIncentivePolicies,
  ambassadorOsIncentives,
  ambassadorOsProfiles,
  ambassadorOsTasks,
  ambassadorOsTrainingProgress,
  leads,
  projects,
  siteVisits,
  units,
  users,
} from "../db/schema";
import { authenticate, requireRole, AuthedRequest } from "../middleware/auth";
import { logAudit } from "../services/audit";

const router = Router();
router.use(authenticate);

type Question = { prompt: string; options: string[]; answer: number };
type TrainingModule = {
  day: number; title: string; summary: string; lesson: string;
  keyPoints: string[]; assignment: string; questions: Question[];
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

function safeModule(module: TrainingModule) {
  return {
    day: module.day,
    title: module.title,
    summary: module.summary,
    lesson: module.lesson,
    keyPoints: module.keyPoints,
    assignment: module.assignment,
    questions: module.questions.map(({ prompt, options }) => ({ prompt, options })),
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
  const [account] = await db.select().from(users).where(eq(users._id, req.user!.userId));
  const [progress, tasks, campaigns, incentives, ownLeads, registeredLeadRows] = await Promise.all([
    db.select().from(ambassadorOsTrainingProgress).where(eq(ambassadorOsTrainingProgress.userId, req.user!.userId)),
    db.select().from(ambassadorOsTasks).where(eq(ambassadorOsTasks.assignedToId, req.user!.userId)).orderBy(desc(ambassadorOsTasks.createdAt)),
    db.select().from(ambassadorOsCampaigns).where(and(eq(ambassadorOsCampaigns.status, "ACTIVE"), eq(ambassadorOsCampaigns.officialDataVerified, true))).orderBy(desc(ambassadorOsCampaigns.createdAt)),
    db.select().from(ambassadorOsIncentives).where(eq(ambassadorOsIncentives.userId, req.user!.userId)).orderBy(desc(ambassadorOsIncentives.createdAt)),
    db.select({ _id: leads._id, stage: leads.stage }).from(leads).where(eq(leads.submittedById, req.user!.userId)),
    db.select({ projectId: leads.projectId, isDuplicate: leads.isDuplicate }).from(leads).where(or(eq(leads.stage, "REGISTRATION"), eq(leads.stage, "COMPLETED"))),
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
    registered: ownLeads.filter((l) => ["REGISTRATION", "COMPLETED"].includes(l.stage)).length,
    lost: ownLeads.filter((l) => l.stage === "LOST").length,
  };
  res.json({
    profile: displayProfile(profile),
    verification: { emailVerified: account?.emailVerified ?? false, phoneVerified: account?.phoneVerified ?? false, onboardingVerified: account?.onboardingVerified ?? false },
    modules,
    tasks,
    campaigns: campaigns.map((c) => ({
      id: c._id, projectId: c.projectId, name: c.name, projectName: c.projectName, location: c.location,
      targetInventory: c.targetInventory, salesTarget: c.salesTarget,
      verifiedSales: registeredLeadRows.filter((lead) => lead.projectId === c.projectId && !lead.isDuplicate).length,
      unitAreaSqFt: c.unitAreaSqFt, targetDays: c.targetDays, status: c.status,
    })),
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
router.get("/leaderboard", requireRole("ADMIN", "AMBASSADOR"), async (req: AuthedRequest, res) => {
  const db = getDb();
  const [profileRows, completedModules, approvedTasks, allLeads, completedVisits] = await Promise.all([
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
    db.select({ _id: leads._id, submittedById: leads.submittedById, referralChain: leads.referralChain, stage: leads.stage, isDuplicate: leads.isDuplicate }).from(leads),
    db.select({ leadId: siteVisits.leadId })
      .from(siteVisits)
      .where(eq(siteVisits.status, "COMPLETED")),
  ]);
  const visitLeadIds = new Set(completedVisits.map((v) => v.leadId).filter(Boolean));
  const rows = profileRows.map(({ profile, name }) => {
    const attributed = allLeads.filter((lead) =>
      lead.submittedById === profile.userId || (lead.referralChain ?? []).some((referral) => referral.userId === profile.userId)
    );
    const nonDuplicate = attributed.filter((lead) => !lead.isDuplicate);
    const moduleCount = completedModules.filter((module) => module.userId === profile.userId).length;
    const taskCount = approvedTasks.filter((task) => task.userId === profile.userId).length;
    const siteVisitCount = nonDuplicate.filter((lead) => visitLeadIds.has(lead._id)).length;
    const saleCount = nonDuplicate.filter((lead) => ["REGISTRATION", "COMPLETED"].includes(lead.stage)).length;
    const lostCount = attributed.filter((lead) => lead.stage === "LOST" && !lead.isDuplicate).length;
    const duplicateCount = attributed.filter((lead) => lead.isDuplicate).length;
    const qualityScore = Math.max(0, moduleCount * 2 + taskCount * 5 + siteVisitCount * 8 + saleCount * 25 - lostCount * 2 - duplicateCount * 3);
    const nameParts = name.trim().split(/\s+/).filter(Boolean);
    const displayName = nameParts.length > 1 ? `${nameParts[0]} ${nameParts[nameParts.length - 1][0]}.` : (nameParts[0] ?? "Ambassador");
    return {
      userId: profile.userId,
      displayName,
      ambassadorId: `TRUVI-${profile.cityCode}-${String(profile.ambassadorNo).padStart(4, "0")}`,
      currentLevel: profile.currentLevel,
      modulesCompleted: moduleCount,
      approvedTasks: taskCount,
      completedSiteVisits: siteVisitCount,
      verifiedSales: saleCount,
      lostLeads: lostCount,
      duplicateLeads: duplicateCount,
      qualityScore,
    };
  }).sort((a, b) => b.qualityScore - a.qualityScore || a.ambassadorId.localeCompare(b.ambassadorId))
    .map((row, index) => ({ rank: index + 1, ...row }));
  res.json({
    scoring: { moduleCompleted: 2, approvedTask: 5, completedSiteVisit: 8, verifiedSale: 25, lostLeadPenalty: 2, duplicateLeadPenalty: 3 },
    leaderboard: rows.slice(0, 10),
    mine: rows.find((row) => row.userId === req.user!.userId) ?? null,
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
  const [account] = await db.select().from(users).where(eq(users._id, req.user!.userId));
  const progress = await db.select().from(ambassadorOsTrainingProgress).where(eq(ambassadorOsTrainingProgress.userId, req.user!.userId));
  const byDay = new Map(progress.map((p) => [p.day, p]));
  res.json({ modules: MODULES.map((m) => {
    const previousComplete = m.day === 1 || byDay.get(m.day - 1)?.status === "COMPLETED";
    return { ...safeModule(m), unlocked: previousComplete && Boolean(profile.termsAcceptedAt) && account?.onboardingVerified === true, progress: byDay.get(m.day) ?? null };
  })});
});

const quizSubmitSchema = z.object({
  answers: z.array(z.number().int().min(0).max(3)).length(5),
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
  if (day > 1 && existing.find((row) => row.day === day - 1)?.status !== "COMPLETED") {
    return res.status(409).json({ error: "Complete the previous training day and receive trainer approval before proceeding" });
  }
  const module = MODULES[day - 1];
  const correct = parsed.data.answers.reduce((sum, answer, i) => sum + (answer === module.questions[i].answer ? 1 : 0), 0);
  const quizScore = correct * 20;
  const status = quizScore >= 80 ? "ASSESSMENT_PENDING" as const : "RETAKE_REQUIRED" as const;
  const now = new Date();
  const [progress] = await db.insert(ambassadorOsTrainingProgress).values({
    userId: req.user!.userId, day, quizScore, answers: parsed.data.answers, assignmentText: parsed.data.assignmentText,
    practicalStatus: "PENDING", ethicsStatus: "PENDING", status, trainerFeedback: null,
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

router.post("/tasks/:id/start", async (req: AuthedRequest, res) => {
  if (req.user!.role !== "AMBASSADOR") return res.status(403).json({ error: "Ambassadors only" });
  const db = getDb();
  const [task] = await db.select().from(ambassadorOsTasks).where(and(eq(ambassadorOsTasks._id, String(req.params.id)), eq(ambassadorOsTasks.assignedToId, req.user!.userId)));
  if (!task) return res.status(404).json({ error: "Task not found" });
  if (task.status !== "ASSIGNED") return res.status(409).json({ error: "Only assigned tasks can be started" });
  if (task.category !== "TRAINING") {
    const [profile] = await db.select().from(ambassadorOsProfiles).where(eq(ambassadorOsProfiles.userId, req.user!.userId));
    const [account] = await db.select({ onboardingVerified: users.onboardingVerified }).from(users).where(eq(users._id, req.user!.userId));
    if (!profile?.termsAcceptedAt || !account?.onboardingVerified || profile.status !== "ACTIVE") {
      return res.status(403).json({ error: "Complete verification, certification and activation before starting sales or field tasks", code: "AMBASSADOR_ACTIVATION_REQUIRED" });
    }
  }
  const [updated] = await db.update(ambassadorOsTasks).set({ status: "IN_PROGRESS" }).where(and(eq(ambassadorOsTasks._id, task._id), eq(ambassadorOsTasks.status, "ASSIGNED"))).returning();
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
  if (!["ASSIGNED", "IN_PROGRESS", "REJECTED"].includes(task.status)) return res.status(409).json({ error: "This task cannot accept a submission in its current state" });
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
  }).where(eq(ambassadorOsTasks._id, task._id)).returning();
  await logAudit({ userId: req.user!.userId, action: "ambassador_os.task.submit", resourceType: "ambassador_os_task", resourceId: updated._id, metadata: { status: updated.status, category: updated.category } });
  res.json({ task: updated });
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
  trainerFeedback: z.string().trim().max(2000).optional(),
});

router.patch("/admin/training/:userId/:day/review", requireRole("ADMIN"), async (req: AuthedRequest, res) => {
  const day = Number(String(req.params.day));
  if (!Number.isInteger(day) || day < 1 || day > 7) return res.status(400).json({ error: "Training day must be between 1 and 7" });
  const parsed = reviewSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid review" });
  const db = getDb();
  const [current] = await db.select().from(ambassadorOsTrainingProgress).where(and(eq(ambassadorOsTrainingProgress.userId, String(req.params.userId)), eq(ambassadorOsTrainingProgress.day, day)));
  if (!current) return res.status(404).json({ error: "Training submission not found" });
  const practicalStatus = parsed.data.practicalStatus ?? current.practicalStatus;
  const ethicsStatus = parsed.data.ethicsStatus ?? current.ethicsStatus;
  const canComplete = current.quizScore >= 80 && practicalStatus === "APPROVED" && ethicsStatus === "APPROVED";
  const status = canComplete ? "COMPLETED" as const : (current.quizScore < 80 || practicalStatus === "REJECTED" || ethicsStatus === "REJECTED" ? "RETAKE_REQUIRED" as const : "ASSESSMENT_PENDING" as const);
  const now = new Date();
  const [updated] = await db.update(ambassadorOsTrainingProgress).set({
    practicalStatus, ethicsStatus, trainerFeedback: parsed.data.trainerFeedback ?? current.trainerFeedback,
    status, reviewedById: req.user!.userId, reviewedAt: now, completedAt: canComplete ? (current.completedAt ?? now) : null, updatedAt: now,
  }).where(eq(ambassadorOsTrainingProgress._id, current._id)).returning();
  const profile = await ensureProfile(String(req.params.userId));
  const all = await db.select().from(ambassadorOsTrainingProgress).where(eq(ambassadorOsTrainingProgress.userId, String(req.params.userId)));
  const allComplete = all.some((p) => p.day === 7 && p.status === "COMPLETED");
  const completedDaySeven = all.some((p) => p.day === 7 && p.status === "COMPLETED");
  const certificateNo = completedDaySeven
    ? (profile.certificateNo ?? `TRUVI-CERT-${String(profile.ambassadorNo).padStart(6, "0")}`)
    : null;
  await db.update(ambassadorOsProfiles).set({
    status: allComplete ? "CERTIFIED" : canComplete ? "TRAINING_IN_PROGRESS" : "ASSESSMENT_PENDING",
    certificateNo,
    certifiedAt: completedDaySeven ? (profile.certifiedAt ?? now) : null,
    certifiedById: completedDaySeven ? (profile.certifiedById ?? req.user!.userId) : null,
    updatedAt: now,
  }).where(eq(ambassadorOsProfiles.userId, String(req.params.userId)));
  await logAudit({ userId: req.user!.userId, action: "ambassador_os.training.review", resourceType: "ambassador_os_training", resourceId: updated._id, metadata: { ambassadorId: displayProfile(profile).ambassadorId, day, status, practicalStatus, ethicsStatus } });
  res.json({ progress: updated });
});

const statusSchema = z.object({
  status: z.enum(["REGISTERED", "VERIFICATION_PENDING", "TRAINING_IN_PROGRESS", "ASSESSMENT_PENDING", "CERTIFIED", "ACTIVE", "TEMPORARILY_INACTIVE", "SUSPENDED", "EXITED"]).optional(),
  currentLevel: z.enum(["L0", "L1", "L2", "L3", "L4", "L5", "L6"]).optional(),
  promotionReason: z.string().trim().min(5).max(2000).optional(),
}).refine((body) => body.status !== undefined || body.currentLevel !== undefined, { message: "Provide a status or career level" })
  .refine((body) => body.currentLevel === undefined || Boolean(body.promotionReason?.trim()), { message: "A promotion reason is required for every career-level change" });

router.patch("/admin/profiles/:userId", requireRole("ADMIN"), async (req: AuthedRequest, res) => {
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid profile update" });
  const db = getDb();
  const [profile] = await db.select().from(ambassadorOsProfiles).where(eq(ambassadorOsProfiles.userId, String(req.params.userId)));
  if (!profile) return res.status(404).json({ error: "Ambassador profile not found" });
  const [account] = await db.select().from(users).where(eq(users._id, profile.userId));
  const training = await db.select().from(ambassadorOsTrainingProgress).where(eq(ambassadorOsTrainingProgress.userId, profile.userId));
  const { promotionReason, ...updates } = parsed.data;
  if (parsed.data.currentLevel && parsed.data.currentLevel !== profile.currentLevel) {
    const levelNumber = Number(parsed.data.currentLevel.slice(1));
    if (levelNumber >= 1 && !training.some((p) => p.day === 7 && p.status === "COMPLETED")) {
      return res.status(409).json({ error: "Complete all seven modules and receive written, practical and ethics approval before promotion to L1 or above" });
    }
    if (levelNumber >= 2 && profile.status !== "ACTIVE" && parsed.data.status !== "ACTIVE") {
      return res.status(409).json({ error: "Formal activation is required before promotion to L2 or above" });
    }
    if (levelNumber >= 3) {
      const registered = await db.select({ _id: leads._id, submittedById: leads.submittedById, referralChain: leads.referralChain, stage: leads.stage, isDuplicate: leads.isDuplicate })
        .from(leads).where(or(eq(leads.stage, "REGISTRATION"), eq(leads.stage, "COMPLETED")));
      const hasVerifiedSale = registered.some((lead) => !lead.isDuplicate && (lead.submittedById === profile.userId || (lead.referralChain ?? []).some((referral) => referral.userId === profile.userId)));
      if (!hasVerifiedSale) return res.status(409).json({ error: "Promotion to L3 or above requires at least one non-duplicate registered/completed sale attributed to this Ambassador" });
    }
  }
  if (parsed.data.status === "ACTIVE") {
    if (!profile.termsAcceptedAt || !account?.onboardingVerified || !training.some((p) => p.day === 7 && p.status === "COMPLETED")) {
      return res.status(409).json({ error: "Activation requires accepted terms, verified onboarding, and completed seven-day certification" });
    }
  }
  if (parsed.data.status === "CERTIFIED" && !training.some((p) => p.day === 7 && p.status === "COMPLETED")) {
    return res.status(409).json({ error: "Certification requires all seven modules, quiz, practical and ethics approvals" });
  }
  const [updated] = await db.update(ambassadorOsProfiles).set({ ...updates, updatedAt: new Date() }).where(eq(ambassadorOsProfiles.userId, profile.userId)).returning();
  await logAudit({ userId: req.user!.userId, action: "ambassador_os.profile.admin_update", resourceType: "ambassador_os_profile", resourceId: updated._id, metadata: { ...updates, promotionReason: promotionReason ?? null } });
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

router.get("/admin/tasks", requireRole("ADMIN"), async (_req: AuthedRequest, res) => {
  const rows = await getDb().select({ task: ambassadorOsTasks, ambassadorName: users.name, ambassadorEmail: users.email }).from(ambassadorOsTasks).innerJoin(users, eq(ambassadorOsTasks.assignedToId, users._id)).orderBy(desc(ambassadorOsTasks.createdAt));
  res.json({ tasks: rows.map((row) => ({ ...row.task, ambassadorName: row.ambassadorName, ambassadorEmail: row.ambassadorEmail })) });
});

router.post("/admin/tasks", requireRole("ADMIN"), async (req: AuthedRequest, res) => {
  const parsed = createTaskSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid task" });
  const db = getDb();
  const [assignee] = await db.select().from(users).where(eq(users._id, parsed.data.assignedToId));
  if (!assignee || assignee.role !== "AMBASSADOR") return res.status(400).json({ error: "Task assignee must be an existing Ambassador account" });
  const [task] = await db.insert(ambassadorOsTasks).values({
    title: parsed.data.title, category: parsed.data.category, description: parsed.data.description,
    assignedToId: parsed.data.assignedToId, dueAt: parsed.data.dueAt ? new Date(parsed.data.dueAt) : null,
    campaignId: parsed.data.campaignId ?? null, createdById: req.user!.userId,
  }).returning();
  await logAudit({ userId: req.user!.userId, action: "ambassador_os.task.create", resourceType: "ambassador_os_task", resourceId: task._id, metadata: { title: task.title, category: task.category, assignedToId: task.assignedToId } });
  res.status(201).json({ task });
});

const taskReviewSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED", "CLOSED"]),
  reviewReason: z.string().trim().max(2000).optional(),
});

router.patch("/admin/tasks/:id/review", requireRole("ADMIN"), async (req: AuthedRequest, res) => {
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
  }).where(eq(ambassadorOsTasks._id, task._id)).returning();
  await logAudit({ userId: req.user!.userId, action: "ambassador_os.task.review", resourceType: "ambassador_os_task", resourceId: updated._id, metadata: { status: updated.status, reviewReason: updated.reviewReason } });
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
  const rows = req.user!.role === "ADMIN"
    ? await db.select().from(ambassadorOsCampaigns).orderBy(desc(ambassadorOsCampaigns.createdAt))
    : await db.select().from(ambassadorOsCampaigns).where(and(eq(ambassadorOsCampaigns.status, "ACTIVE"), eq(ambassadorOsCampaigns.officialDataVerified, true))).orderBy(desc(ambassadorOsCampaigns.createdAt));
  res.json({ campaigns: rows });
});

router.post("/admin/campaigns", requireRole("ADMIN"), async (req: AuthedRequest, res) => {
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

router.patch("/admin/campaigns/:id", requireRole("ADMIN"), async (req: AuthedRequest, res) => {
  const parsed = campaignUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid campaign update" });
  const db = getDb();
  const [current] = await db.select().from(ambassadorOsCampaigns).where(eq(ambassadorOsCampaigns._id, String(req.params.id)));
  if (!current) return res.status(404).json({ error: "Campaign not found" });
  const projectId = parsed.data.projectId ?? current.projectId;
  const isBeingPublished = parsed.data.status === "ACTIVE" || parsed.data.officialDataVerified === true;
  if (parsed.data.status === "ACTIVE" && !(parsed.data.officialDataVerified ?? current.officialDataVerified)) {
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
  res.json({ campaign: updated });
});

const policySchema = z.object({
  name: z.string().trim().min(3).max(180),
  campaignId: z.string().uuid().optional(),
  calculationType: z.enum(["FIXED", "PER_SQ_FT_BLOCK", "PERCENT_OF_VALUE"]),
  amount: z.number().positive().max(100_000_000),
  blockSizeSqFt: z.number().int().positive().max(1_000_000).optional(),
  effectiveFrom: z.string().datetime().optional(),
});

router.post("/admin/policies", requireRole("ADMIN"), async (req: AuthedRequest, res) => {
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
    blockSizeSqFt: parsed.data.blockSizeSqFt ?? 1000,
    version, active: false, approvalReference: null,
    effectiveFrom: parsed.data.effectiveFrom ? new Date(parsed.data.effectiveFrom) : null,
    createdById: req.user!.userId,
  }).returning();
  await logAudit({ userId: req.user!.userId, action: "ambassador_os.policy.create", resourceType: "ambassador_os_incentive_policy", resourceId: policy._id, metadata: { name: policy.name, version, calculationType: policy.calculationType, active: false } });
  res.status(201).json({ policy, message: "Policy created inactive. Add written approval evidence before activation." });
});

const policyActivationSchema = z.object({ active: z.boolean(), approvalReference: z.string().trim().max(500).optional(), effectiveFrom: z.string().datetime().optional() });

router.patch("/admin/policies/:id", requireRole("ADMIN"), async (req: AuthedRequest, res) => {
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

const createIncentiveSchema = z.object({
  userId: z.string().uuid(),
  leadId: z.string().uuid(),
  policyId: z.string().uuid(),
  verifiedAreaSqFt: z.number().int().positive().max(10_000_000),
  bookingValue: z.number().nonnegative().optional(),
});

router.get("/incentives/me", async (req: AuthedRequest, res) => {
  if (req.user!.role !== "AMBASSADOR") return res.status(403).json({ error: "Ambassadors only" });
  const incentives = await getDb().select().from(ambassadorOsIncentives).where(eq(ambassadorOsIncentives.userId, req.user!.userId)).orderBy(desc(ambassadorOsIncentives.createdAt));
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
  const [lead] = await db.select().from(leads).where(eq(leads._id, parsed.data.leadId));
  if (!lead) return res.status(404).json({ error: "Lead/booking reference not found" });
  if (!["REGISTRATION", "COMPLETED"].includes(lead.stage)) return res.status(409).json({ error: "Incentives require a registered or completed sale, not merely a submitted lead or booking" });
  const attributionPresent = lead.submittedById === ambassador._id || (lead.referralChain ?? []).some((referral) => referral.userId === ambassador._id);
  if (!attributionPresent || lead.isDuplicate || lead.stage === "LOST") return res.status(409).json({ error: "Verified referral attribution is required for an eligible non-duplicate sale" });
  const [policy] = await db.select().from(ambassadorOsIncentivePolicies).where(eq(ambassadorOsIncentivePolicies._id, parsed.data.policyId));
  if (!policy || !policy.active || !policy.approvalReference?.trim()) return res.status(409).json({ error: "The selected incentive policy is not active and approved" });
  if (policy.effectiveFrom && policy.effectiveFrom.getTime() > Date.now()) return res.status(409).json({ error: "The selected incentive policy is not effective yet" });
  if (policy.campaignId) {
    const [campaign] = await db.select().from(ambassadorOsCampaigns).where(eq(ambassadorOsCampaigns._id, policy.campaignId));
    if (!campaign || campaign.status !== "ACTIVE" || !campaign.officialDataVerified || campaign.projectId !== lead.projectId) {
      return res.status(409).json({ error: "This incentive policy only applies to eligible registered sales within its verified active campaign project" });
    }
  }
  const [existingIncentive] = await db.select().from(ambassadorOsIncentives).where(eq(ambassadorOsIncentives.bookingReference, lead._id));
  if (existingIncentive) return res.status(409).json({ error: "An incentive record already exists for this sale reference" });
  const amount = policy.calculationType === "FIXED"
    ? policy.amount
    : policy.calculationType === "PER_SQ_FT_BLOCK"
      ? Math.floor(parsed.data.verifiedAreaSqFt / policy.blockSizeSqFt) * policy.amount
      : ((parsed.data.bookingValue ?? 0) * policy.amount) / 100;
  if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: "Verified area/value does not meet the selected policy's minimum calculation basis" });
  const [incentive] = await db.insert(ambassadorOsIncentives).values({
    userId: ambassador._id, campaignId: policy.campaignId, policyId: policy._id,
    policyNameSnapshot: policy.name, policyVersion: policy.version, bookingReference: lead._id,
    verifiedAreaSqFt: parsed.data.verifiedAreaSqFt, propertyValue: parsed.data.bookingValue ?? null,
    amount, status: "PENDING", createdById: req.user!.userId,
  }).returning();
  await logAudit({ userId: req.user!.userId, action: "ambassador_os.incentive.create", resourceType: "ambassador_os_incentive", resourceId: incentive._id, metadata: { userId: ambassador._id, policyId: policy._id, policyVersion: policy.version, amount } });
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
  const allowed: Record<string, string[]> = { PENDING: ["APPROVED", "CANCELLED"], APPROVED: ["PAYABLE", "CANCELLED"], PAYABLE: ["PAID", "CANCELLED"], PAID: [], CANCELLED: [] };
  if (!allowed[current.status].includes(parsed.data.status)) return res.status(409).json({ error: `Invalid payout transition: ${current.status} → ${parsed.data.status}` });
  if (parsed.data.status === "PAID" && !parsed.data.paymentReference?.trim()) return res.status(400).json({ error: "Payment reference/receipt is required before marking an incentive paid" });
  const now = new Date();
  const [updated] = await db.update(ambassadorOsIncentives).set({
    status: parsed.data.status,
    paymentReference: parsed.data.paymentReference ?? current.paymentReference,
    approvedById: parsed.data.status === "APPROVED" ? req.user!.userId : current.approvedById,
    approvedAt: parsed.data.status === "APPROVED" ? now : current.approvedAt,
    paidAt: parsed.data.status === "PAID" ? now : current.paidAt,
  }).where(eq(ambassadorOsIncentives._id, current._id)).returning();
  await logAudit({ userId: req.user!.userId, action: "ambassador_os.incentive.status", resourceType: "ambassador_os_incentive", resourceId: updated._id, metadata: { from: current.status, to: updated.status, paymentReference: updated.paymentReference } });
  res.json({ incentive: updated });
});

export default router;
