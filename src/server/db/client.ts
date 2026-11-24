import "server-only";
import type { PGlite } from "@electric-sql/pglite";
import { count } from "drizzle-orm";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { services as serviceContent } from "@/lib/content";
import { DEFAULT_SETTINGS } from "../settings";
import { migrations } from "./migrations";
import * as schema from "./schema";

export type DB = PostgresJsDatabase<typeof schema>;

/**
 * - DATABASE_URL set: the hosted Postgres database (Supabase in production).
 * - Not set, outside production: a local embedded Postgres in ./.data, so
 *   development needs no database server or account.
 * - Not set in production: no database; booking stays switched off.
 */
export function databaseMode(): "postgres" | "local" | null {
  if (hostedUrl()) return "postgres";
  if (process.env.NODE_ENV !== "production") return "local";
  return null;
}

/**
 * Hosted database address: DATABASE_URL, or POSTGRES_URL as set by Vercel's
 * Supabase integration (Supabase's pooler). Extra query parameters are
 * dropped; the connection always uses TLS (see `options`).
 */
function hostedUrl(): string | null {
  const raw = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!raw) return null;
  const url = new URL(raw);
  url.search = "";
  return url.toString();
}

function options(url: string, max: number) {
  const isLocalHost = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  return {
    prepare: false, // required by Supabase's transaction pooler
    max,
    ssl: isLocalHost ? false : ("require" as const), // encrypted connection
    connect_timeout: 15,
    idle_timeout: 20,
  };
}

type Holder = { ready: Promise<DB> };
const store = globalThis as unknown as { __amwalDb?: Holder };

export function getDb(): Promise<DB> {
  if (!store.__amwalDb) {
    const ready = connect();
    // Do not keep a failed connection around; retry on the next request.
    ready.catch(() => {
      if (store.__amwalDb?.ready === ready) store.__amwalDb = undefined;
    });
    store.__amwalDb = { ready };
  }
  return store.__amwalDb.ready;
}

/** Tests inject their own in-memory database. */
export function setDbForTests(db: DB) {
  store.__amwalDb = { ready: Promise.resolve(db) };
}

async function connect(): Promise<DB> {
  const mode = databaseMode();
  if (mode === "postgres") {
    const url = hostedUrl()!;
    return drizzlePostgres({ client: postgres(url, options(url, 5)), schema });
  }
  if (mode === "local") {
    const { PGlite } = await import("@electric-sql/pglite");
    const { mkdirSync } = await import("node:fs");
    const dir = process.env.LOCAL_DB_DIR ?? "./.data/pglite";
    mkdirSync(dir, { recursive: true });
    return openLocalDb(new PGlite(dir));
  }
  throw new Error("No database configured");
}

/** Prepares an embedded database (migrations + seed) and wraps it in Drizzle. */
export async function openLocalDb(pg: PGlite): Promise<DB> {
  await migratePglite(pg);
  const { drizzle } = await import("drizzle-orm/pglite");
  const db = drizzle({ client: pg, schema }) as unknown as DB;
  await seed(db);
  return db;
}

const MIGRATIONS_TABLE = `CREATE TABLE IF NOT EXISTS schema_migrations (
  id text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
)`;

async function migratePglite(pg: PGlite) {
  await pg.exec(MIGRATIONS_TABLE);
  const { rows } = await pg.query<{ id: string }>("SELECT id FROM schema_migrations");
  const done = new Set(rows.map((r) => r.id));
  for (const m of migrations) {
    if (done.has(m.id)) continue;
    await pg.transaction(async (tx) => {
      await tx.exec(m.sql);
      await tx.query("INSERT INTO schema_migrations (id) VALUES ($1)", [m.id]);
    });
  }
}

/** Used by `npm run db:migrate` against the hosted database. */
export async function migrateHosted(rawUrl: string) {
  const parsed = new URL(rawUrl);
  parsed.search = "";
  const url = parsed.toString();
  const sql = postgres(url, options(url, 1));
  try {
    await sql.unsafe(MIGRATIONS_TABLE);
    const rows = await sql<{ id: string }[]>`SELECT id FROM schema_migrations`;
    const done = new Set(rows.map((r) => r.id));
    const applied: string[] = [];
    for (const m of migrations) {
      if (done.has(m.id)) continue;
      await sql.begin(async (tx) => {
        await tx.unsafe(m.sql).simple();
        await tx`INSERT INTO schema_migrations (id) VALUES (${m.id})`;
      });
      applied.push(m.id);
    }
    await seed(drizzlePostgres({ client: sql, schema }));
    return applied;
  } finally {
    await sql.end();
  }
}

// The agreed weekly schedule (Riyadh time). Friday is closed.
const DEFAULT_WEEKLY_SLOTS: { weekday: number; startTime: string }[] = [
  ...[6, 1, 3].flatMap((weekday) =>
    ["13:00", "15:45", "20:30"].map((startTime) => ({ weekday, startTime })),
  ),
  ...[0, 2, 4].flatMap((weekday) =>
    ["13:00", "20:30"].map((startTime) => ({ weekday, startTime })),
  ),
];

/** Inserts defaults that are missing. Never overwrites existing rows. */
async function seed(db: DB) {
  await db
    .insert(schema.services)
    .values(
      serviceContent.map((s, i) => ({
        id: s.id,
        name: s.name,
        durationMinutes: s.durationMinutes,
        priceHalalas: s.price * 100,
        sortOrder: i,
      })),
    )
    .onConflictDoNothing();

  const [{ total }] = await db
    .select({ total: count() })
    .from(schema.weeklySlots);
  if (Number(total) === 0) {
    await db.insert(schema.weeklySlots).values(DEFAULT_WEEKLY_SLOTS);
  }

  await db
    .insert(schema.settings)
    .values(Object.entries(DEFAULT_SETTINGS).map(([key, value]) => ({ key, value })))
    .onConflictDoNothing();
}
