-- Number sequences (plan step H6, after FOLIO's number generators): each library's barcodes and borrower cards can
-- come from a sequence it sets (a prefix, the next number, a width). Numbers are taken in one statement, so two
-- desks never get the same one. Only the edge function (service role) uses these: row level security is on with
-- no policies, and the function is not callable by the public roles.
create table if not exists public.number_sequences (
  library     text not null,
  kind        text not null check (kind in ('barcode', 'card')),
  prefix      text not null default '' check (prefix ~ '^[A-Za-z0-9._-]{0,12}$'),
  next        bigint not null default 1 check (next >= 1),
  width       integer not null default 0 check (width between 0 and 12),
  updated_by  text,
  updated_at  timestamptz not null default now(),
  primary key (library, kind)
);
alter table public.number_sequences enable row level security;

-- Takes `p_count` numbers from the library's sequence and moves it on; none when the library has no sequence.
create or replace function public.moon_take_numbers(p_library text, p_kind text, p_count integer)
returns setof text
language sql
volatile
set search_path = public
as $$
  with taken as (
    update number_sequences set next = next + greatest(1, least(p_count, 1000)), updated_at = now()
    where library = p_library and kind = p_kind
    returning prefix, width, next - greatest(1, least(p_count, 1000)) as first
  )
  select taken.prefix || lpad(n::text, greatest(taken.width, length(n::text)), '0')
  from taken, generate_series(taken.first, taken.first + greatest(1, least(p_count, 1000)) - 1) as n;
$$;
revoke all on function public.moon_take_numbers(text, text, integer) from public, anon, authenticated;
