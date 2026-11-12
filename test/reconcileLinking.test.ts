// Linking entities to LC, VIAF and Wikidata: the search forms, the safer "sure" rules, and the server's work list.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isSubdivision, latinNameKey, placeQualifier, reconcileEntity, sameQualifier, scoreCandidate, searchForms, type ReconcileDeps } from '../src/services/reconcile';
import { applyNote, NO_MATCH_DAYS, parseNoteAction, queueOf, readNote } from '../supabase/functions/server/reconcileQueue.tsx';

test('latinNameKey: one form for a Latin name in either order, with or without dates', () => {
  assert.equal(latinNameKey('Farouk Mitha'), latinNameKey('Mitha, Farouk'));
  assert.equal(latinNameKey('Mitha, Farouk, 1960-'), 'farouk mitha');
  assert.equal(latinNameKey('Garnett, Lucy Mary Jane, 1849-1934'), 'lucy mary jane garnett');
  assert.equal(latinNameKey('Oxford, University of'), 'oxford university of', 'a body is not reordered');
  assert.equal(latinNameKey('محمود درويش'), '', 'Arabic is left to the Arabic name engine');
});

test('searchForms: the forms LC holds', () => {
  assert.deepEqual(searchForms({ id: '1', kind: 'agent', label: 'Farouk Mitha' }), ['Mitha, Farouk']);
  assert.deepEqual(searchForms({ id: '2', kind: 'agent', label: 'Borgo Pr' }), ['Borgo Press']);
  assert.deepEqual(searchForms({ id: '3', kind: 'agent', label: 'AMS Press' }), [], 'a press is not a person');
  assert.deepEqual(searchForms({ id: '4', kind: 'topic', label: 'Dystopias -- Fiction' }), ['Dystopias--Fiction', 'Dystopias']);
  assert.deepEqual(searchForms({ id: '5', kind: 'place', label: 'New York, NY' }), ['New York']);
  assert.deepEqual(searchForms({ id: '6', kind: 'agent', label: 'Mitha, Farouk' }), [], 'already in LC order');
});

test('subdivisions and other qualifiers are never one-click matches', () => {
  assert.ok(isSubdivision('http://id.loc.gov/authorities/subjects/sh99001187'));
  assert.ok(!isSubdivision('http://id.loc.gov/authorities/subjects/sh85040350'));
  assert.equal(placeQualifier('New York, NY'), 'ny');
  assert.equal(placeQualifier('New York (N.Y.)'), 'ny');
  assert.equal(placeQualifier('New York (State)'), 'state');
  assert.ok(sameQualifier('New York, NY', 'New York (N.Y.)'));
  assert.ok(!sameQualifier('New York, NY', 'New York (State)'));
  assert.ok(sameQualifier('Cairo', 'Cairo (Egypt)'), 'no qualifier on one side: no objection');

  const sub = scoreCandidate({ id: 't', kind: 'topic', label: 'History and criticism' },
    { uri: 'http://id.loc.gov/authorities/subjects/sh99001187', label: 'History and criticism', source: 'LOC' } as any, null)!;
  assert.ok(sub.reasons.includes('a subdivision, not a heading'));
  const state = scoreCandidate({ id: 'p', kind: 'place', label: 'New York, NY' },
    { uri: 'http://id.loc.gov/authorities/names/n79007751', label: 'New York (State)', source: 'LOC' } as any, null)!;
  assert.ok(state.reasons.includes('another qualifier'));
});

const lc = (results: Record<string, Array<{ uri: string; label: string }>>): ReconcileDeps => ({
  searchLc: async (q) => (results[q] || []).map((r) => ({ ...r, source: 'LOC' } as any)),
  searchWikidata: async () => [],
  romanize: async (q) => q,
  details: async () => null,
});

test('reconcileEntity: "Farouk Mitha" is found as LC\'s "Mitha, Farouk"', async () => {
  const r = await reconcileEntity({ id: 'a', kind: 'agent', label: 'Farouk Mitha' },
    lc({ 'Mitha, Farouk': [{ uri: 'http://id.loc.gov/authorities/names/no2002028290', label: 'Mitha, Farouk' }] }));
  assert.equal(r.candidates[0]?.label, 'Mitha, Farouk');
  assert.equal(r.candidates[0]?.score, 1);
  assert.equal(r.sure, null, 'a person with no dates on either side waits for a cataloguer');
});

test('reconcileEntity: a subdivision and a place of another kind are offered, never sure', async () => {
  const sub = await reconcileEntity({ id: 't', kind: 'topic', label: 'History and criticism' },
    lc({ 'History and criticism': [{ uri: 'http://id.loc.gov/authorities/subjects/sh99001187', label: 'History and criticism' }] }));
  assert.equal(sub.sure, null);
  assert.equal(sub.candidates.length, 1);
  const ny = await reconcileEntity({ id: 'p', kind: 'place', label: 'New York, NY' },
    lc({ 'New York': [{ uri: 'http://id.loc.gov/authorities/names/n79007751', label: 'New York (State)' }] }));
  assert.equal(ny.sure, null);
  const city = await reconcileEntity({ id: 'p2', kind: 'place', label: 'New York, NY' },
    lc({ 'New York': [{ uri: 'http://id.loc.gov/authorities/names/n79007751', label: 'New York (N.Y.)' }] }));
  assert.equal(city.sure?.label, 'New York (N.Y.)', 'the same qualifier is still a one-click match');
});

const ent = (id: string, kind: string, label: string, sameAs: string[] = [], mergedInto: string | null = null) => ({ id, kind, label, sameAs, mergedInto });

test('queueOf: every entity, unlinked and never searched first, merged and other kinds left out', () => {
  const now = new Date('2026-11-12T00:00:00Z');
  const notes = new Map<string, unknown>([
    ['b', { rejected: [], checkedAt: '2026-11-01T00:00:00Z' }],
    ['c', { rejected: [], noMatch: { by: 'isaac', at: '2026-11-01T00:00:00Z' } }],
    ['d', { rejected: [], noMatch: { by: 'isaac', at: '2026-01-01T00:00:00Z' } }],
  ]);
  const rows = queueOf([
    ent('a', 'agent', 'Zed'), ent('b', 'agent', 'Alpha'), ent('c', 'agent', 'Recently no match'), ent('d', 'agent', 'Old no match'),
    ent('e', 'agent', 'Linked', ['http://id.loc.gov/x']), ent('f', 'agent', 'Merged', [], 'a'), ent('g', 'hub', 'A hub'),
  ], notes, now);
  // Never searched (d: an old "no match" is back, a), by name; then searched before (b); then linked (e).
  assert.deepEqual(rows.map((r) => r.id), ['d', 'a', 'b', 'e']);
  assert.ok(!rows.some((r) => r.id === 'c'), `a "no match" from less than ${NO_MATCH_DAYS} days ago is left out`);
  assert.ok(rows.some((r) => r.id === 'd'), 'an old "no match" comes back');
  assert.ok(!rows.some((r) => r.id === 'f' || r.id === 'g'), 'merged entries and hubs are left out');
  assert.equal(queueOf(Array.from({ length: 900 }, (_, i) => ent(`x${i}`, 'topic', `T${i}`)), new Map(), now).length, 900, 'no limit of 100');
});

test('notes: a rejected candidate, "no match", a search, and clearing', () => {
  const now = new Date('2026-11-12T10:00:00Z');
  let n = applyNote(null, { reject: 'http://id.loc.gov/a' }, 'isaac', now);
  n = applyNote(n, { reject: 'http://id.loc.gov/a' }, 'isaac', now);
  n = applyNote(n, { reject: 'https://www.wikidata.org/entity/Q1' }, 'isaac', now);
  assert.deepEqual(n.rejected, ['https://www.wikidata.org/entity/Q1', 'http://id.loc.gov/a'], 'each once, latest first');
  n = applyNote(n, { noMatch: true }, 'isaac', now);
  assert.equal(n.noMatch?.by, 'isaac');
  assert.equal(n.checkedAt, now.toISOString());
  assert.deepEqual(applyNote(n, { clear: true }, 'isaac', now), { rejected: [] });
  assert.deepEqual(readNote('garbage'), { rejected: [] });
  assert.deepEqual(readNote({ rejected: [1, 'http://x', null] }), { rejected: ['http://x'] });
});

test('parseNoteAction accepts only the four decisions', () => {
  assert.deepEqual(parseNoteAction({ reject: ' http://id.loc.gov/a ' }), { reject: 'http://id.loc.gov/a' });
  assert.equal(parseNoteAction({ reject: 'javascript:alert(1)' }), null);
  assert.equal(parseNoteAction({ reject: 'http://' + 'x'.repeat(400) }), null);
  assert.deepEqual(parseNoteAction({ noMatch: true }), { noMatch: true });
  assert.deepEqual(parseNoteAction({ checked: true }), { checked: true });
  assert.deepEqual(parseNoteAction({ clear: true }), { clear: true });
  assert.equal(parseNoteAction({ noMatch: 'yes' }), null);
  assert.equal(parseNoteAction(null), null);
});
