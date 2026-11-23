-- The Al-Qamar manuscripts catalogue (107,149 Arabic, Persian and Ottoman manuscripts from dromh.org), read in
-- Moon's Manuscripts screen (/manuscripts/). Only the Super Admin and accounts with the "manuscripts" role open it
-- (manuscriptsRoutes.tsx). Only the edge function (service role) reads these tables: row level security is on with
-- no policies. Filled by scripts/import-manuscripts.mjs from Al-Qamar's cleaned catalogue.
--
-- Each row keeps the source fields exactly as Al-Qamar has them (fields, keyed by their Arabic names). The MARC 21 /
-- RDA record is not stored: the app builds it from these fields with Al-Qamar's own builder (manuscriptMarc.ts),
-- which keeps the table about a fifth of the size it would be with the MARC in it.

create table if not exists public.manuscripts (
  id           text primary key check (id ~ '^[A-Za-z0-9._-]{1,40}$'),
  view_url     text,
  fields       jsonb not null default '{}'::jsonb,
  title        text generated always as (coalesce(fields ->> 'العنوان', '')) stored,
  author       text generated always as (fields ->> 'المؤلف') stored,
  subject      text generated always as (fields ->> 'الموضوع') stored,
  language     text generated always as (fields ->> 'اللغة') stored,
  library      text generated always as (fields ->> 'المصدر') stored,
  copy_number  text generated always as (fields ->> 'رقم النسخة') stored,
  copy_date    text generated always as (fields ->> 'تاريخ النسخ') stored,
  copyist      text generated always as (fields ->> 'الناسخ') stored,
  -- What a search looks in: title, author, subject, copyist, library, shelf number, copy place and the record number,
  -- folded the way Moon's record search folds them (moon_normalize: diacritics, alef forms, ى/ي, ة/ه).
  -- (|| and coalesce, not concat_ws: a generated column needs an immutable expression, and concat_ws is only stable.)
  search_text  text generated always as (public.moon_normalize(
                 coalesce(fields ->> 'العنوان', '') || ' ' || coalesce(fields ->> 'المؤلف', '') || ' ' ||
                 coalesce(fields ->> 'الموضوع', '') || ' ' || coalesce(fields ->> 'الناسخ', '') || ' ' ||
                 coalesce(fields ->> 'المصدر', '') || ' ' || coalesce(fields ->> 'رقم النسخة', '') || ' ' ||
                 coalesce(fields ->> 'مكان النسخ', '') || ' ' || id)) stored,
  imported_at  timestamptz not null default now()
);
-- Filters. A search is a plain scan of search_text (about 25 MB for the whole catalogue, well under a second); a
-- trigram index would roughly triple the table's size on the free plan's 500 MB.
create index if not exists manuscripts_library_idx  on public.manuscripts (library);
create index if not exists manuscripts_subject_idx  on public.manuscripts (subject);
create index if not exists manuscripts_language_idx on public.manuscripts (language);
alter table public.manuscripts enable row level security;
revoke all on public.manuscripts from public, anon, authenticated;

-- One page of matching manuscripts plus the total. Titles that contain the query come first, then by record number.
create or replace function public.moon_search_manuscripts(
  p_q        text default '',
  p_library  text default null,
  p_subject  text default null,
  p_language text default null,
  p_limit    integer default 50,
  p_offset   integer default 0
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with q as (select public.moon_normalize(p_q) as q),
  matched as (
    select m.*
    from public.manuscripts m, q
    where (q.q = '' or m.search_text like '%' || q.q || '%')
      and (p_library  is null or m.library  = p_library)
      and (p_subject  is null or m.subject  = p_subject)
      and (p_language is null or m.language = p_language)
  )
  select jsonb_build_object(
    'total', (select count(*) from matched),
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', id, 'title', title, 'author', author, 'subject', subject, 'language', language,
               'library', library, 'copyNumber', copy_number, 'copyDate', copy_date, 'copyist', copyist) order by rn)
      from (
        select matched.*, row_number() over (
                 order by (q.q <> '' and public.moon_normalize(matched.title) like '%' || q.q || '%') desc,
                          length(matched.id), matched.id) as rn
        from matched, q
        order by rn
        limit greatest(1, least(coalesce(p_limit, 50), 200))
        offset greatest(0, coalesce(p_offset, 0))
      ) page
    ), '[]'::jsonb)
  )
$$;

-- The values the filters offer, most manuscripts first, and the catalogue's size.
create or replace function public.moon_manuscript_facets()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'total', (select count(*) from public.manuscripts),
    'libraries', coalesce((select jsonb_agg(jsonb_build_object('value', v, 'count', n) order by n desc, v)
                           from (select library v, count(*) n from public.manuscripts where coalesce(library, '') <> ''
                                 group by 1 order by 2 desc limit 400) x), '[]'::jsonb),
    'subjects', coalesce((select jsonb_agg(jsonb_build_object('value', v, 'count', n) order by n desc, v)
                          from (select subject v, count(*) n from public.manuscripts where coalesce(subject, '') <> ''
                                group by 1 order by 2 desc limit 300) x), '[]'::jsonb),
    'languages', coalesce((select jsonb_agg(jsonb_build_object('value', v, 'count', n) order by n desc, v)
                           from (select language v, count(*) n from public.manuscripts where coalesce(language, '') <> ''
                                 group by 1 order by 2 desc limit 60) x), '[]'::jsonb)
  )
$$;

revoke all on function public.moon_search_manuscripts(text, text, text, text, integer, integer) from public, anon, authenticated;
revoke all on function public.moon_manuscript_facets() from public, anon, authenticated;
grant all on public.manuscripts to service_role;
grant execute on function public.moon_search_manuscripts(text, text, text, text, integer, integer) to service_role;
grant execute on function public.moon_manuscript_facets() to service_role;
