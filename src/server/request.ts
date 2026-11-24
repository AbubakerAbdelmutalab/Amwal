import "server-only";
import { headers } from "next/headers";

/** The visitor's IP, as set by Vercel's edge. Used only in hashed form. */
export async function clientIp(): Promise<string | null> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || h.get("x-real-ip") || null;
}
