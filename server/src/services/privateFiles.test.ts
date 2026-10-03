import { afterAll, beforeAll, describe, expect, it } from "vitest";
import path from "path";
import {
  PRIVATE_UPLOAD_DIR,
  isPrivateRef,
  presentBuyerDocUrl,
  privateFilePath,
  privateRef,
  signedBuyerDocUrl,
  verifyBuyerDocSignature,
} from "./privateFiles";
import { createApp } from "../app";

const DOC_ID = "3f2b8c1e-9a4d-4e7b-8c2a-1d5e6f7a8b9c";
const OTHER_DOC_ID = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";

function parts(url: string) {
  const u = new URL(url);
  return { id: u.pathname.split("/").pop()!, exp: u.searchParams.get("exp")!, sig: u.searchParams.get("sig")! };
}

describe("private buyer document links", () => {
  it("accepts a freshly signed link for the same document", () => {
    const { id, exp, sig } = parts(signedBuyerDocUrl(DOC_ID));
    expect(id).toBe(DOC_ID);
    expect(verifyBuyerDocSignature(DOC_ID, exp, sig)).toBe(true);
  });

  it("rejects a link replayed against a different document", () => {
    const { exp, sig } = parts(signedBuyerDocUrl(DOC_ID));
    expect(verifyBuyerDocSignature(OTHER_DOC_ID, exp, sig)).toBe(false);
  });

  it("rejects a tampered signature or an extended expiry", () => {
    const { exp, sig } = parts(signedBuyerDocUrl(DOC_ID));
    const flipped = (sig[0] === "a" ? "b" : "a") + sig.slice(1);
    expect(verifyBuyerDocSignature(DOC_ID, exp, flipped)).toBe(false);
    expect(verifyBuyerDocSignature(DOC_ID, String(Number(exp) + 3600), sig)).toBe(false);
  });

  it("rejects expired and malformed links", () => {
    const past = String(Math.floor(Date.now() / 1000) - 10);
    expect(verifyBuyerDocSignature(DOC_ID, past, "0".repeat(64))).toBe(false);
    expect(verifyBuyerDocSignature(DOC_ID, "not-a-number", "0".repeat(64))).toBe(false);
    expect(verifyBuyerDocSignature(DOC_ID, String(Math.floor(Date.now() / 1000) + 60), "short")).toBe(false);
  });

  it("keeps legacy public URLs and signs private ones", () => {
    const legacy = "https://truviventures.com/uploads/123-old.pdf";
    expect(presentBuyerDocUrl(DOC_ID, legacy)).toBe(legacy);
    const signed = presentBuyerDocUrl(DOC_ID, privateRef("abc.pdf"));
    expect(signed).toContain(`/api/documents/file/${DOC_ID}?exp=`);
    expect(signed).not.toContain("/uploads/");
  });

  it("never resolves a stored ref outside the private directory", () => {
    expect(isPrivateRef("https://x/uploads/a.pdf")).toBe(false);
    expect(privateFilePath("https://x/uploads/a.pdf")).toBeNull();
    expect(privateFilePath(privateRef("../../etc/passwd"))).toBe(path.join(PRIVATE_UPLOAD_DIR, "passwd"));
    expect(privateFilePath(privateRef(".env"))).toBeNull();
    expect(privateFilePath(privateRef(""))).toBeNull();
  });
});

describe("document access over HTTP", () => {
  let server: ReturnType<ReturnType<typeof createApp>["listen"]> | undefined;
  let base = "";

  beforeAll(async () => {
    server = createApp().listen(0);
    await new Promise<void>((resolve) => server?.once("listening", () => resolve()));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Server did not bind to a port");
    base = `http://127.0.0.1:${address.port}`;
  });

  afterAll(() => {
    server?.close();
  });

  it("refuses unsigned, forged and expired document links before touching storage", async () => {
    const forged = await fetch(`${base}/api/documents/file/${DOC_ID}?exp=${Math.floor(Date.now() / 1000) + 600}&sig=${"0".repeat(64)}`);
    expect(forged.status).toBe(403);
    const unsigned = await fetch(`${base}/api/documents/file/${DOC_ID}`);
    expect(unsigned.status).toBe(403);
    const { exp, sig } = parts(signedBuyerDocUrl(DOC_ID));
    const wrongDoc = await fetch(`${base}/api/documents/file/${OTHER_DOC_ID}?exp=${exp}&sig=${sig}`);
    expect(wrongDoc.status).toBe(403);
  });

  it("no longer serves anything under the legacy /uploads/aadhaar path", async () => {
    const res = await fetch(`${base}/uploads/aadhaar/anything.jpg`);
    expect(res.status).toBe(404);
  });
});
