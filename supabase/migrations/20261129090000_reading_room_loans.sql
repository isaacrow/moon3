-- Reading-room loans (plan step H7; circulation.tsx roomDue, circulationRoutes.tsx): a copy lent for use in the
-- reading room only, in use or on the hold shelf for its reader between visits.
alter table public.loans add column if not exists in_room boolean not null default false;
alter table public.loans add column if not exists room_state text check (room_state in ('in-use', 'on-shelf'));
create index if not exists loans_room_idx on public.loans (library, room_state) where in_room and returned_at is null;
