import "dotenv/config";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { connectDb, closeDb } from "../db";
import {
  users,
  projects,
  units,
  leads,
  siteVisits,
  commissions,
  notifications,
  posts,
  investments,
  loanChecks,
  enquiries,
  buyerDocuments,
  sharedDocuments,
  projectAssets,
  courseProgress,
  leadPurchases,
  ambassadorTasks,
  LeadStage,
  UnitStatus,
  CommissionMilestone,
} from "../db/schema";
import { calculateCommission, buildMilestones } from "../services/commissionCalculator";

const CITIES = [
  { city: "Hyderabad", locations: ["Gachibowli", "Kondapur", "Financial District"] },
  { city: "Bengaluru", locations: ["Whitefield", "Sarjapur Road", "Electronic City"] },
  { city: "Mumbai", locations: ["Thane West", "Powai", "Andheri East"] },
  { city: "Pune", locations: ["Hinjewadi", "Baner", "Wagholi"] },
];

const FIRST_NAMES = ["Priya", "Arjun", "Ananya", "Rohit", "Kavya", "Vikram", "Sneha", "Aditya", "Meera", "Karthik", "Divya", "Rahul", "Pooja", "Sanjay", "Nisha"];
const LAST_NAMES = ["Sharma", "Reddy", "Iyer", "Nair", "Gupta", "Rao", "Menon", "Verma", "Patel", "Kapoor"];

const randomName = () => `${FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)]} ${LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)]}`;
const randomPhone = () => `${["6", "7", "8", "9"][Math.floor(Math.random() * 4)]}${Math.floor(10000000 + Math.random() * 89999999)}`;
const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];

async function seed() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Add your Supabase Postgres connection string to server/.env before seeding."
    );
  }

  console.log("Connecting to Supabase (Postgres)...");
  const db = connectDb(url);
  await db.execute("select 1");

  console.log("Clearing existing data...");
  // Children first — Postgres enforces the foreign keys. ambassador_tasks
  // references users (created_by_id / accepted_by_id), so it must be cleared
  // before users or the users delete throws a foreign-key violation.
  await db.delete(ambassadorTasks);
  await db.delete(commissions);
  await db.delete(siteVisits);
  await db.delete(leads);
  await db.delete(units);
  await db.delete(projectAssets);
  await db.delete(sharedDocuments);
  await db.delete(enquiries);
  await db.delete(projects);
  await db.delete(notifications);
  await db.delete(posts);
  await db.delete(investments);
  await db.delete(loanChecks);
  await db.delete(buyerDocuments);
  await db.delete(courseProgress);
  await db.delete(leadPurchases);
  await db.delete(users);

  console.log("Seeding Truvi database...");
  const hashedPassword = await bcrypt.hash("Password123!", 12);

  // --- Admins ---
  const [adminUser] = await db
    .insert(users)
    .values({
      name: "Truvi Admin",
      email: "admin@truvi.app",
      password: hashedPassword,
      role: "ADMIN",
      approvalStatus: "APPROVED",
      phone: randomPhone(),
    })
    .returning();

  await db.insert(users).values({
    name: "Truvi Founder",
    email: "founder@truvi.app",
    password: hashedPassword,
    role: "ADMIN",
    approvalStatus: "APPROVED",
    phone: randomPhone(),
  });

  // --- Developers: 3 approved, 1 pending ---
  const developerData = [
    { name: "Skyline Developers", email: "dev1@truvi.app", company: "Skyline Developers Pvt Ltd", status: "APPROVED" },
    { name: "Horizon Realty", email: "dev2@truvi.app", company: "Horizon Realty LLP", status: "APPROVED" },
    { name: "Prestige Builders", email: "dev3@truvi.app", company: "Prestige Builders India", status: "APPROVED" },
    { name: "Newline Constructions", email: "dev4@truvi.app", company: "Newline Constructions Pvt Ltd", status: "PENDING" },
  ] as const;

  const developers = [];
  for (const d of developerData) {
    const [user] = await db
      .insert(users)
      .values({
        name: d.name,
        email: d.email,
        password: hashedPassword,
        role: "DEVELOPER",
        approvalStatus: d.status,
        phone: randomPhone(),
        developerProfile: { companyName: d.company, reraNumber: `RERA-${Math.floor(100000 + Math.random() * 899999)}` },
      })
      .returning();
    developers.push(user);
  }
  const approvedDevelopers = developers.filter((_, i) => developerData[i].status === "APPROVED");

  // --- CPs: 8 across all 4 tiers ---
  const cpTierPlan = [
    { tier: "SILVER", bookings: 2 }, { tier: "SILVER", bookings: 0 },
    { tier: "GOLD", bookings: 7 }, { tier: "GOLD", bookings: 5 },
    { tier: "PLATINUM", bookings: 18 }, { tier: "PLATINUM", bookings: 15 },
    { tier: "DIAMOND", bookings: 35 }, { tier: "DIAMOND", bookings: 30 },
  ] as const;

  const cps = [];
  for (let i = 0; i < cpTierPlan.length; i++) {
    const plan = cpTierPlan[i];
    const [user] = await db
      .insert(users)
      .values({
        name: randomName(),
        email: `cp${i + 1}@truvi.app`,
        password: hashedPassword,
        role: "CP",
        approvalStatus: "APPROVED",
        phone: randomPhone(),
        onboardingVerified: true,
        onboardingChecks: { aadhaarVerified: true, phoneVerified: true, emailVerified: true },
        cpTier: plan.tier,
        cpProfile: {
          totalBookings: plan.bookings,
          conversionRatio: Math.round((plan.bookings / (plan.bookings + 10)) * 100) / 100,
          isPremium: i % 3 === 0,
          premiumExpiresAt: null,
        },
      })
      .returning();
    cps.push(user);
  }

  // --- Projects: 4, with 15-30 units each ---
  const projectRows = [];
  for (let i = 0; i < 4; i++) {
    const dev = approvedDevelopers[i % approvedDevelopers.length];
    // The prime/featured project is the real Prime Estate, Kasmandi plotted
    // township — it carries the actual master-plan image for the 3D board.
    const isPrime = i === 0;
    const cityInfo = isPrime ? { city: "Lucknow", locations: ["Kasmandi"] } : pick(CITIES);
    const location = isPrime ? "Kasmandi" : pick(cityInfo.locations);
    const [project] = await db
      .insert(projects)
      .values({
        developerId: dev._id,
        name: isPrime
          ? "Prime Estate, Kasmandi"
          : `${pick(["Emerald", "Sapphire", "Crest", "Meridian", "Solace"])} ${pick(["Heights", "Residency", "Enclave", "Towers"])}`,
        description: isPrime
          ? "A premium plotted township at Kasmandi, Lucknow — residential plots, premium villas, farmhouses, a central park with water bodies, clubhouse and sports facilities. Explore the full master plan in 3D."
          : "A thoughtfully designed residential development with modern amenities, verified RERA compliance, and flexible unit configurations.",
        city: cityInfo.city,
        location,
        masterPlanUrl: isPrime ? "/masterplans/prime-estate-kasmandi.jpg" : null,
        // Satellite embed of the real locality so "View in 3D" works out of
        // the box; admins replace this with a Matterport/Sketchfab link.
        threeDModelUrl: `https://maps.google.com/maps?q=${encodeURIComponent(`${location}, ${cityInfo.city}`)}&t=k&z=17&output=embed`,
        reraNumber: `RERA-${Math.floor(100000 + Math.random() * 899999)}`,
        approvalStatus: "APPROVED",
        listingTier: i === 0 ? "FEATURED" : "STANDARD",
        featuredUntil: i === 0 ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) : null,
        isPrimeListing: i === 0,
        commissionPercent: [2.5, 3, 3.5, 3][i],
        // Fully Truvi-verified so listings show up (badges, trust score, risk
        // profile) across the public inventory and for every seller.
        isVerified: true,
        verifiedAt: new Date(),
        trustScore: [92, 88, 90, 85][i],
        legalRiskLevel: "LOW",
        floodRiskLevel: i % 2 === 0 ? "LOW" : "MEDIUM",
        crimeIndexLevel: "LOW",
        reraStatus: "REGISTERED",
        projectType: "RESIDENTIAL",
        verificationDetails: {
          reraVerified: true,
          titleClearance: true,
          encumbranceFree: true,
          constructionApproval: true,
          verificationSource: "Truvi verification team",
          portfolioVerified: true,
          lastVerifiedAt: new Date().toISOString(),
          notes: "Documents and site verified by the Truvi team.",
        },
      })
      .returning();
    projectRows.push(project);

    const unitCount = 15 + Math.floor(Math.random() * 16);
    for (let u = 0; u < unitCount; u++) {
      const roll = Math.random();
      const status: UnitStatus = roll < 0.55 ? "AVAILABLE" : roll < 0.7 ? "SOLD" : roll < 0.85 ? "RESERVED" : "LOCKED";
      const price = 4500000 + Math.floor(Math.random() * 8) * 750000;
      await db.insert(units).values({
        projectId: project._id,
        unitNumber: `${String.fromCharCode(65 + (u % 4))}-${100 + u}`,
        type: pick(["2BHK", "3BHK", "4BHK", "Plot 200sqyd"]),
        areaSqft: 900 + Math.floor(Math.random() * 1200),
        price,
        status,
        lockedByCPId: status === "LOCKED" ? pick(cps)._id : null,
        lockExpiresAt: status === "LOCKED" ? new Date(Date.now() + 20 * 60 * 1000) : null,
        priceHistory: [{ price, changedAt: new Date().toISOString() }],
      });
    }
  }

  // --- Leads: ~40 across all pipeline stages ---
  const stages: LeadStage[] = ["GENERATED", "ASSIGNED", "CONTACTED", "SITE_VISIT", "NEGOTIATION", "BOOKING", "REGISTRATION", "LOST"];
  const leadRows = [];
  for (let i = 0; i < 40; i++) {
    const project = pick(projectRows);
    const cp = pick(cps);
    const stage = stages[i % stages.length];
    const [lead] = await db
      .insert(leads)
      .values({
        projectId: project._id,
        submittedById: cp._id,
        assignedToId: cp._id,
        clientName: randomName(),
        clientPhone: randomPhone(),
        clientEmail: Math.random() > 0.5 ? `client${i}@example.com` : undefined,
        stage,
        source: pick(["CP", "Website", "Referral"]),
        notes: "Interested in a mid-floor unit, budget flexible.",
      })
      .returning();
    leadRows.push(lead);
  }

  // --- Site visits: ~15 ---
  const siteVisitLeads = leadRows.filter((l) => ["SITE_VISIT", "NEGOTIATION", "BOOKING", "REGISTRATION"].includes(l.stage)).slice(0, 15);
  for (const lead of siteVisitLeads) {
    await db.insert(siteVisits).values({
      leadId: lead._id,
      projectId: lead.projectId,
      cpId: lead.assignedToId!,
      scheduledAt: new Date(Date.now() - Math.floor(Math.random() * 10) * 24 * 60 * 60 * 1000),
      status: pick(["SCHEDULED", "COMPLETED", "COMPLETED", "NO_SHOW"] as const),
      attendanceConfirmed: Math.random() > 0.3,
      reportNotes: "Client liked the sample flat, requested price negotiation.",
    });
  }

  // --- Commissions: using the tested commission engine ---
  const bookingLeads = leadRows.filter((l) => ["BOOKING", "REGISTRATION"].includes(l.stage));
  for (const lead of bookingLeads) {
    const project = projectRows.find((p) => String(p._id) === String(lead.projectId))!;
    const bookingValue = 5000000 + Math.floor(Math.random() * 6) * 1000000;
    const calc = calculateCommission({ bookingValue, commissionPercent: project.commissionPercent });
    const milestoneBases = buildMilestones(calc.cpCommissionAmount);
    const releaseCount = Math.floor(Math.random() * 4);
    const milestones: CommissionMilestone[] = milestoneBases.map((m, idx) => ({
      _id: randomUUID(),
      ...m,
      isReleased: idx < releaseCount,
      releasedAt: idx < releaseCount ? new Date().toISOString() : null,
    }));

    await db.insert(commissions).values({
      leadId: lead._id,
      cpId: lead.assignedToId!,
      bookingValue,
      commissionPercent: project.commissionPercent,
      cpCommissionAmount: calc.cpCommissionAmount,
      platformFeeAmount: calc.platformFeeAmount,
      tdsAmount: calc.tdsAmount,
      status: releaseCount === 0 ? "PENDING" : releaseCount === milestones.length ? "PAID" : "MILESTONE_DUE",
      milestones,
    });
  }

  // --- Ambassador + demo verification tasks ---
  await db.insert(users).values({
    name: "Ravi Ambassador",
    email: "ambassador1@truvi.app",
    password: hashedPassword,
    role: "AMBASSADOR",
    approvalStatus: "APPROVED",
    phone: randomPhone(),
    onboardingVerified: true,
    onboardingChecks: { aadhaarVerified: true, phoneVerified: true, emailVerified: true },
  });

  const demoTasks = [
    {
      title: "Emerald Heights — Site Verification",
      address: "Gachibowli Main Road, Hyderabad, Telangana 500032",
      mapUrl: "https://maps.google.com/?q=Gachibowli+Hyderabad",
      days: 3,
      instructions: "Photograph the entrance, tower progress, and RERA board. Confirm construction activity.",
    },
    {
      title: "Sarjapur Road Plot — Boundary Check",
      address: "Sarjapur Road, Bengaluru, Karnataka 560035",
      mapUrl: "https://maps.google.com/?q=Sarjapur+Road+Bengaluru",
      days: 5,
      instructions: "Capture plot boundary markers and the access road condition.",
    },
    {
      title: "Thane West Project — Amenity Audit",
      address: "Ghodbunder Road, Thane West, Maharashtra 400615",
      mapUrl: "https://maps.google.com/?q=Ghodbunder+Road+Thane",
      days: 7,
      instructions: "Verify clubhouse, pool and gym exist as advertised; photograph each.",
    },
  ];
  for (const t of demoTasks) {
    await db.insert(ambassadorTasks).values({
      title: t.title,
      address: t.address,
      mapUrl: t.mapUrl,
      deadline: new Date(Date.now() + t.days * 24 * 60 * 60 * 1000),
      instructions: t.instructions,
      createdById: adminUser._id,
    });
  }

  console.log("Seed complete.\n");
  console.log("--- Login credentials (all use password: Password123!) ---");
  console.log("Admin:      admin@truvi.app");
  console.log("Admin:      founder@truvi.app");
  console.log("Developer:  dev1@truvi.app (approved)");
  console.log("Developer:  dev4@truvi.app (pending — test the approval flow)");
  console.log("CP/Seller:  cp1@truvi.app (approved, Silver)");
  console.log("CP/Seller:  cp7@truvi.app (approved, Diamond)");
  console.log("Ambassador: ambassador1@truvi.app (verified — login at /ambassador/login)");

  await closeDb();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
