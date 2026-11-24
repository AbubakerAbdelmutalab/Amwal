import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { dateOf, fullDate, timeRange } from "@/lib/format";
import { getBookingForToken, getRescheduleSlots, isBookingEnabled } from "@/server/bookings";
import { RescheduleForm } from "./reschedule-form";

export const metadata: Metadata = {
  title: "تغيير الموعد",
  robots: { index: false, follow: false },
};

export default async function ReschedulePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!isBookingEnabled()) notFound();
  const b = await getBookingForToken(token);
  if (!b) notFound();
  if (!b.canReschedule) redirect(`/b/${token}`);
  const slots = (await getRescheduleSlots(token)) ?? [];

  return (
    <>
      <SiteHeader />
      <main className="mx-auto min-h-[60vh] max-w-2xl px-5 py-12 sm:py-16">
        <Link href={`/b/${token}`} className="text-sm text-muted underline">
          العودة إلى الحجز
        </Link>
        <h1 className="mt-4 text-3xl font-bold sm:text-4xl">تغيير الموعد</h1>
        <p className="mt-3 leading-8 text-muted">
          موعدك الحالي: {fullDate(dateOf(b.startsAt))}، {timeRange(b.startsAt, b.endsAt)}
        </p>
        <div className="mt-8">
          <RescheduleForm token={token} slots={slots} />
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
