import crypto from "crypto";
import fs from "fs";
import path from "path";
import multer from "multer";
import { DEV_JWT_ACCESS_DEFAULT } from "../lib/jwt";
import { publicBaseUrl } from "./uploadService";

/**
 * Private storage for sensitive user documents (buyer ID / address / income
 * proofs). Unlike /uploads, this directory is NEVER served statically and is
 * never cached by a browser or CDN: a file is reachable only through a
 * short-lived, HMAC-signed link the API issues to the document's owner or an
 * admin. Signed links (rather than a Bearer-token download) keep the existing
 * `<a href={doc.fileUrl}>` UI working unchanged on the web and inside the
 * Android app, where authenticated blob downloads are unreliable.
 */
export const PRIVATE_UPLOAD_DIR = process.env.PRIVATE_UPLOAD_DIR
  ? path.resolve(process.env.PRIVATE_UPLOAD_DIR)
  : path.resolve(__dirname, "../../private_uploads");
if (!fs.existsSync(PRIVATE_UPLOAD_DIR)) fs.mkdirSync(PRIVATE_UPLOAD_DIR, { recursive: true, mode: 0o700 });

/** Marker stored in a document's file_url column for privately-stored files. */
const PRIVATE_PREFIX = "private:";

// Server-validated type → the extension the file is stored under. The stored
// extension comes from this map, never from the client's original filename, so
// a file can't be smuggled in as `.html` and later rendered as a web page.
const EXT_BY_MIME: Record<string, string> = {
  "application/pdf": ".pdf",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

export const privateUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, PRIVATE_UPLOAD_DIR),
    filename: (_req, file, cb) => cb(null, `${crypto.randomUUID()}${EXT_BY_MIME[file.mimetype] ?? ""}`),
  }),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB, same as the general uploader
  fileFilter: (_req, file, cb) => {
    if (!EXT_BY_MIME[file.mimetype]) {
      return cb(new Error("Unsupported file type. Allowed: PDF, JPG, PNG, WEBP."));
    }
    cb(null, true);
  },
});

/** The value stored in file_url for a privately-stored file. */
export function privateRef(filename: string): string {
  return `${PRIVATE_PREFIX}${filename}`;
}

export function isPrivateRef(stored: string | null | undefined): boolean {
  return !!stored && stored.startsWith(PRIVATE_PREFIX);
}

/**
 * Resolve a stored private ref to an absolute path inside PRIVATE_UPLOAD_DIR.
 * Returns null for anything that isn't a private ref or that would escape the
 * directory (path traversal), so callers can never be tricked into reading
 * an arbitrary file.
 */
export function privateFilePath(stored: string): string | null {
  if (!isPrivateRef(stored)) return null;
  const name = path.basename(stored.slice(PRIVATE_PREFIX.length));
  if (!name || name.startsWith(".")) return null;
  const full = path.join(PRIVATE_UPLOAD_DIR, name);
  return full.startsWith(PRIVATE_UPLOAD_DIR + path.sep) ? full : null;
}

// How long an issued link stays valid. Long enough to open a document from a
// list the user loaded a while ago; short enough that a leaked link (a log, a
// shared screenshot, browser history) is soon useless. Reloading the list
// issues fresh links.
const LINK_TTL_SECONDS = 60 * 60;

// Keyed off the JWT access secret, which the boot guard already requires to be
// a real, non-default value outside local development. Domain-separated by the
// "buyer-doc:" prefix so a link signature can never be confused with a token.
function sign(docId: string, exp: number): string {
  const key = process.env.JWT_ACCESS_SECRET || DEV_JWT_ACCESS_DEFAULT;
  return crypto.createHmac("sha256", key).update(`buyer-doc:${docId}:${exp}`).digest("hex");
}

/** A fresh, expiring link to one buyer document. */
export function signedBuyerDocUrl(docId: string): string {
  const exp = Math.floor(Date.now() / 1000) + LINK_TTL_SECONDS;
  return `${publicBaseUrl()}/api/documents/file/${docId}?exp=${exp}&sig=${sign(docId, exp)}`;
}

/** True only for an unexpired link whose signature matches this document. */
export function verifyBuyerDocSignature(docId: string, exp: string, sig: string): boolean {
  const expNum = Number(exp);
  if (!Number.isInteger(expNum) || expNum < Math.floor(Date.now() / 1000)) return false;
  if (!/^[0-9a-f]{64}$/.test(sig)) return false;
  return crypto.timingSafeEqual(Buffer.from(sign(docId, expNum), "hex"), Buffer.from(sig, "hex"));
}

/**
 * The URL a client should use to open a buyer document: privately-stored files
 * get a fresh signed link; legacy files uploaded before this change keep their
 * stored /uploads URL so existing documents continue to open.
 */
export function presentBuyerDocUrl(docId: string, stored: string): string {
  return isPrivateRef(stored) ? signedBuyerDocUrl(docId) : stored;
}
