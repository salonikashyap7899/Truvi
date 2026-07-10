import nodemailer from "nodemailer";

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

export async function sendPhoneOtpViaSms(phone: string, otp: string): Promise<boolean> {
  // SMS integration placeholder — returns false when no SMS service is configured.
  // To enable: set SMS_PROVIDER=twilio, TWILIO_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM in .env
  // and implement the Twilio API call here.
  const hasSmsProv = !!process.env.SMS_PROVIDER;
  if (!hasSmsProv) {
    console.log(`[OTP] SMS not configured. Phone OTP for ${phone}: ${otp}`);
    return false;
  }
  // Future: integrate Twilio / AWS SNS / MSG91 here
  return false;
}
