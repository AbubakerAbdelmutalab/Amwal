import "server-only";
import Stripe from "stripe";

// Stripe client. The secret key and webhook secret come from environment
// variables set in Vercel; they are never sent to the browser.
//
//   STRIPE_SECRET_KEY      sk_test_… (test) or sk_live_… (live)
//   STRIPE_WEBHOOK_SECRET  whsec_…, used to verify that events come from Stripe

/** The parts of the Stripe client this app uses (tests replace it). */
export type StripeLike = {
  checkout: {
    sessions: {
      create: Stripe["checkout"]["sessions"]["create"];
      expire: Stripe["checkout"]["sessions"]["expire"];
    };
  };
  refunds: { create: Stripe["refunds"]["create"] };
};

const store = globalThis as unknown as { __amwalStripe?: StripeLike };

export function isPaymentsConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET);
}

export function stripe(): StripeLike {
  if (!store.__amwalStripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
    store.__amwalStripe = new Stripe(key, { maxNetworkRetries: 2, timeout: 20_000 });
  }
  return store.__amwalStripe;
}

export function setStripeForTests(client: StripeLike) {
  store.__amwalStripe = client;
}

/**
 * Checks the Stripe-Signature header against the raw request body.
 * Throws if the event was not sent by Stripe or was altered.
 */
export function verifyStripeEvent(rawBody: string, signature: string | null): Stripe.Event {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET is not set");
  if (!signature) throw new Error("Missing Stripe-Signature header");
  // A placeholder key is enough here: verification only uses the webhook secret.
  return new Stripe(process.env.STRIPE_SECRET_KEY || "sk_unused").webhooks.constructEvent(
    rawBody,
    signature,
    secret,
  );
}

/**
 * Public address of the site, used for Stripe's return links. Taken from
 * configuration, never from the request's Host header, so it cannot be spoofed.
 */
export function siteUrl(): string {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  return "http://localhost:3000";
}
