// The quality checker (quality.tsx, plan step D3): what it flags and why, and what it leaves alone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { linkFindings, recordFindings, entityFindings, report, nameLikeness } from '../supabase/functions/server/quality.tsx';

const LC = 'http://id.loc.gov/authorities/names/';

test('links: gone at the source, another name there, an unknown address; the same name in other words is fine', () => {
  const cache = new Map([
    [LC + 'n1', { uri: LC + 'n1', labels: ['Ibn Khaldūn, 1332-1406'] }],
    [LC + 'n2', { uri: LC + 'n2', labels: ['Smith, John, 1950-'] }],
    [LC + 'n3', { uri: LC + 'n3', labels: [], missing: true }],
    [LC + 'n4', { uri: LC + 'n4', labels: ['مطلوب، أحمد'] }],
  ]);
  const f = linkFindings([
    { id: 'a', kind: 'agent', label: 'Ibn Khaldun', variants: ['ابن خلدون'], sameAs: [LC + 'n1'] },
    { id: 'b', kind: 'agent', label: 'Matlub, Ahmad', sameAs: [LC + 'n2'] },
    { id: 'c', kind: 'agent', label: 'Jawahiri', sameAs: [LC + 'n3'] },
    { id: 'd', kind: 'agent', label: 'Someone', sameAs: ['http://example.com/x'] },
    { id: 'e', kind: 'agent', label: 'Matlub, Ahmad', sameAs: [LC + 'n4'] },
    { id: 'f', kind: 'agent', label: 'Merged', sameAs: [LC + 'n3'], mergedInto: 'c' },
  ], cache);
  assert.deepEqual(f.map((x) => [x.items[0].id, x.kind]), [['b', 'link-different'], ['c', 'link-gone'], ['d', 'link-malformed']],
    'a matches; e has only an Arabic name at LC, so nothing to compare; f is merged');
  assert.ok(nameLikeness('Ibn Khaldun', 'Ibn Khaldūn, 1332-1406') > 0.9);
});

test('records: the same ISBN or LCCN; the same title and first contributor; each group once', () => {
  const f = recordFindings([
    { id: 'r1', title: 'Muqaddimah', identifier_keys: ['isbn:9789954860717', 'lccn:2006331617'], title_key: 'muqaddimah', first_contributor: 'Ibn Khaldūn' },
    { id: 'r2', title: 'al-Muqaddimah', identifier_keys: ['isbn:9789954860717', 'lccn:2006331617'], title_key: 'muqaddimah', first_contributor: 'Ibn Khaldun' },
    { id: 'r3', title: 'Muqaddimah', identifier_keys: [], title_key: 'muqaddimah', first_contributor: 'Someone else' },
    { id: 'r4', title: 'Diwan', identifier_keys: [], title_key: 'diwan', first_contributor: 'Mutanabbi' },
    { id: 'r5', title: 'Diwan', identifier_keys: [], title_key: 'diwan', first_contributor: 'Mutanabbī' },
  ]);
  assert.deepEqual(f.map((x) => [x.kind, x.items.map((i) => i.id)]), [
    ['record-same-identifier', ['r1', 'r2']],
    ['record-same-title', ['r4', 'r5']],
  ], 'r1 and r2 once, by ISBN; r3 has another author');
});

test('entities: one kind, the same name folded, not merged', () => {
  const f = entityFindings([
    { id: 'a', kind: 'agent', label: 'Ibn Khaldūn' }, { id: 'b', kind: 'agent', label: 'ibn khaldun' },
    { id: 'c', kind: 'place', label: 'Ibn Khaldun' }, { id: 'd', kind: 'agent', label: 'Ibn Khaldun', mergedInto: 'a' },
  ]);
  assert.deepEqual(f.map((x) => x.items.map((i) => i.id)), [['a', 'b']]);
  const r = report([], [{ id: 'a', kind: 'agent', label: 'X' }, { id: 'b', kind: 'agent', label: 'x' }], new Map(), new Date('2026-11-26T00:00:00Z'));
  assert.equal(r.counts['entity-same-name'], 1);
  assert.equal(r.at, '2026-11-26T00:00:00.000Z');
});
