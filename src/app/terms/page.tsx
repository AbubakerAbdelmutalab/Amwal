import type { Metadata } from "next";
import { SimplePage } from "@/components/simple-page";

export const metadata: Metadata = { title: "الشروط والأحكام" };

// Placeholder: the final terms text is added before launch.
export default function TermsPage() {
  return (
    <SimplePage title="الشروط والأحكام">
      <p>سيُنشر نص الشروط والأحكام هنا قبل إطلاق الموقع.</p>
    </SimplePage>
  );
}
