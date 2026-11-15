import { ButtonLink } from "@/components/button-link";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { XButton, XIcon, X_HANDLE } from "@/components/x-link";
import { benefits, faqs, services, steps, vatNote } from "@/lib/content";

function Check({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      className={`mt-1 size-5 shrink-0 ${className}`}
    >
      <path
        d="M4.5 10.5l3.5 3.5 7.5-8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SectionTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <h2 className="text-3xl font-bold leading-snug sm:text-4xl">{title}</h2>
      {sub ? <p className="mt-4 text-lg leading-8 text-muted">{sub}</p> : null}
    </div>
  );
}

export default function HomePage() {
  return (
    <>
      <SiteHeader />

      <main>
        {/* Hero */}
        <section className="mx-auto max-w-6xl px-5 pb-20 pt-16 text-center sm:pb-28 sm:pt-24">
          <p className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full bg-mist px-4 py-2 text-sm font-medium text-muted">
            <span className="size-2 rounded-full bg-brand" aria-hidden="true" />
            استشارات مالية فردية عبر الإنترنت
          </p>
          <h1 className="mx-auto max-w-3xl text-4xl font-bold leading-[1.35] sm:text-6xl sm:leading-[1.3]">
            أموالك تستحق{" "}
            <span className="relative inline-block">
              <span className="relative z-10">خطة واضحة</span>
              <span
                className="absolute inset-x-0 bottom-1 z-0 h-3 rounded-sm bg-brand sm:bottom-2 sm:h-4"
                aria-hidden="true"
              />
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg leading-8 text-muted sm:text-xl sm:leading-9">
            جلسة واحدة نرتّب فيها دخلك ومصاريفك وأهدافك المالية، مع متابعة
            مباشرة لمدة شهر بعد الجلسة.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <ButtonLink href="/booking" className="w-full sm:w-auto">
              احجز جلستك الآن
            </ButtonLink>
            <ButtonLink
              href="/#services"
              variant="secondary"
              className="w-full sm:w-auto"
            >
              تعرّف على الاستشارات
            </ButtonLink>
          </div>
        </section>

        {/* Services */}
        <section id="services" className="scroll-mt-20 bg-mist py-20 sm:py-28">
          <div className="mx-auto max-w-6xl px-5">
            <SectionTitle
              title="اختر الاستشارة المناسبة لك"
              sub="أسعار واضحة، وتدفع مرة واحدة فقط."
            />

            <div className="mt-12 grid gap-6 lg:grid-cols-3">
              {services.map((s) => {
                const dark = s.featured;
                return (
                  <article
                    key={s.id}
                    className={`relative flex flex-col rounded-3xl p-8 ${
                      dark
                        ? "bg-ink text-white"
                        : "border border-line bg-white text-ink"
                    }`}
                  >
                    {dark ? (
                      <span className="absolute -top-3 start-8 rounded-full bg-brand px-4 py-1 text-sm font-semibold text-ink">
                        الأشمل
                      </span>
                    ) : null}

                    <h3 className="text-2xl font-bold">{s.name}</h3>
                    <p
                      className={`mt-3 leading-7 ${
                        dark ? "text-white/70" : "text-muted"
                      }`}
                    >
                      {s.summary}
                    </p>

                    <div className="mt-8 flex items-baseline gap-2">
                      <span className="text-5xl font-bold tracking-tight">
                        {s.price.toLocaleString("en-US")}
                      </span>
                      <span className="text-lg font-medium">ريال</span>
                    </div>
                    <p
                      className={`mt-2 text-sm ${
                        dark ? "text-white/60" : "text-muted"
                      }`}
                    >
                      {s.duration} · {vatNote}
                    </p>

                    <ul className="mt-8 flex-1 space-y-3">
                      {s.points.map((p) => (
                        <li key={p} className="flex gap-3 leading-7">
                          <Check
                            className={dark ? "text-brand" : "text-ink"}
                          />
                          <span>{p}</span>
                        </li>
                      ))}
                    </ul>

                    <ButtonLink
                      href={`/booking?service=${s.id}`}
                      variant={dark ? "primary" : "dark"}
                      className="mt-10 w-full"
                    >
                      احجز هذه الاستشارة
                    </ButtonLink>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="scroll-mt-20 py-20 sm:py-28">
          <div className="mx-auto max-w-6xl px-5">
            <SectionTitle title="ثلاث خطوات فقط" />
            <ol className="mt-12 grid gap-10 md:grid-cols-3">
              {steps.map((step, i) => (
                <li key={step.title} className="text-center">
                  <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-mist text-xl font-bold">
                    {i + 1}
                  </span>
                  <h3 className="mt-5 text-xl font-bold">{step.title}</h3>
                  <p className="mx-auto mt-3 max-w-xs leading-7 text-muted">
                    {step.text}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* What you get */}
        <section className="bg-mist py-20 sm:py-28">
          <div className="mx-auto max-w-6xl px-5">
            <SectionTitle title="ماذا تحصل عليه؟" />
            <div className="mt-12 grid gap-6 md:grid-cols-3">
              {benefits.map((b) => (
                <div
                  key={b.title}
                  className="rounded-3xl border border-line bg-white p-8"
                >
                  <span
                    className="block h-1 w-10 rounded-full bg-brand"
                    aria-hidden="true"
                  />
                  <h3 className="mt-6 text-xl font-bold">{b.title}</h3>
                  <p className="mt-3 leading-7 text-muted">{b.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="scroll-mt-20 py-20 sm:py-28">
          <div className="mx-auto max-w-3xl px-5">
            <SectionTitle title="الأسئلة الشائعة" />
            <div className="mt-10 divide-y divide-line border-y border-line">
              {faqs.map((f) => (
                <details key={f.q} className="group">
                  <summary className="flex cursor-pointer items-center justify-between gap-6 py-6 text-lg font-semibold">
                    {f.q}
                    <svg
                      viewBox="0 0 20 20"
                      fill="none"
                      aria-hidden="true"
                      className="size-5 shrink-0 transition-transform group-open:rotate-45"
                    >
                      <path
                        d="M10 4v12M4 10h12"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                    </svg>
                  </summary>
                  <p className="pb-6 leading-8 text-muted">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* X account */}
        <section className="px-5 pb-6">
          <div className="mx-auto flex max-w-6xl flex-col items-center gap-8 rounded-3xl bg-mist px-6 py-14 text-center md:flex-row md:justify-between md:px-14 md:text-start">
            <div className="flex flex-col items-center gap-6 md:flex-row">
              <span className="flex size-20 shrink-0 items-center justify-center rounded-full bg-ink text-white">
                <XIcon className="size-9" />
              </span>
              <div>
                <h2 className="text-3xl font-bold leading-snug sm:text-4xl">
                  تابع أموال على X
                </h2>
                <p className="mt-2 text-lg leading-8 text-muted">
                  أفكار ونصائح في إدارة المال وزيادة الدخل على حسابنا{" "}
                  <span dir="ltr" className="font-semibold text-ink">
                    {X_HANDLE}
                  </span>
                </p>
              </div>
            </div>
            <XButton className="w-full shrink-0 sm:w-auto" />
          </div>
        </section>

        {/* Closing call to action */}
        <section className="px-5 pb-20 sm:pb-28">
          <div className="mx-auto max-w-6xl rounded-3xl bg-ink px-6 py-16 text-center text-white sm:py-20">
            <h2 className="mx-auto max-w-xl text-3xl font-bold leading-snug sm:text-4xl">
              ابدأ بترتيب أموالك اليوم
            </h2>
            <p className="mx-auto mt-4 max-w-md text-lg leading-8 text-white/70">
              اختر الموعد المناسب لك واحجز جلستك في دقائق.
            </p>
            <ButtonLink href="/booking" className="mt-8">
              احجز جلستك الآن
            </ButtonLink>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
