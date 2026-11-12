// Draft summaries: which records need one, what Claude is given (the record's facts only), the language, records too
// thin to summarize honestly, and an approved summary written so the catalogue shows it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DRAFT_SYSTEM, draftInput, hasSummary, MAX_SUMMARY, parseApproval, withSummary } from '../supabase/functions/server/summaryDrafts.tsx';

const W = 'https://mooon.site/resource/work/w1';
const I = 'https://mooon.site/resource/instance/i1';
const record = (work: Record<string, unknown> = {}, instance: Record<string, unknown> = {}, title = 'The Heart of Islam') => ({ id: 'r1', title, document: { '@graph': [
  { '@id': W, '@type': 'bf:Work', 'bf:title': { 'bf:mainTitle': title }, 'bf:hasInstance': { '@id': I }, ...work },
  { '@id': I, '@type': 'bf:Instance', 'bf:instanceOf': { '@id': W }, ...instance },
] } });

test('hasSummary sees a summary in any of the forms the records use', () => {
  assert.equal(hasSummary(record().document), false);
  assert.equal(hasSummary(record({ 'bf:summary': { '@type': 'bf:Summary', 'rdfs:label': 'A book about…' } }).document), true);
  assert.equal(hasSummary(record({ 'bf:summary': ['نص الملخص'] }).document), true);
  assert.equal(hasSummary(record({ 'bf:summary': { '@type': 'bf:Summary', 'rdfs:label': '' } }).document), false, 'an empty one does not count');
});

test('draftInput gives the record\'s facts, the language, and whether they are enough', () => {
  const rich = draftInput(record({
    'bf:subject': [{ 'rdfs:label': 'Islam' }, { 'rdfs:label': 'Sufism' }],
    'bf:genreForm': [{ '@type': 'bf:GenreForm', 'rdfs:label': 'Religion' }, { '@id': 'http://id.loc.gov/x' }],
    'bf:tableOfContents': { 'rdfs:label': 'God; The Prophet; Law' },
  }, { 'bf:seriesStatement': 'Islamic studies ; 4' }));
  assert.match(rich.facts, /^Title: The Heart of Islam/);
  assert.match(rich.facts, /Subjects: Islam; Sufism/);
  assert.match(rich.facts, /Genre or form: Religion$/m, 'a genre with no label is left out');
  assert.match(rich.facts, /Contents: God; The Prophet; Law/);
  assert.match(rich.facts, /Series: Islamic studies ; 4/);
  assert.equal(rich.language, 'en');
  assert.equal(rich.enoughFacts, true);

  const thin = draftInput(record({}, {}, 'Untitled notes'));
  assert.equal(thin.enoughFacts, false, 'a title alone is not enough to say what a book is about');
  assert.equal(draftInput(record({ 'bf:subject': { 'rdfs:label': 'التصوف' } }, {}, 'كتاب التعرف')).language, 'ar');
});

test('the instructions forbid outside facts', () => {
  assert.match(DRAFT_SYSTEM, /ONLY the facts given/);
  assert.match(DRAFT_SYSTEM, /enoughFacts to false/);
});

test('parseApproval cleans the text and refuses empty or long ones', () => {
  assert.deepEqual(parseApproval({ summary: '  A study   of the   heart of Islam.  ', language: 'en' }), { summary: 'A study of the heart of Islam.', language: 'en' });
  assert.equal(parseApproval({ summary: 'short' }), null);
  assert.equal(parseApproval({ summary: 'x'.repeat(MAX_SUMMARY + 1) }), null);
  assert.equal(parseApproval(null), null);
  assert.equal(parseApproval({ summary: 'نص عربي طويل بما يكفي ليكون ملخصاً.', language: 'xx' })?.language, 'en');
});

test('withSummary writes it as the records do, and the catalogue shows it', async () => {
  const doc = record({ 'bf:subject': { 'rdfs:label': 'Islam' } }).document;
  const before = JSON.stringify(doc);
  const out = withSummary(doc, 'A study of the central teachings of Islam.');
  assert.equal(JSON.stringify(doc), before, 'the input is not changed');
  const work = out['@graph'][0];
  assert.deepEqual(work['bf:summary'], { '@type': 'bf:Summary', 'rdfs:label': 'A study of the central teachings of Islam.' });
  assert.equal(hasSummary(out), true);
  const { wolfMoonOpacService } = await import('../src/services/wolfMoonOpacService');
  const shown = (wolfMoonOpacService as any).parseBibframeDocumentToOpacWork({ id: 'r1', title: 'The Heart of Islam', document: out });
  assert.equal(shown.summaryArabic, 'A study of the central teachings of Islam.');
});
