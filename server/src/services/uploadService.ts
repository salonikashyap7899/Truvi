import multer from "multer";
import path from "path";
import fs from "fs";

/**
 * Single source of truth for where uploads live. Resolved from UPLOAD_DIR, or
 * `<cwd>/uploads` by default. Using cwd (the server package dir, since `npm
 * start` runs there) — rather than a __dirname-relative path — keeps the write
 * dir and the static-serve dir identical no matter how deeply nested the
 * calling module is. Every upload site (uploadService, enquiries, presentation,
 * aadhaar) and the static handler in app.ts share this one directory.
 */
export function uploadsRoot(): string {
  return process.env.UPLOAD_DIR ? path.resolve(process.env.UPLOAD_DIR) : path.resolve(process.cwd(), "uploads");
}

const UPLOAD_DIR = uploadsRoot();
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${path.extname(file.originalname)}`);
  },
});

const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      return cb(new Error("Unsupported file type. Allowed: PDF, JPG, PNG, WEBP."));
    }
    cb(null, true);
  },
});

/**
 * Storage abstraction: returns the public-facing URL for an uploaded file.
 * Swap this implementation to return an S3 URL later without touching
 * any calling code.
 */
export function fileUrl(filename: string): string {
  const base = process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || "http://localhost:5000";
  return `${base}/uploads/${filename}`;
}
