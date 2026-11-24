import { databaseMode } from "@/server/db/client";
import { handleStripeEvent } from "@/server/payments";
import { isPaymentsConfigured, verifyStripeEvent } from "@/server/stripe";

// Stripe calls this address when a payment page is paid or expires.
// The signature is verified before anything is read from the event, so
// nobody but Stripe can confirm a booking.
export async function POST(request: Request) {
  if (!isPaymentsConfigured() || databaseMode() === null) {
    return new Response("Payments are not configured", { status: 503 });
  }

  const body = await request.text();
  let event;
  try {
    event = verifyStripeEvent(body, request.headers.get("stripe-signature"));
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  try {
    const outcome = await handleStripeEvent(event);
    return Response.json({ received: true, outcome });
  } catch (e) {
    // Stripe retries failed deliveries automatically.
    console.error("Stripe webhook failed", event.type, event.id, e instanceof Error ? e.message : e);
    return new Response("Processing failed", { status: 500 });
  }
}
