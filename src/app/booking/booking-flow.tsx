"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { SlotPicker } from "@/components/slot-picker";
import { dateOf, durationLabel, fullDate, sar, timeRange } from "@/lib/format";
import { bookingErrorMessage } from "@/lib/messages";
import type { Slot } from "@/lib/schedule";
import { createHoldAction } from "./actions";

type Service = { id: string; name: string; durationMinutes: number; priceHalalas: number };
type Step = 1 | 2 | 3;

const STEPS = ["الاستشارة", "الموعد", "بياناتك"];

export function BookingFlow({
  services,
  slots,
  initialServiceId,
}: {
  services: Service[];
  slots: Record<string, Slot[]>;
  initialServiceId: string | null;
}) {
  const router = useRouter();
  const [serviceId, setServiceId] = useState<string | null>(initialServiceId);
  const [step, setStep] = useState<Step>(initialServiceId ? 2 : 1);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", email: "" });
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const service = services.find((s) => s.id === serviceId) ?? null;

  function chooseService(id: string) {
    setServiceId(id);
    setSlot(null);
    setMessage(null);
    setStep(2);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!service || !slot) return;
    setErrors({});
    setMessage(null);
    startTransition(async () => {
      const res = await createHoldAction({ ...form, serviceId: service.id, startsAt: slot.startsAt });
      if (res.ok) {
        if (res.checkoutUrl?.startsWith("https://checkout.stripe.com/")) {
          window.location.assign(res.checkoutUrl);
        } else {
          router.push(`/b/${res.token}`);
        }
        return;
      }
      if (res.error === "invalid" && res.fields) {
        setErrors(res.fields);
        return;
      }
      setMessage(bookingErrorMessage(res.error));
      if (res.error === "slot_unavailable") {
        setSlot(null);
        setStep(2);
        router.refresh();
      }
    });
  }

  return (
    <div>
      <ol className="mb-10 flex items-center gap-2 text-sm" aria-label="خطوات الحجز">
        {STEPS.map((label, i) => {
          const n = (i + 1) as Step;
          const state = n < step ? "done" : n === step ? "current" : "next";
          return (
            <li key={label} className="flex flex-1 items-center gap-2">
              <span
                className={`flex size-8 shrink-0 items-center justify-center rounded-full font-bold ${
                  state === "next" ? "bg-mist text-muted" : "bg-ink text-white"
                }`}
                aria-current={state === "current" ? "step" : undefined}
              >
                {n}
              </span>
              <span className={state === "next" ? "text-muted" : "font-semibold"}>{label}</span>
              {i < STEPS.length - 1 ? <span className="h-px flex-1 bg-line" aria-hidden="true" /> : null}
            </li>
          );
        })}
      </ol>

      {message ? (
        <p role="alert" className="mb-6 rounded-2xl bg-mist p-4 leading-7">
          {message}
        </p>
      ) : null}

      {step === 1 ? (
        <section>
          <h2 className="mb-5 text-xl font-bold">اختر الاستشارة</h2>
          <div className="space-y-3">
            {services.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => chooseService(s.id)}
                className={`flex w-full items-center justify-between gap-4 rounded-2xl border p-5 text-start transition-colors hover:border-ink ${
                  s.id === serviceId ? "border-ink" : "border-line"
                }`}
              >
                <span>
                  <span className="block text-lg font-bold">{s.name}</span>
                  <span className="mt-1 block text-sm text-muted">{durationLabel(s.durationMinutes)}</span>
                </span>
                <span className="text-lg font-bold">{sar(s.priceHalalas)}</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {step === 2 && service ? (
        <section>
          <div className="mb-6 flex items-center justify-between gap-4">
            <h2 className="text-xl font-bold">اختر الموعد</h2>
            <button type="button" onClick={() => setStep(1)} className="text-sm text-muted underline">
              {service.name} · تغيير
            </button>
          </div>
          <SlotPicker slots={slots[service.id] ?? []} value={slot} onChange={setSlot} />
          <button
            type="button"
            disabled={!slot}
            onClick={() => setStep(3)}
            className="mt-8 h-13 w-full rounded-full bg-brand text-lg font-semibold text-ink transition-colors hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-40"
          >
            متابعة
          </button>
        </section>
      ) : null}

      {step === 3 && service && slot ? (
        <section>
          <div className="mb-8 rounded-2xl bg-mist p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-bold">{service.name}</p>
                <p className="mt-1 text-muted">{fullDate(dateOf(slot.startsAt))}</p>
                <p className="text-muted">{timeRange(slot.startsAt, slot.endsAt)}</p>
              </div>
              <button type="button" onClick={() => setStep(2)} className="text-sm text-muted underline">
                تغيير
              </button>
            </div>
            <p className="mt-4 border-t border-line pt-4 font-bold">
              {sar(service.priceHalalas)}{" "}
              <span className="text-sm font-normal text-muted">شامل ضريبة القيمة المضافة</span>
            </p>
          </div>

          <form onSubmit={submit} noValidate className="space-y-5">
            <Field label="الاسم" error={errors.name}>
              <input
                name="name"
                autoComplete="name"
                required
                maxLength={80}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className={inputClass(errors.name)}
              />
            </Field>
            <Field label="رقم الواتساب" error={errors.phone}>
              <input
                name="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                dir="ltr"
                placeholder="05xxxxxxxx"
                required
                maxLength={20}
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className={`${inputClass(errors.phone)} text-right`}
              />
            </Field>
            <Field label="البريد الإلكتروني" error={errors.email}>
              <input
                name="email"
                type="email"
                autoComplete="email"
                dir="ltr"
                required
                maxLength={254}
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className={`${inputClass(errors.email)} text-right`}
              />
            </Field>

            <button
              type="submit"
              disabled={pending}
              className="h-13 w-full rounded-full bg-brand text-lg font-semibold text-ink transition-colors hover:bg-brand-dark disabled:opacity-60"
            >
              {pending ? "جارٍ تحويلك إلى صفحة الدفع…" : "متابعة إلى الدفع"}
            </button>
            <p className="text-center text-sm leading-6 text-muted">
              الدفع يتم في صفحة Stripe الآمنة، ولا نرى بيانات بطاقتك ولا نحفظها. نستخدم بياناتك
              فقط لتأكيد الحجز والتواصل معك، ونحفظها مشفّرة.{" "}
              <Link href="/privacy" className="underline">
                سياسة الخصوصية
              </Link>
            </p>
          </form>
        </section>
      ) : null}
    </div>
  );
}

function inputClass(error?: string) {
  return `h-12 w-full rounded-xl border bg-white px-4 text-base outline-none transition-colors focus:border-ink ${
    error ? "border-red-600" : "border-line"
  }`;
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block font-semibold">{label}</span>
      {children}
      {error ? <span className="mt-2 block text-sm text-red-700">{error}</span> : null}
    </label>
  );
}
