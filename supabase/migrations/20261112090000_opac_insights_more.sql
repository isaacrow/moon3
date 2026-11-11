-- OPAC insights, more (anonymous). Adds to what 20261111180000 keeps: the hour a visit started (Baghdad time),
-- how many pages a visit viewed and for how long, and which things readers do (cite, save, copy a link, download
-- MARC, switch language, ask Moon...). Same daily hashed visitor key: nobody can be followed between days.
-- No new personal data: an action is only a name from a fixed list and a count. Kept 400 days.

alter table public.opac_context add column if not exists hour smallint not null default 0;
alter table public.opac_context add column if not exists pages integer not null default 1;
alter table public.opac_context add column if not exists seconds integer not null default 0;

create table if not exists public.opac_actions (
  day date not null,
  visitor text not null,
  action text not null,
  times integer not null default 1,
  primary key (day, visitor, action)
);
create index if not exists opac_actions_day on public.opac_actions (day);
alter table public.opac_actions enable row level security;
revoke all on public.opac_actions from public, anon, authenticated;

drop function if exists public.moon_record_context(date, text, text, text, text, text, text, text);
create or replace function public.moon_record_context(
  p_day date, p_visitor text, p_device text, p_lang text, p_browser_lang text, p_country text, p_source text, p_entry text,
  p_hour integer default 0)
returns void
language plpgsql
set search_path = public
as $$
begin
  insert into opac_context (day, visitor, device, lang, browser_lang, country, source, entry, hour)
  values (p_day, left(p_visitor, 64), left(p_device, 10), left(p_lang, 3), left(coalesce(p_browser_lang, ''), 3),
          left(coalesce(p_country, 'ZZ'), 2), left(coalesce(p_source, 'direct'), 80), left(coalesce(p_entry, 'home'), 10),
          greatest(0, least(coalesce(p_hour, 0), 23)))
  on conflict (day, visitor) do nothing;
  if random() < 0.01 then
    delete from opac_context where day < p_day - 400;
    delete from opac_actions where day < p_day - 400;
  end if;
end
$$;

-- The pages a visit viewed and the seconds it was open; only ever grows, so a late or repeated report is harmless.
create or replace function public.moon_record_end(p_day date, p_visitor text, p_pages integer, p_seconds integer)
returns void
language sql
set search_path = public
as $$
  update opac_context
     set pages = greatest(pages, least(greatest(coalesce(p_pages, 1), 1), 500)),
         seconds = greatest(seconds, least(greatest(coalesce(p_seconds, 0), 0), 14400))
   where day = p_day and visitor = left(p_visitor, 64);
$$;

-- p_max: the most different kinds of action kept for one visitor in one day (the list is short; this is a seatbelt).
create or replace function public.moon_record_action(p_day date, p_visitor text, p_action text, p_max integer default 20)
returns void
language plpgsql
set search_path = public
as $$
begin
  if exists (select 1 from opac_actions where day = p_day and visitor = left(p_visitor, 64) and action = left(p_action, 20)) then
    update opac_actions set times = least(times + 1, 1000)
     where day = p_day and visitor = left(p_visitor, 64) and action = left(p_action, 20);
  elsif (select count(*) from opac_actions where day = p_day and visitor = left(p_visitor, 64)) < p_max then
    insert into opac_actions (day, visitor, action) values (p_day, left(p_visitor, 64), left(p_action, 20));
  end if;
end
$$;

create or replace function public.moon_insight_stats(p_today date, p_days integer default 30)
returns jsonb
language sql
stable
set search_path = public
as $$
  with n as (select greatest(1, least(coalesce(p_days, 30), 366)) as d),
  ctx as (select c.* from opac_context c, n where c.day > p_today - n.d and c.day <= p_today),
  srch as (select s.* from opac_searches s, n where s.day > p_today - n.d and s.day <= p_today),
  act as (select a.* from opac_actions a, n where a.day > p_today - n.d and a.day <= p_today),
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
    'entries', (select coalesce(jsonb_object_agg(entry, k), '{}'::jsonb) from (select entry, count(*) as k from ctx group by entry) q),
    -- visitors by the hour a visit started (0-23, Baghdad time)
    'hours', (select coalesce(jsonb_object_agg(hour::text, k), '{}'::jsonb) from (select hour, count(*) as k from ctx group by hour) q),
    -- visitors on each day of the window, empty days as 0
    'daily', (select coalesce(jsonb_agg(jsonb_build_object('day', g.day, 'visitors', coalesce(c.k, 0)) order by g.day), '[]'::jsonb)
              from (select generate_series(p_today - ((select d from n) - 1), p_today, interval '1 day')::date as day) g
              left join (select day, count(*) as k from ctx group by day) c on c.day = g.day),
    -- what readers do: how many visitors did it and how many times
    'actions', (select coalesce(jsonb_agg(jsonb_build_object('action', action, 'visitors', v, 'times', t) order by v desc, action), '[]'::jsonb) from (
        select action, count(*) as v, sum(times) as t from act group by action) q),
    -- how deep a visit goes: pages per visit, the share that looked at one page only, minutes open (visits that reported a time)
    'depth', (select jsonb_build_object(
        'avgPages', coalesce(round(avg(pages), 1), 0),
        'onePageShare', coalesce(round(100.0 * count(*) filter (where pages <= 1) / nullif(count(*), 0)), 0),
        'avgSeconds', coalesce(round(avg(seconds) filter (where seconds > 0)), 0)) from ctx)
  )
$$;

revoke all on function public.moon_record_context(date, text, text, text, text, text, text, text, integer) from public, anon, authenticated;
revoke all on function public.moon_record_end(date, text, integer, integer) from public, anon, authenticated;
revoke all on function public.moon_record_action(date, text, text, integer) from public, anon, authenticated;
revoke all on function public.moon_insight_stats(date, integer) from public, anon, authenticated;
