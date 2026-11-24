-- One-time password reset codes for reader accounts (supabase/functions/server/readerReset.tsx). Only a hash
-- of each code is kept; a code works once and runs out (30 minutes by email, 24 hours from the loan desk).
create table if not exists public.reader_resets (
  code_hash   text primary key,
  reader_id   uuid not null references public.readers (id) on delete cascade,
  via         text not null check (via in ('email', 'desk')),
  made_by     text,
  expires_at  timestamptz not null,
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists reader_resets_reader_idx on public.reader_resets (reader_id);
alter table public.reader_resets enable row level security;
