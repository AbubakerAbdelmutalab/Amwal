import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ButtonLink } from "@/components/button-link";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { clockTime, dateOf, fullDate, sar, timeRange } from "@/lib/format";
import { riyadhTime } from "@/lib/schedule";
import { getBookingForToken, isBookingEnabled, type BookingView } from "@/server/bookings";
import { CancelRequest } from "./cancel-request";

export const metadata: Metadata = {
  title: "حجزي",
  robots: { index: false, follow: false },
};

const STATUS: Record<BookingView["status"], { label: string; tone: string }> = {
  held: { label: "بانتظار الدفع", tone: "bg-brand text-ink" },
  confirmed: { label: "مؤكد", tone: "bg-ink text-white" },
  cancel_requested: { label: "طلب الإلغاء قيد المراجعة", tone: "bg-mist text-ink" },
  cancelled: { label: "ملغي", tone: "bg-mist text-muted" },
  completed: { label: "مكتمل", tone: "bg-mist text-ink" },
  no_show: { label: "لم يتم الحضور", tone: "bg-mist text-muted" },
  expired: { label: "انتهت مهلة الحجز", tone: "bg-mist text-muted" },
};

export default async function BookingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!isBookingEnabled()) notFound();
  const b = await getBookingForToken(token);
  if (!b) notFound();

  const status = STATUS[b.status];

  return (
    <>
      <SiteHeader />
      <main className="mx-auto min-h-[60vh] max-w-2xl px-5 py-12 sm:py-16">
        <span className={`inline-block rounded-full px-4 py-1.5 text-sm font-semibold ${status.tone}`}>
          {status.label}
        </span>
        <h1 className="mt-5 text-3xl font-bold leading-snug sm:text-4xl">{fullDate(dateOf(b.startsAt))}</h1>
        <p className="mt-2 text-xl text-muted">{timeRange(b.startsAt, b.endsAt)} · بتوقيت الرياض</p>

        <div className="mt-8">
          <StatusPanel b={b} token={token} />
        </div>

        <dl className="mt-8 divide-y divide-line rounded-2xl border border-line">
          <Row label="الاستشارة" value={b.serviceName} />
          <Row label="المبلغ" value={`${sar(b.priceHalalas)} · شامل ضريبة القيمة المضافة`} />
          <Row label="الاسم" value={b.name} />
          <Row label="واتساب" value={<span dir="ltr">{b.phoneMasked}</span>} />
          <Row label="البريد الإلكتروني" value={<span dir="ltr">{b.emailMasked}</span>} />
        </dl>

        <p className="mt-6 text-sm leading-6 text-muted">
          احتفظ بهذا الرابط، فهو طريقك لإدارة حجزك، ولا تشاركه مع أحد.
        </p>
      </main>
      <SiteFooter />
    </>
  );
}

function StatusPanel({ b, token }: { b: BookingView; token: string }) {
  switch (b.status) {
    case "held":
      return (
        <Panel>
          <p className="leading-8">
            الموعد محجوز لك حتى الساعة{" "}
            <strong>{b.holdExpiresAt ? clockTime(riyadhTime(new Date(b.holdExpiresAt))) : ""}</strong>.
            أكمل الدفع لتأكيد الحجز.
          </p>
          <button
            type="button"
            disabled
            className="mt-5 h-13 w-full rounded-full bg-brand text-lg font-semibold text-ink opacity-50"
          >
            الدفع الإلكتروني قريبًا
          </button>
        </Panel>
      );
    case "expired":
      return (
        <Panel>
          <p className="leading-8">انتهت مهلة الحجز المؤقت. يمكنك اختيار موعد جديد.</p>
          <ButtonLink href={`/booking?service=${b.serviceId}`} className="mt-5 w-full">
            اختر موعدًا جديدًا
          </ButtonLink>
        </Panel>
      );
    case "confirmed":
      return (
        <Panel>
          {b.meetLink ? (
            <a
              href={b.meetLink}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-13 w-full items-center justify-center rounded-full bg-brand text-lg font-semibold text-ink hover:bg-brand-dark"
            >
              دخول الجلسة عبر Google Meet
            </a>
          ) : (
            <p className="leading-8">يصلك رابط الجلسة على واتساب والبريد الإلكتروني.</p>
          )}
          {b.followUpEndsAt ? (
            <p className="mt-4 leading-7 text-muted">
              المتابعة المباشرة متاحة حتى {fullDate(dateOf(b.followUpEndsAt))}.
            </p>
          ) : null}
          <div className="mt-6 flex flex-wrap items-center gap-4 border-t border-line pt-6">
            {b.canReschedule ? (
              <ButtonLink href={`/b/${token}/reschedule`} variant="secondary" size="sm">
                تغيير الموعد
              </ButtonLink>
            ) : (
              <p className="text-sm text-muted">
                تغيير الموعد متاح حتى {b.rescheduleCutoffHours} ساعات قبل الجلسة.
              </p>
            )}
          </div>
          {b.canRequestCancel ? (
            <div className="mt-4">
              <CancelRequest token={token} />
            </div>
          ) : null}
        </Panel>
      );
    case "cancel_requested":
      return (
        <Panel>
          <p className="leading-8">
            استلمنا طلب الإلغاء، وسنراجعه ونعيد المبلغ إلى وسيلة الدفع نفسها.
          </p>
        </Panel>
      );
    case "cancelled":
      return <Panel><p className="leading-8">تم إلغاء هذا الحجز.</p></Panel>;
    case "completed":
      return <Panel><p className="leading-8">انتهت الجلسة. شكرًا لثقتك بنا.</p></Panel>;
    case "no_show":
      return <Panel><p className="leading-8">لم يتم حضور هذه الجلسة.</p></Panel>;
  }
}

function Panel({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl bg-mist p-6">{children}</div>;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-4">
      <dt className="text-muted">{label}</dt>
      <dd className="text-end font-semibold">{value}</dd>
    </div>
  );
}
