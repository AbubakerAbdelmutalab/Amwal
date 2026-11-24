"use client";

import { useActionState, useState } from "react";
import { addExceptionAction, addWeeklySlotAction, type FormState } from "../actions";

const field = "h-11 rounded-xl border border-line bg-white px-3 outline-none focus:border-ink";

function Message({ state }: { state: FormState }) {
  if (!state) return null;
  return (
    <p role="status" className={`text-sm ${state.ok ? "text-ink" : "text-red-700"}`}>
      {state.message}
    </p>
  );
}

export function ExceptionForm({ today }: { today: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(addExceptionAction, undefined);
  const [kind, setKind] = useState("close_day");

  return (
    <form action={action} className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <label className="flex flex-col gap-1 text-sm font-semibold">
          التاريخ
          <input type="date" name="date" min={today} required className={field} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          النوع
          <select name="kind" value={kind} onChange={(e) => setKind(e.target.value)} className={field}>
            <option value="close_day">إغلاق اليوم كاملًا</option>
            <option value="close_slot">إغلاق موعد واحد</option>
            <option value="add_slot">إضافة موعد إضافي</option>
          </select>
        </label>
        {kind !== "close_day" ? (
          <label className="flex flex-col gap-1 text-sm font-semibold">
            الوقت
            <input type="time" name="startTime" required className={field} />
          </label>
        ) : null}
      </div>
      <button type="submit" disabled={pending} className="h-11 rounded-full bg-ink px-6 font-semibold text-white disabled:opacity-60">
        {pending ? "جارٍ الحفظ…" : "حفظ"}
      </button>
      <Message state={state} />
    </form>
  );
}

const DAYS = [
  { v: 6, l: "السبت" }, { v: 0, l: "الأحد" }, { v: 1, l: "الاثنين" }, { v: 2, l: "الثلاثاء" },
  { v: 3, l: "الأربعاء" }, { v: 4, l: "الخميس" }, { v: 5, l: "الجمعة" },
];

export function WeeklySlotForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(addWeeklySlotAction, undefined);
  return (
    <form action={action} className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <label className="flex flex-col gap-1 text-sm font-semibold">
          اليوم
          <select name="weekday" className={field}>
            {DAYS.map((d) => (
              <option key={d.v} value={d.v}>{d.l}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          وقت البداية
          <input type="time" name="startTime" required className={field} />
        </label>
      </div>
      <button type="submit" disabled={pending} className="h-11 rounded-full border border-line px-6 font-semibold hover:border-ink disabled:opacity-60">
        {pending ? "جارٍ الإضافة…" : "إضافة موعد أسبوعي"}
      </button>
      <Message state={state} />
    </form>
  );
}
