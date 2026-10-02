import jwt from "jsonwebtoken";

export interface TokenPayload {
  userId: string;
  role: "ADMIN" | "DEVELOPER" | "CP" | "BUYER" | "AMBASSADOR" | "VERIFIER";
  approvalStatus: "PENDING" | "APPROVED" | "REJECTED";
  onboardingVerified?: boolean;
}

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "dev-access-secret-change-me";
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "dev-refresh-secret-change-me";

export function signAccessToken(payload: TokenPayload): string {
  return jwt.sign(payload, ACCESS_SECRET, { expiresIn: "15m" });
}

export function signRefreshToken(payload: { userId: string }): string {
  return jwt.sign(payload, REFRESH_SECRET, { expiresIn: "30d" });
}

export function verifyAccessToken(token: string): TokenPayload {
  return jwt.verify(token, ACCESS_SECRET) as TokenPayload;
}

/**
 * True only when `token` is a well-formed, correctly-signed access token that
 * has merely expired — i.e. a genuine session of ours that lapsed. A missing,
 * malformed or forged token returns false. Lets a route tell "your session
 * expired, refresh and retry" apart from "you were never authorized".
 */
export function isExpiredAccessToken(token: string): boolean {
  try {
    jwt.verify(token, ACCESS_SECRET);
    return false;
  } catch (err) {
    return err instanceof jwt.TokenExpiredError;
  }
}

export function verifyRefreshToken(token: string): { userId: string } {
  return jwt.verify(token, REFRESH_SECRET) as { userId: string };
}
