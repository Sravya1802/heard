-- Heard: run once in the Supabase SQL editor.
-- The browser only uses the anon key for Realtime broadcast; tables are
-- written and read by the server with the service role key, so RLS denies
-- all anon access.

create table if not exists orders (
  id bigint generated always as identity primary key,
  order_number int not null,
  lane int not null default 1,
  lines jsonb not null,
  total text not null,
  session_id text,
  seconds int,
  submitted_at timestamptz not null default now()
);
create index if not exists orders_submitted_at on orders (submitted_at desc);

create table if not exists settings (
  key text primary key,
  value jsonb not null
);

alter table orders enable row level security;
alter table settings enable row level security;
