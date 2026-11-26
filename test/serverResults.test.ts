// The server's catalogue results (opacResults.tsx, GET /records/search?results=catalogue) must be the page's own:
// the same works from the same published records, the same hits, and the same filter counts as facetCounts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { catalogueList } from '../supabase/functions/server/catalogueRecord.tsx';
import { catalogueWorks, foundWorks, resultsPage } from '../supabase/functions/server/opacResults.tsx';
import { readState, writeState, type Selection, type SortKey } from '../supabase/functions/server/opacFacets.tsx';
import { facetCounts, applyFacets, sortWorks } from '../src/opac/facets';
import { clusterWorks } from '../src/opac/linkedEntities';
import { setOpacLang } from '../src/opac/i18n';

const BASE = 'https://catalog.moonlib.org/entity';
const plain = (x: unknown) => JSON.parse(JSON.stringify(x));
const raw: any[] = JSON.parse(readFileSync(new URL('./fixtures/opac-reader/records.json', import.meta.url), 'utf8'));

// The three published records; copies of them under other ids (the same books, which the catalogue lists once); and
// another edition of the first (no imprint), a book of its own.
const records: any[] = [
  ...raw,
  ...raw.map((r, i) => ({ ...plain(r), id: `${r.id}-second`, saved: `2025-0${i + 1}-15T10:00:00.000Z` })),
  { ...plain(raw[0]), id: 'other-edition', saved: '2024-12-01T00:00:00.000Z', document: { ...plain(raw[0].document), '@graph': plain(raw[0].document['@graph']).map((n: any) => (n['bf:provisionActivity'] ? { ...n, 'bf:provisionActivity': [] } : n)) } },
];

/** The page's catalogue: the service reading the published list from GET /records, as in the browser. */
async function pageService() {
  const list = catalogueList(records);
  (globalThis as any).fetch = async (url: string) => {
    if (String(url).includes('/records?view=published')) return new Response(JSON.stringify({ records: list, count: list.length }), { status: 200 });
    return new Response('{}', { status: 404 });
  };
  const { wolfMoonOpacService } = await import('../src/services/wolfMoonOpacService');
  await wolfMoonOpacService.initDatabase(true);
  return wolfMoonOpacService;
}

test('the server builds the same works from the published records as the page does', async () => {
  const service = await pageService();
  const page = service.getAllWorks();
  const server = catalogueWorks(catalogueList(records), BASE);
  assert.equal(page.length, 4, 'the copies are the same books, listed once; the other edition is a book of its own');
  assert.deepEqual(server.map((w) => w.id), page.map((w) => w.id), 'the same books in the same order');
  // modifiedAt falls back to "now" for a record with no saved date (as these fixtures), so it is left out.
  const same = (ws: any[]) => plain(ws).map(({ modifiedAt, ...w }: any) => w);
  assert.deepEqual(same(server), same(page));
});

test("the server's filter counts equal facetCounts on the same works, with and without filters, in both languages", async () => {
  const service = await pageService();
  const server = catalogueWorks(catalogueList(records), BASE);
  const works = service.getAllWorks();
  const sels: Selection[] = [{}, { lang: ['العربية'] }, { category: ['book'] }, { format: ['print'], decade: ['2000'] }, { avail: ['online', 'physical'] }];
  for (const lang of ['ar', 'en'] as const) {
    setOpacLang(lang);
    for (const sel of sels) {
      const result = resultsPage(server, { sel, sort: 'relevance', page: 1, grouped: true, lang });
      assert.deepEqual(result.counts, facetCounts(works, sel), `${lang} ${JSON.stringify(sel)}`);
    }
  }
  setOpacLang('ar');
});

test("the server's search, filters, order, groups and page are the page's own", async () => {
  const service = await pageService();
  const server = catalogueWorks(catalogueList(records), BASE);
  const queries = ['', ...new Set(server.flatMap((w) => [w.title.split(/\s+/)[0], w.primaryCreator?.nameArabic?.split(/\s+/)[0], w.subjects?.[0]?.label]).filter(Boolean) as string[]), 'history', 'شعر', 'karbala', 'zzqqxx'];
  const sorts: SortKey[] = ['relevance', 'title-asc', 'date-desc', 'added', 'copies'];
  for (const q of queries) {
    // The page: searchWorks, then the filters, the order and the Work groups as Results does them.
    const found = service.searchWorks(q, 'all', 'all', 'all', 'all', 'relevance', 1, 100000).works;
    const mine = foundWorks(server, q);
    assert.deepEqual(mine.works.map((w) => w.id), found.map((w) => w.id), `hits for «${q}»`);
    for (const w of found) if (w.matchReason) assert.equal(mine.reasons[w.id], w.matchReason, `why ${w.id} matched «${q}»`);
    for (const sort of sorts) {
      for (const sel of [{}, { lang: ['العربية'] }] as Selection[]) {
        for (const grouped of [true, false]) {
          const filtered = sortWorks(applyFacets(found, sel), sort);
          const groups = grouped ? clusterWorks(filtered) : filtered.map((w) => ({ key: w.id, lead: w, members: [w] }));
          const result = resultsPage(mine.works, { sel, sort, page: 1, grouped, lang: 'ar', pageSize: 2 });
          const what = `«${q}» ${sort} ${JSON.stringify(sel)} ${grouped ? 'grouped' : 'one per record'}`;
          assert.equal(result.groupCount, groups.length, what);
          assert.equal(result.recordCount, filtered.length, what);
          assert.deepEqual(result.ids, filtered.map((w) => w.id), what);
          assert.deepEqual(result.groups.map((g) => [g.key, g.lead.id, g.members.map((m) => m.id)]), groups.slice(0, 2).map((g) => [g.key, g.lead.id, g.members.map((m) => m.id)]), what);
          assert.deepEqual(result.order, groups.slice(0, 100).map((g) => g.members.map((m) => m.id)), what);
        }
      }
    }
  }
});

test('a page past the last shows the last, as the page does', () => {
  const server = catalogueWorks(catalogueList(records), BASE);
  const last = resultsPage(server, { sel: {}, sort: 'title-asc', page: 99, grouped: false, lang: 'ar', pageSize: 2 });
  assert.equal(last.pages, Math.ceil(server.length / 2));
  assert.deepEqual(last.groups.map((g) => g.lead.id), last.ids.slice((last.pages - 1) * 2));
});

test('the filters travel in the address the server reads them from', () => {
  const sel: Selection = { lang: ['العربية'], category: ['book', 'manuscript'] };
  const back = readState(writeState(new URLSearchParams('q=x'), { sel, sort: 'date-desc', page: 3 }));
  assert.deepEqual(back, { sel, sort: 'date-desc', page: 3 });
});
