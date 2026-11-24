// Applies database migrations and default data to the hosted database.
// Usage: DATABASE_URL=... npm run db:migrate
import { migrateHosted } from "../src/server/db/client";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const applied = await migrateHosted(url);
console.log(applied.length ? `Applied: ${applied.join(", ")}` : "Database is up to date");
