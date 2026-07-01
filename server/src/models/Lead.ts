import { Schema, model, Document, Types } from "mongoose";

export type LeadStage =
  | "GENERATED" | "ASSIGNED" | "CONTACTED" | "SITE_VISIT"
  | "NEGOTIATION" | "BOOKING" | "REGISTRATION" | "LOST";

export interface ILead extends Document {
  _id: Types.ObjectId;
  projectId: Types.ObjectId;
  submittedById: Types.ObjectId;
  assignedToId?: Types.ObjectId | null;
  clientName: string;
  clientPhone: string;
  clientEmail?: string;
  stage: LeadStage;
  source: string;
  notes?: string;
  isDuplicate: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const leadSchema = new Schema<ILead>(
  {
    projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true },
    submittedById: { type: Schema.Types.ObjectId, ref: "User", required: true },
    assignedToId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    clientName: { type: String, required: true },
    clientPhone: { type: String, required: true },
    clientEmail: { type: String },
    stage: {
      type: String,
      enum: ["GENERATED", "ASSIGNED", "CONTACTED", "SITE_VISIT", "NEGOTIATION", "BOOKING", "REGISTRATION", "LOST"],
      default: "GENERATED",
    },
    source: { type: String, required: true },
    notes: { type: String },
    isDuplicate: { type: Boolean, default: false },
  },
  { timestamps: true }
);

leadSchema.index({ assignedToId: 1, stage: 1 });
leadSchema.index({ projectId: 1, clientPhone: 1, createdAt: -1 }); // duplicate detection

export const Lead = model<ILead>("Lead", leadSchema);
