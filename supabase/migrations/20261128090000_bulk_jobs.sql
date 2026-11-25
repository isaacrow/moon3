-- Bulk changes (supabase/functions/server/bulkEdit.tsx, listsRoutes.tsx): each job keeps every row's value before
-- and after, so it can be undone. Only the edge function (service role) reads or writes it: row level security is
-- on with no policies.
create table if not exists public.bulk_jobs (
  id          bigserial primary key,
  library     text not null,
  entity      text not null,
  field       text not null,
  value       text,
  label       text not null,
  query       jsonb not null,
  changes     jsonb not null default '[]'::jsonb,
  total       integer not null default 0,
  applied     integer not null default 0,
  failed      integer not null default 0,
  created_by  text not null,
  created_at  timestamptz not null default now(),
  undone_at   timestamptz,
  undone_by   text,
  restored    integer,
  kept        integer
);
create index if not exists bulk_jobs_library_idx on public.bulk_jobs (library, created_at desc);
alter table public.bulk_jobs enable row level security;
