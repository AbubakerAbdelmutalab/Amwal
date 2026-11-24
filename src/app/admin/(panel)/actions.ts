"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  addException,
  addWeeklySlot,
  applyBookingAction,
  deleteException,
  toggleWeeklySlot,
} from "@/server/admin";
import { endAdminSession } from "@/server/auth";
import { clearSessionCookie, readSessionToken, requireAdmin } from "@/server/session";

// Every action re-checks the admin session itself: a page being protected
// does not protect the actions it uses.

export async function logoutAction() {
  await endAdminSession(await readSessionToken());
  await clearSessionCookie();
  redirect("/admin/login");
}

export async function bookingAction(id: string, action: string) {
  const session = await requireAdmin();
  return applyBookingAction(session, id, action);
}

export async function toggleSlotAction(formData: FormData) {
  const session = await requireAdmin();
  await toggleWeeklySlot(session, formData.get("id"), formData.get("field"));
  revalidatePath("/admin/schedule");
}

export type FormState = { ok: boolean; message: string } | undefined;

export async function addWeeklySlotAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireAdmin();
  const res = await addWeeklySlot(session, {
    weekday: formData.get("weekday"),
    startTime: formData.get("startTime"),
  });
  revalidatePath("/admin/schedule");
  return res.ok ? { ok: true, message: "تمت إضافة الموعد." } : { ok: false, message: res.error };
}

export async function addExceptionAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireAdmin();
  const res = await addException(session, {
    date: formData.get("date"),
    kind: formData.get("kind"),
    startTime: formData.get("startTime") || undefined,
  });
  revalidatePath("/admin/schedule");
  if (!res.ok) return { ok: false, message: res.error };
  return {
    ok: true,
    message:
      res.bookingsThatDay > 0
        ? `تم الحفظ. تنبيه: يوجد ${res.bookingsThatDay} حجز في هذا اليوم ولم يتغير. تواصل مع العملاء إن لزم.`
        : "تم الحفظ.",
  };
}

export async function deleteExceptionAction(formData: FormData) {
  const session = await requireAdmin();
  await deleteException(session, formData.get("id"));
  revalidatePath("/admin/schedule");
}
