import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { clockTime, dateOf, fullDate, sar, timeRange } from "@/lib/format";
import { riyadhTime } from "@/lib/schedule";
import { STATUS_LABELS } from "@/lib/status";
import { getBookingDetail, type AdminAction } from "@/server/admin";
import { requireAdmin } from "@/server/session";
import { bookingAction } from "../../actions";
import { ConfirmAction } from "../../confirm-action";

export const metadata: Metadata = { title: "تفاصيل الحجز" };

const ACTIONS: Record<AdminAction, { label: string; confirm: string; danger?: boolean }> = {
  approve_cancel: {
    label: "الموافقة على الإلغاء",
    confirm: "سيُلغى الحجز، ويُعاد المبلغ تلقائيًا إلى بطاقة العميل عبر Stripe، ويصبح الموعد متاحًا لغيره.",
    danger: true,
  },
  cancel: {
    label: "إلغاء الحجز",
    confirm: "سيُلغى الحجز، وإذا كان مدفوعًا يُعاد المبلغ تلقائيًا عبر Stripe، ويصبح الموعد متاحًا لغيره.",
    danger: true,
  },
  complete: { label: "تمت الجلسة", confirm: "تسجيل الجلسة كمكتملة؟" },
  no_show: { label: "لم يحضر العميل", confirm: "تسجيل أن العميل لم يحضر؟" },
};

const HISTORY: Record<string, string> = {
  "booking.held": "حجز العميل الموعد مؤقتًا",
  "booking.rescheduled": "غيّر العميل الموعد",
  "booking.cancel_requested": "طلب العميل الإلغاء",
  "admin.approve_cancel": "وافق المشرف على الإلغاء",
  "admin.cancel": "ألغى المشرف الحجز",
  "admin.complete": "سُجّلت الجلسة كمكتملة",
  "admin.no_show": "سُجّل عدم حضور العميل",
  "booking.confirmed": "تأكد الحجز بعد الدفع",
  "payment.auto_refunded": "أُعيد المبلغ تلقائيًا",
};

const PAYMENT_STATUS: Record<string, string> = {
  pending: "صفحة الدفع مفتوحة",
  paid: "مدفوع",
  refunded: "مسترد",
};

const REFUND_REASON: Record<string, string> = {
  admin_cancel: "إلغاء من المشرف",
  slot_taken: "الموعد لم يعد متاحًا عند الدفع",
  duplicate_payment: "دفع مكرر",
  amount_mismatch: "مبلغ غير مطابق",
  booking_closed: "الحجز ملغي",
};

function when(iso: string) {
  return `${fullDate(dateOf(iso))}، ${clockTime(riyadhTime(new Date(iso)))}`;
}

export default async function AdminBookingPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  const { id } = await params;
  const b = await getBookingDetail(session, id);
  if (!b) notFound();
  const status = STATUS_LABELS[b.status];
  const history = b.history.filter((h) => HISTORY[h.action]);

  return (
    <>
      <Link href="/admin" className="text-sm text-muted underline">
        كل الحجوزات
      </Link>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold sm:text-3xl">{fullDate(dateOf(b.startsAt))}</h1>
        <span className={`rounded-full px-3 py-1 text-sm font-semibold ${status.tone}`}>{status.label}</span>
      </div>
      <p className="mt-2 text-lg text-muted">{timeRange(b.startsAt, b.endsAt)} · {b.serviceName}</p>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_20rem]">
        <section className="rounded-2xl bg-white p-6">
          <h2 className="mb-4 font-bold">العميل</h2>
          <dl className="space-y-4">
            <Item label="الاسم">{b.name}</Item>
            <Item label="واتساب">
              <a href={`https://wa.me/${b.phone.replace("+", "")}`} target="_blank" rel="noopener noreferrer" dir="ltr" className="underline">
                {b.phone}
              </a>
            </Item>
            <Item label="البريد الإلكتروني">
              <a href={`mailto:${b.email}`} dir="ltr" className="underline">{b.email}</a>
            </Item>
            <Item label="المبلغ">{sar(b.priceHalalas)}</Item>
            {b.followUpEndsAt ? <Item label="المتابعة حتى">{fullDate(dateOf(b.followUpEndsAt))}</Item> : null}
            <Item label="مرات تغيير الموعد">{b.rescheduleCount}</Item>
            <Item label="تاريخ الحجز">{when(b.createdAt)}</Item>
          </dl>
        </section>

        <aside className="space-y-6">
          <section className="rounded-2xl bg-white p-6">
            <h2 className="mb-4 font-bold">الإجراءات</h2>
            {b.allowed.length ? (
              <div className="flex flex-wrap gap-2">
                {b.allowed.map((a) => (
                  <ConfirmAction
                    key={a}
                    label={ACTIONS[a].label}
                    confirmText={ACTIONS[a].confirm}
                    danger={ACTIONS[a].danger}
                    action={bookingAction.bind(null, b.id, a)}
                  />
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted">لا توجد إجراءات متاحة لهذا الحجز.</p>
            )}
          </section>

          <section className="rounded-2xl bg-white p-6">
            <h2 className="mb-4 font-bold">الدفع</h2>
            {b.payments.length ? (
              <ul className="space-y-3 text-sm">
                {b.payments.map((p, i) => (
                  <li key={i}>
                    <p className="font-semibold">
                      {PAYMENT_STATUS[p.status] ?? p.status} · {sar(p.amountHalalas)}
                    </p>
                    {p.paidAt ? <p className="text-muted">دُفع: {when(p.paidAt)}</p> : null}
                    {p.refundedAt ? (
                      <p className="text-muted">
                        استُرد: {when(p.refundedAt)}
                        {p.refundReason ? ` (${REFUND_REASON[p.refundReason] ?? p.refundReason})` : ""}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">لا توجد عمليات دفع.</p>
            )}
            <p className="mt-4 text-xs text-muted">بيانات البطاقات محفوظة لدى Stripe فقط، ولا تصل إلى هذا الموقع.</p>
          </section>

          <section className="rounded-2xl bg-white p-6">
            <h2 className="mb-4 font-bold">السجل</h2>
            {history.length ? (
              <ol className="space-y-3 text-sm">
                {history.map((h, i) => (
                  <li key={i}>
                    <p className="font-semibold">{HISTORY[h.action]}</p>
                    <p className="text-muted">{when(h.at)}</p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-muted">لا يوجد سجل.</p>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-3 last:border-0">
      <dt className="text-muted">{label}</dt>
      <dd className="font-semibold">{children}</dd>
    </div>
  );
}
