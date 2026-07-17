export type Role = "ADMIN" | "DEVELOPER" | "CP" | "BUYER" | "AMBASSADOR" | "VERIFIER";
export type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED";
export type AmbassadorTaskStatus = "AVAILABLE" | "LOCKED" | "COMPLETED";

export interface AmbassadorTaskChecklist {
  gpsOn: boolean;
  internetOn: boolean;
  liveLocation?: { lat: number; lng: number; capturedAt: string } | null;
}

export interface AmbassadorTaskDocument {
  url: string;
  label?: string;
  uploadedAt: string;
}

export interface AmbassadorTask {
  _id: string;
  title: string;
  address: string;
  mapUrl?: string | null;
  deadline: string;
  payoutAmount: number;
  instructions?: string | null;
  status: AmbassadorTaskStatus;
  acceptedById?: string | null;
  acceptedAt?: string | null;
  lockExpiresAt?: string | null;
  checklist?: AmbassadorTaskChecklist | null;
  documents: AmbassadorTaskDocument[];
  completedAt?: string | null;
  payoutPaid: boolean;
  createdById: string;
  createdAt: string;
}
export type CPTier = "SILVER" | "GOLD" | "PLATINUM" | "DIAMOND";
export type UnitStatus = "AVAILABLE" | "LOCKED" | "RESERVED" | "SOLD";
export type LeadStage =
  | "GENERATED" | "ASSIGNED" | "CONTACTED" | "SITE_VISIT"
  | "NEGOTIATION" | "BOOKING" | "REGISTRATION" | "LOST";
export type ListingTier = "STANDARD" | "FEATURED";

export type ProjectType = "RESIDENTIAL" | "COMMERCIAL" | "INDUSTRIAL" | "MIXED_USE" | "PLOTTED";

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
}

export interface ProjectAsset {
  _id: string;
  projectId: string;
  category: string;
  title: string;
  description?: string;
  fileUrl: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  verified?: boolean;
  createdAt: string;
}

export interface SalesContact {
  name?: string;
  phone?: string;
  email?: string;
}

export interface PaymentPlan {
  name: string;
  description?: string;
}

export interface VerificationDetails {
  reraVerified: boolean;
  titleClearance: boolean;
  encumbranceFree: boolean;
  constructionApproval: boolean;
  verificationSource?: string;
  portfolioVerified: boolean;
  lastVerifiedAt?: string;
  notes?: string;
}

export interface User {
  _id: string;
  name: string;
  email: string;
  role: Role;
  approvalStatus: ApprovalStatus;
  phone?: string;
  emailVerified?: boolean;
  phoneVerified?: boolean;
  onboardingVerified?: boolean;
  onboardingChecks?: {
    aadhaarVerified?: boolean;
    phoneVerified?: boolean;
    emailVerified?: boolean;
    panVerified?: boolean;
    kycStatus?: "PENDING" | "APPROVED" | "REJECTED";
    kycRejectionReason?: string | null;
  };
  cpTier?: CPTier;
  cpProfile?: {
    isPremium: boolean;
    premiumExpiresAt?: string | null;
    conversionRatio: number;
    totalBookings: number;
  };
  developerProfile?: {
    companyName: string;
    reraNumber?: string;
  };
}

export interface Project {
  _id: string;
  developerId: string | { _id: string; name: string };
  name: string;
  description: string;
  city: string;
  location: string;
  threeDModelUrl?: string | null;
  masterPlanUrl?: string | null;
  viewCount?: number;
  brochureUrl?: string;
  priceListUrl?: string;
  reraNumber?: string;
  approvalStatus: ApprovalStatus;
  listingTier: ListingTier;
  featuredUntil?: string | null;
  commissionPercent: number;
  unitCount?: number;
  leadCount?: number;
  isSaved?: boolean;
  isCompared?: boolean;
  trustScore?: number;
  legalRiskLevel?: "LOW" | "MEDIUM" | "HIGH";
  floodRiskLevel?: "LOW" | "MEDIUM" | "HIGH";
  crimeIndexLevel?: "LOW" | "MEDIUM" | "HIGH";
  reraStatus?: "REGISTERED" | "PENDING" | "NOT_REGISTERED";
  reraValidityDate?: string;
  isVerified?: boolean;
  verifiedAt?: string;
  isPrimeListing?: boolean;
  verificationDetails?: VerificationDetails;
  projectType?: ProjectType;
  presentationInfo?: PresentationInfo;
  // Developer-managed commercial details
  possessionDate?: string | null;
  salesContact?: SalesContact | null;
  paymentPlans?: PaymentPlan[] | null;
  // Live unit aggregates attached by GET /api/inventory
  minPrice?: number | null;
  maxPrice?: number | null;
  minRate?: number | null;
}

export interface PriceHistoryEntry {
  price: number;
  changedAt: string;
}

export interface Unit {
  _id: string;
  projectId: string;
  unitNumber: string;
  type: string;
  areaSqft: number;
  price: number;
  status: UnitStatus;
  lockedByCPId?: string | null;
  lockExpiresAt?: string | null;
  priceHistory: PriceHistoryEntry[];
}

export interface Lead {
  _id: string;
  projectId: string | { _id: string; name: string };
  submittedById: string | { _id: string; name: string };
  assignedToId?: string | { _id: string; name: string } | null;
  clientName: string;
  clientPhone: string;
  clientEmail?: string;
  stage: LeadStage;
  source: string;
  notes?: string;
  isDuplicate: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SiteVisit {
  _id: string;
  leadId?: string | { _id: string; clientName: string; clientPhone: string };
  projectId: string | { _id: string; name: string };
  cpId?: string | { _id: string; name: string };
  buyerId?: string | { _id: string; name: string };
  scheduledAt: string;
  timeSlot?: string;
  contactNumber?: string;
  status: "SCHEDULED" | "CONFIRMED" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
  geoVerifiedLat?: number;
  geoVerifiedLng?: number;
  attendanceConfirmed: boolean;
  reportNotes?: string;
  nextSteps?: string;
}

export interface CommissionMilestone {
  _id: string;
  label: string;
  percentOfTotal: number;
  amount: number;
  isReleased: boolean;
  releasedAt?: string | null;
}

export interface Commission {
  _id: string;
  leadId: string | Lead;
  cpId: string | { _id: string; name: string };
  bookingValue: number;
  commissionPercent: number;
  cpCommissionAmount: number;
  platformFeeAmount: number;
  tdsAmount: number;
  status: "PENDING" | "MILESTONE_DUE" | "INVOICED" | "PAID";
  milestones: CommissionMilestone[];
  invoiceUrl?: string;
  createdAt: string;
}

export type SharedDocFileType = "BROCHURE" | "FLOOR_PLAN" | "PRICE_LIST" | "LEGAL" | "OTHER";
export type BuyerDocType = "ID_PROOF" | "ADDRESS_PROOF" | "INCOME_PROOF";
export type BuyerDocStatus = "UPLOADED" | "UNDER_REVIEW" | "VERIFIED";

export interface SharedDocument {
  _id: string;
  projectId: string | { _id: string; name: string };
  uploadedById?: string | { _id: string; name: string };
  fileName: string;
  fileUrl: string;
  fileType: SharedDocFileType;
  description?: string;
  createdAt: string | null;
}

export interface BuyerDocument {
  _id: string;
  buyerId: string;
  docType: BuyerDocType;
  fileName: string;
  fileUrl: string;
  status: BuyerDocStatus;
  createdAt: string;
}

export interface Notification {
  _id: string;
  userId: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}
