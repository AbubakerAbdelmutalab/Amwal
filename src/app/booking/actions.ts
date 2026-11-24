"use server";

import "server-only";
import { createHold, type BookingError } from "@/server/bookings";
import { startCheckout } from "@/server/payments";
import { clientIp } from "@/server/request";
import { isPaymentsConfigured } from "@/server/stripe";

export type HoldActionResult =
  | { ok: true; token: string; checkoutUrl: string | null }
  | { ok: false; error: BookingError | "unexpected"; fields?: Partial<Record<string, string>> };

export async function createHoldAction(input: {
  serviceId: string;
  startsAt: string;
  name: string;
  phone: string;
  email: string;
}): Promise<HoldActionResult> {
  let hold;
  try {
    hold = await createHold(input, { ip: await clientIp() });
  } catch (e) {
    console.error("createHold failed", e instanceof Error ? e.message : e);
    return { ok: false, error: "unexpected" };
  }
  if (!hold.ok) return hold;

  // Go straight to Stripe's payment page. If that fails, the booking page
  // offers the payment button again.
  let checkoutUrl: string | null = null;
  if (isPaymentsConfigured()) {
    try {
      const checkout = await startCheckout(hold.token);
      if (checkout.ok) checkoutUrl = checkout.url;
    } catch (e) {
      console.error("startCheckout failed", e instanceof Error ? e.message : e);
    }
  }
  return { ok: true, token: hold.token, checkoutUrl };
}
