/**
 * Central audit trail. Every admin action, KYC access, and verification/fraud
 * run should call `writeAudit`. Best-effort by design — an audit write must
 * never break the request it's logging, so failures are swallowed after being
 * logged to the server console.
 */
import { getDb } from "../config/db";
import { auditLogs } from "../db/schema";

export interface AuditEntry {
  userId?: string | null;
  action: string;
  resourceType?: string | null;
  resourceId?: string | null;
  metadata?: Record<string, unknown>;
}

export async function writeAudit(entry: AuditEntry): Promise<void> {
  try {
    const db = getDb();
    await db.insert(auditLogs).values({
      userId: entry.userId ?? null,
      action: entry.action,
      resourceType: entry.resourceType ?? null,
      resourceId: entry.resourceId ?? null,
      metadata: entry.metadata ?? {},
    });
  } catch (err) {
    console.error("Failed to write audit log:", err instanceof Error ? err.message : err);
  }
}
