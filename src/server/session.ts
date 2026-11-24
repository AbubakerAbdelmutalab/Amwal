import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getAdminSession, SESSION_COOKIE, type AdminSession } from "./auth";

// Next.js glue for admin sessions (cookies and redirects). The security logic
// itself lives in ./auth.ts.

export async function currentAdmin(): Promise<AdminSession | null> {
  const store = await cookies();
  return getAdminSession(store.get(SESSION_COOKIE)?.value);
}

/** For every admin page and action: the signed-in admin, or a redirect to sign-in. */
export const requireAdmin = cache(async (): Promise<AdminSession> => {
  const session = await currentAdmin();
  if (!session) redirect("/admin/login");
  return session;
});

export async function setSessionCookie(token: string, expiresAt: Date) {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true, // not readable by page scripts
    secure: process.env.NODE_ENV === "production", // HTTPS only
    sameSite: "strict", // never sent from other sites
    path: "/",
    expires: expiresAt,
  });
}

export async function readSessionToken(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

export async function clearSessionCookie() {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function userAgent(): Promise<string | null> {
  return (await headers()).get("user-agent");
}
