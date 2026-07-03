import { Schema, model, Document, Types } from "mongoose";

export type BuyerDocType = "ID_PROOF" | "ADDRESS_PROOF" | "INCOME_PROOF";
export type BuyerDocStatus = "UPLOADED" | "UNDER_REVIEW" | "VERIFIED";

export interface IBuyerDocument extends Document {
  _id: Types.ObjectId;
  buyerId: Types.ObjectId;
  docType: BuyerDocType;
  fileName: string;
  fileUrl: string;
  status: BuyerDocStatus;
  createdAt: Date;
}

const buyerDocumentSchema = new Schema<IBuyerDocument>({
  buyerId:  { type: Schema.Types.ObjectId, ref: "User", required: true },
  docType:  {
    type: String,
    enum: ["ID_PROOF", "ADDRESS_PROOF", "INCOME_PROOF"],
    required: true,
  },
  fileName: { type: String, required: true },
  fileUrl:  { type: String, required: true },
  status:   {
    type: String,
    enum: ["UPLOADED", "UNDER_REVIEW", "VERIFIED"],
    default: "UPLOADED",
  },
  createdAt: { type: Date, default: Date.now },
});

buyerDocumentSchema.index({ buyerId: 1, docType: 1 });

export const BuyerDocument = model<IBuyerDocument>("BuyerDocument", buyerDocumentSchema);
