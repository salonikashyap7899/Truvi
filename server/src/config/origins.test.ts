import { afterEach, describe, expect, it } from "vitest";
import { getAllowedOrigins } from "./origins";

describe("getAllowedOrigins", () => {
  const originalClientUrl = process.env.CLIENT_URL;
  const originalRenderUrl = process.env.RENDER_EXTERNAL_URL;
  const originalReplitDomains = process.env.REPLIT_DOMAINS;
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    for (const [key, value] of [
      ["CLIENT_URL", originalClientUrl],
      ["RENDER_EXTERNAL_URL", originalRenderUrl],
      ["REPLIT_DOMAINS", originalReplitDomains],
      ["NODE_ENV", originalNodeEnv],
    ] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("allows both Truvi website hosts when the apex domain is configured", () => {
    process.env.CLIENT_URL = "https://truviventures.com";
    delete process.env.RENDER_EXTERNAL_URL;
    delete process.env.REPLIT_DOMAINS;
    process.env.NODE_ENV = "production";

    expect(getAllowedOrigins()).toEqual(
      expect.arrayContaining(["https://truviventures.com", "https://www.truviventures.com"]),
    );
  });

  it("allows both Truvi website hosts when the www domain is configured", () => {
    process.env.CLIENT_URL = "https://www.truviventures.com";
    delete process.env.RENDER_EXTERNAL_URL;
    delete process.env.REPLIT_DOMAINS;
    process.env.NODE_ENV = "production";

    expect(getAllowedOrigins()).toEqual(
      expect.arrayContaining(["https://www.truviventures.com", "https://truviventures.com"]),
    );
  });

  it("allows only explicitly configured Replit origins instead of wildcard origins", () => {
    process.env.NODE_ENV = "production";
    process.env.CLIENT_URL = "https://truviventures.com";
    process.env.REPLIT_DOMAINS = "truvi-preview.replit.dev";

    const origins = getAllowedOrigins();
    expect(Array.isArray(origins)).toBe(true);
    expect(origins).toContain("https://truvi-preview.replit.dev");
    expect(origins).not.toContain("https://attacker.example");
    expect(origins).not.toContain("http://attacker.example");
  });

  it("does not allow Capacitor native-app origins", () => {
    process.env.NODE_ENV = "production";
    process.env.CLIENT_URL = "https://truviventures.com";
    delete process.env.REPLIT_DOMAINS;
    delete process.env.RENDER_EXTERNAL_URL;

    const origins = getAllowedOrigins();
    expect(origins).not.toContain("capacitor://localhost");
    expect(origins).not.toContain("https://localhost");
  });

  it("rejects plain HTTP website origins in production", () => {
    process.env.NODE_ENV = "production";
    process.env.CLIENT_URL = "http://attacker.example";
    delete process.env.REPLIT_DOMAINS;
    delete process.env.RENDER_EXTERNAL_URL;

    expect(getAllowedOrigins()).not.toContain("http://attacker.example");
  });
});
