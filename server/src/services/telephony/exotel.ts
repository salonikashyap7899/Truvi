import type { CallStatus } from "../../db/schema";
import { getEnv } from "../../config/env";
import type { ConnectParams, ConnectResult, TelephonyProvider, WebhookUpdate } from "./index";

/** Map an Exotel call status to our internal CallStatus. */
function mapStatus(raw?: string): CallStatus {
  switch (String(raw || "").toLowerCase()) {
    case "queued": return "INITIATED";
    case "ringing": return "RINGING";
    case "in-progress": return "IN_PROGRESS";
    case "connected": return "CONNECTED";
    case "completed": return "COMPLETED";
    case "busy": return "BUSY";
    case "no-answer": return "NO_ANSWER";
    case "canceled":
    case "cancelled": return "CANCELED";
    case "failed": return "FAILED";
    default: return "INITIATED";
  }
}

function parseDate(v?: string): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Format a phone / ExoPhone the way Exotel's Connect API expects: digits only,
 * NO leading "+", and Indian numbers as a 0-prefixed 11-digit national number.
 * Exotel rejects a leading "+" and bare 10-digit numbers with
 * "Invalid 'From'/'To' specified", so we canonicalise every number here.
 *
 * Examples — all of "+91 98765 43210", "919876543210", "9876543210" and
 * "098765-43210" become "09876543210"; the ExoPhone "095-138-86363" stays
 * "09513886363".
 */
function normalizeNumber(v: string): string {
  let d = (v || "").replace(/\D/g, ""); // strip +, spaces, dashes, brackets
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2); // 91XXXXXXXXXX -> national
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);  // 0XXXXXXXXXX  -> national
  if (d.length === 10) return "0" + d;                        // 10-digit mobile -> 0XXXXXXXXXX
  return d; // some other shape (short code / landline) — send digits as-is
}

/**
 * Exotel adapter — "Connect two numbers" API. Exotel first calls `From` (the
 * Channel Partner), and on answer bridges to `To` (the Developer), both seeing
 * only the `CallerId` ExoPhone (virtual number). Recording + status callbacks
 * are requested inline. Real numbers are sent to Exotel over TLS and never
 * returned to our own clients.
 */
export const exotelProvider: TelephonyProvider = {
  name: "exotel",

  isConfigured() {
    const e = getEnv().telephony.exotel;
    return !!(e.sid && e.apiKey && e.apiToken && e.callerId);
  },

  async connect(params: ConnectParams): Promise<ConnectResult> {
    const e = getEnv().telephony.exotel;
    const auth = Buffer.from(`${e.apiKey}:${e.apiToken}`).toString("base64");
    const url = `https://${e.subdomain}/v1/Accounts/${e.sid}/Calls/connect.json`;

    const form = new URLSearchParams();
    form.set("From", normalizeNumber(params.firstNumber));
    form.set("To", normalizeNumber(params.secondNumber));
    form.set("CallerId", normalizeNumber(params.callerId));
    form.set("CallType", "trans");
    if (params.record) form.set("Record", "true");
    form.set("StatusCallback", params.statusCallbackUrl);
    form.set("StatusCallbackContentType", "application/json");

    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Exotel connect failed (${res.status}): ${text.slice(0, 200)}`);
    }
    const data: any = await res.json().catch(() => ({}));
    const call = data?.Call ?? data?.call ?? {};
    return {
      providerCallId: call.Sid ?? call.sid ?? null,
      status: mapStatus(call.Status ?? call.status),
      virtualNumber: params.callerId,
    };
  },

  parseWebhook(body: Record<string, any>): WebhookUpdate {
    // Exotel posts fields like CallSid, Status, DialCallStatus, RecordingUrl,
    // ConversationDuration/Duration, StartTime/EndTime (naming varies by flow).
    const providerCallId = body.CallSid ?? body.callSid ?? body.Sid ?? null;
    const dial = String(body.DialCallStatus ?? "").toLowerCase();
    const raw = body.Status ?? body.CallStatus ?? body.status;
    let status = mapStatus(raw);
    // If the primary leg completed but the bridge never connected, surface it
    // as MISSED/NO_ANSWER so admins can tell real conversations apart.
    if (status === "COMPLETED" && (dial === "no-answer" || dial === "busy" || dial === "failed")) {
      status = dial === "busy" ? "BUSY" : dial === "failed" ? "FAILED" : "NO_ANSWER";
    }
    const durRaw = body.ConversationDuration ?? body.Duration ?? body.DialCallDuration;
    const durationSec = durRaw != null && durRaw !== "" ? Number(durRaw) : null;
    return {
      providerCallId,
      status,
      durationSec: Number.isFinite(durationSec as number) ? (durationSec as number) : null,
      recordingUrl: body.RecordingUrl ?? body.recordingUrl ?? null,
      recordingId: body.RecordingSid ?? null,
      startedAt: parseDate(body.StartTime ?? body.DateCreated),
      endedAt: parseDate(body.EndTime ?? body.DateUpdated),
    };
  },
};
