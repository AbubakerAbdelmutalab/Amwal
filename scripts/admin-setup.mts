// Creates the admin sign-in credentials.
//
//   npm run admin:setup
//
// Asks for the email and a password, then prints three lines to put in
// .env.local (development) or in Vercel → Settings → Environment Variables
// (production, marked Sensitive), plus the key to add to an authenticator app
// (Google Authenticator, Microsoft Authenticator, 1Password, Authy).
//
// Non-interactive use: ADMIN_SETUP_EMAIL and ADMIN_SETUP_PASSWORD env vars.
import { createInterface } from "node:readline/promises";
import { hashPassword, newTotpSecret } from "../src/server/auth";

async function ask(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

const email = process.env.ADMIN_SETUP_EMAIL ?? (await ask("Admin email: "));
const password = process.env.ADMIN_SETUP_PASSWORD ?? (await ask("Password (at least 12 characters): "));

if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error("That email does not look valid.");
  process.exit(1);
}
if (password.length < 12) {
  console.error("Use a password of at least 12 characters.");
  process.exit(1);
}

const secret = newTotpSecret();
const label = encodeURIComponent(`Amwal.School:${email}`);
const uri = `otpauth://totp/${label}?secret=${secret}&issuer=Amwal.School&algorithm=SHA1&digits=6&period=30`;

console.log("\n# Environment variables (keep secret):");
console.log(`ADMIN_EMAIL=${email}`);
console.log(`ADMIN_PASSWORD_HASH=${await hashPassword(password)}`);
console.log(`ADMIN_TOTP_SECRET=${secret}`);
console.log("\n# Add this key to your authenticator app (choose 'enter a setup key', time-based):");
console.log(secret.match(/.{1,4}/g)?.join(" "));
console.log("\n# Or open this link on the phone that has the app:");
console.log(uri);
