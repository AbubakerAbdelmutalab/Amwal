import Image from "next/image";
import Link from "next/link";
import { ButtonLink } from "./button-link";
import { XButton } from "./x-link";

const links = [
  { href: "/#services", label: "الاستشارات" },
  { href: "/#reviews", label: "آراء العملاء" },
  { href: "/#how", label: "كيف تعمل" },
  { href: "/#faq", label: "الأسئلة الشائعة" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:h-20">
        <Link href="/" className="flex items-center gap-3" aria-label="أموال — الصفحة الرئيسية">
          <Image
            src="/logo.png"
            alt="شعار أموال"
            width={48}
            height={48}
            priority
            className="size-10 rounded-xl sm:size-12"
          />
          <span className="text-lg font-bold">أموال</span>
        </Link>

        <nav className="hidden items-center gap-8 md:flex" aria-label="التنقل الرئيسي">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-[15px] font-medium text-muted transition-colors hover:text-ink"
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <XButton size="sm" compactOnMobile />
          <ButtonLink href="/booking" size="sm">
            احجز جلستك
          </ButtonLink>
        </div>
      </div>
    </header>
  );
}
