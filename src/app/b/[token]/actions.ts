"use server";

import "server-only";
import {
  requestCancellation,
  rescheduleBooking,
  type BookingError,
} from "@/server/bookings";

// The token in the private link is the client's credential. It is checked
// against its stored hash inside the data access layer on every call.

type Result = { ok: true } | { ok: false; error: BookingError | "unexpected" };

export async function rescheduleAction(token: unknown, startsAt: unknown): Promise<Result> {
  if (typeof token !== "string") return { ok: false, error: "not_found" };
  try {
    return await rescheduleBooking(token, startsAt);
  } catch (e) {
    console.error("reschedule failed", e instanceof Error ? e.message : e);
    return { ok: false, error: "unexpected" };
  }
}

export async function cancelAction(token: unknown): Promise<Result> {
  if (typeof token !== "string") return { ok: false, error: "not_found" };
  try {
    return await requestCancellation(token);
  } catch (e) {
    console.error("cancel request failed", e instanceof Error ? e.message : e);
    return { ok: false, error: "unexpected" };
  }
}
