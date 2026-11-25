// Slips and cards (plan step H9): the Code 128 table is well formed, a card number becomes the right symbols, and
// pick slips come in the order staff walk the stacks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PATTERNS, code128Values, code128Svg } from '../src/app/utils/code128';
import { pickSlips, shelfOrder } from '../supabase/functions/server/circulation.tsx';

test('Code 128: 107 unique symbols of 11 modules, each with an even number of bar modules; the stop has 13', () => {
  assert.equal(PATTERNS.length, 107);
  assert.equal(new Set(PATTERNS).size, 107);
  PATTERNS.forEach((p, i) => {
    const w = [...p].map(Number);
    assert.equal(w.reduce((a, b) => a + b, 0), i === 106 ? 13 : 11, `symbol ${i}`);
    assert.equal(w.filter((_, j) => j % 2 === 0).reduce((a, b) => a + b, 0) % 2, 0, `symbol ${i} bars`);
  });
});

test('a card number in set B: start, its characters, the mod-103 check, stop', () => {
  // "C001": C=35, 0=16, 0=16, 1=17; check = (104 + 35·1 + 16·2 + 16·3 + 17·4) % 103 = 287 % 103 = 81.
  assert.deepEqual(code128Values('C001'), [104, 35, 16, 16, 17, 81, 106]);
  assert.equal(code128Values('بطاقة'), null);
  const svg = code128Svg('C001')!;
  assert.match(svg, /^<svg /);
  assert.equal((svg.match(/<rect /g) || []).length, 3 * 6 + 4, 'three bars in each of the six symbols, four in the stop');
});

const doc = (copies: Array<[string, string, string, boolean?]>) => ({ '@graph': copies.map(([bc, loc, sm, ref]) => ({
  '@type': 'bf:Item', 'bf:identifiedBy': { '@type': 'bf:Barcode', 'rdf:value': bc }, 'bf:sublocation': { 'rdfs:label': loc }, 'bf:shelfMark': { 'rdfs:label': sm },
  ...(ref ? { 'bf:usageAndAccessPolicy': { 'rdfs:label': 'Reference only' } } : {}),
})) });

test('pick slips: a free copy for each waiting hold, oldest hold first, sorted by location then shelf mark', () => {
  assert.ok(shelfOrder('QA76.9', 'QA100') < 0, 'numbers by value');
  const docs = new Map([
    ['r1', { title: 'One', document: doc([['B1', 'Stacks', 'QA100'], ['B2', 'Stacks', 'QA100 c.2']]) }],
    ['r2', { title: 'Two', document: doc([['B3', 'Reading room', 'BP1'], ['B4', 'Stacks', 'QA76.9']]) }],
    ['r3', { title: 'Three', document: doc([['B5', 'Rare', 'X1', true]]) }],
  ]);
  const holds = [
    { id: 1, record_id: 'r1', placed_at: '2026-11-01', patron: { name: 'Ali', card: 'C1' } },
    { id: 2, record_id: 'r1', placed_at: '2026-11-02', patron: { name: 'Sara', card: 'C2' } },
    { id: 3, record_id: 'r2', placed_at: '2026-11-03', patron: { name: 'Huda', card: 'C3' } },
    { id: 4, record_id: 'r3', placed_at: '2026-11-04', patron: { name: 'Zaid', card: 'C4' } },
  ];
  const slips = pickSlips(holds, docs, new Set(['B1', 'B3']), 'Lib');
  // B1 and B3 are busy; hold 1 takes B2, so hold 2 waits; r3 has only a reference copy. Both are in the Stacks,
  // and QA76.9 comes before QA100 on the shelf.
  assert.deepEqual(slips.map((s) => [s.holdId, s.barcode, s.shelfMark]), [[3, 'B4', 'QA76.9'], [1, 'B2', 'QA100 c.2']]);
});
