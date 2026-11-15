import Image from "next/image";
import Link from "next/link";
import { XButton } from "./x-link";

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-white">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 px-5 py-10 sm:flex-row">
        <div className="flex items-center gap-3">
          <Image
            src="/logo.png"
            alt="شعار أموال"
            width={40}
            height={40}
            className="size-10 rounded-xl"
          />
          <span className="text-sm text-muted">
            استشارات مالية شخصية
          </span>
        </div>

        <nav className="flex flex-wrap items-center justify-center gap-6 text-sm text-muted" aria-label="روابط التذييل">
          <XButton size="sm" />
          <Link href="/privacy" className="hover:text-ink">
            سياسة الخصوصية
          </Link>
          <Link href="/terms" className="hover:text-ink">
            الشروط والأحكام
          </Link>
        </nav>

        <p className="text-sm text-muted">
          © {new Date().getFullYear()} أموال. جميع الحقوق محفوظة.
        </p>
      </div>
    </footer>
  );
}
