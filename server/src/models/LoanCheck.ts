import { Schema, model, Document, Types } from "mongoose";

export interface ILoanCheck extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  income: number;
  obligations: number;
  tenure: number;
  interestRate: number;
  eligibleAmount: number;
  estimatedEmi: number;
  createdAt: Date;
  updatedAt: Date;
}

const loanCheckSchema = new Schema<ILoanCheck>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    income: { type: Number, required: true, min: 0 },
    obligations: { type: Number, required: true, min: 0 },
    tenure: { type: Number, required: true, min: 1, max: 30 },
    interestRate: { type: Number, required: true, min: 0.1, max: 30 },
    eligibleAmount: { type: Number, required: true, min: 0 },
    estimatedEmi: { type: Number, required: true, min: 0 },
  },
  { timestamps: true }
);

export const LoanCheck = model<ILoanCheck>("LoanCheck", loanCheckSchema);
