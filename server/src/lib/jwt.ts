import jwt from "jsonwebtoken";

export interface TokenPayload {
  userId: string;
  role: "ADMIN" | "DEVELOPER" | "CP" | "BUYER" | "AMBASSADOR" | "VERIFIER";
  approvalStatus: "PENDING" | "APPROVED" | "REJECTED";
  onboardingVerified?: boolean;
  /** Channel Partners only: has the compulsory CP joining been completed?
   *  Absent on tokens issued before this flag existed (treated as joined). */
  cpJoined?: boolean;
}

/**
 * Insecure fallbacks used ONLY for local development and tests. The boot-time
 * guard `assertRequiredEnvForProduction()` refuses to start any non-dev/test
 * environment that is still using these, so they can never sign real tokens in
 * production. Exported so that guard has a single source of truth to compare
 * against.
 */
export const DEV_JWT_ACCESS_DEFAULT = "dev-access-secret-change-me";
export const DEV_JWT_REFRESH_DEFAULT = "dev-refresh-secret-change-me";

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || DEV_JWT_ACCESS_DEFAULT;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || DEV_JWT_REFRESH_DEFAULT;

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
