import { Schema, model, Document, Types } from "mongoose";

// FOUNDER is the platform superuser (above ADMIN — sole access to Founder OS).
// AMBASSADOR is the field-verification workforce (Truvi Ambassador SOP).
export type Role = "FOUNDER" | "ADMIN" | "DEVELOPER" | "CP" | "BUYER" | "AMBASSADOR";
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

  // Ambassador-specific (Truvi Ambassador SOP): the profile goes Active —
  // and task listings become visible — only after Aadhaar upload plus
  // phone and email OTP verification all complete.
  ambassadorProfile?: {
    aadhaarUrl?: string;
    aadhaarFileName?: string;
    phoneVerified: boolean;
    emailVerified: boolean;
    phoneOtp?: string | null;
    phoneOtpExpiresAt?: Date | null;
    emailOtp?: string | null;
    emailOtpExpiresAt?: Date | null;
    activatedAt?: Date | null;
    tasksCompleted: number;
    totalEarnings: number;
  };
}

const userSchema = new Schema<IUser>({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  role: { type: String, enum: ["FOUNDER", "ADMIN", "DEVELOPER", "CP", "BUYER", "AMBASSADOR"], required: true },
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

  ambassadorProfile: {
    aadhaarUrl: { type: String },
    aadhaarFileName: { type: String },
    phoneVerified: { type: Boolean, default: false },
    emailVerified: { type: Boolean, default: false },
    phoneOtp: { type: String, default: null },
    phoneOtpExpiresAt: { type: Date, default: null },
    emailOtp: { type: String, default: null },
    emailOtpExpiresAt: { type: Date, default: null },
    activatedAt: { type: Date, default: null },
    tasksCompleted: { type: Number, default: 0 },
    totalEarnings: { type: Number, default: 0 },
  },
});

userSchema.index({ role: 1, approvalStatus: 1 });

export const User = model<IUser>("User", userSchema);
