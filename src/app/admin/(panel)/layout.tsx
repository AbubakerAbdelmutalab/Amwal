import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { requireAdmin } from "@/server/session";
import { logoutAction } from "./actions";

export const metadata: Metadata = {
  title: { default: "لوحة الإدارة", template: "%s | لوحة الإدارة" },
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();

  return (
    <div className="min-h-screen bg-mist">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5">
          <Link href="/admin" className="flex items-center gap-3">
            <Image src="/logo.png" alt="شعار أموال" width={40} height={40} className="size-10 rounded-xl" />
            <span className="hidden font-bold sm:inline">لوحة الإدارة</span>
          </Link>
          <nav className="flex items-center gap-1 text-sm sm:gap-2">
            <Link href="/admin" className="rounded-full px-3 py-2 font-medium hover:bg-mist">
              الحجوزات
            </Link>
            <Link href="/admin/schedule" className="rounded-full px-3 py-2 font-medium hover:bg-mist">
              الجدول
            </Link>
            <form action={logoutAction}>
              <button type="submit" className="rounded-full px-3 py-2 text-muted hover:bg-mist hover:text-ink">
                خروج
              </button>
            </form>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-5 py-8 sm:py-10">{children}</main>
    </div>
  );
}
