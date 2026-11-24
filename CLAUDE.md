# Amwal.School

Arabic website for booking and paying for personal-finance consulting sessions.
One consultant, based in Riyadh, Saudi Arabia.

## Commands

```
npm install        # install dependencies
npm run dev        # local server at http://localhost:3000
npm run build      # production build (also type-checks)
npm run typecheck  # TypeScript only
npm test           # unit + database tests (embedded Postgres, no setup needed)
npm run keys:generate  # print new encryption keys
npm run db:migrate     # apply migrations to DATABASE_URL (hosted database)
```

Development needs no database server: without `DATABASE_URL`, an embedded
Postgres (PGlite) is created in `./.data` (git-ignored) with migrations and seed
data applied automatically. Only one process can open it at a time, so stop
`npm run dev` before running scripts against it. Local keys live in `.env.local`.

## Stack

- Next.js 16 (App Router) + TypeScript, Tailwind CSS v4
- PostgreSQL via Drizzle ORM: Supabase in production (`postgres` driver, v3),
  PGlite locally and in tests
- Planned: Moyasar, Google Calendar/Meet, WhatsApp Business API, Resend
- Hosting: Vercel, auto-deploys from `main`

## Layout

- `src/app/` — pages. `layout.tsx` sets `lang="ar" dir="rtl"` and the font.
- `src/app/globals.css` — design tokens (`brand`, `ink`, `mist`, `muted`, `line`).
- `src/components/` — shared UI (`ButtonLink`, header, footer, `SimplePage`).
- `src/lib/content.ts` — all public Arabic copy, services and prices.
- `src/lib/schedule.ts` — pure slot rules (Riyadh = UTC+3, no DST); `format.ts`
  hand-written Arabic date/time labels (identical on server and browser).
- `src/server/` — server-only code. `bookings.ts` is the data access layer: the
  only module that queries booking data or decrypts personal data, and it
  returns small view objects. `crypto.ts` encryption; `db/schema.ts` +
  `db/migrations.ts` (keep in sync); `settings.ts` defaults.
- `src/app/booking/` — booking flow; `src/app/b/[token]/` — client's private
  booking page, reschedule, cancellation request.
- `tests/` — node:test via tsx (`--conditions=react-server` for `server-only`).
- `public/logo.png` — official logo (low resolution; replace with SVG when supplied).

## Security model

- **Personal data** (name, phone, email) is encrypted per field with AES-256-GCM
  (`src/server/crypto.ts`), with the field name bound as associated data. Keys
  are env vars (`DATA_ENCRYPTION_KEY`, `DATA_HASH_KEY`), never in the database or
  repo; a leaked database or backup holds only ciphertext. Rotation:
  set the old key as `DATA_ENCRYPTION_KEY_PREVIOUS`.
- **Lookups** use keyed HMAC hashes (`phone_hash`, `ip_hash`), never raw values.
  Raw IP addresses are never stored.
- **Private booking links**: 256-bit random token; only its SHA-256 hash is stored.
  `/b/*` is `noindex` and `no-store`.
- **Database**: no browser access at all; all queries run on the server. Every
  table has row-level security on with no policies, and `anon`/`authenticated`
  are revoked, so Supabase's public Data API exposes nothing. Connections use TLS.
- **Double booking** is impossible: exclusion constraint `bookings_no_overlap`
  on active bookings. The server also re-checks that a requested time is a real
  available slot.
- **Abuse limits**: max holds per IP per hour; one held slot per client.
- **Input** validated with zod on the server; Server Actions get Next.js's
  Origin check (CSRF). Errors return codes, never internals.
- **Headers** (`next.config.ts`): CSP, HSTS, X-Frame-Options DENY, nosniff,
  Referrer-Policy, Permissions-Policy. Add Moyasar domains to the CSP in Phase 3.
- **Card data never touches this app** (Moyasar hosted form; Phase 3).
- Booking is switched off unless both a database and the keys are configured
  (`isBookingEnabled()`); production without them shows "قريبًا".
- Never log personal data; `audit_log.details` must not contain it.

## Conventions

- The site is Arabic only and fully RTL. Use Tailwind logical classes
  (`ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`), never `ml-`/`mr-`/`left-`/`right-`.
- Colours: yellow `#FFC000`, black `#111111`, white, light gray `#F7F7F7`.
  Yellow is only for booking buttons and small highlights, never large backgrounds
  and never as text on white.
- Style: minimalist and premium. Few elements per screen, no extra features,
  no complicated forms.
- Public wording goes in `src/lib/content.ts`, in natural Arabic. Prices use
  Western digits.
- Code and comments are in English.

## Approved product decisions

- **Services** (prices include 15% VAT; nothing is added at checkout):
  - إدارة الدخل — 2 hours — 650 SAR
  - زيادة الدخل — 2 hours — 650 SAR
  - الاستشارة الكاملة — 3 hours — 1,100 SAR
- **Weekly schedule** (configurable in admin; Friday closed):
  - Sat/Mon/Wed: 1:00 pm, 3:45 pm, 8:30 pm
  - Sun/Tue/Thu: 1:00 pm, 8:30 pm
- **Three-hour rule:** a 3-hour session starts at a normal slot time and runs one
  hour longer. On Sat/Mon/Wed a 1:00–4:00 session removes the 3:45 slot; if 3:45
  is already booked, 1:00 is offered for 2-hour sessions only. Each slot has an
  "allow three-hour sessions" switch. The database must reject overlapping bookings.
- **Booking:** pick service, pick time, enter name + WhatsApp number + email, pay.
  No client accounts; clients manage a booking through a private link.
  The slot is held for 10 minutes during payment.
- **Booking defaults** (`settings` table, `src/server/settings.ts`): bookings
  start at least 3 hours from now, up to 30 days ahead; max 5 holds per IP per
  hour. The 3-hour minimum notice was my default, not specified by the owner.
- **Prices** come from `src/lib/content.ts` and are seeded into the `services`
  table; the seed never overwrites existing rows, so a price change must be
  made in both places until the admin dashboard exists.
- **Payments:** Moyasar (Apple Pay, mada, cards, STC Pay). Full payment confirms
  the booking, only from a signature-verified, idempotent webhook. Credentials are
  configuration; development uses test mode.
- **Tax:** VAT rate, VAT number and receipt breakdown are admin settings, off by
  default. Receipts are plain payment receipts. Make no tax-compliance claims.
- **Sessions:** online only, Google Meet link created through Google Calendar.
- **Notifications:** WhatsApp Business API and email. Intake questions are sent by
  WhatsApp after payment; no website intake forms.
- **Reschedule:** self-service up to 3 hours before the session.
- **Cancellation:** client requests; admin approves the refund.
- **Follow-up:** a one-month follow-up window is recorded on each booking.
- **Admin:** one dashboard, email + password login.

- **Reviews:** the home page shows real client WhatsApp messages as static text
  in `src/lib/content.ts`, verbatim and without client names. There is no review
  submission or moderation workflow.
- **X account:** https://x.com/amwalschool is a main channel; it has a header
  button, a home-page section and a footer button (black, not yellow).

## Not in the first release

Review submission workflow, consultations counter, multiple consultants, in-person
sessions, packages, subscriptions, Tabby/Tamara, store (courses, booklet, Excel
sheet), AI intake assistant.

## Roadmap

1. Foundation, design system, home page — **done**
2. Booking: secure data layer, schedule, slot rules, holds, "my booking" page,
   reschedule, cancellation request — **done** (not live: no hosted database yet)
3. Payments: Moyasar test mode, webhooks, confirmation, receipts, refunds
4. Operations: admin dashboard (with two-factor login), Google Meet,
   notifications, intake message
5. Launch: Supabase + keys in Vercel, privacy policy and terms text, security
   review, phone testing, SEO, go-live

`/privacy` and `/terms` are placeholders until Phase 5. Held bookings cannot be
confirmed until Phase 3 (the pay button reads "قريبًا").
