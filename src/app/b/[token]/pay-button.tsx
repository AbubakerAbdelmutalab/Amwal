"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { bookingErrorMessage } from "@/lib/messages";
import { payAction } from "./actions";

export function PayButton({ token }: { token: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <div className="mt-5">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await payAction(token);
            if (res.ok && res.url.startsWith("https://checkout.stripe.com/")) {
              window.location.assign(res.url);
              return;
            }
            setError(bookingErrorMessage(res.ok ? "unexpected" : res.error));
            router.refresh();
          })
        }
        className="h-13 w-full rounded-full bg-brand text-lg font-semibold text-ink transition-colors hover:bg-brand-dark disabled:opacity-60"
      >
        {pending ? "جارٍ فتح صفحة الدفع…" : "إتمام الدفع"}
      </button>
      {error ? <p role="alert" className="mt-3 text-sm text-red-700">{error}</p> : null}
      <p className="mt-3 text-center text-sm text-muted">
        الدفع في صفحة Stripe الآمنة. لا نرى بيانات بطاقتك ولا نحفظها.
      </p>
    </div>
  );
}

/** After returning from Stripe: re-checks until Stripe's confirmation arrives. */
export function AwaitingConfirmation() {
  const router = useRouter();
  const [tries, setTries] = useState(0);
  useEffect(() => {
    if (tries >= 20) return;
    const id = setTimeout(() => {
      router.refresh();
      setTries((t) => t + 1);
    }, 3000);
    return () => clearTimeout(id);
  }, [tries, router]);

  return (
    <p className="leading-8">
      {tries < 20
        ? "استلمنا عملية الدفع، وجارٍ تأكيد الحجز… ستتحدث الصفحة تلقائيًا."
        : "لم يصلنا تأكيد الدفع بعد. إذا خُصم المبلغ فسيتأكد حجزك خلال دقائق، أو تواصل معنا على X."}
    </p>
  );
}
