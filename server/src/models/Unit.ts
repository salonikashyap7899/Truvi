import { Schema, model, Document, Types } from "mongoose";

export type UnitStatus = "AVAILABLE" | "LOCKED" | "RESERVED" | "SOLD";

export interface IPriceHistoryEntry {
  price: number;
  changedAt: Date;
}

export interface IUnit extends Document {
  _id: Types.ObjectId;
  projectId: Types.ObjectId;
  unitNumber: string;
  type: string;
  areaSqft: number;
  price: number;
  status: UnitStatus;
  lockedByCPId?: Types.ObjectId | null;
  lockExpiresAt?: Date | null;
  priceHistory: IPriceHistoryEntry[];
}

const priceHistorySchema = new Schema<IPriceHistoryEntry>(
  { price: { type: Number, required: true }, changedAt: { type: Date, default: Date.now } },
  { _id: false }
);

const unitSchema = new Schema<IUnit>({
  projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true },
  unitNumber: { type: String, required: true },
  type: { type: String, required: true },
  areaSqft: { type: Number, required: true },
  price: { type: Number, required: true },
  status: { type: String, enum: ["AVAILABLE", "LOCKED", "RESERVED", "SOLD"], default: "AVAILABLE" },
  lockedByCPId: { type: Schema.Types.ObjectId, ref: "User", default: null },
  lockExpiresAt: { type: Date, default: null },
  priceHistory: { type: [priceHistorySchema], default: [] },
});

unitSchema.index({ projectId: 1, status: 1 });
unitSchema.index({ status: 1, lockExpiresAt: 1 }); // for the stale-lock sweep

export const Unit = model<IUnit>("Unit", unitSchema);
