-- How many copies of a received order have been added to its record as bf:Items (acquisitionsRoutes.tsx,
-- POST /acq/orders/:id/add-copies), so the same order never adds them twice.
alter table public.acq_orders add column if not exists copies_added integer not null default 0 check (copies_added >= 0);
