import { getDb } from "../config/db";
import { platformSettings } from "../db/schema";
import { isAiSensyEnabled, isWhatsAppEnabled, sendAiSensyCampaign, sendWhatsAppTemplate, sendWhatsAppText } from "./whatsappService";
import { sendEmail, sendSms } from "./emailService";

/**
 * "New Lead Received" alert to the owner/admin number configured in Admin →
 * Settings (or, as a server-side fallback, the LEAD_ALERT_PHONE env). The
 * number and the provider credentials never leave the server.
 *
 * Channels (each used only when configured):
 *  - WhatsApp via AiSensy: campaign named by env AISENSY_CAMPAIGN_NEW_LEAD_ALERT
 *    with 8 template params (name, mobile, project, inventory, source, visit
 *    date, visit time, notes).
 *  - WhatsApp via Meta Cloud API: template WHATSAPP_TPL_NEW_LEAD_ALERT with the
 *    same 8 params (falls back to a plain text message).
 *  - SMS via Twilio.
 *  - Email to the alert email address.
 * Fire-and-forget: never throws, never blocks lead creation.
 */
export interface LeadAlert {
  leadId: string; // display id, e.g. TRV-L-000123
  customerName: string;
  customerPhone: string;
  project: string;
  inventory: string;
  source: string;
  visitDate: string; // human readable
  visitTime: string;
  notes: string;
}

export interface LeadAlertResult {
  configured: boolean;
  whatsapp: boolean;
  sms: boolean;
  email: boolean;
}

async function alertTargets() {
  const [s] = await getDb()
    .select({
      enabled: platformSettings.leadAlertEnabled,
      phone: platformSettings.leadAlertPhone,
      email: platformSettings.leadAlertEmail,
    })
    .from(platformSettings)
    .limit(1);
  return {
    enabled: s?.enabled ?? true,
    phone: s?.phone || process.env.LEAD_ALERT_PHONE || null,
    email: s?.email || process.env.LEAD_ALERT_EMAIL || null,
  };
}

function textBody(a: LeadAlert): string {
  return [
    "New Lead Received",
    `Lead ID: ${a.leadId}`,
    `Customer: ${a.customerName}`,
    `Mobile: ${a.customerPhone}`,
    `Project: ${a.project}`,
    `Inventory: ${a.inventory}`,
    `Source: ${a.source}`,
    `Visit: ${a.visitDate} at ${a.visitTime}`,
    `Notes: ${a.notes || "—"}`,
  ].join("\n");
}

const esc = (v: string) => v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export async function sendLeadAlert(a: LeadAlert, opts: { force?: boolean } = {}): Promise<LeadAlertResult> {
  const out: LeadAlertResult = { configured: false, whatsapp: false, sms: false, email: false };
  try {
    const t = await alertTargets();
    if (!t.enabled && !opts.force) return out;
    out.configured = Boolean(t.phone || t.email);
    const params = [a.customerName, a.customerPhone, a.project, a.inventory, a.source, a.visitDate, a.visitTime, a.notes || "—"];

    if (t.phone) {
      if (isAiSensyEnabled() && process.env.AISENSY_CAMPAIGN_NEW_LEAD_ALERT) {
        out.whatsapp = await sendAiSensyCampaign(t.phone, process.env.AISENSY_CAMPAIGN_NEW_LEAD_ALERT, "Truvi Admin", params);
      } else if (isWhatsAppEnabled()) {
        const tpl = process.env.WHATSAPP_TPL_NEW_LEAD_ALERT;
        out.whatsapp = tpl ? await sendWhatsAppTemplate(t.phone, tpl, params) : await sendWhatsAppText(t.phone, textBody(a));
      }
      out.sms = await sendSms(t.phone, textBody(a));
    }

    if (t.email && process.env.SMTP_HOST) {
      const rows = textBody(a)
        .split("\n")
        .slice(1)
        .map((line) => {
          const i = line.indexOf(":");
          return `<tr><td style="padding:4px 12px 4px 0;color:#64748b">${esc(line.slice(0, i))}</td><td style="padding:4px 0"><b>${esc(line.slice(i + 1).trim())}</b></td></tr>`;
        })
        .join("");
      out.email = await sendEmail(
        t.email,
        `New Lead Received — ${a.project}`,
        `<h2 style="margin:0 0 12px">New Lead Received</h2><table>${rows}</table>`,
      ).catch(() => false);
    }
  } catch (err) {
    console.warn("[lead-alert] failed:", err instanceof Error ? err.message : err);
  }
  return out;
}
