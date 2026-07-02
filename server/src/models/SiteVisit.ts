import { Schema, model, Document, Types } from "mongoose";

export type SiteVisitStatus = "SCHEDULED" | "COMPLETED" | "CANCELLED" | "NO_SHOW";

export interface ISiteVisit extends Document {
  _id: Types.ObjectId;
  leadId?: Types.ObjectId;
  projectId: Types.ObjectId;
  cpId?: Types.ObjectId | null;
  buyerId?: Types.ObjectId | null;
  scheduledAt: Date;
  status: SiteVisitStatus;
  geoVerifiedLat?: number;
  geoVerifiedLng?: number;
  attendanceConfirmed: boolean;
  reportNotes?: string;
  nextSteps?: string;
}

const siteVisitSchema = new Schema<ISiteVisit>({
  leadId: { type: Schema.Types.ObjectId, ref: "Lead" },
  projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true },
  cpId: { type: Schema.Types.ObjectId, ref: "User", default: null },
  buyerId: { type: Schema.Types.ObjectId, ref: "User", default: null },
  scheduledAt: { type: Date, required: true },
  status: { type: String, enum: ["SCHEDULED", "COMPLETED", "CANCELLED", "NO_SHOW"], default: "SCHEDULED" },
  geoVerifiedLat: { type: Number },
  geoVerifiedLng: { type: Number },
  attendanceConfirmed: { type: Boolean, default: false },
  reportNotes: { type: String },
  nextSteps: { type: String },
});

siteVisitSchema.index({ cpId: 1, status: 1 });
siteVisitSchema.index({ buyerId: 1, status: 1 });
siteVisitSchema.index({ projectId: 1 });

export const SiteVisit = model<ISiteVisit>("SiteVisit", siteVisitSchema);
