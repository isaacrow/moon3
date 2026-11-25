// Number sequences (sequences.tsx, plan step H6): numbers as the sequence writes them, sequences checked.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatNumber, readSequence } from '../supabase/functions/server/sequences.tsx';

test('a number is the prefix and the number padded to the width', () => {
  assert.equal(formatNumber('B', 123, 6), 'B000123');
  assert.equal(formatNumber('', 1234567, 3), '1234567', 'never cut');
  assert.equal(formatNumber('CARD-', 7, 0), 'CARD-7');
});

test('sequences are checked so their numbers stay valid barcodes and cards', () => {
  assert.deepEqual(readSequence('barcode', { prefix: 'B', next: 100, width: 6 }), { sequence: { kind: 'barcode', prefix: 'B', next: 100, width: 6 } });
  assert.ok('error' in readSequence('accession', { next: 1 }));
  assert.ok('error' in readSequence('card', { prefix: 'C D', next: 1 }), 'no spaces');
  assert.ok('error' in readSequence('card', { prefix: 'C', next: 0 }));
  assert.ok('error' in readSequence('card', { prefix: 'C', next: 1, width: 13 }));
  assert.ok('error' in readSequence('card', { prefix: 'X'.repeat(12), next: 1e12, width: 12 }) === false, 'still under 40 characters');
});
