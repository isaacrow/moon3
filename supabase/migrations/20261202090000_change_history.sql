-- Version history everywhere (plan step H5, after FOLIO Sunflower 2025): vendors, funds, orders, invoices,
-- subscriptions and borrowers keep who changed what and when, as records already do (copies live in the records,
-- whose every save is a version). Written by a trigger, so no write is missed, whichever route makes it.
-- Who: the edge function names the signed-in person in the request header x-moon-actor (db.tsx).
-- Loans and holds are left out on purpose: Moon keeps no reading history. A borrower who is deleted takes their
-- details out of the history too: their earlier entries keep only what changed and when, not the values.
create table if not exists public.change_history (
  id        bigserial primary key,
  library   text,
  entity    text not null,
  row_id    text not null,
  action    text not null check (action in ('created', 'changed', 'deleted')),
  at        timestamptz not null default now(),
  actor     text,
  changed   text[] not null default '{}',
  before    jsonb,
  after     jsonb
);
create index if not exists change_history_row_idx on public.change_history (entity, row_id, at desc);
create index if not exists change_history_library_idx on public.change_history (library, at desc);
alter table public.change_history enable row level security;

create or replace function public.moon_log_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  old_j jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) else null end;
  new_j jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) else null end;
  keys text[];
  b jsonb := '{}'::jsonb;
  a jsonb := '{}'::jsonb;
  k text;
  who text;
begin
  begin
    who := nullif(current_setting('request.headers', true)::json ->> 'x-moon-actor', '');
  exception when others then
    who := null;
  end;
  if tg_op = 'UPDATE' then
    select coalesce(array_agg(key order by key), '{}') into keys
    from jsonb_each(new_j) n
    where key not in ('updated_at') and n.value is distinct from old_j -> key;
    if array_length(keys, 1) is null then return new; end if;
    foreach k in array keys loop
      b := b || jsonb_build_object(k, old_j -> k);
      a := a || jsonb_build_object(k, new_j -> k);
    end loop;
    insert into change_history (library, entity, row_id, action, actor, changed, before, after)
    values (new_j ->> 'library', tg_table_name, new_j ->> 'id', 'changed', who, keys, b, a);
    return new;
  elsif tg_op = 'INSERT' then
    insert into change_history (library, entity, row_id, action, actor, changed, after)
    values (new_j ->> 'library', tg_table_name, new_j ->> 'id', 'created', who, '{}', new_j - 'updated_at');
    return new;
  else
    if tg_table_name = 'patrons' then
      -- A deleted borrower's details leave the history with them.
      update change_history set before = null, after = null where entity = 'patrons' and row_id = old_j ->> 'id';
      insert into change_history (library, entity, row_id, action, actor)
      values (old_j ->> 'library', tg_table_name, old_j ->> 'id', 'deleted', who);
    else
      insert into change_history (library, entity, row_id, action, actor, before)
      values (old_j ->> 'library', tg_table_name, old_j ->> 'id', 'deleted', who, old_j - 'updated_at');
    end if;
    return old;
  end if;
end;
$$;
revoke all on function public.moon_log_change() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['acq_vendors', 'acq_funds', 'acq_orders', 'acq_invoices', 'acq_subscriptions', 'patrons'] loop
    execute format('drop trigger if exists moon_history on public.%I', t);
    execute format('create trigger moon_history after insert or update or delete on public.%I for each row execute function public.moon_log_change()', t);
  end loop;
end $$;
