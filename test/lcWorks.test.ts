// Suggested links to LC Works and Hubs (lcWorks.tsx, plan step A3), on LC's real suggest answers kept in
// test/fixtures/lc-works: contributors weigh more than titles, the same LCCN settles it, a translation Hub ranks
// below the original, rejected candidates are not offered again, and an accepted link lands on the Work.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { workFacts, parseHits, scoreCandidate, rank, searchesFor, withLcLink, alike } from '../supabase/functions/server/lcWorks.tsx';

const fixture = (f: string) => JSON.parse(readFileSync(`test/fixtures/lc-works/${f}`, 'utf8'));
const doc = (title: string, who: string[], extra: any = {}) => ({ '@graph': [
  { '@id': 'https://mooon.site/resource/work/x', '@type': ['bf:Work', 'bf:Text'], 'bf:title': { '@type': 'bf:Title', 'bf:mainTitle': title },
    'bf:language': { '@id': 'http://id.loc.gov/vocabulary/languages/ara' },
    'bf:contribution': who.map((n) => ({ '@type': 'bf:Contribution', 'bf:agent': { '@type': 'bf:Person', 'rdfs:label': n } })), ...extra },
  { '@id': 'https://mooon.site/resource/instance/x', '@type': ['bf:Instance', 'bf:Print'], 'bf:instanceOf': { '@id': 'https://mooon.site/resource/work/x' },
    'bf:provisionActivity': { '@type': 'bf:Publication', 'bf:date': '1984' } },
] });

test('what Moon reads from its own record', () => {
  const f = workFacts(doc('al-Muqaddimah', ['Ibn Khaldūn, 1332-1406', 'ابن خلدون'], { 'bf:expressionOf': { '@id': 'http://id.loc.gov/resources/hubs/abc' } }));
  assert.deepEqual(f.titles, ['al-Muqaddimah']);
  assert.deepEqual(f.contributors, ['Ibn Khaldūn, 1332-1406', 'ابن خلدون']);
  assert.equal(f.language, 'ara');
  assert.equal(f.year, 1984);
  assert.deepEqual(f.linked, ['http://id.loc.gov/resources/hubs/abc']);
  assert.deepEqual(searchesFor(f), ['ibn khaldun muqaddimah', 'muqaddimah']);
});

test("LC's answer read: titles after the contributor's name, Arabic-script variants split off", () => {
  const hubs = parseHits(fixture('hubs-muqaddimah.json'), 'hub');
  assert.ok(hubs.length >= 3);
  const main = hubs.find((h) => /Muqaddimah$/.test(h.label))!;
  assert.ok(main.titles.some((t) => /^Kitāb al-ʻibar\. Muqaddimah$/.test(t)), main.titles.join(' | '));
  assert.ok(main.contributors.some((c) => c.startsWith('Ibn Khaldūn')));
});

test('the original Hub first, its translations below; contributors weigh more than titles', () => {
  const f = workFacts(doc('al-Muqaddimah', ['Ibn Khaldūn, 1332-1406']));
  const ranked = rank(f, parseHits(fixture('hubs-muqaddimah.json'), 'hub'));
  assert.match(ranked[0].label, /Kitāb al-ʻibar\. Muqaddimah$/);
  const english = ranked.find((c) => /Muqaddimah\. English$/.test(c.label));
  if (english) assert.ok(english.score < ranked[0].score && english.reasons.includes('other language'));

  const k = workFacts(doc('The tragedy of Karbala', ['Naquvi, Syed-Mohsin']));
  const works = rank(k, [...parseHits(fixture('works-karbala.json'), 'work'), ...parseHits(fixture('works-karbala-title.json'), 'work')]);
  assert.match(works[0].label, /^Naquvi, Syed-Mohsin\. The tragedy of Karbala/);
  const other = works.find((c) => !/Naquvi/.test(c.label) && /tragedy of Karbala/i.test(c.label));
  if (other) assert.ok(other.score < 0.6 && other.reasons.includes('other contributor'), 'the same title by another author is far below');
});

test('the same LCCN settles it; rejected and already linked candidates are left out', () => {
  const f = { titles: ['x'], contributors: [], lccns: ['57000086'], linked: [] };
  const c = { uri: 'http://id.loc.gov/resources/works/1', kind: 'work' as const, label: 'Something else', titles: ['y'], contributors: [], languages: [], dates: [], identifiers: ['57000086'] };
  assert.equal(scoreCandidate(f, c).score, 0.99);
  assert.deepEqual(rank(f, [c], [c.uri]), []);
  assert.ok(alike('Tārīkh Baghdād', 'tarikh baghdad') > 0.95, 'accents and case aside');
  assert.ok(alike('al-Muqaddimah', 'Muqaddimah') > 0.95, 'the article aside');
});

test('an accepted link lands on the Work: a Hub as bf:expressionOf, an LC Work as owl:sameAs, once', () => {
  const d = doc('al-Muqaddimah', ['Ibn Khaldūn']);
  const hub = 'http://id.loc.gov/resources/hubs/59025bb6-5f04-2e46-a99d-f043a7f44d80';
  const withHub = withLcLink(d, hub, 'hub');
  assert.deepEqual(withHub['@graph'][0]['bf:expressionOf'], { '@id': hub });
  assert.equal(d['@graph'][0]['bf:expressionOf'], undefined, 'the original is not touched');
  const twice = withLcLink(withHub, hub, 'hub');
  assert.deepEqual(twice['@graph'][0]['bf:expressionOf'], { '@id': hub });
  const both = withLcLink(withHub, 'http://id.loc.gov/resources/works/123', 'work');
  assert.deepEqual(both['@graph'][0]['owl:sameAs'], { '@id': 'http://id.loc.gov/resources/works/123' });
  assert.deepEqual(workFacts(both).linked.sort(), [hub, 'http://id.loc.gov/resources/works/123'].sort());
  assert.equal(withLcLink({ '@graph': [{ '@type': 'bf:Instance' }] }, hub, 'hub'), null);
});
