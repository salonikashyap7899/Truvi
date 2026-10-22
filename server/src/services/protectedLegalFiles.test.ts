import { describe, expect, it } from "vitest";
import {
  presentLegalAssetUrl,
  presentLegalDocumentUrl,
  verifyProtectedLegalFileSignature,
} from "./protectedLegalFiles";

describe("protected legal-file links", () => {
  it("returns a short-lived signed URL for an unverified legal document without changing its stored path", () => {
    const storedUrl = "https://truviventures.com/uploads/legal/legal-1729000000000-0123456789abcdef.pdf";
    const doc = { _id: "doc-1", fileUrl: storedUrl, verified: false };
    const presented = new URL(presentLegalDocumentUrl(doc));

    expect(doc.fileUrl).toBe(storedUrl);
    expect(presented.pathname).toBe("/uploads/legal/legal-1729000000000-0123456789abcdef.pdf");
    expect(presented.searchParams.get("exp")).toMatch(/^\d{10,}$/);
    expect(verifyProtectedLegalFileSignature(
      "legal-document",
      doc._id,
      "legal-1729000000000-0123456789abcdef.pdf",
      presented.searchParams.get("exp"),
      presented.searchParams.get("sig"),
    )).toBe(true);
  });

  it("returns original public URLs for verified documents and non-legal project assets", () => {
    const verifiedUrl = "https://truviventures.com/uploads/legal/legal-1729000000000-0123456789abcdef.pdf";
    expect(presentLegalDocumentUrl({ _id: "doc-1", fileUrl: verifiedUrl, verified: true })).toBe(verifiedUrl);
    const publicAssetUrl = "https://truviventures.com/uploads/asset-1729000000000-123456789.png";
    expect(presentLegalAssetUrl({
      _id: "asset-1",
      fileUrl: publicAssetUrl,
      category: "GALLERY_IMAGE",
      verified: false,
    })).toBe(publicAssetUrl);
  });

  it("signs unverified legal presentation assets and rejects a signature for another file", () => {
    const storedUrl = "https://truviventures.com/uploads/asset-1729000000000-123456789.pdf";
    const presented = new URL(presentLegalAssetUrl({
      _id: "asset-1",
      fileUrl: storedUrl,
      category: "TITLE",
      verified: false,
    }));
    const exp = presented.searchParams.get("exp");
    const sig = presented.searchParams.get("sig");
    expect(verifyProtectedLegalFileSignature(
      "project-asset",
      "asset-1",
      "asset-1729000000000-123456789.pdf",
      exp,
      sig,
    )).toBe(true);
    expect(verifyProtectedLegalFileSignature(
      "project-asset",
      "asset-1",
      "asset-1729000000000-otherfile.pdf",
      exp,
      sig,
    )).toBe(false);
  });

  it("rejects expired, malformed and modified signatures", () => {
    expect(verifyProtectedLegalFileSignature("legal-document", "doc-1", "doc.pdf", "1", "a".repeat(64))).toBe(false);
    expect(verifyProtectedLegalFileSignature("legal-document", "doc-1", "doc.pdf", "not-a-time", "a".repeat(64))).toBe(false);
    expect(verifyProtectedLegalFileSignature("legal-document", "doc-1", "doc.pdf", String(Math.floor(Date.now() / 1000) + 3600), "not-a-signature")).toBe(false);
  });
});
