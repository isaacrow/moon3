// Publisher, series and genre pages: which books belong, one page for one name however it is written, a series in
// number order; and the catalogue now reads genres and series statements at all.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupsOf, seriesParts, worksOfGroup } from '../src/opac/groupPages';

const books = [
  { id: 'a', instances: [{ publisher: 'Penguin Books' }], genreForm: ['History'], series: 'Dirāsāt fī al-adab al-ʻArabī ; 27' },
  { id: 'b', instances: [{ publisher: 'Penguin books,' }], genreForm: ['History', 'Poetry'], series: 'Dirasat fi al-adab al-Arabi ; 3' },
  { id: 'c', instances: [{ publisher: 'Yale University Press' }], genreForm: ['شعر'], series: 'Dirāsāt fī al-adab al-ʻArabī' },
  { id: 'd', instances: [], publisher: { name: 'Yale University Press' }, genreForm: [] },
];

test('seriesParts splits the number off, in either script', () => {
  assert.deepEqual(seriesParts('Dirāsāt fī al-adab al-ʻArabī ; 27'), { name: 'Dirāsāt fī al-adab al-ʻArabī', number: '27' });
  assert.deepEqual(seriesParts('تراث الحكمة والفلسفة الاسلامية ؛ القسم الفلسفي 14'), { name: 'تراث الحكمة والفلسفة الاسلامية', number: 'القسم الفلسفي 14' });
  assert.deepEqual(seriesParts('Delphi poets series'), { name: 'Delphi poets series', number: '' });
});

test('one publisher however it is written, shown as most books write it', () => {
  assert.deepEqual(groupsOf('publisher', books), [{ name: 'Penguin Books', count: 2 }, { name: 'Yale University Press', count: 2 }]);
  assert.deepEqual(worksOfGroup('publisher', books, 'penguin books').map(w => w.id), ['a', 'b']);
  assert.deepEqual(worksOfGroup('publisher', books, 'Yale University Press').map(w => w.id), ['c', 'd'], 'the work-level publisher counts too');
});

test('a series lists its books in number order, unnumbered last; accents need not match', () => {
  assert.deepEqual(groupsOf('series', books), [{ name: 'Dirāsāt fī al-adab al-ʻArabī', count: 3 }]);
  assert.deepEqual(worksOfGroup('series', books, 'Dirāsāt fī al-adab al-ʻArabī ; 99').map(w => w.id), ['b', 'a', 'c']);
});

test('genres: each label its own page', () => {
  assert.deepEqual(groupsOf('genre', books).map(g => `${g.name}:${g.count}`), ['History:2', 'Poetry:1', 'شعر:1']);
  assert.deepEqual(worksOfGroup('genre', books, 'history').map(w => w.id), ['a', 'b']);
  assert.deepEqual(worksOfGroup('genre', books, 'Nothing'), []);
  assert.deepEqual(worksOfGroup('genre', books, ''), []);
});

test('the catalogue reads genres and series statements from the record', async () => {
  const { wolfMoonOpacService } = await import('../src/services/wolfMoonOpacService');
  const work = (wolfMoonOpacService as any).parseBibframeDocumentToOpacWork({ id: 'r1', title: 'Diwan', document: { '@graph': [
    { '@id': 'https://mooon.site/resource/work/w1', '@type': 'bf:Work', 'bf:title': { 'bf:mainTitle': 'Diwan' },
      'bf:genreForm': [{ '@type': 'bf:GenreForm', 'rdfs:label': 'Poetry' }, { '@type': 'bf:GenreForm', 'rdfs:label': 'شعر' }, { '@id': 'http://id.loc.gov/authorities/genreForms/gf2014026297' }],
      'bf:hasInstance': { '@id': 'https://mooon.site/resource/instance/i1' } },
    { '@id': 'https://mooon.site/resource/instance/i1', '@type': 'bf:Instance', 'bf:seriesStatement': 'Delphi poets series ; 4' },
  ] } });
  assert.deepEqual(work.genreForm, ['Poetry', 'شعر'], 'labels kept; an address with no label is left out');
  assert.equal(work.series, 'Delphi poets series ; 4');
});
