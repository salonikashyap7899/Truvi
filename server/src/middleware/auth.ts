import { Request, Response, NextFunction } from "express";
import { verifyAccessToken, TokenPayload } from "../lib/jwt";

export interface AuthedRequest extends Request {
  user?: TokenPayload;
}

/**
 * Verifies the access token from the Authorization header. Attaches the
 * decoded payload to req.user. This is the server-side re-verification
 * every protected route relies on — the frontend's stored role is never
 * trusted on its own.
 */
export function authenticate(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  try {
    req.user = verifyAccessToken(token);
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

/**
 * Restricts a route to the given roles. Must run after `authenticate`.
 * Also enforces the approval gate for DEVELOPER/CP (ADMIN is exempt,
 * since it's seeded, never self-signup, and never PENDING).
 */
export function requireRole(...roles: Array<"ADMIN" | "DEVELOPER" | "CP" | "BUYER">) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: "Not authenticated" });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    if (req.user.role !== "ADMIN" && req.user.approvalStatus !== "APPROVED") {
      return res.status(403).json({ error: "Account pending admin approval" });
    }
    next();
  };
}
