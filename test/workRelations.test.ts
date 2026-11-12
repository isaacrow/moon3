// Links between works: read in both BIBFRAME forms (every value), written as bf:relation with LC's term, removed in
// either form, and shown on both books' pages (the inverse on the other one), in Arabic and English.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LC_RELATIONSHIP, readWorkRelations, relationWords, withoutRelation, withRelation, workNodeOf } from '../supabase/functions/server/workRelations.tsx';

const W1 = 'https://mooon.site/resource/work/w1';
const W2 = 'https://mooon.site/resource/work/w2';
const W3 = 'https://mooon.site/resource/work/w3';
const record = (work: Record<string, unknown> = {}, id = W1, title = 'Al-Muqaddimah') => ({ '@graph': [
  { '@id': id, '@type': 'bf:Work', 'bf:title': { '@id': `${id}#t` }, ...work },
  { '@id': `${id}#t`, '@type': 'bf:Title', 'bf:mainTitle': title },
] });

test('reads the direct properties, every value, and the bf:relation form', () => {
  const work = workNodeOf(record({
    'bf:translationOf': [{ '@id': W2 }, { '@id': W3 }],
    'bf:precededBy': { '@id': W3 },
    'bf:relation': [{ '@type': 'bf:Relation', 'bf:relationship': { '@id': LC_RELATIONSHIP + 'commentaryon' }, 'bf:associatedResource': { '@id': W2 } },
      { '@type': 'bf:Relation', 'bf:relationship': { '@id': LC_RELATIONSHIP + 'unknownterm' }, 'bf:associatedResource': { '@id': W3 } }],
  }));
  const r = readWorkRelations(work);
  assert.deepEqual(r.map((x) => `${x.term}>${x.targetUri?.slice(-2)}:${x.from}`).sort(),
    ['commentaryon>w2:relation', 'continuationof>w3:direct', 'translationof>w2:direct', 'translationof>w3:direct']);
});

test('withRelation writes bf:relation with LC\'s term, once; never to itself; input unchanged', () => {
  const doc = record();
  const before = JSON.stringify(doc);
  const once = withRelation(doc, 'translationof', W2);
  assert.equal(JSON.stringify(doc), before);
  const rel = workNodeOf(once)['bf:relation'][0];
  assert.equal(rel['@type'], 'bf:Relation');
  assert.equal(rel['bf:relationship']['@id'], 'http://id.loc.gov/vocabulary/relationship/translationof');
  assert.deepEqual(rel['bf:associatedResource'], { '@id': W2 });
  assert.equal(JSON.stringify(withRelation(once, 'translationof', W2)), JSON.stringify(once), 'not added twice');
  assert.equal(JSON.stringify(withRelation(doc, 'translationof', W1)), before, 'not to itself');
  assert.equal(JSON.stringify(withRelation(doc, 'madeupterm', W2)), before, 'only known terms');
  assert.equal(JSON.stringify(withRelation(doc, 'translationof', 'javascript:x')), before, 'only web addresses');
});

test('withoutRelation removes it in either form and leaves the rest', () => {
  const doc = withRelation(record({ 'bf:translationOf': [{ '@id': W2 }, { '@id': W3 }] }), 'translationof', W2);
  const out = workNodeOf(withoutRelation(doc, 'translationof', W2));
  assert.equal(out['bf:relation'], undefined);
  assert.deepEqual(out['bf:translationOf'], [{ '@id': W3 }]);
});

test('words in both languages, and the inverse for the other book', () => {
  assert.equal(relationWords('translationof', 'en'), 'Translation of');
  assert.equal(relationWords('translationof', 'en', true), 'Translated as');
  assert.equal(relationWords('commentaryon', 'ar'), 'شرح على');
  assert.equal(relationWords('commentaryon', 'ar', true), 'له شرح');
  assert.equal(relationWords('nope', 'en'), null);
});

test('the catalogue shows the link on both books', async () => {
  const { wolfMoonOpacService } = await import('../src/services/wolfMoonOpacService');
  const { relationsOf } = await import('../src/opac/linkedEntities');
  const parse = (id: string, document: any, title: string) => (wolfMoonOpacService as any).parseBibframeDocumentToOpacWork({ id, title, document });
  const translation = parse('r1', withRelation(record({}, W1, 'The Muqaddimah'), 'translationof', W2), 'The Muqaddimah');
  const original = parse('r2', record({}, W2, 'المقدمة'), 'المقدمة');
  assert.ok(translation && original);
  const fromTranslation = relationsOf(translation, [translation, original]);
  assert.equal(fromTranslation.outgoing[0].predicate, 'rel:translationof');
  assert.equal(fromTranslation.outgoing[0].workId, 'r2');
  const fromOriginal = relationsOf(original, [translation, original]);
  assert.equal(fromOriginal.incoming[0].work.id, 'r1');
  assert.equal(fromOriginal.incoming[0].relation.predicate, 'rel:translationof', 'the page shows it as "Translated as"');
});
