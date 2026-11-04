import "dotenv/config";
import { sendEmail, isEmailTransportConfigured } from "../services/emailService";

async function main() {
  const recipient = process.env.EMAIL_TEST_TO?.trim();
  if (!recipient) {
    throw new Error("Set EMAIL_TEST_TO to a mailbox you control. This script sends exactly one test email.");
  }
  if (!isEmailTransportConfigured()) {
    throw new Error("No SMTP or Resend provider is configured. Email was not sent.");
  }

  const sent = await sendEmail(
    recipient,
    "Truvi Ventures — email delivery test",
    "<div style=\"font-family:Arial,sans-serif;padding:24px\"><h2>Truvi Ventures</h2><p>This is a test of Truvi's transactional email provider configuration.</p><p>No account or customer data is included.</p></div>",
  );
  if (!sent) throw new Error("No provider accepted the test email.");
  console.log("Email provider accepted the test message. Check the recipient inbox and spam folder; provider acceptance does not prove final mailbox delivery.");
}

main().catch((error) => {
  console.error("Email smoke test failed:", error instanceof Error ? error.message : "Unknown error");
  process.exitCode = 1;
});
