// Each library's rules at save (libraryRules.tsx, plan step H10): extra required fields, ISBN check digits, the LCCN's
// normalized form, duplicates; each check off, warning or blocking publishing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRules, isbnValid, normalizeLccn, checkRules, blockers, DEFAULT_RULES } from '../supabase/functions/server/libraryRules.tsx';

const doc = (ids: Array<[string, string]>, work: any = {}) => ({ '@graph': [
  { '@id': 'w', '@type': ['bf:Work', 'bf:Text'], ...work },
  { '@id': 'i', '@type': ['bf:Instance', 'bf:Print'], 'bf:identifiedBy': ids.map(([t, v]) => ({ '@type': `bf:${t}`, 'rdf:value': v })) },
] });

test('ISBN check digits, ISBN-10 and ISBN-13, hyphens and qualifiers aside', () => {
  assert.ok(isbnValid('0-306-40615-2'));
  assert.ok(isbnValid('978-0-306-40615-7'));
  assert.ok(isbnValid('9954860711'));
  assert.ok(isbnValid('080442957X'));
  assert.ok(isbnValid('9780961727307 (pbk.)'));
  assert.ok(!isbnValid('978-0-306-40615-8'));
  assert.ok(!isbnValid('0306406153'));
  assert.ok(!isbnValid('12345'));
});

test("the LCCN's normalized form, as LC writes it", () => {
  assert.equal(normalizeLccn('n 79-21164'), 'n79021164');
  assert.equal(normalizeLccn('85-2 '), '85000002');
  assert.equal(normalizeLccn('2001-1114'), '2001001114');
  assert.equal(normalizeLccn('  75540098 //r85'), '75540098');
  assert.equal(normalizeLccn('n79021164'), 'n79021164');
  assert.equal(normalizeLccn('abcd123'), null);
});

test('rules read strictly, with warnings by default', () => {
  assert.deepEqual(parseRules(null), DEFAULT_RULES);
  const r = parseRules({ required: ['subject', 'nope', 'subject'], checks: { isbnValid: 'block', lccnForm: 'loud' } });
  assert.deepEqual(r.required, ['subject']);
  assert.equal(r.checks.isbnValid, 'block');
  assert.equal(r.checks.lccnForm, 'warn');
});

test('missing fields, failed checks and duplicates: what blocks publishing and what only warns', () => {
  const rules = parseRules({ required: ['subject', 'isbn'], checks: { isbnValid: 'block', lccnForm: 'warn', duplicateIsbn: 'warn', duplicateLccn: 'off' } });
  const r = checkRules(doc([['Isbn', '978-0-306-40615-8'], ['Lccn', 'n 79-21164']]), rules,
    [{ id: 'r9', title: 'Other', reasons: ['isbn', 'lccn'] }]);
  assert.deepEqual(r.missing.map((m) => m.field), ['subject'], 'it has an ISBN, but no subject');
  assert.deepEqual(r.problems.map((p) => [p.check, p.severity]), [['isbnValid', 'block'], ['lccnForm', 'warn'], ['duplicateIsbn', 'warn']]);
  assert.match(r.problems[1].en, /n79021164/);
  assert.deepEqual(blockers(r).map((b) => b.field), ['subject', 'isbnValid']);

  const fine = checkRules(doc([['Isbn', '9780306406157']], { 'bf:subject': { 'rdfs:label': 'History' } }), rules);
  assert.deepEqual(fine, { missing: [], problems: [] });
});
