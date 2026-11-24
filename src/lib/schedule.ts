// Slot calculation. Pure functions: no database, no clock, easy to test.
// All schedule times are Riyadh local time. Saudi Arabia has no daylight
// saving, so Riyadh is always UTC+3.

const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000;
const MINUTE = 60 * 1000;

export type WeeklySlot = { weekday: number; startTime: string; allowLong: boolean };
export type ScheduleException = {
  date: string;
  startTime: string | null;
  closed: boolean;
};
export type Interval = { start: Date; end: Date };
export type Slot = {
  date: string; // YYYY-MM-DD, Riyadh
  time: string; // HH:MM, Riyadh
  startsAt: string; // ISO instant
  endsAt: string;
};

/** Sessions longer than this need a slot that allows long sessions. */
export const LONG_SESSION_THRESHOLD_MINUTES = 120;

export function riyadhDate(instant: Date): string {
  return new Date(instant.getTime() + RIYADH_OFFSET_MS).toISOString().slice(0, 10);
}

export function riyadhTime(instant: Date): string {
  return new Date(instant.getTime() + RIYADH_OFFSET_MS).toISOString().slice(11, 16);
}

export function riyadhToUtc(date: string, time: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  return new Date(Date.UTC(y, m - 1, d, hh, mm) - RIYADH_OFFSET_MS);
}

export function weekdayOf(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function addMonths(instant: Date, months: number): Date {
  const d = new Date(instant);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

/** Start times offered on one day, after applying exceptions. */
function startTimesFor(
  date: string,
  weekly: WeeklySlot[],
  exceptions: ScheduleException[],
): { time: string; allowLong: boolean }[] {
  const todays = exceptions.filter((e) => e.date === date);
  if (todays.some((e) => e.closed && e.startTime === null)) return [];

  const closedTimes = new Set(
    todays.filter((e) => e.closed && e.startTime).map((e) => e.startTime),
  );
  const byTime = new Map<string, boolean>();
  for (const w of weekly) {
    if (w.weekday === weekdayOf(date) && !closedTimes.has(w.startTime)) {
      byTime.set(w.startTime, w.allowLong);
    }
  }
  for (const e of todays) {
    if (!e.closed && e.startTime) byTime.set(e.startTime, true);
  }
  return [...byTime]
    .map(([time, allowLong]) => ({ time, allowLong }))
    .sort((a, b) => a.time.localeCompare(b.time));
}

export function availableSlots(input: {
  weekly: WeeklySlot[];
  exceptions: ScheduleException[];
  busy: Interval[];
  durationMinutes: number;
  now: Date;
  minNoticeMinutes: number;
  horizonDays: number;
}): Slot[] {
  const earliest = new Date(input.now.getTime() + input.minNoticeMinutes * MINUTE);
  const isLong = input.durationMinutes > LONG_SESSION_THRESHOLD_MINUTES;
  const today = riyadhDate(input.now);
  const slots: Slot[] = [];

  for (let i = 0; i < input.horizonDays; i++) {
    const date = addDays(today, i);
    for (const { time, allowLong } of startTimesFor(date, input.weekly, input.exceptions)) {
      if (isLong && !allowLong) continue;
      const start = riyadhToUtc(date, time);
      if (start < earliest) continue;
      const end = new Date(start.getTime() + input.durationMinutes * MINUTE);
      if (input.busy.some((b) => overlaps({ start, end }, b))) continue;
      slots.push({ date, time, startsAt: start.toISOString(), endsAt: end.toISOString() });
    }
  }
  return slots;
}
