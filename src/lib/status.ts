import type { BookingStatus } from "@/server/db/schema";

export const STATUS_LABELS: Record<BookingStatus, { label: string; tone: string }> = {
  held: { label: "بانتظار الدفع", tone: "bg-brand text-ink" },
  confirmed: { label: "مؤكد", tone: "bg-ink text-white" },
  cancel_requested: { label: "طلب إلغاء", tone: "bg-red-50 text-red-800" },
  cancelled: { label: "ملغي", tone: "bg-mist text-muted" },
  completed: { label: "مكتمل", tone: "bg-mist text-ink" },
  no_show: { label: "لم يحضر", tone: "bg-mist text-muted" },
  expired: { label: "انتهت مهلة الحجز", tone: "bg-mist text-muted" },
};
