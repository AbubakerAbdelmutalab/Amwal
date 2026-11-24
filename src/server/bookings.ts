import "server-only";
import { and, asc, count, eq, gt, gte, inArray, lte, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import { addMonths, availableSlots, riyadhDate, type Slot } from "@/lib/schedule";
import { clientDetailsSchema, maskEmail, maskPhone } from "@/lib/validation";
import {
  blindIndex,
  decrypt,
  encrypt,
  hasDataKeys,
  hashToken,
  isWellFormedToken,
  newAccessToken,
} from "./crypto";
import { databaseMode, getDb, type DB } from "./db/client";
import { pgCode } from "./db/errors";
import { isPaymentsConfigured } from "./stripe";
import {
  auditLog,
  bookings,
  clients,
  scheduleExceptions,
  services,
  weeklySlots,
  type BookingStatus,
} from "./db/schema";
import { getSettings, type Settings } from "./settings";

// Data access layer for bookings. Every database read and write for the public
// booking flow goes through here. Functions return small objects with only
// what the page needs; ids, hashes and ciphertext never leave this module.

type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
type Exec = DB | Tx;

export type BookingError =
  | "invalid"
  | "slot_unavailable"
  | "rate_limited"
  | "not_found"
  | "not_allowed"
  | "too_late";

export type Failure = {
  ok: false;
  error: BookingError;
  fields?: Partial<Record<string, string>>;
};

class Fail extends Error {
  constructor(readonly code: BookingError) {
    super(code);
  }
}

/**
 * Booking needs a database and the encryption keys. On the live site it also
 * needs payments configured and BOOKING_OPEN=true, so clients can never book
 * before the owner deliberately opens booking.
 */
export function isBookingEnabled(): boolean {
  if (databaseMode() === null || !hasDataKeys()) return false;
  if (process.env.NODE_ENV === "production") {
    return process.env.BOOKING_OPEN === "true" && isPaymentsConfigured();
  }
  return true;
}

export type ServiceOption = {
  id: string;
  name: string;
  durationMinutes: number;
  priceHalalas: number;
};

const ACTIVE_STATUSES: BookingStatus[] = ["confirmed", "cancel_requested"];

async function slotsFor(
  exec: Exec,
  service: { durationMinutes: number },
  now: Date,
  settings: Settings,
  excludeBookingId?: string,
): Promise<Slot[]> {
  const weekly = await exec
    .select({
      weekday: weeklySlots.weekday,
      startTime: weeklySlots.startTime,
      allowLong: weeklySlots.allowLong,
    })
    .from(weeklySlots)
    .where(eq(weeklySlots.active, true));

  const exceptions = await exec
    .select({
      date: scheduleExceptions.date,
      startTime: scheduleExceptions.startTime,
      closed: scheduleExceptions.closed,
    })
    .from(scheduleExceptions)
    .where(gte(scheduleExceptions.date, riyadhDate(now)));

  const busy = await exec
    .select({ start: bookings.startsAt, end: bookings.endsAt })
    .from(bookings)
    .where(
      and(
        or(
          inArray(bookings.status, ACTIVE_STATUSES),
          and(eq(bookings.status, "held"), gt(bookings.holdExpiresAt, now)),
        ),
        gt(bookings.endsAt, now),
        excludeBookingId ? ne(bookings.id, excludeBookingId) : undefined,
      ),
    );

  return availableSlots({
    weekly,
    exceptions,
    busy,
    durationMinutes: service.durationMinutes,
    now,
    minNoticeMinutes: settings.minNoticeHours * 60,
    horizonDays: settings.horizonDays,
  });
}

export async function getBookingOptions(now = new Date()): Promise<{
  services: ServiceOption[];
  slots: Record<string, Slot[]>;
}> {
  const db = await getDb();
  const settings = await getSettings(db);
  const rows = await db
    .select({
      id: services.id,
      name: services.name,
      durationMinutes: services.durationMinutes,
      priceHalalas: services.priceHalalas,
    })
    .from(services)
    .where(eq(services.active, true))
    .orderBy(asc(services.sortOrder));

  const slots: Record<string, Slot[]> = {};
  for (const s of rows) slots[s.id] = await slotsFor(db, s, now, settings);
  return { services: rows, slots };
}

async function expireStaleHolds(exec: Exec, now: Date) {
  await exec
    .update(bookings)
    .set({ status: "expired", updatedAt: now })
    .where(and(eq(bookings.status, "held"), lte(bookings.holdExpiresAt, now)));
}

async function audit(
  exec: Exec,
  action: string,
  bookingId: string | null,
  details: Record<string, unknown> = {},
) {
  await exec.insert(auditLog).values({ actor: "client", action, bookingId, details });
}

function fieldErrors(error: z.ZodError): Partial<Record<string, string>> {
  const out: Partial<Record<string, string>> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] ??= issue.message;
  }
  return out;
}

async function run<T>(fn: () => Promise<T>): Promise<T | Failure> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof Fail) return { ok: false, error: e.code };
    if (pgCode(e) === "23P01") return { ok: false, error: "slot_unavailable" };
    throw e;
  }
}

const holdSchema = clientDetailsSchema.extend({
  serviceId: z.string().max(64),
  startsAt: z.iso.datetime(),
});

/**
 * Creates a booking held for `holdMinutes` while the client pays.
 * Returns the private link token; only its hash is stored.
 */
export async function createHold(
  raw: unknown,
  ctx: { ip: string | null; now?: Date },
): Promise<{ ok: true; token: string } | Failure> {
  const parsed = holdSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "invalid", fields: fieldErrors(parsed.error) };
  }
  const input = parsed.data;
  const now = ctx.now ?? new Date();
  const startsAt = new Date(input.startsAt).toISOString();
  const db = await getDb();
  const settings = await getSettings(db);
  const ipHash = ctx.ip ? blindIndex(ctx.ip, "ip") : null;
  const { token, hash } = newAccessToken();

  return run(() =>
    db.transaction(async (tx) => {
      await expireStaleHolds(tx, now);

      if (ipHash) {
        const [{ recent }] = await tx
          .select({ recent: count() })
          .from(bookings)
          .where(
            and(
              eq(bookings.ipHash, ipHash),
              gt(bookings.createdAt, new Date(now.getTime() - 60 * 60 * 1000)),
            ),
          );
        if (Number(recent) >= settings.maxHoldsPerIpPerHour) throw new Fail("rate_limited");
      }

      const [service] = await tx
        .select()
        .from(services)
        .where(and(eq(services.id, input.serviceId), eq(services.active, true)));
      if (!service) throw new Fail("invalid");

      const encrypted = {
        nameEnc: encrypt(input.name, "client.name"),
        emailEnc: encrypt(input.email, "client.email"),
      };
      const [client] = await tx
        .insert(clients)
        .values({
          ...encrypted,
          phoneEnc: encrypt(input.phone, "client.phone"),
          phoneHash: blindIndex(input.phone, "client.phone"),
        })
        .onConflictDoUpdate({
          target: clients.phoneHash,
          set: { ...encrypted, updatedAt: now },
        })
        .returning({ id: clients.id });

      // One held slot per client: choosing a new time releases the previous one.
      await tx
        .update(bookings)
        .set({ status: "expired", updatedAt: now })
        .where(and(eq(bookings.clientId, client.id), eq(bookings.status, "held")));

      const slot = (await slotsFor(tx, service, now, settings)).find(
        (s) => s.startsAt === startsAt,
      );
      if (!slot) throw new Fail("slot_unavailable");

      const [booking] = await tx
        .insert(bookings)
        .values({
          clientId: client.id,
          serviceId: service.id,
          startsAt: new Date(slot.startsAt),
          endsAt: new Date(slot.endsAt),
          status: "held",
          priceHalalas: service.priceHalalas,
          accessTokenHash: hash,
          holdExpiresAt: new Date(now.getTime() + settings.holdMinutes * 60 * 1000),
          ipHash,
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: bookings.id });

      await audit(tx, "booking.held", booking.id, { serviceId: service.id });
      return { ok: true as const, token };
    }),
  );
}

export type BookingView = {
  status: BookingStatus;
  serviceId: string;
  serviceName: string;
  priceHalalas: number;
  startsAt: string;
  endsAt: string;
  holdExpiresAt: string | null;
  followUpEndsAt: string | null;
  meetLink: string | null;
  name: string;
  phoneMasked: string;
  emailMasked: string;
  canReschedule: boolean;
  canRequestCancel: boolean;
  canPay: boolean;
  rescheduleCutoffHours: number;
};

export async function findByToken(exec: Exec, token: string, lock = false) {
  if (!isWellFormedToken(token)) return null;
  const query = exec
    .select()
    .from(bookings)
    .where(eq(bookings.accessTokenHash, hashToken(token)));
  const [row] = lock ? await query.for("update") : await query;
  return row ?? null;
}

/** Everything the client's private booking page shows. */
export async function getBookingForToken(
  token: string,
  now = new Date(),
): Promise<BookingView | null> {
  const db = await getDb();
  const b = await findByToken(db, token);
  if (!b) return null;
  const settings = await getSettings(db);
  const [service] = await db.select().from(services).where(eq(services.id, b.serviceId));
  const [client] = await db.select().from(clients).where(eq(clients.id, b.clientId));

  const status: BookingStatus =
    b.status === "held" && b.holdExpiresAt && b.holdExpiresAt <= now ? "expired" : b.status;
  const cutoff = b.startsAt.getTime() - settings.rescheduleCutoffHours * 60 * 60 * 1000;

  return {
    status,
    serviceId: b.serviceId,
    serviceName: service.name,
    priceHalalas: b.priceHalalas,
    startsAt: b.startsAt.toISOString(),
    endsAt: b.endsAt.toISOString(),
    holdExpiresAt: b.holdExpiresAt?.toISOString() ?? null,
    followUpEndsAt: b.followUpEndsAt?.toISOString() ?? null,
    meetLink: status === "confirmed" ? b.meetLink : null,
    name: decrypt(client.nameEnc, "client.name"),
    phoneMasked: maskPhone(decrypt(client.phoneEnc, "client.phone")),
    emailMasked: maskEmail(decrypt(client.emailEnc, "client.email")),
    canReschedule: status === "confirmed" && now.getTime() < cutoff,
    canRequestCancel: status === "confirmed" && now < b.startsAt,
    canPay: status === "held" && isPaymentsConfigured(),
    rescheduleCutoffHours: settings.rescheduleCutoffHours,
  };
}

/** Slots a confirmed booking can move to (its own current slot excluded from busy). */
export async function getRescheduleSlots(token: string, now = new Date()): Promise<Slot[] | null> {
  const db = await getDb();
  const b = await findByToken(db, token);
  if (!b) return null;
  const settings = await getSettings(db);
  const [service] = await db.select().from(services).where(eq(services.id, b.serviceId));
  return (await slotsFor(db, service, now, settings, b.id)).filter(
    (s) => s.startsAt !== b.startsAt.toISOString(),
  );
}

export async function rescheduleBooking(
  token: string,
  rawStartsAt: unknown,
  now = new Date(),
): Promise<{ ok: true } | Failure> {
  const parsed = z.iso.datetime().safeParse(rawStartsAt);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const startsAt = new Date(parsed.data).toISOString();
  const db = await getDb();
  const settings = await getSettings(db);

  return run(() =>
    db.transaction(async (tx) => {
      const b = await findByToken(tx, token, true);
      if (!b) throw new Fail("not_found");
      if (b.status !== "confirmed") throw new Fail("not_allowed");
      const cutoff = b.startsAt.getTime() - settings.rescheduleCutoffHours * 60 * 60 * 1000;
      if (now.getTime() >= cutoff) throw new Fail("too_late");

      const [service] = await tx.select().from(services).where(eq(services.id, b.serviceId));
      const slot = (await slotsFor(tx, service, now, settings, b.id)).find(
        (s) => s.startsAt === startsAt,
      );
      if (!slot) throw new Fail("slot_unavailable");

      const endsAt = new Date(slot.endsAt);
      await tx
        .update(bookings)
        .set({
          startsAt: new Date(slot.startsAt),
          endsAt,
          followUpEndsAt: addMonths(endsAt, settings.followUpMonths),
          rescheduleCount: sql`${bookings.rescheduleCount} + 1`,
          updatedAt: now,
        })
        .where(eq(bookings.id, b.id));

      await audit(tx, "booking.rescheduled", b.id, {
        from: b.startsAt.toISOString(),
        to: slot.startsAt,
      });
      return { ok: true as const };
    }),
  );
}

/** The client asks to cancel; the admin approves the refund later. */
export async function requestCancellation(
  token: string,
  now = new Date(),
): Promise<{ ok: true } | Failure> {
  const db = await getDb();
  return run(() =>
    db.transaction(async (tx) => {
      const b = await findByToken(tx, token, true);
      if (!b) throw new Fail("not_found");
      if (b.status !== "confirmed" || now >= b.startsAt) throw new Fail("not_allowed");
      await tx
        .update(bookings)
        .set({ status: "cancel_requested", cancelRequestedAt: now, updatedAt: now })
        .where(eq(bookings.id, b.id));
      await audit(tx, "booking.cancel_requested", b.id);
      return { ok: true as const };
    }),
  );
}
