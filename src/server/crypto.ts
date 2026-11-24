import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
} from "node:crypto";

// Field-level encryption for personal data (AES-256-GCM).
//
// Keys live in environment variables, never in the database or the repository,
// so a leaked database or backup contains only ciphertext.
//
//   DATA_ENCRYPTION_KEY           current key, used to encrypt and decrypt
//   DATA_ENCRYPTION_KEY_PREVIOUS  optional old key, decrypt-only during rotation
//   DATA_HASH_KEY                 separate key for searchable hashes (HMAC)
//
// Each key is 32 random bytes, base64-encoded. Generate with `npm run keys:generate`.

type Key = { id: string; bytes: Buffer };

function readKey(name: string): Key | null {
  const raw = process.env[name];
  if (!raw) return null;
  const bytes = Buffer.from(raw, "base64");
  if (bytes.length !== 32) {
    throw new Error(`${name} must be 32 bytes, base64-encoded`);
  }
  const id = createHash("sha256").update(bytes).digest("hex").slice(0, 8);
  return { id, bytes };
}

function encryptionKeys(): { current: Key; all: Key[] } {
  const current = readKey("DATA_ENCRYPTION_KEY");
  if (!current) throw new Error("DATA_ENCRYPTION_KEY is not set");
  const previous = readKey("DATA_ENCRYPTION_KEY_PREVIOUS");
  return { current, all: previous ? [current, previous] : [current] };
}

function hashKey(): Buffer {
  const key = readKey("DATA_HASH_KEY");
  if (!key) throw new Error("DATA_HASH_KEY is not set");
  return key.bytes;
}

export function hasDataKeys(): boolean {
  return Boolean(
    process.env.DATA_ENCRYPTION_KEY && process.env.DATA_HASH_KEY,
  );
}

/**
 * Encrypts a value. `context` names the field (for example "client.phone") and
 * is bound to the ciphertext, so a value cannot be moved to another column.
 * Output: `<keyId>.<iv>.<ciphertext+tag>` in base64url.
 */
export function encrypt(plaintext: string, context: string): string {
  const { current } = encryptionKeys();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", current.bytes, iv);
  cipher.setAAD(Buffer.from(context, "utf8"));
  const body = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  return [current.id, iv.toString("base64url"), body.toString("base64url")].join(".");
}

export function decrypt(payload: string, context: string): string {
  const [keyId, ivPart, bodyPart] = payload.split(".");
  if (!keyId || !ivPart || !bodyPart) throw new Error("Malformed ciphertext");
  const key = encryptionKeys().all.find((k) => k.id === keyId);
  if (!key) throw new Error("No key available for this ciphertext");
  const iv = Buffer.from(ivPart, "base64url");
  const body = Buffer.from(bodyPart, "base64url");
  const decipher = createDecipheriv("aes-256-gcm", key.bytes, iv);
  decipher.setAAD(Buffer.from(context, "utf8"));
  decipher.setAuthTag(body.subarray(body.length - 16));
  return Buffer.concat([
    decipher.update(body.subarray(0, body.length - 16)),
    decipher.final(),
  ]).toString("utf8");
}

/**
 * Deterministic keyed hash, used to look up a record (for example by phone
 * number) without storing the value in readable form.
 */
export function blindIndex(value: string, context: string): string {
  return createHmac("sha256", hashKey())
    .update(`${context}:${value}`)
    .digest("base64url");
}

/** Private booking-link token. Only its SHA-256 hash is stored. */
export function newAccessToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function isWellFormedToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}
