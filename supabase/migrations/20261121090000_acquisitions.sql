-- Acquisitions (supabase/functions/server/acquisitions.tsx): vendors, funds, purchase orders, invoices,
-- subscriptions to journals and databases, and the journal issues received. Per library; only the edge function
-- (service role) reads or writes them: row level security is on with no policies.

create table if not exists public.acq_vendors (
  id          uuid primary key default gen_random_uuid(),
  library     text not null,
  name        text not null,
  contact     text,
  email       text,
  phone       text,
  website     text,
  country     text,
  note        text,
  active      boolean not null default true,
  created_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists acq_vendors_library_idx on public.acq_vendors (library, lower(name));
alter table public.acq_vendors enable row level security;

create table if not exists public.acq_funds (
  id          uuid primary key default gen_random_uuid(),
  library     text not null,
  code        text not null,
  name        text not null,
  year        integer not null,
  budget      numeric(14, 2) not null default 0 check (budget >= 0),
  currency    text,
  note        text,
  created_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (library, code, year)
);
alter table public.acq_funds enable row level security;

create table if not exists public.acq_orders (
  id           bigserial primary key,
  library      text not null,
  number       text not null,
  title        text not null,
  author       text,
  isbn         text,
  material     text,
  vendor_id    uuid references public.acq_vendors (id) on delete restrict,
  fund_id      uuid references public.acq_funds (id) on delete restrict,
  quantity     integer not null default 1 check (quantity > 0),
  unit_price   numeric(12, 2),
  currency     text,
  status       text not null default 'ordered' check (status in ('ordered', 'received', 'cancelled')),
  ordered_at   timestamptz not null default now(),
  received_at  timestamptz,
  record_id    text,
  note         text,
  created_by   text,
  updated_at   timestamptz not null default now(),
  unique (library, number)
);
create index if not exists acq_orders_status_idx on public.acq_orders (library, status, ordered_at desc);
alter table public.acq_orders enable row level security;

create table if not exists public.acq_invoices (
  id            bigserial primary key,
  library       text not null,
  number        text not null,
  vendor_id     uuid not null references public.acq_vendors (id) on delete restrict,
  invoice_date  date not null,
  amount        numeric(14, 2) not null check (amount >= 0),
  currency      text,
  order_ids     bigint[] not null default '{}',
  status        text not null default 'unpaid' check (status in ('unpaid', 'paid')),
  paid_at       timestamptz,
  note          text,
  created_by    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (library, vendor_id, number)
);
alter table public.acq_invoices enable row level security;

create table if not exists public.acq_subscriptions (
  id               bigserial primary key,
  library          text not null,
  kind             text not null check (kind in ('journal', 'database')),
  title            text not null,
  issn             text,
  vendor_id        uuid references public.acq_vendors (id) on delete restrict,
  fund_id          uuid references public.acq_funds (id) on delete restrict,
  issues_per_year  integer,
  start_date       date not null,
  end_date         date not null check (end_date >= start_date),
  cost             numeric(14, 2),
  currency         text,
  access_url       text,
  record_id        text,
  note             text,
  active           boolean not null default true,
  created_by       text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists acq_subscriptions_end_idx on public.acq_subscriptions (library, end_date) where active;
alter table public.acq_subscriptions enable row level security;

create table if not exists public.acq_issues (
  id               bigserial primary key,
  library          text not null,
  subscription_id  bigint not null references public.acq_subscriptions (id) on delete cascade,
  label            text not null,
  received_on      date not null default current_date,
  received_by      text,
  created_at       timestamptz not null default now()
);
create index if not exists acq_issues_sub_idx on public.acq_issues (subscription_id, received_on desc);
alter table public.acq_issues enable row level security;
