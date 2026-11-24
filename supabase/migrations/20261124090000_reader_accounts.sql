-- Reader accounts in the public catalogue (supabase/functions/server/readers.tsx), apart from staff accounts.
-- What Moon keeps about a reader, as the owner chose (24 November 2026): the account (email, name, password
-- hash), their saved books, and the books they borrowed (reading history) while the reader keeps history on.
-- The reader can turn history off, clear it, and delete the whole account; staff never see it; an account not
-- used for two years is deleted with everything in it. Only the edge function (service role) reads these tables.

create table if not exists public.readers (
  id             uuid primary key default gen_random_uuid(),
  email          text not null,
  name           text not null check (length(name) between 1 and 120),
  password_hash  text not null,
  salt           text not null,
  kdf            text not null,
  iterations     integer not null,
  keep_history   boolean not null default true,
  created_at     timestamptz not null default now(),
  last_seen_at   timestamptz not null default now()
);
create unique index if not exists readers_email_idx on public.readers (lower(email));
create index if not exists readers_last_seen_idx on public.readers (last_seen_at);
alter table public.readers enable row level security;

create table if not exists public.reader_sessions (
  token_hash  text primary key,
  reader_id   uuid not null references public.readers (id) on delete cascade,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);
create index if not exists reader_sessions_reader_idx on public.reader_sessions (reader_id);
alter table public.reader_sessions enable row level security;

create table if not exists public.reader_saved (
  reader_id  uuid not null references public.readers (id) on delete cascade,
  record_id  text not null check (length(record_id) between 1 and 300),
  added_at   timestamptz not null default now(),
  primary key (reader_id, record_id)
);
alter table public.reader_saved enable row level security;

create table if not exists public.reading_history (
  id           bigserial primary key,
  reader_id    uuid not null references public.readers (id) on delete cascade,
  record_id    text,
  title        text,
  library      text,
  borrowed_at  timestamptz,
  returned_at  timestamptz not null default now()
);
create index if not exists reading_history_reader_idx on public.reading_history (reader_id, returned_at desc);
alter table public.reading_history enable row level security;

-- A borrower at the loan desk may be linked to a reader account (by the reader's email, at the desk), so the
-- reader sees their loans and holds in the catalogue, places holds there, and gets their reading history.
alter table public.patrons add column if not exists reader_id uuid references public.readers (id) on delete set null;
create index if not exists patrons_reader_idx on public.patrons (reader_id) where reader_id is not null;
