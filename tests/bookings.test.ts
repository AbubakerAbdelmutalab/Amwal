import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { beforeEach, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import {
  createHold,
  getBookingForToken,
  getBookingOptions,
  getRescheduleSlots,
  requestCancellation,
  rescheduleBooking,
} from "../src/server/bookings";
import { hashToken } from "../src/server/crypto";
import { openLocalDb, setDbForTests, type DB } from "../src/server/db/client";
import { bookings, clients } from "../src/server/db/schema";
import { riyadhToUtc } from "../src/lib/schedule";

process.env.DATA_ENCRYPTION_KEY = randomBytes(32).toString("base64");
process.env.DATA_HASH_KEY = randomBytes(32).toString("base64");

// Monday 23 November 2026, 08:00 Riyadh.
const now = riyadhToUtc("2026-11-23", "08:00");
const slot = (date: string, time: string) => riyadhToUtc(date, time).toISOString();
const minutes = (n: number) => new Date(now.getTime() + n * 60_000);

let pg: PGlite;
let db: DB;

beforeEach(async () => {
  pg = new PGlite();
  db = await openLocalDb(pg);
  setDbForTests(db);
});

const details = (phone = "0501234567") => ({
  name: "سارة أحمد",
  phone,
  email: "Sara@Example.com",
});

async function hold(startsAt: string, phone?: string, opts: { ip?: string; at?: Date; serviceId?: string } = {}) {
  return createHold(
    { ...details(phone), serviceId: opts.serviceId ?? "income-management", startsAt },
    { ip: opts.ip ?? null, now: opts.at ?? now },
  );
}

async function confirm(token: string) {
  await db
    .update(bookings)
    .set({ status: "confirmed", holdExpiresAt: null })
    .where(eq(bookings.accessTokenHash, hashToken(token)));
}

test("seeded schedule offers the agreed slots", async () => {
  const { services, slots } = await getBookingOptions(now);
  assert.deepEqual(services.map((s) => s.priceHalalas), [65000, 65000, 110000]);
  const monday = slots["income-management"].filter((s) => s.date === "2026-11-23");
  assert.deepEqual(monday.map((s) => s.time), ["13:00", "15:45", "20:30"]);
});

test("a hold stores personal data only in encrypted form", async () => {
  const res = await hold(slot("2026-11-25", "13:00"));
  assert.ok(res.ok);
  const [c] = await db.select().from(clients);
  const stored = JSON.stringify(c);
  for (const plain of ["سارة", "501234567", "sara@example.com"]) {
    assert.ok(!stored.includes(plain), `found ${plain} in plain text`);
  }
  const [b] = await db.select().from(bookings);
  assert.notEqual(b.accessTokenHash, res.token);

  const view = await getBookingForToken(res.token, now);
  assert.equal(view?.name, "سارة أحمد");
  assert.equal(view?.phoneMasked, "+966••••••567");
  assert.equal(view?.emailMasked, "s•••@example.com");
  assert.equal(view?.status, "held");
});

test("a held slot cannot be taken by someone else", async () => {
  assert.ok((await hold(slot("2026-11-25", "13:00"))).ok);
  const second = await hold(slot("2026-11-25", "13:00"), "0559876543");
  assert.deepEqual(second, { ok: false, error: "slot_unavailable" });
});

test("simultaneous requests for one slot: exactly one succeeds", async () => {
  const results = await Promise.all(
    ["0551111111", "0552222222", "0553333333"].map((p) => hold(slot("2026-11-25", "13:00"), p)),
  );
  assert.equal(results.filter((r) => r.ok).length, 1);
});

test("the database rejects overlapping bookings even outside the app", async () => {
  const res = await hold(slot("2026-11-25", "13:00"));
  assert.ok(res.ok);
  const [b] = await db.select().from(bookings);
  await assert.rejects(
    db.insert(bookings).values({
      ...b,
      id: undefined,
      accessTokenHash: "other",
      startsAt: riyadhToUtc("2026-11-25", "14:00"),
      endsAt: riyadhToUtc("2026-11-25", "16:00"),
    }),
  );
});

test("a three-hour hold at 1:00 removes the 3:45 slot", async () => {
  assert.ok((await hold(slot("2026-11-25", "13:00"), undefined, { serviceId: "both" })).ok);
  const { slots } = await getBookingOptions(now);
  const wed = slots["income-management"].filter((s) => s.date === "2026-11-25");
  assert.deepEqual(wed.map((s) => s.time), ["20:30"]);
});

test("an expired hold frees the slot", async () => {
  assert.ok((await hold(slot("2026-11-25", "13:00"))).ok);
  const later = await hold(slot("2026-11-25", "13:00"), "0559876543", { at: minutes(11) });
  assert.ok(later.ok);
});

test("choosing a new time releases the client's previous hold", async () => {
  assert.ok((await hold(slot("2026-11-25", "13:00"))).ok);
  assert.ok((await hold(slot("2026-11-25", "20:30"))).ok);
  assert.ok((await hold(slot("2026-11-25", "13:00"), "0559876543")).ok);
});

test("invalid input is rejected with Arabic field messages", async () => {
  const res = await createHold(
    { name: "a", phone: "123", email: "nope", serviceId: "income-management", startsAt: slot("2026-11-25", "13:00") },
    { ip: null, now },
  );
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.error, "invalid");
    assert.equal(res.fields?.phone, "رقم الواتساب غير صحيح");
    assert.ok(res.fields?.name && res.fields?.email);
  }
});

test("a time that is not on the schedule cannot be booked", async () => {
  const res = await hold(slot("2026-11-25", "14:00"));
  assert.deepEqual(res, { ok: false, error: "slot_unavailable" });
  const friday = await hold(slot("2026-11-27", "13:00"));
  assert.deepEqual(friday, { ok: false, error: "slot_unavailable" });
});

test("too many holds from one connection are refused", async () => {
  const times = ["13:00", "15:45", "20:30"];
  const dates = ["2026-11-25", "2026-11-28"];
  const phones = ["0551000001", "0551000002", "0551000003", "0551000004", "0551000005"];
  for (let i = 0; i < 5; i++) {
    const r = await hold(slot(dates[Math.floor(i / 3)], times[i % 3]), phones[i], { ip: "203.0.113.9" });
    assert.ok(r.ok, `hold ${i}`);
  }
  const sixth = await hold(slot("2026-11-30", "13:00"), "0551000006", { ip: "203.0.113.9" });
  assert.deepEqual(sixth, { ok: false, error: "rate_limited" });
  const otherIp = await hold(slot("2026-11-30", "13:00"), "0551000006", { ip: "198.51.100.7" });
  assert.ok(otherIp.ok);
});

test("wrong or malformed links find nothing", async () => {
  assert.equal(await getBookingForToken("x".repeat(43), now), null);
  assert.equal(await getBookingForToken("not-a-token", now), null);
});

test("confirmed bookings can be rescheduled until three hours before", async () => {
  const res = await hold(slot("2026-11-25", "13:00"));
  assert.ok(res.ok);
  assert.deepEqual(await rescheduleBooking(res.token, slot("2026-11-25", "20:30"), now), {
    ok: false,
    error: "not_allowed",
  });

  await confirm(res.token);
  const options = await getRescheduleSlots(res.token, now);
  assert.ok(options?.some((s) => s.startsAt === slot("2026-11-25", "20:30")));
  assert.deepEqual(await rescheduleBooking(res.token, slot("2026-11-25", "20:30"), now), { ok: true });

  const view = await getBookingForToken(res.token, now);
  assert.equal(view?.startsAt, slot("2026-11-25", "20:30"));
  assert.ok(view?.followUpEndsAt);

  const tooLate = riyadhToUtc("2026-11-25", "18:00");
  assert.deepEqual(await rescheduleBooking(res.token, slot("2026-11-28", "13:00"), tooLate), {
    ok: false,
    error: "too_late",
  });
});

test("cancellation request keeps the slot blocked until approved", async () => {
  const res = await hold(slot("2026-11-25", "13:00"));
  assert.ok(res.ok);
  await confirm(res.token);
  assert.deepEqual(await requestCancellation(res.token, now), { ok: true });
  assert.equal((await getBookingForToken(res.token, now))?.status, "cancel_requested");
  assert.deepEqual(await hold(slot("2026-11-25", "13:00"), "0559876543"), {
    ok: false,
    error: "slot_unavailable",
  });
});

test("row-level security is on for every table", async () => {
  const { rows } = await pg.query<{ relname: string; relrowsecurity: boolean }>(
    `SELECT relname, relrowsecurity FROM pg_class
     WHERE relnamespace = 'public'::regnamespace AND relkind = 'r'`,
  );
  assert.ok(rows.length >= 8);
  for (const r of rows) assert.ok(r.relrowsecurity, `${r.relname} has RLS off`);
});
