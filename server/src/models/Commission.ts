import { Schema, model, Document, Types } from "mongoose";

export type CommissionStatus = "PENDING" | "MILESTONE_DUE" | "INVOICED" | "PAID";

export interface ICommissionMilestone {
  _id: Types.ObjectId;
  label: string;
  percentOfTotal: number;
  amount: number;
  isReleased: boolean;
  releasedAt?: Date | null;
}

export interface ICommission extends Document {
  _id: Types.ObjectId;
  leadId: Types.ObjectId;
  cpId: Types.ObjectId;
  bookingValue: number;
  commissionPercent: number;
  cpCommissionAmount: number;
  platformFeeAmount: number;
  tdsAmount: number;
  status: CommissionStatus;
  milestones: Types.DocumentArray<ICommissionMilestone & Document>;
  invoiceUrl?: string;
  createdAt: Date;
}

const milestoneSchema = new Schema<ICommissionMilestone>({
  label: { type: String, required: true },
  percentOfTotal: { type: Number, required: true },
  amount: { type: Number, required: true },
  isReleased: { type: Boolean, default: false },
  releasedAt: { type: Date, default: null },
});

const commissionSchema = new Schema<ICommission>({
  leadId: { type: Schema.Types.ObjectId, ref: "Lead", required: true, unique: true },
  cpId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  bookingValue: { type: Number, required: true },
  commissionPercent: { type: Number, required: true },
  cpCommissionAmount: { type: Number, required: true },
  platformFeeAmount: { type: Number, required: true },
  tdsAmount: { type: Number, required: true },
  status: { type: String, enum: ["PENDING", "MILESTONE_DUE", "INVOICED", "PAID"], default: "PENDING" },
  milestones: { type: [milestoneSchema], default: [] },
  invoiceUrl: { type: String },
  createdAt: { type: Date, default: Date.now },
});

commissionSchema.index({ cpId: 1 });

export const Commission = model<ICommission>("Commission", commissionSchema);
