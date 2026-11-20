// Circulation: loan rules, dates, fines, the checks at the desk, and finding a copy by its barcode.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_RULES, parseRules, dueDate, daysOverdue, fineFor, cleanCode, readPatron, copiesIn, checkoutProblem,
  renewProblem, renewedDue,
} from '../supabase/functions/server/circulation.tsx';
import { copyToNode, emptyCopy } from '../src/services/itemCopies';

test('rules: missing or wrong values fall back to the defaults, numbers are kept in range', () => {
  assert.deepEqual(parseRules(null), DEFAULT_RULES);
  const r = parseRules(JSON.stringify({ loanDays: { reader: 7, student: -3 }, maxRenewals: 99, fines: 'yes', currency: 'iqd', finePerDay: 250 }));
  assert.equal(r.loanDays.reader, 7);
  assert.equal(r.loanDays.student, 1);
  assert.equal(r.loanDays.staff, DEFAULT_RULES.loanDays.staff);
  assert.equal(r.maxRenewals, 20);
  assert.equal(r.fines, false, 'only true turns fines on');
  assert.equal(r.currency, 'USD');
  assert.equal(parseRules({ currency: 'IQD' }).currency, 'IQD');
});

test('a loan is due at the end of its last day; lateness and fines count whole days', () => {
  const from = new Date('2026-11-20T10:00:00Z');
  assert.equal(dueDate(from, 'reader', DEFAULT_RULES), '2026-12-04T23:59:59.000Z');
  assert.equal(dueDate(from, 'staff', DEFAULT_RULES), '2026-12-20T23:59:59.000Z');
  const due = '2026-12-04T23:59:59.000Z';
  assert.equal(daysOverdue(due, new Date('2026-12-04T20:00:00Z')), 0);
  assert.equal(daysOverdue(due, new Date('2026-12-05T08:00:00Z')), 1);
  assert.equal(daysOverdue(due, new Date('2026-12-30T00:00:00Z'), '2026-12-06T09:00:00Z'), 2, 'counted to the return');
  assert.equal(fineFor(due, new Date('2026-12-10T08:00:00Z'), DEFAULT_RULES), 0, 'no fines unless the library turns them on');
  const fines = { ...DEFAULT_RULES, fines: true, finePerDay: 0.5, fineCap: 2 };
  assert.equal(fineFor(due, new Date('2026-12-07T08:00:00Z'), fines), 1.5);
  assert.equal(fineFor(due, new Date('2027-02-01T08:00:00Z'), fines), 2, 'capped');
});

test('card numbers and barcodes, and borrowers as entered at the desk', () => {
  assert.equal(cleanCode(' 0012-34 '), '0012-34');
  assert.equal(cleanCode(12345), '12345');
  assert.equal(cleanCode('12 34'), null);
  assert.equal(cleanCode("1'; drop"), null);
  assert.equal(cleanCode('%'), null);
  const ok = readPatron({ card: 'A100', name: '  فاطمة   حسن ', kind: 'student', email: 'f@example.org' });
  assert.ok('patron' in ok && ok.patron.name === 'فاطمة حسن' && ok.patron.kind === 'student');
  assert.ok('error' in readPatron({ card: 'A100', name: '' }));
  assert.ok('error' in readPatron({ card: 'A 100', name: 'x' }));
  assert.ok('error' in readPatron({ card: 'A100', name: 'x', email: 'not-an-email' }));
  const unknownKind = readPatron({ card: 'A1', name: 'x', kind: 'king' });
  assert.ok('patron' in unknownKind && unknownKind.patron.kind === 'reader');
});

test('a copy is found in a record by its barcode, as the editor writes copies', () => {
  const inst = 'https://mooon.site/resource/instance/r1';
  const a = { ...emptyCopy(inst), library: 'Main library', shelfMark: '892.7 MAH', barcode: '30001', copyNumber: '1' };
  const b = { ...emptyCopy(inst), barcode: '30002', referenceOnly: true };
  const c = { ...emptyCopy(inst), library: 'No barcode' };
  const doc = { '@graph': [{ '@id': inst, '@type': 'bf:Instance' }, copyToNode(a, inst), copyToNode(b, inst), copyToNode(c, inst)] };
  const found = copiesIn(doc);
  assert.equal(found.length, 2, 'only copies with a barcode');
  assert.deepEqual(found[0], { itemId: a.id, barcode: '30001', library: 'Main library', location: '', shelfMark: '892.7 MAH', copyNumber: '1', referenceOnly: false });
  assert.equal(found[1].referenceOnly, true);
  // An older record with the Item nested under the Instance.
  assert.equal(copiesIn({ '@graph': [{ '@type': 'bf:Instance', 'bf:hasItem': [{ '@type': 'bf:Item', 'bf:barcode': '777' }] }] })[0].barcode, '777');
});

test('the desk refuses a loan for the right reason', () => {
  const p = { kind: 'reader' as const, blocked: false, openLoans: 0, overdue: 0, finesOwed: 0 };
  const free = { referenceOnly: false, onLoan: false, heldForOther: false };
  assert.equal(checkoutProblem(p, free, DEFAULT_RULES), null);
  assert.match(checkoutProblem(p, { ...free, referenceOnly: true }, DEFAULT_RULES)!, /library only/);
  assert.match(checkoutProblem(p, { ...free, onLoan: true }, DEFAULT_RULES)!, /already on loan/);
  assert.match(checkoutProblem(p, { ...free, heldForOther: true }, DEFAULT_RULES)!, /another borrower/);
  assert.match(checkoutProblem({ ...p, blocked: true }, free, DEFAULT_RULES)!, /blocked/);
  assert.match(checkoutProblem({ ...p, overdue: 2 }, free, DEFAULT_RULES)!, /2 overdue loans/);
  assert.equal(checkoutProblem({ ...p, finesOwed: 3 }, free, DEFAULT_RULES), null, 'fines off: an old fine does not stop a loan');
  assert.match(checkoutProblem({ ...p, finesOwed: 3 }, free, { ...DEFAULT_RULES, fines: true })!, /owes 3.00 USD/);
  assert.match(checkoutProblem({ ...p, openLoans: 5 }, free, DEFAULT_RULES)!, /5 copies out/);
  assert.equal(checkoutProblem({ ...p, kind: 'staff', openLoans: 5 }, free, DEFAULT_RULES), null);
});

test('renewals: a limit, nobody waiting, and the new date counted from today', () => {
  const now = new Date('2026-12-01T09:00:00Z');
  const loan = { due_at: '2026-12-04T23:59:59.000Z', renewals: 0 };
  assert.equal(renewProblem(loan, DEFAULT_RULES, 0, now), null);
  assert.match(renewProblem({ ...loan, renewals: 2 }, DEFAULT_RULES, 0, now)!, /2 times/);
  assert.match(renewProblem(loan, DEFAULT_RULES, 1, now)!, /waiting/);
  assert.equal(renewedDue(loan.due_at, 'reader', DEFAULT_RULES, now), '2026-12-15T23:59:59.000Z');
  assert.equal(renewedDue('2027-01-30T23:59:59.000Z', 'reader', DEFAULT_RULES, now), '2027-01-30T23:59:59.000Z', 'never earlier');
});
