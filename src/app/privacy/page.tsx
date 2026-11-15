import type { Metadata } from "next";
import { SimplePage } from "@/components/simple-page";

export const metadata: Metadata = { title: "سياسة الخصوصية" };

// Placeholder: the final policy text is added before launch.
export default function PrivacyPage() {
  return (
    <SimplePage title="سياسة الخصوصية">
      <p>سيُنشر نص سياسة الخصوصية هنا قبل إطلاق الموقع.</p>
    </SimplePage>
  );
}
