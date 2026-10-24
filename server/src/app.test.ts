import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "./app";
import { requireRole } from "./middleware/auth";
import { Request, Response, NextFunction } from "express";

describe("createApp production hosting", () => {
  const originalEnv = process.env.NODE_ENV;
  let server: ReturnType<ReturnType<typeof createApp>["listen"]> | undefined;

  beforeAll(() => {
    process.env.NODE_ENV = "production";
  });

  afterAll(() => {
    process.env.NODE_ENV = originalEnv;
    server?.close();
  });

  it("serves the built frontend for dashboard and shared presentation deep links", async () => {
    const app = createApp();
    server = app.listen(0);

    await new Promise<void>((resolve) => {
      server?.once("listening", () => resolve());
    });

    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Server did not bind to a port");

    const response = await fetch(`http://127.0.0.1:${address.port}/dashboard`);
    const body = await response.text();
    const presentationResponse = await fetch(
      `http://127.0.0.1:${address.port}/inventory/76da0eb3-4ed2-4e43-86de-ab0b5ba8ad07/presentation`,
    );
    const presentationBody = await presentationResponse.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(body).toContain("<div id=\"root\">");
    expect(presentationResponse.status).toBe(200);
    expect(presentationResponse.headers.get("content-type")).toContain("text/html");
    expect(presentationBody).toContain("<div id=\"root\">");

    const missingAssetResponse = await fetch(
      `http://127.0.0.1:${address.port}/assets/__truvi_missing_chunk__.js`,
    );
    expect(missingAssetResponse.status).toBe(404);
    expect(missingAssetResponse.headers.get("content-type") || "").not.toContain("text/html");

    const unknownSpaRoute = await fetch(`http://127.0.0.1:${address.port}/this-route-does-not-exist`);
    expect(unknownSpaRoute.status).toBe(200);
    expect(unknownSpaRoute.headers.get("content-type")).toContain("text/html");
  });

  it("blocks CP ambassadors until onboarding verification is complete", () => {
    const middleware = requireRole("CP");
    const req = { user: { role: "CP", approvalStatus: "APPROVED", onboardingVerified: false } } as Request;
    const res = {
      status: (code: number) => ({ json: (payload: unknown) => ({ code, payload }) }),
    } as unknown as Response;
    const next = vi.fn();

    const result = middleware(req, res, next as NextFunction);

    expect(result).toEqual({ code: 403, payload: { error: "Complete onboarding verification to access project details" } });
    expect(next).not.toHaveBeenCalled();
  });
});
