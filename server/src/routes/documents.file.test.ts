import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import fs from "fs";
import path from "path";
import express from "express";

const DOC_ID = "3f2b8c1e-9a4d-4e7b-8c2a-1d5e6f7a8b9c";
const STORED_NAME = "test-private-doc.pdf";
const CONTENT = "%PDF-1.4 private test document";

// Stand-in for the buyer_documents lookup the handler performs.
vi.mock("../config/db", () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: async () => [{ fileUrl: `private:${STORED_NAME}`, fileName: "my id\r\nproof.pdf" }],
      }),
    }),
  }),
}));

import { buyerDocFileHandler } from "./documents";
import { PRIVATE_UPLOAD_DIR, signedBuyerDocUrl } from "../services/privateFiles";

describe("signed buyer document download", () => {
  const filePath = path.join(PRIVATE_UPLOAD_DIR, STORED_NAME);
  let server: ReturnType<ReturnType<typeof express>["listen"]> | undefined;
  let base = "";

  beforeAll(async () => {
    fs.writeFileSync(filePath, CONTENT);
    const app = express();
    app.get("/api/documents/file/:id", buyerDocFileHandler);
    server = app.listen(0);
    await new Promise<void>((resolve) => server?.once("listening", () => resolve()));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Server did not bind to a port");
    base = `http://127.0.0.1:${address.port}`;
  });

  afterAll(() => {
    server?.close();
    fs.rmSync(filePath, { force: true });
  });

  it("streams the file for a valid link, uncached, with a sanitized filename", async () => {
    const u = new URL(signedBuyerDocUrl(DOC_ID));
    const res = await fetch(`${base}${u.pathname}${u.search}`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(CONTENT);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(res.headers.get("content-type")).toContain("application/pdf");
    // CR/LF stripped, so the filename can't inject extra response headers.
    expect(res.headers.get("content-disposition")).toBe('inline; filename="my id_proof.pdf"');
  });
});
