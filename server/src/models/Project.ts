import { Schema, model, Document, Types } from "mongoose";

export type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED";
export type ListingTier = "STANDARD" | "FEATURED";

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
  commissionPercent: number;
  trustScore?: number;
  legalRiskLevel?: "LOW" | "MEDIUM" | "HIGH";
  floodRiskLevel?: "LOW" | "MEDIUM" | "HIGH";
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
  commissionPercent: { type: Number, default: 3.0 },
  trustScore: { type: Number, min: 0, max: 100 },
  legalRiskLevel: { type: String, enum: ["LOW", "MEDIUM", "HIGH"] },
  floodRiskLevel: { type: String, enum: ["LOW", "MEDIUM", "HIGH"] },
  createdAt: { type: Date, default: Date.now },
});

projectSchema.index({ approvalStatus: 1, listingTier: 1 });
projectSchema.index({ developerId: 1 });
projectSchema.index({ city: 1 });

export const Project = model<IProject>("Project", projectSchema);
