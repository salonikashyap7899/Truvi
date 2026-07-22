/**
 * Drizzle ORM schema for Supabase (PostgreSQL).
 *
 * Conventions:
 *  - Every table has a UUID primary key stored in the DB column `id`, but the
 *    TypeScript property is named `_id` so API responses keep the exact shape
 *    the React client already expects (it reads `_id` everywhere).
 *  - Nested objects (cpProfile, verificationDetails, priceHistory, milestones,
 *    ...) are stored as JSONB columns.
 *  - String enums are `text` columns with TS enum typing (enforced at the app
 *    layer).
 */
import {
  pgTable,
  uuid,
  text,
  boolean,
  doublePrecision,
  integer,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Shared enum-ish types (kept identical to the old model exports)
// ---------------------------------------------------------------------------

export type Role = "ADMIN" | "DEVELOPER" | "CP" | "BUYER" | "AMBASSADOR" | "VERIFIER";
export type AmbassadorTaskStatus = "AVAILABLE" | "LOCKED" | "COMPLETED";
export type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED";
export type CPTier = "SILVER" | "GOLD" | "PLATINUM" | "DIAMOND";
export type ListingTier = "STANDARD" | "FEATURED";
export type ProjectType = "RESIDENTIAL" | "COMMERCIAL" | "INDUSTRIAL" | "MIXED_USE" | "PLOTTED";
export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";
export type ReraStatus = "REGISTERED" | "PENDING" | "NOT_REGISTERED";
export type UnitStatus = "AVAILABLE" | "LOCKED" | "RESERVED" | "SOLD";
export type LeadStage =
  | "GENERATED" | "ASSIGNED" | "CONTACTED" | "INTERESTED" | "SITE_VISIT"
  | "NEGOTIATION" | "BOOKING" | "REGISTRATION" | "COMPLETED" | "LOST";
export type LeadActivityType =
  | "CALL" | "WHATSAPP" | "EMAIL" | "NOTE" | "STAGE_CHANGE"
  | "SITE_VISIT" | "FOLLOW_UP" | "DOCUMENT" | "AI_REPORT" | "SYSTEM";
export type FollowUpStatus = "PENDING" | "DONE" | "MISSED";
export type CrmTaskStatus = "OPEN" | "DONE";
export type CrmTaskPriority = "LOW" | "MEDIUM" | "HIGH";
export type CommissionStatus = "PENDING" | "MILESTONE_DUE" | "INVOICED" | "PAID";
export type SiteVisitStatus = "SCHEDULED" | "CONFIRMED" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
export type LeadType = "BASIC" | "QUALIFIED" | "SITE_VISIT";
export type PaymentStatus = "SIMULATED" | "CREATED" | "PAID" | "FAILED";
export type PostCategory =
  | "ANNOUNCEMENT"
  | "DISCUSSION"
  | "TIP"
  | "MARKET_UPDATE"
  | "PROJECT_LAUNCH"
  | "HOT_DEAL"
  | "BUYER_REQUIREMENT"
  | "SUCCESS_STORY"
  | "ASK_COMMUNITY";
export type EnquiryPurpose = "BUYER" | "DEVELOPER" | "CP" | "GUEST";
export type BuyerDocType = "ID_PROOF" | "ADDRESS_PROOF" | "INCOME_PROOF";
export type BuyerDocStatus = "UPLOADED" | "UNDER_REVIEW" | "VERIFIED" | "REJECTED";
export type SharedDocFileType = "BROCHURE" | "FLOOR_PLAN" | "PRICE_LIST" | "LEGAL" | "OTHER";
export type LegalDocType = "RERA" | "APPROVAL" | "NOC" | "TITLE" | "OTHER";

export const ASSET_CATEGORIES = [
  "SKETCH_LAYOUT", "MASTER_PLAN", "SITE_PLAN", "FLOOR_PLAN", "ELEVATION",
  "PARKING_LAYOUT", "ELECTRICAL_PLUMBING", "LOCATION_MAP",
  "STRUCTURAL_DESIGN", "CONSTRUCTION_SPEC", "ARCHITECTURE_PRESENTATION",
  "RENDER_3D", "VIEW_360",
  "GALLERY_IMAGE", "GALLERY_VIDEO",
  "BROCHURE", "TECHNICAL_DOC", "APPROVAL_DOC", "APPROVAL_CERT",
  "MATERIAL_SPEC", "CAD_FILE", "STRUCTURAL_REPORT", "ENGINEERING_REPORT",
  "PROGRESS_UPDATE",
] as const;
export type AssetCategory = (typeof ASSET_CATEGORIES)[number];

// ---------------------------------------------------------------------------
// JSONB sub-document shapes (dates are ISO strings inside JSONB)
// ---------------------------------------------------------------------------

export interface CpProfile {
  isPremium: boolean;
  premiumExpiresAt?: string | null;
  conversionRatio: number;
  totalBookings: number;
}

export interface DeveloperProfile {
  companyName?: string;
  reraNumber?: string;
}

export interface OnboardingChecks {
  aadhaarVerified: boolean;
  phoneVerified: boolean;
  emailVerified: boolean;
  panVerified?: boolean;
  // Lifecycle of the CP identity submission: not started → PENDING (docs
  // submitted, awaiting review) → APPROVED / REJECTED.
  kycStatus?: "PENDING" | "APPROVED" | "REJECTED";
  kycRejectionReason?: string | null;
}

export interface UserVerification {
  phoneOtp?: string | null;
  phoneOtpExpiry?: string | null; // ISO date string
  emailOtp?: string | null;
  emailOtpExpiry?: string | null; // ISO date string
  aadhaarDocumentUrl?: string;
  aadhaarVerifiedAt?: string | null; // ISO date string
  // CP identity docs. PAN number is stored masked. The document images are NOT
  // public URLs — they live in a private (non-static) directory and are only
  // streamed to admins through an authenticated route. We keep just the stored
  // filename + mime per document so it can be located and its files deleted
  // once verification is decided (data-retention minimisation).
  panNumberMasked?: string;
  kycSubmittedAt?: string | null; // ISO date string
  kycFiles?: {
    aadhaar?: { file: string; mime: string };
    pan?: { file: string; mime: string };
    selfie?: { file: string; mime: string };
  };
}

export const DEFAULT_ONBOARDING_CHECKS: OnboardingChecks = {
  aadhaarVerified: false,
  phoneVerified: false,
  emailVerified: false,
  panVerified: false,
};

/**
 * A CP/Ambassador is fully onboarded once email, phone, Aadhaar and PAN are all
 * verified. `panVerified` is optional on legacy records — treat missing as not
 * required only for accounts that predate PAN (handled by callers via seed).
 */
export function isOnboardingComplete(checks?: OnboardingChecks | null): boolean {
  if (!checks) return false;
  return Boolean(
    checks.emailVerified && checks.phoneVerified && checks.aadhaarVerified && checks.panVerified,
  );
}

export interface BuyerProfile {
  savedProjectIds: string[];
  compareProjectIds: string[];
  loanEligibilityNotes?: string;
  investmentGoals?: string;
}

export interface VerificationDetails {
  reraVerified: boolean;
  titleClearance: boolean;
  encumbranceFree: boolean;
  constructionApproval: boolean;
  verificationSource?: string;
  portfolioVerified: boolean;
  lastVerifiedAt?: string | null;
  notes?: string;
}

/** A single nearby point of interest shown on the listing (school, hospital,
 *  transit, mall, restaurant) with a human-entered walking/driving distance. */
export type NearbyAmenityCategory = "school" | "hospital" | "transit" | "mall" | "restaurant";
export interface NearbyAmenity {
  category: NearbyAmenityCategory;
  name: string;
  distance: string;
}

export interface PresentationInfo {
  amenities?: string[];
  securityFeatures?: string[];
  smartHomeFeatures?: string[];
  fireSafetySystems?: string[];
  greenBuildingFeatures?: string[];
  connectivityNotes?: string;
  constructionProgressNote?: string;
  paymentPlans?: string[];
  offers?: string;
  // Developer/admin-curated nearby places with real distances. When present
  // these replace the placeholder list on the listing.
  nearbyAmenities?: NearbyAmenity[];
}

export interface SalesContact {
  name?: string;
  phone?: string;
  email?: string;
}

export interface PriceHistoryEntry {
  price: number;
  changedAt: string; // ISO date string
}

/** Developer-managed sales contact shown on the public presentation page. */
export interface SalesContact {
  name?: string;
  phone?: string;
  email?: string;
}

/** Developer-managed payment plan / offer entries (e.g. "20:80 plan", "No EMI till possession"). */
export interface PaymentPlan {
  name: string;
  description?: string;
}

// --- Ambassador task workflow (site-verification jobs) ---
export interface AmbassadorTaskChecklist {
  gpsOn: boolean;
  internetOn: boolean;
  liveLocation?: {
    lat: number;
    lng: number;
    capturedAt: string; // ISO date string
  } | null;
}

export interface AmbassadorTaskDocument {
  url: string;
  label?: string;
  uploadedAt: string; // ISO date string
}

export interface CommissionMilestone {
  _id: string; // stable UUID generated at insert time (crypto.randomUUID())
  label: string;
  percentOfTotal: number;
  amount: number;
  isReleased: boolean;
  releasedAt?: string | null;
}

export const DEFAULT_CP_PROFILE: CpProfile = {
  isPremium: false,
  premiumExpiresAt: null,
  conversionRatio: 0,
  totalBookings: 0,
};

export const DEFAULT_BUYER_PROFILE: BuyerProfile = {
  savedProjectIds: [],
  compareProjectIds: [],
};

export const DEFAULT_VERIFICATION_DETAILS: VerificationDetails = {
  reraVerified: false,
  titleClearance: false,
  encumbranceFree: false,
  constructionApproval: false,
  portfolioVerified: false,
};

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

export const users = pgTable(
  "users",
  {
    _id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    password: text("password").notNull(),
    role: text("role").$type<Role>().notNull(),
    // Admin account-approval has been removed — every self-signup is auto-approved
    // and the real gate is email OTP verification (see `emailVerified`). The
    // column is kept (defaulting to APPROVED) so existing rows and any code that
    // still reads it keep working.
    approvalStatus: text("approval_status").$type<ApprovalStatus>().notNull().default("APPROVED"),
    // Admin can deactivate ("remove") an account: it stays in the DB (so its
    // history/financial records are preserved) but can no longer log in and is
    // hidden from active user counts. Reversible via reactivate.
    disabled: boolean("disabled").notNull().default(false),
    phone: text("phone"),
    // Universal account verification: a new signup must confirm one-time codes
    // sent to both their email and phone before they can log in. Both default to
    // `true` at the DB level so pre-existing/seeded accounts are never locked
    // out; the signup path explicitly sets them to `false` for fresh accounts.
    emailVerified: boolean("email_verified").notNull().default(true),
    phoneVerified: boolean("phone_verified").notNull().default(true),
    onboardingVerified: boolean("onboarding_verified").notNull().default(false),
    onboardingChecks: jsonb("onboarding_checks").$type<OnboardingChecks>(),
    verification: jsonb("verification").$type<UserVerification>(),
    // Referral program: a CP/Ambassador's own shareable code, and the referrer
    // a developer signed up under (set from a valid referral code at signup).
    referralCode: text("referral_code").unique(),
    referredBy: uuid("referred_by"),
    cpTier: text("cp_tier").$type<CPTier>().default("SILVER"),
    cpProfile: jsonb("cp_profile").$type<CpProfile>().default(DEFAULT_CP_PROFILE),
    developerProfile: jsonb("developer_profile").$type<DeveloperProfile>(),
    buyerProfile: jsonb("buyer_profile").$type<BuyerProfile>().default(DEFAULT_BUYER_PROFILE),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("users_email_unique").on(t.email),
    index("users_role_approval_idx").on(t.role, t.approvalStatus),
  ]
);

export const projects = pgTable(
  "projects",
  {
    _id: uuid("id").defaultRandom().primaryKey(),
    developerId: uuid("developer_id").notNull().references(() => users._id),
    name: text("name").notNull(),
    description: text("description").notNull(),
    city: text("city").notNull(),
    location: text("location").notNull(),
    // Map coordinates for the GIS project map. Set via the pin picker on the
    // project form; null until placed (such projects don't appear on the map).
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    brochureUrl: text("brochure_url"),
    priceListUrl: text("price_list_url"),
    reraNumber: text("rera_number"),
    approvalStatus: text("approval_status").$type<ApprovalStatus>().notNull().default("PENDING"),
    listingTier: text("listing_tier").$type<ListingTier>().notNull().default("STANDARD"),
    featuredUntil: timestamp("featured_until", { withTimezone: true, mode: "date" }),
    isPrimeListing: boolean("is_prime_listing").notNull().default(false),
    commissionPercent: doublePrecision("commission_percent").notNull().default(3.0),
    trustScore: doublePrecision("trust_score"),
    legalRiskLevel: text("legal_risk_level").$type<RiskLevel>(),
    floodRiskLevel: text("flood_risk_level").$type<RiskLevel>(),
    crimeIndexLevel: text("crime_index_level").$type<RiskLevel>(),
    reraStatus: text("rera_status").$type<ReraStatus>(),
    reraValidityDate: timestamp("rera_validity_date", { withTimezone: true, mode: "date" }),
    // Expected possession/handover date, set by the developer.
    possessionDate: timestamp("possession_date", { withTimezone: true, mode: "date" }),
    // Sales enquiry contact shown on the listing.
    salesContact: jsonb("sales_contact").$type<SalesContact>(),
    isVerified: boolean("is_verified").notNull().default(false),
    verifiedAt: timestamp("verified_at", { withTimezone: true, mode: "date" }),
    verificationDetails: jsonb("verification_details").$type<VerificationDetails>().default(DEFAULT_VERIFICATION_DETAILS),
    projectType: text("project_type").$type<ProjectType>(),
    presentationInfo: jsonb("presentation_info").$type<PresentationInfo>(),
    // Embed link from a third-party 3D platform (Matterport, Sketchfab,
    // Google Maps 3D/satellite embed, ...). When set, the frontend shows a
    // "View in 3D" button on the listing.
    threeDModelUrl: text("three_d_model_url"),
    // Real 2D master-plan image (developer brochure layout). When set, the
    // 3D view shows it as an interactive tilt/orbit/zoom master-plan board
    // instead of the procedurally generated township.
    masterPlanUrl: text("master_plan_url"),
    // Public visit counter shown on listings ("N views").
    viewCount: integer("view_count").notNull().default(0),
    // Developer-managed payment plans (optional; shown publicly).
    paymentPlans: jsonb("payment_plans").$type<PaymentPlan[]>(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("projects_approval_tier_idx").on(t.approvalStatus, t.listingTier),
    index("projects_developer_idx").on(t.developerId),
    index("projects_city_idx").on(t.city),
  ]
);

export const units = pgTable(
  "units",
  {
    _id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id").notNull().references(() => projects._id),
    unitNumber: text("unit_number").notNull(),
    type: text("type").notNull(),
    areaSqft: doublePrecision("area_sqft").notNull(),
    // Optional human-readable plot size / dimensions, e.g. "30x40 ft" or
    // "200 sq.yd" — shown alongside the built-up area on listings.
    plotSize: text("plot_size"),
    price: doublePrecision("price").notNull(),
    status: text("status").$type<UnitStatus>().notNull().default("AVAILABLE"),
    lockedByCPId: uuid("locked_by_cp_id").references(() => users._id),
    lockExpiresAt: timestamp("lock_expires_at", { withTimezone: true, mode: "date" }),
    priceHistory: jsonb("price_history").$type<PriceHistoryEntry[]>().notNull().default([]),
  },
  (t) => [
    index("units_project_status_idx").on(t.projectId, t.status),
    index("units_status_lock_idx").on(t.status, t.lockExpiresAt),
  ]
);

export const leads = pgTable(
  "leads",
  {
    _id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id").notNull().references(() => projects._id),
    submittedById: uuid("submitted_by_id").notNull().references(() => users._id),
    assignedToId: uuid("assigned_to_id").references(() => users._id),
    clientName: text("client_name").notNull(),
    clientPhone: text("client_phone").notNull(),
    clientEmail: text("client_email"),
    stage: text("stage").$type<LeadStage>().notNull().default("GENERATED"),
    source: text("source").notNull(),
    notes: text("notes"),
    // CRM: CP-managed labels like "Hot", "NRI", "Investor" (paid tier).
    tags: jsonb("tags").$type<string[]>(),
    isDuplicate: boolean("is_duplicate").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("leads_assigned_stage_idx").on(t.assignedToId, t.stage),
    index("leads_dup_check_idx").on(t.projectId, t.clientPhone, t.createdAt),
  ]
);

export const commissions = pgTable(
  "commissions",
  {
    _id: uuid("id").defaultRandom().primaryKey(),
    leadId: uuid("lead_id").notNull().references(() => leads._id),
    cpId: uuid("cp_id").notNull().references(() => users._id),
    bookingValue: doublePrecision("booking_value").notNull(),
    commissionPercent: doublePrecision("commission_percent").notNull(),
    cpCommissionAmount: doublePrecision("cp_commission_amount").notNull(),
    platformFeeAmount: doublePrecision("platform_fee_amount").notNull(),
    tdsAmount: doublePrecision("tds_amount").notNull(),
    status: text("status").$type<CommissionStatus>().notNull().default("PENDING"),
    milestones: jsonb("milestones").$type<CommissionMilestone[]>().notNull().default([]),
    invoiceUrl: text("invoice_url"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("commissions_lead_unique").on(t.leadId),
    index("commissions_cp_idx").on(t.cpId),
  ]
);

export const siteVisits = pgTable(
  "site_visits",
  {
    _id: uuid("id").defaultRandom().primaryKey(),
    leadId: uuid("lead_id").references(() => leads._id),
    projectId: uuid("project_id").notNull().references(() => projects._id),
    cpId: uuid("cp_id").references(() => users._id),
    buyerId: uuid("buyer_id").references(() => users._id),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true, mode: "date" }).notNull(),
    timeSlot: text("time_slot"),
    contactNumber: text("contact_number"),
    status: text("status").$type<SiteVisitStatus>().notNull().default("SCHEDULED"),
    geoVerifiedLat: doublePrecision("geo_verified_lat"),
    geoVerifiedLng: doublePrecision("geo_verified_lng"),
    attendanceConfirmed: boolean("attendance_confirmed").notNull().default(false),
    reportNotes: text("report_notes"),
    nextSteps: text("next_steps"),
  },
  (t) => [
    index("site_visits_cp_status_idx").on(t.cpId, t.status),
    index("site_visits_buyer_status_idx").on(t.buyerId, t.status),
    index("site_visits_project_idx").on(t.projectId),
  ]
);

/**
 * CRM (paid tier) — every touchpoint on a lead: calls, WhatsApp, emails,
 * notes, stage changes, documents. Powers the Buyer Timeline and Call History.
 * Append-only; created in ensureSchema() so no manual migration is needed.
 */
export const leadActivities = pgTable(
  "lead_activities",
  {
    _id: uuid("id").defaultRandom().primaryKey(),
    leadId: uuid("lead_id").notNull().references(() => leads._id),
    cpId: uuid("cp_id").notNull().references(() => users._id),
    type: text("type").$type<LeadActivityType>().notNull(),
    content: text("content").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("lead_activities_lead_idx").on(t.leadId, t.createdAt), index("lead_activities_cp_idx").on(t.cpId, t.createdAt)]
);
export type ILeadActivity = typeof leadActivities.$inferSelect;

/** CRM (paid tier) — scheduled follow-ups per lead: the CP's reminder queue. */
export const leadFollowUps = pgTable(
  "lead_follow_ups",
  {
    _id: uuid("id").defaultRandom().primaryKey(),
    leadId: uuid("lead_id").notNull().references(() => leads._id),
    cpId: uuid("cp_id").notNull().references(() => users._id),
    dueAt: timestamp("due_at", { withTimezone: true, mode: "date" }).notNull(),
    channel: text("channel").$type<"CALL" | "WHATSAPP" | "EMAIL" | "MEETING">().notNull().default("CALL"),
    note: text("note"),
    status: text("status").$type<FollowUpStatus>().notNull().default("PENDING"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("lead_follow_ups_cp_status_idx").on(t.cpId, t.status, t.dueAt), index("lead_follow_ups_lead_idx").on(t.leadId)]
);
export type ILeadFollowUp = typeof leadFollowUps.$inferSelect;

/** CRM (paid tier) — the CP's personal task list, optionally linked to a lead. */
export const crmTasks = pgTable(
  "crm_tasks",
  {
    _id: uuid("id").defaultRandom().primaryKey(),
    cpId: uuid("cp_id").notNull().references(() => users._id),
    leadId: uuid("lead_id").references(() => leads._id),
    title: text("title").notNull(),
    dueAt: timestamp("due_at", { withTimezone: true, mode: "date" }),
    priority: text("priority").$type<CrmTaskPriority>().notNull().default("MEDIUM"),
    status: text("status").$type<CrmTaskStatus>().notNull().default("OPEN"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("crm_tasks_cp_status_idx").on(t.cpId, t.status)]
);
export type ICrmTask = typeof crmTasks.$inferSelect;

export const leadPurchases = pgTable("lead_purchases", {
  _id: uuid("id").defaultRandom().primaryKey(),
  cpId: uuid("cp_id").notNull().references(() => users._id),
  leadType: text("lead_type").$type<LeadType>().notNull(),
  amountPaid: doublePrecision("amount_paid").notNull(),
  razorpayOrderId: text("razorpay_order_id"),
  razorpayPaymentId: text("razorpay_payment_id"),
  paymentStatus: text("payment_status").$type<PaymentStatus>().notNull().default("SIMULATED"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

export const notifications = pgTable(
  "notifications",
  {
    _id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull().references(() => users._id),
    message: text("message").notNull(),
    isRead: boolean("is_read").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("notifications_user_read_created_idx").on(t.userId, t.isRead, t.createdAt)]
);

export const posts = pgTable(
  "posts",
  {
    _id: uuid("id").defaultRandom().primaryKey(),
    authorId: uuid("author_id").notNull().references(() => users._id),
    authorName: text("author_name").notNull(),
    authorRole: text("author_role").notNull(),
    content: text("content").notNull(),
    category: text("category").$type<PostCategory>().notNull().default("DISCUSSION"),
    likes: integer("likes").notNull().default(0),
    likedBy: jsonb("liked_by").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("posts_created_idx").on(t.createdAt)]
);

export const investments = pgTable(
  "investments",
  {
    _id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull().references(() => users._id),
    propertyName: text("property_name").notNull(),
    purchasePrice: doublePrecision("purchase_price").notNull(),
    purchaseDate: timestamp("purchase_date", { withTimezone: true, mode: "date" }).notNull(),
    currentValue: doublePrecision("current_value").notNull(),
    rentalIncome: doublePrecision("rental_income").default(0),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("investments_user_idx").on(t.userId)]
);

export const loanChecks = pgTable(
  "loan_checks",
  {
    _id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull().references(() => users._id),
    income: doublePrecision("income").notNull(),
    obligations: doublePrecision("obligations").notNull(),
    tenure: doublePrecision("tenure").notNull(),
    interestRate: doublePrecision("interest_rate").notNull(),
    eligibleAmount: doublePrecision("eligible_amount").notNull(),
    estimatedEmi: doublePrecision("estimated_emi").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("loan_checks_user_idx").on(t.userId)]
);

export const enquiries = pgTable(
  "enquiries",
  {
    _id: uuid("id").defaultRandom().primaryKey(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    purposeType: text("purpose_type").$type<EnquiryPurpose>().notNull(),
    message: text("message"),
    uploadUrl: text("upload_url"),
    uploadFileName: text("upload_file_name"),
    projectId: uuid("project_id").references(() => projects._id),
    projectName: text("project_name"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("enquiries_created_idx").on(t.createdAt),
    index("enquiries_purpose_idx").on(t.purposeType),
  ]
);

export const buyerDocuments = pgTable(
  "buyer_documents",
  {
    _id: uuid("id").defaultRandom().primaryKey(),
    buyerId: uuid("buyer_id").notNull().references(() => users._id),
    docType: text("doc_type").$type<BuyerDocType>().notNull(),
    fileName: text("file_name").notNull(),
    fileUrl: text("file_url").notNull(),
    status: text("status").$type<BuyerDocStatus>().notNull().default("UPLOADED"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("buyer_documents_buyer_doctype_idx").on(t.buyerId, t.docType)]
);

export const sharedDocuments = pgTable(
  "shared_documents",
  {
    _id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id").notNull().references(() => projects._id),
    uploadedById: uuid("uploaded_by_id").notNull().references(() => users._id),
    fileName: text("file_name").notNull(),
    fileUrl: text("file_url").notNull(),
    fileType: text("file_type").$type<SharedDocFileType>().notNull().default("OTHER"),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("shared_documents_project_created_idx").on(t.projectId, t.createdAt)]
);

export const projectAssets = pgTable(
  "project_assets",
  {
    _id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id").notNull().references(() => projects._id),
    category: text("category").$type<AssetCategory>().notNull(),
    title: text("title").notNull(),
    description: text("description"),
    fileUrl: text("file_url").notNull(),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: doublePrecision("size_bytes").notNull(),
    uploadedBy: uuid("uploaded_by").notNull().references(() => users._id),
    // Legal documents (approvals, NOCs, RERA certs) uploaded by a developer
    // start unverified and only appear publicly after an admin verifies them.
    // Non-legal categories default to true.
    verified: boolean("verified").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("project_assets_project_category_created_idx").on(t.projectId, t.category, t.createdAt)]
);

/** Asset categories treated as legal documents (admin verification required before public display). */
export const LEGAL_ASSET_CATEGORIES: AssetCategory[] = ["APPROVAL_DOC", "APPROVAL_CERT"];

/**
 * Legal documents (RERA certificate, approvals, NOCs, title docs) uploaded by
 * the developer. They stay hidden from the public until an admin verifies
 * them — only `verified` docs are returned on the public listing.
 */
export const legalDocuments = pgTable(
  "legal_documents",
  {
    _id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id").notNull().references(() => projects._id),
    title: text("title").notNull(),
    docType: text("doc_type").$type<LegalDocType>().notNull().default("OTHER"),
    fileUrl: text("file_url").notNull(),
    fileName: text("file_name").notNull(),
    verified: boolean("verified").notNull().default(false),
    verifiedById: uuid("verified_by_id").references(() => users._id),
    verifiedAt: timestamp("verified_at", { withTimezone: true, mode: "date" }),
    uploadedById: uuid("uploaded_by_id").notNull().references(() => users._id),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("legal_documents_project_verified_idx").on(t.projectId, t.verified)]
);

export const courseProgress = pgTable(
  "course_progress",
  {
    _id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull().references(() => users._id),
    courseId: text("course_id").notNull(),
    completedModules: jsonb("completed_modules").$type<string[]>().notNull().default([]),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("course_progress_user_course_unique").on(t.userId, t.courseId)]
);

/**
 * Admin-managed learning content (videos + PDFs) shown inside the CP Learning
 * Academy. Each row is attached to a course by its string `courseId` (matching
 * the front-end COURSES list) and rendered under that course's detail view.
 * Admins upload files (video/PDF) or paste an external video URL from the
 * admin panel; CPs consume them read-only.
 */
export const academyContent = pgTable(
  "academy_content",
  {
    _id: uuid("id").defaultRandom().primaryKey(),
    courseId: text("course_id").notNull(),
    title: text("title").notNull(),
    // VIDEO is legacy-only: existing rows still render, but new uploads are
    // restricted to voice notes (AUDIO) and PDFs.
    type: text("type").$type<"VIDEO" | "PDF" | "AUDIO">().notNull(),
    url: text("url").notNull(),
    description: text("description"),
    duration: text("duration"),
    // English transcript of a Hindi voice note so CPs/developers can read along.
    transcriptEn: text("transcript_en"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdById: uuid("created_by_id").references(() => users._id),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("academy_content_course_idx").on(t.courseId, t.sortOrder)]
);

/**
 * Ambassador site-verification tasks. Mirrors the SQL migration run in
 * Supabase (truvi_supabase_ambassador_update.sql). An ambassador accepts a
 * task, which locks it for 6 hours (YELLOW). If not completed in time it
 * returns to the pool (GREEN/AVAILABLE). On completion it is RED/COMPLETED.
 */
export const ambassadorTasks = pgTable(
  "ambassador_tasks",
  {
    _id: uuid("id").defaultRandom().primaryKey(),
    title: text("title").notNull(),
    address: text("address").notNull(),
    mapUrl: text("map_url"),
    deadline: timestamp("deadline", { withTimezone: true, mode: "date" }).notNull(),
    payoutAmount: doublePrecision("payout_amount").notNull().default(500),
    instructions: text("instructions"),
    status: text("status").$type<AmbassadorTaskStatus>().notNull().default("AVAILABLE"),
    acceptedById: uuid("accepted_by_id").references(() => users._id),
    acceptedAt: timestamp("accepted_at", { withTimezone: true, mode: "date" }),
    lockExpiresAt: timestamp("lock_expires_at", { withTimezone: true, mode: "date" }),
    checklist: jsonb("checklist").$type<AmbassadorTaskChecklist>(),
    documents: jsonb("documents").$type<AmbassadorTaskDocument[]>().notNull().default([]),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
    payoutPaid: boolean("payout_paid").notNull().default(false),
    createdById: uuid("created_by_id").notNull().references(() => users._id),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("ambassador_tasks_status_lock_idx").on(t.status, t.lockExpiresAt),
    index("ambassador_tasks_accepted_by_idx").on(t.acceptedById),
  ]
);

// ---------------------------------------------------------------------------
// Founder-only operating modules — Team (HR), Marketing, Land Bank & Investor.
// These back the previously-placeholder sections of the Founder "CEO OS"
// dashboard. Every figure the dashboard shows is derived from rows the founder
// actually enters here (no fabricated numbers), consistent with the platform's
// data-integrity rule. All monetary amounts are stored in whole rupees.
// ---------------------------------------------------------------------------

export const employees = pgTable("employees", {
  _id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  title: text("title"),
  department: text("department").notNull().default("General"),
  status: text("status").$type<"ACTIVE" | "ON_LEAVE" | "INACTIVE">().notNull().default("ACTIVE"),
  presentToday: boolean("present_today").notNull().default(true),
  performanceScore: integer("performance_score").notNull().default(0),
  tasksPending: integer("tasks_pending").notNull().default(0),
  monthlyCtc: doublePrecision("monthly_ctc").notNull().default(0),
  joinedAt: timestamp("joined_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

export const marketingCampaigns = pgTable("marketing_campaigns", {
  _id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  channel: text("channel").notNull().default("Other"),
  status: text("status").$type<"ACTIVE" | "PAUSED" | "COMPLETED">().notNull().default("ACTIVE"),
  spend: doublePrecision("spend").notNull().default(0),
  leads: integer("leads").notNull().default(0),
  conversions: integer("conversions").notNull().default(0),
  revenue: doublePrecision("revenue").notNull().default(0),
  startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

export const landParcels = pgTable("land_parcels", {
  _id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  location: text("location").notNull(),
  area: doublePrecision("area").notNull().default(0),
  areaUnit: text("area_unit").$type<"ACRE" | "BIGHA" | "SQFT" | "HECTARE">().notNull().default("ACRE"),
  status: text("status").$type<"OPPORTUNITY" | "PIPELINE" | "DUE_DILIGENCE" | "VERIFIED" | "ACQUIRED">().notNull().default("OPPORTUNITY"),
  estimatedValue: doublePrecision("estimated_value").notNull().default(0),
  dueDiligenceDone: boolean("due_diligence_done").notNull().default(false),
  priority: text("priority").$type<"HIGH" | "MEDIUM" | "LOW">().notNull().default("MEDIUM"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

export const capTableEntries = pgTable("cap_table_entries", {
  _id: uuid("id").defaultRandom().primaryKey(),
  holderName: text("holder_name").notNull(),
  holderType: text("holder_type").$type<"FOUNDER" | "INVESTOR" | "ANGEL" | "ESOP" | "OTHER">().notNull().default("INVESTOR"),
  equityPercent: doublePrecision("equity_percent").notNull().default(0),
  investedAmount: doublePrecision("invested_amount").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

export const fundraiseRounds = pgTable("fundraise_rounds", {
  _id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  targetAmount: doublePrecision("target_amount").notNull().default(0),
  committedAmount: doublePrecision("committed_amount").notNull().default(0),
  valuation: doublePrecision("valuation").notNull().default(0),
  status: text("status").$type<"OPEN" | "CLOSED">().notNull().default("OPEN"),
  closeDate: timestamp("close_date", { withTimezone: true, mode: "date" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

export const investorUpdates = pgTable("investor_updates", {
  _id: uuid("id").defaultRandom().primaryKey(),
  title: text("title").notNull(),
  body: text("body"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Inferred row types (replacements for the old IUser/IProject/... interfaces)
// ---------------------------------------------------------------------------

export type IUser = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type IProject = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type IUnit = typeof units.$inferSelect;
export type NewUnit = typeof units.$inferInsert;
export type ILead = typeof leads.$inferSelect;
export type NewLead = typeof leads.$inferInsert;
export type ICommission = typeof commissions.$inferSelect;
export type NewCommission = typeof commissions.$inferInsert;
export type ISiteVisit = typeof siteVisits.$inferSelect;
export type NewSiteVisit = typeof siteVisits.$inferInsert;
export type ILeadPurchase = typeof leadPurchases.$inferSelect;
export type INotification = typeof notifications.$inferSelect;
export type IPost = typeof posts.$inferSelect;
export type IInvestment = typeof investments.$inferSelect;
export type ILoanCheck = typeof loanChecks.$inferSelect;
export type IEnquiry = typeof enquiries.$inferSelect;
export type IBuyerDocument = typeof buyerDocuments.$inferSelect;
export type ISharedDocument = typeof sharedDocuments.$inferSelect;
export type IProjectAsset = typeof projectAssets.$inferSelect;
export type ILegalDocument = typeof legalDocuments.$inferSelect;
export type ICourseProgress = typeof courseProgress.$inferSelect;
export type IAcademyContent = typeof academyContent.$inferSelect;
export type NewAcademyContent = typeof academyContent.$inferInsert;
export type IAmbassadorTask = typeof ambassadorTasks.$inferSelect;
export type NewAmbassadorTask = typeof ambassadorTasks.$inferInsert;
export type IEmployee = typeof employees.$inferSelect;
export type IMarketingCampaign = typeof marketingCampaigns.$inferSelect;
export type ILandParcel = typeof landParcels.$inferSelect;
export type ICapTableEntry = typeof capTableEntries.$inferSelect;
export type IFundraiseRound = typeof fundraiseRounds.$inferSelect;
export type IInvestorUpdate = typeof investorUpdates.$inferSelect;

/**
 * Payments — one row per Razorpay checkout attempt. Structured so it can move
 * to a dedicated billing store later without reshaping. Amounts are in **paise**
 * (integer). `razorpayPaymentId` is unique so webhook + verify are idempotent.
 */
export const payments = pgTable(
  "payments",
  {
    _id: uuid("id").defaultRandom().primaryKey(),
    // Who paid (captured from the pre-checkout form; not necessarily a user).
    userId: uuid("user_id").references(() => users._id),
    customerName: text("customer_name").notNull(),
    customerEmail: text("customer_email").notNull(),
    customerPhone: text("customer_phone").notNull(),
    // What they bought.
    planId: text("plan_id").notNull(),
    planLabel: text("plan_label").notNull(),
    category: text("category").notNull(),
    // Money — all paise.
    amountPaise: integer("amount_paise").notNull(),
    gstPaise: integer("gst_paise").notNull().default(0),
    currency: text("currency").notNull().default("INR"),
    // Razorpay identifiers.
    razorpayOrderId: text("razorpay_order_id"),
    razorpayPaymentId: text("razorpay_payment_id"),
    razorpaySignature: text("razorpay_signature"),
    // CREATED → PAID / FAILED. (Subscriptions may add ACTIVE later.)
    status: text("status").$type<"CREATED" | "PAID" | "FAILED">().notNull().default("CREATED"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("payments_razorpay_payment_id_idx").on(t.razorpayPaymentId),
    index("payments_order_idx").on(t.razorpayOrderId),
    index("payments_status_created_idx").on(t.status, t.createdAt),
  ]
);
export type IPayment = typeof payments.$inferSelect;

/**
 * Razorpay Plan mapping — one row per internal subscription plan id
 * (e.g. "buyer_pro_monthly") → the Razorpay `plan_id`. Populated once by the
 * `razorpay:plans` script so we never recreate plans (Razorpay plans can't be
 * deleted). `amountPaise` is the amount the plan charges (incl. GST).
 */
export const subscriptionPlans = pgTable("subscription_plans", {
  internalPlanId: text("internal_plan_id").primaryKey(),
  razorpayPlanId: text("razorpay_plan_id").notNull(),
  amountPaise: integer("amount_paise").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});
export type ISubscriptionPlan = typeof subscriptionPlans.$inferSelect;

/**
 * Subscriptions — one row per Razorpay subscription. `razorpaySubscriptionId`
 * is unique so verify + webhook stay idempotent. Amounts in paise.
 */
export const subscriptions = pgTable(
  "subscriptions",
  {
    _id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => users._id),
    customerName: text("customer_name").notNull(),
    customerEmail: text("customer_email").notNull(),
    customerPhone: text("customer_phone").notNull(),
    internalPlanId: text("internal_plan_id").notNull(),
    planLabel: text("plan_label").notNull(),
    category: text("category").notNull(),
    interval: text("interval"),
    // Money — paise. base + gst = charged per cycle.
    basePaise: integer("base_paise").notNull(),
    gstPaise: integer("gst_paise").notNull().default(0),
    currency: text("currency").notNull().default("INR"),
    razorpayPlanId: text("razorpay_plan_id").notNull(),
    razorpaySubscriptionId: text("razorpay_subscription_id"),
    razorpayPaymentId: text("razorpay_payment_id"),
    // CREATED → ACTIVE → CANCELLED / COMPLETED (or FAILED).
    status: text("status").$type<"CREATED" | "ACTIVE" | "CANCELLED" | "COMPLETED" | "FAILED">().notNull().default("CREATED"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("subscriptions_rzp_sub_id_idx").on(t.razorpaySubscriptionId),
    index("subscriptions_status_created_idx").on(t.status, t.createdAt),
  ]
);
export type ISubscription = typeof subscriptions.$inferSelect;

/* ======================================================================
 * FINANCE LEDGER (Phase 2) — real, dynamic accounting data that powers the
 * Founder Dashboard Finance & Company-Health sections. All money in paise.
 * ==================================================================== */
export type FinanceDirection = "INFLOW" | "OUTFLOW";
export type FinanceCategory =
  | "SALES" | "COMMISSION_PAYOUT" | "DEVELOPER_PAYMENT" | "SUBSCRIPTION"
  | "OPERATING_EXPENSE" | "SALARY" | "MARKETING" | "TAX" | "REFUND" | "OTHER";

// One row per money movement (actual or expected). `settled=false` means it is
// still a receivable (INFLOW) or a payable (OUTFLOW); `dueDate` drives the
// upcoming-payments list. GST and TDS are captured per entry for GST/TDS views.
export const financeEntries = pgTable(
  "finance_entries",
  {
    _id: uuid("id").defaultRandom().primaryKey(),
    direction: text("direction").$type<FinanceDirection>().notNull(),
    category: text("category").$type<FinanceCategory>().notNull().default("OTHER"),
    description: text("description").notNull(),
    party: text("party"),
    amountPaise: integer("amount_paise").notNull(),
    gstPaise: integer("gst_paise").notNull().default(0),
    tdsPaise: integer("tds_paise").notNull().default(0),
    settled: boolean("settled").notNull().default(true),
    dueDate: timestamp("due_date", { withTimezone: true, mode: "date" }),
    settledAt: timestamp("settled_at", { withTimezone: true, mode: "date" }),
    accountId: uuid("account_id"),
    projectId: uuid("project_id").references(() => projects._id),
    createdById: uuid("created_by_id").notNull().references(() => users._id),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("finance_entries_dir_settled_idx").on(t.direction, t.settled),
    index("finance_entries_created_idx").on(t.createdAt),
  ]
);
export type IFinanceEntry = typeof financeEntries.$inferSelect;

// Bank / cash accounts — their summed balance is the Founder "Cash in Bank".
export const bankAccounts = pgTable("bank_accounts", {
  _id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  balancePaise: integer("balance_paise").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});
export type IBankAccount = typeof bankAccounts.$inferSelect;

// Loans / EMIs — feeds the Finance "EMI / Loan Status" and burn calculations.
export type LoanStatus = "ACTIVE" | "CLOSED";
export const loans = pgTable("loans", {
  _id: uuid("id").defaultRandom().primaryKey(),
  lender: text("lender").notNull(),
  principalPaise: integer("principal_paise").notNull(),
  outstandingPaise: integer("outstanding_paise").notNull(),
  emiPaise: integer("emi_paise").notNull().default(0),
  nextDueDate: timestamp("next_due_date", { withTimezone: true, mode: "date" }),
  status: text("status").$type<LoanStatus>().notNull().default("ACTIVE"),
  createdById: uuid("created_by_id").notNull().references(() => users._id),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});
export type ILoan = typeof loans.$inferSelect;

// Platform-wide settings — a single row edited by admins in the Settings page.
// Persistent replacement for the old in-memory platform-fee variable.
export const platformSettings = pgTable("platform_settings", {
  _id: uuid("id").defaultRandom().primaryKey(),
  platformFeePercent: doublePrecision("platform_fee_percent").notNull().default(0.75),
  gstPercent: doublePrecision("gst_percent").notNull().default(18),
  defaultCommissionPercent: doublePrecision("default_commission_percent").notNull().default(3),
  notifyEmail: boolean("notify_email").notNull().default(true),
  notifySms: boolean("notify_sms").notNull().default(false),
  notifyWhatsapp: boolean("notify_whatsapp").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});
export type IPlatformSettings = typeof platformSettings.$inferSelect;

// Developer enrollment — a CP enrolls a developer/landowner to list on Truvi.
// The referring CP earns a 2% incentive on every transaction from that
// developer's inventory (whether the CP sells it or anyone else does).
export type DeveloperReferralStatus = "PENDING" | "VERIFIED" | "ACTIVE" | "REJECTED";
export const developerReferrals = pgTable("developer_referrals", {
  _id: uuid("id").defaultRandom().primaryKey(),
  cpId: uuid("cp_id").notNull().references(() => users._id),
  developerName: text("developer_name").notNull(),
  companyName: text("company_name"),
  phone: text("phone").notNull(),
  email: text("email"),
  city: text("city"),
  landDetails: text("land_details"),
  notes: text("notes"),
  status: text("status").$type<DeveloperReferralStatus>().notNull().default("PENDING"),
  incentivePercent: doublePrecision("incentive_percent").notNull().default(2),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});
export type IDeveloperReferral = typeof developerReferrals.$inferSelect;

// Back-compat aliases used by services/intelligenceService and others
export type IPresentationInfo = PresentationInfo;
export type IVerificationDetails = VerificationDetails;
export type IPriceHistoryEntry = PriceHistoryEntry;
export type ICommissionMilestone = CommissionMilestone;

// Dynamic AI verification & Q&A engine (Phase 1). Re-exported so the whole
// schema is reachable from "../db/schema" and included in `import * as schema`.
export * from "./verificationSchema";
