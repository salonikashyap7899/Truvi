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
  bigserial,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Shared enum-ish types (kept identical to the old model exports)
// ---------------------------------------------------------------------------

export type Role = "ADMIN" | "DEVELOPER" | "CP" | "BUYER" | "AMBASSADOR" | "VERIFIER" | "EMPLOYEE";
export type AmbassadorTaskStatus = "AVAILABLE" | "LOCKED" | "COMPLETED";
export type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED";
export type HabitatProviderStatus = "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED";
export type HabitatPricingModel = "FIXED" | "STARTING_PRICE" | "QUOTE";
export type HabitatBookingStatus =
  | "REQUESTED"
  | "PROVIDER_ASSIGNED"
  | "ACCEPTED"
  | "QUOTE_PROVIDED"
  | "PAYMENT_PENDING"
  | "PAID"
  | "REJECTED"
  | "IN_PROGRESS"
  | "COMPLETION_SUBMITTED"
  | "COMPLETED"
  | "CANCELLED"
  | "DISPUTED";
export type HabitatPaymentStatus =
  | "CREATED"
  | "PAID"
  | "FAILED"
  | "REFUND_PENDING"
  | "PARTIALLY_REFUNDED"
  | "REFUNDED";
export type HabitatQuoteStatus = "PROPOSED" | "ACCEPTED" | "REJECTED" | "EXPIRED";
export type HabitatDisputeStatus = "OPEN" | "UNDER_REVIEW" | "RESOLVED_BUYER" | "RESOLVED_PROVIDER" | "PARTIAL_REFUND";
export type HabitatTransferStatus = "PENDING" | "PROCESSED" | "FAILED" | "REVERSED";
/** A project additionally starts as DRAFT: saved but not yet sent for admin
 *  review, until the developer completes the essentials and submits it. */
export type ProjectApprovalStatus = ApprovalStatus | "DRAFT";
export type ProjectAvailabilityStatus = "AVAILABLE" | "SOLD_OUT";
/** Which government body approved/registered the project. Not every project is
 *  RERA-registered — many layouts are cleared by the District Panchayat or a
 *  development authority (DTCP) instead, so the listing accepts any of these. */
export type ApprovalAuthority = "RERA" | "DISTRICT_PANCHAYAT" | "DTCP";
export type CPTier = "SILVER" | "GOLD" | "PLATINUM" | "DIAMOND";
export type ListingTier = "STANDARD" | "FEATURED";
export type ProjectType =
  | "APARTMENT"
  | "VILLA"
  | "PLOTTED"
  | "COMMERCIAL"
  | "INDUSTRIAL"
  | "LAND"
  | "MIXED"
  // Legacy values still present on older projects.
  | "RESIDENTIAL"
  | "MIXED_USE";
export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";
export type ReraStatus = "REGISTERED" | "PENDING" | "NOT_REGISTERED";
export type UnitStatus = "AVAILABLE" | "LOCKED" | "RESERVED" | "SOLD";
export type LeadStage =
  | "GENERATED" | "ASSIGNED" | "CONTACTED" | "INTERESTED" | "SITE_VISIT"
  | "NEGOTIATION" | "BOOKING" | "REGISTRATION" | "COMPLETED" | "LOST";
export type LeadSourceChannel =
  | "AMBASSADOR_REFERRAL" | "WHATSAPP" | "INSTAGRAM" | "FACEBOOK"
  | "ORGANIC_WEBSITE" | "PAID_ADVERTISEMENT" | "CUSTOMER_REFERRAL"
  | "TELECALLER" | "CHANNEL_PARTNER" | "DIRECT_ENQUIRY" | "OTHER";
export type LeadPurchasePurpose = "SELF_USE" | "INVESTMENT" | "UNDECIDED";
export type LeadOwnershipReviewStatus = "NOT_REQUIRED" | "OPEN" | "UNDER_REVIEW" | "RESOLVED";
export type AmbassadorPropertyBookingStatus =
  | "SUBMITTED" | "UNDER_REVIEW" | "VERIFIED" | "SALE_VERIFIED" | "REJECTED"
  | "CANCELLED" | "REFUND_PENDING" | "REFUNDED";
export type AmbassadorBookingPaymentMilestone =
  | "BOOKING_CONFIRMED" | "TOKEN_RECEIVED" | "AGREEMENT_SIGNED"
  | "REGISTRATION_COMPLETED" | "CUSTOM_MILESTONE";
export type AmbassadorFollowUpStatus = "PENDING" | "DONE" | "MISSED" | "CANCELLED";
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

/** A Channel Partner's payout / bank details, used by the admin to process
 *  commission payouts. Added by the CP after onboarding, editable any time. */
export interface PayoutDetails {
  accountHolderName?: string;
  accountNumber?: string;
  ifsc?: string;
  bankName?: string;
  upiId?: string;
  method?: "BANK_TRANSFER" | "UPI";
  updatedAt?: string; // ISO
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
  // Forgot-password flow: a 6-digit code emailed to the account owner so they
  // can set a new password without being logged in. Cleared once used.
  resetPasswordOtp?: string | null;
  resetPasswordExpiry?: string | null; // ISO date string
  // Short-lived, hashed OTPs for changes to the destination contact details.
  pendingEmailChange?: string | null;
  pendingEmailChangeOtp?: string | null;
  pendingEmailChangeExpiry?: string | null;
  pendingPhoneChange?: string | null;
  pendingPhoneChangeOtp?: string | null;
  pendingPhoneChangeExpiry?: string | null;
  aadhaarDocumentUrl?: string;
  aadhaarVerifiedAt?: string | null; // ISO date string
  // CP/Ambassador identity docs. PAN number is stored masked. The document
  // images themselves are stored durably in the `kyc_documents` table (bytea)
  // and are NOT public URLs — they are only streamed to admins through an
  // authenticated route. Here we keep just a per-document presence marker + mime
  // so the admin UI knows which docs exist and how to render them.
  panNumberMasked?: string;
  kycSubmittedAt?: string | null; // ISO date string
  kycFiles?: {
    aadhaar?: { mime: string };
    pan?: { mime: string };
    selfie?: { mime: string };
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

/**
 * Admin-curated ownership record for a property (Truvi-verified registry data).
 * `endYear` is null for the current owner.
 */
export interface OwnerHistoryEntry {
  ownerLabel: string;
  startYear: number;
  endYear: number | null;
}

/**
 * Admin-published appreciation forecast. `fiveYearPct` is the projected total
 * appreciation over five years (e.g. 38 = +38%); `outlook` is a qualitative tag.
 */
export interface AppreciationForecast {
  fiveYearPct: number;
  outlook?: "Strong" | "Moderate" | "Stable";
  note?: string;
}

/** Developer-reported construction phase for a project. */
export type ConstructionStatus =
  | "PLANNING" | "EXCAVATION" | "FOUNDATION" | "STRUCTURE" | "FINISHING" | "COMPLETED";

/** A single construction milestone with an optional target date and done flag. */
export interface ProjectMilestone {
  label: string;
  targetDate?: string | null; // ISO date string
  done: boolean;
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

// Shared OTP lockout state. Declared in Drizzle as well as boot SQL so a
// later drizzle-kit push recognizes the table rather than treating it as drift.
export const otpAttempts = pgTable(
  "otp_attempts",
  {
    identityKey: text("identity_key").primaryKey(),
    failureCount: integer("failure_count").notNull().default(0),
    windowStartedAt: timestamp("window_started_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => ({
    updatedIdx: index("otp_attempts_updated_idx").on(t.updatedAt),
  }),
);

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
    // Incremented after a password reset so refresh tokens from prior credentials are rejected.
    authVersion: integer("auth_version").notNull().default(0),
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
    // Channel Partner payout / bank details (account no., IFSC, UPI, preferred
    // method) — set by the CP, read by the admin to process commission payouts.
    payoutDetails: jsonb("payout_details").$type<PayoutDetails>(),
    developerProfile: jsonb("developer_profile").$type<DeveloperProfile>(),
    buyerProfile: jsonb("buyer_profile").$type<BuyerProfile>().default(DEFAULT_BUYER_PROFILE),
    // Personal profile: display avatar (uploaded image URL) and a short bio,
    // editable by the account owner from their dashboard settings.
    avatarUrl: text("avatar_url"),
    bio: text("bio"),
    // Channel Partners must follow the Truvi Ventures WhatsApp updates channel
    // before the CP workspace unlocks (a mandatory step alongside KYC). Set once
    // the CP confirms they've joined; there's no WhatsApp API to verify it, so
    // this is a required self-acknowledgement gate.
    whatsappChannelJoined: boolean("whatsapp_channel_joined").notNull().default(false),
    // Channel Partner joining (KYC + WhatsApp channel + partner agreement) is
    // compulsory. Stamped once the CP completes it; an admin can reset it.
    cpJoinedAt: timestamp("cp_joined_at", { withTimezone: true, mode: "date" }),
    // "How to work on Truvi" onboarding — set when the onboarding meeting is
    // done (or the user marks it done) so the prompt never repeats unless an
    // admin resets it.
    onboardingCompletedAt: timestamp("onboarding_completed_at", { withTimezone: true, mode: "date" }),
    // Last time this account made an authenticated request — powers the
    // MAU/DAU active-user metrics (updated at most once per ~10 min).
    lastActiveAt: timestamp("last_active_at", { withTimezone: true, mode: "date" }),
    // Lifecycle email tracking. `welcomeEmailSentAt` is stamped the first time
    // the account is fully verified so the welcome mail is sent exactly once.
    // `lastReminderAt` throttles the "finish your setup" nudge (verification /
    // KYC / plan) so we never spam an account with pending steps.
    welcomeEmailSentAt: timestamp("welcome_email_sent_at", { withTimezone: true, mode: "date" }),
    lastReminderAt: timestamp("last_reminder_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("users_email_unique").on(t.email),
    index("users_role_approval_idx").on(t.role, t.approvalStatus),
  ]
);

/**
 * Pending signups — a signup is held here (NOT in `users`) until BOTH the email
 * and phone OTPs are verified. Only on successful verification is the real
 * `users` row created and the pending row deleted. This means no account is ever
 * created without OTP verification. One row per email (re-signing up refreshes
 * the codes). `password` is already bcrypt-hashed.
 */
export const pendingSignups = pgTable(
  "pending_signups",
  {
    _id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    password: text("password").notNull(),
    phone: text("phone"),
    role: text("role").$type<Role>().notNull(),
    companyName: text("company_name"),
    reraNumber: text("rera_number"),
    referredBy: uuid("referred_by"),
    emailOtp: text("email_otp"),
    emailOtpExpiry: timestamp("email_otp_expiry", { withTimezone: true, mode: "date" }),
    phoneOtp: text("phone_otp"),
    phoneOtpExpiry: timestamp("phone_otp_expiry", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("pending_signups_email_unique").on(t.email)]
);
export type IPendingSignup = typeof pendingSignups.$inferSelect;

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
    // Which authority issued the approval/registration number above. Lets a
    // developer list a project cleared by the District Panchayat or a
    // development authority (DTCP) — not only RERA-registered ones.
    approvalAuthority: text("approval_authority").$type<ApprovalAuthority>(),
    approvalStatus: text("approval_status").$type<ProjectApprovalStatus>().notNull().default("PENDING"),
    availabilityStatus: text("availability_status").$type<ProjectAvailabilityStatus>().notNull().default("AVAILABLE"),
    habitatEnabled: boolean("habitat_enabled").notNull().default(false),
    habitatEnabledAt: timestamp("habitat_enabled_at", { withTimezone: true, mode: "date" }),
    habitatEnabledById: uuid("habitat_enabled_by_id").references(() => users._id),
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
    // Set by an admin once the Truvi team has physically visited/inspected the
    // site. Feeds a +20 verification check into the Trust Score.
    teamSiteVisited: boolean("team_site_visited").notNull().default(false),
    isVerified: boolean("is_verified").notNull().default(false),
    verifiedAt: timestamp("verified_at", { withTimezone: true, mode: "date" }),
    // Admin's manual Truvi Score adjustment (points, −100…+100) applied on top
    // of the computed score, with the internal reason and when it was set.
    scoreAdjustment: integer("score_adjustment").notNull().default(0),
    scoreAdjustmentReason: text("score_adjustment_reason"),
    scoreAdjustedAt: timestamp("score_adjusted_at", { withTimezone: true, mode: "date" }),
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
    // Total plots/units in the project as declared by the developer — shown on
    // the listing when the full per-unit inventory hasn't been entered yet, so a
    // plotted project reads "120 plots" instead of the 1 sample unit added.
    totalUnits: integer("total_units"),
    // Developer-managed payment plans (optional; shown publicly).
    paymentPlans: jsonb("payment_plans").$type<PaymentPlan[]>(),
    // Admin-curated, Truvi-verified ownership history + appreciation forecast.
    ownerHistory: jsonb("owner_history").$type<OwnerHistoryEntry[]>(),
    appreciationForecast: jsonb("appreciation_forecast").$type<AppreciationForecast>(),
    // Developer-reported construction progress + milestones.
    constructionStatus: text("construction_status").$type<ConstructionStatus>(),
    constructionProgress: integer("construction_progress"),
    milestones: jsonb("milestones").$type<ProjectMilestone[]>(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("projects_approval_tier_idx").on(t.approvalStatus, t.listingTier),
    index("projects_developer_idx").on(t.developerId),
    index("projects_city_idx").on(t.city),
  ]
);

/**
 * Structured, unmet property requirements submitted by buyers and authorized
 * lead-generating roles. Private notes remain visible only to the submitter
 * and admins; the noticeboard API deliberately selects public fields only.
 */
export const propertyRequirements = pgTable(
  "property_requirements",
  {
    _id: uuid("id").defaultRandom().primaryKey(),
    submittedById: uuid("submitted_by_id").notNull().references(() => users._id),
    submittedByRole: text("submitted_by_role").$type<Role>().notNull(),
    requirementKind: text("requirement_kind").$type<"BUYER" | "CLIENT">().notNull().default("BUYER"),
    visibility: text("visibility").$type<"PRIVATE" | "TRUVI">().notNull().default("TRUVI"),
    title: text("title").notNull(),
    propertyType: text("property_type").notNull().default("ANY"),
    city: text("city").notNull(),
    location: text("location").notNull(),
    minBudget: doublePrecision("min_budget"),
    maxBudget: doublePrecision("max_budget").notNull(),
    minAreaSqft: doublePrecision("min_area_sqft"),
    maxAreaSqft: doublePrecision("max_area_sqft"),
    purpose: text("purpose"),
    timeline: text("timeline").notNull(),
    details: text("details"),
    publicSummary: text("public_summary"),
    preferredContactMethod: text("preferred_contact_method").$type<"PHONE" | "EMAIL" | "WHATSAPP" | "IN_APP">().notNull().default("IN_APP"),
    clientName: text("client_name"),
    clientPhone: text("client_phone"),
    clientEmail: text("client_email"),
    contactConsent: boolean("contact_consent").notNull().default(false),
    contactConsentAt: timestamp("contact_consent_at", { withTimezone: true, mode: "date" }),
    status: text("status").$type<"ACTIVE" | "CLOSED" | "UNDER_REVIEW" | "REJECTED" | "SPAM">().notNull().default("ACTIVE"),
    moderatedById: uuid("moderated_by_id").references(() => users._id),
    moderatedAt: timestamp("moderated_at", { withTimezone: true, mode: "date" }),
    moderationNote: text("moderation_note"),
    duplicateOfId: uuid("duplicate_of_id"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    index("property_requirements_status_created_idx").on(t.status, t.createdAt),
    index("property_requirements_owner_status_idx").on(t.submittedById, t.status),
    index("property_requirements_city_idx").on(t.city),
  ],
);
export type IPropertyRequirement = typeof propertyRequirements.$inferSelect;

/** One row per requirement/project pair, with idempotent delivery bookkeeping. */
export const propertyRequirementMatches = pgTable(
  "property_requirement_matches",
  {
    _id: uuid("id").defaultRandom().primaryKey(),
    requirementId: uuid("requirement_id").notNull().references(() => propertyRequirements._id, { onDelete: "cascade" }),
    projectId: uuid("project_id").notNull().references(() => projects._id, { onDelete: "cascade" }),
    matchStatus: text("match_status").$type<"MATCHED" | "NO_LONGER_ELIGIBLE" | "ENQUIRY_CREATED">().notNull().default("MATCHED"),
    matchReasons: jsonb("match_reasons").$type<string[]>().notNull().default([]),
    notificationStatus: text("notification_status").$type<"PENDING" | "CREATED" | "FAILED" | "SKIPPED">().notNull().default("PENDING"),
    emailStatus: text("email_status").$type<"QUEUED" | "SENDING" | "SENT_TO_PROVIDER" | "DELIVERED" | "FAILED" | "RETRY_PENDING" | "SKIPPED">().notNull().default("QUEUED"),
    emailAttempts: integer("email_attempts").notNull().default(0),
    emailLastError: text("email_last_error"),
    emailNextAttemptAt: timestamp("email_next_attempt_at", { withTimezone: true, mode: "date" }),
    emailClaimedAt: timestamp("email_claimed_at", { withTimezone: true, mode: "date" }),
    emailProviderMessageId: text("email_provider_message_id"),
    emailDeliveredAt: timestamp("email_delivered_at", { withTimezone: true, mode: "date" }),
    inAppNotifiedAt: timestamp("in_app_notified_at", { withTimezone: true, mode: "date" }),
    emailSentAt: timestamp("email_sent_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("property_requirement_matches_pair_unique").on(t.requirementId, t.projectId),
    index("property_requirement_matches_requirement_idx").on(t.requirementId, t.createdAt),
    index("property_requirement_matches_project_idx").on(t.projectId, t.createdAt),
  ],
);

export type IPropertyRequirementMatch = typeof propertyRequirementMatches.$inferSelect;

/** Append-only audit trail for requirement submissions and moderation. */
export const propertyRequirementEvents = pgTable(
  "property_requirement_events",
  {
    _id: uuid("id").defaultRandom().primaryKey(),
    requirementId: uuid("requirement_id").notNull().references(() => propertyRequirements._id, { onDelete: "cascade" }),
    actorUserId: uuid("actor_user_id").references(() => users._id),
    action: text("action").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("property_requirement_events_req_created_idx").on(t.requirementId, t.createdAt),
    index("property_requirement_events_actor_idx").on(t.actorUserId, t.createdAt),
  ],
);

/** Durable matching jobs; requests only enqueue and the worker processes with retries. */
export const propertyRequirementMatchJobs = pgTable(
  "property_requirement_match_jobs",
  {
    _id: uuid("id").defaultRandom().primaryKey(),
    jobType: text("job_type").$type<"REQUIREMENT" | "PROJECT">().notNull(),
    requirementId: uuid("requirement_id").references(() => propertyRequirements._id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects._id, { onDelete: "cascade" }),
    status: text("status").$type<"QUEUED" | "RUNNING" | "COMPLETED" | "RETRY_PENDING" | "FAILED">().notNull().default("QUEUED"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
  },
  (t) => [
    index("property_requirement_match_jobs_status_due_idx").on(t.status, t.nextAttemptAt),
    index("property_requirement_match_jobs_requirement_idx").on(t.requirementId, t.createdAt),
    index("property_requirement_match_jobs_project_idx").on(t.projectId, t.createdAt),
  ],
);
export type IPropertyRequirementMatchJob = typeof propertyRequirementMatchJobs.$inferSelect;

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
    // Position of this plot's marker on the project's uploaded layout/master
    // plan, as fractions (0–1) of the image width/height. Null until a
    // developer places it. Powers the interactive "tap a plot on the map"
    // overlay (green = available, red = booked) on the buyer 3D/map view.
    mapX: doublePrecision("map_x"),
    mapY: doublePrecision("map_y"),
  },
  (t) => [
    index("units_project_status_idx").on(t.projectId, t.status),
    index("units_status_lock_idx").on(t.status, t.lockExpiresAt),
  ]
);

/** One level of a lead's referral chain — ids only, no copied user data. */
export interface LeadReferralLink {
  level: number;
  userId: string;
}

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
    leadTemperature: text("lead_temperature").$type<"HOT" | "WARM" | "COLD">(),
    preferredLocation: text("preferred_location"),
    preferredPropertyType: text("preferred_property_type"),
    preferredContactMethod: text("preferred_contact_method"),
    siteVisitStatus: text("site_visit_status").$type<"NOT_DISCUSSED" | "INTERESTED" | "PROPOSED" | "CONFIRMED" | "COMPLETED" | "RESCHEDULED" | "CANCELLED">(),
    lastContactAt: timestamp("last_contact_at", { withTimezone: true, mode: "date" }),
    followUpNotes: text("follow_up_notes"),
    additionalRequirements: text("additional_requirements"),
    // Consent record for sharing a non-user customer's contact details with Truvi.
    // Buyer-owned enquiries do not use this field as third-party consent.
    contactConsent: boolean("contact_consent").notNull().default(false),
    contactConsentAt: timestamp("contact_consent_at", { withTimezone: true, mode: "date" }),
    consentTextVersion: text("consent_text_version"),
    stage: text("stage").$type<LeadStage>().notNull().default("GENERATED"),
    source: text("source").notNull(),
    notes: text("notes"),
    // Why a lead was marked LOST (founder analytics: lost-deal reasons). Set
    // when the stage moves to LOST, cleared if it moves back into the pipeline.
    lostReason: text("lost_reason"),
    // First time the lead was actively worked (moved to CONTACTED or beyond) —
    // powers the average first-response-time team metric. Set once.
    firstContactedAt: timestamp("first_contacted_at", { withTimezone: true, mode: "date" }),
    // CRM: CP-managed labels like "Hot", "NRI", "Investor" (paid tier).
    tags: jsonb("tags").$type<string[]>(),
    isDuplicate: boolean("is_duplicate").notNull().default(false),
    // Human-readable Lead ID (shown as TRV-L-000123). Assigned by the DB.
    leadNo: bigserial("lead_no", { mode: "number" }),
    // The exact inventory the lead came from (null = whole project).
    unitId: uuid("unit_id").references(() => units._id),
    propertyRequirementMatchId: uuid("property_requirement_match_id").references(() => propertyRequirementMatches._id),
    // Role of the account that created the lead (BUYER / CP / AMBASSADOR …),
    // derived on the server from the session, never from the request body.
    creatorRole: text("creator_role").$type<Role>(),
    // What the customer is looking for (buy to live, investment, …).
    requirement: text("requirement"),
    // Structured buyer-qualification data, captured separately for analytics.
    budgetRange: text("budget_range"),
    purchasePurpose: text("purchase_purpose").$type<LeadPurchasePurpose>(),
    preferredPlotSize: text("preferred_plot_size"),
    purchaseTimeline: text("purchase_timeline"),
    sourceChannel: text("source_channel").$type<LeadSourceChannel>(),
    nextFollowUpAt: timestamp("next_follow_up_at", { withTimezone: true, mode: "date" }),
    contactAttemptedAt: timestamp("contact_attempted_at", { withTimezone: true, mode: "date" }),
    qualifiedAt: timestamp("qualified_at", { withTimezone: true, mode: "date" }),
    ownershipReviewStatus: text("ownership_review_status").$type<LeadOwnershipReviewStatus>().notNull().default("NOT_REQUIRED"),
    ownershipReviewNotes: text("ownership_review_notes"),
    ownershipReviewedById: uuid("ownership_reviewed_by_id").references(() => users._id),
    ownershipReviewedAt: timestamp("ownership_reviewed_at", { withTimezone: true, mode: "date" }),
    // Requested site visit (IST calendar date "YYYY-MM-DD" + "HH:MM").
    visitDate: text("visit_date"),
    visitTime: text("visit_time"),
    // Referral / commission source as references only: the referral code used
    // and the chain of referrer user ids by level (L1 = the ambassador/CP who
    // brought the lead, L2 = whoever referred them, …). Extensible to more levels.
    referralCode: text("referral_code"),
    referralChain: jsonb("referral_chain").$type<LeadReferralLink[]>(),
    // Active offer the lead was eligible for when it was created (server-checked).
    offerId: uuid("offer_id"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("leads_assigned_stage_idx").on(t.assignedToId, t.stage),
    index("leads_dup_check_idx").on(t.projectId, t.clientPhone, t.createdAt),
    index("leads_source_channel_idx").on(t.sourceChannel, t.createdAt),
    index("leads_next_follow_up_idx").on(t.nextFollowUpAt),
    index("leads_requirement_match_idx").on(t.propertyRequirementMatchId),
    index("leads_ownership_review_idx").on(t.ownershipReviewStatus, t.createdAt),
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
    responsibleUserId: uuid("responsible_user_id").references(() => users._id),
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
    cpId: uuid("cp_id").references(() => users._id),
    actorUserId: uuid("actor_user_id").references(() => users._id),
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
    // ── Notification engine fields (added; all backward-compatible) ──
    // A machine-readable event type (e.g. "project_approved", "commission_earned").
    // Old rows and any un-typed insert default to "general".
    type: text("type").notNull().default("general"),
    // Optional bold headline shown above `message`.
    title: text("title"),
    // The user who caused the event (null for system events).
    actorUserId: uuid("actor_user_id").references(() => users._id),
    // Deep-link + payload, e.g. { "screen": "ProjectDetails", "projectId": "…" }.
    data: jsonb("data").$type<Record<string, unknown>>(),
    // "low" | "normal" | "high" | "critical".
    priority: text("priority").notNull().default("normal"),
    // When the recipient read it (null while unread).
    readAt: timestamp("read_at", { withTimezone: true, mode: "date" }),
    // Optional auto-expiry (e.g. a time-boxed opportunity).
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }),
    // When a phone push for this row was actually delivered to a device. Null
    // means "never pushed" — e.g. created while the user had no device
    // registered yet (a fresh signup). Such rows are pushed as a catch-up the
    // moment the user's device registers, so the welcome/onboarding pop-ups are
    // never lost. Prevents double-pushing rows already delivered live.
    pushedAt: timestamp("pushed_at", { withTimezone: true, mode: "date" }),
  },
  (t) => [
    index("notifications_user_read_created_idx").on(t.userId, t.isRead, t.createdAt),
    index("notifications_user_created_idx").on(t.userId, t.createdAt),
    index("notifications_type_idx").on(t.type),
  ]
);

/**
 * Per-user, per-category on/off switches for notifications. A missing row means
 * "all categories on" (the default), so existing users need no backfill.
 * Security-critical categories are always delivered regardless of preference.
 */
export const notificationPreferences = pgTable(
  "notification_preferences",
  {
    _id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull().references(() => users._id),
    category: text("category").notNull(), // e.g. "projects", "leads", "marketing"
    enabled: boolean("enabled").notNull().default(true),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("notification_prefs_user_category_idx").on(t.userId, t.category)]
);

/**
 * Channel-level communication choices, separate from the legacy category mute
 * table so in-app/email/WhatsApp preferences can coexist without data loss.
 */
export const userNotificationChannelPreferences = pgTable(
  "user_notification_channel_preferences",
  {
    _id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull().references(() => users._id),
    channel: text("channel").$type<"IN_APP" | "EMAIL" | "WHATSAPP">().notNull(),
    category: text("category").notNull().default("properties"),
    enabled: boolean("enabled").notNull().default(true),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("user_notification_channel_prefs_unique").on(t.userId, t.channel, t.category),
    index("user_notification_channel_prefs_user_idx").on(t.userId, t.category),
  ],
);

/**
 * Legacy native push-token records. Kept in the schema temporarily so automatic
 * schema sync does not drop existing production data after switching to web-only.
 * The web application no longer registers, reads, or sends to these tokens.
 * Remove this table only in a separate, reviewed production data migration.
 */
export const userPushTokens = pgTable(
  "user_push_tokens",
  {
    _id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull().references(() => users._id),
    token: text("token").notNull(),
    platform: text("platform").notNull().default("android"), // android | ios | web
    deviceId: text("device_id"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("user_push_tokens_token_idx").on(t.token),
    index("user_push_tokens_user_idx").on(t.userId),
  ]
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
    // Email is optional now — landing-page leads are phone-first.
    email: text("email"),
    phone: text("phone"),
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
    // AI-scored visual quality (0–100) for gallery images — drives automatic
    // "best cover" selection. Null until scored (or when AI is unavailable).
    aiScore: doublePrecision("ai_score"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("project_assets_project_category_created_idx").on(t.projectId, t.category, t.createdAt)]
);

/**
 * Threaded discussion on a project/inventory listing. Channel partners and team
 * members discuss a property here. The commenter's name is never exposed — the
 * UI shows a profile avatar + short user id only.
 */
export const projectComments = pgTable(
  "project_comments",
  {
    _id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id").notNull().references(() => projects._id),
    userId: uuid("user_id").notNull().references(() => users._id),
    // Null for a top-level comment; set to the parent comment for a reply.
    parentId: uuid("parent_id"),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("project_comments_project_created_idx").on(t.projectId, t.createdAt)]
);
export type IProjectComment = typeof projectComments.$inferSelect;

/**
 * Brochure view/download analytics. The brochure file itself lives as a
 * `project_assets` row (category "BROCHURE") — this table only records who
 * opened or downloaded it, for the admin analytics panel.
 */
export type BrochureEventType = "VIEW" | "DOWNLOAD";
export const brochureEvents = pgTable(
  "brochure_events",
  {
    _id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id").notNull().references(() => projects._id),
    assetId: uuid("asset_id"),
    userId: uuid("user_id").references(() => users._id),
    role: text("role"),
    eventType: text("event_type").$type<BrochureEventType>().notNull(),
    platform: text("platform"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("brochure_events_project_idx").on(t.projectId, t.eventType, t.createdAt)]
);
export type IBrochureEvent = typeof brochureEvents.$inferSelect;

/**
 * Masked-call log — a Channel Partner → Developer call bridged through a Truvi
 * virtual number. Neither party's real number is ever exposed to the other or
 * to the frontend; the raw numbers are NOT stored here (only the virtual/ExoPhone
 * and the provider's own call id).
 */
export type CallStatus =
  | "INITIATED" | "RINGING" | "IN_PROGRESS" | "CONNECTED" | "COMPLETED"
  | "MISSED" | "NO_ANSWER" | "BUSY" | "FAILED" | "CANCELED";
export const calls = pgTable(
  "calls",
  {
    _id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id").notNull().references(() => projects._id),
    cpId: uuid("cp_id").notNull().references(() => users._id),
    developerId: uuid("developer_id").notNull().references(() => users._id),
    provider: text("provider").notNull().default("exotel"),
    providerCallId: text("provider_call_id"),
    virtualNumber: text("virtual_number"),
    status: text("status").$type<CallStatus>().notNull().default("INITIATED"),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }),
    endedAt: timestamp("ended_at", { withTimezone: true, mode: "date" }),
    durationSec: integer("duration_sec"),
    recordingUrl: text("recording_url"),
    recordingId: text("recording_id"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("calls_project_idx").on(t.projectId, t.createdAt),
    index("calls_developer_idx").on(t.developerId, t.createdAt),
    index("calls_cp_idx").on(t.cpId, t.createdAt),
    index("calls_provider_call_idx").on(t.providerCallId),
  ]
);
export type ICall = typeof calls.$inferSelect;

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
  accountUserId: uuid("account_user_id").references(() => users._id).unique(),
  employeeCode: text("employee_code").unique(),
  officialEmail: text("official_email"),
  phone: text("phone"),
  employmentType: text("employment_type").$type<"FULL_TIME" | "PART_TIME" | "CONTRACT" | "INTERN">().notNull().default("FULL_TIME"),
  reportingManagerId: uuid("reporting_manager_id").references(() => users._id),
  recruitmentSource: text("recruitment_source"),
  recruitmentCampaign: text("recruitment_campaign"),
  applicationDate: timestamp("application_date", { withTimezone: true, mode: "date" }),
  interviewDate: timestamp("interview_date", { withTimezone: true, mode: "date" }),
  permissions: jsonb("permissions").$type<string[]>().notNull().default([]),
  name: text("name").notNull(),
  title: text("title"),
  department: text("department").notNull().default("General"),
  status: text("status").$type<"ACTIVE" | "ON_LEAVE" | "INACTIVE">().notNull().default("ACTIVE"),
  presentToday: boolean("present_today").notNull().default(true),
  performanceScore: integer("performance_score").notNull().default(0),
  tasksPending: integer("tasks_pending").notNull().default(0),
  monthlyCtc: doublePrecision("monthly_ctc").notNull().default(0),
  // Salary-payment tracking for the Command Center "Employee Salaries" card.
  // `salaryPaidForMonth` holds the month key (e.g. "2026-07") this employee's
  // salary was last marked paid for — so a new month automatically flips
  // everyone back to "pending" without a reset job. `salaryDueDay` is the
  // day-of-month (1–28) the salary is due, driving upcoming-due-date alerts.
  salaryPaidForMonth: text("salary_paid_for_month"),
  salaryDueDay: integer("salary_due_day").notNull().default(1),
  // Employer Management: when salary payments start + free-form notes. Partial
  // and full salary payments are recorded per-month in `employeePayments`.
  salaryStartDate: timestamp("salary_start_date", { withTimezone: true, mode: "date" }),
  notes: text("notes"),
  joinedAt: timestamp("joined_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

// Salary payment history for the Employer Management page. Each row is one
// (possibly partial) payment toward an employee's salary for a given month
// (`monthKey`, e.g. "2026-07"). The amount paid this month is the sum of that
// month's rows, so partial payments accumulate and status auto-resets when the
// month rolls over.
export const employeePayments = pgTable("employee_payments", {
  _id: uuid("id").defaultRandom().primaryKey(),
  employeeId: uuid("employee_id").notNull().references(() => employees._id),
  monthKey: text("month_key").notNull(),
  amount: doublePrecision("amount").notNull().default(0),
  note: text("note"),
  paidAt: timestamp("paid_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  createdById: uuid("created_by_id").references(() => users._id),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
}, (t) => [index("employee_payments_employee_idx").on(t.employeeId, t.monthKey)]);

export type IEmployeePayment = typeof employeePayments.$inferSelect;

/** Secure one-time employee account activation; only a token hash is stored. */
export const employeeInvites = pgTable("employee_invites", {
  _id: uuid("id").defaultRandom().primaryKey(),
  employeeId: uuid("employee_id").notNull().references(() => employees._id),
  tokenHash: text("token_hash").notNull().unique(),
  createdById: uuid("created_by_id").notNull().references(() => users._id),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true, mode: "date" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
}, (t) => [index("employee_invites_employee_idx").on(t.employeeId, t.createdAt)]);
export type IEmployeeInvite = typeof employeeInvites.$inferSelect;

/** Work assigned to an employee or created by them for personal use. */
export const employeeTasks = pgTable("employee_tasks", {
  _id: uuid("id").defaultRandom().primaryKey(),
  employeeId: uuid("employee_id").notNull().references(() => employees._id),
  taskType: text("task_type").$type<"ASSIGNED" | "PERSONAL">().notNull().default("ASSIGNED"),
  title: text("title").notNull(),
  description: text("description"),
  category: text("category").notNull().default("GENERAL"),
  assignedByUserId: uuid("assigned_by_user_id").notNull().references(() => users._id),
  priority: text("priority").$type<"LOW" | "MEDIUM" | "HIGH" | "URGENT">().notNull().default("MEDIUM"),
  status: text("status").$type<"ASSIGNED" | "ACCEPTED" | "IN_PROGRESS" | "ON_HOLD" | "COMPLETED" | "CANCELLED">().notNull().default("ASSIGNED"),
  startAt: timestamp("start_at", { withTimezone: true, mode: "date" }),
  deadlineAt: timestamp("deadline_at", { withTimezone: true, mode: "date" }),
  estimatedMinutes: integer("estimated_minutes"),
  projectId: uuid("project_id").references(() => projects._id),
  leadId: uuid("lead_id").references(() => leads._id),
  completionNotes: text("completion_notes"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow().$onUpdate(() => new Date()),
  completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
}, (t) => [
  index("employee_tasks_employee_status_idx").on(t.employeeId, t.status),
  index("employee_tasks_deadline_idx").on(t.deadlineAt, t.status),
  index("employee_tasks_project_idx").on(t.projectId),
  index("employee_tasks_lead_idx").on(t.leadId),
]);
export type IEmployeeTask = typeof employeeTasks.$inferSelect;

export const employeeTaskHistory = pgTable("employee_task_history", {
  _id: uuid("id").defaultRandom().primaryKey(),
  taskId: uuid("task_id").notNull().references(() => employeeTasks._id),
  actorUserId: uuid("actor_user_id").notNull().references(() => users._id),
  action: text("action").notNull(),
  beforeValue: jsonb("before_value").$type<Record<string, unknown>>(),
  afterValue: jsonb("after_value").$type<Record<string, unknown>>(),
  reason: text("reason"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
}, (t) => [index("employee_task_history_task_idx").on(t.taskId, t.createdAt)]);
export type IEmployeeTaskHistory = typeof employeeTaskHistory.$inferSelect;

export const employeeTaskComments = pgTable("employee_task_comments", {
  _id: uuid("id").defaultRandom().primaryKey(),
  taskId: uuid("task_id").notNull().references(() => employeeTasks._id),
  authorUserId: uuid("author_user_id").notNull().references(() => users._id),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
}, (t) => [index("employee_task_comments_task_idx").on(t.taskId, t.createdAt)]);
export type IEmployeeTaskComment = typeof employeeTaskComments.$inferSelect;

export const employeeTaskAssignments = pgTable("employee_task_assignments", {
  _id: uuid("id").defaultRandom().primaryKey(),
  taskId: uuid("task_id").notNull().references(() => employeeTasks._id, { onDelete: "cascade" }),
  employeeId: uuid("employee_id").notNull().references(() => employees._id),
  assignedByUserId: uuid("assigned_by_user_id").notNull().references(() => users._id),
  status: text("status").$type<"ASSIGNED" | "ACCEPTED" | "IN_PROGRESS" | "ON_HOLD" | "COMPLETED" | "CANCELLED">().notNull().default("ASSIGNED"),
  assignedAt: timestamp("assigned_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  uniqueIndex("employee_task_assignment_unique").on(t.taskId, t.employeeId),
  index("employee_task_assignments_employee_status_idx").on(t.employeeId, t.status),
  index("employee_task_assignments_task_idx").on(t.taskId),
]);
export type IEmployeeTaskAssignment = typeof employeeTaskAssignments.$inferSelect;

export const employeeTaskAttachments = pgTable("employee_task_attachments", {
  _id: uuid("id").defaultRandom().primaryKey(),
  taskId: uuid("task_id").notNull().references(() => employeeTasks._id, { onDelete: "cascade" }),
  uploadedByUserId: uuid("uploaded_by_user_id").notNull().references(() => users._id),
  storedFileName: text("stored_file_name").notNull().unique(),
  originalFileName: text("original_file_name").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
}, (t) => [index("employee_task_attachments_task_idx").on(t.taskId, t.createdAt)]);
export type IEmployeeTaskAttachment = typeof employeeTaskAttachments.$inferSelect;

export const employeeLeaveRequests = pgTable("employee_leave_requests", {
  _id: uuid("id").defaultRandom().primaryKey(),
  employeeId: uuid("employee_id").notNull().references(() => employees._id),
  requestedByUserId: uuid("requested_by_user_id").notNull().references(() => users._id),
  leaveType: text("leave_type").$type<"ANNUAL" | "SICK" | "CASUAL" | "UNPAID" | "OTHER">().notNull().default("CASUAL"),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  totalDays: integer("total_days").notNull(),
  reason: text("reason").notNull(),
  status: text("status").$type<"PENDING" | "APPROVED" | "REJECTED" | "CANCELLED">().notNull().default("PENDING"),
  reviewedByUserId: uuid("reviewed_by_user_id").references(() => users._id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true, mode: "date" }),
  reviewNotes: text("review_notes"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("employee_leave_requests_employee_status_idx").on(t.employeeId, t.status),
  index("employee_leave_requests_dates_idx").on(t.startDate, t.endDate),
]);
export type IEmployeeLeaveRequest = typeof employeeLeaveRequests.$inferSelect;

export const employeeAttendance = pgTable("employee_attendance", {
  _id: uuid("id").defaultRandom().primaryKey(),
  employeeId: uuid("employee_id").notNull().references(() => employees._id),
  attendanceDate: text("attendance_date").notNull(),
  status: text("status").$type<"PRESENT" | "ABSENT" | "HALF_DAY" | "ON_LEAVE" | "HOLIDAY">().notNull().default("PRESENT"),
  checkInAt: timestamp("check_in_at", { withTimezone: true, mode: "date" }),
  checkOutAt: timestamp("check_out_at", { withTimezone: true, mode: "date" }),
  workingMinutes: integer("working_minutes"),
  late: boolean("late"),
  notes: text("notes"),
  correctionReason: text("correction_reason"),
  correctedByUserId: uuid("corrected_by_user_id").references(() => users._id),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  uniqueIndex("employee_attendance_employee_date_unique").on(t.employeeId, t.attendanceDate),
  index("employee_attendance_date_status_idx").on(t.attendanceDate, t.status),
]);
export type IEmployeeAttendance = typeof employeeAttendance.$inferSelect;

/** Monthly payroll record. Marking a record Paid is a manual status update only. */
export const employeeSalaryRecords = pgTable("employee_salary_records", {
  _id: uuid("id").defaultRandom().primaryKey(),
  employeeId: uuid("employee_id").notNull().references(() => employees._id),
  monthKey: text("month_key").notNull(),
  grossSalary: doublePrecision("gross_salary").notNull().default(0),
  allowances: doublePrecision("allowances").notNull().default(0),
  deductions: doublePrecision("deductions").notNull().default(0),
  netPayable: doublePrecision("net_payable").notNull().default(0),
  status: text("status").$type<"DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "PAID" | "ON_HOLD">().notNull().default("DRAFT"),
  paymentDate: timestamp("payment_date", { withTimezone: true, mode: "date" }),
  paymentReference: text("payment_reference"),
  notes: text("notes"),
  createdByUserId: uuid("created_by_user_id").notNull().references(() => users._id),
  approvedByUserId: uuid("approved_by_user_id").references(() => users._id),
  paidByUserId: uuid("paid_by_user_id").references(() => users._id),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  uniqueIndex("employee_salary_employee_month_unique").on(t.employeeId, t.monthKey),
  index("employee_salary_status_month_idx").on(t.status, t.monthKey),
]);
export type IEmployeeSalaryRecord = typeof employeeSalaryRecords.$inferSelect;

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

// Customer experience: NPS survey responses and complaints, logged by the
// team. Drives the founder CX metrics (NPS score, open/closed complaints,
// average resolution time). Created idempotently in ensureSchema.
export const customerFeedback = pgTable("customer_feedback", {
  _id: uuid("id").defaultRandom().primaryKey(),
  kind: text("kind").$type<"NPS" | "COMPLAINT">().notNull().default("NPS"),
  customerName: text("customer_name"),
  // NPS: 0–10 recommendation score. Null for pure complaints.
  score: integer("score"),
  note: text("note"),
  // COMPLAINT lifecycle.
  status: text("status").$type<"OPEN" | "RESOLVED">().notNull().default("OPEN"),
  resolvedAt: timestamp("resolved_at", { withTimezone: true, mode: "date" }),
  createdById: uuid("created_by_id").references(() => users._id),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});
export type ICustomerFeedback = typeof customerFeedback.$inferSelect;

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
// COMMAND CENTER FINANCIALS — founder-entered capital investments, revenue and
// recurring monthly payments that power the Founder Dashboard financial cards
// (Total/Monthly Investment, Total/Monthly Revenue, Monthly Payments). Every
// figure the cards show is derived from these rows (no fabricated numbers).
// Amounts are stored in whole rupees (doublePrecision), matching the other
// founder-module money columns (employees.monthlyCtc, marketingCampaigns.spend).
// ---------------------------------------------------------------------------

// Capital / business investments logged by founders. `date` is the investment
// date (drives the Monthly Investment card's current-month rollup).
export const commandInvestments = pgTable("command_investments", {
  _id: uuid("id").defaultRandom().primaryKey(),
  title: text("title").notNull(),
  category: text("category").notNull().default("General"),
  amount: doublePrecision("amount").notNull().default(0),
  date: timestamp("date", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  notes: text("notes"),
  createdById: uuid("created_by_id").references(() => users._id),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});
export type ICommandInvestment = typeof commandInvestments.$inferSelect;

// Revenue entries logged by founders. `date` drives the Monthly Revenue card.
export const commandRevenues = pgTable("command_revenues", {
  _id: uuid("id").defaultRandom().primaryKey(),
  title: text("title").notNull(),
  category: text("category").notNull().default("General"),
  amount: doublePrecision("amount").notNull().default(0),
  date: timestamp("date", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  notes: text("notes"),
  createdById: uuid("created_by_id").references(() => users._id),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});
export type ICommandRevenue = typeof commandRevenues.$inferSelect;

// Recurring monthly costs — the "Monthly Costing" ledger (API/software
// subscriptions, hosting/server, Twilio, office rent, internet & other
// recurring costs). Only `active` rows count toward the Monthly Costing total.
// Payment tracking is month-scoped: `paidForMonth` holds the month key
// (e.g. "2026-07") the expense was last marked paid for, so a new month
// automatically flips everything back to Pending with no reset job.
// `dueDay` is the day-of-month (1–28) the payment is due, driving the
// upcoming-due list; `paidDate` is when it was actually paid this month.
export const recurringExpenses = pgTable("recurring_expenses", {
  _id: uuid("id").defaultRandom().primaryKey(),
  label: text("label").notNull(),
  category: text("category").notNull().default("Other"),
  amount: doublePrecision("amount").notNull().default(0),
  dueDay: integer("due_day").notNull().default(1),
  paidForMonth: text("paid_for_month"),
  paidDate: timestamp("paid_date", { withTimezone: true, mode: "date" }),
  notes: text("notes"),
  active: boolean("active").notNull().default(true),
  createdById: uuid("created_by_id").references(() => users._id),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});
export type IRecurringExpense = typeof recurringExpenses.$inferSelect;

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
    // Applied discount voucher (if any). amountPaise already reflects the
    // discount; these are for the record and admin reporting.
    voucherCode: text("voucher_code"),
    discountPaise: integer("discount_paise").notNull().default(0),
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
 * Discount vouchers (coupon codes). Admin-issued; validated and applied on the
 * SERVER at checkout so the discount can never be forged by the client. A
 * PERCENT voucher takes `discountValue`% off (optionally capped at
 * `maxDiscountPaise`); a FIXED voucher takes `discountValue` paise off. A
 * voucher can be scoped to specific plan ids and/or a category, limited by a
 * total redemption count and an expiry, and toggled active/inactive.
 */
export const vouchers = pgTable(
  "vouchers",
  {
    _id: uuid("id").defaultRandom().primaryKey(),
    code: text("code").notNull(), // stored UPPERCASE, unique
    description: text("description"),
    discountType: text("discount_type").$type<"PERCENT" | "FIXED">().notNull().default("PERCENT"),
    discountValue: integer("discount_value").notNull().default(0), // percent (1..100) or paise off
    maxDiscountPaise: integer("max_discount_paise"), // cap for PERCENT (null = uncapped)
    planIds: jsonb("plan_ids").$type<string[]>(), // null/empty = any plan
    category: text("category"), // BUYER | CP | DEVELOPER | null (any)
    maxRedemptions: integer("max_redemptions"), // null = unlimited
    redeemedCount: integer("redeemed_count").notNull().default(0),
    minAmountPaise: integer("min_amount_paise").notNull().default(0),
    active: boolean("active").notNull().default(true),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }),
    createdById: uuid("created_by_id").references(() => users._id),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("vouchers_code_idx").on(t.code)],
);
export type IVoucher = typeof vouchers.$inferSelect;

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
  // New-lead alerts to the owner/admin. Admin-only — never sent to other roles.
  leadAlertEnabled: boolean("lead_alert_enabled").notNull().default(true),
  leadAlertPhone: text("lead_alert_phone"),
  leadAlertEmail: text("lead_alert_email"),
  // Fixed onboarding meeting everyone new is invited to (admin-set).
  onboardingSession: jsonb("onboarding_session").$type<OnboardingSession | null>(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});
export interface OnboardingSession {
  date: string; // YYYY-MM-DD (IST)
  time: string; // HH:MM (IST)
  link: string;
  note?: string;
}
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

// ---------------------------------------------------------------------------
// Channel Partner commission wallet/ledger. Two earning streams feed ONE
// wallet so the CP (and admin) always see a single Total / Paid / Pending:
//   1. Developer Onboarding Commission — 2% recurring of a referred developer's
//      monthly subscription, accrued once per developer per month
//      (developer_commission_accruals).
//   2. Property Sale Commission — the CP's commission on a booked sale (already
//      stored in `commissions.cpCommissionAmount`).
// Admin payouts are recorded in cp_commission_payments; pending = earned − paid.
// All amounts are whole rupees (doublePrecision), matching `commissions`.
// ---------------------------------------------------------------------------

export const developerCommissionAccruals = pgTable(
  "developer_commission_accruals",
  {
    _id: uuid("id").defaultRandom().primaryKey(),
    cpId: uuid("cp_id").notNull().references(() => users._id),
    developerId: uuid("developer_id").notNull().references(() => users._id),
    // Month this 2% accrual is for, e.g. "2026-08".
    monthKey: text("month_key").notNull(),
    // Rupee amount = 2% of the developer's monthly subscription value.
    amount: doublePrecision("amount").notNull().default(0),
    subscriptionAmount: doublePrecision("subscription_amount").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("dev_commission_dev_month_unique").on(t.developerId, t.monthKey),
    index("dev_commission_cp_idx").on(t.cpId),
  ]
);
export type IDeveloperCommissionAccrual = typeof developerCommissionAccruals.$inferSelect;

export type CommissionPaymentMode = "UPI" | "BANK_TRANSFER" | "CASH" | "CHEQUE" | "OTHER";
export const cpCommissionPayments = pgTable(
  "cp_commission_payments",
  {
    _id: uuid("id").defaultRandom().primaryKey(),
    cpId: uuid("cp_id").notNull().references(() => users._id),
    amount: doublePrecision("amount").notNull().default(0),
    mode: text("mode").$type<CommissionPaymentMode>().notNull().default("BANK_TRANSFER"),
    transactionId: text("transaction_id"),
    paymentDate: timestamp("payment_date", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    notes: text("notes"),
    createdById: uuid("created_by_id").references(() => users._id),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("cp_commission_payments_cp_idx").on(t.cpId, t.createdAt)]
);
export type ICpCommissionPayment = typeof cpCommissionPayments.$inferSelect;

/**
 * Admin-managed (manual) commission entries for Channel Partners. The system
 * never auto-creates these — an admin/sales user adds a commission once a lead
 * reaches Booking Confirmed, then Approves it and marks it Paid. This is the
 * property-sale side of a CP's earnings (the developer-referral 2% stays fully
 * automatic in `developer_commission_accruals`).
 */
export type ManualCommissionStatus = "PENDING" | "APPROVED" | "PAID";
export const cpManualCommissions = pgTable(
  "cp_manual_commissions",
  {
    _id: uuid("id").defaultRandom().primaryKey(),
    cpId: uuid("cp_id").notNull().references(() => users._id),
    leadId: uuid("lead_id").references(() => leads._id),
    label: text("label"),
    bookingValue: doublePrecision("booking_value"),
    percent: doublePrecision("percent"),
    amount: doublePrecision("amount").notNull().default(0),
    status: text("status").$type<ManualCommissionStatus>().notNull().default("PENDING"),
    paidAmount: doublePrecision("paid_amount"),
    paymentDate: timestamp("payment_date", { withTimezone: true, mode: "date" }),
    transactionRef: text("transaction_ref"),
    paymentMode: text("payment_mode"),
    notes: text("notes"),
    createdById: uuid("created_by_id").references(() => users._id),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("cp_manual_commissions_cp_idx").on(t.cpId, t.createdAt)]
);
export type ICpManualCommission = typeof cpManualCommissions.$inferSelect;

/**
 * Investment terms an admin sets PER PROJECT. Returns are always framed as
 * "targeted / projected", never guaranteed. `isOpen` gates whether a project
 * is accepting investments — off by default until the legal/compliance
 * framework is in place.
 */
export const projectInvestmentTerms = pgTable(
  "project_investment_terms",
  {
    _id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id").notNull().references(() => projects._id),
    isOpen: boolean("is_open").notNull().default(false),
    minAmount: doublePrecision("min_amount").notNull().default(100000),
    maxAmount: doublePrecision("max_amount"),
    targetAnnualReturnPercent: doublePrecision("target_annual_return_percent").notNull().default(0),
    tenureMonths: integer("tenure_months").notNull().default(12),
    monthlyPayoutPercent: doublePrecision("monthly_payout_percent"),
    notes: text("notes"),
    updatedById: uuid("updated_by_id").references(() => users._id),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("project_investment_terms_project_unique").on(t.projectId)]
);
export type IProjectInvestmentTerms = typeof projectInvestmentTerms.$inferSelect;

export type ProjectInvestmentStatus = "CREATED" | "PAID" | "CANCELLED";
/** A single investment made by a user into a project. Money in paise. The
 *  terms (target return, tenure, monthly payout) are snapshotted at purchase. */
export const projectInvestments = pgTable(
  "project_investments",
  {
    _id: uuid("id").defaultRandom().primaryKey(),
    investorId: uuid("investor_id").notNull().references(() => users._id),
    projectId: uuid("project_id").notNull().references(() => projects._id),
    amountPaise: integer("amount_paise").notNull(),
    targetAnnualReturnPercent: doublePrecision("target_annual_return_percent").notNull().default(0),
    tenureMonths: integer("tenure_months").notNull().default(12),
    monthlyPayoutPercent: doublePrecision("monthly_payout_percent"),
    status: text("status").$type<ProjectInvestmentStatus>().notNull().default("CREATED"),
    razorpayOrderId: text("razorpay_order_id"),
    razorpayPaymentId: text("razorpay_payment_id"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("investments_investor_idx").on(t.investorId), index("investments_project_idx").on(t.projectId)]
);
export type IProjectInvestment = typeof projectInvestments.$inferSelect;

/**
 * Ambassador Knowledge Hub — a training area ONLY for Ambassadors, fully
 * managed from the admin panel. Separate from the CP/Developer Learning
 * Academy (`academy_content`). Topics hold multiple materials (videos + docs).
 */
export type AmbassadorMaterialKind = "VIDEO" | "DOC";
export const ambassadorKnowledgeTopics = pgTable(
  "ambassador_knowledge_topics",
  {
    _id: uuid("id").defaultRandom().primaryKey(),
    title: text("title").notNull(),
    description: text("description"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("ambassador_knowledge_topics_sort_idx").on(t.sortOrder)]
);
export type IAmbassadorKnowledgeTopic = typeof ambassadorKnowledgeTopics.$inferSelect;

export const ambassadorKnowledgeMaterials = pgTable(
  "ambassador_knowledge_materials",
  {
    _id: uuid("id").defaultRandom().primaryKey(),
    topicId: uuid("topic_id").notNull().references(() => ambassadorKnowledgeTopics._id),
    kind: text("kind").$type<AmbassadorMaterialKind>().notNull().default("VIDEO"),
    title: text("title").notNull(),
    url: text("url").notNull(),
    fileName: text("file_name"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdById: uuid("created_by_id").references(() => users._id),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("ambassador_knowledge_materials_topic_idx").on(t.topicId, t.sortOrder)]
);
export type IAmbassadorKnowledgeMaterial = typeof ambassadorKnowledgeMaterials.$inferSelect;

/** Single-row config for the Knowledge Hub (admin-editable help contact). */
export const ambassadorKnowledgeConfig = pgTable("ambassador_knowledge_config", {
  _id: uuid("id").defaultRandom().primaryKey(),
  helpContact: text("help_contact"),
  helpText: text("help_text"),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});
export type IAmbassadorKnowledgeConfig = typeof ambassadorKnowledgeConfig.$inferSelect;

// ─────────────────────────────────────────────────────────────────────────
// MARKETING MODULE — a self-contained access / purchase / dashboard feature,
// fully separate from the Developer pricing plans. An admin/founder grants
// "Marketing Access" to a partner (usually a Developer or CP), records the
// direct/offline payment (GST charged, never bypassed), sets a spendable
// budget + validity window, and can activate / deactivate / revoke at any
// time — the effect is immediate because access is re-checked on every
// request. Authorized users get a Marketing Dashboard (spend / used /
// remaining budget, lead + campaign tracking). Nothing here touches the
// existing `payments` / `subscriptions` tables or the pricing catalog, so
// Developer pricing is undisturbed.
// ─────────────────────────────────────────────────────────────────────────

/** One row per partner granted marketing access (unique per user). ACTIVE and
 *  within [validFrom, validUntil] = usable; INACTIVE = suspended but kept for
 *  history; revoke deletes the row. */
export const marketingAccess = pgTable(
  "marketing_access",
  {
    _id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull().references(() => users._id),
    status: text("status").$type<"ACTIVE" | "INACTIVE">().notNull().default("ACTIVE"),
    packageName: text("package_name").notNull().default("Marketing Access"),
    // Spendable marketing budget the partner has purchased, in paise (base,
    // excl. GST — GST lives on the payment record, it is not spendable budget).
    budgetPaise: integer("budget_paise").notNull().default(0),
    validFrom: timestamp("valid_from", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    validUntil: timestamp("valid_until", { withTimezone: true, mode: "date" }),
    grantedById: uuid("granted_by_id").references(() => users._id),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("marketing_access_user_idx").on(t.userId)]
);
export type IMarketingAccess = typeof marketingAccess.$inferSelect;

/** Direct / offline marketing payments recorded by an admin. GST is charged on
 *  top of the base amount and recorded explicitly — never avoided. */
export const marketingPayments = pgTable(
  "marketing_payments",
  {
    _id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull().references(() => users._id),
    partnerName: text("partner_name").notNull(),
    partnerEmail: text("partner_email"),
    partnerPhone: text("partner_phone"),
    packageName: text("package_name").notNull().default("Marketing Access"),
    // Money — all paise. total = amount + gst.
    amountPaise: integer("amount_paise").notNull().default(0),
    gstPercent: doublePrecision("gst_percent").notNull().default(18),
    gstPaise: integer("gst_paise").notNull().default(0),
    totalPaise: integer("total_paise").notNull().default(0),
    method: text("method").$type<"CASH" | "BANK_TRANSFER" | "UPI" | "CHEQUE" | "CARD" | "OTHER">().notNull().default("OTHER"),
    reference: text("reference"),
    status: text("status").$type<"PENDING" | "VERIFIED" | "FAILED" | "REFUNDED">().notNull().default("VERIFIED"),
    paidAt: timestamp("paid_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    verifiedById: uuid("verified_by_id").references(() => users._id),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("marketing_payments_user_idx").on(t.userId, t.createdAt)]
);
export type IMarketingPayment = typeof marketingPayments.$inferSelect;

/** Admin-tracked marketing spend/activity for a partner (drives "Total Amount
 *  Used" and "Remaining Budget"). */
export const marketingExpenses = pgTable(
  "marketing_expenses",
  {
    _id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull().references(() => users._id),
    activity: text("activity").notNull(),
    amountPaise: integer("amount_paise").notNull().default(0),
    status: text("status").$type<"PLANNED" | "ACTIVE" | "COMPLETED">().notNull().default("ACTIVE"),
    spentAt: timestamp("spent_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    notes: text("notes"),
    createdById: uuid("created_by_id").references(() => users._id),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("marketing_expenses_user_idx").on(t.userId, t.spentAt)]
);
export type IMarketingExpense = typeof marketingExpenses.$inferSelect;

/** Leads attributed to a partner's marketing (drives the lead cards:
 *  Today's / Total / Qualified / Converted / Pending). */
export const marketingLeads = pgTable(
  "marketing_leads",
  {
    _id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull().references(() => users._id),
    name: text("name").notNull(),
    phone: text("phone"),
    email: text("email"),
    source: text("source").notNull().default("Marketing"),
    status: text("status").$type<"NEW" | "QUALIFIED" | "CONVERTED" | "PENDING">().notNull().default("NEW"),
    valuePaise: integer("value_paise").notNull().default(0),
    notes: text("notes"),
    createdById: uuid("created_by_id").references(() => users._id),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("marketing_leads_user_idx").on(t.userId, t.createdAt),
    index("marketing_leads_status_idx").on(t.status),
  ]
);
export type IMarketingLead = typeof marketingLeads.$inferSelect;

/** Per-partner marketing campaigns (drives the "Marketing Campaigns" card).
 *  Distinct from the founder-module global `marketing_campaigns` table. */
export const marketingPartnerCampaigns = pgTable(
  "marketing_partner_campaigns",
  {
    _id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull().references(() => users._id),
    name: text("name").notNull(),
    channel: text("channel").notNull().default("Other"),
    status: text("status").$type<"ACTIVE" | "PAUSED" | "COMPLETED">().notNull().default("ACTIVE"),
    spendPaise: integer("spend_paise").notNull().default(0),
    leadsCount: integer("leads_count").notNull().default(0),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }),
    createdById: uuid("created_by_id").references(() => users._id),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("marketing_partner_campaigns_user_idx").on(t.userId)]
);
export type IMarketingPartnerCampaign = typeof marketingPartnerCampaigns.$inferSelect;

// Back-compat aliases used by services/intelligenceService and others
export type IPresentationInfo = PresentationInfo;
export type IVerificationDetails = VerificationDetails;
export type IPriceHistoryEntry = PriceHistoryEntry;
export type ICommissionMilestone = CommissionMilestone;

// Dynamic AI verification & Q&A engine (Phase 1). Re-exported so the whole
// schema is reachable from "../db/schema" and included in `import * as schema`.
export * from "./verificationSchema";

// ── Offers (admin-managed incentives shown on inventory) ─────────────────────
// e.g. Paradise Town: "For every 1,000 sq ft sold, earn ₹1,00,000" →
// calcBasis PER_AREA_BLOCK, basisQuantity 1000, amount 100000. Rewards are
// always calculated on the server from these fields.
export type OfferRewardType = "INCENTIVE" | "BONUS_COMMISSION" | "GIFT" | "DISCOUNT";
export type OfferCalcBasis = "PER_AREA_BLOCK" | "PER_UNIT" | "PERCENT_OF_VALUE" | "FIXED";
export const offers = pgTable(
  "offers",
  {
    _id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    projectId: uuid("project_id").notNull().references(() => projects._id),
    unitId: uuid("unit_id").references(() => units._id),
    description: text("description"),
    badgeText: text("badge_text"),
    terms: text("terms"),
    rewardType: text("reward_type").$type<OfferRewardType>().notNull().default("INCENTIVE"),
    calcBasis: text("calc_basis").$type<OfferCalcBasis>().notNull().default("PER_AREA_BLOCK"),
    basisQuantity: doublePrecision("basis_quantity"),
    amount: doublePrecision("amount").notNull(),
    // Pay pro-rata for a part block (1,500 sq ft → ₹1.5L) instead of whole blocks only.
    prorate: boolean("prorate").notNull().default(false),
    eligibleRoles: jsonb("eligible_roles").$type<Role[]>().notNull().default(["CP", "AMBASSADOR"]),
    startDate: text("start_date"), // YYYY-MM-DD (IST), inclusive
    endDate: text("end_date"), // YYYY-MM-DD (IST), inclusive
    isActive: boolean("is_active").notNull().default(true),
    // Soft delete — an offer a lead was attached to stays referencable.
    deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "date" }),
    createdById: uuid("created_by_id").references(() => users._id),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [index("offers_project_idx").on(t.projectId)]
);
export type IOffer = typeof offers.$inferSelect;

// ── Support meetings ("Schedule a Google Meet" with the Truvi team) ──────────
export type SupportMeetingStatus = "REQUESTED" | "CONFIRMED" | "COMPLETED" | "CANCELLED";
export type SupportMeetingTopic = "ONBOARDING" | "HELP";
export const supportMeetings = pgTable(
  "support_meetings",
  {
    _id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull().references(() => users._id),
    topic: text("topic").$type<SupportMeetingTopic>().notNull().default("HELP"),
    date: text("date").notNull(), // YYYY-MM-DD (IST)
    time: text("time").notNull(), // HH:MM (IST)
    note: text("note"),
    meetLink: text("meet_link"),
    status: text("status").$type<SupportMeetingStatus>().notNull().default("REQUESTED"),
    adminNote: text("admin_note"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [index("support_meetings_user_idx").on(t.userId), index("support_meetings_date_idx").on(t.date)]
);
export type ISupportMeeting = typeof supportMeetings.$inferSelect;

// ── Truvi Habitat (home services; deliberately separate from property sales) ──
export const habitatServiceCategories = pgTable(
  "habitat_service_categories",
  {
    _id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    icon: text("icon"),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("habitat_categories_slug_unique").on(t.slug), index("habitat_categories_active_idx").on(t.active, t.sortOrder)]
);
export type IHabitatServiceCategory = typeof habitatServiceCategories.$inferSelect;

export const habitatProviders = pgTable(
  "habitat_providers",
  {
    _id: uuid("id").defaultRandom().primaryKey(),
    ownerUserId: uuid("owner_user_id").notNull().references(() => users._id),
    businessName: text("business_name").notNull(),
    description: text("description").notNull(),
    categoryIds: jsonb("category_ids").$type<string[]>().notNull().default([]),
    serviceAreas: jsonb("service_areas").$type<string[]>().notNull().default([]),
    experienceYears: integer("experience_years").notNull().default(0),
    status: text("status").$type<HabitatProviderStatus>().notNull().default("PENDING"),
    reviewNote: text("review_note"),
    reviewedById: uuid("reviewed_by_id").references(() => users._id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true, mode: "date" }),
    razorpayAccountId: text("razorpay_account_id"),
    razorpayAccountStatus: text("razorpay_account_status").notNull().default("NOT_STARTED"),
    razorpayAccountCreatedAt: timestamp("razorpay_account_created_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("habitat_providers_owner_unique").on(t.ownerUserId),
    uniqueIndex("habitat_providers_razorpay_account_unique").on(t.razorpayAccountId),
    index("habitat_providers_status_idx").on(t.status),
  ]
);
export type IHabitatProvider = typeof habitatProviders.$inferSelect;

export const habitatServices = pgTable(
  "habitat_services",
  {
    _id: uuid("id").defaultRandom().primaryKey(),
    categoryId: uuid("category_id").notNull().references(() => habitatServiceCategories._id),
    title: text("title").notNull(),
    description: text("description").notNull(),
    pricingModel: text("pricing_model").$type<HabitatPricingModel>().notNull(),
    pricePaise: integer("price_paise"),
    durationMinutes: integer("duration_minutes"),
    includes: jsonb("includes").$type<string[]>().notNull().default([]),
    excludes: jsonb("excludes").$type<string[]>().notNull().default([]),
    cancellationPolicy: text("cancellation_policy").notNull(),
    active: boolean("active").notNull().default(true),
    createdById: uuid("created_by_id").references(() => users._id),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("habitat_services_category_active_idx").on(t.categoryId, t.active),
    index("habitat_services_active_idx").on(t.active),
  ]
);
export type IHabitatService = typeof habitatServices.$inferSelect;

export const habitatInvitations = pgTable(
  "habitat_invitations",
  {
    _id: uuid("id").defaultRandom().primaryKey(),
    code: text("code").notNull(),
    projectId: uuid("project_id").notNull().references(() => projects._id),
    campaign: text("campaign"),
    createdById: uuid("created_by_id").notNull().references(() => users._id),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }),
    revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("habitat_invitations_code_unique").on(t.code),
    index("habitat_invitations_project_idx").on(t.projectId, t.createdAt),
  ]
);
export type IHabitatInvitation = typeof habitatInvitations.$inferSelect;

export const habitatMemberships = pgTable(
  "habitat_memberships",
  {
    _id: uuid("id").defaultRandom().primaryKey(),
    buyerId: uuid("buyer_id").notNull().references(() => users._id),
    projectId: uuid("project_id").notNull().references(() => projects._id),
    invitationId: uuid("invitation_id").notNull().references(() => habitatInvitations._id),
    consentedAt: timestamp("consented_at", { withTimezone: true, mode: "date" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("habitat_memberships_buyer_project_unique").on(t.buyerId, t.projectId),
    index("habitat_memberships_project_idx").on(t.projectId, t.createdAt),
  ]
);
export type IHabitatMembership = typeof habitatMemberships.$inferSelect;

export const habitatBookings = pgTable(
  "habitat_bookings",
  {
    _id: uuid("id").defaultRandom().primaryKey(),
    reference: text("reference").notNull(),
    buyerId: uuid("buyer_id").notNull().references(() => users._id),
    projectId: uuid("project_id").notNull().references(() => projects._id),
    invitationId: uuid("invitation_id").notNull().references(() => habitatInvitations._id),
    serviceId: uuid("service_id").notNull().references(() => habitatServices._id),
    providerId: uuid("provider_id").references(() => habitatProviders._id),
    status: text("status").$type<HabitatBookingStatus>().notNull().default("REQUESTED"),
    serviceTitleSnapshot: text("service_title_snapshot").notNull(),
    pricingModelSnapshot: text("pricing_model_snapshot").$type<HabitatPricingModel>().notNull(),
    estimatedAmountPaise: integer("estimated_amount_paise"),
    finalAmountPaise: integer("final_amount_paise"),
    commissionRateBps: integer("commission_rate_bps"),
    commissionAmountPaise: integer("commission_amount_paise"),
    commissionTaxRateBps: integer("commission_tax_rate_bps"),
    commissionTaxPaise: integer("commission_tax_paise"),
    providerPayoutPaise: integer("provider_payout_paise"),
    cancellationFeeBpsSnapshot: integer("cancellation_fee_bps_snapshot"),
    completionSubmittedAt: timestamp("completion_submitted_at", { withTimezone: true, mode: "date" }),
    autoCompleteAt: timestamp("auto_complete_at", { withTimezone: true, mode: "date" }),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
    payoutEligibleAt: timestamp("payout_eligible_at", { withTimezone: true, mode: "date" }),
    payoutStatus: text("payout_status").notNull().default("NOT_READY"),
    serviceAddress: jsonb("service_address").$type<{
      label: string;
      street: string;
      locality: string;
      city: string;
      postalCode: string;
      instructions?: string;
    }>().notNull(),
    preferredAt: timestamp("preferred_at", { withTimezone: true, mode: "date" }).notNull(),
    requestDetails: text("request_details"),
    termsAcceptedAt: timestamp("terms_accepted_at", { withTimezone: true, mode: "date" }).notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("habitat_bookings_reference_unique").on(t.reference),
    uniqueIndex("habitat_bookings_buyer_idempotency_unique").on(t.buyerId, t.idempotencyKey),
    index("habitat_bookings_buyer_created_idx").on(t.buyerId, t.createdAt),
    index("habitat_bookings_provider_status_idx").on(t.providerId, t.status, t.preferredAt),
    index("habitat_bookings_status_idx").on(t.status, t.createdAt),
  ]
);
export type IHabitatBooking = typeof habitatBookings.$inferSelect;

export const habitatBookingStatusHistory = pgTable(
  "habitat_booking_status_history",
  {
    _id: uuid("id").defaultRandom().primaryKey(),
    bookingId: uuid("booking_id").notNull().references(() => habitatBookings._id),
    actorUserId: uuid("actor_user_id").references(() => users._id),
    fromStatus: text("from_status").$type<HabitatBookingStatus>(),
    toStatus: text("to_status").$type<HabitatBookingStatus>().notNull(),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("habitat_booking_history_booking_idx").on(t.bookingId, t.createdAt)]
);
export type IHabitatBookingStatusHistory = typeof habitatBookingStatusHistory.$inferSelect;

export const habitatReviews = pgTable(
  "habitat_reviews",
  {
    _id: uuid("id").defaultRandom().primaryKey(),
    bookingId: uuid("booking_id").notNull().references(() => habitatBookings._id),
    buyerId: uuid("buyer_id").notNull().references(() => users._id),
    providerId: uuid("provider_id").notNull().references(() => habitatProviders._id),
    serviceId: uuid("service_id").notNull().references(() => habitatServices._id),
    rating: integer("rating").notNull(),
    comment: text("comment"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("habitat_reviews_booking_unique").on(t.bookingId),
    index("habitat_reviews_service_idx").on(t.serviceId, t.createdAt),
  ]
);
export type IHabitatReview = typeof habitatReviews.$inferSelect;

export const habitatQuotes = pgTable(
  "habitat_quotes",
  {
    _id: uuid("id").defaultRandom().primaryKey(),
    bookingId: uuid("booking_id").notNull().references(() => habitatBookings._id),
    providerId: uuid("provider_id").notNull().references(() => habitatProviders._id),
    amountPaise: integer("amount_paise").notNull(),
    workDescription: text("work_description").notNull(),
    status: text("status").$type<HabitatQuoteStatus>().notNull().default("PROPOSED"),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("habitat_quotes_booking_idx").on(t.bookingId, t.createdAt),
    index("habitat_quotes_provider_idx").on(t.providerId, t.status),
  ]
);
export type IHabitatQuote = typeof habitatQuotes.$inferSelect;

export const habitatCommissionRules = pgTable(
  "habitat_commission_rules",
  {
    _id: uuid("id").defaultRandom().primaryKey(),
    categoryId: uuid("category_id").notNull().references(() => habitatServiceCategories._id),
    projectId: uuid("project_id").references(() => projects._id),
    providerId: uuid("provider_id").references(() => habitatProviders._id),
    rateBps: integer("rate_bps").notNull(),
    effectiveFrom: timestamp("effective_from", { withTimezone: true, mode: "date" }).notNull(),
    effectiveUntil: timestamp("effective_until", { withTimezone: true, mode: "date" }),
    createdById: uuid("created_by_id").notNull().references(() => users._id),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("habitat_commission_rules_lookup_idx").on(t.categoryId, t.projectId, t.providerId, t.effectiveFrom),
  ]
);
export type IHabitatCommissionRule = typeof habitatCommissionRules.$inferSelect;

export const habitatSettings = pgTable(
  "habitat_settings",
  {
    _id: uuid("id").defaultRandom().primaryKey(),
    singletonKey: text("singleton_key").notNull().default("default"),
    cancellationFeeBps: integer("cancellation_fee_bps").notNull().default(2500),
    commissionTaxRateBps: integer("commission_tax_rate_bps").notNull().default(1800),
    autoCompleteHours: integer("auto_complete_hours").notNull().default(72),
    updatedById: uuid("updated_by_id").references(() => users._id),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("habitat_settings_singleton_unique").on(t.singletonKey)]
);
export type IHabitatSettings = typeof habitatSettings.$inferSelect;

export const habitatPayments = pgTable(
  "habitat_payments",
  {
    _id: uuid("id").defaultRandom().primaryKey(),
    bookingId: uuid("booking_id").notNull().references(() => habitatBookings._id),
    buyerId: uuid("buyer_id").notNull().references(() => users._id),
    quoteId: uuid("quote_id").references(() => habitatQuotes._id),
    amountPaise: integer("amount_paise").notNull(),
    commissionAmountPaise: integer("commission_amount_paise").notNull(),
    commissionTaxPaise: integer("commission_tax_paise").notNull(),
    providerAmountPaise: integer("provider_amount_paise").notNull(),
    currency: text("currency").notNull().default("INR"),
    status: text("status").$type<HabitatPaymentStatus>().notNull().default("CREATED"),
    razorpayOrderId: text("razorpay_order_id"),
    razorpayPaymentId: text("razorpay_payment_id"),
    razorpaySignature: text("razorpay_signature"),
    failureReason: text("failure_reason"),
    idempotencyKey: text("idempotency_key").notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("habitat_payments_order_unique").on(t.razorpayOrderId),
    uniqueIndex("habitat_payments_payment_unique").on(t.razorpayPaymentId),
    uniqueIndex("habitat_payments_idempotency_unique").on(t.buyerId, t.idempotencyKey),
    index("habitat_payments_booking_idx").on(t.bookingId, t.createdAt),
  ]
);
export type IHabitatPayment = typeof habitatPayments.$inferSelect;

export const habitatRefunds = pgTable(
  "habitat_refunds",
  {
    _id: uuid("id").defaultRandom().primaryKey(),
    paymentId: uuid("payment_id").notNull().references(() => habitatPayments._id),
    amountPaise: integer("amount_paise").notNull(),
    compensationPaise: integer("compensation_paise").notNull().default(0),
    reason: text("reason").notNull(),
    status: text("status").notNull().default("PENDING"),
    razorpayRefundId: text("razorpay_refund_id"),
    idempotencyKey: text("idempotency_key").notNull(),
    initiatedById: uuid("initiated_by_id").notNull().references(() => users._id),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("habitat_refunds_rzp_unique").on(t.razorpayRefundId),
    uniqueIndex("habitat_refunds_idempotency_unique").on(t.idempotencyKey),
    index("habitat_refunds_payment_idx").on(t.paymentId, t.createdAt),
  ]
);

export const habitatDisputes = pgTable(
  "habitat_disputes",
  {
    _id: uuid("id").defaultRandom().primaryKey(),
    bookingId: uuid("booking_id").notNull().references(() => habitatBookings._id),
    buyerId: uuid("buyer_id").notNull().references(() => users._id),
    reason: text("reason").notNull(),
    evidence: jsonb("evidence").$type<string[]>().notNull().default([]),
    status: text("status").$type<HabitatDisputeStatus>().notNull().default("OPEN"),
    resolutionNote: text("resolution_note"),
    refundAmountPaise: integer("refund_amount_paise"),
    reviewedById: uuid("reviewed_by_id").references(() => users._id),
    resolvedAt: timestamp("resolved_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("habitat_disputes_booking_unique").on(t.bookingId),
    index("habitat_disputes_status_idx").on(t.status, t.createdAt),
  ]
);

export const habitatTransfers = pgTable(
  "habitat_transfers",
  {
    _id: uuid("id").defaultRandom().primaryKey(),
    bookingId: uuid("booking_id").notNull().references(() => habitatBookings._id),
    paymentId: uuid("payment_id").notNull().references(() => habitatPayments._id),
    providerId: uuid("provider_id").notNull().references(() => habitatProviders._id),
    amountPaise: integer("amount_paise").notNull(),
    razorpayTransferId: text("razorpay_transfer_id"),
    status: text("status").$type<HabitatTransferStatus>().notNull().default("PENDING"),
    idempotencyKey: text("idempotency_key").notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true, mode: "date" }),
    failureReason: text("failure_reason"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("habitat_transfers_booking_unique").on(t.bookingId),
    uniqueIndex("habitat_transfers_external_unique").on(t.razorpayTransferId),
    uniqueIndex("habitat_transfers_idempotency_unique").on(t.idempotencyKey),
    index("habitat_transfers_status_idx").on(t.status, t.createdAt),
  ]
);

export const habitatLedgerEntries = pgTable(
  "habitat_ledger_entries",
  {
    _id: uuid("id").defaultRandom().primaryKey(),
    journalId: uuid("journal_id").notNull(),
    bookingId: uuid("booking_id").notNull().references(() => habitatBookings._id),
    paymentId: uuid("payment_id").references(() => habitatPayments._id),
    accountCode: text("account_code").notNull(),
    direction: text("direction").notNull(),
    amountPaise: integer("amount_paise").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    metadata: jsonb("metadata").$type<Record<string, string | number | boolean | null>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("habitat_ledger_idempotency_unique").on(t.idempotencyKey),
    index("habitat_ledger_journal_idx").on(t.journalId),
    index("habitat_ledger_booking_idx").on(t.bookingId, t.createdAt),
  ]
);

export const habitatDeveloperAccess = pgTable(
  "habitat_developer_access",
  {
    _id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id").notNull().references(() => projects._id),
    developerId: uuid("developer_id").notNull().references(() => users._id),
    active: boolean("active").notNull().default(true),
    grantedById: uuid("granted_by_id").notNull().references(() => users._id),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("habitat_developer_access_project_unique").on(t.projectId),
    index("habitat_developer_access_user_idx").on(t.developerId, t.active),
  ]
);

export const habitatProjectCategories = pgTable(
  "habitat_project_categories",
  {
    _id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id").notNull().references(() => projects._id),
    categoryId: uuid("category_id").notNull().references(() => habitatServiceCategories._id),
    enabled: boolean("enabled").notNull().default(true),
    updatedById: uuid("updated_by_id").notNull().references(() => users._id),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("habitat_project_categories_unique").on(t.projectId, t.categoryId),
    index("habitat_project_categories_project_idx").on(t.projectId, t.enabled),
  ]
);


// ---------------------------------------------------------------------------
// Truvi Ambassador Operating System — additive pilot tables.
// Kept separate from existing CP/lead tables so the pilot can evolve without
// changing the established sales and commission workflows.
// ---------------------------------------------------------------------------

export type AmbassadorOsStatus =
  | "REGISTERED"
  | "VERIFICATION_PENDING"
  | "TRAINING_IN_PROGRESS"
  | "ASSESSMENT_PENDING"
  | "CERTIFIED"
  | "ACTIVE"
  | "TEMPORARILY_INACTIVE"
  | "SUSPENDED"
  | "EXITED";

export type AmbassadorOsTrainingStatus =
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "ASSESSMENT_PENDING"
  | "RETAKE_REQUIRED"
  | "COMPLETED";

export const ambassadorOsProfiles = pgTable(
  "ambassador_os_profiles",
  {
    _id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull().references(() => users._id),
    // Stable internal sequence. Display IDs are rendered as TRUVI-{cityCode}-{number}.
    ambassadorNo: bigserial("ambassador_no", { mode: "number" }).notNull(),
    cityCode: text("city_code").notNull().default("LKO"),
    college: text("college"),
    course: text("course"),
    academicYear: text("academic_year"),
    city: text("city").notNull().default("Lucknow"),
    preferredRole: text("preferred_role").notNull().default("SALES"),
    weeklyAvailabilityHours: integer("weekly_availability_hours").notNull().default(5),
    termsAcceptedAt: timestamp("terms_accepted_at", { withTimezone: true, mode: "date" }),
    termsVersion: text("terms_version"),
    certificateNo: text("certificate_no"),
    certifiedAt: timestamp("certified_at", { withTimezone: true, mode: "date" }),
    certifiedById: uuid("certified_by_id").references(() => users._id),
    status: text("status").$type<AmbassadorOsStatus>().notNull().default("REGISTERED"),
    currentLevel: text("current_level").notNull().default("L0"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("ambassador_os_profiles_user_unique").on(t.userId),
    uniqueIndex("ambassador_os_profiles_number_unique").on(t.ambassadorNo),
    uniqueIndex("ambassador_os_profiles_certificate_unique").on(t.certificateNo),
    index("ambassador_os_profiles_status_idx").on(t.status),
  ]
);

export const ambassadorOsTrainingModules = pgTable(
  "ambassador_os_training_modules",
  {
    _id: uuid("id").defaultRandom().primaryKey(),
    day: integer("day").notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    lesson: text("lesson").notNull(),
    keyPoints: jsonb("key_points").$type<string[]>().notNull().default([]),
    assignment: text("assignment").notNull(),
    questions: jsonb("questions").$type<Array<{ prompt: string; options: string[]; answer: number }>>().notNull().default([]),
    videoUrl: text("video_url"),
    version: integer("version").notNull().default(1),
    isPublished: boolean("is_published").notNull().default(false),
    publishedById: uuid("published_by_id").references(() => users._id),
    publishedAt: timestamp("published_at", { withTimezone: true, mode: "date" }),
    createdById: uuid("created_by_id").notNull().references(() => users._id),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("ambassador_os_training_modules_day_pub_idx").on(t.day, t.isPublished, t.version)]
);

export const ambassadorOsTrainingProgress = pgTable(
  "ambassador_os_training_progress",
  {
    _id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull().references(() => users._id),
    day: integer("day").notNull(),
    quizScore: integer("quiz_score").notNull().default(0),
    realEstateKnowledgeScore: integer("real_estate_knowledge_score"),
    projectKnowledgeScore: integer("project_knowledge_score"),
    customerCommunicationScore: integer("customer_communication_score"),
    marketingKnowledgeScore: integer("marketing_knowledge_score"),
    ethicsComplianceScore: integer("ethics_compliance_score"),
    attendanceStatus: text("attendance_status").$type<"NOT_RECORDED" | "PRESENT" | "ABSENT" | "EXCUSED">().notNull().default("NOT_RECORDED"),
    lessonVersion: integer("lesson_version").notNull().default(1),
    answers: jsonb("answers").$type<number[]>().notNull().default([]),
    assignmentText: text("assignment_text"),
    practicalStatus: text("practical_status").$type<"PENDING" | "APPROVED" | "REJECTED">().notNull().default("PENDING"),
    ethicsStatus: text("ethics_status").$type<"PENDING" | "APPROVED" | "REJECTED">().notNull().default("PENDING"),
    trainerFeedback: text("trainer_feedback"),
    status: text("status").$type<AmbassadorOsTrainingStatus>().notNull().default("NOT_STARTED"),
    reviewedById: uuid("reviewed_by_id").references(() => users._id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true, mode: "date" }),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("ambassador_os_training_user_day_unique").on(t.userId, t.day),
    index("ambassador_os_training_status_idx").on(t.status, t.day),
  ]
);

export const ambassadorOsFollowUps = pgTable(
  "ambassador_os_follow_ups",
  {
    _id: uuid("id").defaultRandom().primaryKey(),
    leadId: uuid("lead_id").notNull().references(() => leads._id),
    ambassadorId: uuid("ambassador_id").notNull().references(() => users._id),
    dueAt: timestamp("due_at", { withTimezone: true, mode: "date" }).notNull(),
    channel: text("channel").$type<"CALL" | "WHATSAPP" | "EMAIL" | "MEETING">().notNull().default("CALL"),
    note: text("note").notNull(),
    status: text("status").$type<AmbassadorFollowUpStatus>().notNull().default("PENDING"),
    outcome: text("outcome"),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("ambassador_os_followups_owner_due_idx").on(t.ambassadorId, t.status, t.dueAt),
    index("ambassador_os_followups_lead_idx").on(t.leadId, t.dueAt),
  ]
);

export const ambassadorOsTasks = pgTable(
  "ambassador_os_tasks",
  {
    _id: uuid("id").defaultRandom().primaryKey(),
    title: text("title").notNull(),
    category: text("category").$type<"TRAINING" | "SALES" | "MARKETING" | "LEAD_MANAGEMENT" | "SITE_VISIT" | "RESEARCH" | "VERIFICATION">().notNull(),
    description: text("description").notNull(),
    assignedToId: uuid("assigned_to_id").notNull().references(() => users._id),
    campaignId: uuid("campaign_id"),
    dueAt: timestamp("due_at", { withTimezone: true, mode: "date" }),
    status: text("status").$type<"ASSIGNED" | "ACCEPTED" | "IN_PROGRESS" | "SUBMITTED" | "APPROVED" | "REJECTED" | "CLOSED">().notNull().default("ASSIGNED"),
    evidenceText: text("evidence_text"),
    evidenceUrl: text("evidence_url"),
    checklistItems: jsonb("checklist_items").$type<Array<{ key: string; label: string }>>().notNull().default([]),
    checklistResponses: jsonb("checklist_responses").$type<string[]>().notNull().default([]),
    reviewReason: text("review_reason"),
    reviewedById: uuid("reviewed_by_id").references(() => users._id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true, mode: "date" }),
    createdById: uuid("created_by_id").notNull().references(() => users._id),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
  },
  (t) => [
    index("ambassador_os_tasks_assignee_status_idx").on(t.assignedToId, t.status),
    index("ambassador_os_tasks_due_idx").on(t.dueAt),
  ]
);

export const ambassadorOsCampaigns = pgTable(
  "ambassador_os_campaigns",
  {
    _id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id").references(() => projects._id),
    name: text("name").notNull(),
    projectName: text("project_name").notNull(),
    location: text("location").notNull(),
    targetInventory: integer("target_inventory").notNull(),
    salesTarget: integer("sales_target").notNull().default(114),
    unitAreaSqFt: integer("unit_area_sq_ft").notNull(),
    targetDays: integer("target_days").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true, mode: "date" }),
    status: text("status").$type<"PLANNED" | "ACTIVE" | "PAUSED" | "COMPLETED">().notNull().default("PLANNED"),
    officialDataVerified: boolean("official_data_verified").notNull().default(false),
    officialDataNotes: text("official_data_notes"),
    createdById: uuid("created_by_id").notNull().references(() => users._id),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("ambassador_os_campaign_status_idx").on(t.status)]
);

export const ambassadorOsPropertyBookings = pgTable(
  "ambassador_os_property_bookings",
  {
    _id: uuid("id").defaultRandom().primaryKey(),
    bookingNo: bigserial("booking_no", { mode: "number" }).notNull(),
    bookingReference: text("booking_reference").notNull().unique(),
    leadId: uuid("lead_id").notNull().references(() => leads._id),
    campaignId: uuid("campaign_id").references(() => ambassadorOsCampaigns._id),
    projectId: uuid("project_id").notNull().references(() => projects._id),
    unitId: uuid("unit_id").references(() => units._id),
    status: text("status").$type<AmbassadorPropertyBookingStatus>().notNull().default("SUBMITTED"),
    bookingValue: doublePrecision("booking_value").notNull(),
    amountReceived: doublePrecision("amount_received").notNull().default(0),
    paymentMilestone: text("payment_milestone").$type<AmbassadorBookingPaymentMilestone>().notNull().default("BOOKING_CONFIRMED"),
    paymentMilestoneNotes: text("payment_milestone_notes"),
    agreementReference: text("agreement_reference"),
    sourceSnapshot: text("source_snapshot"),
    verifiedById: uuid("verified_by_id").references(() => users._id),
    verifiedAt: timestamp("verified_at", { withTimezone: true, mode: "date" }),
    rejectedById: uuid("rejected_by_id").references(() => users._id),
    rejectedAt: timestamp("rejected_at", { withTimezone: true, mode: "date" }),
    rejectionReason: text("rejection_reason"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true, mode: "date" }),
    cancellationReason: text("cancellation_reason"),
    refundStatus: text("refund_status").$type<"NOT_REQUIRED" | "PENDING" | "PARTIAL" | "REFUNDED">().notNull().default("NOT_REQUIRED"),
    refundAmount: doublePrecision("refund_amount").notNull().default(0),
    refundReference: text("refund_reference"),
    expectedIncentivePayoutAt: timestamp("expected_incentive_payout_at", { withTimezone: true, mode: "date" }),
    notes: text("notes"),
    createdById: uuid("created_by_id").notNull().references(() => users._id),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("ambassador_os_property_booking_no_unique").on(t.bookingNo),
    index("ambassador_os_property_booking_status_idx").on(t.status, t.createdAt),
    index("ambassador_os_property_booking_project_idx").on(t.projectId, t.status),
    index("ambassador_os_property_booking_lead_idx").on(t.leadId, t.createdAt),
    index("ambassador_os_property_booking_campaign_idx").on(t.campaignId, t.status),
  ]
);
export type IAmbassadorOsPropertyBooking = typeof ambassadorOsPropertyBookings.$inferSelect;

export const ambassadorOsScorecardPolicies = pgTable(
  "ambassador_os_scorecard_policies",
  {
    _id: uuid("id").defaultRandom().primaryKey(),
    version: integer("version").notNull().default(1),
    genuineLeadQualityWeight: integer("genuine_lead_quality_weight").notNull().default(25),
    customerCommunicationWeight: integer("customer_communication_weight").notNull().default(20),
    siteVisitContributionWeight: integer("site_visit_contribution_weight").notNull().default(15),
    verifiedSalesContributionWeight: integer("verified_sales_contribution_weight").notNull().default(15),
    crmDisciplineWeight: integer("crm_discipline_weight").notNull().default(10),
    trainingSkillDevelopmentWeight: integer("training_skill_development_weight").notNull().default(10),
    ethicsComplianceWeight: integer("ethics_compliance_weight").notNull().default(5),
    active: boolean("active").notNull().default(true),
    approvalReference: text("approval_reference"),
    createdById: uuid("created_by_id").notNull().references(() => users._id),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("ambassador_os_scorecard_policy_version_unique").on(t.version), index("ambassador_os_scorecard_policy_active_idx").on(t.active)]
);

export const ambassadorOsPerformanceReviews = pgTable(
  "ambassador_os_performance_reviews",
  {
    _id: uuid("id").defaultRandom().primaryKey(),
    ambassadorId: uuid("ambassador_id").notNull().references(() => users._id),
    periodStart: timestamp("period_start", { withTimezone: true, mode: "date" }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true, mode: "date" }).notNull(),
    scorecardPolicyVersion: integer("scorecard_policy_version").notNull(),
    genuineLeadQualityScore: integer("genuine_lead_quality_score").notNull(),
    customerCommunicationScore: integer("customer_communication_score").notNull(),
    siteVisitContributionScore: integer("site_visit_contribution_score").notNull(),
    verifiedSalesContributionScore: integer("verified_sales_contribution_score").notNull(),
    crmDisciplineScore: integer("crm_discipline_score").notNull(),
    trainingSkillDevelopmentScore: integer("training_skill_development_score").notNull(),
    ethicsComplianceScore: integer("ethics_compliance_score").notNull(),
    weightedScore: doublePrecision("weighted_score").notNull(),
    seriousMisconduct: boolean("serious_misconduct").notNull().default(false),
    complianceNotes: text("compliance_notes"),
    reviewNotes: text("review_notes"),
    reviewedById: uuid("reviewed_by_id").notNull().references(() => users._id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("ambassador_os_performance_ambassador_period_idx").on(t.ambassadorId, t.periodEnd),
    index("ambassador_os_performance_misconduct_idx").on(t.seriousMisconduct, t.periodEnd),
  ]
);
export type IAmbassadorOsPerformanceReview = typeof ambassadorOsPerformanceReviews.$inferSelect;

export type AmbassadorCareerAssessmentType = "MENTORING" | "TEAM_MANAGEMENT" | "ADVANCED";

export const ambassadorOsCareerAssessments = pgTable(
  "ambassador_os_career_assessments",
  {
    _id: uuid("id").defaultRandom().primaryKey(),
    ambassadorId: uuid("ambassador_id").notNull().references(() => users._id),
    targetLevel: text("target_level").$type<"L4" | "L5" | "L6">().notNull(),
    assessmentType: text("assessment_type").$type<AmbassadorCareerAssessmentType>().notNull(),
    score: integer("score").notNull(),
    passed: boolean("passed").notNull().default(false),
    evidenceReference: text("evidence_reference").notNull(),
    notes: text("notes").notNull(),
    reviewerId: uuid("reviewer_id").notNull().references(() => users._id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("ambassador_os_career_assessments_ambassador_level_idx").on(t.ambassadorId, t.targetLevel, t.reviewedAt),
    index("ambassador_os_career_assessments_result_idx").on(t.targetLevel, t.passed, t.reviewedAt),
  ]
);
export type IAmbassadorOsCareerAssessment = typeof ambassadorOsCareerAssessments.$inferSelect;

export type AmbassadorCareerOpportunityStatus = "DRAFT" | "PUBLISHED" | "CLOSED";
export type AmbassadorCareerOpportunityType = "INTERNSHIP" | "JOB" | "CAMPUS_LEADERSHIP" | "MENTORING";

export const ambassadorOsCareerOpportunities = pgTable(
  "ambassador_os_career_opportunities",
  {
    _id: uuid("id").defaultRandom().primaryKey(),
    title: text("title").notNull(),
    opportunityType: text("opportunity_type").$type<AmbassadorCareerOpportunityType>().notNull(),
    description: text("description").notNull(),
    location: text("location"),
    targetLevel: text("target_level").$type<"L1" | "L2" | "L3" | "L4" | "L5" | "L6">().notNull(),
    requiredSkills: jsonb("required_skills").$type<string[]>().notNull().default([]),
    eligibility: jsonb("eligibility").$type<Record<string, unknown>>().notNull().default({}),
    vacancies: integer("vacancies").notNull().default(1),
    applicationDeadline: timestamp("application_deadline", { withTimezone: true, mode: "date" }),
    status: text("status").$type<AmbassadorCareerOpportunityStatus>().notNull().default("DRAFT"),
    createdById: uuid("created_by_id").notNull().references(() => users._id),
    publishedAt: timestamp("published_at", { withTimezone: true, mode: "date" }),
    closedAt: timestamp("closed_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("ambassador_os_opportunities_status_deadline_idx").on(t.status, t.applicationDeadline),
    index("ambassador_os_opportunities_level_idx").on(t.targetLevel, t.status),
  ]
);
export type IAmbassadorOsCareerOpportunity = typeof ambassadorOsCareerOpportunities.$inferSelect;

export type AmbassadorCareerApplicationStatus = "SUBMITTED" | "UNDER_REVIEW" | "SHORTLISTED" | "REJECTED" | "SELECTED" | "WITHDRAWN";

export const ambassadorOsCareerApplications = pgTable(
  "ambassador_os_career_applications",
  {
    _id: uuid("id").defaultRandom().primaryKey(),
    opportunityId: uuid("opportunity_id").notNull().references(() => ambassadorOsCareerOpportunities._id),
    ambassadorId: uuid("ambassador_id").notNull().references(() => users._id),
    statement: text("statement").notNull(),
    evidenceReference: text("evidence_reference"),
    status: text("status").$type<AmbassadorCareerApplicationStatus>().notNull().default("SUBMITTED"),
    reviewerId: uuid("reviewer_id").references(() => users._id),
    reviewNotes: text("review_notes"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("ambassador_os_career_application_unique").on(t.opportunityId, t.ambassadorId),
    index("ambassador_os_career_applications_status_idx").on(t.status, t.createdAt),
    index("ambassador_os_career_applications_ambassador_idx").on(t.ambassadorId, t.createdAt),
  ]
);
export type IAmbassadorOsCareerApplication = typeof ambassadorOsCareerApplications.$inferSelect;

export const ambassadorOsChannelCosts = pgTable(
  "ambassador_os_channel_costs",
  {
    _id: uuid("id").defaultRandom().primaryKey(),
    campaignId: uuid("campaign_id").notNull().references(() => ambassadorOsCampaigns._id),
    sourceChannel: text("source_channel").$type<LeadSourceChannel>().notNull(),
    amount: doublePrecision("amount").notNull(),
    periodStart: timestamp("period_start", { withTimezone: true, mode: "date" }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true, mode: "date" }).notNull(),
    evidenceReference: text("evidence_reference"),
    notes: text("notes"),
    createdById: uuid("created_by_id").notNull().references(() => users._id),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("ambassador_os_channel_cost_campaign_idx").on(t.campaignId, t.sourceChannel, t.periodStart),
  ]
);

export const ambassadorOsPropertyBookingHistory = pgTable(
  "ambassador_os_property_booking_history",
  {
    _id: uuid("id").defaultRandom().primaryKey(),
    bookingId: uuid("booking_id").notNull().references(() => ambassadorOsPropertyBookings._id),
    fromStatus: text("from_status").$type<AmbassadorPropertyBookingStatus>(),
    toStatus: text("to_status").$type<AmbassadorPropertyBookingStatus>().notNull(),
    reason: text("reason"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    actorUserId: uuid("actor_user_id").notNull().references(() => users._id),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("ambassador_os_booking_history_idx").on(t.bookingId, t.createdAt)]
);
export type IAmbassadorOsPropertyBookingHistory = typeof ambassadorOsPropertyBookingHistory.$inferSelect;

export const ambassadorOsIncentivePolicies = pgTable(
  "ambassador_os_incentive_policies",
  {
    _id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    campaignId: uuid("campaign_id").references(() => ambassadorOsCampaigns._id),
    calculationType: text("calculation_type").$type<"FIXED" | "PER_SQ_FT_BLOCK" | "PERCENT_OF_VALUE">().notNull(),
    amount: doublePrecision("amount").notNull(),
    blockSizeSqFt: integer("block_size_sq_ft").notNull().default(1000),
    eligibleSources: jsonb("eligible_sources").$type<string[]>().notNull().default([]),
    requiredBookingStatus: text("required_booking_status").$type<AmbassadorPropertyBookingStatus>().notNull().default("SALE_VERIFIED"),
    paymentMilestone: text("payment_milestone").$type<AmbassadorBookingPaymentMilestone>().notNull().default("BOOKING_CONFIRMED"),
    cancellationTreatment: text("cancellation_treatment").$type<"CANCEL_INCENTIVE" | "RECOVER_PAID" | "MANUAL_REVIEW">().notNull().default("CANCEL_INCENTIVE"),
    payoutDelayDays: integer("payout_delay_days").notNull().default(30),
    approvalAuthority: text("approval_authority"),
    commissionAgreementReference: text("commission_agreement_reference"),
    version: integer("version").notNull().default(1),
    active: boolean("active").notNull().default(false),
    approvalReference: text("approval_reference"),
    effectiveFrom: timestamp("effective_from", { withTimezone: true, mode: "date" }),
    createdById: uuid("created_by_id").notNull().references(() => users._id),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("ambassador_os_policy_name_version_unique").on(t.name, t.version),
    index("ambassador_os_policy_active_idx").on(t.active),
  ]
);

export const ambassadorOsIncentives = pgTable(
  "ambassador_os_incentives",
  {
    _id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull().references(() => users._id),
    campaignId: uuid("campaign_id").references(() => ambassadorOsCampaigns._id),
    policyId: uuid("policy_id").notNull().references(() => ambassadorOsIncentivePolicies._id),
    policyNameSnapshot: text("policy_name_snapshot").notNull(),
    policyVersion: integer("policy_version").notNull(),
    bookingReference: text("booking_reference").notNull().unique(),
    propertyBookingId: uuid("property_booking_id").references(() => ambassadorOsPropertyBookings._id),
    expectedPayoutAt: timestamp("expected_payout_at", { withTimezone: true, mode: "date" }),
    recoveryStatus: text("recovery_status").$type<"NOT_REQUIRED" | "PENDING_REVIEW" | "RECOVERY_REQUIRED" | "RECOVERED">().notNull().default("NOT_REQUIRED"),
    recoveryAmount: doublePrecision("recovery_amount").notNull().default(0),
    recoveryReference: text("recovery_reference"),
    recoveryReviewedById: uuid("recovery_reviewed_by_id").references(() => users._id),
    recoveryReviewedAt: timestamp("recovery_reviewed_at", { withTimezone: true, mode: "date" }),
    verifiedAreaSqFt: integer("verified_area_sq_ft").notNull(),
    propertyValue: doublePrecision("property_value"),
    amount: doublePrecision("amount").notNull(),
    status: text("status").$type<"PENDING" | "APPROVED" | "PAYABLE" | "PAID" | "CANCELLED">().notNull().default("PENDING"),
    paymentReference: text("payment_reference"),
    createdById: uuid("created_by_id").notNull().references(() => users._id),
    approvedById: uuid("approved_by_id").references(() => users._id),
    approvedAt: timestamp("approved_at", { withTimezone: true, mode: "date" }),
    paidAt: timestamp("paid_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("ambassador_os_incentives_booking_unique").on(t.bookingReference),
    uniqueIndex("ambassador_os_incentives_property_booking_unique").on(t.propertyBookingId),
    index("ambassador_os_incentives_user_status_idx").on(t.userId, t.status),
  ]
);

/** Versioned marketing guidelines require a new acknowledgement when published content changes. */
export const ambassadorOsCampaignGuidelines = pgTable("ambassador_os_campaign_guidelines", {
  _id: uuid("id").defaultRandom().primaryKey(),
  campaignId: uuid("campaign_id").notNull().references(() => ambassadorOsCampaigns._id),
  version: integer("version").notNull(),
  content: text("content").notNull(),
  approvalReference: text("approval_reference").notNull(),
  createdById: uuid("created_by_id").notNull().references(() => users._id),
  publishedAt: timestamp("published_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
}, (t) => [uniqueIndex("ambassador_os_campaign_guidelines_version_unique").on(t.campaignId, t.version), index("ambassador_os_campaign_guidelines_current_idx").on(t.campaignId, t.publishedAt)]);

export const ambassadorOsCampaignAcknowledgements = pgTable("ambassador_os_campaign_acknowledgements", {
  _id: uuid("id").defaultRandom().primaryKey(),
  campaignId: uuid("campaign_id").notNull().references(() => ambassadorOsCampaigns._id),
  ambassadorId: uuid("ambassador_id").notNull().references(() => users._id),
  guidelineVersion: integer("guideline_version").notNull(),
  acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
}, (t) => [uniqueIndex("ambassador_os_campaign_ack_version_unique").on(t.campaignId, t.ambassadorId, t.guidelineVersion), index("ambassador_os_campaign_ack_user_idx").on(t.ambassadorId, t.campaignId, t.guidelineVersion)]);

export type AmbassadorOsMarketingMaterialStatus = "SUBMITTED" | "APPROVED" | "REJECTED" | "RETIRED";
export const ambassadorOsMarketingMaterials = pgTable("ambassador_os_marketing_materials", {
  _id: uuid("id").defaultRandom().primaryKey(),
  campaignId: uuid("campaign_id").notNull().references(() => ambassadorOsCampaigns._id),
  title: text("title").notNull(),
  channel: text("channel").$type<"WHATSAPP" | "INSTAGRAM" | "FACEBOOK" | "POSTER" | "EMAIL" | "BROCHURE" | "OTHER">().notNull(),
  content: text("content").notNull(),
  assetUrl: text("asset_url"),
  version: integer("version").notNull().default(1),
  status: text("status").$type<AmbassadorOsMarketingMaterialStatus>().notNull().default("SUBMITTED"),
  validFrom: timestamp("valid_from", { withTimezone: true, mode: "date" }),
  validTo: timestamp("valid_to", { withTimezone: true, mode: "date" }),
  reviewerId: uuid("reviewer_id").references(() => users._id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true, mode: "date" }),
  reviewReason: text("review_reason"),
  createdById: uuid("created_by_id").notNull().references(() => users._id),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
}, (t) => [index("ambassador_os_marketing_material_status_idx").on(t.status, t.campaignId), index("ambassador_os_marketing_material_dates_idx").on(t.validFrom, t.validTo)]);

/** OS-scoped internal responsibilities; these do not grant global Admin access. */
export type AmbassadorOsStaffRole = "PROGRAM_MANAGER" | "SALES_COORDINATOR" | "TRAINING_COORDINATOR";
export const ambassadorOsStaffAssignments = pgTable("ambassador_os_staff_assignments", {
  _id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users._id),
  osRole: text("os_role").$type<AmbassadorOsStaffRole>().notNull(),
  active: boolean("active").notNull().default(true),
  grantedById: uuid("granted_by_id").notNull().references(() => users._id),
  grantedAt: timestamp("granted_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
}, (t) => [uniqueIndex("ambassador_os_staff_assignment_unique").on(t.userId, t.osRole), index("ambassador_os_staff_active_role_idx").on(t.active, t.osRole)]);
export type IAmbassadorOsStaffAssignment = typeof ambassadorOsStaffAssignments.$inferSelect;

export type AmbassadorOsPrivacyRequestType = "ACCESS" | "RECTIFICATION" | "DELETION";
export type AmbassadorOsPrivacyRequestStatus = "SUBMITTED" | "UNDER_REVIEW" | "APPROVED" | "REJECTED" | "COMPLETED";
export const ambassadorOsPrivacyRequests = pgTable("ambassador_os_privacy_requests", {
  _id: uuid("id").defaultRandom().primaryKey(),
  requesterUserId: uuid("requester_user_id").notNull().references(() => users._id),
  requestType: text("request_type").$type<AmbassadorOsPrivacyRequestType>().notNull(),
  reason: text("reason").notNull(),
  status: text("status").$type<AmbassadorOsPrivacyRequestStatus>().notNull().default("SUBMITTED"),
  reviewNotes: text("review_notes"),
  reviewerUserId: uuid("reviewer_user_id").references(() => users._id),
  completionReference: text("completion_reference"),
  requestedAt: timestamp("requested_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
}, (t) => [index("ambassador_os_privacy_request_user_idx").on(t.requesterUserId, t.requestedAt), index("ambassador_os_privacy_request_status_idx").on(t.status, t.requestedAt)]);

export type AmbassadorOsRetentionCategory = "TASK_EVIDENCE" | "TRAINING_ASSIGNMENT_TEXT" | "REJECTED_MARKETING_CONTENT";
export const ambassadorOsRetentionPolicies = pgTable("ambassador_os_retention_policies", {
  _id: uuid("id").defaultRandom().primaryKey(),
  dataCategory: text("data_category").$type<AmbassadorOsRetentionCategory>().notNull(),
  retentionDays: integer("retention_days").notNull(),
  active: boolean("active").notNull().default(false),
  legalApprovalReference: text("legal_approval_reference"),
  policyVersion: integer("policy_version").notNull().default(1),
  createdById: uuid("created_by_id").notNull().references(() => users._id),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
}, (t) => [uniqueIndex("ambassador_os_retention_category_version_unique").on(t.dataCategory, t.policyVersion), index("ambassador_os_retention_active_idx").on(t.active, t.dataCategory)]);
