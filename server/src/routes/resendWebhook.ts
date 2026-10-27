import type { Request, Response } from "express";
import { and, eq, ne, inArray } from "drizzle-orm";
import { getDb } from "../config/db";
import { emailDeliveryEvents, propertyRequirementMatches } from "../db/schema";
import { verifyResendWebhookSignature } from "../services/resendWebhookSecurity";

type ResendEvent = {
  type?: unknown;
  created_at?: unknown;
  data?: { email_id?: unknown; id?: unknown };
};

/**
 * Optional Resend delivery webhook.
 * Mount with express.raw() before express.json() so signature verification uses
 * the exact bytes that Resend signed. SMTP alone cannot confirm mailbox delivery.
 */
export async function resendWebhookHandler(req: Request, res: Response) {
  const secret = process.env.RESEND_WEBHOOK_SECRET?.trim() || "";
  if (!secret) {
    return res.status(503).json({ error: "Resend delivery webhooks are not configured." });
  }
  if (!Buffer.isBuffer(req.body)) {
    return res.status(400).json({ error: "Expected a raw JSON webhook body." });
  }

  const signedHeaders = {
    id: req.get("svix-id") ?? undefined,
    timestamp: req.get("svix-timestamp") ?? undefined,
    signature: req.get("svix-signature") ?? undefined,
  };
  if (!verifyResendWebhookSignature(req.body, signedHeaders, secret)) {
    return res.status(401).json({ error: "Invalid webhook signature." });
  }

  let event: ResendEvent;
  try {
    event = JSON.parse(req.body.toString("utf8")) as ResendEvent;
  } catch {
    return res.status(400).json({ error: "Invalid webhook JSON." });
  }

  const eventType = typeof event.type === "string" ? event.type : "";
  const providerMessageId =
    typeof event.data?.email_id === "string" ? event.data.email_id
    : typeof event.data?.id === "string" ? event.data.id
    : "";
  const providerEventId = signedHeaders.id?.trim() || "";
  if (!eventType || !providerMessageId || !providerEventId) {
    return res.status(400).json({ error: "Webhook is missing required event identifiers." });
  }

  const providerCreatedAt = typeof event.created_at === "string" ? new Date(event.created_at) : null;
  const safeProviderCreatedAt = providerCreatedAt && !Number.isNaN(providerCreatedAt.getTime())
    ? providerCreatedAt : null;
  const db = getDb();
  const [match] = await db.select({
    id: propertyRequirementMatches._id,
    emailStatus: propertyRequirementMatches.emailStatus,
  }).from(propertyRequirementMatches)
    .where(eq(propertyRequirementMatches.emailProviderMessageId, providerMessageId))
    .limit(1);

  // Svix retries delivery. The provider event ID primary key makes processing
  // idempotent even if the same signed webhook is delivered more than once.
  const [recorded] = await db.insert(emailDeliveryEvents).values({
    providerEventId,
    provider: "RESEND",
    providerMessageId,
    matchId: match?.id ?? null,
    eventType,
    providerCreatedAt: safeProviderCreatedAt,
  }).onConflictDoNothing().returning({ providerEventId: emailDeliveryEvents.providerEventId });
  if (!recorded) return res.status(200).json({ received: true, duplicate: true });

  if (match) {
    if (eventType === "email.delivered") {
      await db.update(propertyRequirementMatches).set({
        emailStatus: "DELIVERED",
        emailDeliveredAt: safeProviderCreatedAt ?? new Date(),
        emailLastError: null,
        emailNextAttemptAt: null,
        emailClaimedAt: null,
      }).where(eq(propertyRequirementMatches._id, match.id));
    } else if (["email.bounced", "email.complained", "email.failed"].includes(eventType)) {
      // A hard bounce/complaint is terminal; retrying it risks repeated unwanted mail.
      await db.update(propertyRequirementMatches).set({
        emailStatus: "FAILED",
        emailLastError: `RESEND_${eventType.replace(/[^a-z.]/g, "").toUpperCase().replace(/\./g, "_")}`,
        emailNextAttemptAt: null,
        emailClaimedAt: null,
      }).where(and(
        eq(propertyRequirementMatches._id, match.id),
        ne(propertyRequirementMatches.emailStatus, "DELIVERED"),
      ));
    } else if (eventType === "email.delivery_delayed") {
      // A delayed delivery is not a send failure and must not trigger a duplicate email.
      await db.update(propertyRequirementMatches).set({
        emailLastError: "RESEND_DELIVERY_DELAYED",
      }).where(and(
        eq(propertyRequirementMatches._id, match.id),
        ne(propertyRequirementMatches.emailStatus, "DELIVERED"),
      ));
    }
  }

  // Unknown provider event types are recorded but don't change delivery state.
  return res.status(200).json({ received: true });
}
