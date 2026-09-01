/**
 * WhatsApp notification integration (Meta WhatsApp Business Cloud API).
 *
 * Design goals (per spec):
 *   - Runs ALONGSIDE the existing in-app notifications, never replaces them.
 *   - Sends from a dedicated Truvy business number (configured on Meta), never
 *     anyone's personal number — the sender is the `phone_number_id` you set in
 *     env, not a hard-coded number in code.
 *   - Fully DORMANT until credentials are configured: with no env vars set,
 *     every function is a safe no-op, so nothing breaks before setup.
 *   - Configurable by event type via env (`WHATSAPP_EVENTS`), so an admin can
 *     later decide which events also go to WhatsApp without a code change.
 *   - Never throws into the caller — a WhatsApp failure must not affect the app.
 *
 * Setup (one-time, on Meta side):
 *   1. Create a WhatsApp Business Account and register the Truvy business
 *      number (e.g. +91 91963 66358) on the WhatsApp Business Platform.
 *   2. Get the Phone Number ID and a permanent Access Token.
 *   3. Business-initiated messages require APPROVED message templates — create
 *      them in the Meta dashboard and set their names in the env vars below.
 *   4. Set these env vars on the server (server/.env):
 *        WHATSAPP_ACCESS_TOKEN=...
 *        WHATSAPP_PHONE_NUMBER_ID=...
 *        WHATSAPP_DEFAULT_LANG=en            (optional, default "en")
 *        WHATSAPP_EVENTS=project_approved,project_rejected,...   (optional)
 *        WHATSAPP_TPL_WELCOME=truvy_welcome                      (optional)
 *        WHATSAPP_TPL_<TYPE>=<template_name>  per event (optional)
 */

const API_BASE = process.env.WHATSAPP_API_URL || "https://graph.facebook.com/v21.0";
const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || "";
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || "";
const DEFAULT_LANG = process.env.WHATSAPP_DEFAULT_LANG || "en";

/** Event types that ALSO go to WhatsApp (for developer recipients). Overridable
 *  via WHATSAPP_EVENTS (comma-separated), so admins can tune it without code. */
const DEFAULT_EVENTS = [
  "project_approved",
  "project_rejected",
  "project_changes_required",
  "project_live",
  "project_submitted",
  "new_lead",
  "lead_assigned",
  "meeting_reminder",
  "meeting_scheduled",
  "task_completed",
  "investor_task",
  "document_required",
  "system_announcement",
  "security_alert",
];
const ENABLED_EVENTS = new Set(
  (process.env.WHATSAPP_EVENTS?.split(",").map((s) => s.trim()).filter(Boolean) ?? DEFAULT_EVENTS),
);

/** True only when the Cloud API credentials are configured. */
export function isWhatsAppEnabled(): boolean {
  return Boolean(ACCESS_TOKEN && PHONE_NUMBER_ID);
}

/** Is this event type configured to also send a WhatsApp message? */
export function isWhatsAppEventEnabled(type: string): boolean {
  return ENABLED_EVENTS.has(type);
}

/** The Meta-approved template name for an event type, if one is configured. */
function templateForType(type: string): string | undefined {
  const key = `WHATSAPP_TPL_${type.toUpperCase()}`;
  return process.env[key] || undefined;
}

/**
 * Normalise an Indian mobile number to the digits Cloud API expects
 * (country code + number, no "+", no spaces). 10-digit numbers get "91".
 * Returns null if it doesn't look like a phone number.
 */
export function normalizePhone(phone?: string | null): string | null {
  if (!phone) return null;
  let digits = phone.replace(/[^\d]/g, "");
  if (digits.length === 10) digits = "91" + digits;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  if (digits.length >= 11 && digits.length <= 15) return digits; // other country codes
  return null;
}

async function postMessage(body: Record<string, unknown>): Promise<boolean> {
  if (!isWhatsAppEnabled()) return false;
  try {
    const res = await fetch(`${API_BASE}/${PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", ...body }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.warn(`[whatsapp] send failed ${res.status}: ${detail.slice(0, 300)}`);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[whatsapp] send error:", err instanceof Error ? err.message : err);
    return false;
  }
}

/** Free-form text message. Only delivered inside the 24h customer-service
 *  window; for business-initiated messages use a template. */
export async function sendWhatsAppText(to: string, bodyText: string): Promise<boolean> {
  const num = normalizePhone(to);
  if (!num) return false;
  return postMessage({ to: num, type: "text", text: { preview_url: false, body: bodyText } });
}

/** Approved-template message (required for business-initiated notifications). */
export async function sendWhatsAppTemplate(
  to: string,
  template: string,
  bodyParams: string[] = [],
  lang = DEFAULT_LANG,
): Promise<boolean> {
  const num = normalizePhone(to);
  if (!num) return false;
  const components = bodyParams.length
    ? [{ type: "body", parameters: bodyParams.map((text) => ({ type: "text", text })) }]
    : [];
  return postMessage({
    to: num,
    type: "template",
    template: { name: template, language: { code: lang }, components },
  });
}

/**
 * One-time welcome message when a new developer is created. Uses the
 * WHATSAPP_TPL_WELCOME template if configured (recommended for compliance),
 * otherwise falls back to text. Fire-and-forget; never throws.
 */
export async function sendDeveloperWelcome(phone?: string | null, name?: string | null): Promise<void> {
  if (!isWhatsAppEnabled()) return;
  const template = process.env.WHATSAPP_TPL_WELCOME;
  const text =
    `Welcome to Truvy! 🎉 Your Developer account${name ? `, ${name},` : ""} has been successfully created. ` +
    `You can now list your projects and connect with investors and channel partners through Truvy. — Team Truvy`;
  try {
    if (template) await sendWhatsAppTemplate(phone ?? "", template, name ? [name] : []);
    else await sendWhatsAppText(phone ?? "", text);
  } catch {
    /* non-fatal */
  }
}

/**
 * Dispatch a WhatsApp copy of an in-app notification to a developer recipient,
 * if WhatsApp is enabled and this event type is configured for it. Uses the
 * event's approved template if set, else the notification's own message text.
 * Fire-and-forget; safe to call for any recipient (no-ops when not eligible).
 */
export async function dispatchNotificationWhatsApp(
  recipient: { role?: string | null; phone?: string | null; name?: string | null },
  notification: { type: string; title?: string | null; message: string },
): Promise<void> {
  if (!isWhatsAppEnabled()) return;
  if (recipient.role !== "DEVELOPER") return; // spec: WhatsApp is for developer actions
  if (!recipient.phone) return;
  if (!isWhatsAppEventEnabled(notification.type)) return;

  const template = templateForType(notification.type);
  const text = notification.title ? `${notification.title}\n\n${notification.message}` : notification.message;
  try {
    if (template) await sendWhatsAppTemplate(recipient.phone, template, [notification.message]);
    else await sendWhatsAppText(recipient.phone, text);
  } catch {
    /* non-fatal */
  }
}
