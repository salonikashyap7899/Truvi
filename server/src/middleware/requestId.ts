import { randomUUID } from "crypto";
import type { NextFunction, Request, Response } from "express";

const SAFE_REQUEST_ID = /^[A-Za-z0-9-]{16,64}$/;

/**
 * Adds a safe correlation ID to every request. For KYC failures, logs only
 * endpoint, status, duration and request ID — never request bodies, document
 * bytes, Aadhaar/PAN values, authorization headers, or cookies.
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction) {
  const supplied = req.get("X-Request-ID");
  const requestId = supplied && SAFE_REQUEST_ID.test(supplied) ? supplied : randomUUID();

  res.locals.requestId = requestId;
  res.setHeader("X-Request-ID", requestId);

  const startedAt = Date.now();
  res.on("finish", () => {
    const routePath = req.originalUrl.split("?")[0];
    if (routePath === "/api/auth/submit-kyc" && res.statusCode >= 400) {
      console.warn(JSON.stringify({
        event: "kyc_request_failed",
        requestId,
        method: req.method,
        path: routePath,
        status: res.statusCode,
        durationMs: Date.now() - startedAt,
      }));
    }
  });

  next();
}
