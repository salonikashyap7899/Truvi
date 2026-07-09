import { and, eq, lt } from "drizzle-orm";
import { getDb } from "../config/db";
import { units } from "../db/schema";

/**
 * Check-and-expire approach (no background worker for MVP, matches the
 * spec's original intent). Called at the top of any read that touches
 * Units, so a LOCKED unit whose lockExpiresAt has passed flips back to
 * AVAILABLE before the caller sees it.
 */
export async function expireStaleLocks(): Promise<void> {
  const db = getDb();
  await db
    .update(units)
    .set({ status: "AVAILABLE", lockedByCPId: null, lockExpiresAt: null })
    .where(and(eq(units.status, "LOCKED"), lt(units.lockExpiresAt, new Date())));
}
