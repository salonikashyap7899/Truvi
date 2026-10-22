 security/protect-unverified-legal-documents
import { describe, expect, it } from "vitest";
import {
  presentLegalAssetUrl,
  presentLegalDocumentUrl,
import { describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";

const { getDbMock } = vi.hoisted(() => ({ getDbMock: vi.fn() }));
vi.mock("../config/db", () => ({ getDb: getDbMock }));
import {
  presentLegalAssetUrl,
  presentLegalDocumentUrl,
  protectUnverifiedLegalFiles,
 main
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
      category: "APPROVAL_DOC",
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
 security/protect-unverified-legal-documents



describe("protectUnverifiedLegalFiles middleware", () => {
  function mockDbRow(row: Record<string, unknown> | null) {
    const limit = vi.fn().mockResolvedValue(row ? [row] : []);
    const where = vi.fn(() => ({ limit }));
    const from = vi.fn(() => ({ where }));
    const select = vi.fn(() => ({ from }));
    getDbMock.mockReturnValue({ select });
  }

  function mockResponse() {
    const response = {
      locals: {} as Record<string, unknown>,
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      end: vi.fn().mockReturnThis(),
    };
    return response as unknown as Response;
  }

  it("blocks direct access to an unverified legal document without a signed URL", async () => {
    const filename = "legal-1729000000000-0123456789abcdef.pdf";
    mockDbRow({ id: "doc-1", fileUrl: "https://truviventures.com/uploads/legal/" + filename, verified: false });
    const req = { path: "/legal/" + filename, query: {} } as Request;
    const res = mockResponse();
    const next = vi.fn() as unknown as NextFunction;

    await protectUnverifiedLegalFiles(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("allows a valid temporary signature and marks the response as non-cacheable", async () => {
    const filename = "legal-1729000000000-0123456789abcdef.pdf";
    const doc = { _id: "doc-2", fileUrl: "https://truviventures.com/uploads/legal/" + filename, verified: false };
    const signed = new URL(presentLegalDocumentUrl(doc));
    mockDbRow({ id: doc._id, fileUrl: doc.fileUrl, verified: false });
    const req = {
      path: "/legal/" + filename,
      query: { exp: signed.searchParams.get("exp"), sig: signed.searchParams.get("sig") },
    } as unknown as Request;
    const res = mockResponse();
    const next = vi.fn() as unknown as NextFunction;

    await protectUnverifiedLegalFiles(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.locals.truviProtectedLegalFile).toBe(true);
  });

  it("allows verified legal documents through the same path without a signature", async () => {
    const filename = "legal-1729000000000-0123456789abcdef.pdf";
    mockDbRow({ id: "doc-3", fileUrl: "https://truviventures.com/uploads/legal/" + filename, verified: true });
    const req = { path: "/legal/" + filename, query: {} } as Request;
    const res = mockResponse();
    const next = vi.fn() as unknown as NextFunction;

    await protectUnverifiedLegalFiles(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.locals.truviVerifiedLegalFile).toBe(true);
  });

  it("blocks direct static access to an unverified legal presentation asset", async () => {
    const filename = "asset-1729000000000-123456789.pdf";
    mockDbRow({
      id: "asset-1",
      fileUrl: "https://truviventures.com/uploads/" + filename,
      category: "APPROVAL_DOC",
      verified: false,
    });
    const req = { path: "/" + filename, query: {} } as Request;
    const res = mockResponse();
    const next = vi.fn() as unknown as NextFunction;

    await protectUnverifiedLegalFiles(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
}); main
