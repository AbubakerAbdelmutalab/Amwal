// Ordered SQL migrations. Never edit one that has been applied to a real
// database; add a new entry instead.

export type Migration = { id: string; sql: string };

const TIME = `CHECK (start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')`;

export const migrations: Migration[] = [
  {
    id: "0001_init",
    sql: `
CREATE TABLE services (
  id text PRIMARY KEY,
  name text NOT NULL,
  duration_minutes integer NOT NULL CHECK (duration_minutes > 0),
  price_halalas integer NOT NULL CHECK (price_halalas >= 0),
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE weekly_slots (
  id serial PRIMARY KEY,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time text NOT NULL ${TIME},
  allow_long boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  UNIQUE (weekday, start_time)
);

CREATE TABLE schedule_exceptions (
  id serial PRIMARY KEY,
  date date NOT NULL,
  start_time text ${TIME},
  closed boolean NOT NULL DEFAULT true,
  note text,
  CHECK (closed OR start_time IS NOT NULL)
);
CREATE INDEX schedule_exceptions_date_idx ON schedule_exceptions (date);

CREATE TABLE clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name_enc text NOT NULL,
  phone_enc text NOT NULL,
  email_enc text NOT NULL,
  phone_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id),
  service_id text NOT NULL REFERENCES services(id),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status text NOT NULL CHECK (status IN
    ('held','confirmed','cancel_requested','cancelled','completed','no_show','expired')),
  price_halalas integer NOT NULL CHECK (price_halalas >= 0),
  access_token_hash text NOT NULL UNIQUE,
  hold_expires_at timestamptz,
  ip_hash text,
  meet_link text,
  follow_up_ends_at timestamptz,
  reschedule_count integer NOT NULL DEFAULT 0,
  confirmed_at timestamptz,
  cancel_requested_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at),
  -- The database itself refuses two active bookings whose times overlap,
  -- even if two clients submit at the same moment.
  CONSTRAINT bookings_no_overlap EXCLUDE USING gist (
    tstzrange(starts_at, ends_at, '[)') WITH &&
  ) WHERE (status IN ('held','confirmed','cancel_requested'))
);
CREATE INDEX bookings_status_starts_idx ON bookings (status, starts_at);
CREATE INDEX bookings_client_idx ON bookings (client_id);
CREATE INDEX bookings_ip_created_idx ON bookings (ip_hash, created_at);

CREATE TABLE settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_log (
  id bigserial PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  actor text NOT NULL,
  action text NOT NULL,
  booking_id uuid REFERENCES bookings(id) ON DELETE SET NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- Only the server, connecting as the table owner, can read or write.
-- Row-level security with no policies blocks every other role, which closes
-- Supabase's public Data API to these tables.
ALTER TABLE schema_migrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', r);
    END IF;
  END LOOP;
END $$;
`,
  },
];
