# Amwal.School

Arabic website for booking and paying for personal-finance consulting sessions.
One consultant, based in Riyadh, Saudi Arabia.

## Commands

```
npm install        # install dependencies
npm run dev        # local server at http://localhost:3000
npm run build      # production build (also type-checks)
npm run typecheck  # TypeScript only
```

## Stack

- Next.js 16 (App Router) + TypeScript, Tailwind CSS v4
- Planned: PostgreSQL on Supabase with Drizzle, Moyasar, Google Calendar/Meet,
  WhatsApp Business API, Resend, Vercel hosting

## Layout

- `src/app/` — pages. `layout.tsx` sets `lang="ar" dir="rtl"` and the font.
- `src/app/globals.css` — design tokens (`brand`, `ink`, `mist`, `muted`, `line`).
- `src/components/` — shared UI (`ButtonLink`, header, footer, `SimplePage`).
- `src/lib/content.ts` — all public Arabic copy, services and prices.
- `public/logo.png` — official logo (low resolution; replace with SVG when supplied).

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
  - الاستشارتان معًا — 3 hours — 1,100 SAR
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

## Not in the first release

Reviews or testimonials, consultations counter, multiple consultants, in-person
sessions, packages, subscriptions, Tabby/Tamara, store (courses, booklet, Excel
sheet), AI intake assistant.

## Roadmap

1. Foundation, design system, home page — **done**
2. Booking: schedule, slot rules, holds, "my booking" page, reschedule
3. Payments: Moyasar test mode, webhooks, receipts, cancellation and refunds
4. Operations: admin dashboard, Google Meet, notifications, intake message
5. Launch: security review, phone testing, SEO, go-live

`/booking`, `/privacy` and `/terms` are placeholders until their phases.
