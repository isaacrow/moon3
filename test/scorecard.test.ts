// The public scorecard: what it counts from the published records and the entities, and how far each row is from its target.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { progress, scorecard } from '../supabase/functions/server/scorecard.tsx';

const W = (n: number) => `https://mooon.site/resource/work/w${n}`;
const I = (n: number) => `https://mooon.site/resource/instance/i${n}`;
const rec = (n: number, work: Record<string, unknown> = {}, extra: any[] = []) => ({ id: `r${n}`, document: { '@graph': [
  { '@id': W(n), '@type': 'bf:Work', ...work },
  { '@id': I(n), '@type': 'bf:Instance', 'bf:instanceOf': { '@id': W(n) } },
  ...extra,
] } });

test('counts summaries, classification, genre, copies and links between works', () => {
  const rows = scorecard([
    rec(1, { 'bf:summary': { '@type': 'bf:Summary', 'rdfs:label': 'A history of Babylon.' }, 'bf:classification': { 'bf:classificationPortion': 'DS71' }, 'bf:genreForm': { 'rdfs:label': 'History' } },
      [{ '@id': 'https://mooon.site/resource/item/i1-a', '@type': 'bf:Item', 'bf:itemOf': { '@id': I(1) }, 'bf:heldBy': { 'rdfs:label': 'Main' } }]),
    rec(2, { 'bf:summary': { '@type': 'bf:Summary', 'rdfs:label': '' },
      'bf:relation': { '@type': 'bf:Relation', 'bf:relationship': { '@id': 'http://id.loc.gov/vocabulary/relationship/translationof' }, 'bf:associatedResource': { '@id': W(1) } } }),
    rec(3, { 'bf:translationOf': { '@id': W(1) } }),
  ], []);
  const by = Object.fromEntries(rows.map((r) => [r.key, r]));
  assert.deepEqual([by.summary.value, by.summary.total], [1, 3], 'an empty summary does not count');
  assert.equal(by.classification.value, 1);
  assert.equal(by.genre.value, 1);
  assert.deepEqual([by.copies.value, by.copies.total], [1, 3]);
  assert.equal(by.workLinks.value, 2, 'both forms of a link count');
  assert.equal(by.workLinks.goal, null);
});

test('counts entities linked outside, people in both scripts and with dates; merged ones are left out', () => {
  const rows = scorecard([], [
    { kind: 'agent', label: 'نجيب محفوظ', variants: ['Maḥfūẓ, Najīb'], sameAs: ['http://id.loc.gov/authorities/names/n1'], data: { agentType: 'Person', birthDate: '1911' } },
    { kind: 'agent', label: 'Ali Abunimah', variants: [], sameAs: [], data: { agentType: 'Person' } },
    { kind: 'agent', label: 'Penguin Books', sameAs: [], data: { agentType: 'Organization' } },
    { kind: 'topic', label: 'Sufism', sameAs: ['http://id.loc.gov/authorities/subjects/sh1'] },
    { kind: 'agent', label: 'Old copy', sameAs: [], mergedInto: 'x', data: { agentType: 'Person' } },
    { kind: 'hub', label: 'A hub', sameAs: [] },
  ]);
  const by = Object.fromEntries(rows.map((r) => [r.key, r]));
  assert.deepEqual([by.entitiesLinked.value, by.entitiesLinked.total], [2, 4]);
  assert.deepEqual([by.bothScripts.value, by.bothScripts.total], [1, 2], 'organisations are not people');
  assert.deepEqual([by.dates.value, by.dates.total], [1, 2]);
});

test('progress: share of the target reached, capped at 1', () => {
  assert.equal(progress({ key: 'a', en: '', ar: '', value: 40, total: 100, goal: 0.8 }), 0.5);
  assert.equal(progress({ key: 'a', en: '', ar: '', value: 90, total: 100, goal: 0.8 }), 1);
  assert.equal(progress({ key: 'a', en: '', ar: '', value: 0, total: 0, goal: 1 }), 1, 'nothing to count is not a failure');
  assert.equal(progress({ key: 'a', en: '', ar: '', value: 0, total: 5, goal: null }), 0);
  assert.equal(progress({ key: 'a', en: '', ar: '', value: 3, total: 5, goal: null }), 1);
});

test('the entity file writes the type in lower case ("person", "organization"): people are still counted', () => {
  const rows = scorecard([], [
    { kind: 'agent', label: 'نجيب محفوظ', variants: ['Mahfouz, Naguib'], data: { agentType: 'person', birthDate: '1911' } },
    { kind: 'agent', label: 'Penguin Books', data: { agentType: 'organization' } },
  ]);
  const by = Object.fromEntries(rows.map((r) => [r.key, r]));
  assert.deepEqual([by.bothScripts.value, by.bothScripts.total, by.dates.value], [1, 1, 1]);
});
