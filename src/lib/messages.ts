// Arabic messages for booking errors returned by the server.
export const bookingErrorMessages: Record<string, string> = {
  invalid: "تحقق من البيانات المدخلة.",
  slot_unavailable: "عذرًا، هذا الموعد لم يعد متاحًا. اختر موعدًا آخر.",
  rate_limited: "محاولات كثيرة خلال وقت قصير. حاول مرة أخرى بعد قليل.",
  not_found: "لم نجد هذا الحجز.",
  not_allowed: "لا يمكن تنفيذ هذا الإجراء على هذا الحجز.",
  too_late: "انتهت مهلة تغيير الموعد.",
  unexpected: "حدث خطأ غير متوقع. حاول مرة أخرى.",
};

export function bookingErrorMessage(code: string): string {
  return bookingErrorMessages[code] ?? bookingErrorMessages.unexpected;
}
