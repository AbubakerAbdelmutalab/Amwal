import { riyadhDate, riyadhTime, weekdayOf } from "./schedule";

// Fixed Arabic formatting. Written by hand rather than with Intl so the server
// and the browser always produce identical text.

const WEEKDAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const MONTHS = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
];

export function weekdayName(date: string): string {
  return WEEKDAYS[weekdayOf(date)];
}

/** "15 نوفمبر" */
export function dayMonth(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}

/** "السبت 15 نوفمبر 2026" */
export function fullDate(date: string): string {
  return `${weekdayName(date)} ${dayMonth(date)} ${date.slice(0, 4)}`;
}

/** "13:00" → "1:00 م" */
export function clockTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const suffix = h < 12 ? "ص" : "م";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** "1:00 م – 3:00 م" for two instants, in Riyadh time. */
export function timeRange(startsAt: string | Date, endsAt: string | Date): string {
  return `${clockTime(riyadhTime(new Date(startsAt)))} – ${clockTime(riyadhTime(new Date(endsAt)))}`;
}

export function dateOf(instant: string | Date): string {
  return riyadhDate(new Date(instant));
}

/** 120 → "ساعتان", 180 → "3 ساعات" */
export function durationLabel(minutes: number): string {
  const h = minutes / 60;
  if (h === 1) return "ساعة";
  if (h === 2) return "ساعتان";
  if (Number.isInteger(h) && h <= 10) return `${h} ساعات`;
  return `${minutes} دقيقة`;
}

export function sar(halalas: number): string {
  return `${(halalas / 100).toLocaleString("en-US")} ريال`;
}
