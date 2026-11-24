import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { before, beforeEach, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import {
  addException,
  applyBookingAction,
  getBookingDetail,
  getScheduleAdmin,
  listBookings,
  toggleWeeklySlot,
} from "../src/server/admin";
import {
  attemptLogin,
  base32Decode,
  base32Encode,
  getAdminSession,
  endAdminSession,
  hashPassword,
  MAX_FAILED_ATTEMPTS,
  newTotpSecret,
  SESSION_IDLE_MS,
  totpCode,
  verifyPassword,
  type AdminSession,
} from "../src/server/auth";
import { createHold, getBookingOptions } from "../src/server/bookings";
import { hashToken } from "../src/server/crypto";
import { openLocalDb, setDbForTests, type DB } from "../src/server/db/client";
import { adminSessions, auditLog, bookings } from "../src/server/db/schema";
import { riyadhToUtc } from "../src/lib/schedule";

process.env.DATA_ENCRYPTION_KEY = randomBytes(32).toString("base64");
process.env.DATA_HASH_KEY = randomBytes(32).toString("base64");
const PASSWORD = "correct horse battery staple";
const SECRET = newTotpSecret();
process.env.ADMIN_EMAIL = "Admin@Amwal.School";
process.env.ADMIN_TOTP_SECRET = SECRET;

const now = riyadhToUtc("2026-11-23", "08:00");
const codeAt = (t: Date) => totpCode(base32Decode(SECRET), Math.floor(t.getTime() / 30_000));
const later = (min: number) => new Date(now.getTime() + min * 60_000);

let db: DB;

before(async () => {
  process.env.ADMIN_PASSWORD_HASH = await hashPassword(PASSWORD);
});

beforeEach(async () => {
  db = await openLocalDb(new PGlite());
  setDbForTests(db);
});

function login(over: Partial<{ email: string; password: string; code: string }> = {}, at = now, ip = "203.0.113.5") {
  return attemptLogin(
    { email: "admin@amwal.school", password: PASSWORD, code: codeAt(at), ...over },
    { ip, userAgent: "test", now: at },
  );
}

async function signedIn(): Promise<AdminSession> {
  const res = await login();
  assert.ok(res.ok);
  const s = await getAdminSession(res.token, now);
  assert.ok(s);
  return s;
}

test("RFC 6238 test vector", () => {
  const secret = Buffer.from("12345678901234567890");
  assert.equal(totpCode(secret, 1, 8), "94287082");
  assert.equal(totpCode(secret, Math.floor(1111111109 / 30), 8), "07081804");
  assert.deepEqual(base32Decode(base32Encode(secret)), secret);
});

test("passwords are hashed with scrypt and verified", async () => {
  const h = await hashPassword("s3cret-password");
  assert.match(h, /^scrypt:32768:8:1:/);
  assert.ok(!h.includes("s3cret"));
  assert.ok(await verifyPassword("s3cret-password", h));
  assert.ok(!(await verifyPassword("s3cret-passwore", h)));
});

test("sign-in needs the right email, password and current code", async () => {
  assert.deepEqual(await login({ password: "wrong" }), { ok: false, error: "invalid" });
  assert.deepEqual(await login({ email: "other@amwal.school" }), { ok: false, error: "invalid" });
  assert.deepEqual(await login({ code: "000000" === codeAt(now) ? "111111" : "000000" }), {
    ok: false,
    error: "invalid",
  });
  assert.deepEqual(await login({ code: codeAt(later(5)) }), { ok: false, error: "invalid" });
  const ok = await login();
  assert.ok(ok.ok);
});

test("a code cannot be used twice", async () => {
  assert.ok((await login()).ok);
  assert.deepEqual(await login(), { ok: false, error: "invalid" });
});

test("repeated failures lock that connection for 15 minutes", async () => {
  for (let i = 0; i < MAX_FAILED_ATTEMPTS; i++) await login({ password: "wrong" });
  assert.deepEqual(await login(), { ok: false, error: "locked" });
  assert.ok((await login({}, now, "198.51.100.1")).ok, "other connections still work");
  const after = later(16);
  assert.ok((await login({ code: codeAt(after) }, after)).ok);
});

test("sessions store only a hash, expire when idle, and end on sign-out", async () => {
  const res = await login();
  assert.ok(res.ok);
  const [row] = await db.select().from(adminSessions);
  assert.equal(row.tokenHash, hashToken(res.token));
  assert.notEqual(row.tokenHash, res.token);

  assert.ok(await getAdminSession(res.token, later(60)));
  assert.equal(await getAdminSession(res.token, new Date(later(60).getTime() + SESSION_IDLE_MS + 1)), null);

  const second = await login({ code: codeAt(later(1)) }, later(1));
  assert.ok(second.ok);
  await endAdminSession(second.token);
  assert.equal(await getAdminSession(second.token, later(2)), null);
  assert.equal(await getAdminSession("forged-token", now), null);
});

test("sign-in events are audited without personal data", async () => {
  await login({ password: "wrong" });
  await login();
  const rows = await db.select().from(auditLog);
  assert.deepEqual(rows.map((r) => r.action), ["admin.login_failed", "admin.login"]);
  assert.ok(!JSON.stringify(rows).includes("admin@amwal.school"));
});

test("admin functions refuse to run without a session", async () => {
  await assert.rejects(listBookings(null as unknown as AdminSession, "all", now));
});

test("admin sees decrypted client details and can manage a booking", async () => {
  const s = await signedIn();
  const { slots } = await getBookingOptions(now);
  const hold = await createHold(
    { serviceId: "income-management", startsAt: slots["income-management"][0].startsAt, name: "سارة أحمد", phone: "0501234567", email: "sara@example.com" },
    { ip: null, now },
  );
  assert.ok(hold.ok);

  const [row] = await listBookings(s, "upcoming", now);
  assert.equal(row.name, "سارة أحمد");
  assert.equal(row.phone, "+966501234567");
  assert.equal(row.status, "held");

  await db.update(bookings).set({ status: "cancel_requested" }).where(eq(bookings.accessTokenHash, hashToken(hold.token)));
  assert.equal((await listBookings(s, "cancellations", now)).length, 1);

  const detail = await getBookingDetail(s, row.id, now);
  assert.deepEqual(detail?.allowed, ["approve_cancel", "cancel"]);
  assert.deepEqual(await applyBookingAction(s, row.id, "complete", now), { ok: false, error: "not_allowed" });
  assert.deepEqual(await applyBookingAction(s, row.id, "approve_cancel", now), { ok: true, refunded: 0 });
  assert.equal((await getBookingDetail(s, row.id, now))?.status, "cancelled");

  // The freed slot can be booked again.
  const again = await createHold(
    { serviceId: "income-management", startsAt: slots["income-management"][0].startsAt, name: "خالد", phone: "0559876543", email: "k@example.com" },
    { ip: null, now },
  );
  assert.ok(again.ok);

  assert.equal(await getBookingDetail(s, "not-a-uuid", now), null);
});

test("schedule changes take effect and are audited", async () => {
  const s = await signedIn();
  const wed = () =>
    getBookingOptions(now).then(({ slots }) =>
      slots["income-management"].filter((x) => x.date === "2026-11-25").map((x) => x.time),
    );
  assert.deepEqual(await wed(), ["13:00", "15:45", "20:30"]);

  const res = await addException(s, { date: "2026-11-25", kind: "close_day" }, now);
  assert.deepEqual(res, { ok: true, bookingsThatDay: 0 });
  assert.deepEqual(await wed(), []);

  assert.deepEqual(await addException(s, { date: "2026-11-01", kind: "close_day" }, now), {
    ok: false,
    error: "لا يمكن اختيار تاريخ سابق.",
  });

  const { weekly } = await getScheduleAdmin(s, now);
  const slot = weekly.find((w) => w.weekday === 1 && w.startTime === "13:00")!;
  await toggleWeeklySlot(s, slot.id, "active");
  const monday = (await getBookingOptions(now)).slots["income-management"].filter((x) => x.date === "2026-11-30");
  assert.deepEqual(monday.map((x) => x.time), ["15:45", "20:30"]);

  const actions = (await db.select().from(auditLog)).map((r) => r.action);
  assert.ok(actions.includes("admin.exception_added"));
  assert.ok(actions.includes("admin.weekly_slot_changed"));
});
