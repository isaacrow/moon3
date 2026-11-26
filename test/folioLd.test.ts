// BIBFRAME to FOLIO (folioLd.tsx, plan step H11): one line per Instance, its whole subgraph, no Items, in the
// flattened, expanded JSON-LD FOLIO's mod-linked-data-import reads.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { folioInstanceLines, toJsonLines } from '../supabase/functions/server/folioLd.tsx';

const BF = 'http://id.loc.gov/ontologies/bibframe/';
const id = (x: string) => [{ '@id': x }];
const flat = [
  { '@id': 'w', '@type': [BF + 'Work', BF + 'Text'], [BF + 'title']: id('_:t'), [BF + 'hasInstance']: [...id('i1'), ...id('i2')], [BF + 'contribution']: id('_:c') },
  { '@id': '_:t', '@type': [BF + 'Title'], [BF + 'mainTitle']: [{ '@value': 'al-Muqaddimah' }] },
  { '@id': '_:c', '@type': [BF + 'Contribution'], [BF + 'agent']: id('http://id.loc.gov/rwo/agents/n50052785') },
  { '@id': 'i1', '@type': [BF + 'Instance', BF + 'Print'], [BF + 'instanceOf']: id('w'), [BF + 'hasItem']: id('it1'), [BF + 'provisionActivity']: id('_:p') },
  { '@id': '_:p', '@type': [BF + 'Publication'], [BF + 'date']: [{ '@value': '1984' }] },
  { '@id': 'i2', '@type': [BF + 'Instance', BF + 'Electronic'], [BF + 'instanceOf']: id('w') },
  { '@id': 'it1', '@type': [BF + 'Item'], [BF + 'itemOf']: id('i1') },
];

test('one line per Instance with its Work, titles and contributions; no Items, no other Instance', () => {
  const lines = folioInstanceLines(flat);
  assert.equal(lines.length, 2);
  const ids = (l: any[]) => l.map((n) => n['@id']).sort();
  assert.deepEqual(ids(lines[0]), ['_:c', '_:p', '_:t', 'i1', 'w'].sort());
  assert.deepEqual(ids(lines[1]), ['_:c', '_:t', 'i2', 'w'].sort());
  assert.ok(!(BF + 'hasItem' in lines[0][0]), 'the link to the Item is taken out');
  const work1 = lines[0].find((n) => n['@id'] === 'w');
  assert.deepEqual(work1[BF + 'hasInstance'], id('i1'), 'the Work points only at the Instance on its line');
  const text = toJsonLines(lines);
  assert.equal(text.trim().split('\n').length, 2);
  assert.ok(text.endsWith('\n'));
  assert.deepEqual(JSON.parse(text.split('\n')[0]), lines[0]);
});
