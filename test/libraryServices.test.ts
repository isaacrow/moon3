// What the catalogue shows from the library's own systems: the loan status of a result, and matching e-resources.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loanLine, matchResources, type EResource } from '../src/opac/libraryServices';

test('a result says whether its copies can be borrowed', () => {
  assert.equal(loanLine(2, [], false, 'en'), null, 'the library does not lend from Moon: keep the old line');
  assert.equal(loanLine(0, [], true, 'en'), null, 'no copies');
  assert.deepEqual(loanLine(2, [], true, 'en'), { text: 'Available to borrow', s: 'available' });
  assert.deepEqual(loanLine(3, [{ due: '2026-12-04T23:59:59Z' }], true, 'en'), { text: '2 of 3 available', s: 'available' });
  const out = loanLine(2, [{ due: '2026-12-09T23:59:59Z' }, { due: '2026-12-04T23:59:59Z' }], true, 'en')!;
  assert.equal(out.s, 'checked_out');
  assert.match(out.text, /^On loan, due back 4 Dec/, 'the earliest return');
  assert.match(loanLine(1, [{ due: '2026-12-04T23:59:59Z' }], true, 'ar')!.text, /^معار، يعود/);
  assert.equal(loanLine(1, [{ due: 'x' }, { due: 'y' }], true, 'en')!.s, 'checked_out', 'never more out than copies');
});

test('subscribed e-resources match every word typed, in the title or the ISSN', () => {
  const list: EResource[] = [
    { id: 1, kind: 'database', title: 'JSTOR Arts & Sciences', url: 'https://www.jstor.org' },
    { id: 2, kind: 'journal', title: 'مجلة المورد', issn: '0027-1489', url: 'https://example.org/mawrid' },
    { id: 3, kind: 'database', title: 'Al-Manhal', url: 'https://www.almanhal.com' },
  ];
  assert.deepEqual(matchResources('jstor', list).map((r) => r.id), [1]);
  assert.deepEqual(matchResources('المورد', list).map((r) => r.id), [2]);
  assert.deepEqual(matchResources('0027-1489', list).map((r) => r.id), [2]);
  assert.deepEqual(matchResources('manhal', list).map((r) => r.id), [3]);
  assert.deepEqual(matchResources('jstor history', list), [], 'every word');
  assert.deepEqual(matchResources('  ', list), []);
});
