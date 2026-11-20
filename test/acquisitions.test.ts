// Acquisitions: what each entry may hold, order numbers, fund spending, late journal issues, subscriptions ending.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readEntry, nextOrderNumber, orderTotal, fundStatus, lateIssues, endingSoon } from '../supabase/functions/server/acquisitions.tsx';

const ok = (r: ReturnType<typeof readEntry>) => { assert.ok('row' in r, 'error' in r ? r.error : ''); return (r as any).row; };
const err = (r: ReturnType<typeof readEntry>) => { assert.ok('error' in r, 'should be refused'); return (r as any).error as string; };

test('entries are cleaned and checked', () => {
  const v = ok(readEntry('vendors', { name: '  دار   الساقي ', email: 'books@example.org', website: 'https://example.org' }));
  assert.equal(v.name, 'دار الساقي');
  assert.equal(v.active, true, 'a new vendor is active');
  assert.match(err(readEntry('vendors', { name: '' })), /name is needed/);
  assert.match(err(readEntry('vendors', { name: 'x', website: 'javascript:alert(1)' })), /website/);
  const o = ok(readEntry('orders', { title: 'المقدمة', quantity: '2', unit_price: '12.505', currency: 'iqd' }));
  assert.equal(o.quantity, 2);
  assert.equal(o.unit_price, 12.51);
  assert.equal(o.currency, 'IQD');
  assert.equal(o.vendor_id, null);
  assert.match(err(readEntry('orders', { title: 'x', quantity: 0 })), /quantity/);
  assert.match(err(readEntry('orders', { title: 'x', quantity: 1, vendor_id: "1' or 1=1" })), /vendor id/);
  assert.match(err(readEntry('orders', { title: 'x', quantity: 1, material: 'spaceship' })), /material/);
  const inv = ok(readEntry('invoices', { number: 'INV-7', vendor_id: '0b6d2f3a-7c1e-4f6a-9d2b-1a2b3c4d5e6f', invoice_date: '2026-11-21', amount: 100, order_ids: '3, 4,4 x' }));
  assert.deepEqual(inv.order_ids, [3, 4]);
  assert.match(err(readEntry('invoices', { number: 'A', vendor_id: '0b6d2f3a-7c1e-4f6a-9d2b-1a2b3c4d5e6f', invoice_date: '21/11/2026', amount: 1 })), /YYYY-MM-DD/);
  assert.match(err(readEntry('subscriptions', { kind: 'journal', title: 'x', start_date: '2026-06-01', end_date: '2026-01-01' })), /after the start/);
});

test('order numbers run on within a year', () => {
  assert.equal(nextOrderNumber(2026, []), 'PO-2026-0001');
  assert.equal(nextOrderNumber(2026, ['PO-2026-0009', 'PO-2026-0002', 'PO-2025-0400']), 'PO-2026-0010');
});

test('a fund: committed, spent and what is left', () => {
  const fund = { id: 'f1', budget: 1000 };
  const orders = [
    { fund_id: 'f1', status: 'ordered', quantity: 2, unit_price: 50 },
    { fund_id: 'f1', status: 'received', quantity: 1, unit_price: 120.5 },
    { fund_id: 'f1', status: 'cancelled', quantity: 9, unit_price: 100 },
    { fund_id: 'f2', status: 'ordered', quantity: 1, unit_price: 999 },
  ];
  assert.equal(orderTotal(orders[0]), 100);
  assert.deepEqual(fundStatus(fund, orders, [{ fund_id: 'f1', cost: 300 }]), { committed: 100, spent: 420.5, remaining: 479.5, usedShare: 0.52 });
});

test('late journal issues and subscriptions about to end', () => {
  const now = new Date('2026-11-21T09:00:00Z');
  const subs = [
    { id: 1, kind: 'journal', title: 'Quarterly', issues_per_year: 4, start_date: '2026-01-01', end_date: '2026-12-31', active: true },
    { id: 2, kind: 'journal', title: 'Monthly', issues_per_year: 12, start_date: '2026-01-01', end_date: '2026-12-31', active: true },
    { id: 3, kind: 'database', title: 'A database', start_date: '2026-01-01', end_date: '2026-12-15', active: true },
    { id: 4, kind: 'journal', title: 'Stopped', issues_per_year: 12, start_date: '2025-01-01', end_date: '2025-12-31', active: true },
  ];
  // The quarterly came on 1 October (next due about 31 December): not late. The monthly last came on 1 September.
  const last = new Map([[1, '2026-10-01'], [2, '2026-09-01']]);
  const late = lateIssues(subs, last, now);
  assert.deepEqual(late.map((l) => l.title), ['Monthly']);
  assert.ok(late[0].daysLate > 40);
  assert.deepEqual(endingSoon(subs, now).map((s) => s.title), ['A database', 'Quarterly', 'Monthly']);
  assert.deepEqual(endingSoon(subs, now, 30).map((s) => s.title), ['A database']);
});
