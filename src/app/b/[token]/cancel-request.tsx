"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { bookingErrorMessage } from "@/lib/messages";
import { cancelAction } from "./actions";

export function CancelRequest({ token }: { token: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-sm text-muted underline hover:text-ink"
      >
        طلب إلغاء الحجز
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-line p-5">
      <p className="font-semibold">هل تريد إلغاء الحجز؟</p>
      <p className="mt-2 leading-7 text-muted">
        سنراجع طلبك، وبعد الموافقة يُعاد المبلغ تلقائيًا إلى بطاقتك.
      </p>
      {error ? <p role="alert" className="mt-3 text-red-700">{error}</p> : null}
      <div className="mt-4 flex gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const res = await cancelAction(token);
              if (res.ok) router.refresh();
              else setError(bookingErrorMessage(res.error));
            })
          }
          className="h-11 rounded-full bg-ink px-6 font-semibold text-white disabled:opacity-60"
        >
          {pending ? "جارٍ الإرسال…" : "نعم، أرسل طلب الإلغاء"}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="h-11 rounded-full border border-line px-6 font-semibold"
        >
          تراجع
        </button>
      </div>
    </div>
  );
}
