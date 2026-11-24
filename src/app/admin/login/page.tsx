import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import { isAdminConfigured } from "@/server/auth";
import { currentAdmin } from "@/server/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "تسجيل دخول المشرف",
  robots: { index: false, follow: false },
};

export default async function AdminLoginPage() {
  const configured = isAdminConfigured();
  if (configured && (await currentAdmin())) redirect("/admin");

  return (
    <main className="flex min-h-screen items-center justify-center bg-mist px-5 py-12">
      <div className="w-full max-w-sm rounded-3xl bg-white p-8 shadow-sm">
        <div className="mb-8 flex items-center gap-3">
          <Image src="/logo.png" alt="شعار أموال" width={44} height={44} className="size-11 rounded-xl" />
          <div>
            <p className="font-bold">أموال</p>
            <p className="text-sm text-muted">لوحة الإدارة</p>
          </div>
        </div>
        {configured ? (
          <LoginForm />
        ) : (
          <p className="leading-7 text-muted">لم يتم إعداد حساب المشرف بعد.</p>
        )}
      </div>
    </main>
  );
}
