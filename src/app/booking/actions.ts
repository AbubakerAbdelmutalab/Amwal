"use server";

import "server-only";
import { createHold, type BookingError } from "@/server/bookings";
import { clientIp } from "@/server/request";

export type HoldActionResult =
  | { ok: true; token: string }
  | { ok: false; error: BookingError | "unexpected"; fields?: Partial<Record<string, string>> };

export async function createHoldAction(input: {
  serviceId: string;
  startsAt: string;
  name: string;
  phone: string;
  email: string;
}): Promise<HoldActionResult> {
  try {
    return await createHold(input, { ip: await clientIp() });
  } catch (e) {
    console.error("createHold failed", e instanceof Error ? e.message : e);
    return { ok: false, error: "unexpected" };
  }
}
