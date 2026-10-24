import { Request, Response, NextFunction } from "express";
import multer from "multer";
import { PaymentsUnavailableError } from "../services/paymentService";

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  const requestId = String(res.locals.requestId || "unknown");

  // Malformed JSON is a client request error (often a stale client or bot),
  // not an application/server failure. Return a safe 400 response without
  // logging parser stacks or the raw request body.
  const parserError = err as { type?: unknown; status?: unknown; statusCode?: unknown };
  if (
    parserError?.type === "entity.parse.failed" ||
    (err instanceof SyntaxError &&
      (parserError.status === 400 || parserError.statusCode === 400) &&
      "body" in parserError)
  ) {
    return res.status(400).json({
      error: "Invalid JSON request body. Please send valid JSON and try again.",
      requestId,
    });
  }

  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ error: "Each uploaded file must be 6 MB or smaller.", requestId });
    }
    if (err.code === "LIMIT_UNEXPECTED_FILE") {
      return res.status(400).json({ error: "Unexpected upload field. Please select the required files and try again.", requestId });
    }
    return res.status(400).json({ error: "The upload could not be processed. Please check the selected files.", requestId });
  }

  if (
    err instanceof Error &&
    (err.message.startsWith("Unsupported file type") ||
      err.message.startsWith("File type not allowed") ||
      err.message.startsWith("Upload a JPG"))
  ) {
    return res.status(415).json({ error: err.message, requestId });
  }

  if (err instanceof PaymentsUnavailableError) {
    return res.status(503).json({ error: err.message, requestId });
  }

  const error = err instanceof Error ? err : new Error(String(err ?? "Unknown error"));
  const isKycRequest = req.originalUrl.split("?")[0] === "/api/auth/submit-kyc";
  const errorCode = (error as Error & { code?: unknown }).code;
  console.error(JSON.stringify({
    event: isKycRequest ? "kyc_request_error" : "http_request_error",
    requestId,
    method: req.method,
    path: req.path,
    errorName: error.name,
    // KYC errors can involve sensitive identity workflows. Keep server logs
    // useful without echoing arbitrary database/error text or stack details.
    ...(isKycRequest
      ? { errorCode: typeof errorCode === "string" ? errorCode.slice(0, 40) : undefined }
      : { errorMessage: error.message, stack: error.stack }),
  }));
  return res.status(500).json({ error: "Something went wrong", requestId });
}

export function notFoundHandler(_req: Request, res: Response) {
  const requestId = String(res.locals.requestId || "unknown");
  res.status(404).json({ error: "Route not found", requestId });
}
