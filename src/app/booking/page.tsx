import type { Metadata } from "next";
import { ButtonLink } from "@/components/button-link";
import { SimplePage } from "@/components/simple-page";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getBookingOptions, isBookingEnabled } from "@/server/bookings";
import { BookingFlow } from "./booking-flow";

export const metadata: Metadata = { title: "احجز جلستك" };

export default async function BookingPage({
  searchParams,
}: {
  searchParams: Promise<{ service?: string | string[] }>;
}) {
  const { service } = await searchParams;

  if (!isBookingEnabled()) {
    return (
      <SimplePage title="الحجز الإلكتروني قريبًا">
        <p>نعمل على تجهيز صفحة الحجز، وستكون متاحة قريبًا.</p>
        <ButtonLink href="/" variant="secondary" className="mt-4">
          العودة إلى الصفحة الرئيسية
        </ButtonLink>
      </SimplePage>
    );
  }

  const { services, slots } = await getBookingOptions();
  const initial = services.find((s) => s.id === service)?.id ?? null;

  return (
    <>
      <SiteHeader />
      <main className="mx-auto min-h-[60vh] max-w-2xl px-5 py-12 sm:py-16">
        <h1 className="mb-8 text-3xl font-bold sm:text-4xl">احجز جلستك</h1>
        <BookingFlow services={services} slots={slots} initialServiceId={initial} />
      </main>
      <SiteFooter />
    </>
  );
}
