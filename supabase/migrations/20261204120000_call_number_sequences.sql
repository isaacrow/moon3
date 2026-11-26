-- Local call numbers (plan step H6): a library can also keep a running call-number sequence (manuscripts
-- "MS 0001", a running shelf number), beside barcodes, borrower cards and accession numbers. Classification call
-- numbers (LC, Dewey) never come from here. A call-number prefix may hold spaces and Arabic letters, so the
-- prefix check is looser for this kind only; for_new_copies says whether copies from orders and copies imports
-- take one too (the cataloguer can always take one in the editor).
do $$
declare c record;
begin
  -- The kind check (named by #221's migration) and the prefix check (named by Postgres in the first one).
  for c in
    select conname from pg_constraint
    where conrelid = 'public.number_sequences'::regclass and contype = 'c'
      and (pg_get_constraintdef(oid) ilike '%kind%' or pg_get_constraintdef(oid) ilike '%prefix%')
  loop
    execute format('alter table public.number_sequences drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.number_sequences add constraint number_sequences_kind_check
  check (kind in ('barcode', 'card', 'accession', 'callno'));
alter table public.number_sequences add constraint number_sequences_prefix_check
  check (prefix ~ '^[A-Za-z0-9._-]{0,12}$'
         or (kind = 'callno' and char_length(prefix) <= 12 and prefix !~ '[[:cntrl:]]'));
alter table public.number_sequences add column if not exists for_new_copies boolean not null default false;
