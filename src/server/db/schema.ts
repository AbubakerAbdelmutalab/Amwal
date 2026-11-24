import {
  bigserial,
  boolean,
  date,
  integer,
  jsonb,
  pgTable,
  serial,
  smallint,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

// Typed view of the tables created in ./migrations.ts. Constraints that Drizzle
// cannot express (the no-overlap exclusion constraint, row-level security)
// live only in the SQL migrations. Keep both files in sync.

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const services = pgTable("services", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  durationMinutes: integer("duration_minutes").notNull(),
  priceHalalas: integer("price_halalas").notNull(),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const weeklySlots = pgTable("weekly_slots", {
  id: serial("id").primaryKey(),
  weekday: smallint("weekday").notNull(), // 0 = Sunday … 6 = Saturday
  startTime: text("start_time").notNull(), // "HH:MM", Riyadh time
  allowLong: boolean("allow_long").notNull().default(true),
  active: boolean("active").notNull().default(true),
});

export const scheduleExceptions = pgTable("schedule_exceptions", {
  id: serial("id").primaryKey(),
  date: date("date", { mode: "string" }).notNull(),
  startTime: text("start_time"), // null = the whole day
  closed: boolean("closed").notNull().default(true), // false = extra slot
  note: text("note"),
});

// Personal data is stored encrypted. phone_hash is a keyed hash used only to
// recognise a returning client.
export const clients = pgTable("clients", {
  id: uuid("id").primaryKey().defaultRandom(),
  nameEnc: text("name_enc").notNull(),
  phoneEnc: text("phone_enc").notNull(),
  emailEnc: text("email_enc").notNull(),
  phoneHash: text("phone_hash").notNull().unique(),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const BOOKING_STATUSES = [
  "held",
  "confirmed",
  "cancel_requested",
  "cancelled",
  "completed",
  "no_show",
  "expired",
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const bookings = pgTable("bookings", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id").notNull().references(() => clients.id),
  serviceId: text("service_id").notNull().references(() => services.id),
  startsAt: ts("starts_at").notNull(),
  endsAt: ts("ends_at").notNull(),
  status: text("status").$type<BookingStatus>().notNull(),
  priceHalalas: integer("price_halalas").notNull(),
  accessTokenHash: text("access_token_hash").notNull().unique(),
  holdExpiresAt: ts("hold_expires_at"),
  ipHash: text("ip_hash"),
  meetLink: text("meet_link"),
  followUpEndsAt: ts("follow_up_ends_at"),
  rescheduleCount: integer("reschedule_count").notNull().default(0),
  confirmedAt: ts("confirmed_at"),
  cancelRequestedAt: ts("cancel_requested_at"),
  cancelledAt: ts("cancelled_at"),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const adminSessions = pgTable("admin_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  tokenHash: text("token_hash").notNull().unique(),
  createdAt: ts("created_at").notNull().defaultNow(),
  lastSeenAt: ts("last_seen_at").notNull().defaultNow(),
  expiresAt: ts("expires_at").notNull(),
  ipHash: text("ip_hash"),
  userAgent: text("user_agent"),
});

export const loginAttempts = pgTable("login_attempts", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  at: ts("at").notNull().defaultNow(),
  ipHash: text("ip_hash").notNull(),
  success: boolean("success").notNull(),
});

// Never put personal data in `details`.
export const auditLog = pgTable("audit_log", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  at: ts("at").notNull().defaultNow(),
  actor: text("actor").notNull(), // client | admin | system
  action: text("action").notNull(),
  bookingId: uuid("booking_id").references(() => bookings.id, {
    onDelete: "set null",
  }),
  details: jsonb("details").notNull().default({}),
});
