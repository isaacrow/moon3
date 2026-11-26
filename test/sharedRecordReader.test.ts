// The catalogue's record reader and its filters live with the server (opacWork.tsx, opacFacets.tsx), so the server can
// read and count works exactly as the page does. These check that the move changed nothing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { workFromRecord, entityIri } from '../supabase/functions/server/opacWork.tsx';
import * as shared from '../supabase/functions/server/opacFacets.tsx';
import * as page from '../src/opac/facets';
import { setOpacLang } from '../src/opac/i18n';

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/opac-reader/${name}`, import.meta.url), 'utf8'));
const records: any[] = fixture('records.json');
const before: any[] = fixture('works.json');
// The address the page's service uses outside a browser (getCatalogBaseUri), as when the fixtures were made.
const BASE = 'https://catalog.moonlib.org/entity';
const plain = (x: unknown) => JSON.parse(JSON.stringify(x));

test('the shared reader makes the same works from published records as the page did before the move', () => {
  assert.equal(records.length, 3);
  records.forEach((r, i) => {
    const work = workFromRecord(r, { base: BASE });
    assert.ok(work, r.id);
    const { document, ...rest } = work!;
    assert.deepEqual(plain(rest), before[i], r.id);
    assert.deepEqual(document, r.document, 'the work keeps its record');
  });
});

test('the page service reads records through the shared reader', async () => {
  const { wolfMoonOpacService, getEntityIri } = await import('../src/services/wolfMoonOpacService');
  const viaPage = wolfMoonOpacService.worksFromRecords(records);
  assert.deepEqual(plain(viaPage), plain(records.map((r) => workFromRecord(r, { base: BASE }))));
  assert.equal(getEntityIri('agent', 'person-x'), entityIri(BASE, 'agent', 'person-x'));
});

test('entity addresses are built on the base the caller gives', () => {
  const work = workFromRecord(records[0], { base: 'https://mooon.site/entity' })!;
  assert.equal(work.uri, 'https://mooon.site/entity/work/1794080317705', 'the id without its "record-" prefix, as before');
  assert.ok(work.primaryCreator.uri.startsWith('https://mooon.site/entity/agent/'));
  assert.ok(work.instances.every((i) => i.uri.startsWith('https://mooon.site/entity/instance/')));
});

test('a blank draft is still no work', () => {
  assert.equal(workFromRecord({ id: 'd1', title: 'Untitled', document: { '@graph': [{ '@type': 'bf:Work' }] } }, { base: BASE }), null);
});

test('facetCounts gives the same counts through the page stub and the shared module, in either language', () => {
  const works = records.map((r) => workFromRecord(r, { base: BASE })!);
  for (const lang of ['ar', 'en'] as const) {
    setOpacLang(lang);
    for (const sel of [{}, { lang: ['العربية'] }, { category: ['manuscript'], kind: ['hub'] }] as shared.Selection[]) {
      assert.deepEqual(page.facetCounts(works, sel), shared.facetCounts(works, sel, lang), `${lang} ${JSON.stringify(sel)}`);
    }
    assert.equal(page.valueLabel('category', 'manuscript'), shared.valueLabel('category', 'manuscript', lang));
    assert.equal(page.languageDisplay('العربية'), shared.languageDisplay('العربية', lang));
  }
  setOpacLang('ar');
  const ar = shared.facetCounts(works, {}, 'ar');
  const en = shared.facetCounts(works, {}, 'en');
  assert.deepEqual(ar.lang.map((v) => v.count), en.lang.map((v) => v.count), 'the counts do not depend on the language');
  assert.ok(en.lang.some((v) => v.label === 'English') && ar.lang.some((v) => v.label === 'الإنجليزية'), 'only the labels do');
  assert.equal(page.sortWorks, shared.sortWorks, 'sorting is the shared function itself');
});
