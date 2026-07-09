/**
 * SMS delivery for phone OTPs. Uses Twilio's REST API directly (no SDK
 * dependency — just fetch), and degrades to logging when Twilio isn't
 * configured, so the OTP flow never hard-fails on missing SMS credentials —
 * same graceful-degrade philosophy as the email service.
 *
 * Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM (a Twilio number
 * in E.164, e.g. +14155552671) to send real SMS.
 */
const sid = process.env.TWILIO_ACCOUNT_SID;
const token = process.env.TWILIO_AUTH_TOKEN;
const from = process.env.TWILIO_FROM;
const hasTwilio = Boolean(sid && token && from);

/** Normalize to E.164. Bare 10-digit numbers are assumed Indian (+91). */
function toE164(phone: string): string {
  const p = phone.trim();
  if (p.startsWith("+")) return p;
  const digits = p.replace(/\D/g, "");
  if (digits.length === 10) return `+91${digits}`;
  return `+${digits}`;
}

export async function sendSms(to: string, body: string): Promise<void> {
  if (!hasTwilio) {
    console.log(`[dev sms] To: ${to} | ${body}`);
    return;
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
  const params = new URLSearchParams({ To: toE164(to), From: from!, Body: body });

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Twilio SMS failed (${res.status}): ${text}`);
  }
}
