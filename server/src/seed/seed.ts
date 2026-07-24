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
  payments,
  subscriptions,
  LeadStage,
  UnitStatus,
  CommissionMilestone,
} from "../db/schema";
import { calculateCommission, buildMilestones } from "../services/commissionCalculator";
import { founderDefaults } from "../db/bootstrapFounder";

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
  // payments.user_id and subscriptions.user_id reference users; clear them
  // before the users delete or Postgres throws the *_user_id_users_id_fk
  // foreign-key violation.
  await db.delete(payments);
  await db.delete(subscriptions);
  await db.delete(users);

  console.log("Seeding Truvi database...");
  const hashedPassword = await bcrypt.hash("Password123!", 12);
  // Founders (Sandeep & Meraj) get their own passwords (env-overridable), matching
  // the boot-time founder bootstrap so both paths agree on the same credentials.
  const { founders: founderCfg } = founderDefaults();
  const founderHashes = await Promise.all(founderCfg.map((f) => bcrypt.hash(f.password, 12)));

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

  for (let i = 0; i < founderCfg.length; i++) {
    await db.insert(users).values({
      name: founderCfg[i].name,
      email: founderCfg[i].email,
      password: founderHashes[i],
      role: "ADMIN",
      approvalStatus: "APPROVED",
      phone: randomPhone(),
    });
  }

  // --- Buyer (email pre-verified so it can log in straight away) ---
  await db.insert(users).values({
    name: "Truvi Buyer",
    email: "buyer1@truvi.app",
    password: hashedPassword,
    role: "BUYER",
    approvalStatus: "APPROVED",
    emailVerified: true,
    phone: randomPhone(),
  });

  // --- Developers (all auto-approved; email pre-verified for seed data) ---
  const developerData = [
    { name: "Skyline Developers", email: "dev1@truvi.app", company: "Skyline Developers Pvt Ltd" },
    { name: "Horizon Realty", email: "dev2@truvi.app", company: "Horizon Realty LLP" },
    { name: "Prestige Builders", email: "dev3@truvi.app", company: "Prestige Builders India" },
    { name: "Newline Constructions", email: "dev4@truvi.app", company: "Newline Constructions Pvt Ltd" },
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
        approvalStatus: "APPROVED",
        emailVerified: true,
        phone: randomPhone(),
        developerProfile: { companyName: d.company, reraNumber: `RERA-${Math.floor(100000 + Math.random() * 899999)}` },
      })
      .returning();
    developers.push(user);
  }
  const approvedDevelopers = developers;

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
        onboardingChecks: { aadhaarVerified: true, phoneVerified: true, emailVerified: true, panVerified: true, kycStatus: "APPROVED" },
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

  // --- Projects: only the real Prime Estate showcase (no dummy listings) ---
  const projectRows = [];
  for (let i = 0; i < 1; i++) {
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
        projectType: "RESIDENTIAL",
        // Verification is NEVER pre-filled: every check, trust score and risk
        // level stays PENDING until an admin verifies it from the admin panel.
        isVerified: false,
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
  console.log("--- Login credentials ---");
  console.log("Admin:      admin@truvi.app          (password: Password123!)");
  for (const founder of founderCfg) {
    console.log(`Founder:    ${founder.email}  (password: ${founder.password})  → CEO OS at /founder/dashboard`);
  }
  console.log("--- All other demo accounts use password: Password123! ---");
  console.log("Buyer:      buyer1@truvi.app");
  console.log("Developer:  dev1@truvi.app");
  console.log("Developer:  dev4@truvi.app");
  console.log("CP/Seller:  cp1@truvi.app (Silver)");
  console.log("CP/Seller:  cp7@truvi.app (Diamond)");
  console.log("Ambassador: ambassador1@truvi.app (verified — login at /ambassador/login)");

  await closeDb();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
