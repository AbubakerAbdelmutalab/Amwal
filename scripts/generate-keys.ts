// Prints new random keys for .env.local or the Vercel environment settings.
// Keep them secret, and back them up somewhere safe: data encrypted with a
// lost DATA_ENCRYPTION_KEY cannot be recovered.
import { randomBytes } from "node:crypto";

const key = () => randomBytes(32).toString("base64");
console.log(`DATA_ENCRYPTION_KEY=${key()}`);
console.log(`DATA_HASH_KEY=${key()}`);
