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

export async function sendOtpEmail(to: string, otp: string): Promise<void> {
  await sendEmail(
    to,
    "Your Truvi verification code",
    `<p>Your Truvi verification code is:</p>
     <p style="font-size:28px;font-weight:bold;letter-spacing:4px">${otp}</p>
     <p>This code expires in 10 minutes. If you didn't request it, you can ignore this email.</p>`
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
