// Bulk change (bulkEdit.tsx, plan step H3): what may change, the plan the preview shows, and a copy changed in its
// record's document.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BULK_FIELDS, readBulk, planChanges, withCopyChange, bulkFieldOf } from '../supabase/functions/server/bulkEdit.tsx';
import { ENTITIES } from '../supabase/functions/server/lists.tsx';
import { copiesIn } from '../supabase/functions/server/circulation.tsx';

const NOW = new Date('2026-11-25T12:00:00Z');

test('every bulk field is a field of its kind of row, named in both languages', () => {
  for (const f of BULK_FIELDS) {
    assert.ok(ENTITIES[f.entity].fields.some((x) => x.key === f.key), `${f.entity}.${f.key}`);
    assert.ok(f.en && f.ar);
    assert.ok(f.entity === 'copies' || (f.table && f.column), 'a table field says where it is written');
  }
});

test('values are read strictly; dates may count from today', () => {
  assert.ok('error' in readBulk('loans', { field: 'barcode', value: 'x' }), 'not a bulk field');
  assert.ok('error' in readBulk('borrowers', { field: 'kind', value: 'king' }));
  assert.ok('error' in readBulk('borrowers', { field: 'blocked', value: 'maybe' }));
  assert.ok('error' in readBulk('loans', { field: 'due_at', value: 'next week' }));
  assert.ok('error' in readBulk('copies', { field: 'location', value: ' ' }));
  const due = readBulk('loans', { field: 'due_at', value: 'today+7' }, NOW);
  assert.ok('value' in due && due.value === '2026-12-02');
  const blocked = readBulk('borrowers', { field: 'blocked', value: true });
  assert.ok('value' in blocked && blocked.value === true);
});

test('the plan: changed rows with before and after, unchanged rows counted, rows it may not touch skipped', () => {
  const loans = [
    { id: 1, barcode: 'B1', record_title: 'A', due_at: '2026-11-20T15:30:00+00:00' },
    { id: 2, barcode: 'B2', record_title: 'B', due_at: '2026-12-02T09:00:00+00:00' },
    { id: 3, barcode: 'B3', record_title: 'C', due_at: '2026-11-01T09:00:00+00:00', returned_at: '2026-11-02T00:00:00Z' },
  ];
  const p = planChanges('loans', loans, bulkFieldOf('loans', 'due_at')!, '2026-12-02');
  assert.deepEqual(p.changes, [{ key: '1', label: 'B1 · A', before: '2026-11-20T15:30:00+00:00', after: '2026-12-02T15:30:00+00:00' }], 'the hour is kept');
  assert.equal(p.unchanged, 1);
  assert.deepEqual(p.skipped, [{ label: 'B3 · C', why: 'already returned' }]);

  const copies = [{ barcode: 'C1', record_id: 'r1', title: 'T', location: '' }, { barcode: 'C2', record_id: 'r1', title: 'T', location: 'Stacks' }];
  const pc = planChanges('copies', copies, bulkFieldOf('copies', 'location')!, 'Stacks');
  assert.deepEqual(pc.changes, [{ key: 'C1', recordId: 'r1', label: 'C1 · T', before: '', after: 'Stacks' }]);
  const holds = [{ id: 9, status: 'done', record_title: 'X' }];
  assert.equal(planChanges('holds', holds, bulkFieldOf('holds', 'expires_at')!, '2026-12-01').skipped[0].why, 'no longer waiting');
});

const doc = () => ({ '@graph': [
  { '@id': 'w', '@type': 'bf:Work' },
  { '@id': 'i', '@type': 'bf:Instance', 'bf:hasItem': [
    { '@id': 'it1', '@type': 'bf:Item', 'bf:identifiedBy': { '@type': 'bf:Barcode', 'rdf:value': 'C1' }, 'bf:sublocation': { 'rdfs:label': 'Old room' } },
    { '@id': 'it2', '@type': 'bf:Item', 'bf:identifiedBy': { '@type': 'bf:Barcode', 'rdf:value': 'C2' },
      'bf:usageAndAccessPolicy': [{ '@type': 'bf:UsePolicy', 'rdfs:label': 'Reference only — للاطلاع فقط' }, { '@type': 'bf:UsePolicy', 'rdfs:label': 'No photocopies' }] },
  ] },
] });

test('a copy is changed in its record the way the editor writes it, and only that copy', () => {
  const original = doc();
  const moved = withCopyChange(original, 'C1', 'location', 'Reading room');
  const c = copiesIn(moved);
  assert.equal(c.find((x) => x.barcode === 'C1')!.location, 'Reading room');
  assert.equal(copiesIn(original).find((x) => x.barcode === 'C1')!.location, 'Old room', 'the original is not touched');
  const lending = withCopyChange(original, 'C2', 'reference_only', false);
  assert.equal(copiesIn(lending).find((x) => x.barcode === 'C2')!.referenceOnly, false);
  assert.equal(lending['@graph'][1]['bf:hasItem'][1]['bf:usageAndAccessPolicy']['rdfs:label'], 'No photocopies', 'other policies stay');
  const back = withCopyChange(lending, 'C2', 'reference_only', true);
  assert.equal(copiesIn(back).find((x) => x.barcode === 'C2')!.referenceOnly, true);
  assert.equal(withCopyChange(original, 'NOPE', 'location', 'x'), null);
});
