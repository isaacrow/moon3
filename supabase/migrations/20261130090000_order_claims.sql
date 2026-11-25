-- Claiming late orders (plan step H8; acquisitions.tsx lateOrders, acquisitionsRoutes.tsx /acq/claims): when an order
-- is expected, how long a vendor usually takes, and each claim sent. Only the edge function (service role) reads or
-- writes: row level security is on with no policies.
alter table public.acq_orders add column if not exists expected_at date;
alter table public.acq_vendors add column if not exists lead_days integer check (lead_days between 1 and 730);

create table if not exists public.acq_claims (
  id          bigserial primary key,
  library     text not null,
  order_id    bigint not null references public.acq_orders (id) on delete cascade,
  vendor_id   uuid references public.acq_vendors (id) on delete set null,
  claimed_at  timestamptz not null default now(),
  claimed_by  text,
  note        text
);
create index if not exists acq_claims_order_idx on public.acq_claims (order_id, claimed_at desc);
create index if not exists acq_claims_library_idx on public.acq_claims (library, claimed_at desc);
alter table public.acq_claims enable row level security;
