import crypto from "crypto";
import Razorpay from "razorpay";
import { z } from "zod";
import { getEnv, isRazorpayConfigured } from "../config/env";

let razorpay: Razorpay | null = null;

function client(): Razorpay {
  if (!isRazorpayConfigured()) throw new Error("Razorpay payments are not configured");
  if (!razorpay) {
    const env = getEnv();
    razorpay = new Razorpay({ key_id: env.razorpayKeyId, key_secret: env.razorpayKeySecret });
  }
  return razorpay;
}

function assertRouteAvailable() {
  const env = getEnv();
  if (!env.habitatPaymentsEnabled || !env.razorpayRouteEnabled || !isRazorpayConfigured()) {
    throw new Error("Habitat payment processing is not enabled for this environment");
  }
}

const objectResponse = z.object({
  id: z.string(),
  status: z.string().optional(),
  product_config: z.object({
    activation_status: z.string().optional(),
  }).optional(),
});

const transferResponse = z.object({
  items: z.array(z.object({ id: z.string(), status: z.string().optional() }).passthrough()).optional(),
  id: z.string().optional(),
  status: z.string().optional(),
});

async function routeRequest(path: string, method: "GET" | "POST", body?: unknown, idempotencyKey?: string): Promise<unknown> {
  assertRouteAvailable();
  const env = getEnv();
  const headers: Record<string, string> = {
    Authorization: `Basic ${Buffer.from(`${env.razorpayKeyId}:${env.razorpayKeySecret}`).toString("base64")}`,
    Accept: "application/json",
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;

  const response = await fetch(`https://api.razorpay.com${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`Razorpay Route request failed (${response.status})`);
  }
  return payload;
}

export function habitatPaymentsEnabled(): boolean {
  const env = getEnv();
  return env.habitatPaymentsEnabled && env.razorpayRouteEnabled && isRazorpayConfigured();
}

export async function createHabitatOrder(amountPaise: number, receipt: string, notes: Record<string, string>) {
  assertRouteAvailable();
  return client().orders.create({
    amount: amountPaise,
    currency: "INR",
    receipt,
    notes,
  });
}

export async function verifyHabitatPayment(
  orderId: string,
  paymentId: string,
  signature: string,
  expectedAmountPaise: number,
): Promise<boolean> {
  assertRouteAvailable();
  const env = getEnv();
  const expectedSignature = crypto
    .createHmac("sha256", env.razorpayKeySecret)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");
  const provided = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);
  if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) return false;

  const payload = await routeRequest(`/v1/payments/${encodeURIComponent(paymentId)}`, "GET");
  const payment = z.object({
    order_id: z.string(),
    amount: z.number(),
    currency: z.string(),
    status: z.string(),
  }).safeParse(payload);
  return payment.success &&
    payment.data.order_id === orderId &&
    payment.data.amount === expectedAmountPaise &&
    payment.data.currency === "INR" &&
    payment.data.status === "captured";
}

export function verifyHabitatWebhook(rawBody: Buffer, signature: string): boolean {
  const secret = getEnv().razorpayWebhookSecret;
  if (!secret || !signature) return false;
  const expected = Buffer.from(crypto.createHmac("sha256", secret).update(rawBody).digest("hex"));
  const provided = Buffer.from(signature);
  return expected.length === provided.length && crypto.timingSafeEqual(expected, provided);
}

export async function createHabitatLinkedAccount(input: {
  providerId: string;
  businessName: string;
  businessType: "individual" | "proprietorship" | "partnership" | "private_limited" | "llp";
  contactName: string;
  email: string;
  phone: string;
  pan: string;
  gst?: string;
  bankAccountNumber: string;
  ifsc: string;
  beneficiaryName: string;
}): Promise<{ accountId: string; accountStatus: string; activationStatus: string | null }> {
  const payload = await routeRequest("/v2/accounts", "POST", {
    type: "route",
    tnc_accepted: true,
    reference_id: `habitat_${input.providerId}`,
    legal_business_name: input.businessName,
    business_type: input.businessType,
    email: input.email,
    phone: input.phone,
    contact_name: input.contactName,
    legal_info: { pan: input.pan, ...(input.gst ? { gst: input.gst } : {}) },
    settlement_accounts: [{
      method: "bank_account",
      bank_account: {
        account_number: input.bankAccountNumber,
        beneficiary_name: input.beneficiaryName,
        code_type: "ifsc",
        code: input.ifsc,
        currency: "INR",
        is_default: true,
      },
    }],
  }, `habitat-provider-${input.providerId}`);
  const result = objectResponse.safeParse(payload);
  if (!result.success) throw new Error("Razorpay returned an invalid linked-account response");
  return {
    accountId: result.data.id,
    accountStatus: result.data.status ?? "CREATED",
    activationStatus: result.data.product_config?.activation_status ?? null,
  };
}

export async function createHabitatRefund(
  paymentId: string,
  amountPaise: number,
  reason: string,
  idempotencyKey: string,
): Promise<{ refundId: string; status: string }> {
  const payload = await routeRequest(
    `/v1/payments/${encodeURIComponent(paymentId)}/refund`,
    "POST",
    { amount: amountPaise, notes: { reason, source: "truvi_habitat" } },
    idempotencyKey,
  );
  const result = z.object({ id: z.string(), status: z.string() }).safeParse(payload);
  if (!result.success) throw new Error("Razorpay returned an invalid refund response");
  return { refundId: result.data.id, status: result.data.status };
}

export async function createHabitatTransfer(
  paymentId: string,
  accountId: string,
  amountPaise: number,
  bookingId: string,
  idempotencyKey: string,
): Promise<{ transferId: string; status: string }> {
  const payload = await routeRequest(
    `/v1/payments/${encodeURIComponent(paymentId)}/transfers`,
    "POST",
    {
      transfers: [{
        account: accountId,
        amount: amountPaise,
        currency: "INR",
        notes: { habitat_booking_id: bookingId },
        linked_account_notes: ["habitat_booking_id"],
      }],
    },
    idempotencyKey,
  );
  const result = transferResponse.safeParse(payload);
  const transfer = result.success ? result.data.items?.[0] ?? result.data : null;
  if (!transfer?.id) throw new Error("Razorpay returned an invalid transfer response");
  return { transferId: transfer.id, status: transfer.status ?? "pending" };
}

export async function fetchHabitatTransfer(transferId: string): Promise<{ transferId: string; status: string }> {
  const payload = await routeRequest(`/v1/transfers/${encodeURIComponent(transferId)}`, "GET");
  const result = z.object({ id: z.string(), status: z.string() }).safeParse(payload);
  if (!result.success) throw new Error("Razorpay returned an invalid transfer status response");
  return { transferId: result.data.id, status: result.data.status };
}
