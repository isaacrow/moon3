-- Lists (supabase/functions/server/lists.tsx and listsRoutes.tsx): saved queries over a library's books, copies,
-- loans, borrowers, holds, orders, invoices, subscriptions, vendors and funds. Only the edge function (service role)
-- reads or writes it: row level security is on with no policies.
create table if not exists public.lists (
  id            uuid primary key default gen_random_uuid(),
  library       text not null,
  name          text not null check (length(name) between 1 and 120),
  description   text,
  entity        text not null,
  query         jsonb not null,
  private       boolean not null default false,
  row_count     integer,
  refreshed_at  timestamptz,
  refreshed_by  text,
  created_by    text not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (library, name)
);
create index if not exists lists_library_idx on public.lists (library, updated_at desc);
alter table public.lists enable row level security;

-- Lists read each kind of row by library, newest first; these are the reads that had no index yet.
create index if not exists loans_library_loaned_idx on public.loans (library, loaned_at desc);
create index if not exists holds_library_placed_idx on public.holds (library, placed_at desc);
create index if not exists acq_invoices_library_idx on public.acq_invoices (library, invoice_date desc);
create index if not exists acq_funds_library_idx on public.acq_funds (library, year desc);
