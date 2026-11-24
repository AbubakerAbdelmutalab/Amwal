"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { SlotPicker } from "@/components/slot-picker";
import { bookingErrorMessage } from "@/lib/messages";
import type { Slot } from "@/lib/schedule";
import { rescheduleAction } from "../actions";

export function RescheduleForm({ token, slots }: { token: string; slots: Slot[] }) {
  const router = useRouter();
  const [slot, setSlot] = useState<Slot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div>
      {error ? (
        <p role="alert" className="mb-6 rounded-2xl bg-mist p-4 leading-7">
          {error}
        </p>
      ) : null}
      <SlotPicker slots={slots} value={slot} onChange={setSlot} />
      <button
        type="button"
        disabled={!slot || pending}
        onClick={() =>
          startTransition(async () => {
            if (!slot) return;
            const res = await rescheduleAction(token, slot.startsAt);
            if (res.ok) {
              router.push(`/b/${token}`);
              router.refresh();
              return;
            }
            setError(bookingErrorMessage(res.error));
            setSlot(null);
            router.refresh();
          })
        }
        className="mt-8 h-13 w-full rounded-full bg-brand text-lg font-semibold text-ink transition-colors hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-40"
      >
        {pending ? "جارٍ تغيير الموعد…" : "تأكيد الموعد الجديد"}
      </button>
    </div>
  );
}
