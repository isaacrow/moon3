// BIBFRAME in Arabic (bibframeArabic.tsx, plan step E1): every term has a label in Arabic script, reviews replace
// drafts, and the Turtle says honestly which labels are reviewed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BF_ARABIC, vocabulary, readReview, toTurtle, englishOf, uriOf } from '../supabase/functions/server/bibframeArabic.tsx';
import { BF_CLASSES, BF_OBJECT_PROPERTIES, BF_DATATYPE_PROPERTIES, BFLC_CLASSES, BFLC_OBJECT_PROPERTIES, BFLC_DATATYPE_PROPERTIES } from '../supabase/functions/server/bibframeTerms.generated.tsx';

test('every label is Arabic, and every term is in BIBFRAME 3.0.1 or BFLC', () => {
  for (const [term, ar] of Object.entries(BF_ARABIC)) {
    assert.match(ar, /[؀-ۿ]/, term);
    const local = term.replace(/^bf(?:lc)?:/, '');
    const known = term.startsWith('bflc:')
      ? BFLC_CLASSES.has(local) || BFLC_OBJECT_PROPERTIES.has(local) || BFLC_DATATYPE_PROPERTIES.has(local)
      : BF_CLASSES.has(local) || BF_OBJECT_PROPERTIES.has(local) || BF_DATATYPE_PROPERTIES.has(local);
    assert.ok(known, `${term} is a real term`);
  }
  assert.equal(BF_ARABIC['bf:Instance'], 'التجسيد', "the editor's own word");
  assert.equal(englishOf('bf:mainTitle'), 'Main title');
  assert.equal(englishOf('bf:ProvisionActivity'), 'Provision activity');
  assert.equal(uriOf('bflc:aap'), 'http://id.loc.gov/ontologies/bflc/aap');
});

test('a review replaces the draft; the most used terms come first, classes before properties', () => {
  const rows = vocabulary({ 'bf:Item': { ar: 'المادة', by: 'isaac', at: '2026-11-25' } }, { 'bf:title': 900, 'bf:note': 5 });
  const item = rows.find((r) => r.term === 'bf:Item')!;
  assert.equal(item.ar, 'المادة');
  assert.equal(item.draft, 'النسخة');
  assert.equal(item.status, 'reviewed');
  assert.equal(rows[0].kind, 'class');
  const props = rows.filter((r) => r.kind === 'property');
  assert.equal(props[0].term, 'bf:title');
  assert.ok('error' in readReview({ term: 'bf:nothing', ar: 'شيء' }));
  assert.ok('error' in readReview({ term: 'bf:title', ar: 'Title' }), 'must be Arabic');
  assert.deepEqual(readReview({ term: 'bf:title', ar: '  عنوان   المصدر ' }), { term: 'bf:title', ar: 'عنوان المصدر' });
});

test('the Turtle: reviewed labels as rdfs:label, drafts as skos:altLabel with a note, CC0', () => {
  const ttl = toTurtle(vocabulary({ 'bf:title': { ar: 'العنوان', by: 'x', at: 'y' } }));
  assert.match(ttl, /bf:title rdfs:label "العنوان"@ar \./);
  assert.match(ttl, /bf:Work skos:altLabel "العمل"@ar ;\n  skos:editorialNote "Draft Arabic label, not yet reviewed"@en \./);
  assert.match(ttl, /publicdomain\/zero\/1\.0/);
  assert.match(ttl, /1 reviewed by the library/);
});
