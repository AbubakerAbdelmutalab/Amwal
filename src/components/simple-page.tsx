import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";

// Shared shell for short text pages (booking placeholder, privacy, terms).
export function SimplePage({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto min-h-[60vh] max-w-3xl px-5 py-16 sm:py-24">
        <h1 className="text-3xl font-bold leading-snug sm:text-4xl">{title}</h1>
        <div className="mt-6 space-y-4 text-lg leading-8 text-muted">
          {children}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
