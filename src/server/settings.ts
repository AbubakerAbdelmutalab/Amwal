import "server-only";
import { z } from "zod";
import type { DB } from "./db/client";
import { settings } from "./db/schema";

// Operational settings, stored in the `settings` table so the admin dashboard
// can change them later. Missing or invalid values fall back to these defaults.
export const DEFAULT_SETTINGS = {
  holdMinutes: 10, // how long a slot is held while the client pays
  rescheduleCutoffHours: 3, // self-service reschedule closes this long before
  minNoticeHours: 3, // earliest a new booking can start from now
  horizonDays: 30, // how far ahead clients can book
  maxHoldsPerIpPerHour: 5, // abuse limit on new holds
  followUpMonths: 1, // follow-up window after the session
};

export type Settings = typeof DEFAULT_SETTINGS;

const positiveInt = z.coerce.number().int().positive();

export async function getSettings(db: DB): Promise<Settings> {
  const rows = await db.select().from(settings);
  const result: Settings = { ...DEFAULT_SETTINGS };
  for (const row of rows) {
    if (row.key in result) {
      const parsed = positiveInt.safeParse(row.value);
      if (parsed.success) result[row.key as keyof Settings] = parsed.data;
    }
  }
  return result;
}
