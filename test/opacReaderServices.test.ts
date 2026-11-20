// The catalogue's reader services: search by field, advanced search, and citations / exports.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyFieldSearch, readAdvanced, advancedParams, fieldMatches, hasAdvanced } from '../src/opac/fieldSearch';
import { generateCitations, citeName, citeYear } from '../src/opac/citations';
import { sortWorks } from '../src/opac/facets';

const irwin = {
  id: 'w1', uri: 'https://mooon.site/resource/work/w1', title: 'Ibn Khaldun', subtitle: 'an intellectual biography', language: 'eng',
  primaryCreator: { name: 'Irwin, Robert, 1946-', nameArabic: '', role: 'author' },
  contributors: [], subjects: [{ label: 'Historians, Arab' }], series: 'Lives of the Mind',
  instances: [{ publisher: 'Princeton University Press', publicationPlace: 'Princeton, New Jersey', publicationYear: '[2018]', isbn: '978-0-691-17466-2' }],
};
const muqaddima = {
  id: 'w2', title: 'المقدمة', language: 'ara',
  primaryCreator: { name: 'Ibn Khaldūn, 1332-1406', nameArabic: 'ابن خلدون' },
  contributors: [], subjects: [{ label: 'التاريخ -- فلسفة' }],
  instances: [{ publisher: 'دار الفكر', publicationPlace: 'بيروت', publicationYear: '١٤٢٥ هـ', callNumber: 'D16.7 .I2' }],
};
const works = [irwin, muqaddima];

test('a search limited to one field only looks there', () => {
  const a = readAdvanced(new URLSearchParams('in=title'));
  assert.deepEqual(applyFieldSearch(works, 'khaldun', a).map((w) => w.id), ['w1'], 'title has it; the Arabic book only in the author');
  const au = readAdvanced(new URLSearchParams('in=author'));
  assert.deepEqual(applyFieldSearch(works, 'ابن خلدون', au).map((w) => w.id), ['w2']);
});

test('ISBN matches by its digits, hyphens or not', () => {
  assert.ok(fieldMatches(irwin, 'number', '9780691174662'));
  assert.ok(fieldMatches(irwin, 'number', '0-691-17466'));
  assert.ok(!fieldMatches(irwin, 'number', '12345'));
});

test('advanced search combines fields and a year range (Hijri years converted)', () => {
  const p = advancedParams({ fields: { publisher: 'princeton', subject: 'historians' }, yearFrom: 2000, yearTo: 2020 });
  const a = readAdvanced(p);
  assert.ok(hasAdvanced(a));
  assert.deepEqual(applyFieldSearch(works, '', a).map((w) => w.id), ['w1']);
  const old = readAdvanced(new URLSearchParams('y2=1990'));
  assert.deepEqual(applyFieldSearch(works, '', old).map((w) => w.id), [], '1425 AH is 2004, after 1990');
  const cn = readAdvanced(new URLSearchParams('cn=D16.7'));
  assert.deepEqual(applyFieldSearch(works, '', cn).map((w) => w.id), ['w2']);
});

test('sort by author', () => {
  const sorted = sortWorks([muqaddima, irwin] as any, 'author-asc').map((w: any) => w.id);
  assert.deepEqual(sorted, ['w2', 'w1'], 'Ibn Khaldūn before Irwin');
});

test('citations use the book’s script, drop authority dates, and give the edition year', () => {
  assert.equal(citeName(irwin.primaryCreator, false), 'Irwin, Robert');
  assert.equal(citeName(muqaddima.primaryCreator, true), 'ابن خلدون');
  assert.equal(citeYear('[2018]'), '2018');
  assert.equal(citeYear('١٤٢٥ هـ'), '1425');
  const c = generateCitations(irwin);
  assert.equal(c.apa, 'Irwin, Robert. (2018). Ibn Khaldun: an intellectual biography. Princeton University Press. https://mooon.site/resource/work/w1');
  assert.match(c.chicago, /Princeton, New Jersey: Princeton University Press\./);
  assert.match(c.bibtex, /isbn = \{978-0-691-17466-2\}/);
  assert.match(c.ris, /^TY {2}- BOOK\r\nAU {2}- Irwin, Robert\r\nTI {2}- Ibn Khaldun: an intellectual biography\r\nPY {2}- 2018/);
  assert.match(c.ris, /ER {2}- $/);
  const ar = generateCitations(muqaddima);
  assert.match(ar.apa, /^ابن خلدون\. \(1425\)\. المقدمة\. دار الفكر\.$/);
});
