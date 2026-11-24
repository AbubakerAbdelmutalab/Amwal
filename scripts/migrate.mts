// Applies database migrations and default data to the hosted database.
// Usage: DATABASE_URL=... npm run db:migrate
// Prefers a direct (non-pooled) connection when one is provided.
import { migrateHosted } from "../src/server/db/client";

const url =
  process.env.MIGRATION_DATABASE_URL ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL;
if (!url) {
  console.error("No database URL set (DATABASE_URL or POSTGRES_URL)");
  process.exit(1);
}

const applied = await migrateHosted(url);
console.log(applied.length ? `Applied: ${applied.join(", ")}` : "Database is up to date");
