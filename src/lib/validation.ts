import { z } from "zod";

/** Converts Arabic-Indic and Persian digits to Western digits. */
function westernDigits(s: string): string {
  return s
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x6f0));
}

/**
 * Normalises a phone number to international format (+9665XXXXXXXX).
 * Accepts Saudi local formats (05…, 5…, 9665…) and any international number.
 */
export function normalizePhone(input: string): string | null {
  let s = westernDigits(input).replace(/[\s\-().]/g, "");
  if (s.startsWith("00")) s = `+${s.slice(2)}`;
  if (/^05\d{8}$/.test(s)) s = `+966${s.slice(1)}`;
  else if (/^5\d{8}$/.test(s)) s = `+966${s}`;
  else if (/^9665\d{8}$/.test(s)) s = `+${s}`;
  return /^\+[1-9]\d{7,14}$/.test(s) ? s : null;
}

export const clientDetailsSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "اكتب اسمك")
    .max(80, "الاسم طويل جدًا"),
  phone: z
    .string()
    .transform((v, ctx) => {
      const phone = normalizePhone(v);
      if (!phone) {
        ctx.addIssue({ code: "custom", message: "رقم الواتساب غير صحيح" });
        return z.NEVER;
      }
      return phone;
    }),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254, "البريد الإلكتروني طويل جدًا")
    .pipe(z.email("البريد الإلكتروني غير صحيح")),
});

export type ClientDetails = z.infer<typeof clientDetailsSchema>;

export function maskPhone(phone: string): string {
  if (phone.length < 8) return "•••";
  return `${phone.slice(0, 4)}${"•".repeat(phone.length - 7)}${phone.slice(-3)}`;
}

export function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  if (!domain) return "•••";
  return `${user.slice(0, 1)}•••@${domain}`;
}
