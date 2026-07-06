import { Schema, model, Document, Types } from "mongoose";

export type EnquiryPurpose = "BUYER" | "DEVELOPER" | "CP" | "GUEST";

export interface IEnquiry extends Document {
  _id: Types.ObjectId;
  email: string;
  name: string;
  purposeType: EnquiryPurpose;
  message?: string;
  uploadUrl?: string;
  uploadFileName?: string;
  projectId?: Types.ObjectId;
  projectName?: string;
  createdAt: Date;
}

const enquirySchema = new Schema<IEnquiry>({
  email: { type: String, required: true, lowercase: true, trim: true },
  name: { type: String, required: true, trim: true },
  purposeType: { type: String, enum: ["BUYER", "DEVELOPER", "CP", "GUEST"], required: true },
  message: { type: String },
  uploadUrl: { type: String },
  uploadFileName: { type: String },
  projectId: { type: Schema.Types.ObjectId, ref: "Project" },
  projectName: { type: String },
  createdAt: { type: Date, default: Date.now },
});

enquirySchema.index({ createdAt: -1 });
enquirySchema.index({ purposeType: 1 });

export const Enquiry = model<IEnquiry>("Enquiry", enquirySchema);
