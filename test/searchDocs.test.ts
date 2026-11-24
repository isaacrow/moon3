// The server's search of the published catalogue: a record's BIBFRAME graph read into the search's fields, and
// one search with the catalogue page's rules, in pages.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchableOf, searchDocs } from '../supabase/functions/server/searchDocs.tsx';
import { matchWork, fuzzyMatchWork } from '../supabase/functions/server/searchCore.tsx';

const awlad = {
  '@graph': [
    {
      '@id': 'https://mooon.site/resource/work/s1', '@type': ['bf:Work', 'bf:Text'],
      'bf:title': { '@type': 'bf:Title', 'bf:mainTitle': 'أولاد حارتنا' },
      'bf:contribution': [{ '@type': ['bf:Contribution', 'bf:PrimaryContribution'], 'bf:agent': { '@id': 'https://mooon.site/resource/agent/mahfouz' }, 'bf:role': { '@id': 'http://id.loc.gov/vocabulary/relators/aut' } }],
      'bf:subject': [{ '@id': 'https://mooon.site/resource/topic/t1', '@type': 'bf:Topic', 'rdfs:label': 'الرواية العربية -- مصر' }],
      'bf:summary': { '@type': 'bf:Summary', 'rdfs:label': 'رواية رمزية عن حارة قاهرية' },
      'bf:language': { '@id': 'http://id.loc.gov/vocabulary/languages/ara' },
      'bf:classification': { '@type': 'bf:ClassificationDdc', 'bf:classificationPortion': '892.736' },
    },
    { '@id': 'https://mooon.site/resource/agent/mahfouz', '@type': 'bf:Person', 'rdfs:label': 'محفوظ، نجيب' },
    {
      '@id': 'https://mooon.site/resource/instance/s1', '@type': ['bf:Instance', 'bf:Print'],
      'bf:title': { '@type': 'bf:Title', 'bf:mainTitle': 'أولاد حارتنا', 'bf:subtitle': 'رواية' },
      'bf:identifiedBy': [{ '@type': 'bf:Isbn', 'rdf:value': '9789770915349' }],
      'bf:provisionActivity': { '@type': ['bf:ProvisionActivity', 'bf:Publication'], 'bf:agent': { 'rdfs:label': 'دار الشروق' }, 'bf:place': { 'rdfs:label': 'القاهرة' } },
    },
    { '@id': 'https://mooon.site/resource/item/s1-a', '@type': 'bf:Item', 'bf:shelfMark': { '@type': 'bf:ShelfMark', 'rdfs:label': 'PJ7846.A46 A7' } },
  ],
};
const gilgamesh = {
  '@graph': [
    { '@id': 'w2', '@type': 'bf:Work', 'bf:title': { 'bf:mainTitle': 'The epic of Gilgamesh' }, 'bf:contribution': { 'bf:agent': { 'rdfs:label': 'Jastrow, Morris' } }, 'bf:subject': { 'rdfs:label': 'Epic poetry, Assyro-Babylonian' } },
    { '@id': 'i2', '@type': 'bf:Instance', 'bf:title': { 'bf:mainTitle': 'The epic of Gilgamesh' }, 'bf:note': { 'rdfs:label': 'Printed in Philadelphia' } },
  ],
};

test('a record is read into the search fields: titles, the author by address, subjects, publisher, ISBN, shelf mark', () => {
  const w = searchableOf(awlad)!;
  assert.equal(w.title, 'أولاد حارتنا');
  assert.match(w.subtitle!, /رواية/);
  assert.equal(w.primaryCreator?.name, 'محفوظ، نجيب');
  assert.equal(w.primaryCreator?.uri, 'https://mooon.site/resource/agent/mahfouz');
  assert.deepEqual(w.subjects!.map((s) => s.label), ['الرواية العربية -- مصر']);
  assert.equal(w.publisher?.name, 'دار الشروق');
  assert.equal(w.publisher?.city, 'القاهرة');
  assert.equal(w.instances![0].isbn, '9789770915349');
  assert.equal(w.instances![0].callNumber, 'PJ7846.A46 A7');
  assert.equal(w.classificationDdc, '892.736');
  assert.equal(searchableOf({ '@graph': [{ '@type': 'bf:AdminMetadata' }] }), null);
});

test('one search over the published records: best first, in pages, across scripts and typing slips', () => {
  const docs = [awlad, gilgamesh].map((doc, i) => ({ record: { id: `r${i}` }, work: searchableOf(doc)! }));
  const ask = (q: string, offset = 0, limit = 20) => searchDocs(docs, q, { matchWork, fuzzyMatchWork }, offset, limit);
  assert.deepEqual(ask('حارتنا').results.map((x) => x.record.id), ['r0']);
  assert.deepEqual(ask('Mahfouz').results.map((x) => x.record.id), ['r0'], 'Latin letters find the Arabic name');
  assert.deepEqual(ask('جلجامش').results.map((x) => x.record.id), ['r1'], 'Arabic letters find the Latin title');
  assert.deepEqual(ask('Gilgamesch').results.map((x) => x.record.id), ['r1'], 'one typing slip');
  assert.deepEqual(ask('978-977-0915-34-9').results.map((x) => x.record.id), ['r0'], 'ISBN with hyphens');
  assert.deepEqual(ask('PJ7846').results.map((x) => x.record.id), ['r0'], 'shelf mark');
  assert.equal(ask('Philadelfia').total, 0, 'no typing-slip guesses from notes');
  assert.equal(ask('').total, 2, 'an empty question lists everything');
  const page = ask('', 1, 1);
  assert.equal(page.total, 2);
  assert.deepEqual(page.results.map((x) => x.record.id), ['r1'], 'the second page of one');
});
