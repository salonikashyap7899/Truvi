import { getDb } from "../db";
import { auditLogs } from "../db/verificationSchema";

/**
 * Append an audit-trail entry. Every admin action, KYC access and verification
 * run is logged. Best-effort: a logging failure never blocks the request.
 */
export async function logAudit(entry: {
  userId?: string | null;
  action: string;
  resourceType?: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await getDb()
      .insert(auditLogs)
      .values({
        userId: entry.userId ?? null,
        action: entry.action,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId,
        metadata: entry.metadata ?? {},
      });
  } catch {
    // never throw from the audit path
  }
}
