"use client";

import { useState } from "react";
import { dayMonth, timeRange, weekdayName } from "@/lib/format";
import type { Slot } from "@/lib/schedule";

export function SlotPicker({
  slots,
  value,
  onChange,
}: {
  slots: Slot[];
  value: Slot | null;
  onChange: (slot: Slot) => void;
}) {
  const days: string[] = [];
  for (const s of slots) if (!days.includes(s.date)) days.push(s.date);

  const [chosenDay, setChosenDay] = useState<string | null>(value?.date ?? null);
  const day = chosenDay && days.includes(chosenDay) ? chosenDay : days[0];

  if (days.length === 0) {
    return (
      <p className="rounded-2xl bg-mist p-6 text-center leading-8 text-muted">
        لا توجد مواعيد متاحة حاليًا. تابعنا على X لمعرفة المواعيد الجديدة.
      </p>
    );
  }

  return (
    <div>
      <p className="mb-3 text-sm font-semibold text-muted">اليوم</p>
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2" role="listbox" aria-label="اختر اليوم">
        {days.map((d) => {
          const active = d === day;
          return (
            <button
              key={d}
              type="button"
              role="option"
              aria-selected={active}
              onClick={() => setChosenDay(d)}
              className={`flex min-w-24 shrink-0 flex-col items-center rounded-2xl border px-4 py-3 transition-colors ${
                active ? "border-ink bg-ink text-white" : "border-line bg-white hover:border-ink"
              }`}
            >
              <span className="text-sm">{weekdayName(d)}</span>
              <span className="mt-1 font-bold">{dayMonth(d)}</span>
            </button>
          );
        })}
      </div>

      <p className="mb-3 mt-6 text-sm font-semibold text-muted">الوقت</p>
      <div className="grid gap-3 sm:grid-cols-3" role="listbox" aria-label="اختر الوقت">
        {slots
          .filter((s) => s.date === day)
          .map((s) => {
            const active = value?.startsAt === s.startsAt;
            return (
              <button
                key={s.startsAt}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => onChange(s)}
                className={`h-14 rounded-2xl border font-semibold transition-colors ${
                  active ? "border-ink bg-ink text-white" : "border-line bg-white hover:border-ink"
                }`}
              >
                {timeRange(s.startsAt, s.endsAt)}
              </button>
            );
          })}
      </div>
    </div>
  );
}
