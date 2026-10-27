import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyResendWebhookSignature } from "./resendWebhookSecurity";

function sign(rawBody: Buffer, id: string, timestamp: string, encodedSecret: string): string {
  const key = Buffer.from(encodedSecret.replace(/^whsec_/, ""), "base64");
  const signature = createHmac("sha256", key)
    .update(`${id}.${timestamp}.`)
    .update(rawBody)
    .digest("base64");
  return `v1,${signature}`;
}

describe("Resend webhook signature verification", () => {
  const secret = `whsec_${Buffer.from("unit-test-only-webhook-secret").toString("base64")}`;
  const now = 1_800_000_000;
  const rawBody = Buffer.from(JSON.stringify({ type: "email.delivered", data: { email_id: "email_test_123" } }));
  const id = "msg_test_webhook";
  const timestamp = String(now);

  it("accepts a valid signature over the exact raw body", () => {
    expect(verifyResendWebhookSignature(rawBody, {
      id,
      timestamp,
      signature: sign(rawBody, id, timestamp, secret),
    }, secret, now)).toBe(true);
  });

  it("rejects a body changed after signing", () => {
    const signature = sign(rawBody, id, timestamp, secret);
    expect(verifyResendWebhookSignature(Buffer.from(rawBody.toString() + " "), {
      id,
      timestamp,
      signature,
    }, secret, now)).toBe(false);
  });

  it("rejects stale webhook timestamps", () => {
    const staleTimestamp = String(now - 301);
    expect(verifyResendWebhookSignature(rawBody, {
      id,
      timestamp: staleTimestamp,
      signature: sign(rawBody, id, staleTimestamp, secret),
    }, secret, now)).toBe(false);
  });

  it("rejects missing headers and invalid secrets", () => {
    expect(verifyResendWebhookSignature(rawBody, {}, secret, now)).toBe(false);
    expect(verifyResendWebhookSignature(rawBody, {
      id,
      timestamp,
      signature: sign(rawBody, id, timestamp, secret),
    }, "not-a-valid-webhook-secret", now)).toBe(false);
  });

  it("accepts one matching v1 signature among multiple signatures", () => {
    const valid = sign(rawBody, id, timestamp, secret).slice("v1,".length);
    expect(verifyResendWebhookSignature(rawBody, {
      id,
      timestamp,
      signature: `v1,${Buffer.from("wrong").toString("base64")} v1,${valid}`,
    }, secret, now)).toBe(true);
  });
});
