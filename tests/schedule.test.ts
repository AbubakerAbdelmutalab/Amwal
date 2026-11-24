import assert from "node:assert/strict";
import { test } from "node:test";
import {
  availableSlots,
  riyadhToUtc,
  weekdayOf,
  type Interval,
  type ScheduleException,
  type WeeklySlot,
} from "../src/lib/schedule";
import { clockTime, fullDate, timeRange } from "../src/lib/format";

const weekly: WeeklySlot[] = [
  ...[6, 1, 3].flatMap((weekday) =>
    ["13:00", "15:45", "20:30"].map((startTime) => ({ weekday, startTime, allowLong: true })),
  ),
  ...[0, 2, 4].flatMap((weekday) =>
    ["13:00", "20:30"].map((startTime) => ({ weekday, startTime, allowLong: true })),
  ),
];

// Monday 23 November 2026, 08:00 Riyadh.
const now = riyadhToUtc("2026-11-23", "08:00");

function slotsOn(
  date: string,
  opts: { duration?: number; busy?: Interval[]; exceptions?: ScheduleException[]; weekly?: WeeklySlot[] } = {},
) {
  return availableSlots({
    weekly: opts.weekly ?? weekly,
    exceptions: opts.exceptions ?? [],
    busy: opts.busy ?? [],
    durationMinutes: opts.duration ?? 120,
    now,
    minNoticeMinutes: 180,
    horizonDays: 14,
  })
    .filter((s) => s.date === date)
    .map((s) => s.time);
}

const at = (date: string, time: string, minutes: number): Interval => {
  const start = riyadhToUtc(date, time);
  return { start, end: new Date(start.getTime() + minutes * 60_000) };
};

test("weekly schedule: 3 slots Sat/Mon/Wed, 2 Sun/Tue/Thu, none Friday", () => {
  assert.equal(weekdayOf("2026-11-28"), 6);
  assert.deepEqual(slotsOn("2026-11-28"), ["13:00", "15:45", "20:30"]); // Saturday
  assert.deepEqual(slotsOn("2026-11-29"), ["13:00", "20:30"]); // Sunday
  assert.deepEqual(slotsOn("2026-11-24"), ["13:00", "20:30"]); // Tuesday
  assert.deepEqual(slotsOn("2026-11-27"), []); // Friday
});

test("a week holds 15 slots", () => {
  const all = availableSlots({
    weekly, exceptions: [], busy: [], durationMinutes: 120,
    now: riyadhToUtc("2026-11-28", "00:00"), minNoticeMinutes: 0, horizonDays: 7,
  });
  assert.equal(all.length, 15);
});

test("three-hour session at 1:00 removes the 3:45 slot that day", () => {
  const busy = [at("2026-11-25", "13:00", 180)];
  assert.deepEqual(slotsOn("2026-11-25", { busy }), ["20:30"]);
});

test("booked 3:45 slot leaves 1:00 open for two hours but not three", () => {
  const busy = [at("2026-11-25", "15:45", 120)];
  assert.deepEqual(slotsOn("2026-11-25", { busy }), ["13:00", "20:30"]);
  assert.deepEqual(slotsOn("2026-11-25", { busy, duration: 180 }), ["20:30"]);
});

test("three-hour sessions run 1:00–4:00, 3:45–6:45 and 8:30–11:30", () => {
  const slots = availableSlots({
    weekly, exceptions: [], busy: [], durationMinutes: 180, now,
    minNoticeMinutes: 180, horizonDays: 14,
  }).filter((s) => s.date === "2026-11-25");
  assert.deepEqual(
    slots.map((s) => timeRange(s.startsAt, s.endsAt)),
    ["1:00 م – 4:00 م", "3:45 م – 6:45 م", "8:30 م – 11:30 م"],
  );
});

test("a slot with three-hour sessions switched off is skipped for long sessions only", () => {
  const custom = weekly.map((w) =>
    w.weekday === 3 && w.startTime === "13:00" ? { ...w, allowLong: false } : w,
  );
  assert.deepEqual(slotsOn("2026-11-25", { weekly: custom, duration: 180 }), ["15:45", "20:30"]);
  assert.deepEqual(slotsOn("2026-11-25", { weekly: custom }), ["13:00", "15:45", "20:30"]);
});

test("exceptions close a day, close one slot, or add a slot", () => {
  assert.deepEqual(
    slotsOn("2026-11-25", { exceptions: [{ date: "2026-11-25", startTime: null, closed: true }] }),
    [],
  );
  assert.deepEqual(
    slotsOn("2026-11-25", { exceptions: [{ date: "2026-11-25", startTime: "15:45", closed: true }] }),
    ["13:00", "20:30"],
  );
  assert.deepEqual(
    slotsOn("2026-11-27", { exceptions: [{ date: "2026-11-27", startTime: "16:00", closed: false }] }),
    ["16:00"],
  );
});

test("slots starting within the notice period are not offered", () => {
  // 08:00 + 3 hours notice: 13:00 is still bookable today.
  assert.deepEqual(slotsOn("2026-11-23"), ["13:00", "15:45", "20:30"]);
  const later = availableSlots({
    weekly, exceptions: [], busy: [], durationMinutes: 120,
    now: riyadhToUtc("2026-11-23", "11:00"), minNoticeMinutes: 180, horizonDays: 1,
  });
  assert.deepEqual(later.map((s) => s.time), ["15:45", "20:30"]);
});

test("Riyadh is UTC+3 and Arabic labels are fixed", () => {
  assert.equal(riyadhToUtc("2026-11-23", "13:00").toISOString(), "2026-11-23T10:00:00.000Z");
  assert.equal(clockTime("13:00"), "1:00 م");
  assert.equal(clockTime("00:30"), "12:30 ص");
  assert.equal(fullDate("2026-11-28"), "السبت 28 نوفمبر 2026");
});
