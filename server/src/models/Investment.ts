import { Schema, model, Document, Types } from "mongoose";

export interface IInvestment extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  propertyName: string;
  purchasePrice: number;
  purchaseDate: Date;
  currentValue: number;
  rentalIncome?: number;
  createdAt: Date;
  updatedAt: Date;
}

const investmentSchema = new Schema<IInvestment>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    propertyName: { type: String, required: true, trim: true },
    purchasePrice: { type: Number, required: true, min: 0 },
    purchaseDate: { type: Date, required: true },
    currentValue: { type: Number, required: true, min: 0 },
    rentalIncome: { type: Number, min: 0, default: 0 },
  },
  { timestamps: true }
);

export const Investment = model<IInvestment>("Investment", investmentSchema);
