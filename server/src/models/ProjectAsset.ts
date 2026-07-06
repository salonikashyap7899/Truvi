import { Schema, model, Document, Types } from "mongoose";

/**
 * A single uploaded presentation/technical asset for a project — a drawing,
 * plan, render, video, report, certificate, etc. Kept in its own collection
 * (like Unit) because a project can accumulate a large, independently
 * queried set of files.
 */

export const ASSET_CATEGORIES = [
  // Plans & drawings
  "SKETCH_LAYOUT",
  "MASTER_PLAN",
  "SITE_PLAN",
  "FLOOR_PLAN",
  "ELEVATION",
  "PARKING_LAYOUT",
  "ELECTRICAL_PLUMBING",
  "LOCATION_MAP",
  // Design & 3D
  "STRUCTURAL_DESIGN",
  "CONSTRUCTION_SPEC",
  "ARCHITECTURE_PRESENTATION",
  "RENDER_3D",
  "VIEW_360",
  // Gallery
  "GALLERY_IMAGE",
  "GALLERY_VIDEO",
  // Documents
  "BROCHURE",
  "TECHNICAL_DOC",
  "APPROVAL_DOC",
  "APPROVAL_CERT",
  "MATERIAL_SPEC",
  "CAD_FILE",
  "STRUCTURAL_REPORT",
  "ENGINEERING_REPORT",
  // Progress
  "PROGRESS_UPDATE",
] as const;

export type AssetCategory = (typeof ASSET_CATEGORIES)[number];

export interface IProjectAsset extends Document {
  _id: Types.ObjectId;
  projectId: Types.ObjectId;
  category: AssetCategory;
  title: string;
  description?: string;
  fileUrl: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedBy: Types.ObjectId;
  createdAt: Date;
}

const projectAssetSchema = new Schema<IProjectAsset>({
  projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true },
  category: { type: String, enum: ASSET_CATEGORIES, required: true },
  title: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  fileUrl: { type: String, required: true },
  fileName: { type: String, required: true },
  mimeType: { type: String, required: true },
  sizeBytes: { type: Number, required: true },
  uploadedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  createdAt: { type: Date, default: Date.now },
});

projectAssetSchema.index({ projectId: 1, category: 1, createdAt: -1 });

export const ProjectAsset = model<IProjectAsset>("ProjectAsset", projectAssetSchema);
