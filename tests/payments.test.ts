import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { beforeEach, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import Stripe from "stripe";
import { applyBookingAction, getBookingDetail } from "../src/server/admin";
import type { AdminSession } from "../src/server/auth";
import { createHold, getBookingForToken, getBookingOptions } from "../src/server/bookings";
import { openLocalDb, setDbForTests, type DB } from "../src/server/db/client";
import { auditLog, bookings, payments } from "../src/server/db/schema";
import { handleStripeEvent, startCheckout } from "../src/server/payments";
import { setStripeForTests, verifyStripeEvent, type StripeLike } from "../src/server/stripe";
import { riyadhToUtc } from "../src/lib/schedule";

process.env.DATA_ENCRYPTION_KEY = randomBytes(32).toString("base64");
process.env.DATA_HASH_KEY = randomBytes(32).toString("base64");
process.env.STRIPE_SECRET_KEY = "sk_test_fake";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret";
process.env.SITE_URL = "https://amwal.example";

const now = riyadhToUtc("2026-11-23", "08:00");
const admin = { id: "test-admin" } as unknown as AdminSession;

let db: DB;
let calls: { created: Stripe.Checkout.SessionCreateParams[]; expired: string[]; refunds: { pi: string; key?: string }[] };
let refundShouldFail = false;
let sessionCounter = 0;

function fakeStripe(): StripeLike {
  return {
    checkout: {
      sessions: {
        create: (async (params: Stripe.Checkout.SessionCreateParams) => {
          calls.created.push(params);
          const id = `cs_test_${++sessionCounter}`;
          return { id, url: `https://checkout.stripe.com/c/pay/${id}` };
        }) as unknown as StripeLike["checkout"]["sessions"]["create"],
        expire: (async (id: string) => {
          calls.expired.push(id);
          return { id };
        }) as unknown as StripeLike["checkout"]["sessions"]["expire"],
      },
    },
    refunds: {
      create: (async (params: Stripe.RefundCreateParams, opts?: Stripe.RequestOptions) => {
        if (refundShouldFail) throw new Error("Stripe is down");
        calls.refunds.push({ pi: String(params.payment_intent), key: opts?.idempotencyKey });
        return { id: `re_${calls.refunds.length}` };
      }) as unknown as StripeLike["refunds"]["create"],
    },
  };
}

beforeEach(async () => {
  db = await openLocalDb(new PGlite());
  setDbForTests(db);
  calls = { created: [], expired: [], refunds: [] };
  refundShouldFail = false;
  sessionCounter = 0;
  setStripeForTests(fakeStripe());
});

async function heldBooking(phone = "0501234567", slotIndex = 0) {
  const { slots } = await getBookingOptions(now);
  const res = await createHold(
    { serviceId: "income-management", startsAt: slots["income-management"][slotIndex].startsAt, name: "سارة", phone, email: "sara@example.com" },
    { ip: null, now },
  );
  assert.ok(res.ok);
  return res.token;
}

let eventCounter = 0;
function paidEvent(sessionId: string, opts: { amount?: number; pi?: string; id?: string } = {}): Stripe.Event {
  return {
    id: opts.id ?? `evt_${++eventCounter}`,
    object: "event",
    type: "checkout.session.completed",
    data: {
      object: {
        id: sessionId,
        object: "checkout.session",
        payment_status: "paid",
        amount_total: opts.amount ?? 65000,
        currency: "sar",
        payment_intent: opts.pi ?? `pi_${sessionId}`,
      },
    },
  } as unknown as Stripe.Event;
}

test("checkout page carries no card data and the server never asks for any", async () => {
  const token = await heldBooking();
  const res = await startCheckout(token, now);
  assert.ok(res.ok);
  assert.match(res.url, /^https:\/\/checkout\.stripe\.com\//);
  const params = calls.created[0];
  assert.equal(params.mode, "payment");
  assert.equal(params.line_items?.[0].price_data?.unit_amount, 65000);
  assert.equal(params.line_items?.[0].price_data?.currency, "sar");
  assert.equal(params.success_url, `https://amwal.example/b/${token}?paid=1`);
  assert.ok((params.expires_at ?? 0) * 1000 - now.getTime() >= 30 * 60_000);
  // Only a booking id goes to Stripe as metadata, no name or phone.
  assert.deepEqual(Object.keys(params.metadata ?? {}), ["booking_id"]);

  const [p] = await db.select().from(payments);
  assert.equal(p.status, "pending");
  const columns = Object.keys(p).join(",");
  assert.ok(!/card|pan|cvc|cvv|expiry|last4/i.test(columns));
});

test("a verified paid event confirms the booking", async () => {
  const token = await heldBooking();
  await startCheckout(token, now);
  assert.equal(await handleStripeEvent(paidEvent("cs_test_1"), now), "processed");
  const view = await getBookingForToken(token, now);
  assert.equal(view?.status, "confirmed");
  assert.ok(view?.followUpEndsAt);
  const [p] = await db.select().from(payments);
  assert.equal(p.status, "paid");
  assert.equal(p.paymentIntentId, "pi_cs_test_1");
});

test("the same event delivered twice is handled once", async () => {
  const token = await heldBooking();
  await startCheckout(token, now);
  const e = paidEvent("cs_test_1", { id: "evt_same" });
  assert.equal(await handleStripeEvent(e, now), "processed");
  assert.equal(await handleStripeEvent(e, now), "duplicate");
  const confirmations = (await db.select().from(auditLog)).filter((a) => a.action === "booking.confirmed");
  assert.equal(confirmations.length, 1);
});

test("starting checkout again closes the previous payment page", async () => {
  const token = await heldBooking();
  await startCheckout(token, now);
  await startCheckout(token, now);
  assert.deepEqual(calls.expired, ["cs_test_1"]);
  const rows = await db.select().from(payments);
  assert.deepEqual(rows.map((r) => r.status).sort(), ["expired", "pending"]);
});

test("a second payment for an already confirmed booking is refunded", async () => {
  const token = await heldBooking();
  await startCheckout(token, now);
  await handleStripeEvent(paidEvent("cs_test_1"), now);
  await db.insert(payments).values({
    bookingId: (await db.select().from(bookings))[0].id,
    checkoutSessionId: "cs_extra",
    amountHalalas: 65000,
    currency: "sar",
    status: "pending",
  });
  await handleStripeEvent(paidEvent("cs_extra"), now);
  assert.deepEqual(calls.refunds, [{ pi: "pi_cs_extra", key: "refund-pi_cs_extra" }]);
  const extra = (await db.select().from(payments).where(eq(payments.checkoutSessionId, "cs_extra")))[0];
  assert.equal(extra.status, "refunded");
  assert.equal(extra.refundReason, "duplicate_payment");
});

test("a wrong amount is refunded, not confirmed", async () => {
  const token = await heldBooking();
  await startCheckout(token, now);
  await handleStripeEvent(paidEvent("cs_test_1", { amount: 100 }), now);
  assert.equal((await getBookingForToken(token, now))?.status, "held");
  assert.equal(calls.refunds.length, 1);
});

test("if the slot was taken before the late payment arrived, the client is refunded", async () => {
  const token = await heldBooking();
  await startCheckout(token, now);
  const later = new Date(now.getTime() + 40 * 60_000);
  // The hold expired and another client took the same slot.
  const sameSlot = (await db.select().from(bookings))[0].startsAt.toISOString();
  const other = await createHold(
    { serviceId: "income-management", startsAt: sameSlot, name: "خالد", phone: "0559876543", email: "k@example.com" },
    { ip: null, now: later },
  );
  assert.ok(other.ok);
  await handleStripeEvent(paidEvent("cs_test_1"), later);
  assert.equal(calls.refunds.length, 1);
  const first = (await db.select().from(payments).where(eq(payments.checkoutSessionId, "cs_test_1")))[0];
  assert.equal(first.refundReason, "slot_taken");
  assert.notEqual((await getBookingForToken(token, later))?.status, "confirmed");
});

test("an expired payment page is recorded", async () => {
  const token = await heldBooking();
  await startCheckout(token, now);
  await handleStripeEvent(
    { id: "evt_exp", object: "event", type: "checkout.session.expired", data: { object: { id: "cs_test_1" } } } as unknown as Stripe.Event,
    now,
  );
  assert.equal((await db.select().from(payments))[0].status, "expired");
});

test("admin cancellation refunds automatically; a Stripe failure changes nothing", async () => {
  const token = await heldBooking();
  await startCheckout(token, now);
  await handleStripeEvent(paidEvent("cs_test_1"), now);
  const id = (await db.select().from(bookings))[0].id;

  refundShouldFail = true;
  assert.deepEqual(await applyBookingAction(admin, id, "cancel", now), { ok: false, error: "refund_failed" });
  assert.equal((await getBookingForToken(token, now))?.status, "confirmed");

  refundShouldFail = false;
  assert.deepEqual(await applyBookingAction(admin, id, "cancel", now), { ok: true, refunded: 1 });
  assert.equal((await getBookingForToken(token, now))?.status, "cancelled");
  const detail = await getBookingDetail(admin, id, now);
  assert.equal(detail?.payments[0].status, "refunded");
  assert.equal(detail?.payments[0].refundReason, "admin_cancel");
});

test("events not signed by Stripe are rejected", () => {
  const payload = JSON.stringify({ id: "evt_x", object: "event", type: "checkout.session.completed" });
  const header = new Stripe("sk_test_fake").webhooks.generateTestHeaderString({
    payload,
    secret: "whsec_test_secret",
  });
  assert.equal(verifyStripeEvent(payload, header).id, "evt_x");

  const forged = new Stripe("sk_test_fake").webhooks.generateTestHeaderString({
    payload,
    secret: "whsec_attacker",
  });
  assert.throws(() => verifyStripeEvent(payload, forged));
  assert.throws(() => verifyStripeEvent(payload.replace("evt_x", "evt_y"), header));
  assert.throws(() => verifyStripeEvent(payload, null));
});
