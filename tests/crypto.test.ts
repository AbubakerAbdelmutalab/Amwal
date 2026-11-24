import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";
import { blindIndex, decrypt, encrypt, hashToken, newAccessToken } from "../src/server/crypto";
import { normalizePhone } from "../src/lib/validation";

const key = () => randomBytes(32).toString("base64");
process.env.DATA_ENCRYPTION_KEY = key();
process.env.DATA_HASH_KEY = key();

test("encrypts and decrypts", () => {
  const c = encrypt("محمد العتيبي", "client.name");
  assert.ok(!c.includes("محمد"));
  assert.equal(decrypt(c, "client.name"), "محمد العتيبي");
});

test("same value encrypts differently each time", () => {
  assert.notEqual(encrypt("+966501234567", "client.phone"), encrypt("+966501234567", "client.phone"));
});

test("ciphertext is bound to its field", () => {
  const c = encrypt("+966501234567", "client.phone");
  assert.throws(() => decrypt(c, "client.email"));
});

test("tampered ciphertext is rejected", () => {
  const c = encrypt("secret", "client.name");
  const parts = c.split(".");
  const body = Buffer.from(parts[2], "base64url");
  body[0] ^= 1;
  parts[2] = body.toString("base64url");
  assert.throws(() => decrypt(parts.join("."), "client.name"));
});

test("old data stays readable after key rotation", () => {
  const old = encrypt("before rotation", "client.name");
  process.env.DATA_ENCRYPTION_KEY_PREVIOUS = process.env.DATA_ENCRYPTION_KEY;
  process.env.DATA_ENCRYPTION_KEY = key();
  assert.equal(decrypt(old, "client.name"), "before rotation");
  delete process.env.DATA_ENCRYPTION_KEY_PREVIOUS;
  assert.throws(() => decrypt(old, "client.name"));
});

test("searchable hash is stable and keyed", () => {
  const a = blindIndex("+966501234567", "client.phone");
  assert.equal(a, blindIndex("+966501234567", "client.phone"));
  assert.notEqual(a, blindIndex("+966501234567", "ip"));
  process.env.DATA_HASH_KEY = key();
  assert.notEqual(a, blindIndex("+966501234567", "client.phone"));
});

test("access tokens are random and stored only as a hash", () => {
  const { token, hash } = newAccessToken();
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(hash, hashToken(token));
  assert.ok(!hash.includes(token));
  assert.notEqual(newAccessToken().token, token);
});

test("phone numbers are normalised", () => {
  assert.equal(normalizePhone("0501234567"), "+966501234567");
  assert.equal(normalizePhone("٠٥٠١٢٣٤٥٦٧"), "+966501234567");
  assert.equal(normalizePhone("+966 50 123 4567"), "+966501234567");
  assert.equal(normalizePhone("00966501234567"), "+966501234567");
  assert.equal(normalizePhone("+971501234567"), "+971501234567");
  assert.equal(normalizePhone("12345"), null);
});
