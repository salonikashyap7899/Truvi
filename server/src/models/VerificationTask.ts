import { Schema, model, Document, Types } from "mongoose";

/**
 * A field-verification task from the Truvi Ambassador SOP.
 *
 * Colour state machine (exactly as the SOP defines it):
 *   GREEN  — Available: any active ambassador can accept it.
 *   YELLOW — Locked (in-progress): one ambassador accepted it; locked
 *            exclusively to them for 6 hours. If they don't finish in
 *            time the sweep returns it to GREEN.
 *   RED    — Completed: checklist done + required documents uploaded;
 *            a ₹500 payout entry is owed to the completing ambassador.
 */

export type VerificationTaskStatus = "GREEN" | "YELLOW" | "RED";
export type PayoutStatus = "NONE" | "PENDING" | "PAID";

export const TASK_LOCK_HOURS = 6;
export const TASK_PAYOUT_INR = 500;

export interface IVerificationTask extends Document {
  _id: Types.ObjectId;
  projectId?: Types.ObjectId | null;
  title: string;
  address: string;
  mapUrl?: string;
  deadline?: Date | null;
  status: VerificationTaskStatus;
  lockedBy?: Types.ObjectId | null;
  lockedAt?: Date | null;
  lockExpiresAt?: Date | null;
  checklist: {
    gpsOn: boolean;
    internetOn: boolean;
    liveLocation?: { lat: number; lng: number; capturedAt: Date } | null;
  };
  documents: { url: string; fileName: string; uploadedAt: Date }[];
  payoutAmount: number;
  payoutStatus: PayoutStatus;
  completedBy?: Types.ObjectId | null;
  completedAt?: Date | null;
  createdAt: Date;
}

const verificationTaskSchema = new Schema<IVerificationTask>({
  projectId: { type: Schema.Types.ObjectId, ref: "Project", default: null },
  title: { type: String, required: true, trim: true },
  address: { type: String, required: true, trim: true },
  mapUrl: { type: String },
  deadline: { type: Date, default: null },
  status: { type: String, enum: ["GREEN", "YELLOW", "RED"], default: "GREEN" },
  lockedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  lockedAt: { type: Date, default: null },
  lockExpiresAt: { type: Date, default: null },
  checklist: {
    gpsOn: { type: Boolean, default: false },
    internetOn: { type: Boolean, default: false },
    liveLocation: {
      type: { lat: Number, lng: Number, capturedAt: Date },
      default: null,
    },
  },
  documents: {
    type: [{ url: String, fileName: String, uploadedAt: { type: Date, default: Date.now } }],
    default: [],
  },
  payoutAmount: { type: Number, default: TASK_PAYOUT_INR },
  payoutStatus: { type: String, enum: ["NONE", "PENDING", "PAID"], default: "NONE" },
  completedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  completedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
});

verificationTaskSchema.index({ status: 1, lockExpiresAt: 1 });
verificationTaskSchema.index({ completedBy: 1 });

export const VerificationTask = model<IVerificationTask>("VerificationTask", verificationTaskSchema);
