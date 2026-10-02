import { getDb } from "../db";
import { auditLogs } from "../db/verificationSchema";
import { emitToRole } from "../sockets";

/**
 * Append an audit-trail entry. Every admin action, KYC access and verification
 * run is logged. Best-effort: a logging failure never blocks the request.
 * Each new entry is also pushed to connected admins so the Audit Logs page
 * updates in real time.
 */
export async function logAudit(entry: {
  userId?: string | null;
  action: string;
  resourceType?: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const [row] = await getDb()
      .insert(auditLogs)
      .values({
        userId: entry.userId ?? null,
        action: entry.action,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId,
        metadata: entry.metadata ?? {},
      })
      .returning();
    // Live feed for the admin Audit Logs page. Runs inside the same
    // try-block: if sockets aren't initialised (seed scripts), we skip.
    emitToRole("ADMIN", "audit:new", row);
  } catch {
    // never throw from the audit path
  }
}
