import { createHash } from "node:crypto";
import nodemailer from "nodemailer";
import twilio from "twilio";

const hasSmtpConfig = !!process.env.SMTP_HOST;
const resendApiKey = process.env.RESEND_API_KEY?.trim() || "";

const transporter = hasSmtpConfig
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      // Port 465 uses implicit TLS; 587/others use STARTTLS.
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
      // Keep invitation/OTP requests from hanging indefinitely on an unresponsive SMTP host.
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    })
  : null;

if (!hasSmtpConfig && !resendApiKey) {
  console.warn(
    "[email] No email provider is configured — transactional emails will NOT be delivered. " +
      "Configure SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASSWORD or RESEND_API_KEY (and SMTP_FROM for the sender).",
  );
}

// All outbound mail is sent as Truvi Ventures. Override the display/address via
// SMTP_FROM (e.g. when a dedicated domain sender is configured); otherwise it
// defaults to the Truvi Ventures Gmail identity.
export const MAIL_FROM = process.env.SMTP_FROM || "Truvi Ventures <truviventures@gmail.com>";

/** Whether the current process has a usable SMTP transport configured. */
export function isEmailTransportConfigured(): boolean {
  return Boolean(resendApiKey || transporter !== null);
}

/**
 * Send an email. Returns `true` only when it was actually dispatched via SMTP.
 * When SMTP isn't configured it emits a non-sensitive warning and returns
 * `false`, so callers can honestly tell the user that email wasn't delivered.
 * OTPs, recipients and message subjects are never written to logs. Throws when
 * SMTP is configured but delivery fails.
 */
export type EmailDispatchResult =
  | { status: "UNCONFIGURED"; messageId: null }
  | { status: "SENT_TO_PROVIDER"; messageId: string | null };

/**
 * Generic SMTP confirms provider acceptance, not final mailbox delivery.
 * Provider-specific delivery events must set the durable record to DELIVERED.
 */
export async function sendEmailWithStatus(
  to: string,
  subject: string,
  html: string,
  from: string = MAIL_FROM,
  options?: { idempotencyKey?: string },
): Promise<EmailDispatchResult> {
  // Resend is optional. When its API key is present, use its signed delivery
  // webhook support so delivery can be confirmed; never fall back to SMTP after
  // a Resend API failure because that could send duplicate messages.
  if (resendApiKey) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
        ...(options?.idempotencyKey ? {
          // Derive a stable key from the event identity and exact payload:
          // repeated retries of the same message are deduped by Resend, while a
          // materially changed message gets a new key instead of a 409 mismatch.
          "Idempotency-Key": `truvi-${createHash("sha256")
            .update([options.idempotencyKey, from, to, subject, html].join("\\0"))
            .digest("hex")}`,
        } : {}),
      },
      body: JSON.stringify({ from, to: [to], subject, html }),
      signal: AbortSignal.timeout(15_000),
    }).catch(() => {
      throw new Error("RESEND_REQUEST_FAILED");
    });
    if (!response.ok) {
      // Keep provider response bodies out of logs/errors; they can contain
      // recipient/provider diagnostics and aren't needed for retry decisions.
      throw new Error(`RESEND_REJECTED_${response.status}`);
    }
    const payload = await response.json().catch(() => null) as { id?: unknown } | null;
    if (!payload || typeof payload.id !== "string" || !payload.id.trim()) {
      throw new Error("RESEND_MESSAGE_ID_MISSING");
    }
    return { status: "SENT_TO_PROVIDER", messageId: payload.id };
  }

  if (!transporter) {
    console.warn("[email] Not delivered because no email provider is configured.");
    return { status: "UNCONFIGURED", messageId: null };
  }
  const info = await transporter.sendMail({ from, to, subject, html });
  const acceptedCount = Array.isArray(info.accepted) ? info.accepted.length : 0;
  if (acceptedCount === 0) throw new Error("SMTP did not accept the recipient");
  return { status: "SENT_TO_PROVIDER", messageId: typeof info.messageId === "string" ? info.messageId : null };
}

export async function sendEmail(to: string, subject: string, html: string, from: string = MAIL_FROM): Promise<boolean> {
  const result = await sendEmailWithStatus(to, subject, html, from);
  return result.status === "SENT_TO_PROVIDER";
}

export async function sendApprovalEmail(to: string, name: string, approved: boolean): Promise<void> {
  await sendEmail(
    to,
    approved ? "Your Truvi account is approved" : "Update on your Truvi application",
    `<p>Hi ${name},</p><p>${
      approved
        ? "Your Truvi account has been approved. You now have full access to the platform."
        : "Your Truvi account application was not approved. Contact support for details."
    }</p>`
  );
}

export async function sendCommissionEmail(to: string, name: string, amount: number, clientName: string): Promise<void> {
  await sendEmail(
    to,
    "Commission generated on Truvi",
    `<p>Hi ${name},</p><p>Your commission for <strong>${clientName}</strong> has been generated: ₹${amount.toLocaleString(
      "en-IN"
    )}. 100% of this is yours — Truvi never deducts from CP earnings.</p>`
  );
}

export async function sendOtpEmail(to: string, otp: string): Promise<boolean> {
  return sendEmail(
    to,
    `${otp} is your Truvi verification code`,
    `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
      <h2 style="color:#1e293b;margin-bottom:8px">Truvi Verification</h2>
      <p style="color:#475569">Use the code below to verify your email address. It expires in 10 minutes.</p>
      <div style="margin:24px 0;padding:16px;background:#f1f5f9;border-radius:12px;text-align:center">
        <span style="font-size:32px;font-weight:700;letter-spacing:6px;color:#0f172a">${otp}</span>
      </div>
      <p style="color:#94a3b8;font-size:13px">If you didn't request this code, you can safely ignore this email.</p>
    </div>`
  );
}

export async function sendPasswordResetEmail(to: string, otp: string): Promise<void> {
  await sendEmail(
    to,
    `${otp} is your Truvi password reset code`,
    `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
      <h2 style="color:#1e293b;margin-bottom:8px">Reset your Truvi password</h2>
      <p style="color:#475569">Use the code below to set a new password. It expires in 10 minutes.</p>
      <div style="margin:24px 0;padding:16px;background:#f1f5f9;border-radius:12px;text-align:center">
        <span style="font-size:32px;font-weight:700;letter-spacing:6px;color:#0f172a">${otp}</span>
      </div>
      <p style="color:#94a3b8;font-size:13px">If you didn't request a password reset, you can safely ignore this email — your password won't change.</p>
    </div>`
  );
}

// Twilio SMS client — only created when credentials are present, so the app
// still boots (and email OTP still works) if SMS isn't configured.
const hasTwilioConfig = !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM);
const twilioClient = hasTwilioConfig
  ? twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!)
  : null;

/**
 * Normalize an Indian mobile number to E.164 (+91XXXXXXXXXX). Twilio requires
 * E.164; the app stores plain 10-digit numbers.
 */
function toE164(phone: string): string {
  const trimmed = (phone || "").trim();
  // Already international (has its own country code) → keep it, just strip any
  // spaces/dashes so Twilio gets a clean +<digits> number.
  if (trimmed.startsWith("+")) return "+" + trimmed.slice(1).replace(/\D/g, "");
  const digits = trimmed.replace(/\D/g, "");
  // A stored number that already carries the 91 country code but no "+".
  if (digits.length > 10 && digits.startsWith("91")) return `+${digits}`;
  // Bare Indian 10-digit → default to +91 (unchanged behaviour).
  return `+91${digits.slice(-10)}`;
}

/**
 * Send a phone OTP via Twilio SMS.
 *  - Returns `true` when the SMS was accepted by Twilio.
 *  - Returns `false` when SMS isn't configured; OTPs and phone numbers are
 *    never logged.
 *  - Throws when SMS *is* configured but the send fails, so the caller can
 *    surface a real error to the user instead of silently succeeding.
 */
export async function sendPhoneOtpViaSms(phone: string, otp: string): Promise<boolean> {
  if (!twilioClient) {
    // OTPs and phone numbers must never be written to process logs.
    console.warn("[sms] OTP not delivered because Twilio is not configured.");
    return false;
  }
  await twilioClient.messages.create({
    body: `Your Truvi verification code is ${otp}. It expires in 10 minutes.`,
    from: process.env.TWILIO_FROM!,
    to: toE164(phone),
  });
  return true;
}

/**
 * Send a plain SMS through the same Twilio account (used for operational
 * alerts such as the owner's new-lead alert). Returns false when SMS isn't
 * configured or the send fails — never throws.
 */
export async function sendSms(phone: string, body: string): Promise<boolean> {
  if (!twilioClient || !phone) return false;
  try {
    await twilioClient.messages.create({ body, from: process.env.TWILIO_FROM!, to: toE164(phone) });
    return true;
  } catch (err) {
    console.warn("[sms] send failed:", err instanceof Error ? err.message : err);
    return false;
  }
}
