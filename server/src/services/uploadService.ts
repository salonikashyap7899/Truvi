import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";

const UPLOAD_DIR = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.resolve(__dirname, "../../uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

/** Stored extension for each MIME type the uploaders accept. */
const EXT_BY_MIME: Record<string, string> = {
  "application/pdf": ".pdf",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "audio/mpeg": ".mp3",
  "audio/mp4": ".m4a",
  "audio/x-m4a": ".m4a",
  "audio/aac": ".aac",
  "audio/wav": ".wav",
  "audio/x-wav": ".wav",
  "audio/webm": ".weba",
  "audio/ogg": ".ogg",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "video/ogg": ".ogv",
  "video/quicktime": ".mov",
};

/**
 * Extension to store an upload under. Derived from the (already allowlisted)
 * MIME type, never from the client's file name — so "brochure.html" sent as
 * application/pdf is stored and served as a .pdf, not as a web page.
 */
export function extensionForMime(mimetype: string): string {
  return EXT_BY_MIME[mimetype] ?? ".bin";
}

/** Random, unguessable stored file name (the old ms-timestamp names were guessable). */
export function randomFileStem(): string {
  return `${Date.now()}-${crypto.randomBytes(8).toString("hex")}`;
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    cb(null, `${randomFileStem()}${extensionForMime(file.mimetype)}`);
  },
});

/** First bytes of each file type we accept from anonymous visitors. */
const MAGIC: Record<string, (b: Buffer) => boolean> = {
  ".pdf": (b) => b.subarray(0, 5).toString("latin1") === "%PDF-",
  ".jpg": (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  ".png": (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  ".webp": (b) => b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP",
  ".docx": (b) => b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04,
  ".doc": (b) => b.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])),
};
MAGIC[".jpeg"] = MAGIC[".jpg"];

/** True when the file on disk really starts like a file of type `ext`. */
export function fileMatchesExtension(filePath: string, ext: string): boolean {
  const check = MAGIC[ext.toLowerCase()];
  if (!check) return false;
  const fd = fs.openSync(filePath, "r");
  try {
    const head = Buffer.alloc(16);
    const n = fs.readSync(fd, head, 0, 16, 0);
    return check(head.subarray(0, n));
  } finally {
    fs.closeSync(fd);
  }
}

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

const ALLOWED_MEDIA_MIME = new Set([
  "application/pdf",
  // Voice notes (Hindi audio lessons)
  "audio/mpeg",
  "audio/mp4",
  "audio/x-m4a",
  "audio/aac",
  "audio/wav",
  "audio/x-wav",
  "audio/webm",
  "audio/ogg",
  // Legacy video rows still play; keep accepting so old links can be re-hosted.
  "video/mp4",
  "video/webm",
  "video/ogg",
  "video/quicktime",
]);

/**
 * Larger uploader used for Learning Academy content (voice notes + PDFs).
 * Kept separate from the general 10MB `upload` so raising the media size limit
 * here never loosens limits on brochures/invoices elsewhere.
 */
export const uploadMedia = multer({
  storage,
  limits: { fileSize: 200 * 1024 * 1024 }, // 200MB
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MEDIA_MIME.has(file.mimetype)) {
      return cb(new Error("Unsupported file type. Allowed: PDF or audio (MP3, M4A, AAC, WAV, OGG, WEBM)."));
    }
    cb(null, true);
  },
});

/** Absolute base URL of this API server, as seen by browsers and the app. */
export function publicBaseUrl(): string {
  return process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || "http://localhost:5000";
}

/**
 * Storage abstraction: returns the public-facing URL for an uploaded file.
 * Swap this implementation to return an S3 URL later without touching
 * any calling code.
 */
export function fileUrl(filename: string): string {
  return `${publicBaseUrl()}/uploads/${filename}`;
}
