/**
 * Provider-agnostic SMS sender.
 *
 * Real delivery is wired for two providers and picked up automatically from
 * env — no code change needed when you add credentials:
 *
 *   Twilio:  TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER
 *   MSG91:   MSG91_AUTH_KEY, MSG91_SENDER_ID  (India-focused, cheaper for +91)
 *
 * With neither configured it falls back to logging the message to the server
 * console (dev mode), so the whole OTP flow works locally out of the box and
 * starts sending for real the instant a provider's keys are present.
 *
 * Uses global fetch (Node 20+) so no SDK/dependency is required.
 */

type SmsProvider = "twilio" | "msg91" | "console";

function activeProvider(): SmsProvider {
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER) {
    return "twilio";
  }
  if (process.env.MSG91_AUTH_KEY) {
    return "msg91";
  }
  return "console";
}

/** Normalise a bare 10-digit Indian mobile to E.164 (+91…). Leaves already-prefixed numbers alone. */
function toE164(phone: string): string {
  const trimmed = phone.trim();
  if (trimmed.startsWith("+")) return trimmed;
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  return `+${digits}`;
}

async function sendViaTwilio(to: string, body: string): Promise<void> {
  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const token = process.env.TWILIO_AUTH_TOKEN!;
  const from = process.env.TWILIO_FROM_NUMBER!;
  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
  const auth = Buffer.from(`${sid}:${token}`).toString("base64");

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: toE164(to), From: from, Body: body }).toString(),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Twilio SMS failed (${res.status}): ${detail}`);
  }
}

async function sendViaMsg91(to: string, body: string): Promise<void> {
  const authKey = process.env.MSG91_AUTH_KEY!;
  const sender = process.env.MSG91_SENDER_ID || "TRUVIA";
  // MSG91 wants the number with country code and no '+'.
  const mobile = toE164(to).replace("+", "");

  const res = await fetch("https://api.msg91.com/api/v2/sendsms", {
    method: "POST",
    headers: { "Content-Type": "application/json", authkey: authKey },
    body: JSON.stringify({
      sender,
      route: "4", // transactional
      country: "91",
      sms: [{ message: body, to: [mobile] }],
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`MSG91 SMS failed (${res.status}): ${detail}`);
  }
}

/**
 * Send an SMS. Resolves on success; rejects if a configured provider errors.
 * In console mode it always resolves after logging.
 */
export async function sendSms(to: string, body: string): Promise<void> {
  const provider = activeProvider();
  switch (provider) {
    case "twilio":
      await sendViaTwilio(to, body);
      return;
    case "msg91":
      await sendViaMsg91(to, body);
      return;
    default:
      console.log(`[dev sms] To: ${toE164(to)} | ${body}`);
      return;
  }
}

/** True when a real SMS gateway is configured (used to shape API responses/logging). */
export function isSmsConfigured(): boolean {
  return activeProvider() !== "console";
}
