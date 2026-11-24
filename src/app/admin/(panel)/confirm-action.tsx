"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function ConfirmAction({
  label,
  confirmText,
  action,
  danger = false,
}: {
  label: string;
  confirmText: string;
  action: () => Promise<{ ok: boolean }>;
  danger?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`h-11 rounded-full px-5 font-semibold ${
          danger ? "border border-red-200 text-red-800 hover:bg-red-50" : "border border-line hover:border-ink"
        }`}
      >
        {label}
      </button>
    );
  }

  return (
    <div className="w-full rounded-2xl border border-line p-4">
      <p className="leading-7">{confirmText}</p>
      {error ? <p role="alert" className="mt-2 text-sm text-red-700">{error}</p> : null}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const res = await action();
              if (res.ok) {
                setOpen(false);
                router.refresh();
              } else {
                setError("تعذّر تنفيذ الإجراء. حدّث الصفحة وحاول مرة أخرى.");
              }
            })
          }
          className={`h-10 rounded-full px-5 font-semibold text-white disabled:opacity-60 ${danger ? "bg-red-700" : "bg-ink"}`}
        >
          {pending ? "جارٍ التنفيذ…" : "تأكيد"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="h-10 rounded-full border border-line px-5">
          تراجع
        </button>
      </div>
    </div>
  );
}
