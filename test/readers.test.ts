// Reader accounts: sign-ups, when reading history is written, how long things are kept, saved books on sign-in.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readRegistration, cleanEmail, historyRow, inactiveBefore, sessionExpiry, mergeSaved, cleanRecordId } from '../supabase/functions/server/readers.tsx';
import { readPatron } from '../supabase/functions/server/circulation.tsx';

test('a sign-up is checked; history is on unless unticked', () => {
  const ok = readRegistration({ email: ' Fatima@Example.org ', name: '  فاطمة   حسن ', password: 'long enough' });
  assert.ok('reg' in ok);
  if ('reg' in ok) {
    assert.equal(ok.reg.email, 'fatima@example.org');
    assert.equal(ok.reg.name, 'فاطمة حسن');
    assert.equal(ok.reg.keepHistory, true);
  }
  const off = readRegistration({ email: 'a@b.co', name: 'A', password: '12345678', keepHistory: false });
  assert.ok('reg' in off && off.reg.keepHistory === false);
  assert.deepEqual(readRegistration({ email: 'nope', name: 'A', password: '12345678' }), { error: 'email' });
  assert.deepEqual(readRegistration({ email: 'a@b.co', name: ' ', password: '12345678' }), { error: 'name' });
  assert.deepEqual(readRegistration({ email: 'a@b.co', name: 'A', password: 'short' }), { error: 'password' });
  assert.equal(cleanEmail('x@y'), null);
});

test('history is written only for a linked reader who keeps it', () => {
  const loan = { record_id: 'r1', record_title: 'المقدمة', library: 'Main', loaned_at: '2026-11-01T10:00:00Z' };
  assert.equal(historyRow(loan, null, '2026-11-20T10:00:00Z'), null, 'card not linked to an account');
  assert.equal(historyRow(loan, { id: 'u1', keep_history: false }, '2026-11-20T10:00:00Z'), null, 'history turned off');
  assert.deepEqual(historyRow(loan, { id: 'u1', keep_history: true }, '2026-11-20T10:00:00Z'), {
    reader_id: 'u1', record_id: 'r1', title: 'المقدمة', library: 'Main', borrowed_at: '2026-11-01T10:00:00Z', returned_at: '2026-11-20T10:00:00Z',
  });
});

test('sessions last 30 days; accounts unused for two years are deleted', () => {
  const now = new Date('2026-11-24T00:00:00Z');
  assert.equal(sessionExpiry(now), '2026-12-24T00:00:00.000Z');
  assert.equal(inactiveBefore(now), '2024-11-24T00:00:00.000Z');
});

test('saved books after signing in: the account first, then this browser, each once', () => {
  assert.deepEqual(mergeSaved(['a', 'b'], ['b', 'c', 'bad id', '']), ['a', 'b', 'c']);
  assert.equal(cleanRecordId('https://mooon.site/resource/instance/x'), 'https://mooon.site/resource/instance/x');
});

test('a borrower is linked to a reader account by its email', () => {
  const r = readPatron({ card: 'A1', name: 'x', readerEmail: ' Reader@Example.org ' });
  assert.ok('patron' in r && r.patron.readerEmail === 'reader@example.org');
  assert.ok('error' in readPatron({ card: 'A1', name: 'x', readerEmail: 'not an email' }));
  const none = readPatron({ card: 'A1', name: 'x' });
  assert.ok('patron' in none && none.patron.readerEmail === null);
});
