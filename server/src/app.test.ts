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

  it("serves the built frontend for non-API routes", async () => {
    const app = createApp();
    server = app.listen(0);

    await new Promise<void>((resolve) => {
      server?.once("listening", () => resolve());
    });

    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Server did not bind to a port");

    const response = await fetch(`http://127.0.0.1:${address.port}/dashboard`);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(body).toContain("<div id=\"root\">");
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
