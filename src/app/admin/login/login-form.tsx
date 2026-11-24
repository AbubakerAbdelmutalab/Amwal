"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "./actions";

const input =
  "h-12 w-full rounded-xl border border-line bg-white px-4 text-base outline-none transition-colors focus:border-ink";

export function LoginForm() {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(loginAction, undefined);

  return (
    <form action={formAction} className="space-y-5">
      {state?.error ? (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">
          {state.error}
        </p>
      ) : null}
      <label className="block">
        <span className="mb-2 block font-semibold">البريد الإلكتروني</span>
        <input name="email" type="email" autoComplete="username" dir="ltr" required className={`${input} text-right`} />
      </label>
      <label className="block">
        <span className="mb-2 block font-semibold">كلمة المرور</span>
        <input name="password" type="password" autoComplete="current-password" dir="ltr" required className={`${input} text-right`} />
      </label>
      <label className="block">
        <span className="mb-2 block font-semibold">رمز التحقق</span>
        <input
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          dir="ltr"
          required
          placeholder="000000"
          className={`${input} text-center text-xl tracking-[0.4em]`}
        />
        <span className="mt-2 block text-sm text-muted">الرمز المكوّن من 6 أرقام في تطبيق المصادقة.</span>
      </label>
      <button
        type="submit"
        disabled={pending}
        className="h-12 w-full rounded-full bg-ink font-semibold text-white transition-colors hover:bg-black disabled:opacity-60"
      >
        {pending ? "جارٍ التحقق…" : "تسجيل الدخول"}
      </button>
    </form>
  );
}
