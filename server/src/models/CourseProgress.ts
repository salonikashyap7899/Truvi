import { Schema, model, Document, Types } from "mongoose";

export interface ICourseProgress extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  courseId: string;
  completedModules: string[];
  completedAt?: Date;
  createdAt: Date;
}

const courseProgressSchema = new Schema<ICourseProgress>({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  courseId: { type: String, required: true },
  completedModules: [{ type: String }],
  completedAt: { type: Date },
  createdAt: { type: Date, default: Date.now },
});

courseProgressSchema.index({ userId: 1, courseId: 1 }, { unique: true });

export const CourseProgress = model<ICourseProgress>("CourseProgress", courseProgressSchema);
