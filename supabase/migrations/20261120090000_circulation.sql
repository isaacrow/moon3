-- Circulation (supabase/functions/server/circulation.tsx): borrowers, loans and holds, per library.
-- Only the edge function (service role) reads or writes these tables: row level security is on with no policies.
-- A loan names its borrower only while it is out (or while a fine on it is unpaid); on return the borrower is
-- removed, so no reading history is kept.

create table if not exists public.patrons (
  id          uuid primary key default gen_random_uuid(),
  library     text not null,
  card        text not null check (card ~ '^[A-Za-z0-9._-]{1,40}$'),
  name        text not null check (length(name) between 1 and 120),
  kind        text not null default 'reader' check (kind in ('reader', 'student', 'staff')),
  email       text,
  phone       text,
  note        text,
  blocked     boolean not null default false,
  created_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (library, card)
);
create index if not exists patrons_library_name_idx on public.patrons (library, lower(name));
alter table public.patrons enable row level security;

create table if not exists public.loans (
  id            bigserial primary key,
  library       text not null,
  barcode       text not null,
  item_id       text,
  record_id     text,
  record_title  text,
  patron_id     uuid references public.patrons (id) on delete set null,
  patron_kind   text,
  loaned_at     timestamptz not null default now(),
  due_at        timestamptz not null,
  renewals      integer not null default 0,
  returned_at   timestamptz,
  fine          numeric(10, 2) not null default 0,
  fine_settled  boolean not null default true,
  loaned_by     text,
  returned_by   text
);
-- One open loan per copy.
create unique index if not exists loans_open_barcode_idx on public.loans (library, barcode) where returned_at is null;
create index if not exists loans_patron_idx on public.loans (patron_id) where patron_id is not null;
create index if not exists loans_record_open_idx on public.loans (record_id) where returned_at is null;
create index if not exists loans_due_idx on public.loans (library, due_at) where returned_at is null;
alter table public.loans enable row level security;

create table if not exists public.holds (
  id            bigserial primary key,
  library       text not null,
  record_id     text not null,
  record_title  text,
  patron_id     uuid not null references public.patrons (id) on delete cascade,
  status        text not null default 'waiting' check (status in ('waiting', 'ready', 'done', 'cancelled')),
  barcode       text,
  placed_at     timestamptz not null default now(),
  ready_at      timestamptz,
  expires_at    timestamptz,
  placed_by     text
);
create index if not exists holds_record_idx on public.holds (record_id, placed_at) where status in ('waiting', 'ready');
create index if not exists holds_patron_idx on public.holds (patron_id) where status in ('waiting', 'ready');
alter table public.holds enable row level security;

-- The records whose current document has a copy with this barcode (the server checks each one exactly).
create or replace function public.moon_records_with_barcode(p_barcode text)
returns table (id text, title text, document jsonb)
language sql stable
set search_path = public
as $$
  select r.id, r.title, r.document
  from records r
  where r.deleted_at is null
    and p_barcode ~ '^[A-Za-z0-9._-]{1,40}$'
    and r.document::text like '%"' || p_barcode || '"%'
  limit 5;
$$;
revoke all on function public.moon_records_with_barcode(text) from public, anon, authenticated;
