import Link from "next/link";
import { dateOf, dayMonth, timeRange, weekdayName } from "@/lib/format";
import { STATUS_LABELS } from "@/lib/status";
import { dashboardCounts, listBookings, type BookingListView } from "@/server/admin";
import { requireAdmin } from "@/server/session";

const VIEWS: { id: BookingListView; label: string }[] = [
  { id: "upcoming", label: "القادمة" },
  { id: "cancellations", label: "طلبات الإلغاء" },
  { id: "past", label: "السابقة" },
  { id: "all", label: "الكل" },
];

export default async function AdminBookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const session = await requireAdmin();
  const { view: raw } = await searchParams;
  const view = VIEWS.find((v) => v.id === raw)?.id ?? "upcoming";
  const counts = await dashboardCounts(session);
  const rows = await listBookings(session, view);

  return (
    <>
      <h1 className="text-2xl font-bold sm:text-3xl">الحجوزات</h1>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Stat label="جلسات قادمة مؤكدة" value={counts.upcoming} />
        <Stat label="خلال 7 أيام" value={counts.nextSevenDays} />
        <Stat label="طلبات إلغاء بانتظارك" value={counts.cancellations} highlight={counts.cancellations > 0} />
      </div>

      <nav className="mt-8 flex gap-2 overflow-x-auto pb-1" aria-label="تصفية الحجوزات">
        {VIEWS.map((v) => (
          <Link
            key={v.id}
            href={v.id === "upcoming" ? "/admin" : `/admin?view=${v.id}`}
            aria-current={v.id === view ? "page" : undefined}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold ${
              v.id === view ? "bg-ink text-white" : "bg-white text-ink hover:bg-line"
            }`}
          >
            {v.label}
          </Link>
        ))}
      </nav>

      <div className="mt-4 overflow-hidden rounded-2xl bg-white">
        {rows.length === 0 ? (
          <p className="p-10 text-center text-muted">لا توجد حجوزات هنا.</p>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((r) => {
              const status = STATUS_LABELS[r.status];
              const date = dateOf(r.startsAt);
              return (
                <li key={r.id}>
                  <Link
                    href={`/admin/bookings/${r.id}`}
                    className="grid gap-2 px-5 py-4 hover:bg-mist sm:grid-cols-[10rem_1fr_auto] sm:items-center sm:gap-6"
                  >
                    <span>
                      <span className="block font-bold">
                        {weekdayName(date)} {dayMonth(date)}
                      </span>
                      <span className="text-sm text-muted">{timeRange(r.startsAt, r.endsAt)}</span>
                    </span>
                    <span>
                      <span className="block font-semibold">{r.name}</span>
                      <span className="text-sm text-muted">{r.serviceName}</span>
                    </span>
                    <span className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ${status.tone}`}>
                      {status.label}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}

function Stat({ label, value, highlight = false }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className={`rounded-2xl p-5 ${highlight ? "bg-ink text-white" : "bg-white"}`}>
      <p className={`text-sm ${highlight ? "text-white/70" : "text-muted"}`}>{label}</p>
      <p className="mt-2 text-3xl font-bold">{value}</p>
    </div>
  );
}
