import { Schema, model, Document, Types } from "mongoose";

export type SharedDocFileType =
  | "BROCHURE"
  | "FLOOR_PLAN"
  | "PRICE_LIST"
  | "LEGAL"
  | "OTHER";

export interface ISharedDocument extends Document {
  _id: Types.ObjectId;
  projectId: Types.ObjectId;
  uploadedById: Types.ObjectId;
  fileName: string;
  fileUrl: string;
  fileType: SharedDocFileType;
  description?: string;
  createdAt: Date;
}

const sharedDocumentSchema = new Schema<ISharedDocument>({
  projectId:    { type: Schema.Types.ObjectId, ref: "Project", required: true },
  uploadedById: { type: Schema.Types.ObjectId, ref: "User",    required: true },
  fileName:     { type: String, required: true },
  fileUrl:      { type: String, required: true },
  fileType:     {
    type: String,
    enum: ["BROCHURE", "FLOOR_PLAN", "PRICE_LIST", "LEGAL", "OTHER"],
    default: "OTHER",
  },
  description: { type: String },
  createdAt:   { type: Date, default: Date.now },
});

sharedDocumentSchema.index({ projectId: 1, createdAt: -1 });

export const SharedDocument = model<ISharedDocument>("SharedDocument", sharedDocumentSchema);
