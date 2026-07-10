import nodemailer from "nodemailer";
import twilio from "twilio";

const hasSmtpConfig = !!process.env.SMTP_HOST;

const transporter = hasSmtpConfig
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
    })
  : nodemailer.createTransport({ jsonTransport: true }); // dev fallback: logs instead of sending

export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const info = await transporter.sendMail({
    from: process.env.SMTP_FROM || "Truvi <no-reply@truvi.app>",
    to,
    subject,
    html,
  });

  if (!hasSmtpConfig) {
    console.log(`[dev email] To: ${to} | Subject: ${subject}`);
  }
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

export async function sendOtpEmail(to: string, otp: string): Promise<void> {
  await sendEmail(
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
  const trimmed = phone.trim();
  if (trimmed.startsWith("+")) return trimmed;
  const digits = trimmed.replace(/\D/g, "");
  return `+91${digits.slice(-10)}`;
}

/**
 * Send a phone OTP via Twilio SMS.
 *  - Returns `true` when the SMS was accepted by Twilio.
 *  - Returns `false` (and logs the OTP) when SMS isn't configured, so local/dev
 *    still works without credentials.
 *  - Throws when SMS *is* configured but the send fails, so the caller can
 *    surface a real error to the user instead of silently succeeding.
 */
export async function sendPhoneOtpViaSms(phone: string, otp: string): Promise<boolean> {
  if (!twilioClient) {
    console.log(`[OTP] SMS not configured. Phone OTP for ${phone}: ${otp}`);
    return false;
  }
  await twilioClient.messages.create({
    body: `Your Truvi verification code is ${otp}. It expires in 10 minutes.`,
    from: process.env.TWILIO_FROM!,
    to: toE164(phone),
  });
  return true;
}
