import { describe, expect, it } from "vitest";
import { matchesCapturedPayment, type GatewayOrderSnapshot, type GatewayPaymentSnapshot } from "./paymentService";

const order: GatewayOrderSnapshot = {
  id: "order_test_123",
  amount: 29900,
  currency: "INR",
  status: "paid",
  receipt: "investment_123",
  notes: { userId: "user_123", product: "CP_PREMIUM" },
};

const payment: GatewayPaymentSnapshot = {
  id: "pay_test_456",
  orderId: "order_test_123",
  amount: 29900,
  currency: "INR",
  status: "captured",
};

const expected = {
  orderId: "order_test_123",
  paymentId: "pay_test_456",
  amountPaise: 29900,
  receipt: "investment_123",
  notes: { userId: "user_123", product: "CP_PREMIUM" },
};

describe("matchesCapturedPayment", () => {
  it("accepts a captured payment that exactly matches the server-created INR order", () => {
    expect(matchesCapturedPayment(order, payment, expected)).toBe(true);
  });

  it("rejects missing order or payment records", () => {
    expect(matchesCapturedPayment(null, payment, expected)).toBe(false);
    expect(matchesCapturedPayment(order, null, expected)).toBe(false);
  });

  it.each([
    ["unpaid order", { ...order, status: "created" }],
    ["wrong order ID", { ...order, id: "order_other" }],
    ["wrong amount", { ...order, amount: 1 }],
    ["wrong currency", { ...order, currency: "USD" }],
    ["wrong receipt", { ...order, receipt: "other_receipt" }],
    ["wrong user note", { ...order, notes: { ...order.notes, userId: "other_user" } }],
    ["wrong product note", { ...order, notes: { ...order.notes, product: "OTHER_PRODUCT" } }],
  ])("rejects an order with %s", (_label, invalidOrder) => {
    expect(matchesCapturedPayment(invalidOrder as GatewayOrderSnapshot, payment, expected)).toBe(false);
  });

  it.each([
    ["uncaptured payment", { ...payment, status: "authorized" }],
    ["wrong payment ID", { ...payment, id: "pay_other" }],
    ["payment linked to another order", { ...payment, orderId: "order_other" }],
    ["wrong payment amount", { ...payment, amount: 100 }],
    ["wrong payment currency", { ...payment, currency: "USD" }],
  ])("rejects a payment with %s", (_label, invalidPayment) => {
    expect(matchesCapturedPayment(order, invalidPayment as GatewayPaymentSnapshot, expected)).toBe(false);
  });

  it("only checks optional receipt or notes when the server supplies expectations", () => {
    expect(matchesCapturedPayment(order, payment, {
      orderId: expected.orderId,
      paymentId: expected.paymentId,
      amountPaise: expected.amountPaise,
    })).toBe(true);
  });
});
