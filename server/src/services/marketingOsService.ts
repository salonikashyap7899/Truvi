import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { and, eq, inArray, isNull, lte, lt, or, sql } from "drizzle-orm";
import { getDb } from "../config/db";
import { marketingOsEmailOutbox, users } from "../db/schema";
import { MAIL_FROM, sendEmailWithStatus } from "./emailService";

const esc = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (c) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[c]!));

function encryptionKey(): Buffer {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret || secret.length < 32) throw new Error("JWT_ACCESS_SECRET is required to encrypt Marketing OS invitation tokens.");
  return createHash("sha256").update("truvi-marketing-os-email-outbox:v1:").update(secret).digest();
}

/** The durable outbox stores an authenticated ciphertext, never a raw invitation token. */
export function encryptMarketingSecret(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

function decryptMarketingSecret(value: string): string {
  const [ivPart, tagPart, encryptedPart] = value.split(".");
  if (!ivPart || !tagPart || !encryptedPart) throw new Error("INVALID_ENCRYPTED_INVITE");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivPart, "base64url"));
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedPart, "base64url")), decipher.final()]).toString("utf8");
}

export async function enqueueMarketingEmail(input: {
  recipientUserId: string;
  eventType: string;
  resourceId?: string | null;
  payload?: Record<string, unknown>;
  dedupeKey: string;
}): Promise<void> {
  await getDb().insert(marketingOsEmailOutbox).values({
    recipientUserId: input.recipientUserId,
    eventType: input.eventType,
    resourceId: input.resourceId ?? null,
    payload: input.payload ?? {},
    dedupeKey: input.dedupeKey,
  }).onConflictDoNothing({ target: marketingOsEmailOutbox.dedupeKey });
}

function emailMarkup(title: string, intro: string, action?: { label: string; href: string }, details?: string): string {
  const link = action
    ? `<p style="margin:26px 0"><a href="${esc(action.href)}" style="display:inline-block;background:#0877df;color:#fff;padding:13px 22px;border-radius:9px;text-decoration:none;font-weight:700">${esc(action.label)}</a></p>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#071321;font-family:Arial,sans-serif;color:#e8eef8"><div style="max-width:600px;margin:28px auto;padding:32px 28px;background:#0b1c30;border:1px solid #1d3a59;border-radius:18px"><div style="font-size:12px;letter-spacing:3px;color:#36a9ff;font-weight:700">TRUVI VENTURES</div><h1 style="font-family:Georgia,serif;font-size:27px;font-weight:500;color:#fff;margin:24px 0 12px">${esc(title)}</h1><p style="color:#c4d2e3;line-height:1.7">${intro}</p>${details ? `<div style="margin:18px 0;padding:16px;background:#102840;border:1px solid #244763;border-radius:12px;color:#dce8f6;line-height:1.7">${details}</div>` : ""}${link}<p style="margin-top:30px;color:#8da4bd;font-size:12px;line-height:1.6">This is an operational notification from Truvi Ventures. Please contact your administrator if you believe you received it in error.</p><p style="color:#dce8f6">Team Truvi</p></div></body></html>`;
}

function buildMail(eventType: string, payload: Record<string, unknown>): { subject: string; html: string } {
  const name = esc(payload.name || "there");
  if (eventType === "PARTNER_INVITE") {
    const rawToken = decryptMarketingSecret(String(payload.encryptedToken || ""));
    const base = (process.env.CLIENT_URL || "https://truviventures.com").replace(/\/$/, "");
    const href = `${base}/marketing/activate?token=${encodeURIComponent(rawToken)}`;
    return {
      subject: "Your Truvi Marketing Partner invitation",
      html: emailMarkup("Welcome to Truvi", `Hello ${name}, your secure Marketing Partner account is ready. Set your password using the one-time link below.`, { label: "Activate your account", href }, "This invitation expires in 48 hours and can only be used once."),
    };
  }
  const title = esc(payload.title || "Marketing workspace update");
  const message = esc(payload.message || "There is a new update in your Truvi workspace.");
  const href = typeof payload.href === "string" ? payload.href : "https://truviventures.com";
  const absoluteHref = href.startsWith("http") ? href : `${(process.env.CLIENT_URL || "https://truviventures.com").replace(/\/$/, "")}${href.startsWith("/") ? "" : "/"}${href}`;
  return {
    subject: `Truvi: ${String(payload.subject || title).slice(0, 140)}`,
    html: emailMarkup(String(payload.heading || title), `Hello ${name}, ${message}`, { label: "Open Truvi", href: absoluteHref }),
  };
}

/**
 * Concurrent-safe outbox sweep. An atomic claim prevents two PM2 workers from
 * sending the same row. Provider acceptance is recorded separately from delivery.
 */
export async function processMarketingOsEmailOutbox(limit = 25): Promise<{ scanned: number; accepted: number; retried: number; failed: number }> {
  const db = getDb();
  const now = new Date();
  const staleBefore = new Date(now.getTime() - 10 * 60_000);
  await db.update(marketingOsEmailOutbox).set({
    status: "RETRY_PENDING", nextAttemptAt: now, claimedAt: null, lastError: "STALE_SEND_RECOVERED",
  }).where(and(eq(marketingOsEmailOutbox.status, "SENDING"), lt(marketingOsEmailOutbox.attempts, 6),
    or(isNull(marketingOsEmailOutbox.claimedAt), lt(marketingOsEmailOutbox.claimedAt, staleBefore))));
  await db.update(marketingOsEmailOutbox).set({
    status: "FAILED", claimedAt: null, lastError: "STALE_SEND_EXHAUSTED",
  }).where(and(eq(marketingOsEmailOutbox.status, "SENDING"), lte(marketingOsEmailOutbox.attempts, 6),
    or(isNull(marketingOsEmailOutbox.claimedAt), lt(marketingOsEmailOutbox.claimedAt, staleBefore))));

  const due = await db.select({ id: marketingOsEmailOutbox._id }).from(marketingOsEmailOutbox)
    .where(and(inArray(marketingOsEmailOutbox.status, ["QUEUED", "RETRY_PENDING"]),
      lt(marketingOsEmailOutbox.attempts, 6), lte(marketingOsEmailOutbox.nextAttemptAt, now)))
    .orderBy(marketingOsEmailOutbox.nextAttemptAt).limit(Math.max(1, Math.min(100, Math.floor(limit))));
  let accepted = 0, retried = 0, failed = 0;
  for (const item of due) {
    const [job] = await db.update(marketingOsEmailOutbox).set({
      status: "SENDING", claimedAt: now, attempts: sql`${marketingOsEmailOutbox.attempts} + 1`,
    }).where(and(eq(marketingOsEmailOutbox._id, item.id),
      inArray(marketingOsEmailOutbox.status, ["QUEUED", "RETRY_PENDING"]),
      lt(marketingOsEmailOutbox.attempts, 6), lte(marketingOsEmailOutbox.nextAttemptAt, now)))
      .returning();
    if (!job) continue;
    try {
      const [recipient] = await db.select({ email: users.email, disabled: users.disabled })
        .from(users).where(eq(users._id, job.recipientUserId)).limit(1);
      if (!recipient || recipient.disabled || !recipient.email) throw new Error("RECIPIENT_INACTIVE");
      const mail = buildMail(job.eventType, job.payload ?? {});
      const result = await sendEmailWithStatus(String(recipient.email), mail.subject, mail.html, MAIL_FROM);
      if (result.status !== "SENT_TO_PROVIDER") throw new Error("EMAIL_PROVIDER_NOT_CONFIGURED");
      await db.update(marketingOsEmailOutbox).set({
        status: "SENT_TO_PROVIDER", sentAt: new Date(), claimedAt: null, lastError: null, nextAttemptAt: new Date(),
      }).where(eq(marketingOsEmailOutbox._id, job._id));
      accepted++;
    } catch (error) {
      const attempt = Number(job.attempts);
      const terminal = attempt >= 6;
      const delays = [1, 5, 15, 60, 180, 360];
      await db.update(marketingOsEmailOutbox).set({
        status: terminal ? "FAILED" : "RETRY_PENDING",
        nextAttemptAt: new Date(Date.now() + (delays[Math.min(attempt - 1, delays.length - 1)] || 360) * 60_000),
        claimedAt: null,
        lastError: error instanceof Error ? error.message.slice(0, 120) : "EMAIL_SEND_FAILED",
      }).where(eq(marketingOsEmailOutbox._id, job._id));
      if (terminal) failed++; else retried++;
    }
  }
  return { scanned: due.length, accepted, retried, failed };
}

export function startMarketingOsEmailWorker(): void {
  const run = () => {
    processMarketingOsEmailOutbox()
      .then((r) => {
        if (r.scanned) console.log(`[marketing-os-email] scanned=${r.scanned} accepted=${r.accepted} retry=${r.retried} failed=${r.failed}`);
      })
      .catch((err) => console.warn("[marketing-os-email] sweep failed:", err instanceof Error ? err.message : err));
  };
  setTimeout(run, 30_000).unref();
  setInterval(run, 60_000).unref();
}
