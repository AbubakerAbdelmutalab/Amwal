import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import type Stripe from "stripe";
import { dateOf, fullDate, timeRange } from "@/lib/format";
import { addMonths } from "@/lib/schedule";
import type { Failure } from "./bookings";
import { findByToken } from "./bookings";
import { decrypt } from "./crypto";
import { getDb, type DB } from "./db/client";
import { pgCode } from "./db/errors";
import { auditLog, bookings, clients, paymentEvents, payments, services } from "./db/schema";
import { getSettings } from "./settings";
import { siteUrl, stripe } from "./stripe";

// Payments through Stripe Checkout.
//
// The client types card details only on Stripe's own page (checkout.stripe.com).
// This server never receives, sees or stores card numbers, expiry dates or
// security codes. It only:
//   1. asks Stripe to open a payment page for a held booking, and
//   2. receives Stripe's signed "paid" event and confirms the booking.
// Confirmation never relies on the browser returning from Stripe.

type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];

const MINUTE = 60_000;
const CHECKOUT_MINUTES = 31; // Stripe's minimum page lifetime is 30 minutes
const MAX_HOLD_MINUTES = 120; // a hold can be extended for payment up to this age

/** Opens a Stripe payment page for a held booking and returns its address. */
export async function startCheckout(
  token: string,
  now = new Date(),
): Promise<{ ok: true; url: string } | Failure> {
  const db = await getDb();
  const b = await findByToken(db, token);
  if (!b) return { ok: false, error: "not_found" };
  if (b.status !== "held" || !b.holdExpiresAt || b.holdExpiresAt <= now) {
    return { ok: false, error: "not_allowed" };
  }
  const expiresAt = new Date(now.getTime() + CHECKOUT_MINUTES * MINUTE);
  if (expiresAt.getTime() > b.createdAt.getTime() + MAX_HOLD_MINUTES * MINUTE) {
    return { ok: false, error: "not_allowed" };
  }

  const [service] = await db.select().from(services).where(eq(services.id, b.serviceId));
  const [client] = await db.select().from(clients).where(eq(clients.id, b.clientId));

  // Close any earlier payment page for this booking so it cannot be paid twice.
  const open = await db
    .select()
    .from(payments)
    .where(and(eq(payments.bookingId, b.id), eq(payments.status, "pending")));
  for (const p of open) {
    try {
      await stripe().checkout.sessions.expire(p.checkoutSessionId);
    } catch {
      // Already expired or completed; the webhook handles completed ones.
    }
    await db
      .update(payments)
      .set({ status: "expired", updatedAt: now })
      .where(and(eq(payments.id, p.id), eq(payments.status, "pending")));
  }

  const base = siteUrl();
  const session = await stripe().checkout.sessions.create({
    mode: "payment",
    locale: "auto",
    currency: "sar",
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "sar",
          unit_amount: b.priceHalalas,
          product_data: {
            name: `أموال — ${service.name}`,
            description: `${fullDate(dateOf(b.startsAt))}، ${timeRange(b.startsAt, b.endsAt)} (بتوقيت الرياض)`,
          },
        },
      },
    ],
    customer_email: decrypt(client.emailEnc, "client.email"),
    client_reference_id: b.id,
    metadata: { booking_id: b.id },
    payment_intent_data: { metadata: { booking_id: b.id } },
    expires_at: Math.floor(expiresAt.getTime() / 1000),
    success_url: `${base}/b/${token}?paid=1`,
    cancel_url: `${base}/b/${token}`,
  });
  if (!session.url) throw new Error("Stripe returned no checkout URL");

  await db.insert(payments).values({
    bookingId: b.id,
    checkoutSessionId: session.id,
    amountHalalas: b.priceHalalas,
    currency: "sar",
    status: "pending",
    createdAt: now,
    updatedAt: now,
  });
  // Keep the slot held for as long as the payment page is open.
  await db
    .update(bookings)
    .set({ holdExpiresAt: expiresAt, updatedAt: now })
    .where(and(eq(bookings.id, b.id), eq(bookings.status, "held")));

  return { ok: true, url: session.url };
}

export type EventOutcome = "processed" | "duplicate" | "ignored";

/**
 * Handles a verified Stripe event. Runs in one transaction with the record of
 * the event, so a failure rolls everything back and Stripe retries; a repeated
 * event is recognised and skipped.
 */
export async function handleStripeEvent(event: Stripe.Event, now = new Date()): Promise<EventOutcome> {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const inserted = await tx
      .insert(paymentEvents)
      .values({ id: event.id, type: event.type, receivedAt: now })
      .onConflictDoNothing()
      .returning({ id: paymentEvents.id });
    if (inserted.length === 0) return "duplicate";

    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object;
        if (session.payment_status !== "paid") return "ignored"; // still processing
        await onPaid(tx, session, now);
        return "processed";
      }
      case "checkout.session.expired":
      case "checkout.session.async_payment_failed": {
        await tx
          .update(payments)
          .set({ status: "expired", updatedAt: now })
          .where(
            and(eq(payments.checkoutSessionId, event.data.object.id), eq(payments.status, "pending")),
          );
        return "processed";
      }
      default:
        return "ignored";
    }
  });
}

async function onPaid(tx: Tx, session: Stripe.Checkout.Session, now: Date) {
  const [p] = await tx
    .select()
    .from(payments)
    .where(eq(payments.checkoutSessionId, session.id))
    .for("update");
  if (!p) {
    console.warn("Stripe session not created by this site", session.id);
    return;
  }
  if (p.status === "paid" || p.status === "refunded") return;

  const paymentIntent =
    typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
  if (!paymentIntent) throw new Error("Paid session without a payment intent");

  await tx
    .update(payments)
    .set({ status: "paid", paymentIntentId: paymentIntent, paidAt: now, updatedAt: now })
    .where(eq(payments.id, p.id));

  const [b] = await tx.select().from(bookings).where(eq(bookings.id, p.bookingId)).for("update");
  const settings = await getSettings(tx as unknown as DB);
  let refundReason: string | null = null;

  if (session.amount_total !== p.amountHalalas || session.currency?.toLowerCase() !== p.currency) {
    refundReason = "amount_mismatch";
  } else if (b.status === "held" || b.status === "expired") {
    try {
      // Savepoint: if the slot was taken meanwhile, only this step is undone.
      await tx.transaction(async (sp) => {
        await sp
          .update(bookings)
          .set({
            status: "confirmed",
            confirmedAt: now,
            holdExpiresAt: null,
            followUpEndsAt: addMonths(b.endsAt, settings.followUpMonths),
            updatedAt: now,
          })
          .where(eq(bookings.id, b.id));
      });
      await tx
        .insert(auditLog)
        .values({ actor: "system", action: "booking.confirmed", bookingId: b.id, at: now });
    } catch (e) {
      if (pgCode(e) !== "23P01") throw e;
      refundReason = "slot_taken";
    }
  } else {
    refundReason = b.status === "confirmed" ? "duplicate_payment" : "booking_closed";
  }

  if (refundReason) {
    await refund(tx, { ...p, paymentIntentId: paymentIntent }, refundReason, now);
    await tx.insert(auditLog).values({
      actor: "system",
      action: "payment.auto_refunded",
      bookingId: b.id,
      details: { reason: refundReason },
      at: now,
    });
  }
}

async function refund(
  tx: Tx,
  p: { id: string; bookingId: string; paymentIntentId: string | null },
  reason: string,
  now: Date,
) {
  if (!p.paymentIntentId) throw new Error("Cannot refund a payment without a payment intent");
  // The idempotency key makes a retried refund a no-op at Stripe.
  const r = await stripe().refunds.create(
    { payment_intent: p.paymentIntentId, metadata: { booking_id: p.bookingId, reason } },
    { idempotencyKey: `refund-${p.paymentIntentId}` },
  );
  await tx
    .update(payments)
    .set({ status: "refunded", refundId: r.id, refundReason: reason, refundedAt: now, updatedAt: now })
    .where(eq(payments.id, p.id));
}

/**
 * Refunds every paid payment of a booking (admin cancellation). Throws if
 * Stripe refuses, so the caller's transaction rolls back.
 */
export async function refundBookingPayments(tx: Tx, bookingId: string, now: Date): Promise<number> {
  const paid = await tx
    .select()
    .from(payments)
    .where(and(eq(payments.bookingId, bookingId), inArray(payments.status, ["paid"])))
    .for("update");
  for (const p of paid) await refund(tx, p, "admin_cancel", now);
  return paid.length;
}

export type PaymentSummary = {
  status: string;
  amountHalalas: number;
  createdAt: string;
  paidAt: string | null;
  refundedAt: string | null;
  refundReason: string | null;
};

export async function paymentsForBooking(bookingId: string): Promise<PaymentSummary[]> {
  const db = await getDb();
  const rows = await db.select().from(payments).where(eq(payments.bookingId, bookingId));
  return rows
    .filter((p) => p.status !== "expired")
    .map((p) => ({
      status: p.status,
      amountHalalas: p.amountHalalas,
      createdAt: p.createdAt.toISOString(),
      paidAt: p.paidAt?.toISOString() ?? null,
      refundedAt: p.refundedAt?.toISOString() ?? null,
      refundReason: p.refundReason,
    }));
}
