// Reader password reset: the codes, how long they last, the email, and sending it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeResetCode, normalizeCode, resetExpiry, resetLink, resetEmail, sendBrevo, CODE_LENGTH } from '../supabase/functions/server/readerReset.tsx';

test('codes are 12 letters and digits that cannot be misread, in groups of four', () => {
  for (let i = 0; i < 200; i++) {
    const c = makeResetCode();
    assert.match(c, /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    assert.doesNotMatch(c, /[01OIL]/);
    assert.equal(c.replace(/-/g, '').length, CODE_LENGTH);
  }
  assert.notEqual(makeResetCode(), makeResetCode());
});

test('a code is accepted however it is typed, and refused when mistyped', () => {
  assert.equal(normalizeCode('abcd efgh jkmn'), 'ABCD-EFGH-JKMN');
  assert.equal(normalizeCode('ABCDEFGHJKMN'), 'ABCD-EFGH-JKMN');
  assert.equal(normalizeCode(' abcd-efgh-jkmn '), 'ABCD-EFGH-JKMN');
  assert.equal(normalizeCode('ABCD-EFGH-JKM0'), null, '0 is never in a code');
  assert.equal(normalizeCode('ABCD-EFGH'), null);
  assert.equal(normalizeCode(42), null);
});

test('email codes last 30 minutes, desk codes 24 hours', () => {
  const now = new Date('2026-11-25T10:00:00Z');
  assert.equal(resetExpiry(now, 'email'), '2026-11-25T10:30:00.000Z');
  assert.equal(resetExpiry(now, 'desk'), '2026-11-26T10:00:00.000Z');
});

test('the email has the link and the code in both languages, and escapes the name', () => {
  const link = resetLink('https://mooon.site/', 'ABCD-EFGH-JKMN');
  assert.equal(link, 'https://mooon.site/opac.html?reset=ABCD-EFGH-JKMN');
  const m = resetEmail('<b>Fatima</b>', 'ABCD-EFGH-JKMN', link);
  assert.match(m.subject, /Reset your password/);
  assert.match(m.text, /مرحبًا/);
  assert.match(m.text, /Hello/);
  assert.ok(m.html.includes(link) && m.html.includes('ABCD-EFGH-JKMN'));
  assert.ok(!m.html.includes('<b>Fatima</b>') && m.html.includes('&lt;b&gt;Fatima'));
});

test('sending: nothing without the key; Brevo gets the message with the key', async () => {
  const calls: any[] = [];
  const fake = (async (url: string, init: any) => { calls.push({ url, init }); return new Response('{}', { status: 201 }); }) as any;
  const mail = resetEmail('F', 'ABCD-EFGH-JKMN', 'https://mooon.site/opac.html?reset=x');
  assert.equal(await sendBrevo({}, { email: 'f@example.org', name: 'F' }, mail, fake), false);
  assert.equal(calls.length, 0);
  assert.equal(await sendBrevo({ apiKey: 'k', from: 'library@mooon.site' }, { email: 'f@example.org', name: 'F' }, mail, fake), true);
  assert.equal(calls[0].url, 'https://api.brevo.com/v3/smtp/email');
  assert.equal(calls[0].init.headers['api-key'], 'k');
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.sender.email, 'library@mooon.site');
  assert.deepEqual(body.to, [{ email: 'f@example.org', name: 'F' }]);
  const refused = (async () => new Response('{}', { status: 401 })) as any;
  assert.equal(await sendBrevo({ apiKey: 'bad' }, { email: 'f@example.org', name: 'F' }, mail, refused), false);
});
