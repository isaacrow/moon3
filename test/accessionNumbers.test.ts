// Accession numbers (plan step H6): copies added from an order take accession numbers from the library's sequence,
// written as bf:identifiedBy bf:AccessionNumber; circulation, Lists and the editor read them back.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { receiptRows } from '../supabase/functions/server/acquisitions.tsx';
import { withCopies } from '../supabase/functions/server/copiesImport.tsx';
import { copiesIn } from '../supabase/functions/server/circulation.tsx';
import { ENTITIES } from '../supabase/functions/server/lists.tsx';
import { SEQUENCE_KINDS } from '../supabase/functions/server/sequences.tsx';
import { BF_CLASSES } from '../supabase/functions/server/bibframeTerms.generated.tsx';
import { copyToNode, nodeToCopy, hasCopyData, emptyCopy } from '../src/services/itemCopies';

const INSTANCE = 'https://mooon.site/resource/instance/r1';
const doc = () => ({ '@graph': [{ '@id': INSTANCE, '@type': 'bf:Instance' }] });
const input = { barcodes: ['B000001', 'B000002'], location: 'Stacks', shelfMark: 'PJ 1', referenceOnly: false, count: 2 };

test('accession numbers are a sequence kind and a BIBFRAME 3 class', () => {
  assert.ok((SEQUENCE_KINDS as readonly string[]).includes('accession'));
  assert.ok(BF_CLASSES.has('AccessionNumber'));
});

test('copies from an order carry the accession numbers taken for them', () => {
  const rows = receiptRows(input, { number: 'PO-1' }, 'Lib', 1, ['A0007', 'A0008']);
  assert.deepEqual(rows.map((r) => r.accession), ['A0007', 'A0008']);
  const none = receiptRows(input, { number: 'PO-1' }, 'Lib', 1);
  assert.deepEqual(none.map((r) => r.accession), ['', ''], 'no sequence, no accession number');
});

test('the bf:Item has the barcode and the accession number, and copiesIn reads both', () => {
  const rows = receiptRows(input, { number: 'PO-1' }, 'Lib', 1, ['A0007', 'A0008']);
  const out = withCopies(doc(), INSTANCE, rows as any, 'x');
  const item = out['@graph'].find((n: any) => n['@type'] === 'bf:Item');
  assert.deepEqual(item['bf:identifiedBy'], [
    { '@type': 'bf:Barcode', 'rdf:value': 'B000001' },
    { '@type': 'bf:AccessionNumber', 'rdf:value': 'A0007' },
  ]);
  const copies = copiesIn(out);
  assert.deepEqual(copies.map((c) => [c.barcode, c.accession]), [['B000001', 'A0007'], ['B000002', 'A0008']]);
  const noAcc = copiesIn(withCopies(doc(), INSTANCE, receiptRows(input, { number: 'PO-1' }, 'Lib', 1) as any, 'y'));
  assert.equal(noAcc[0].accession, '');
  assert.equal(noAcc[0].barcode, 'B000001');
});

test('the editor keeps the accession number when a copy is saved again', () => {
  const rows = receiptRows(input, { number: 'PO-1' }, 'Lib', 1, ['A0007', 'A0008']);
  const item = withCopies(doc(), INSTANCE, rows as any, 'x')['@graph'].find((n: any) => n['@type'] === 'bf:Item');
  const copy = nodeToCopy(item);
  assert.equal(copy.accession, 'A0007');
  assert.deepEqual(copyToNode(copy, INSTANCE)['bf:identifiedBy'], item['bf:identifiedBy']);
  const only = { ...emptyCopy(INSTANCE), accession: 'A9' };
  assert.ok(hasCopyData(only));
  assert.deepEqual(copyToNode(only, INSTANCE)['bf:identifiedBy'], [{ '@type': 'bf:AccessionNumber', 'rdf:value': 'A9' }]);
  assert.equal(copyToNode(emptyCopy(INSTANCE), INSTANCE)['bf:identifiedBy'], undefined);
  assert.equal('accession' in nodeToCopy(copyToNode(emptyCopy(INSTANCE), INSTANCE)), false, 'no empty key on copies without one');
});

test("Lists' copies can show and filter by accession number", () => {
  assert.ok(ENTITIES.copies.fields.some((f: any) => f.key === 'accession'));
});
