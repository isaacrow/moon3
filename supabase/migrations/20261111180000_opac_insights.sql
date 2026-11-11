-- OPAC insights (anonymous). What readers do in the public catalogue: the device, language, country and
-- source of each daily visitor, and what they searched, how many results it found and whether they opened one.
-- Same visitor key as opac_visits: a hash the server makes from address, browser, day and a secret, so it
-- changes every day and nobody can be followed from one day to the next. No address, browser name, cookie
-- or page of the referring site is stored. Kept 400 days. See supabase/functions/server/opacInsights.tsx.

create table if not exists public.opac_context (
  day date not null,
  visitor text not null,
  device text not null,
  lang text not null,
  browser_lang text not null default '',
  country text not null default 'ZZ',
  source text not null default 'direct',
  entry text not null default 'home',
  primary key (day, visitor)
);
create index if not exists opac_context_day on public.opac_context (day);

create table if not exists public.opac_searches (
  day date not null,
  visitor text not null,
  query text not null,
  results integer not null default 0,
  script text not null,
  lang text not null,
  filters integer not null default 0,
  searches integer not null default 1,
  opened integer not null default 0,
  best_rank integer,
  primary key (day, visitor, query)
);
create index if not exists opac_searches_day on public.opac_searches (day, results);

alter table public.opac_context enable row level security;
alter table public.opac_searches enable row level security;
revoke all on public.opac_context from public, anon, authenticated;
revoke all on public.opac_searches from public, anon, authenticated;

create or replace function public.moon_record_context(
  p_day date, p_visitor text, p_device text, p_lang text, p_browser_lang text, p_country text, p_source text, p_entry text)
returns void
language plpgsql
set search_path = public
as $$
begin
  insert into opac_context (day, visitor, device, lang, browser_lang, country, source, entry)
  values (p_day, left(p_visitor, 64), left(p_device, 10), left(p_lang, 3), left(coalesce(p_browser_lang, ''), 3),
          left(coalesce(p_country, 'ZZ'), 2), left(coalesce(p_source, 'direct'), 80), left(coalesce(p_entry, 'home'), 10))
  on conflict (day, visitor) do nothing;
  if random() < 0.01 then
    delete from opac_context where day < p_day - 400;
  end if;
end
$$;

-- p_max: the most different searches kept for one visitor in one day.
create or replace function public.moon_record_search(
  p_day date, p_visitor text, p_query text, p_results integer, p_script text, p_lang text, p_filters integer, p_max integer default 60)
returns void
language plpgsql
set search_path = public
as $$
begin
  if exists (select 1 from opac_searches where day = p_day and visitor = left(p_visitor, 64) and query = left(p_query, 120)) then
    update opac_searches
       set searches = searches + 1, results = p_results, filters = p_filters
     where day = p_day and visitor = left(p_visitor, 64) and query = left(p_query, 120);
  elsif (select count(*) from opac_searches where day = p_day and visitor = left(p_visitor, 64)) < p_max then
    insert into opac_searches (day, visitor, query, results, script, lang, filters)
    values (p_day, left(p_visitor, 64), left(p_query, 120), greatest(p_results, 0), left(p_script, 10), left(p_lang, 3), greatest(p_filters, 0));
  end if;
  if random() < 0.01 then
    delete from opac_searches where day < p_day - 400;
  end if;
end
$$;

-- A reader opened a result of this search; p_rank is its place in the list (1 = first).
create or replace function public.moon_record_open(p_day date, p_visitor text, p_query text, p_rank integer)
returns void
language sql
set search_path = public
as $$
  update opac_searches
     set opened = opened + 1, best_rank = least(coalesce(best_rank, p_rank), p_rank)
   where day = p_day and visitor = left(p_visitor, 64) and query = left(p_query, 120);
$$;

-- What the dashboard shows, for the last p_days days (counts of visitors are per day, so a visitor who
-- returns on another day counts again: a returning visitor cannot be told from a new one, by design).
create or replace function public.moon_insight_stats(p_today date, p_days integer default 30)
returns jsonb
language sql
stable
set search_path = public
as $$
  with n as (select greatest(1, least(coalesce(p_days, 30), 366)) as d),
  ctx as (select c.* from opac_context c, n where c.day > p_today - n.d and c.day <= p_today),
  srch as (select s.* from opac_searches s, n where s.day > p_today - n.d and s.day <= p_today),
  tot as (select count(*) as visitors from ctx),
  ss as (select coalesce(sum(searches), 0) as searches, coalesce(sum(searches) filter (where results = 0), 0) as nothing,
                count(*) filter (where opened > 0) as opened, count(*) as distinct_searches from srch)
  select jsonb_build_object(
    'days', (select d from n),
    'visitors', (select visitors from tot),
    'searches', (select jsonb_build_object(
        'total', ss.searches, 'foundNothing', ss.nothing, 'distinct', ss.distinct_searches,
        'openedShare', case when ss.distinct_searches = 0 then null else round(100.0 * ss.opened / ss.distinct_searches) end) from ss),
    'nothingFound', (select coalesce(jsonb_agg(x order by rn), '[]'::jsonb) from (
        select jsonb_build_object('query', query, 'times', sum(searches), 'visitors', count(distinct visitor), 'script', min(script)) x,
               row_number() over (order by sum(searches) desc, query) as rn
        from srch where results = 0 group by query order by sum(searches) desc, query limit 20) q),
    'topSearches', (select coalesce(jsonb_agg(x order by rn), '[]'::jsonb) from (
        select jsonb_build_object('query', query, 'times', sum(searches), 'visitors', count(distinct visitor), 'results', max(results),
                                  'openedShare', round(100.0 * count(*) filter (where opened > 0) / count(*)),
                                  'bestRank', min(best_rank)) x,
               row_number() over (order by sum(searches) desc, query) as rn
        from srch where results > 0 group by query order by sum(searches) desc, query limit 20) q),
    'scripts', (select coalesce(jsonb_object_agg(script, k), '{}'::jsonb) from (select script, sum(searches) as k from srch group by script) q),
    'devices', (select coalesce(jsonb_object_agg(device, k), '{}'::jsonb) from (select device, count(*) as k from ctx group by device) q),
    'languages', (select coalesce(jsonb_object_agg(lang, k), '{}'::jsonb) from (select lang, count(*) as k from ctx group by lang) q),
    'browserLanguages', (select coalesce(jsonb_agg(jsonb_build_object('lang', browser_lang, 'visitors', k) order by k desc), '[]'::jsonb) from (
        select browser_lang, count(*) as k from ctx where browser_lang <> '' group by browser_lang order by k desc limit 8) q(browser_lang, k)),
    'countries', (select coalesce(jsonb_agg(jsonb_build_object('country', country, 'visitors', k) order by k desc), '[]'::jsonb) from (
        select country, count(*) as k from ctx group by country order by k desc limit 12) q),
    'sources', (select coalesce(jsonb_agg(jsonb_build_object('source', source, 'visitors', k) order by k desc), '[]'::jsonb) from (
        select source, count(*) as k from ctx group by source order by k desc limit 12) q),
    'entries', (select coalesce(jsonb_object_agg(entry, k), '{}'::jsonb) from (select entry, count(*) as k from ctx group by entry) q)
  )
$$;

revoke all on function public.moon_record_context(date, text, text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.moon_record_search(date, text, text, integer, text, text, integer, integer) from public, anon, authenticated;
revoke all on function public.moon_record_open(date, text, text, integer) from public, anon, authenticated;
revoke all on function public.moon_insight_stats(date, integer) from public, anon, authenticated;
