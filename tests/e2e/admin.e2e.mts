// End-to-end test in a real browser (Microsoft Edge, headless).
// Needs the dev server running (npm run dev) and the local admin credentials
// in .env.local. Run: npm run test:e2e
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { chromium, type Browser, type Page } from "playwright-core";
import { base32Decode, totpCode } from "../../src/server/auth";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const SHOTS = process.env.E2E_SCREENSHOTS;
const email = process.env.ADMIN_EMAIL!;
const password = process.env.E2E_ADMIN_PASSWORD!;
const secret = process.env.ADMIN_TOTP_SECRET!;

const suffix = Math.floor(1000 + Math.random() * 9000);
const clientName = `عميل اختبار ${suffix}`;
const clientPhone = `05${Math.floor(10000000 + Math.random() * 89999999)}`;

let browser: Browser;
let admin: Page;

const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
};
const currentCode = () => totpCode(base32Decode(secret), Math.floor(Date.now() / 30_000));

before(async () => {
  assert.ok(email && password && secret, "admin credentials missing from .env.local");
  browser = await chromium.launch({ channel: "msedge", headless: true });
  admin = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
});

after(async () => {
  await browser?.close();
});

test("admin pages redirect to sign-in when signed out", async () => {
  await admin.goto(`${BASE}/admin`);
  await admin.waitForURL(`${BASE}/admin/login`);
  await admin.goto(`${BASE}/admin/schedule`);
  await admin.waitForURL(`${BASE}/admin/login`);
  const res = await fetch(`${BASE}/admin/login`);
  assert.equal(res.headers.get("x-robots-tag"), "noindex, nofollow");
  assert.match(res.headers.get("cache-control") ?? "", /no-store/);
  await shot(admin, "e2e-1-login");
});

test("a wrong code is refused", async () => {
  await admin.getByLabel("البريد الإلكتروني").fill(email);
  await admin.getByLabel("كلمة المرور").fill(password);
  await admin.getByLabel("رمز التحقق").fill(currentCode() === "000000" ? "111111" : "000000");
  await admin.getByRole("button", { name: "تسجيل الدخول" }).click();
  await admin.getByText("بيانات الدخول غير صحيحة.").waitFor();
  assert.equal(new URL(admin.url()).pathname, "/admin/login");
});

test("a client books through the website", async () => {
  const page = await (await browser.newContext({ viewport: { width: 500, height: 1000 } })).newPage();
  await page.goto(`${BASE}/booking`);
  await page.getByRole("button", { name: /إدارة الدخل/ }).click();
  await page.getByRole("listbox", { name: "اختر الوقت" }).getByRole("option").first().click();
  await page.getByRole("button", { name: "متابعة", exact: true }).click();
  await page.getByLabel("الاسم").fill(clientName);
  await page.getByLabel("رقم الواتساب").fill(clientPhone);
  await page.getByLabel("البريد الإلكتروني").fill(`client${suffix}@example.com`);
  await shot(page, "e2e-2-client-form");
  await page.getByRole("button", { name: "متابعة إلى الدفع" }).click();
  await page.waitForURL(/\/b\/[A-Za-z0-9_-]{43}$/);
  await page.getByText("بانتظار الدفع").waitFor();
  await shot(page, "e2e-3-client-booking");
  await page.context().close();
});

test("the admin signs in with password and code", async () => {
  await admin.getByLabel("البريد الإلكتروني").fill(email);
  await admin.getByLabel("كلمة المرور").fill(password);
  await admin.getByLabel("رمز التحقق").fill(currentCode());
  await admin.getByRole("button", { name: "تسجيل الدخول" }).click();
  await admin.waitForURL(`${BASE}/admin`);

  const cookie = (await admin.context().cookies()).find((c) => c.name.includes("amwal_admin"));
  assert.ok(cookie, "session cookie set");
  assert.equal(cookie.httpOnly, true);
  assert.equal(cookie.sameSite, "Strict");
  assert.ok(cookie.value.length >= 43);
});

test("the admin sees the new booking with full contact details", async () => {
  await admin.getByRole("link", { name: new RegExp(clientName) }).waitFor();
  await shot(admin, "e2e-4-admin-bookings");
  await admin.getByRole("link", { name: new RegExp(clientName) }).click();
  await admin.waitForURL(/\/admin\/bookings\//);
  await admin.getByText(`+966${clientPhone.slice(1)}`).waitFor();
  await admin.getByText(`client${suffix}@example.com`).waitFor();
  await shot(admin, "e2e-5-admin-detail");
});

test("the admin cancels the booking", async () => {
  await admin.getByRole("button", { name: "إلغاء الحجز" }).click();
  await admin.getByRole("button", { name: "تأكيد" }).click();
  await admin.getByText("ملغي", { exact: true }).waitFor();
  await admin.getByText("ألغى المشرف الحجز").waitFor();
});

test("the admin closes a day in the schedule, then reopens it", async () => {
  await admin.goto(`${BASE}/admin/schedule`);
  const d = new Date(Date.now() + 60 * 24 * 3600_000).toISOString().slice(0, 10);
  await admin.locator("input[name=date]").fill(d);
  await admin.getByRole("button", { name: "حفظ" }).click();
  await admin.getByText("تم الحفظ.").waitFor();
  const row = admin.locator("li", { hasText: "مغلق اليوم كاملًا" }).first();
  await row.waitFor();
  await shot(admin, "e2e-6-admin-schedule");
  await row.getByRole("button", { name: "حذف" }).click();
  await row.waitFor({ state: "detached" });
});

test("signing out ends the session", async () => {
  const before = (await admin.context().cookies()).find((c) => c.name.includes("amwal_admin"))!.value;
  await admin.getByRole("button", { name: "خروج" }).click();
  await admin.waitForURL(`${BASE}/admin/login`);
  await admin.goto(`${BASE}/admin`);
  await admin.waitForURL(`${BASE}/admin/login`);

  // The old token no longer works even if someone kept a copy.
  const ctx = await browser.newContext();
  await ctx.addCookies([{ name: "amwal_admin", value: before, url: BASE }]);
  const p = await ctx.newPage();
  await p.goto(`${BASE}/admin`);
  await p.waitForURL(`${BASE}/admin/login`);
  await ctx.close();
});
