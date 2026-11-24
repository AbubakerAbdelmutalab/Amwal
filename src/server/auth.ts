import "server-only";
import {
  createHash,
  createHmac,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  type ScryptOptions,
} from "node:crypto";
import { and, count, eq, gt } from "drizzle-orm";
import { blindIndex, hasDataKeys, hashToken, isWellFormedToken } from "./crypto";
import { databaseMode, getDb } from "./db/client";
import { adminSessions, auditLog, loginAttempts, settings } from "./db/schema";

// Admin authentication: one admin account, defined by three environment
// variables (never stored in the database):
//
//   ADMIN_EMAIL           sign-in email
//   ADMIN_PASSWORD_HASH   scrypt hash of the password (npm run admin:setup)
//   ADMIN_TOTP_SECRET     authenticator-app secret for the 6-digit code
//
// Signing in needs all three: email, password and a current 6-digit code.

export const SESSION_COOKIE =
  process.env.NODE_ENV === "production" ? "__Host-amwal_admin" : "amwal_admin";
export const SESSION_IDLE_MS = 2 * 60 * 60 * 1000; // signed out after 2 idle hours
export const SESSION_MAX_MS = 12 * 60 * 60 * 1000; // and after 12 hours in any case
export const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;
export const MAX_FAILED_ATTEMPTS = 5; // per connection, per 15 minutes

declare const brand: unique symbol;
/** Proof that the caller is a signed-in admin. Only this module creates it. */
export type AdminSession = { readonly id: string; readonly [brand]: true };

// ---------- Passwords (scrypt) ----------

const SCRYPT_PARAMS = { N: 32768, r: 8, p: 1 };

function scrypt(password: string, salt: Buffer, keylen: number, opts: ScryptOptions) {
  return new Promise<Buffer>((resolve, reject) =>
    scryptCallback(password.normalize("NFKC"), salt, keylen, opts, (err, key) =>
      err ? reject(err) : resolve(key),
    ),
  );
}

/** Format: scrypt:N:r:p:salt:hash (no "$", which env files would expand). */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const { N, r, p } = SCRYPT_PARAMS;
  const key = await scrypt(password, salt, 32, { N, r, p, maxmem: 128 * 1024 * 1024 });
  return ["scrypt", N, r, p, salt.toString("base64"), key.toString("base64")].join(":");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split(":");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, N, r, p, salt, hash] = parts;
  const expected = Buffer.from(hash, "base64");
  const key = await scrypt(password, Buffer.from(salt, "base64"), expected.length, {
    N: Number(N),
    r: Number(r),
    p: Number(p),
    maxmem: 256 * 1024 * 1024,
  });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

// ---------- Authenticator codes (TOTP, RFC 6238) ----------

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Buffer {
  const clean = input.replace(/[\s=-]/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = BASE32.indexOf(ch);
    if (idx === -1) throw new Error("Invalid base32");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function newTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function totpCode(secret: Buffer, counter: number, digits = 6): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac("sha1", secret).update(msg).digest();
  const offset = h[h.length - 1] & 0xf;
  const code = (h.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits;
  return String(code).padStart(digits, "0");
}

/** Returns the matching time step (±30 s tolerance), or null. */
export function matchTotp(secretBase32: string, code: string, now: Date): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const secret = base32Decode(secretBase32);
  const step = Math.floor(now.getTime() / 30_000);
  let match: number | null = null;
  for (const s of [step - 1, step, step + 1]) {
    if (timingSafeEqual(Buffer.from(totpCode(secret, s)), Buffer.from(code))) match = s;
  }
  return match;
}

// ---------- Sign-in and sessions ----------

function adminConfig() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const passwordHash = process.env.ADMIN_PASSWORD_HASH?.trim();
  const totpSecret = process.env.ADMIN_TOTP_SECRET?.trim();
  if (!email || !passwordHash || !totpSecret) return null;
  return { email, passwordHash, totpSecret };
}

export function isAdminConfigured(): boolean {
  return adminConfig() !== null && databaseMode() !== null && hasDataKeys();
}

const sha256 = (s: string) => createHash("sha256").update(s).digest();

let dummyHash: Promise<string> | null = null;

export type LoginResult =
  | { ok: true; token: string; expiresAt: Date }
  | { ok: false; error: "invalid" | "locked" | "not_configured" };

export async function attemptLogin(
  input: { email: unknown; password: unknown; code: unknown },
  ctx: { ip: string | null; userAgent: string | null; now?: Date },
): Promise<LoginResult> {
  const cfg = adminConfig();
  if (!cfg || !isAdminConfigured()) return { ok: false, error: "not_configured" };
  const now = ctx.now ?? new Date();
  const db = await getDb();
  const ipHash = blindIndex(ctx.ip ?? "unknown", "ip");

  const [{ failures }] = await db
    .select({ failures: count() })
    .from(loginAttempts)
    .where(
      and(
        eq(loginAttempts.ipHash, ipHash),
        eq(loginAttempts.success, false),
        gt(loginAttempts.at, new Date(now.getTime() - LOCKOUT_WINDOW_MS)),
      ),
    );
  if (Number(failures) >= MAX_FAILED_ATTEMPTS) return { ok: false, error: "locked" };

  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const password = typeof input.password === "string" ? input.password.slice(0, 200) : "";
  const code = typeof input.code === "string" ? input.code.replace(/\s/g, "") : "";

  // Always run the slow password check, so timing does not reveal whether the
  // email was right.
  const emailOk = timingSafeEqual(sha256(email), sha256(cfg.email));
  dummyHash ??= hashPassword(randomBytes(16).toString("hex"));
  const passwordOk = await verifyPassword(password, emailOk ? cfg.passwordHash : await dummyHash);
  const step = matchTotp(cfg.totpSecret, code, now);

  let ok = emailOk && passwordOk && step !== null;

  if (ok && step !== null) {
    // Each 6-digit code works only once.
    ok = await db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(settings)
        .where(eq(settings.key, "adminTotpLastStep"))
        .for("update");
      if (row && Number(row.value) >= step) return false;
      await tx
        .insert(settings)
        .values({ key: "adminTotpLastStep", value: step, updatedAt: now })
        .onConflictDoUpdate({ target: settings.key, set: { value: step, updatedAt: now } });
      return true;
    });
  }

  await db.insert(loginAttempts).values({ ipHash, at: now, success: ok });
  await db
    .insert(auditLog)
    .values({ actor: "admin", action: ok ? "admin.login" : "admin.login_failed", at: now });
  if (!ok) return { ok: false, error: "invalid" };

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + SESSION_MAX_MS);
  await db.insert(adminSessions).values({
    tokenHash: hashToken(token),
    createdAt: now,
    lastSeenAt: now,
    expiresAt,
    ipHash,
    userAgent: ctx.userAgent?.slice(0, 200) ?? null,
  });
  return { ok: true, token, expiresAt };
}

export async function getAdminSession(
  token: string | undefined,
  now = new Date(),
): Promise<AdminSession | null> {
  if (!token || !isWellFormedToken(token) || !isAdminConfigured()) return null;
  const db = await getDb();
  const [row] = await db
    .select()
    .from(adminSessions)
    .where(eq(adminSessions.tokenHash, hashToken(token)));
  if (!row) return null;
  if (row.expiresAt <= now || row.lastSeenAt.getTime() + SESSION_IDLE_MS <= now.getTime()) {
    await db.delete(adminSessions).where(eq(adminSessions.id, row.id));
    return null;
  }
  if (now.getTime() - row.lastSeenAt.getTime() > 60_000) {
    await db.update(adminSessions).set({ lastSeenAt: now }).where(eq(adminSessions.id, row.id));
  }
  return { id: row.id } as AdminSession;
}

export async function endAdminSession(token: string | undefined) {
  if (!token || !isWellFormedToken(token)) return;
  const db = await getDb();
  await db.delete(adminSessions).where(eq(adminSessions.tokenHash, hashToken(token)));
  await db.insert(auditLog).values({ actor: "admin", action: "admin.logout" });
}
