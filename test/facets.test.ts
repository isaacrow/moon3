import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyFacets, facetCounts, sortWorks, readState, writeState, toggle, valuesOf, workYearOf, type FacetWork } from '../src/opac/facets';

const works: FacetWork[] = [
  { id: 'a', title: 'الأغاني', languageLabel: 'العربية (ara)', genreForm: ['أدب'], primaryCreator: { nameArabic: 'الأصفهاني' }, subjects: [{ label: 'شعر' }],
    instances: [{ publicationYear: '١٩٩٠', carrierType: 'volume' }], holdingItems: [{ heldBy: 'مكتبة العتبة — القاعة', synthetic: false }, { heldBy: 'مكتبة العتبة', synthetic: false }] },
  { id: 'b', title: 'Baghdad', languageLabel: 'الإنجليزية', genreForm: ['تاريخ'], primaryCreator: { nameArabic: 'Author B' },
    contributors: [{ nameArabic: 'Author B' }, { nameArabic: 'مترجم', role: 'translator' }], subjects: [{ label: 'تاريخ العراق' }],
    instances: [{ publicationYear: '2021', carrierType: 'online resource' }], holdingItems: [{ accessUrl: 'https://x', synthetic: false }] },
  { id: 'c', title: 'تاريخ', languageLabel: 'العربية (ara)', genreForm: ['تاريخ'], primaryCreator: { nameArabic: 'مؤلف غير معروف' }, subjects: [{ label: 'تاريخ العراق' }],
    instances: [{ publicationYear: '[2015?]' }], holdingItems: [{ heldBy: 'مكتبة أخرى', synthetic: true }] },
];

test('values: availability, format, decade, kind, unknown authors left out', () => {
  assert.deepEqual(valuesOf(works[0], 'avail'), ['physical']);
  assert.deepEqual(valuesOf(works[1], 'avail'), ['online']);
  assert.deepEqual(valuesOf(works[2], 'avail'), []);
  assert.deepEqual(valuesOf(works[0], 'format'), ['print']);
  assert.deepEqual(valuesOf(works[1], 'format'), ['online']);
  assert.deepEqual(valuesOf({ ...works[0], instances: [{ format: 'microform', carrierType: 'volume' }] }, 'format'), ['microform'], 'the format the record gives wins');
  assert.deepEqual(valuesOf({ ...works[0], category: 'manuscript' }, 'category'), ['manuscript']);
  assert.deepEqual(valuesOf(works[0], 'genre'), ['أدب']);
  assert.deepEqual(valuesOf(works[0], 'decade'), ['1990']);
  assert.deepEqual(valuesOf(works[1], 'kind'), ['translation']);
  assert.deepEqual(valuesOf(works[2], 'author'), []);
  assert.deepEqual(valuesOf(works[0], 'library'), ['مكتبة العتبة']);
  assert.deepEqual(valuesOf(works[0], 'lang'), ['العربية']);
  assert.equal(workYearOf(works[2]), 2015);
});

test('facets: or within a facet, and across facets', () => {
  assert.deepEqual(applyFacets(works, { lang: ['العربية'] }).map((w) => w.id), ['a', 'c']);
  assert.deepEqual(applyFacets(works, { genre: ['أدب', 'تاريخ'] }).map((w) => w.id), ['a', 'b', 'c']);
  assert.deepEqual(applyFacets(works, { genre: ['تاريخ'], lang: ['العربية'] }).map((w) => w.id), ['c']);
});

test('counts take the other facets into account and keep chosen values', () => {
  const c = facetCounts(works, { lang: ['العربية'] });
  assert.deepEqual(c.lang.map((v) => [v.value, v.count]), [['العربية', 2], ['الإنجليزية', 1]]);
  assert.deepEqual(c.genre.map((v) => [v.value, v.count]), [['أدب', 1], ['تاريخ', 1]]);
  const none = facetCounts(works, { subject: ['شعر'], lang: ['الإنجليزية'] });
  assert.ok(none.subject.some((v) => v.value === 'شعر' && v.count === 0));
  assert.deepEqual(c.decade.map((v) => v.value), ['2010', '1990']);
});

test('sorting', () => {
  assert.deepEqual(sortWorks(works, 'date-desc').map((w) => w.id), ['b', 'c', 'a']);
  assert.deepEqual(sortWorks(works, 'date-asc').map((w) => w.id), ['a', 'c', 'b']);
  assert.deepEqual(sortWorks(works, 'copies').map((w) => w.id)[0], 'a');
  assert.deepEqual(sortWorks(works, 'relevance').map((w) => w.id), ['a', 'b', 'c']);
});

test('state lives in the address and survives a round trip', () => {
  let sel = toggle({}, 'lang', 'العربية');
  sel = toggle(sel, 'category', 'تاريخ');
  sel = toggle(sel, 'category', 'أدب');
  const p = writeState(new URLSearchParams('q=بغداد&f_old=x'), { sel, sort: 'date-desc', page: 2 });
  assert.equal(p.get('q'), 'بغداد');
  assert.equal(p.get('f_old'), null);
  const back = readState(p);
  assert.deepEqual(back, { sel, sort: 'date-desc', page: 2 });
  assert.deepEqual(toggle(sel, 'lang', 'العربية').lang, undefined);
  assert.deepEqual(readState(new URLSearchParams('sort=bogus')).sort, 'relevance');
});
