-- Accession numbers (plan step H6): a library's copies can also take an accession number from a sequence, beside
-- barcodes and borrower cards. The edge function writes the number on the copy as bf:identifiedBy of the
-- BIBFRAME class bf:AccessionNumber.
do $$
declare c record;
begin
  -- The kind check made by the table's first migration (named by Postgres, so found by what it checks).
  for c in
    select conname from pg_constraint
    where conrelid = 'public.number_sequences'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%kind%'
  loop
    execute format('alter table public.number_sequences drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.number_sequences add constraint number_sequences_kind_check check (kind in ('barcode', 'card', 'accession'));
