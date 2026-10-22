import crypto from "crypto";
import path from "path";
import type { NextFunction, Request, Response } from "express";
import { and, inArray, like } from "drizzle-orm";
import { getDb } from "../config/db";
import { LEGAL_ASSET_CATEGORIES, legalDocuments, projectAssets } from "../db/schema";
import { DEV_JWT_ACCESS_DEFAULT } from "../lib/jwt";

const SIGNED_LINK_TTL_SECONDS = 60 * 60;
const LEGAL_DOCUMENT_NAME = /^legal-\d+-[0-9a-f]{16}\.(?:pdf|jpe?g|png|webp)$/i;
const PRESENTATION_ASSET_NAME = /^asset-\d+-\d+\.[a-z0-9]+$/i;

type ProtectedFileKind = "legal-document" | "project-asset";

function signingKey(): string {
  return process.env.JWT_ACCESS_SECRET || DEV_JWT_ACCESS_DEFAULT;
}

function sign(kind: ProtectedFileKind, id: string, filename: string, expiresAt: number): string {
  return crypto
    .createHmac("sha256", signingKey())
    .update("truvi-protected-file:" + kind + ":" + id + ":" + filename + ":" + expiresAt, "utf8")
    .digest("hex");
}

export function verifyProtectedLegalFileSignature(
  kind: ProtectedFileKind,
  id: string,
  filename: string,
  expiresAtRaw: unknown,
  suppliedSignature: unknown,
): boolean {
  if (typeof expiresAtRaw !== "string" || !/^\d{10,}$/.test(expiresAtRaw)) return false;
  if (typeof suppliedSignature !== "string" || !/^[0-9a-f]{64}$/i.test(suppliedSignature)) return false;
  const expiresAt = Number(expiresAtRaw);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) return false;
  const expected = Buffer.from(sign(kind, id, filename, expiresAt), "hex");
  const received = Buffer.from(suppliedSignature, "hex");
  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
}

/** Return the existing URL for public/verified files and a short-lived signed URL for pending legal files. */
function presentProtectedFileUrl(
  kind: ProtectedFileKind,
  id: string,
  fileUrl: string,
  verified: boolean,
): string {
  if (verified) return fileUrl;
  try {
    const url = new URL(fileUrl);
    const filename = path.basename(url.pathname);
    if (!filename || filename === "." || filename === "..") return "";
    const expiresAt = Math.floor(Date.now() / 1000) + SIGNED_LINK_TTL_SECONDS;
    url.searchParams.set("exp", String(expiresAt));
    url.searchParams.set("sig", sign(kind, id, filename, expiresAt));
    return url.toString();
  } catch {
    return "";
  }
}

export function presentLegalDocumentUrl(doc: {
  _id: string;
  fileUrl: string;
  verified: boolean;
}): string {
  return presentProtectedFileUrl("legal-document", String(doc._id), doc.fileUrl, doc.verified);
}

export function presentLegalAssetUrl(asset: {
  _id: string;
  fileUrl: string;
  category: string;
  verified: boolean;
}): string {
  if (!LEGAL_ASSET_CATEGORIES.includes(asset.category as (typeof LEGAL_ASSET_CATEGORIES)[number])) return asset.fileUrl;
  return presentProtectedFileUrl("project-asset", String(asset._id), asset.fileUrl, asset.verified);
}

/**
 * Protect pending legal uploads stored under the public /uploads directory.
 * Verified documents remain public as the UI/API already promises. Unverified
 * documents are served only when the caller has a fresh signed link issued by
 * an authenticated owner/admin/reviewer API response. No file is moved/deleted.
 *
 * Mount this before express.static("/uploads"). Non-legal assets fall through
 * unchanged, preserving all existing public brochures/images/media behavior.
 */
export async function protectUnverifiedLegalFiles(req: Request, res: Response, next: NextFunction) {
  const relativePath = req.path;
  const filename = path.basename(relativePath);
  if (!filename || filename === "." || filename === "..") return next();

  const isLegalDocumentPath = relativePath.startsWith("/legal/");
  const isPresentationAsset = relativePath.startsWith("/asset-") && PRESENTATION_ASSET_NAME.test(filename);
  if (!isLegalDocumentPath && !isPresentationAsset) return next();

  if (isLegalDocumentPath) {
    if (relativePath !== "/legal/" + filename || !LEGAL_DOCUMENT_NAME.test(filename)) {
      return res.status(404).end();
    }
    try {
      const [doc] = await getDb().select({
        id: legalDocuments._id,
        fileUrl: legalDocuments.fileUrl,
        verified: legalDocuments.verified,
      }).from(legalDocuments).where(like(legalDocuments.fileUrl, "%/uploads/legal/" + filename)).limit(1);
      if (!doc) return res.status(404).end();
      if (doc.verified) return next();
      if (!verifyProtectedLegalFileSignature("legal-document", String(doc.id), filename, req.query.exp, req.query.sig)) {
        return res.status(403).json({ error: "This legal document is pending verification or its private link has expired." });
      }
      res.locals.truviProtectedLegalFile = true;
      return next();
    } catch {
      // Database errors must not fall through to the public static file server.
      return res.status(503).json({ error: "Legal document access is temporarily unavailable." });
    }
  }

  // A project presentation can also contain pending RERA/title/NOC assets in
  // the general uploads folder. Only those legal categories require signatures.
  try {
    const matchingAssets = await getDb().select({
      id: projectAssets._id,
      fileUrl: projectAssets.fileUrl,
      category: projectAssets.category,
      verified: projectAssets.verified,
    }).from(projectAssets).where(and(
      like(projectAssets.fileUrl, "%/uploads/" + filename),
      inArray(projectAssets.category, [...LEGAL_ASSET_CATEGORIES]),
    )).limit(5);

    const pending = matchingAssets.find((asset) => !asset.verified);
    if (!pending) return next();
    if (!verifyProtectedLegalFileSignature("project-asset", String(pending.id), filename, req.query.exp, req.query.sig)) {
      return res.status(403).json({ error: "This legal asset is pending verification or its private link has expired." });
    }
    res.locals.truviProtectedLegalFile = true;
    return next();
  } catch {
    // Don't serve potentially-private legal files if the access check failed.
    return res.status(503).json({ error: "Legal asset access is temporarily unavailable." });
  }
}
