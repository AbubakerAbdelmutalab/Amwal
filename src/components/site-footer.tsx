import Image from "next/image";
import Link from "next/link";

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
            استشارات مالية شخصية — الرياض
          </span>
        </div>

        <nav className="flex flex-wrap items-center justify-center gap-6 text-sm text-muted" aria-label="روابط التذييل">
          <a
            href="https://x.com/amwalschool"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-10 items-center gap-2 rounded-full border border-line px-4 font-medium text-ink transition-colors hover:border-ink"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4 fill-current">
              <path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z" />
            </svg>
            تابعنا على X
          </a>
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
