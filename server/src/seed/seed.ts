import "dotenv/config";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { User } from "../models/User";
import { Project } from "../models/Project";
import { Unit } from "../models/Unit";
import { Lead, LeadStage } from "../models/Lead";
import { SiteVisit } from "../models/SiteVisit";
import { Commission } from "../models/Commission";
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
  const envUri = process.env.MONGO_URI?.trim();
  const uri = envUri || "mongodb://localhost:27017/truvi";

  if (!envUri) {
    console.warn(
      "MONGO_URI is not set in the environment. Falling back to localhost:27017. " +
      "If you want to use Atlas, uncomment or add MONGO_URI in server/.env."
    );
  }

  console.log(`Connecting to MongoDB using ${envUri ? "MONGO_URI" : "default localhost URI"}`);

  try {
    await mongoose.connect(uri, { dbName: "truvi" });
  } catch (error) {
    console.error("MongoDB connection failed. Ensure a MongoDB server is running on localhost:27017, or set a valid MONGO_URI in server/.env.");
    throw error;
  }

  console.log("Clearing existing data...");
  await Promise.all([
    User.deleteMany({}),
    Project.deleteMany({}),
    Unit.deleteMany({}),
    Lead.deleteMany({}),
    SiteVisit.deleteMany({}),
    Commission.deleteMany({}),
  ]);

  console.log("Seeding Truvi database...");
  const hashedPassword = await bcrypt.hash("Password123!", 12);

  // --- Admins ---
  await User.create({
    name: "Truvi Admin",
    email: "admin@truvi.app",
    password: hashedPassword,
    role: "ADMIN",
    approvalStatus: "APPROVED",
    phone: randomPhone(),
  });

  await User.create({
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
    const user = await User.create({
      name: d.name,
      email: d.email,
      password: hashedPassword,
      role: "DEVELOPER",
      approvalStatus: d.status,
      phone: randomPhone(),
      developerProfile: { companyName: d.company, reraNumber: `RERA-${Math.floor(100000 + Math.random() * 899999)}` },
    });
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
    const user = await User.create({
      name: randomName(),
      email: `cp${i + 1}@truvi.app`,
      password: hashedPassword,
      role: "CP",
      approvalStatus: "APPROVED",
      phone: randomPhone(),
      cpTier: plan.tier,
      cpProfile: {
        totalBookings: plan.bookings,
        conversionRatio: Math.round((plan.bookings / (plan.bookings + 10)) * 100) / 100,
        isPremium: i % 3 === 0,
      },
    });
    cps.push(user);
  }

  // --- Projects: 4, with 15-30 units each ---
  const projects = [];
  for (let i = 0; i < 4; i++) {
    const dev = approvedDevelopers[i % approvedDevelopers.length];
    const cityInfo = pick(CITIES);
    const project = await Project.create({
      developerId: dev._id,
      name: `${pick(["Emerald", "Sapphire", "Crest", "Meridian", "Solace"])} ${pick(["Heights", "Residency", "Enclave", "Towers"])}`,
      description: "A thoughtfully designed residential development with modern amenities, verified RERA compliance, and flexible unit configurations.",
      city: cityInfo.city,
      location: pick(cityInfo.locations),
      reraNumber: `RERA-${Math.floor(100000 + Math.random() * 899999)}`,
      approvalStatus: "APPROVED",
      listingTier: i === 0 ? "FEATURED" : "STANDARD",
      featuredUntil: i === 0 ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) : null,
      commissionPercent: [2.5, 3, 3.5, 3][i],
    });
    projects.push(project);

    const unitCount = 15 + Math.floor(Math.random() * 16);
    for (let u = 0; u < unitCount; u++) {
      const roll = Math.random();
      const status = roll < 0.55 ? "AVAILABLE" : roll < 0.7 ? "SOLD" : roll < 0.85 ? "RESERVED" : "LOCKED";
      const price = 4500000 + Math.floor(Math.random() * 8) * 750000;
      await Unit.create({
        projectId: project._id,
        unitNumber: `${String.fromCharCode(65 + (u % 4))}-${100 + u}`,
        type: pick(["2BHK", "3BHK", "4BHK", "Plot 200sqyd"]),
        areaSqft: 900 + Math.floor(Math.random() * 1200),
        price,
        status,
        lockedByCPId: status === "LOCKED" ? pick(cps)._id : null,
        lockExpiresAt: status === "LOCKED" ? new Date(Date.now() + 20 * 60 * 1000) : null,
        priceHistory: [{ price, changedAt: new Date() }],
      });
    }
  }

  // --- Leads: ~40 across all pipeline stages ---
  const stages: LeadStage[] = ["GENERATED", "ASSIGNED", "CONTACTED", "SITE_VISIT", "NEGOTIATION", "BOOKING", "REGISTRATION", "LOST"];
  const leads = [];
  for (let i = 0; i < 40; i++) {
    const project = pick(projects);
    const cp = pick(cps);
    const stage = stages[i % stages.length];
    const lead = await Lead.create({
      projectId: project._id,
      submittedById: cp._id,
      assignedToId: cp._id,
      clientName: randomName(),
      clientPhone: randomPhone(),
      clientEmail: Math.random() > 0.5 ? `client${i}@example.com` : undefined,
      stage,
      source: pick(["CP", "Website", "Referral"]),
      notes: "Interested in a mid-floor unit, budget flexible.",
    });
    leads.push(lead);
  }

  // --- Site visits: ~15 ---
  const siteVisitLeads = leads.filter((l) => ["SITE_VISIT", "NEGOTIATION", "BOOKING", "REGISTRATION"].includes(l.stage)).slice(0, 15);
  for (const lead of siteVisitLeads) {
    await SiteVisit.create({
      leadId: lead._id,
      projectId: lead.projectId,
      cpId: lead.assignedToId!,
      scheduledAt: new Date(Date.now() - Math.floor(Math.random() * 10) * 24 * 60 * 60 * 1000),
      status: pick(["SCHEDULED", "COMPLETED", "COMPLETED", "NO_SHOW"]),
      attendanceConfirmed: Math.random() > 0.3,
      reportNotes: "Client liked the sample flat, requested price negotiation.",
    });
  }

  // --- Commissions: using the tested commission engine ---
  const bookingLeads = leads.filter((l) => ["BOOKING", "REGISTRATION"].includes(l.stage));
  for (const lead of bookingLeads) {
    const project = projects.find((p) => String(p._id) === String(lead.projectId))!;
    const bookingValue = 5000000 + Math.floor(Math.random() * 6) * 1000000;
    const calc = calculateCommission({ bookingValue, commissionPercent: project.commissionPercent });
    const milestones = buildMilestones(calc.cpCommissionAmount);
    const releaseCount = Math.floor(Math.random() * 4);

    await Commission.create({
      leadId: lead._id,
      cpId: lead.assignedToId!,
      bookingValue,
      commissionPercent: project.commissionPercent,
      cpCommissionAmount: calc.cpCommissionAmount,
      platformFeeAmount: calc.platformFeeAmount,
      tdsAmount: calc.tdsAmount,
      status: releaseCount === 0 ? "PENDING" : releaseCount === milestones.length ? "PAID" : "MILESTONE_DUE",
      milestones: milestones.map((m, idx) => ({
        ...m,
        isReleased: idx < releaseCount,
        releasedAt: idx < releaseCount ? new Date() : null,
      })),
    });
  }

  console.log("Seed complete.\n");
  console.log("--- Login credentials (all use password: Password123!) ---");
  console.log("Admin:      admin@truvi.app");
  console.log("Admin:      founder@truvi.app");
  console.log("Developer:  dev1@truvi.app (approved)");
  console.log("Developer:  dev4@truvi.app (pending — test the approval flow)");
  console.log("CP:         cp1@truvi.app (approved, Silver)");
  console.log("CP:         cp7@truvi.app (approved, Diamond)");

  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
