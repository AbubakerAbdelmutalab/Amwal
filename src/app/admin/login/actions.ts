"use server";

import "server-only";
import { redirect } from "next/navigation";
import { attemptLogin } from "@/server/auth";
import { clientIp } from "@/server/request";
import { setSessionCookie, userAgent } from "@/server/session";

export type LoginState = { error: string } | undefined;

const MESSAGES = {
  invalid: "بيانات الدخول غير صحيحة.",
  locked: "محاولات كثيرة غير ناجحة. حاول مرة أخرى بعد 15 دقيقة.",
  not_configured: "لم يتم إعداد حساب المشرف بعد.",
};

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  let result;
  try {
    result = await attemptLogin(
      {
        email: formData.get("email"),
        password: formData.get("password"),
        code: formData.get("code"),
      },
      { ip: await clientIp(), userAgent: await userAgent() },
    );
  } catch (e) {
    console.error("admin login failed", e instanceof Error ? e.message : e);
    return { error: "حدث خطأ غير متوقع. حاول مرة أخرى." };
  }
  if (!result.ok) return { error: MESSAGES[result.error] };
  await setSessionCookie(result.token, result.expiresAt);
  redirect("/admin");
}
