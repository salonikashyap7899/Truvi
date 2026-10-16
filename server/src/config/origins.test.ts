import { afterEach, describe, expect, it } from "vitest";
import { getAllowedOrigins } from "./origins";

describe("getAllowedOrigins", () => {
  const originalClientUrl = process.env.CLIENT_URL;
  const originalRenderUrl = process.env.RENDER_EXTERNAL_URL;
  const originalReplitDomains = process.env.REPLIT_DOMAINS;

  afterEach(() => {
    if (originalClientUrl === undefined) delete process.env.CLIENT_URL;
    else process.env.CLIENT_URL = originalClientUrl;
    if (originalRenderUrl === undefined) delete process.env.RENDER_EXTERNAL_URL;
    else process.env.RENDER_EXTERNAL_URL = originalRenderUrl;
    if (originalReplitDomains === undefined) delete process.env.REPLIT_DOMAINS;
    else process.env.REPLIT_DOMAINS = originalReplitDomains;
  });

  it("allows both Truvi website hosts when the apex domain is configured", () => {
    process.env.CLIENT_URL = "https://truviventures.com";
    delete process.env.RENDER_EXTERNAL_URL;
    delete process.env.REPLIT_DOMAINS;

    expect(getAllowedOrigins()).toEqual(
      expect.arrayContaining(["https://truviventures.com", "https://www.truviventures.com"]),
    );
  });

  it("allows both Truvi website hosts when the www domain is configured", () => {
    process.env.CLIENT_URL = "https://www.truviventures.com";
    delete process.env.RENDER_EXTERNAL_URL;
    delete process.env.REPLIT_DOMAINS;

    expect(getAllowedOrigins()).toEqual(
      expect.arrayContaining(["https://www.truviventures.com", "https://truviventures.com"]),
    );
  });
});
