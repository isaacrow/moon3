import test from 'node:test';
import assert from 'node:assert/strict';
import { ACTIONS, baghdadHour, cleanQuery, countryFrom, deviceClass, parseEvent, scriptOf, sourceOf } from '../supabase/functions/server/opacInsights.tsx';

test('cleanQuery makes searches the same and drops private ones', () => {
  assert.equal(cleanQuery('  Ibn  Khaldun '), 'ibn khaldun');
  assert.equal(cleanQuery('a'), '');
  assert.equal(cleanQuery('x'.repeat(121)), '');
  assert.equal(cleanQuery('me@example.com'), '');
  assert.equal(cleanQuery('https://example.com/a'), '');
  assert.equal(cleanQuery('07701234567'), '');
  assert.equal(cleanQuery('978-3-16-148410-0'), '978-3-16-148410-0');
  assert.equal(cleanQuery(42), '');
});

test('scriptOf', () => {
  assert.equal(scriptOf('ابن خلدون'), 'arabic');
  assert.equal(scriptOf('ibn khaldun'), 'latin');
  assert.equal(scriptOf('ابن khaldun'), 'mixed');
  assert.equal(scriptOf('1234'), 'digits');
  assert.equal(scriptOf('--'), 'other');
});

test('deviceClass', () => {
  assert.equal(deviceClass(390), 'phone');
  assert.equal(deviceClass(800), 'tablet');
  assert.equal(deviceClass(1440), 'desktop');
});

test('sourceOf keeps the site name only', () => {
  assert.equal(sourceOf('', 'mooon.site'), 'direct');
  assert.equal(sourceOf('https://mooon.site/x', 'mooon.site'), 'direct');
  assert.equal(sourceOf('https://www.google.com/search?q=secret', 'mooon.site'), 'google');
  assert.equal(sourceOf('https://t.co/abc', 'mooon.site'), 'x');
  assert.equal(sourceOf('https://blog.example.org/post/1', 'mooon.site'), 'blog.example.org');
  assert.equal(sourceOf('not a url', 'mooon.site'), 'direct');
});

test('countryFrom', () => {
  assert.equal(countryFrom('iq'), 'IQ');
  assert.equal(countryFrom('XX'), 'ZZ');
  assert.equal(countryFrom('T1'), 'ZZ');
  assert.equal(countryFrom(undefined), 'ZZ');
  assert.equal(countryFrom('IRQ'), 'ZZ');
});

test('parseEvent accepts only the known shapes', () => {
  assert.equal(parseEvent(null), null);
  assert.equal(parseEvent({ t: 'context', device: 'watch' }), null);
  assert.deepEqual(parseEvent({ t: 'context', device: 'phone', lang: 'AR', browserLang: 'en', source: 'google', entry: 'bogus' }),
    { t: 'context', device: 'phone', lang: 'ar', browserLang: 'en', source: 'google', entry: 'home', country: '' });
  const s = parseEvent({ t: 'search', query: ' Mahfouz ', results: -5, filters: 3 });
  assert.deepEqual(s, { t: 'search', query: 'mahfouz', results: 0, script: 'latin', lang: 'ar', filters: 3 });
  assert.equal(parseEvent({ t: 'search', query: 'a@b.com', results: 1 }), null);
  assert.deepEqual(parseEvent({ t: 'open', query: 'mahfouz', rank: 2 }), { t: 'open', query: 'mahfouz', rank: 2 });
  assert.equal(parseEvent({ t: 'open', query: 'mahfouz', rank: 0 }), null);
});

test('parseEvent: country, actions and the end of a visit', () => {
  assert.equal((parseEvent({ t: 'context', device: 'phone', country: 'IQ' }) as any).country, 'IQ');
  assert.equal((parseEvent({ t: 'context', device: 'phone', country: 'iq' }) as any).country, '');
  assert.equal((parseEvent({ t: 'context', device: 'phone', country: 'T1' }) as any).country, '');
  assert.equal((parseEvent({ t: 'context', device: 'phone', country: 'XX' }) as any).country, '');
  for (const a of ACTIONS) assert.deepEqual(parseEvent({ t: 'action', action: a }), { t: 'action', action: a });
  assert.equal(parseEvent({ t: 'action', action: 'my secret note' }), null);
  assert.equal(parseEvent({ t: 'action' }), null);
  assert.deepEqual(parseEvent({ t: 'end', pages: 4, seconds: 95.7 }), { t: 'end', pages: 4, seconds: 95 });
  assert.deepEqual(parseEvent({ t: 'end', pages: -3, seconds: 999999 }), { t: 'end', pages: 1, seconds: 14400 });
});

test('baghdadHour is the hour in Baghdad (UTC+3)', () => {
  assert.equal(baghdadHour(new Date('2026-11-11T21:00:00Z')), 0);
  assert.equal(baghdadHour(new Date('2026-11-11T06:30:00Z')), 9);
  assert.equal(baghdadHour(new Date('2026-11-11T20:59:00Z')), 23);
});
