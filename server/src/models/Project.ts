import { Schema, model, Document, Types } from "mongoose";

export type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED";
export type ListingTier = "STANDARD" | "FEATURED";
export type ProjectType = "RESIDENTIAL" | "COMMERCIAL" | "INDUSTRIAL" | "MIXED_USE" | "PLOTTED";

// Structured (non-file) presentation details: amenities, security systems,
// smart features, etc. Files live in the ProjectAsset collection.
export interface IPresentationInfo {
  amenities: string[];
  securityFeatures: string[]; // biometric access, CCTV & surveillance, smart security
  smartHomeFeatures: string[];
  fireSafetySystems: string[];
  greenBuildingFeatures: string[];
  connectivityNotes?: string;
  constructionProgressNote?: string;
}

export interface IVerificationDetails {
  reraVerified: boolean;
  titleClearance: boolean;
  encumbranceFree: boolean;
  constructionApproval: boolean;
  verificationSource?: string;
  portfolioVerified: boolean;
  lastVerifiedAt?: Date;
  notes?: string;
}

export interface IProject extends Document {
  _id: Types.ObjectId;
  developerId: Types.ObjectId;
  name: string;
  description: string;
  city: string;
  location: string;
  brochureUrl?: string;
  priceListUrl?: string;
  reraNumber?: string;
  approvalStatus: ApprovalStatus;
  listingTier: ListingTier;
  featuredUntil?: Date | null;
  isPrimeListing: boolean;
  commissionPercent: number;
  trustScore?: number;
  legalRiskLevel?: "LOW" | "MEDIUM" | "HIGH";
  floodRiskLevel?: "LOW" | "MEDIUM" | "HIGH";
  crimeIndexLevel?: "LOW" | "MEDIUM" | "HIGH";
  reraStatus?: "REGISTERED" | "PENDING" | "NOT_REGISTERED";
  reraValidityDate?: Date;
  isVerified: boolean;
  verifiedAt?: Date;
  verificationDetails?: IVerificationDetails;
  projectType?: ProjectType;
  presentationInfo?: IPresentationInfo;
  createdAt: Date;
}

const projectSchema = new Schema<IProject>({
  developerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  name: { type: String, required: true },
  description: { type: String, required: true },
  city: { type: String, required: true },
  location: { type: String, required: true },
  brochureUrl: { type: String },
  priceListUrl: { type: String },
  reraNumber: { type: String },
  approvalStatus: { type: String, enum: ["PENDING", "APPROVED", "REJECTED"], default: "PENDING" },
  listingTier: { type: String, enum: ["STANDARD", "FEATURED"], default: "STANDARD" },
  featuredUntil: { type: Date, default: null },
  isPrimeListing: { type: Boolean, default: false },
  commissionPercent: { type: Number, default: 3.0 },
  trustScore: { type: Number, min: 0, max: 100 },
  legalRiskLevel: { type: String, enum: ["LOW", "MEDIUM", "HIGH"] },
  floodRiskLevel: { type: String, enum: ["LOW", "MEDIUM", "HIGH"] },
  crimeIndexLevel: { type: String, enum: ["LOW", "MEDIUM", "HIGH"] },
  reraStatus: { type: String, enum: ["REGISTERED", "PENDING", "NOT_REGISTERED"] },
  reraValidityDate: { type: Date },
  isVerified: { type: Boolean, default: false },
  verifiedAt: { type: Date },
  verificationDetails: {
    reraVerified: { type: Boolean, default: false },
    titleClearance: { type: Boolean, default: false },
    encumbranceFree: { type: Boolean, default: false },
    constructionApproval: { type: Boolean, default: false },
    verificationSource: { type: String },
    portfolioVerified: { type: Boolean, default: false },
    lastVerifiedAt: { type: Date },
    notes: { type: String },
  },
  projectType: { type: String, enum: ["RESIDENTIAL", "COMMERCIAL", "INDUSTRIAL", "MIXED_USE", "PLOTTED"] },
  presentationInfo: {
    amenities: { type: [String], default: undefined },
    securityFeatures: { type: [String], default: undefined },
    smartHomeFeatures: { type: [String], default: undefined },
    fireSafetySystems: { type: [String], default: undefined },
    greenBuildingFeatures: { type: [String], default: undefined },
    connectivityNotes: { type: String },
    constructionProgressNote: { type: String },
  },
  createdAt: { type: Date, default: Date.now },
});

projectSchema.index({ approvalStatus: 1, listingTier: 1 });
projectSchema.index({ developerId: 1 });
projectSchema.index({ city: 1 });

export const Project = model<IProject>("Project", projectSchema);
