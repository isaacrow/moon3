// The catalogue's search finds a book through any name of its people and subjects (their Moon entities' names),
// in either script, once names.json is loaded; without it, the search is as before.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { entityNamesOf, matchWork, setEntityNames, type SearchableWork } from '../src/opac/searchIndex.ts';

const AGENT = 'https://mooon.site/resource/agent/agent-9aed7739';
const TOPIC = 'https://mooon.site/resource/topic/sufism-1';
const palaceWalk: SearchableWork = {
  title: 'Palace Walk',
  primaryCreator: { name: 'نجيب محفوظ', nameArabic: 'نجيب محفوظ', authorityLinks: [AGENT, 'http://id.loc.gov/authorities/names/n82091918'] },
  subjects: [{ label: 'Sufism', uri: TOPIC }],
};

test('without the entity names, a Latin search does not find an Arabic-only author', () => {
  setEntityNames({});
  assert.equal(matchWork(palaceWalk, 'Mahfuz'), null);
  assert.equal(matchWork(palaceWalk, 'التصوف'), null);
});

test('with them, the book is found by any of its author\'s and subjects\' names, in either script', () => {
  setEntityNames({ [AGENT]: ['نجيب محفوظ', 'Maḥfūẓ, Najīb, 1911-2006', 'Mahfouz, Naguib'], [TOPIC]: ['Sufism', 'التصوف'] });
  assert.ok(matchWork(palaceWalk, 'Mahfuz'), 'accents need not be typed');
  assert.ok(matchWork(palaceWalk, 'naguib mahfouz'), 'any order');
  assert.equal(matchWork(palaceWalk, 'Mahfouz')!.score, 70, 'ranked as an author match');
  assert.ok(matchWork(palaceWalk, 'التصوف'), 'a subject in the other script');
  assert.ok(matchWork(palaceWalk, 'palace walk'), 'the title still matches');
  assert.equal(matchWork(palaceWalk, 'Dostoevsky'), null);
});

test('loading new names makes the search fields again (no stale cache)', () => {
  setEntityNames({});
  assert.equal(matchWork(palaceWalk, 'Mahfouz'), null);
  setEntityNames(new Map([[AGENT, ['نجيب محفوظ', 'Mahfouz, Naguib']]]));
  assert.ok(matchWork(palaceWalk, 'Mahfouz'));
});

test('entityNamesOf: each address once, unknown addresses give nothing', () => {
  setEntityNames({ [AGENT]: ['a', 'b'] });
  assert.deepEqual(entityNamesOf([AGENT, AGENT, undefined, 'https://mooon.site/resource/agent/none']), ['a', 'b']);
});
