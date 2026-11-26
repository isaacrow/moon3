// Local call numbers (plan step H6): a library's running call numbers ("MS 0001") come from a sequence; copies
// without one take the next, one per edition, and a call number already there is never replaced.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SEQUENCE_KINDS, readSequence, formatNumber, editionCallNumber, callNumbersWanted, giveCallNumbers } from '../supabase/functions/server/sequences.tsx';
import { receiptRows } from '../supabase/functions/server/acquisitions.tsx';
import { withCopies } from '../supabase/functions/server/copiesImport.tsx';
import { nodeToCopy } from '../src/services/itemCopies';

const I1 = 'https://mooon.site/resource/instance/r1';
const I2 = 'https://mooon.site/resource/instance/r2';
const item = (instance: string, shelfMark?: string) => ({
  '@id': `${instance}-item-${Math.random()}`, '@type': 'bf:Item', 'bf:itemOf': { '@id': instance },
  ...(shelfMark ? { 'bf:shelfMark': { '@type': 'bf:ShelfMark', 'rdfs:label': shelfMark } } : {}),
});
const doc = (...items: any[]) => ({ '@graph': [{ '@id': I1, '@type': 'bf:Instance' }, { '@id': I2, '@type': 'bf:Instance' }, ...items] });

test('call numbers are a sequence kind; the prefix may hold a space and Arabic letters', () => {
  assert.ok((SEQUENCE_KINDS as readonly string[]).includes('callno'));
  const ms = readSequence('callno', { prefix: 'MS ', next: 1, width: 4, forNewCopies: true });
  assert.deepEqual(ms, { sequence: { kind: 'callno', prefix: 'MS ', next: 1, width: 4, forNewCopies: true } });
  assert.equal(formatNumber('MS ', 1, 4), 'MS 0001');
  assert.deepEqual(readSequence('callno', { prefix: 'مخ ', next: 12 }), { sequence: { kind: 'callno', prefix: 'مخ ', next: 12, width: 0, forNewCopies: false } });
  assert.equal((readSequence('callno', { prefix: 'MS   A', next: 1 }) as any).sequence.prefix, 'MS A', 'spaces folded');
  assert.ok('error' in readSequence('callno', { prefix: '-MS', next: 1 }), 'starts with a letter or digit');
  assert.ok('error' in readSequence('callno', { prefix: 'MS<1>', next: 1 }));
  assert.ok('error' in readSequence('callno', { prefix: 'ABCDEFGHIJKLM', next: 1 }), 'at most 12');
  // The other kinds are scanned and typed at the desk: still no spaces, and no forNewCopies flag.
  assert.ok('error' in readSequence('barcode', { prefix: 'B 1', next: 1 }));
  assert.equal('forNewCopies' in (readSequence('accession', { prefix: 'A', next: 1, forNewCopies: true }) as any).sequence, false);
});

test("an edition's call number is the one its copies share", () => {
  assert.equal(editionCallNumber(doc(item(I1, 'MS 0004'), item(I1, 'MS 0004'), item(I2, 'MS 0009')), I1), 'MS 0004');
  assert.equal(editionCallNumber(doc(item(I1, 'MS 0004'), item(I1)), I1), 'MS 0004', 'copies without one do not count');
  assert.equal(editionCallNumber(doc(item(I1, 'MS 0004'), item(I1, 'MS 0005')), I1), '', 'two different ones: none');
  assert.equal(editionCallNumber(doc(item(I2, 'MS 0009')), I1), '');
});

test('new copies without a call number take one per edition; typed ones and shared ones stay', () => {
  const groups = [
    { instance: I1, rows: [{ shelfMark: '' }, { shelfMark: '' }] },
    { instance: I2, rows: [{ shelfMark: 'PJ 7755' }, { shelfMark: ' ' }] },
  ];
  const d = doc();
  assert.equal(callNumbersWanted(d, groups), 2);
  assert.equal(giveCallNumbers(d, groups, ['MS 0001', 'MS 0002']), 2);
  assert.deepEqual(groups.map((g) => g.rows.map((r) => r.shelfMark)), [['MS 0001', 'MS 0001'], ['PJ 7755', 'MS 0002']]);

  // The edition already has copies on one shelf place: the new copy goes there, no number is taken.
  const withShelf = doc(item(I1, 'MS 0040'));
  const more = [{ instance: I1, rows: [{ shelfMark: '' }] }];
  assert.equal(callNumbersWanted(withShelf, more), 0);
  assert.equal(giveCallNumbers(withShelf, more, []), 0);
  assert.equal(more[0].rows[0].shelfMark, 'MS 0040');

  // Every copy has one: nothing wanted, nothing changed.
  const typed = [{ instance: I1, rows: [{ shelfMark: '892.7 MAH' }] }];
  assert.equal(callNumbersWanted(doc(), typed), 0);
  assert.equal(giveCallNumbers(doc(), typed, ['MS 0001']), 0);
  assert.equal(typed[0].rows[0].shelfMark, '892.7 MAH');

  // Fewer numbers than editions (the sequence was turned off meanwhile): the rest stay without.
  const short = [{ instance: I1, rows: [{ shelfMark: '' }] }, { instance: I2, rows: [{ shelfMark: '' }] }];
  assert.equal(giveCallNumbers(doc(), short, ['MS 0001']), 1);
  assert.deepEqual(short.map((g) => g.rows[0].shelfMark), ['MS 0001', '']);
});

test('copies from an order get the call number as bf:shelfMark, and the editor reads it back', () => {
  const input = { barcodes: ['B1', 'B2'], location: 'Manuscripts room', shelfMark: '', referenceOnly: true, count: 2 };
  const rows = receiptRows(input, { number: 'PO-3' }, 'Lib', 1);
  const d = doc();
  giveCallNumbers(d, [{ instance: I1, rows }], ['MS 0007']);
  const out = withCopies(d, I1, rows as any, 'x');
  const items = out['@graph'].filter((n: any) => n['@type'] === 'bf:Item');
  assert.deepEqual(items.map((n: any) => n['bf:shelfMark']), [
    { '@type': 'bf:ShelfMark', 'rdfs:label': 'MS 0007' }, { '@type': 'bf:ShelfMark', 'rdfs:label': 'MS 0007' },
  ]);
  assert.equal(nodeToCopy(items[0]).shelfMark, 'MS 0007');
});
