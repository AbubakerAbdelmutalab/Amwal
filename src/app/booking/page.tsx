import type { Metadata } from "next";
import { ButtonLink } from "@/components/button-link";
import { SimplePage } from "@/components/simple-page";

export const metadata: Metadata = { title: "احجز جلستك" };

// Placeholder until the booking flow is built in Phase 2.
export default function BookingPage() {
  return (
    <SimplePage title="الحجز الإلكتروني قريبًا">
      <p>نعمل على تجهيز صفحة الحجز، وستكون متاحة قريبًا.</p>
      <ButtonLink href="/" variant="secondary" className="mt-4">
        العودة إلى الصفحة الرئيسية
      </ButtonLink>
    </SimplePage>
  );
}
