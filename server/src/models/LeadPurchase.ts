import { Schema, model, Document, Types } from "mongoose";

export interface ILeadPurchase extends Document {
  _id: Types.ObjectId;
  cpId: Types.ObjectId;
  leadType: "BASIC" | "QUALIFIED" | "SITE_VISIT";
  amountPaid: number;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  paymentStatus: "SIMULATED" | "CREATED" | "PAID" | "FAILED";
  createdAt: Date;
}

const leadPurchaseSchema = new Schema<ILeadPurchase>({
  cpId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  leadType: { type: String, enum: ["BASIC", "QUALIFIED", "SITE_VISIT"], required: true },
  amountPaid: { type: Number, required: true },
  razorpayOrderId: { type: String },
  razorpayPaymentId: { type: String },
  paymentStatus: { type: String, enum: ["SIMULATED", "CREATED", "PAID", "FAILED"], default: "SIMULATED" },
  createdAt: { type: Date, default: Date.now },
});

export const LeadPurchase = model<ILeadPurchase>("LeadPurchase", leadPurchaseSchema);
