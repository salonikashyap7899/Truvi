import { Unit } from "../models/Unit";

/**
 * Check-and-expire approach (no background worker for MVP, matches the
 * spec's original intent). Called at the top of any read that touches
 * Units, so a LOCKED unit whose lockExpiresAt has passed flips back to
 * AVAILABLE before the caller sees it.
 */
export async function expireStaleLocks(): Promise<void> {
  await Unit.updateMany(
    { status: "LOCKED", lockExpiresAt: { $lt: new Date() } },
    { $set: { status: "AVAILABLE", lockedByCPId: null, lockExpiresAt: null } },
  );
}
