import crypto, { randomUUID } from "crypto";
import { Router, type RequestHandler } from "express";
import { and, desc, eq, gt, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../config/db";
import {
  habitatBookingStatusHistory,
  habitatBookings,
  habitatCommissionRules,
  habitatDisputes,
  habitatDeveloperAccess,
  habitatInvitations,
  habitatLedgerEntries,
  habitatPayments,
  habitatProviders,
  habitatProjectCategories,
  habitatQuotes,
  habitatRefunds,
  habitatSettings,
  habitatServiceCategories,
  habitatServices,
  habitatTransfers,
  projects,
  users,
  type HabitatBookingStatus,
  type HabitatPaymentStatus,
} from "../db/schema";
import { authenticate, AuthedRequest, requireRole } from "../middleware/auth";
import {
  assertHabitatJournalBalanced,
  calculateHabitatCancellation,
  calculateHabitatMoneySplit,
  isHabitatPayoutEligible,
  type HabitatLedgerLine,
} from "../services/habitat";
import {
  createHabitatLinkedAccount,
  createHabitatOrder,
  createHabitatRefund,
  createHabitatTransfer,
  habitatPaymentsEnabled,
  verifyHabitatPayment,
  verifyHabitatWebhook,
} from "../services/habitatPayments";

const router = Router();

function routeParam(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}

function responseError(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

async function processDueHabitatCompletions() {
  const due = await getDb().select({ id: habitatBookings._id })
    .from(habitatBookings)
    .where(and(
      eq(habitatBookings.status, "COMPLETION_SUBMITTED"),
      lte(habitatBookings.autoCompleteAt, new Date()),
    ))
    .limit(100);
  for (const booking of due) {
    await recognizeCompletedBooking(booking.id, null, "COMPLETION_SUBMITTED");
  }
}

function makeLedgerRows(
  bookingId: string,
  paymentId: string | null,
  operationKey: string,
  lines: HabitatLedgerLine[],
) {
  assertHabitatJournalBalanced(lines);
  const journalId = randomUUID();
  return lines.map((line, index) => ({
    journalId,
    bookingId,
    paymentId,
    accountCode: line.accountCode,
    direction: line.direction,
    amountPaise: line.amountPaise,
    idempotencyKey: `${operationKey}:${index}`,
    metadata: {},
  }));
}

function getObject(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : null;
}

function getNestedRecord(value: unknown, ...keys: string[]): Record<string, unknown> | null {
  let current: unknown = value;
  for (const key of keys) current = getObject(current)?.[key];
  return getObject(current);
}

function moneyRecognitionLines(amountPaise: number, commissionBps: number, taxBps: number): HabitatLedgerLine[] {
  const split = calculateHabitatMoneySplit(amountPaise, commissionBps, taxBps);
  const lines: HabitatLedgerLine[] = [
    { accountCode: "CUSTOMER_FUNDS", direction: "DEBIT", amountPaise },
    { accountCode: "PROVIDER_PAYABLE", direction: "CREDIT", amountPaise: split.providerPaise },
  ];
  if (split.commissionPaise > 0) {
    lines.push({ accountCode: "TRUVI_COMMISSION_REVENUE", direction: "CREDIT", amountPaise: split.commissionPaise });
  }
  if (split.commissionTaxPaise > 0) {
    lines.push({ accountCode: "TRUVI_COMMISSION_TAX_PAYABLE", direction: "CREDIT", amountPaise: split.commissionTaxPaise });
  }
  assertHabitatJournalBalanced(lines);
  return lines;
}

async function recordCapturedPayment(
  paymentRecordId: string,
  razorpayPaymentId: string,
  signature: string | null,
  actorUserId: string | null,
) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [payment] = await tx.select().from(habitatPayments).where(eq(habitatPayments._id, paymentRecordId)).limit(1);
    if (!payment) return { ok: false, reason: "Payment record not found" };
    if (payment.status === "PAID") {
      if (payment.razorpayPaymentId && payment.razorpayPaymentId !== razorpayPaymentId) {
        return { ok: false, reason: "A different Razorpay payment is already recorded for this order" };
      }
      return { ok: true, bookingId: payment.bookingId, alreadyPaid: true };
    }
    if (payment.status !== "CREATED" || !payment.razorpayOrderId) {
      return { ok: false, reason: "Payment is not awaiting capture" };
    }
    const [captured] = await tx
      .update(habitatPayments)
      .set({
        status: "PAID",
        razorpayPaymentId,
        razorpaySignature: signature,
        paidAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(habitatPayments._id, payment._id), eq(habitatPayments.status, "CREATED")))
      .returning();
    if (!captured) return { ok: false, reason: "Payment changed; refresh and retry" };

    const [booking] = await tx.select().from(habitatBookings).where(eq(habitatBookings._id, payment.bookingId)).limit(1);
    if (!booking) throw new Error("Habitat payment references a missing booking");
    const [updatedBooking] = booking.status === "PAYMENT_PENDING"
      ? await tx
          .update(habitatBookings)
          .set({ status: "PAID", payoutStatus: "ON_HOLD", updatedAt: new Date() })
          .where(and(eq(habitatBookings._id, booking._id), eq(habitatBookings.status, "PAYMENT_PENDING")))
          .returning()
      : [undefined];
    if (updatedBooking) {
      await tx.insert(habitatBookingStatusHistory).values({
        bookingId: booking._id,
        actorUserId,
        fromStatus: "PAYMENT_PENDING",
        toStatus: "PAID",
        reason: "Razorpay confirmed payment capture",
      });
    }
    await tx.insert(habitatLedgerEntries).values(makeLedgerRows(
      booking._id,
      payment._id,
      `habitat-payment-captured:${payment._id}`,
      [
        { accountCode: "GATEWAY_CLEARING", direction: "DEBIT", amountPaise: payment.amountPaise },
        { accountCode: "CUSTOMER_FUNDS", direction: "CREDIT", amountPaise: payment.amountPaise },
      ],
    )).onConflictDoNothing({ target: habitatLedgerEntries.idempotencyKey });
    return {
      ok: true,
      bookingId: booking._id,
      alreadyPaid: false,
      requiresRefund: booking.status !== "PAYMENT_PENDING",
    };
  });
}

async function recognizeCompletedBooking(bookingId: string, actorUserId: string | null, expectedStatus: HabitatBookingStatus) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [booking] = await tx
      .select()
      .from(habitatBookings)
      .where(and(eq(habitatBookings._id, bookingId), eq(habitatBookings.status, expectedStatus)))
      .limit(1);
    if (!booking || !booking.finalAmountPaise || booking.finalAmountPaise <= 0 ||
      booking.commissionRateBps === null || booking.commissionTaxRateBps === null) return null;
    const [payment] = await tx
      .select()
      .from(habitatPayments)
      .where(and(
        eq(habitatPayments.bookingId, bookingId),
        inArray(habitatPayments.status, ["PAID", "PARTIALLY_REFUNDED"]),
      ))
      .orderBy(desc(habitatPayments.createdAt))
      .limit(1);
    if (!payment) return null;

    const split = calculateHabitatMoneySplit(
      booking.finalAmountPaise,
      booking.commissionRateBps,
      booking.commissionTaxRateBps,
    );
    const now = new Date();
    const [updated] = await tx
      .update(habitatBookings)
      .set({
        status: "COMPLETED",
        completedAt: now,
        payoutEligibleAt: now,
        payoutStatus: "ON_HOLD",
        commissionAmountPaise: split.commissionPaise,
        commissionTaxPaise: split.commissionTaxPaise,
        providerPayoutPaise: split.providerPaise,
        updatedAt: now,
      })
      .where(and(eq(habitatBookings._id, bookingId), eq(habitatBookings.status, expectedStatus)))
      .returning();
    if (!updated) return null;
    await tx.insert(habitatBookingStatusHistory).values({
      bookingId,
      actorUserId,
      fromStatus: expectedStatus,
      toStatus: "COMPLETED",
      reason: actorUserId ? "Buyer confirmed service completion" : "Completion confirmed after the response window",
    });
    await tx.insert(habitatLedgerEntries).values(makeLedgerRows(
      bookingId,
      payment._id,
      `habitat-service-completed:${bookingId}`,
      moneyRecognitionLines(booking.finalAmountPaise, booking.commissionRateBps, booking.commissionTaxRateBps),
    )).onConflictDoNothing({ target: habitatLedgerEntries.idempotencyKey });
    return updated;
  });
}

async function recordRefundProcessed(refundId: string, razorpayRefundId: string) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [refund] = await tx.select().from(habitatRefunds).where(eq(habitatRefunds._id, refundId)).limit(1);
    if (!refund) return false;
    if (!["PENDING", "PROCESSED"].includes(refund.status)) return false;
    const [payment] = await tx.select().from(habitatPayments).where(eq(habitatPayments._id, refund.paymentId)).limit(1);
    if (!payment) throw new Error("Habitat refund references a missing payment");
    const [booking] = await tx.select().from(habitatBookings).where(eq(habitatBookings._id, payment.bookingId)).limit(1);
    if (!booking) throw new Error("Habitat refund references a missing booking");
    if (refund.status === "PENDING") {
      const [updatedRefund] = await tx
        .update(habitatRefunds)
        .set({ status: "PROCESSED", razorpayRefundId, updatedAt: new Date() })
        .where(and(eq(habitatRefunds._id, refundId), eq(habitatRefunds.status, "PENDING")))
        .returning();
      if (!updatedRefund) return false;
    }

    const totalRefundedRows = await tx
      .select({ total: sql<number>`coalesce(sum(${habitatRefunds.amountPaise}), 0)::int` })
      .from(habitatRefunds)
      .where(and(eq(habitatRefunds.paymentId, payment._id), eq(habitatRefunds.status, "PROCESSED")));
    const totalRefunded = totalRefundedRows[0]?.total ?? 0;
    const nextStatus: HabitatPaymentStatus = totalRefunded >= payment.amountPaise ? "REFUNDED" : "PARTIALLY_REFUNDED";
    await tx.update(habitatPayments).set({ status: nextStatus, updatedAt: new Date() }).where(eq(habitatPayments._id, payment._id));

    const refundLines: HabitatLedgerLine[] = [];
    const debitAmount = refund.amountPaise + refund.compensationPaise;
    refundLines.push({ accountCode: "CUSTOMER_FUNDS", direction: "DEBIT", amountPaise: debitAmount });
    refundLines.push({ accountCode: "GATEWAY_CLEARING", direction: "CREDIT", amountPaise: refund.amountPaise });
    if (refund.compensationPaise > 0) {
      refundLines.push({ accountCode: "PROVIDER_PAYABLE", direction: "CREDIT", amountPaise: refund.compensationPaise });
    }
    await tx.insert(habitatLedgerEntries).values(makeLedgerRows(
      booking._id,
      payment._id,
      `habitat-refund-processed:${refund._id}`,
      refundLines,
    )).onConflictDoNothing({ target: habitatLedgerEntries.idempotencyKey });

    const [dispute] = await tx
      .select()
      .from(habitatDisputes)
      .where(eq(habitatDisputes.bookingId, booking._id))
      .limit(1);
    if (dispute && ["RESOLVED_BUYER", "PARTIAL_REFUND"].includes(dispute.status)) {
      if (totalRefunded >= payment.amountPaise) {
        await tx
          .update(habitatBookings)
          .set({ status: "CANCELLED", payoutStatus: "REFUNDED", updatedAt: new Date() })
          .where(and(eq(habitatBookings._id, booking._id), eq(habitatBookings.status, "DISPUTED")));
      } else if (booking.status === "DISPUTED") {
        const remaining = payment.amountPaise - totalRefunded;
        const [commissionRule] = await tx
          .select()
          .from(habitatCommissionRules)
          .where(and(eq(habitatCommissionRules.categoryId, (await tx.select({ categoryId: habitatServices.categoryId }).from(habitatServices).where(eq(habitatServices._id, booking.serviceId)).limit(1))[0]?.categoryId ?? ""), isNull(habitatCommissionRules.projectId), isNull(habitatCommissionRules.providerId)))
          .limit(1);
        const rateBps = booking.commissionRateBps ?? commissionRule?.rateBps;
        if (rateBps === undefined || rateBps === null || booking.commissionTaxRateBps === null) {
          throw new Error("Commission snapshot is missing while resolving a partial dispute");
        }
        const split = calculateHabitatMoneySplit(remaining, rateBps, booking.commissionTaxRateBps);
        await tx.update(habitatBookings).set({
          finalAmountPaise: remaining,
          commissionRateBps: rateBps,
          commissionAmountPaise: split.commissionPaise,
          commissionTaxPaise: split.commissionTaxPaise,
          providerPayoutPaise: split.providerPaise,
          status: "COMPLETED",
          completedAt: new Date(),
          payoutEligibleAt: new Date(),
          payoutStatus: "ON_HOLD",
          updatedAt: new Date(),
        }).where(and(eq(habitatBookings._id, booking._id), eq(habitatBookings.status, "DISPUTED")));
        await tx.insert(habitatBookingStatusHistory).values({
          bookingId: booking._id,
          actorUserId: dispute.reviewedById,
          fromStatus: "DISPUTED",
          toStatus: "COMPLETED",
          reason: "Partial refund completed after dispute resolution",
        });
        await tx.insert(habitatLedgerEntries).values(makeLedgerRows(
          booking._id,
          payment._id,
          `habitat-dispute-partial-recognition:${booking._id}`,
          moneyRecognitionLines(remaining, rateBps, booking.commissionTaxRateBps),
        )).onConflictDoNothing({ target: habitatLedgerEntries.idempotencyKey });
      }
    }
    if (refund.compensationPaise > 0 && booking.status === "CANCELLED") {
      await tx.update(habitatBookings).set({
        payoutEligibleAt: new Date(),
        payoutStatus: "ON_HOLD",
        updatedAt: new Date(),
      }).where(eq(habitatBookings._id, booking._id));
    } else if (totalRefunded >= payment.amountPaise && booking.status === "CANCELLED") {
      await tx.update(habitatBookings).set({
        payoutStatus: "REFUNDED",
        updatedAt: new Date(),
      }).where(eq(habitatBookings._id, booking._id));
    }
    return true;
  });
}

async function startRefund(
  payment: typeof habitatPayments.$inferSelect,
  actorUserId: string,
  amountPaise: number,
  compensationPaise: number,
  reason: string,
  idempotencyKey: string,
) {
  const db = getDb();
  if (!payment.razorpayPaymentId) throw new Error("Captured Razorpay payment is missing; refund cannot be submitted");
  const [existing] = await db.select().from(habitatRefunds).where(eq(habitatRefunds.idempotencyKey, idempotencyKey)).limit(1);
  const [refund] = existing
    ? [existing]
    : await db.insert(habitatRefunds).values({
        paymentId: payment._id,
        amountPaise,
        compensationPaise,
        reason,
        idempotencyKey,
        initiatedById: actorUserId,
      }).returning();
  if (!refund) throw new Error("Could not create Habitat refund record");
  if (refund.status === "PROCESSED") {
    if (refund.razorpayRefundId) await recordRefundProcessed(refund._id, refund.razorpayRefundId);
    return refund;
  }

  try {
    const result = await createHabitatRefund(payment.razorpayPaymentId!, refund.amountPaise, refund.reason, `habitat-refund-${refund._id}`);
    await db.update(habitatRefunds)
      .set({ status: "PENDING", razorpayRefundId: result.refundId, updatedAt: new Date() })
      .where(eq(habitatRefunds._id, refund._id));
    if (result.status.toLowerCase() === "processed") await recordRefundProcessed(refund._id, result.refundId);
    return { ...refund, status: result.status.toUpperCase(), razorpayRefundId: result.refundId };
  } catch {
    await db.update(habitatRefunds)
      .set({ status: "FAILED", updatedAt: new Date() })
      .where(eq(habitatRefunds._id, refund._id));
    throw new Error("Refund request could not be submitted to Razorpay; it is recorded for admin retry");
  }
}

async function refundLateCapturedPayment(paymentRecordId: string, actorUserId: string) {
  const db = getDb();
  const [payment] = await db.select().from(habitatPayments)
    .where(eq(habitatPayments._id, paymentRecordId)).limit(1);
  if (!payment || !payment.razorpayPaymentId) {
    throw new Error("Late Habitat payment is missing its Razorpay payment reference");
  }
  return startRefund(
    payment,
    actorUserId,
    payment.amountPaise,
    0,
    "Late payment after booking cancellation",
    `late-payment-${payment._id}`,
  );
}

const quoteSchema = z.object({
  amountPaise: z.number().int().positive().safe(),
  workDescription: z.string().trim().min(10).max(2000),
  expiresInHours: z.number().int().min(1).max(72).default(24),
});

router.post("/provider/bookings/:bookingId/quotes", authenticate, async (req: AuthedRequest, res) => {
  const bookingId = routeParam(req.params.bookingId);
  if (!z.string().uuid().safeParse(bookingId).success) return res.status(400).json({ error: "Invalid bookingId" });
  const parsed = quoteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid quote" });
  const db = getDb();
  const [provider] = await db.select().from(habitatProviders).where(eq(habitatProviders.ownerUserId, req.user!.userId)).limit(1);
  if (!provider || provider.status !== "APPROVED") return res.status(403).json({ error: "Approved provider profile is required" });
  const [booking] = await db.select().from(habitatBookings).where(eq(habitatBookings._id, bookingId)).limit(1);
  if (!booking || booking.providerId !== provider._id) return res.status(404).json({ error: "Assigned booking not found" });
  if (booking.status !== "ACCEPTED" || booking.pricingModelSnapshot === "FIXED") {
    return res.status(409).json({ error: "A quote is only available for an accepted quote-based request" });
  }
  const expiresAt = new Date(Date.now() + parsed.data.expiresInHours * 60 * 60 * 1000);
  const created = await db.transaction(async (tx) => {
    const [updated] = await tx.update(habitatBookings)
      .set({ status: "QUOTE_PROVIDED", updatedAt: new Date() })
      .where(and(eq(habitatBookings._id, bookingId), eq(habitatBookings.status, "ACCEPTED")))
      .returning();
    if (!updated) return null;
    const [quote] = await tx.insert(habitatQuotes).values({
      bookingId,
      providerId: provider._id,
      amountPaise: parsed.data.amountPaise,
      workDescription: parsed.data.workDescription,
      expiresAt,
    }).returning();
    await tx.insert(habitatBookingStatusHistory).values({
      bookingId,
      actorUserId: req.user!.userId,
      fromStatus: "ACCEPTED",
      toStatus: "QUOTE_PROVIDED",
      reason: "Provider submitted a service quote",
    });
    return quote;
  });
  if (!created) return res.status(409).json({ error: "Booking changed; refresh and try again" });
  res.status(201).json({ quote: created });
});

router.get("/bookings/:bookingId/quotes", authenticate, async (req: AuthedRequest, res) => {
  const bookingId = routeParam(req.params.bookingId);
  if (!z.string().uuid().safeParse(bookingId).success) return res.status(400).json({ error: "Invalid bookingId" });
  const db = getDb();
  const [booking] = await db.select().from(habitatBookings).where(eq(habitatBookings._id, bookingId)).limit(1);
  if (!booking) return res.status(404).json({ error: "Booking not found" });
  if (req.user!.role !== "ADMIN") {
    const [provider] = await db.select({ id: habitatProviders._id })
      .from(habitatProviders).where(eq(habitatProviders.ownerUserId, req.user!.userId)).limit(1);
    if (booking.buyerId !== req.user!.userId && provider?.id !== booking.providerId) {
      return res.status(404).json({ error: "Booking not found" });
    }
  }
  const quotes = await db.select().from(habitatQuotes)
    .where(eq(habitatQuotes.bookingId, bookingId))
    .orderBy(desc(habitatQuotes.createdAt));
  res.json({ quotes });
});

router.post("/bookings/:bookingId/quotes/:quoteId/accept", authenticate, requireRole("BUYER"), async (req: AuthedRequest, res) => {
  const bookingId = routeParam(req.params.bookingId);
  const quoteId = routeParam(req.params.quoteId);
  if (!z.string().uuid().safeParse(bookingId).success || !z.string().uuid().safeParse(quoteId).success) {
    return res.status(400).json({ error: "Invalid booking or quote ID" });
  }
  const db = getDb();
  const result = await db.transaction(async (tx) => {
    const [booking] = await tx.select().from(habitatBookings)
      .where(and(eq(habitatBookings._id, bookingId), eq(habitatBookings.buyerId, req.user!.userId)))
      .limit(1);
    const [quote] = await tx.select().from(habitatQuotes)
      .where(and(eq(habitatQuotes._id, quoteId), eq(habitatQuotes.bookingId, bookingId), eq(habitatQuotes.status, "PROPOSED")))
      .limit(1);
    if (!booking || !quote || booking.status !== "QUOTE_PROVIDED" || quote.expiresAt <= new Date()) return null;
    const [accepted] = await tx.update(habitatQuotes)
      .set({ status: "ACCEPTED", acceptedAt: new Date() })
      .where(and(eq(habitatQuotes._id, quoteId), eq(habitatQuotes.status, "PROPOSED")))
      .returning();
    if (!accepted) return null;
    await tx.update(habitatQuotes)
      .set({ status: "REJECTED" })
      .where(and(eq(habitatQuotes.bookingId, bookingId), eq(habitatQuotes.status, "PROPOSED"), sql`${habitatQuotes._id} <> ${quoteId}`));
    const [updated] = await tx.update(habitatBookings)
      .set({ status: "PAYMENT_PENDING", finalAmountPaise: quote.amountPaise, updatedAt: new Date() })
      .where(and(eq(habitatBookings._id, bookingId), eq(habitatBookings.status, "QUOTE_PROVIDED")))
      .returning();
    if (!updated) throw new Error("Accepted quote could not be attached to the booking");
    await tx.insert(habitatBookingStatusHistory).values({
      bookingId,
      actorUserId: req.user!.userId,
      fromStatus: "QUOTE_PROVIDED",
      toStatus: "PAYMENT_PENDING",
      reason: "Buyer approved provider quote; payment is due",
    });
    return { booking: updated, quote: accepted };
  });
  if (!result) return res.status(409).json({ error: "This quote is expired or no longer available" });
  res.json(result);
});

router.post("/bookings/:bookingId/payments/order", authenticate, requireRole("BUYER"), async (req: AuthedRequest, res) => {
  const bookingId = routeParam(req.params.bookingId);
  const parsed = z.object({ idempotencyKey: z.string().uuid() }).safeParse(req.body);
  if (!z.string().uuid().safeParse(bookingId).success) return res.status(400).json({ error: "Invalid bookingId" });
  if (!parsed.success) return res.status(400).json({ error: "A valid idempotency key is required" });
  if (!habitatPaymentsEnabled()) return res.status(503).json({ error: "Habitat payments are disabled until Razorpay Route is activated and configured" });
  const db = getDb();
  const [existing] = await db.select().from(habitatPayments)
    .where(and(eq(habitatPayments.buyerId, req.user!.userId), eq(habitatPayments.idempotencyKey, parsed.data.idempotencyKey)))
    .limit(1);
  if (existing?.razorpayOrderId && existing.status === "CREATED") {
    res.json({ orderId: existing.razorpayOrderId, amountPaise: existing.amountPaise, currency: existing.currency, keyId: process.env.RAZORPAY_KEY_ID });
    return;
  }
  if (existing) return res.status(409).json({ error: "That payment attempt cannot be reused; start a new attempt" });

  const [booking] = await db.select().from(habitatBookings)
    .where(and(eq(habitatBookings._id, bookingId), eq(habitatBookings.buyerId, req.user!.userId)))
    .limit(1);
  if (!booking) return res.status(404).json({ error: "Booking not found" });
  if (!["ACCEPTED", "PAYMENT_PENDING"].includes(booking.status)) {
    return res.status(409).json({ error: "Booking must be accepted and awaiting payment" });
  }
  const [provider] = await db.select().from(habitatProviders)
    .where(and(eq(habitatProviders._id, booking.providerId ?? ""), eq(habitatProviders.status, "APPROVED")))
    .limit(1);
  if (!provider || !provider.razorpayAccountId || provider.razorpayAccountStatus !== "ACTIVATED") {
    return res.status(409).json({ error: "Provider must complete Razorpay linked-account verification before checkout" });
  }
  const [service] = await db.select().from(habitatServices).where(eq(habitatServices._id, booking.serviceId)).limit(1);
  if (!service) return res.status(404).json({ error: "Service not found" });

  let quoteId: string | null = null;
  let amountPaise = booking.finalAmountPaise;
  if (service.pricingModel === "FIXED") {
    amountPaise = booking.estimatedAmountPaise;
  } else {
    const [quote] = await db.select().from(habitatQuotes).where(and(
      eq(habitatQuotes.bookingId, bookingId),
      eq(habitatQuotes.status, "ACCEPTED"),
    )).orderBy(desc(habitatQuotes.acceptedAt)).limit(1);
    if (!quote) return res.status(409).json({ error: "Buyer must approve a valid provider quote before payment" });
    amountPaise = quote.amountPaise;
    quoteId = quote._id;
  }
  if (!amountPaise || !Number.isSafeInteger(amountPaise) || amountPaise <= 0) {
    return res.status(409).json({ error: "The booking does not have a valid payable price" });
  }
  const candidates = await db.select().from(habitatCommissionRules).where(and(
    eq(habitatCommissionRules.categoryId, service.categoryId),
    or(isNull(habitatCommissionRules.projectId), eq(habitatCommissionRules.projectId, booking.projectId)),
    or(isNull(habitatCommissionRules.providerId), eq(habitatCommissionRules.providerId, provider._id)),
    lte(habitatCommissionRules.effectiveFrom, new Date()),
    or(isNull(habitatCommissionRules.effectiveUntil), gt(habitatCommissionRules.effectiveUntil, new Date())),
  ));
  const selectedRule = candidates.sort((left, right) =>
    (Number(right.projectId !== null) + Number(right.providerId !== null)) -
    (Number(left.projectId !== null) + Number(left.providerId !== null)) ||
    right.effectiveFrom.getTime() - left.effectiveFrom.getTime(),
  )[0];
  if (!selectedRule) return res.status(409).json({ error: "Habitat commission must be configured before payments can be accepted" });
  const [settings] = await db.select().from(habitatSettings).where(eq(habitatSettings.singletonKey, "default")).limit(1);
  const taxBps = settings?.commissionTaxRateBps ?? Math.round(Number(process.env.GST_PERCENT ?? 18) * 100);
  let split;
  try {
    split = calculateHabitatMoneySplit(amountPaise, selectedRule.rateBps, taxBps);
  } catch (error) {
    return res.status(409).json({ error: responseError(error, "Habitat payment amounts are not configured correctly") });
  }
  const [buyer] = await db.select({ name: users.name, email: users.email, phone: users.phone })
    .from(users).where(eq(users._id, req.user!.userId)).limit(1);
  if (!buyer) return res.status(404).json({ error: "Buyer account not found" });

  const [payment] = await db.insert(habitatPayments).values({
    bookingId,
    buyerId: req.user!.userId,
    quoteId,
    amountPaise,
    commissionAmountPaise: split.commissionPaise,
    commissionTaxPaise: split.commissionTaxPaise,
    providerAmountPaise: split.providerPaise,
    idempotencyKey: parsed.data.idempotencyKey,
  }).returning();
  if (!payment) return res.status(500).json({ error: "Payment attempt could not be recorded" });
  try {
    const order = await createHabitatOrder(amountPaise, booking.reference, {
      habitatBookingId: bookingId,
      habitatPaymentId: payment._id,
      projectId: booking.projectId,
    });
    const persisted = await db.transaction(async (tx) => {
      await tx.update(habitatPayments).set({ razorpayOrderId: order.id, updatedAt: new Date() })
        .where(eq(habitatPayments._id, payment._id));
      const [updated] = await tx.update(habitatBookings).set({
        status: "PAYMENT_PENDING",
        finalAmountPaise: amountPaise,
        commissionRateBps: selectedRule.rateBps,
        commissionAmountPaise: split.commissionPaise,
        commissionTaxRateBps: taxBps,
        commissionTaxPaise: split.commissionTaxPaise,
        providerPayoutPaise: split.providerPaise,
        updatedAt: new Date(),
      }).where(and(
        eq(habitatBookings._id, bookingId),
        inArray(habitatBookings.status, ["ACCEPTED", "PAYMENT_PENDING"]),
      )).returning();
      if (!updated) return null;
      if (booking.status === "ACCEPTED") {
        await tx.insert(habitatBookingStatusHistory).values({
          bookingId,
          actorUserId: req.user!.userId,
          fromStatus: "ACCEPTED",
          toStatus: "PAYMENT_PENDING",
          reason: "Razorpay checkout order created",
        });
      }
      return updated;
    });
    if (!persisted) throw new Error("Booking changed while creating the payment order");
    res.status(201).json({
      orderId: order.id,
      amountPaise,
      currency: "INR",
      keyId: process.env.RAZORPAY_KEY_ID,
      commissionPaise: split.commissionPaise,
      commissionTaxPaise: split.commissionTaxPaise,
      providerAmountPaise: split.providerPaise,
      prefill: { name: buyer.name, email: buyer.email, contact: buyer.phone ?? "" },
    });
  } catch {
    await db.update(habitatPayments).set({ status: "FAILED", failureReason: "order-create-failed", updatedAt: new Date() })
      .where(eq(habitatPayments._id, payment._id));
    res.status(502).json({ error: "Could not start Habitat checkout. Please retry with a new payment attempt." });
  }
});

router.post("/bookings/:bookingId/payments/verify", authenticate, requireRole("BUYER"), async (req: AuthedRequest, res) => {
  const parsed = z.object({
    razorpay_order_id: z.string().min(1).max(120),
    razorpay_payment_id: z.string().min(1).max(120),
    razorpay_signature: z.string().min(1).max(256),
  }).safeParse(req.body);
  const bookingId = routeParam(req.params.bookingId);
  if (!z.string().uuid().safeParse(bookingId).success) return res.status(400).json({ error: "Invalid bookingId" });
  if (!parsed.success) return res.status(400).json({ error: "Invalid payment verification details" });
  const db = getDb();
  const [payment] = await db.select().from(habitatPayments).where(and(
    eq(habitatPayments.bookingId, bookingId),
    eq(habitatPayments.buyerId, req.user!.userId),
    eq(habitatPayments.razorpayOrderId, parsed.data.razorpay_order_id),
  )).limit(1);
  if (!payment) return res.status(404).json({ error: "Payment order not found for this booking" });
  try {
    const valid = await verifyHabitatPayment(
      parsed.data.razorpay_order_id,
      parsed.data.razorpay_payment_id,
      parsed.data.razorpay_signature,
      payment.amountPaise,
    );
    if (!valid) return res.status(400).json({ error: "Razorpay payment verification failed" });
    const captured = await recordCapturedPayment(
      payment._id,
      parsed.data.razorpay_payment_id,
      parsed.data.razorpay_signature,
      req.user!.userId,
    );
    if (!captured.ok) return res.status(409).json({ error: captured.reason });
    if (captured.requiresRefund) {
      try {
        const refund = await refundLateCapturedPayment(payment._id, req.user!.userId);
        return res.status(202).json({
          ok: true,
          bookingId,
          requiresRefund: true,
          refund: { amountPaise: payment.amountPaise, status: refund.status },
        });
      } catch {
        return res.status(202).json({
          ok: true,
          bookingId,
          requiresRefund: true,
          refund: { amountPaise: payment.amountPaise, status: "PENDING_REVIEW" },
        });
      }
    }
    res.json({ ok: true, bookingId, requiresRefund: false });
  } catch {
    res.status(502).json({ error: "Payment status could not be verified with Razorpay; retry shortly" });
  }
});

router.post("/bookings/:bookingId/complete", authenticate, requireRole("BUYER"), async (req: AuthedRequest, res) => {
  const bookingId = routeParam(req.params.bookingId);
  if (!z.string().uuid().safeParse(bookingId).success) return res.status(400).json({ error: "Invalid bookingId" });
  const updated = await recognizeCompletedBooking(bookingId, req.user!.userId, "COMPLETION_SUBMITTED");
  if (!updated) return res.status(409).json({ error: "Only a paid service awaiting buyer confirmation can be completed" });
  res.json({ booking: updated });
});

router.post("/bookings/:bookingId/cancel", authenticate, async (req: AuthedRequest, res) => {
  const bookingId = routeParam(req.params.bookingId);
  const parsed = z.object({
    reason: z.string().trim().min(3).max(1000),
    idempotencyKey: z.string().uuid(),
  }).safeParse(req.body);
  if (!z.string().uuid().safeParse(bookingId).success) return res.status(400).json({ error: "Invalid bookingId" });
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid cancellation" });
  const db = getDb();
  const [booking] = await db.select().from(habitatBookings).where(eq(habitatBookings._id, bookingId)).limit(1);
  if (!booking) return res.status(404).json({ error: "Booking not found" });
  const [provider] = await db.select().from(habitatProviders).where(eq(habitatProviders.ownerUserId, req.user!.userId)).limit(1);
  const isBuyer = booking.buyerId === req.user!.userId;
  const isAssignedProvider = provider?._id === booking.providerId;
  if (!isBuyer && !isAssignedProvider && req.user!.role !== "ADMIN") return res.status(404).json({ error: "Booking not found" });
  if (!["REQUESTED", "PROVIDER_ASSIGNED", "ACCEPTED", "QUOTE_PROVIDED", "PAYMENT_PENDING", "PAID"].includes(booking.status)) {
    return res.status(409).json({ error: "This booking can no longer be cancelled through self-service" });
  }
  const [payment] = await db.select().from(habitatPayments).where(and(
    eq(habitatPayments.bookingId, bookingId),
    inArray(habitatPayments.status, ["PAID", "PARTIALLY_REFUNDED"]),
  )).orderBy(desc(habitatPayments.createdAt)).limit(1);
  const [settings] = await db.select().from(habitatSettings).where(eq(habitatSettings.singletonKey, "default")).limit(1);
  const providerCancelled = isAssignedProvider && !isBuyer;
  const accepted = ["ACCEPTED", "QUOTE_PROVIDED", "PAYMENT_PENDING", "PAID"].includes(booking.status);
  const cancellation = payment
    ? calculateHabitatCancellation(
        payment.amountPaise,
        accepted && req.user!.role !== "ADMIN" ? settings?.cancellationFeeBps ?? 2500 : 0,
        providerCancelled,
      )
    : { refundPaise: 0, providerCompensationPaise: 0 };

  const [updated] = await db.update(habitatBookings).set({
    status: "CANCELLED",
    payoutStatus: payment ? "REFUND_PENDING" : "NOT_READY",
    cancellationFeeBpsSnapshot: accepted ? settings?.cancellationFeeBps ?? 2500 : 0,
    providerPayoutPaise: cancellation.providerCompensationPaise,
    payoutEligibleAt: payment && cancellation.providerCompensationPaise > 0 ? new Date() : null,
    updatedAt: new Date(),
  }).where(and(
    eq(habitatBookings._id, bookingId),
    eq(habitatBookings.status, booking.status),
  )).returning();
  if (!updated) return res.status(409).json({ error: "Booking changed; refresh and try again" });
  await db.insert(habitatBookingStatusHistory).values({
    bookingId,
    actorUserId: req.user!.userId,
    fromStatus: booking.status,
    toStatus: "CANCELLED",
    reason: parsed.data.reason,
  });
  if (payment && cancellation.refundPaise > 0) {
    try {
      const result = await startRefund(
        payment,
        req.user!.userId,
        cancellation.refundPaise,
        cancellation.providerCompensationPaise,
        providerCancelled ? "Provider cancellation: full buyer refund" : "Buyer cancellation",
        parsed.data.idempotencyKey,
      );
      res.json({ booking: updated, refund: { amountPaise: cancellation.refundPaise, status: result.status } });
    } catch (error) {
      res.status(202).json({
        booking: updated,
        refund: { amountPaise: cancellation.refundPaise, status: "PENDING_REVIEW" },
        warning: responseError(error, "Refund is recorded for admin retry"),
      });
    }
    return;
  }
  res.json({ booking: updated, refund: null });
});

router.post("/bookings/:bookingId/disputes", authenticate, requireRole("BUYER"), async (req: AuthedRequest, res) => {
  const bookingId = routeParam(req.params.bookingId);
  const parsed = z.object({
    reason: z.string().trim().min(10).max(2000),
    evidence: z.array(z.string().trim().min(5).max(500)).max(10).default([]),
  }).safeParse(req.body);
  if (!z.string().uuid().safeParse(bookingId).success) return res.status(400).json({ error: "Invalid bookingId" });
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid dispute details" });
  const db = getDb();
  const [booking] = await db.select().from(habitatBookings).where(and(
    eq(habitatBookings._id, bookingId),
    eq(habitatBookings.buyerId, req.user!.userId),
  )).limit(1);
  if (!booking || !["PAID", "IN_PROGRESS", "COMPLETION_SUBMITTED"].includes(booking.status)) {
    return res.status(409).json({ error: "A dispute can only be opened on a paid, unfinished booking" });
  }
  const result = await db.transaction(async (tx) => {
    const [updated] = await tx.update(habitatBookings)
      .set({ status: "DISPUTED", payoutStatus: "ON_HOLD", updatedAt: new Date() })
      .where(and(eq(habitatBookings._id, bookingId), eq(habitatBookings.status, booking.status)))
      .returning();
    if (!updated) return null;
    const [dispute] = await tx.insert(habitatDisputes).values({
      bookingId,
      buyerId: req.user!.userId,
      reason: parsed.data.reason,
      evidence: parsed.data.evidence,
    }).onConflictDoNothing({ target: habitatDisputes.bookingId }).returning();
    if (!dispute) return null;
    await tx.insert(habitatBookingStatusHistory).values({
      bookingId,
      actorUserId: req.user!.userId,
      fromStatus: booking.status,
      toStatus: "DISPUTED",
      reason: "Buyer opened a service dispute; provider payout is held",
    });
    return dispute;
  });
  if (!result) return res.status(409).json({ error: "A dispute already exists or the booking changed" });
  res.status(201).json({ dispute: result });
});

router.get("/admin/finance", authenticate, requireRole("ADMIN"), async (_req, res) => {
  const db = getDb();
  const [payments, disputes, transfers, settings] = await Promise.all([
    db.select({ status: habitatPayments.status, count: sql<number>`count(*)::int`, amountPaise: sql<number>`coalesce(sum(${habitatPayments.amountPaise}),0)::int` })
      .from(habitatPayments).groupBy(habitatPayments.status),
    db.select({ status: habitatDisputes.status, count: sql<number>`count(*)::int` })
      .from(habitatDisputes).groupBy(habitatDisputes.status),
    db.select({ status: habitatTransfers.status, count: sql<number>`count(*)::int`, amountPaise: sql<number>`coalesce(sum(${habitatTransfers.amountPaise}),0)::int` })
      .from(habitatTransfers).groupBy(habitatTransfers.status),
    db.select().from(habitatSettings).where(eq(habitatSettings.singletonKey, "default")).limit(1),
  ]);
  res.json({ payments, disputes, transfers, settings: settings[0] ?? null, paymentsEnabled: habitatPaymentsEnabled() });
});

router.patch("/admin/finance/settings", authenticate, requireRole("ADMIN"), async (req: AuthedRequest, res) => {
  const parsed = z.object({
    cancellationFeeBps: z.number().int().min(0).max(10_000),
    commissionTaxRateBps: z.number().int().min(0).max(10_000).optional(),
    autoCompleteHours: z.number().int().min(1).max(720).default(72),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid Habitat policy" });
  const [currentSettings] = await getDb().select().from(habitatSettings)
    .where(eq(habitatSettings.singletonKey, "default")).limit(1);
  const commissionTaxRateBps = parsed.data.commissionTaxRateBps ?? currentSettings?.commissionTaxRateBps ?? 1800;
  const [settings] = await getDb().insert(habitatSettings).values({
    singletonKey: "default",
    cancellationFeeBps: parsed.data.cancellationFeeBps,
    commissionTaxRateBps,
    autoCompleteHours: parsed.data.autoCompleteHours,
    updatedById: req.user!.userId,
  }).onConflictDoUpdate({
    target: habitatSettings.singletonKey,
    set: {
      cancellationFeeBps: parsed.data.cancellationFeeBps,
      commissionTaxRateBps,
      autoCompleteHours: parsed.data.autoCompleteHours,
      updatedById: req.user!.userId,
      updatedAt: new Date(),
    },
  }).returning();
  res.json({ settings });
});

router.get("/admin/finance/commission-rules", authenticate, requireRole("ADMIN"), async (_req, res) => {
  const rules = await getDb().select({
    rule: habitatCommissionRules,
    categoryName: habitatServiceCategories.name,
    projectName: projects.name,
    providerName: habitatProviders.businessName,
  }).from(habitatCommissionRules)
    .innerJoin(habitatServiceCategories, eq(habitatCommissionRules.categoryId, habitatServiceCategories._id))
    .leftJoin(projects, eq(habitatCommissionRules.projectId, projects._id))
    .leftJoin(habitatProviders, eq(habitatCommissionRules.providerId, habitatProviders._id))
    .orderBy(desc(habitatCommissionRules.effectiveFrom))
    .limit(500);
  res.json({ rules: rules.map(({ rule, ...labels }) => ({ ...rule, ...labels })) });
});

router.get("/admin/developer-access", authenticate, requireRole("ADMIN"), async (_req, res) => {
  const accessRows = await getDb().select({
    access: habitatDeveloperAccess,
    projectName: projects.name,
    developerName: users.name,
    developerEmail: users.email,
  }).from(habitatDeveloperAccess)
    .innerJoin(projects, eq(habitatDeveloperAccess.projectId, projects._id))
    .innerJoin(users, eq(habitatDeveloperAccess.developerId, users._id))
    .orderBy(desc(habitatDeveloperAccess.updatedAt))
    .limit(500);
  res.json({ access: accessRows.map(({ access, ...labels }) => ({ ...access, ...labels })) });
});

router.patch("/admin/projects/:projectId/developer-access", authenticate, requireRole("ADMIN"), async (req: AuthedRequest, res) => {
  const projectId = routeParam(req.params.projectId);
  const parsed = z.object({ active: z.boolean() }).safeParse(req.body);
  if (!z.string().uuid().safeParse(projectId).success) return res.status(400).json({ error: "Invalid projectId" });
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid developer access" });
  const [project] = await getDb().select({
    id: projects._id,
    developerId: projects.developerId,
    approvalStatus: projects.approvalStatus,
  }).from(projects).where(eq(projects._id, projectId)).limit(1);
  if (!project || project.approvalStatus !== "APPROVED") return res.status(404).json({ error: "Approved developer project not found" });
  const [developer] = await getDb().select({ id: users._id, role: users.role })
    .from(users).where(eq(users._id, project.developerId)).limit(1);
  if (!developer || developer.role !== "DEVELOPER") return res.status(409).json({ error: "Project owner is not a developer account" });
  const [access] = await getDb().insert(habitatDeveloperAccess).values({
    projectId,
    developerId: developer.id,
    active: parsed.data.active,
    grantedById: req.user!.userId,
  }).onConflictDoUpdate({
    target: habitatDeveloperAccess.projectId,
    set: {
      developerId: developer.id,
      active: parsed.data.active,
      grantedById: req.user!.userId,
      updatedAt: new Date(),
    },
  }).returning();
  res.json({ access });
});

async function getDeveloperProjectAccess(projectId: string, developerId: string) {
  const [result] = await getDb().select({
    access: habitatDeveloperAccess,
    project: projects,
  }).from(habitatDeveloperAccess)
    .innerJoin(projects, eq(habitatDeveloperAccess.projectId, projects._id))
    .where(and(
      eq(habitatDeveloperAccess.projectId, projectId),
      eq(habitatDeveloperAccess.developerId, developerId),
      eq(habitatDeveloperAccess.active, true),
      eq(projects.developerId, developerId),
      eq(projects.habitatEnabled, true),
      eq(projects.approvalStatus, "APPROVED"),
    )).limit(1);
  return result ?? null;
}

router.get("/developer/projects", authenticate, requireRole("DEVELOPER"), async (req: AuthedRequest, res) => {
  const rows = await getDb().select({
    project: projects,
    access: habitatDeveloperAccess,
  }).from(habitatDeveloperAccess)
    .innerJoin(projects, eq(habitatDeveloperAccess.projectId, projects._id))
    .where(and(
      eq(habitatDeveloperAccess.developerId, req.user!.userId),
      eq(habitatDeveloperAccess.active, true),
      eq(projects.developerId, req.user!.userId),
      eq(projects.habitatEnabled, true),
      eq(projects.approvalStatus, "APPROVED"),
    )).orderBy(projects.name);
  res.json({ projects: rows.map(({ project }) => ({
    id: project._id,
    name: project.name,
    city: project.city,
  })) });
});

router.get("/developer/projects/:projectId/summary", authenticate, requireRole("DEVELOPER"), async (req: AuthedRequest, res) => {
  const projectId = routeParam(req.params.projectId);
  if (!z.string().uuid().safeParse(projectId).success) return res.status(400).json({ error: "Invalid projectId" });
  const access = await getDeveloperProjectAccess(projectId, req.user!.userId);
  if (!access) return res.status(404).json({ error: "Authorized Habitat project not found" });
  const db = getDb();
  const [bookings, paymentTotals, categoryRows, activeCategories] = await Promise.all([
    db.select({ status: habitatBookings.status, count: sql<number>`count(*)::int` })
      .from(habitatBookings).where(eq(habitatBookings.projectId, projectId)).groupBy(habitatBookings.status),
    db.select({
      status: habitatPayments.status,
      count: sql<number>`count(*)::int`,
      amountPaise: sql<number>`coalesce(sum(${habitatPayments.amountPaise}), 0)::int`,
    }).from(habitatPayments)
      .innerJoin(habitatBookings, eq(habitatPayments.bookingId, habitatBookings._id))
      .where(eq(habitatBookings.projectId, projectId))
      .groupBy(habitatPayments.status),
    db.select()
      .from(habitatProjectCategories)
      .where(eq(habitatProjectCategories.projectId, projectId)),
    db.select().from(habitatServiceCategories)
      .where(eq(habitatServiceCategories.active, true))
      .orderBy(habitatServiceCategories.sortOrder, habitatServiceCategories.name),
  ]);
  const categoryRowsById = new Map(categoryRows.map((row) => [row.categoryId, row]));
  const categorySettings = activeCategories.map((category) => ({
    ...category,
    enabled: categoryRowsById.get(category._id)?.enabled ?? true,
  }));
  const invitations = await db.select().from(habitatInvitations)
    .where(eq(habitatInvitations.projectId, projectId))
    .orderBy(desc(habitatInvitations.createdAt))
    .limit(100);
  res.json({
    project: { id: access.project._id, name: access.project.name, city: access.project.city },
    bookingCounts: Object.fromEntries(bookings.map(({ status, count }) => [status, count])),
    payments: paymentTotals,
    categories: categorySettings,
    invitations,
  });
});

router.patch("/developer/projects/:projectId/categories/:categoryId", authenticate, requireRole("DEVELOPER"), async (req: AuthedRequest, res) => {
  const projectId = routeParam(req.params.projectId);
  const categoryId = routeParam(req.params.categoryId);
  const parsed = z.object({ enabled: z.boolean() }).safeParse(req.body);
  if (!z.string().uuid().safeParse(projectId).success || !z.string().uuid().safeParse(categoryId).success) {
    return res.status(400).json({ error: "Invalid project or category ID" });
  }
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid category setting" });
  const access = await getDeveloperProjectAccess(projectId, req.user!.userId);
  if (!access) return res.status(404).json({ error: "Authorized Habitat project not found" });
  const [category] = await getDb().select({ id: habitatServiceCategories._id })
    .from(habitatServiceCategories).where(eq(habitatServiceCategories._id, categoryId)).limit(1);
  if (!category) return res.status(404).json({ error: "Service category not found" });
  const [setting] = await getDb().insert(habitatProjectCategories).values({
    projectId,
    categoryId,
    enabled: parsed.data.enabled,
    updatedById: req.user!.userId,
  }).onConflictDoUpdate({
    target: [habitatProjectCategories.projectId, habitatProjectCategories.categoryId],
    set: { enabled: parsed.data.enabled, updatedById: req.user!.userId, updatedAt: new Date() },
  }).returning();
  res.json({ category: setting });
});

router.get("/developer/projects/:projectId/invitations", authenticate, requireRole("DEVELOPER"), async (req: AuthedRequest, res) => {
  const projectId = routeParam(req.params.projectId);
  if (!z.string().uuid().safeParse(projectId).success) return res.status(400).json({ error: "Invalid projectId" });
  if (!await getDeveloperProjectAccess(projectId, req.user!.userId)) return res.status(404).json({ error: "Authorized Habitat project not found" });
  const invitations = await getDb().select().from(habitatInvitations)
    .where(eq(habitatInvitations.projectId, projectId))
    .orderBy(desc(habitatInvitations.createdAt))
    .limit(100);
  res.json({ invitations });
});

router.post("/developer/projects/:projectId/invitations", authenticate, requireRole("DEVELOPER"), async (req: AuthedRequest, res) => {
  const projectId = routeParam(req.params.projectId);
  const parsed = z.object({ campaign: z.string().trim().max(120).optional() }).safeParse(req.body);
  if (!z.string().uuid().safeParse(projectId).success) return res.status(400).json({ error: "Invalid projectId" });
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid invitation" });
  const access = await getDeveloperProjectAccess(projectId, req.user!.userId);
  if (!access) return res.status(404).json({ error: "Authorized Habitat project not found" });
  const [invitation] = await getDb().insert(habitatInvitations).values({
    code: crypto.randomBytes(18).toString("base64url"),
    projectId,
    campaign: parsed.data.campaign || null,
    createdById: req.user!.userId,
  }).returning();
  res.status(201).json({ invitation });
});

router.post("/admin/finance/commission-rules", authenticate, requireRole("ADMIN"), async (req: AuthedRequest, res) => {
  const parsed = z.object({
    categoryId: z.string().uuid(),
    projectId: z.string().uuid().nullable().optional(),
    providerId: z.string().uuid().nullable().optional(),
    rateBps: z.number().int().min(0).max(10_000),
    effectiveFrom: z.string().datetime().optional(),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid commission rule" });
  const projectId = parsed.data.projectId ?? null;
  const providerId = parsed.data.providerId ?? null;
  const effectiveFrom = parsed.data.effectiveFrom ? new Date(parsed.data.effectiveFrom) : new Date();
  const db = getDb();
  const [category] = await db.select().from(habitatServiceCategories).where(eq(habitatServiceCategories._id, parsed.data.categoryId)).limit(1);
  if (!category) return res.status(404).json({ error: "Service category not found" });
  if (projectId) {
    const [project] = await db.select({ id: projects._id }).from(projects).where(eq(projects._id, projectId)).limit(1);
    if (!project) return res.status(404).json({ error: "Project not found" });
  }
  if (providerId) {
    const [provider] = await db.select({ id: habitatProviders._id }).from(habitatProviders).where(eq(habitatProviders._id, providerId)).limit(1);
    if (!provider) return res.status(404).json({ error: "Provider not found" });
  }
  const scope = and(
    eq(habitatCommissionRules.categoryId, parsed.data.categoryId),
    projectId ? eq(habitatCommissionRules.projectId, projectId) : isNull(habitatCommissionRules.projectId),
    providerId ? eq(habitatCommissionRules.providerId, providerId) : isNull(habitatCommissionRules.providerId),
    or(isNull(habitatCommissionRules.effectiveUntil), gt(habitatCommissionRules.effectiveUntil, effectiveFrom)),
  );
  await db.update(habitatCommissionRules)
    .set({ effectiveUntil: effectiveFrom })
    .where(and(scope, lte(habitatCommissionRules.effectiveFrom, effectiveFrom)));
  const [rule] = await db.insert(habitatCommissionRules).values({
    categoryId: parsed.data.categoryId,
    projectId,
    providerId,
    rateBps: parsed.data.rateBps,
    effectiveFrom,
    createdById: req.user!.userId,
  }).returning();
  res.status(201).json({ rule });
});

router.get("/admin/disputes", authenticate, requireRole("ADMIN"), async (_req, res) => {
  const disputes = await getDb().select({
    dispute: habitatDisputes,
    booking: habitatBookings,
    buyerName: users.name,
    providerName: habitatProviders.businessName,
  }).from(habitatDisputes)
    .innerJoin(habitatBookings, eq(habitatDisputes.bookingId, habitatBookings._id))
    .innerJoin(users, eq(habitatDisputes.buyerId, users._id))
    .leftJoin(habitatProviders, eq(habitatBookings.providerId, habitatProviders._id))
    .orderBy(desc(habitatDisputes.createdAt))
    .limit(200);
  res.json({ disputes: disputes.map(({ dispute, ...data }) => ({ ...dispute, ...data })) });
});

router.patch("/admin/disputes/:disputeId/resolve", authenticate, requireRole("ADMIN"), async (req: AuthedRequest, res) => {
  const disputeId = routeParam(req.params.disputeId);
  const parsed = z.object({
    decision: z.enum(["BUYER", "PROVIDER", "PARTIAL_REFUND"]),
    refundAmountPaise: z.number().int().positive().safe().optional(),
    resolutionNote: z.string().trim().min(10).max(2000),
  }).safeParse(req.body);
  if (!z.string().uuid().safeParse(disputeId).success) return res.status(400).json({ error: "Invalid disputeId" });
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid dispute resolution" });
  const db = getDb();
  const [dispute] = await db.select().from(habitatDisputes).where(eq(habitatDisputes._id, disputeId)).limit(1);
  if (!dispute || !["OPEN", "UNDER_REVIEW"].includes(dispute.status)) return res.status(409).json({ error: "Dispute is not open" });
  const [booking] = await db.select().from(habitatBookings).where(eq(habitatBookings._id, dispute.bookingId)).limit(1);
  const [payment] = await db.select().from(habitatPayments).where(and(
    eq(habitatPayments.bookingId, dispute.bookingId),
    inArray(habitatPayments.status, ["PAID", "PARTIALLY_REFUNDED"]),
  )).orderBy(desc(habitatPayments.createdAt)).limit(1);
  if (!booking || !payment) return res.status(409).json({ error: "Disputed booking has no captured payment" });

  if (parsed.data.decision === "PROVIDER") {
    const [updatedDispute] = await db.update(habitatDisputes).set({
      status: "RESOLVED_PROVIDER",
      resolutionNote: parsed.data.resolutionNote,
      reviewedById: req.user!.userId,
      resolvedAt: new Date(),
      updatedAt: new Date(),
    }).where(and(eq(habitatDisputes._id, disputeId), inArray(habitatDisputes.status, ["OPEN", "UNDER_REVIEW"]))).returning();
    if (!updatedDispute) return res.status(409).json({ error: "Dispute changed; refresh and retry" });
    const completed = await recognizeCompletedBooking(booking._id, req.user!.userId, "DISPUTED");
    if (!completed) return res.status(409).json({ error: "Booking could not be completed from its dispute state" });
    res.json({ dispute: updatedDispute, booking: completed });
    return;
  }

  const refundAmount = parsed.data.decision === "BUYER" ? payment.amountPaise : parsed.data.refundAmountPaise;
  if (!refundAmount || refundAmount > payment.amountPaise || (parsed.data.decision === "PARTIAL_REFUND" && refundAmount >= payment.amountPaise)) {
    return res.status(400).json({ error: "Refund amount must be positive and less than the captured payment for a partial refund" });
  }
  const [updatedDispute] = await db.update(habitatDisputes).set({
    status: parsed.data.decision === "BUYER" ? "RESOLVED_BUYER" : "PARTIAL_REFUND",
    resolutionNote: parsed.data.resolutionNote,
    refundAmountPaise: refundAmount,
    reviewedById: req.user!.userId,
    resolvedAt: new Date(),
    updatedAt: new Date(),
  }).where(and(eq(habitatDisputes._id, disputeId), inArray(habitatDisputes.status, ["OPEN", "UNDER_REVIEW"]))).returning();
  if (!updatedDispute) return res.status(409).json({ error: "Dispute changed; refresh and retry" });
  try {
    const refund = await startRefund(
      payment,
      req.user!.userId,
      refundAmount,
      0,
      `Habitat dispute resolution: ${parsed.data.resolutionNote}`,
      `dispute-${disputeId}-${randomUUID()}`,
    );
    res.json({ dispute: updatedDispute, refund: { amountPaise: refundAmount, status: refund.status } });
  } catch {
    res.status(202).json({ dispute: updatedDispute, refund: { amountPaise: refundAmount, status: "PENDING_REVIEW" } });
  }
});

router.get("/admin/settlements", authenticate, requireRole("ADMIN"), async (_req, res) => {
  const transfers = await getDb().select({
    transfer: habitatTransfers,
    booking: habitatBookings,
    providerName: habitatProviders.businessName,
  }).from(habitatTransfers)
    .innerJoin(habitatBookings, eq(habitatTransfers.bookingId, habitatBookings._id))
    .innerJoin(habitatProviders, eq(habitatTransfers.providerId, habitatProviders._id))
    .orderBy(desc(habitatTransfers.createdAt))
    .limit(500);
  res.json({ transfers: transfers.map(({ transfer, ...data }) => ({ ...transfer, ...data })) });
});

router.get("/admin/refunds", authenticate, requireRole("ADMIN"), async (_req, res) => {
  const refunds = await getDb().select({
    refund: habitatRefunds,
    payment: habitatPayments,
    booking: habitatBookings,
    buyerName: users.name,
  }).from(habitatRefunds)
    .innerJoin(habitatPayments, eq(habitatRefunds.paymentId, habitatPayments._id))
    .innerJoin(habitatBookings, eq(habitatPayments.bookingId, habitatBookings._id))
    .innerJoin(users, eq(habitatBookings.buyerId, users._id))
    .orderBy(desc(habitatRefunds.createdAt))
    .limit(500);
  res.json({ refunds: refunds.map(({ refund, payment, booking, buyerName }) => ({
    ...refund,
    bookingReference: booking.reference,
    buyerName,
    paymentStatus: payment.status,
  })) });
});

router.post("/admin/refunds/:refundId/retry", authenticate, requireRole("ADMIN"), async (req: AuthedRequest, res) => {
  const refundId = routeParam(req.params.refundId);
  if (!z.string().uuid().safeParse(refundId).success) return res.status(400).json({ error: "Invalid refundId" });
  const db = getDb();
  const [refund] = await db.select().from(habitatRefunds).where(eq(habitatRefunds._id, refundId)).limit(1);
  if (!refund || refund.status !== "FAILED") return res.status(409).json({ error: "Only a failed refund can be retried" });
  const [payment] = await db.select().from(habitatPayments).where(eq(habitatPayments._id, refund.paymentId)).limit(1);
  if (!payment) return res.status(404).json({ error: "Refund payment record not found" });
  try {
    const retried = await startRefund(
      payment,
      req.user!.userId,
      refund.amountPaise,
      refund.compensationPaise,
      refund.reason,
      refund.idempotencyKey,
    );
    res.json({ refund: retried });
  } catch {
    res.status(502).json({ error: "Refund retry failed; the refund remains available for review" });
  }
});

async function recordTransferProcessed(transferId: string, status: string) {
  if (status.toLowerCase() !== "processed") return;
  const db = getDb();
  await db.transaction(async (tx) => {
    const [transfer] = await tx.select().from(habitatTransfers).where(eq(habitatTransfers.razorpayTransferId, transferId)).limit(1);
    if (!transfer || transfer.status === "PROCESSED") return;
    const [updated] = await tx.update(habitatTransfers).set({
      status: "PROCESSED",
      processedAt: new Date(),
      updatedAt: new Date(),
    }).where(and(eq(habitatTransfers._id, transfer._id), eq(habitatTransfers.status, "PENDING"))).returning();
    if (!updated) return;
    await tx.update(habitatBookings).set({ payoutStatus: "PAID", updatedAt: new Date() }).where(eq(habitatBookings._id, transfer.bookingId));
    await tx.insert(habitatLedgerEntries).values(makeLedgerRows(
      transfer.bookingId,
      transfer.paymentId,
      `habitat-transfer-processed:${transfer._id}`,
      [
        { accountCode: "PROVIDER_PAYABLE", direction: "DEBIT", amountPaise: transfer.amountPaise },
        { accountCode: "GATEWAY_CLEARING", direction: "CREDIT", amountPaise: transfer.amountPaise },
      ],
    )).onConflictDoNothing({ target: habitatLedgerEntries.idempotencyKey });
  });
}

export async function processEligibleHabitatPayouts() {
  await processDueHabitatCompletions();
  if (!habitatPaymentsEnabled()) return;
  const db = getDb();
  const candidates = await db.select({
    booking: habitatBookings,
    payment: habitatPayments,
    provider: habitatProviders,
    dispute: habitatDisputes,
  }).from(habitatBookings)
    .innerJoin(habitatPayments, and(
      eq(habitatPayments.bookingId, habitatBookings._id),
      inArray(habitatPayments.status, ["PAID", "PARTIALLY_REFUNDED"]),
    ))
    .innerJoin(habitatProviders, eq(habitatBookings.providerId, habitatProviders._id))
    .leftJoin(habitatDisputes, eq(habitatDisputes.bookingId, habitatBookings._id))
    .where(and(
      inArray(habitatBookings.status, ["COMPLETED", "CANCELLED"]),
      inArray(habitatBookings.payoutStatus, ["ON_HOLD", "FAILED"]),
      lte(habitatBookings.payoutEligibleAt, new Date()),
      eq(habitatProviders.status, "APPROVED"),
      eq(habitatProviders.razorpayAccountStatus, "ACTIVATED"),
      or(
        isNull(habitatDisputes._id),
        inArray(habitatDisputes.status, ["RESOLVED_PROVIDER", "PARTIAL_REFUND"]),
      ),
    ))
    .limit(50);

  for (const row of candidates) {
    if (!isHabitatPayoutEligible(row.booking.status, row.booking.payoutEligibleAt, row.dispute?.status ?? null)) continue;
    const amountPaise = row.booking.providerPayoutPaise ?? row.payment.providerAmountPaise;
    if (amountPaise <= 0 || !row.provider.razorpayAccountId || !row.payment.razorpayPaymentId) continue;
    const [existing] = await db.select().from(habitatTransfers).where(eq(habitatTransfers.bookingId, row.booking._id)).limit(1);
    if (existing?.status === "PROCESSED" || existing?.status === "FAILED") continue;
    let transfer = existing;
    if (!transfer) {
      const [created] = await db.insert(habitatTransfers).values({
        bookingId: row.booking._id,
        paymentId: row.payment._id,
        providerId: row.provider._id,
        amountPaise,
        idempotencyKey: `habitat-payout-${row.booking._id}`,
      }).onConflictDoNothing({ target: habitatTransfers.bookingId }).returning();
      transfer = created ?? (await db.select().from(habitatTransfers).where(eq(habitatTransfers.bookingId, row.booking._id)).limit(1))[0];
    }
    if (!transfer || transfer.razorpayTransferId) continue;
    const [claimed] = await db.update(habitatBookings)
      .set({ payoutStatus: "PROCESSING", updatedAt: new Date() })
      .where(and(eq(habitatBookings._id, row.booking._id), inArray(habitatBookings.payoutStatus, ["ON_HOLD", "FAILED"])))
      .returning();
    if (!claimed) continue;
    try {
      const result = await createHabitatTransfer(
        row.payment.razorpayPaymentId,
        row.provider.razorpayAccountId,
        transfer.amountPaise,
        row.booking._id,
        transfer.idempotencyKey,
      );
      await db.update(habitatTransfers).set({
        razorpayTransferId: result.transferId,
        status: result.status.toLowerCase() === "failed" ? "FAILED" : "PENDING",
        updatedAt: new Date(),
      }).where(eq(habitatTransfers._id, transfer._id));
      if (result.status.toLowerCase() === "processed") await recordTransferProcessed(result.transferId, result.status);
      else if (result.status.toLowerCase() === "failed") await db.update(habitatBookings)
        .set({ payoutStatus: "FAILED", updatedAt: new Date() }).where(eq(habitatBookings._id, row.booking._id));
    } catch {
      await db.update(habitatTransfers).set({
        status: "FAILED",
        failureReason: "Razorpay transfer request failed; admin review required",
        updatedAt: new Date(),
      }).where(eq(habitatTransfers._id, transfer._id));
      await db.update(habitatBookings).set({ payoutStatus: "FAILED", updatedAt: new Date() })
        .where(eq(habitatBookings._id, row.booking._id));
    }
  }
}

let payoutSchedulerStarted = false;
export function startHabitatPayoutScheduler() {
  if (payoutSchedulerStarted) return;
  payoutSchedulerStarted = true;
  const run = () => {
    void processEligibleHabitatPayouts().catch((error) => {
      console.error("Habitat payout sweep failed:", error instanceof Error ? error.message : error);
    });
  };
  run();
  setInterval(run, 15 * 60 * 1000).unref();
}

export const habitatRazorpayWebhook: RequestHandler = async (req, res) => {
  if (!Buffer.isBuffer(req.body)) return res.status(400).json({ error: "Webhook body must be raw bytes" });
  const signature = req.header("x-razorpay-signature") ?? "";
  if (!verifyHabitatWebhook(req.body, signature)) return res.status(401).json({ error: "Invalid webhook signature" });
  let event: unknown;
  try {
    event = JSON.parse(req.body.toString("utf8")) as unknown;
  } catch {
    return res.status(400).json({ error: "Invalid webhook payload" });
  }
  const eventName = z.string().safeParse(getObject(event)?.event);
  if (!eventName.success) return res.status(400).json({ error: "Webhook event is missing" });

  const paymentEntity = getNestedRecord(event, "payload", "payment", "entity");
  if (["payment.captured", "order.paid"].includes(eventName.data) && paymentEntity) {
    const orderId = z.string().safeParse(paymentEntity.order_id);
    const paymentId = z.string().safeParse(paymentEntity.id);
    const amount = z.number().safeParse(paymentEntity.amount);
    if (orderId.success && paymentId.success && amount.success) {
      const [payment] = await getDb().select().from(habitatPayments)
        .where(eq(habitatPayments.razorpayOrderId, orderId.data)).limit(1);
      if (payment && payment.amountPaise === amount.data) {
        const captured = await recordCapturedPayment(payment._id, paymentId.data, null, null);
        if (captured.ok && captured.requiresRefund) {
          const [buyer] = await getDb().select({ id: users._id }).from(users).where(eq(users._id, payment.buyerId)).limit(1);
          if (buyer) {
            try {
              await refundLateCapturedPayment(payment._id, buyer.id);
            } catch (error) {
              console.error("Habitat late-payment refund requires admin retry:", responseError(error, "Unknown refund error"));
            }
          }
        }
      }
    }
  }

  const refundEntity = getNestedRecord(event, "payload", "refund", "entity");
  if (eventName.data === "refund.processed" && refundEntity) {
    const id = z.string().safeParse(refundEntity.id);
    if (id.success) {
      const [refund] = await getDb().select().from(habitatRefunds).where(eq(habitatRefunds.razorpayRefundId, id.data)).limit(1);
      if (refund) await recordRefundProcessed(refund._id, id.data);
    }
  }

  const transferEntity = getNestedRecord(event, "payload", "transfer", "entity");
  if (transferEntity) {
    const id = z.string().safeParse(transferEntity.id);
    const status = z.string().safeParse(transferEntity.status);
    if (id.success && status.success) {
      if (eventName.data === "transfer.processed") await recordTransferProcessed(id.data, status.data);
      if (["transfer.failed", "transfer.reversed"].includes(eventName.data)) {
        const [failedTransfer] = await getDb().update(habitatTransfers).set({
          status: status.data.toLowerCase() === "reversed" ? "REVERSED" : "FAILED",
          failureReason: `Razorpay transfer ${status.data}`,
          updatedAt: new Date(),
        }).where(eq(habitatTransfers.razorpayTransferId, id.data)).returning();
        if (failedTransfer) {
          await getDb().update(habitatBookings).set({
            payoutStatus: "FAILED",
            updatedAt: new Date(),
          }).where(eq(habitatBookings._id, failedTransfer.bookingId));
        }
      }
    }
  }
  const accountEntity = getNestedRecord(event, "payload", "account", "entity");
  if (accountEntity && ["account.activated", "account.updated", "account.suspended"].includes(eventName.data)) {
    const accountId = z.string().safeParse(accountEntity.id);
    const status = z.string().safeParse(accountEntity.status);
    if (accountId.success && status.success) {
      const activation = eventName.data === "account.suspended"
        ? "SUSPENDED"
        : status.data.toUpperCase() === "ACTIVATED" ? "ACTIVATED" : status.data.toUpperCase();
      await getDb().update(habitatProviders).set({
        razorpayAccountStatus: activation,
        updatedAt: new Date(),
      }).where(eq(habitatProviders.razorpayAccountId, accountId.data));
    }
  }
  res.json({ ok: true });
};

router.get("/provider/finance/status", authenticate, async (req: AuthedRequest, res) => {
  const [provider] = await getDb().select({
    status: habitatProviders.status,
    razorpayAccountId: habitatProviders.razorpayAccountId,
    razorpayAccountStatus: habitatProviders.razorpayAccountStatus,
    razorpayAccountCreatedAt: habitatProviders.razorpayAccountCreatedAt,
  }).from(habitatProviders)
    .where(eq(habitatProviders.ownerUserId, req.user!.userId))
    .limit(1);
  if (!provider) return res.status(404).json({ error: "Provider profile not found" });
  res.json({ ...provider, paymentsEnabled: habitatPaymentsEnabled() });
});

router.post("/provider/razorpay-onboarding", authenticate, async (req: AuthedRequest, res) => {
  const parsed = z.object({
    businessType: z.enum(["individual", "proprietorship", "partnership", "private_limited", "llp"]),
    legalBusinessName: z.string().trim().min(2).max(150),
    contactName: z.string().trim().min(2).max(120),
    email: z.string().email(),
    phone: z.string().trim().regex(/^\+?[0-9]{10,15}$/),
    pan: z.string().trim().regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/i),
    gst: z.string().trim().regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/i).optional().or(z.literal("")),
    bankAccountNumber: z.string().trim().regex(/^[0-9]{8,18}$/),
    ifsc: z.string().trim().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/i),
    beneficiaryName: z.string().trim().min(2).max(120),
    termsAccepted: z.literal(true),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid payout onboarding details" });
  if (!habitatPaymentsEnabled()) return res.status(503).json({ error: "Provider payout onboarding is unavailable until Razorpay Route is activated" });
  const [provider] = await getDb().select().from(habitatProviders)
    .where(and(eq(habitatProviders.ownerUserId, req.user!.userId), eq(habitatProviders.status, "APPROVED")))
    .limit(1);
  if (!provider) return res.status(403).json({ error: "An approved Habitat provider profile is required" });
  if (provider.razorpayAccountId) {
    return res.status(409).json({ error: "A linked account is already registered; contact support to update settlement details" });
  }
  try {
    const created = await createHabitatLinkedAccount({
      providerId: provider._id,
      businessName: parsed.data.legalBusinessName,
      businessType: parsed.data.businessType,
      contactName: parsed.data.contactName,
      email: parsed.data.email,
      phone: parsed.data.phone,
      pan: parsed.data.pan.toUpperCase(),
      gst: parsed.data.gst || undefined,
      bankAccountNumber: parsed.data.bankAccountNumber,
      ifsc: parsed.data.ifsc.toUpperCase(),
      beneficiaryName: parsed.data.beneficiaryName,
    });
    const activation = created.activationStatus?.toLowerCase() === "activated" ? "ACTIVATED" : created.accountStatus.toUpperCase();
    const [updated] = await getDb().update(habitatProviders).set({
      razorpayAccountId: created.accountId,
      razorpayAccountStatus: activation,
      razorpayAccountCreatedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(habitatProviders._id, provider._id)).returning();
    res.status(201).json({
      accountId: created.accountId,
      status: updated?.razorpayAccountStatus ?? activation,
      message: activation === "ACTIVATED"
        ? "Payout account verified"
        : "Razorpay is reviewing the linked account; payments remain unavailable until activation completes",
    });
  } catch {
    res.status(502).json({ error: "Razorpay could not start payout onboarding. No bank or PAN details were saved by Truvi." });
  }
});

export default router;
