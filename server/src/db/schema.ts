/**
 * Drizzle ORM schema for Supabase (PostgreSQL).
 *
 * Migrated 1:1 from the former Mongoose models (server/src/models/*).
 * Conventions:
 *  - Every table has a UUID primary key stored in the DB column `id`, but the
 *    TypeScript property is named `_id` so API responses keep the exact shape
 *    the React client already expects (it reads `_id` everywhere).
 *  - Former embedded Mongoose subdocuments (cpProfile, verificationDetails,
 *    priceHistory, milestones, ...) are stored as JSONB columns so response
 *    shapes stay identical.
 *  - Former Mongo string enums are `text` columns with TS enum typing
 *    (enforced at the app layer, same as Mongoose did).
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

export type Role = "ADMIN" | "DEVELOPER" | "CP" | "BUYER";
export type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED";
export type CPTier = "SILVER" | "GOLD" | "PLATINUM" | "DIAMOND";
export type ListingTier = "STANDARD" | "FEATURED";
export type ProjectType = "RESIDENTIAL" | "COMMERCIAL" | "INDUSTRIAL" | "MIXED_USE" | "PLOTTED";
export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";
export type ReraStatus = "REGISTERED" | "PENDING" | "NOT_REGISTERED";
export type UnitStatus = "AVAILABLE" | "LOCKED" | "RESERVED" | "SOLD";
export type LeadStage =
  | "GENERATED" | "ASSIGNED" | "CONTACTED" | "SITE_VISIT"
  | "NEGOTIATION" | "BOOKING" | "REGISTRATION" | "LOST";
export type CommissionStatus = "PENDING" | "MILESTONE_DUE" | "INVOICED" | "PAID";
export type SiteVisitStatus = "SCHEDULED" | "CONFIRMED" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
export type LeadType = "BASIC" | "QUALIFIED" | "SITE_VISIT";
export type PaymentStatus = "SIMULATED" | "CREATED" | "PAID" | "FAILED";
export type PostCategory = "ANNOUNCEMENT" | "DISCUSSION" | "TIP" | "MARKET_UPDATE";
export type EnquiryPurpose = "BUYER" | "DEVELOPER" | "CP" | "GUEST";
export type BuyerDocType = "ID_PROOF" | "ADDRESS_PROOF" | "INCOME_PROOF";
export type BuyerDocStatus = "UPLOADED" | "UNDER_REVIEW" | "VERIFIED";
export type SharedDocFileType = "BROCHURE" | "FLOOR_PLAN" | "PRICE_LIST" | "LEGAL" | "OTHER";

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
}

export interface VerificationState {
  phoneOtp?: string | null;
  phoneOtpExpiry?: string | null; // ISO date string
  emailOtp?: string | null;
  emailOtpExpiry?: string | null; // ISO date string
  aadhaarDocumentUrl?: string | null;
  aadhaarVerifiedAt?: string | null; // ISO date string
}

export const DEFAULT_ONBOARDING_CHECKS: OnboardingChecks = {
  aadhaarVerified: false,
  phoneVerified: false,
  emailVerified: false,
};

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

export interface PresentationInfo {
  amenities?: string[];
  securityFeatures?: string[];
  smartHomeFeatures?: string[];
  fireSafetySystems?: string[];
  greenBuildingFeatures?: string[];
  connectivityNotes?: string;
  constructionProgressNote?: string;
}

export interface PriceHistoryEntry {
  price: number;
  changedAt: string; // ISO date string
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
    approvalStatus: text("approval_status").$type<ApprovalStatus>().notNull().default("PENDING"),
    phone: text("phone"),
    onboardingVerified: boolean("onboarding_verified").notNull().default(false),
    onboardingChecks: jsonb("onboarding_checks").$type<OnboardingChecks>().default(DEFAULT_ONBOARDING_CHECKS),
    verification: jsonb("verification").$type<VerificationState>(),
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
    isVerified: boolean("is_verified").notNull().default(false),
    verifiedAt: timestamp("verified_at", { withTimezone: true, mode: "date" }),
    verificationDetails: jsonb("verification_details").$type<VerificationDetails>().default(DEFAULT_VERIFICATION_DETAILS),
    projectType: text("project_type").$type<ProjectType>(),
    presentationInfo: jsonb("presentation_info").$type<PresentationInfo>(),
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
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("project_assets_project_category_created_idx").on(t.projectId, t.category, t.createdAt)]
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
export type ICourseProgress = typeof courseProgress.$inferSelect;

// Back-compat aliases used by services/intelligenceService and others
export type IPresentationInfo = PresentationInfo;
export type IVerificationDetails = VerificationDetails;
export type IPriceHistoryEntry = PriceHistoryEntry;
export type ICommissionMilestone = CommissionMilestone;
