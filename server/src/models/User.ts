import { Schema, model, Document, Types } from "mongoose";

export type Role = "ADMIN" | "DEVELOPER" | "CP" | "BUYER";
export type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED";
export type CPTier = "SILVER" | "GOLD" | "PLATINUM" | "DIAMOND";

export interface IUser extends Document {
  _id: Types.ObjectId;
  name: string;
  email: string;
  password: string;
  role: Role;
  approvalStatus: ApprovalStatus;
  phone?: string;
  createdAt: Date;

  // CP-specific (embedded, mirrors Prisma's CPProfile 1:1 relation)
  cpTier?: CPTier;
  cpProfile?: {
    isPremium: boolean;
    premiumExpiresAt?: Date | null;
    conversionRatio: number;
    totalBookings: number;
  };

  // Developer-specific (embedded, mirrors Prisma's DeveloperProfile 1:1 relation)
  developerProfile?: {
    companyName: string;
    reraNumber?: string;
  };

  // Buyer-specific values and saved project state.
  buyerProfile?: {
    savedProjectIds: Types.ObjectId[];
    compareProjectIds: Types.ObjectId[];
    loanEligibilityNotes?: string;
    investmentGoals?: string;
  };
}

const userSchema = new Schema<IUser>({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  role: { type: String, enum: ["ADMIN", "DEVELOPER", "CP", "BUYER"], required: true },
  approvalStatus: { type: String, enum: ["PENDING", "APPROVED", "REJECTED"], default: "PENDING" },
  phone: { type: String },
  createdAt: { type: Date, default: Date.now },

  cpTier: { type: String, enum: ["SILVER", "GOLD", "PLATINUM", "DIAMOND"], default: "SILVER" },
  cpProfile: {
    isPremium: { type: Boolean, default: false },
    premiumExpiresAt: { type: Date, default: null },
    conversionRatio: { type: Number, default: 0 },
    totalBookings: { type: Number, default: 0 },
  },

  developerProfile: {
    companyName: { type: String },
    reraNumber: { type: String },
  },
  buyerProfile: {
    savedProjectIds: { type: [{ type: Schema.Types.ObjectId, ref: "Project" }], default: [] },
    compareProjectIds: { type: [{ type: Schema.Types.ObjectId, ref: "Project" }], default: [] },
    loanEligibilityNotes: { type: String },
    investmentGoals: { type: String },
  },
});

userSchema.index({ role: 1, approvalStatus: 1 });

export const User = model<IUser>("User", userSchema);
