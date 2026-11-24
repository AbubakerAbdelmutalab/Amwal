import "server-only";
import { and, asc, count, desc, eq, gt, gte, inArray, lte, or } from "drizzle-orm";
import { z } from "zod";
import { addDays, riyadhDate, riyadhToUtc } from "@/lib/schedule";
import type { AdminSession } from "./auth";
import { decrypt } from "./crypto";
import { getDb } from "./db/client";
import { paymentsForBooking, refundBookingPayments, type PaymentSummary } from "./payments";
import {
  auditLog,
  bookings,
  clients,
  scheduleExceptions,
  services,
  weeklySlots,
  type BookingStatus,
} from "./db/schema";

// Admin data access. Every function takes an AdminSession, which only
// requireAdmin() can produce, so none of this can run for a signed-out caller.
// Every change is written to the audit log.

function assertAdmin(session: AdminSession) {
  if (!session?.id) throw new Error("Unauthorized");
}

async function audit(action: string, bookingId: string | null, details: Record<string, unknown> = {}) {
  const db = await getDb();
  await db.insert(auditLog).values({ actor: "admin", action, bookingId, details });
}

const uuid = z.uuid();

export type AdminBookingRow = {
  id: string;
  status: BookingStatus;
  serviceName: string;
  startsAt: string;
  endsAt: string;
  priceHalalas: number;
  name: string;
  phone: string;
  email: string;
};

export type BookingListView = "upcoming" | "cancellations" | "past" | "all";

function effectiveStatus(b: { status: BookingStatus; holdExpiresAt: Date | null }, now: Date) {
  return b.status === "held" && b.holdExpiresAt && b.holdExpiresAt <= now ? "expired" : b.status;
}

export async function listBookings(
  session: AdminSession,
  view: BookingListView,
  now = new Date(),
): Promise<AdminBookingRow[]> {
  assertAdmin(session);
  const db = await getDb();
  const activeOrLiveHold = or(
    inArray(bookings.status, ["confirmed", "cancel_requested"]),
    and(eq(bookings.status, "held"), gt(bookings.holdExpiresAt, now)),
  );
  const where = {
    upcoming: and(gt(bookings.endsAt, now), activeOrLiveHold),
    cancellations: eq(bookings.status, "cancel_requested"),
    past: and(
      lte(bookings.endsAt, now),
      inArray(bookings.status, ["confirmed", "completed", "no_show", "cancelled"]),
    ),
    all: undefined,
  }[view];
  const order = view === "upcoming" || view === "cancellations" ? asc(bookings.startsAt) : desc(bookings.startsAt);

  const rows = await db
    .select({ b: bookings, serviceName: services.name, c: clients })
    .from(bookings)
    .innerJoin(services, eq(services.id, bookings.serviceId))
    .innerJoin(clients, eq(clients.id, bookings.clientId))
    .where(where)
    .orderBy(order)
    .limit(200);

  return rows.map(({ b, serviceName, c }) => ({
    id: b.id,
    status: effectiveStatus(b, now),
    serviceName,
    startsAt: b.startsAt.toISOString(),
    endsAt: b.endsAt.toISOString(),
    priceHalalas: b.priceHalalas,
    name: decrypt(c.nameEnc, "client.name"),
    phone: decrypt(c.phoneEnc, "client.phone"),
    email: decrypt(c.emailEnc, "client.email"),
  }));
}

export async function dashboardCounts(session: AdminSession, now = new Date()) {
  assertAdmin(session);
  const db = await getDb();
  const weekEnd = riyadhToUtc(addDays(riyadhDate(now), 7), "00:00");
  const countWhere = async (where: ReturnType<typeof and>) =>
    Number((await db.select({ n: count() }).from(bookings).where(where))[0].n);

  return {
    upcoming: await countWhere(
      and(gt(bookings.endsAt, now), inArray(bookings.status, ["confirmed", "cancel_requested"])),
    ),
    cancellations: await countWhere(eq(bookings.status, "cancel_requested")),
    nextSevenDays: await countWhere(
      and(
        gt(bookings.startsAt, now),
        lte(bookings.startsAt, weekEnd),
        eq(bookings.status, "confirmed"),
      ),
    ),
  };
}

export type AdminBookingDetail = AdminBookingRow & {
  followUpEndsAt: string | null;
  rescheduleCount: number;
  createdAt: string;
  meetLink: string | null;
  history: { at: string; actor: string; action: string }[];
  allowed: AdminAction[];
  payments: PaymentSummary[];
};

export type AdminAction = "approve_cancel" | "cancel" | "complete" | "no_show";

function allowedActions(b: { status: BookingStatus; startsAt: Date; endsAt: Date }, now: Date): AdminAction[] {
  const out: AdminAction[] = [];
  if (b.status === "cancel_requested") out.push("approve_cancel");
  if (b.status === "confirmed" || b.status === "held" || b.status === "cancel_requested") out.push("cancel");
  if (b.status === "confirmed" && b.startsAt <= now) out.push("complete", "no_show");
  return out;
}

export async function getBookingDetail(
  session: AdminSession,
  id: string,
  now = new Date(),
): Promise<AdminBookingDetail | null> {
  assertAdmin(session);
  if (!uuid.safeParse(id).success) return null;
  const db = await getDb();
  const [row] = await db
    .select({ b: bookings, serviceName: services.name, c: clients })
    .from(bookings)
    .innerJoin(services, eq(services.id, bookings.serviceId))
    .innerJoin(clients, eq(clients.id, bookings.clientId))
    .where(eq(bookings.id, id));
  if (!row) return null;
  const { b, serviceName, c } = row;
  const status = effectiveStatus(b, now);

  const history = await db
    .select({ at: auditLog.at, actor: auditLog.actor, action: auditLog.action })
    .from(auditLog)
    .where(eq(auditLog.bookingId, id))
    .orderBy(asc(auditLog.at));

  await audit("admin.view_booking", id);

  return {
    id: b.id,
    status,
    serviceName,
    startsAt: b.startsAt.toISOString(),
    endsAt: b.endsAt.toISOString(),
    priceHalalas: b.priceHalalas,
    name: decrypt(c.nameEnc, "client.name"),
    phone: decrypt(c.phoneEnc, "client.phone"),
    email: decrypt(c.emailEnc, "client.email"),
    followUpEndsAt: b.followUpEndsAt?.toISOString() ?? null,
    rescheduleCount: b.rescheduleCount,
    createdAt: b.createdAt.toISOString(),
    meetLink: b.meetLink,
    history: history.map((h) => ({ ...h, at: h.at.toISOString() })),
    allowed: status === "expired" ? [] : allowedActions(b, now),
    payments: await paymentsForBooking(b.id),
  };
}

const NEXT_STATUS: Record<AdminAction, BookingStatus> = {
  approve_cancel: "cancelled",
  cancel: "cancelled",
  complete: "completed",
  no_show: "no_show",
};

export async function applyBookingAction(
  session: AdminSession,
  id: unknown,
  action: unknown,
  now = new Date(),
): Promise<{ ok: true; refunded: number } | { ok: false; error: "not_found" | "not_allowed" | "refund_failed" }> {
  assertAdmin(session);
  const parsedId = uuid.safeParse(id);
  const parsedAction = z.enum(["approve_cancel", "cancel", "complete", "no_show"]).safeParse(action);
  if (!parsedId.success || !parsedAction.success) return { ok: false, error: "not_allowed" };
  const db = await getDb();

  try {
    return await db.transaction(async (tx) => {
    const [b] = await tx.select().from(bookings).where(eq(bookings.id, parsedId.data)).for("update");
    if (!b) return { ok: false as const, error: "not_found" as const };
    if (!allowedActions(b, now).includes(parsedAction.data)) {
      return { ok: false as const, error: "not_allowed" as const };
    }
    const next = NEXT_STATUS[parsedAction.data];
    // Cancelling refunds the client through Stripe first. If Stripe refuses,
    // the error rolls back the whole change.
    let refunded = 0;
    if (next === "cancelled") {
      try {
        refunded = await refundBookingPayments(tx, b.id, now);
      } catch (e) {
        throw new RefundFailed(e);
      }
    }
    await tx
      .update(bookings)
      .set({
        status: next,
        updatedAt: now,
        ...(next === "cancelled" ? { cancelledAt: now } : {}),
      })
      .where(eq(bookings.id, b.id));
    await tx.insert(auditLog).values({
      actor: "admin",
      action: `admin.${parsedAction.data}`,
      bookingId: b.id,
      details: { from: b.status, to: next, refunded },
    });
    return { ok: true as const, refunded };
    });
  } catch (e) {
    if (e instanceof RefundFailed) {
      console.error("refund failed", e.cause instanceof Error ? e.cause.message : e.cause);
      return { ok: false, error: "refund_failed" };
    }
    throw e;
  }
}

class RefundFailed extends Error {
  constructor(readonly cause: unknown) {
    super("refund failed");
  }
}

// ---------- Schedule ----------

export async function getScheduleAdmin(session: AdminSession, now = new Date()) {
  assertAdmin(session);
  const db = await getDb();
  const weekly = await db
    .select()
    .from(weeklySlots)
    .orderBy(asc(weeklySlots.weekday), asc(weeklySlots.startTime));
  const exceptions = await db
    .select()
    .from(scheduleExceptions)
    .where(gte(scheduleExceptions.date, riyadhDate(now)))
    .orderBy(asc(scheduleExceptions.date), asc(scheduleExceptions.startTime));
  return { weekly, exceptions };
}

export async function toggleWeeklySlot(session: AdminSession, id: unknown, field: unknown) {
  assertAdmin(session);
  const slotId = z.coerce.number().int().positive().safeParse(id);
  const which = z.enum(["active", "allowLong"]).safeParse(field);
  if (!slotId.success || !which.success) return { ok: false as const };
  const db = await getDb();
  const [slot] = await db.select().from(weeklySlots).where(eq(weeklySlots.id, slotId.data));
  if (!slot) return { ok: false as const };
  const value = !slot[which.data];
  await db.update(weeklySlots).set({ [which.data]: value }).where(eq(weeklySlots.id, slot.id));
  await audit("admin.weekly_slot_changed", null, {
    weekday: slot.weekday,
    startTime: slot.startTime,
    [which.data]: value,
  });
  return { ok: true as const };
}

const time = z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, "اكتب الوقت بصيغة صحيحة");

export async function addWeeklySlot(session: AdminSession, raw: unknown) {
  assertAdmin(session);
  const parsed = z
    .object({ weekday: z.coerce.number().int().min(0).max(6), startTime: time })
    .safeParse(raw);
  if (!parsed.success) return { ok: false as const, error: "تحقق من اليوم والوقت." };
  const db = await getDb();
  const inserted = await db
    .insert(weeklySlots)
    .values(parsed.data)
    .onConflictDoNothing()
    .returning({ id: weeklySlots.id });
  if (inserted.length === 0) return { ok: false as const, error: "هذا الموعد موجود بالفعل." };
  await audit("admin.weekly_slot_added", null, parsed.data);
  return { ok: true as const };
}

export async function addException(session: AdminSession, raw: unknown, now = new Date()) {
  assertAdmin(session);
  const parsed = z
    .object({
      date: z.iso.date("اختر التاريخ"),
      kind: z.enum(["close_day", "close_slot", "add_slot"]),
      startTime: z.string().optional(),
    })
    .safeParse(raw);
  if (!parsed.success) return { ok: false as const, error: "تحقق من البيانات." };
  const { date, kind } = parsed.data;
  if (date < riyadhDate(now)) return { ok: false as const, error: "لا يمكن اختيار تاريخ سابق." };

  let startTime: string | null = null;
  if (kind !== "close_day") {
    const t = time.safeParse(parsed.data.startTime);
    if (!t.success) return { ok: false as const, error: "اكتب الوقت بصيغة صحيحة." };
    startTime = t.data;
  }

  const db = await getDb();
  await db.insert(scheduleExceptions).values({ date, startTime, closed: kind !== "add_slot" });
  await audit("admin.exception_added", null, { date, kind, startTime });

  // Existing bookings are never changed automatically; report them instead.
  const dayStart = riyadhToUtc(date, "00:00");
  const dayEnd = riyadhToUtc(addDays(date, 1), "00:00");
  const [{ n }] = await db
    .select({ n: count() })
    .from(bookings)
    .where(
      and(
        gte(bookings.startsAt, dayStart),
        lte(bookings.startsAt, dayEnd),
        inArray(bookings.status, ["confirmed", "cancel_requested", "held"]),
      ),
    );
  return { ok: true as const, bookingsThatDay: Number(n) };
}

export async function deleteException(session: AdminSession, id: unknown) {
  assertAdmin(session);
  const parsed = z.coerce.number().int().positive().safeParse(id);
  if (!parsed.success) return { ok: false as const };
  const db = await getDb();
  const deleted = await db
    .delete(scheduleExceptions)
    .where(eq(scheduleExceptions.id, parsed.data))
    .returning();
  if (deleted.length) {
    await audit("admin.exception_removed", null, {
      date: deleted[0].date,
      startTime: deleted[0].startTime,
    });
  }
  return { ok: true as const };
}
