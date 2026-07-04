import { Schema, model, Document, Types } from "mongoose";

export type PostCategory = "ANNOUNCEMENT" | "DISCUSSION" | "TIP" | "MARKET_UPDATE";

export interface IPost extends Document {
  _id: Types.ObjectId;
  authorId: Types.ObjectId;
  authorName: string;
  authorRole: string;
  content: string;
  category: PostCategory;
  likes: number;
  likedBy: Types.ObjectId[];
  createdAt: Date;
}

const postSchema = new Schema<IPost>({
  authorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  authorName: { type: String, required: true },
  authorRole: { type: String, required: true },
  content: { type: String, required: true, maxlength: 1000 },
  category: {
    type: String,
    enum: ["ANNOUNCEMENT", "DISCUSSION", "TIP", "MARKET_UPDATE"],
    default: "DISCUSSION",
  },
  likes: { type: Number, default: 0 },
  likedBy: [{ type: Schema.Types.ObjectId, ref: "User" }],
  createdAt: { type: Date, default: Date.now },
});

postSchema.index({ createdAt: -1 });

export const Post = model<IPost>("Post", postSchema);
