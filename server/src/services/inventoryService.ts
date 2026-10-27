import { and, eq, lt } from "drizzle-orm";
import { getDb } from "../config/db";
import { units } from "../db/schema";
import { enqueueRequirementMatchJob } from "./propertyRequirementMatching";

/**
 * Check-and-expire approach (no background worker for MVP, matches the
 * spec's original intent). Called at the top of any read that touches
 * Units, so a LOCKED unit whose lockExpiresAt has passed flips back to
 * AVAILABLE before the caller sees it.
 */
export async function expireStaleLocks(): Promise<void> {
  const db = getDb();
  const expired = await db
    .update(units)
    .set({ status: "AVAILABLE", lockedByCPId: null, lockExpiresAt: null })
    .where(and(eq(units.status, "LOCKED"), lt(units.lockExpiresAt, new Date())))
    .returning({ projectId: units.projectId });

  // A stale lock can restore a property's matching eligibility. Queue one
  // recheck per project rather than matching inline on a read request.
  const projectIds = new Set(expired.map((unit) => String(unit.projectId)));
  for (const projectId of projectIds) {
    void enqueueRequirementMatchJob("PROJECT", { projectId }).catch(() => {
      console.warn("[property-matching] expired-lock recheck could not be queued");
    });
  }
}
