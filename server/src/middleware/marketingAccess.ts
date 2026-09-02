import { Response, NextFunction } from "express";
import { and, eq } from "drizzle-orm";
import { getDb } from "../config/db";
import { marketingAccess } from "../db/schema";
import { AuthedRequest } from "./auth";

/**
 * Whether a user currently has usable marketing access: an ACTIVE row whose
 * validity window covers "now". Because this is evaluated per request, an admin
 * deactivating or revoking access takes effect immediately — the very next
 * request is rejected.
 */
export async function hasActiveMarketingAccess(userId: string): Promise<boolean> {
  const db = getDb();
  const [row] = await db
    .select({
      status: marketingAccess.status,
      validFrom: marketingAccess.validFrom,
      validUntil: marketingAccess.validUntil,
    })
    .from(marketingAccess)
    .where(and(eq(marketingAccess.userId, userId), eq(marketingAccess.status, "ACTIVE")))
    .limit(1);
  if (!row) return false;
  const now = Date.now();
  if (row.validFrom && new Date(row.validFrom).getTime() > now) return false;
  if (row.validUntil && new Date(row.validUntil).getTime() < now) return false;
  return true;
}

/**
 * Gate a marketing route. Admins/founders always pass (they manage the module);
 * everyone else must hold currently-active marketing access. Must run after
 * `authenticate`.
 */
export async function requireMarketingAccess(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: "Not authenticated" });
  if (req.user.role === "ADMIN") return next();
  try {
    if (await hasActiveMarketingAccess(req.user.userId)) return next();
  } catch {
    return res.status(500).json({ error: "Could not verify marketing access" });
  }
  return res.status(403).json({ error: "You do not have marketing access. Contact the Truvi team." });
}
