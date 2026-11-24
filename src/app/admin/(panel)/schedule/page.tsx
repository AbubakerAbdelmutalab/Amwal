import type { Metadata } from "next";
import { clockTime, fullDate } from "@/lib/format";
import { riyadhDate } from "@/lib/schedule";
import { getScheduleAdmin } from "@/server/admin";
import { requireAdmin } from "@/server/session";
import { deleteExceptionAction, toggleSlotAction } from "../actions";
import { ExceptionForm, WeeklySlotForm } from "./forms";

export const metadata: Metadata = { title: "الجدول" };

const WEEK = [
  { v: 6, l: "السبت" }, { v: 0, l: "الأحد" }, { v: 1, l: "الاثنين" }, { v: 2, l: "الثلاثاء" },
  { v: 3, l: "الأربعاء" }, { v: 4, l: "الخميس" }, { v: 5, l: "الجمعة" },
];

export default async function SchedulePage() {
  const session = await requireAdmin();
  const { weekly, exceptions } = await getScheduleAdmin(session);
  const today = riyadhDate(new Date());

  return (
    <>
      <h1 className="text-2xl font-bold sm:text-3xl">الجدول</h1>
      <p className="mt-2 text-muted">كل الأوقات بتوقيت الرياض. التغييرات لا تمس الحجوزات الموجودة.</p>

      <section className="mt-8 rounded-2xl bg-white p-6">
        <h2 className="font-bold">المواعيد الأسبوعية</h2>
        <div className="mt-4 divide-y divide-line">
          {WEEK.map((day) => {
            const slots = weekly.filter((w) => w.weekday === day.v);
            return (
              <div key={day.v} className="grid gap-3 py-4 sm:grid-cols-[7rem_1fr]">
                <p className="font-semibold">{day.l}</p>
                {slots.length === 0 ? (
                  <p className="text-muted">مغلق</p>
                ) : (
                  <ul className="space-y-2">
                    {slots.map((s) => (
                      <li key={s.id} className="flex flex-wrap items-center gap-2">
                        <span className={`w-20 font-semibold ${s.active ? "" : "text-muted line-through"}`}>
                          {clockTime(s.startTime)}
                        </span>
                        <Toggle id={s.id} field="active" on={s.active} onLabel="متاح" offLabel="موقوف" />
                        <Toggle
                          id={s.id}
                          field="allowLong"
                          on={s.allowLong}
                          onLabel="يقبل 3 ساعات"
                          offLabel="ساعتان فقط"
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-6 border-t border-line pt-6">
          <WeeklySlotForm />
        </div>
      </section>

      <section className="mt-6 rounded-2xl bg-white p-6">
        <h2 className="font-bold">إجازات وتغييرات ليوم محدد</h2>
        <div className="mt-4">
          <ExceptionForm today={today} />
        </div>
        {exceptions.length ? (
          <ul className="mt-6 divide-y divide-line border-t border-line">
            {exceptions.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-4 py-3">
                <span>
                  <span className="font-semibold">{fullDate(e.date)}</span>
                  <span className="ms-2 text-muted">
                    {e.startTime === null
                      ? "مغلق اليوم كاملًا"
                      : e.closed
                        ? `إغلاق موعد ${clockTime(e.startTime)}`
                        : `موعد إضافي ${clockTime(e.startTime)}`}
                  </span>
                </span>
                <form action={deleteExceptionAction}>
                  <input type="hidden" name="id" value={e.id} />
                  <button type="submit" className="text-sm text-muted underline hover:text-ink">حذف</button>
                </form>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </>
  );
}

function Toggle({ id, field, on, onLabel, offLabel }: {
  id: number; field: string; on: boolean; onLabel: string; offLabel: string;
}) {
  return (
    <form action={toggleSlotAction}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="field" value={field} />
      <button
        type="submit"
        title="اضغط للتغيير"
        className={`rounded-full px-3 py-1 text-xs font-semibold ${on ? "bg-ink text-white" : "bg-mist text-muted"}`}
      >
        {on ? onLabel : offLabel}
      </button>
    </form>
  );
}
