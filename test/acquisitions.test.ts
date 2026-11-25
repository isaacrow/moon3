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

test('a received order becomes copies of its record, with barcodes and the order number', async () => {
  const { readReceipt, firstInstanceId, receiptRows } = await import('../supabase/functions/server/acquisitions.tsx');
  const { withCopies } = await import('../supabase/functions/server/copiesImport.tsx');
  const { copiesIn } = await import('../supabase/functions/server/circulation.tsx');
  const order = { number: 'PO-2026-0007', quantity: 3, copies_added: 1 };
  assert.match((readReceipt({}, { ...order, copies_added: 3 }) as any).error, /already in the record/);
  assert.match((readReceipt({ count: 3 }, order) as any).error, /Only 2 copies/);
  assert.match((readReceipt({ barcodes: 'A1 A1' }, order) as any).error, /twice/);
  assert.match((readReceipt({ barcodes: ['x y'] }, order) as any).error, /Not a barcode/);
  assert.match((readReceipt({ barcodes: 'A1 A2 A3' }, order) as any).error, /Only 2/);
  const ok = readReceipt({ barcodes: '30001, 30002', location: ' Main  hall ', shelfMark: '892.7' }, order);
  assert.ok('input' in ok);
  if (!('input' in ok)) return;
  assert.equal(ok.input.count, 2, 'every copy left, by default');
  assert.equal(ok.input.location, 'Main hall');
  const inst = 'https://mooon.site/resource/instance/r9';
  const doc = { '@graph': [{ '@id': 'https://mooon.site/resource/work/r9', '@type': 'bf:Work' }, { '@id': inst, '@type': 'bf:Instance' }] };
  assert.equal(firstInstanceId(doc), inst);
  assert.equal(firstInstanceId({ '@graph': [] }), null);
  const rows = receiptRows(ok.input, order, 'Test library', 1);
  const after = withCopies(doc, inst, rows as any, 't');
  const found = copiesIn(after);
  assert.deepEqual(found.map((c) => [c.barcode, c.library, c.shelfMark, c.copyNumber]), [['30001', 'Test library', '892.7', '1'], ['30002', 'Test library', '892.7', '2']]);
  assert.ok(after['@graph'].filter((n: any) => n['@type'] === 'bf:Item').every((n: any) => n['bf:note']['rdfs:label'] === 'Order PO-2026-0007'));
  assert.equal(doc['@graph'].length, 2, 'the record given is not changed');
  const noBarcodes = readReceipt({}, { number: 'PO-1', quantity: 2 });
  assert.ok('input' in noBarcodes && noBarcodes.input.count === 2 && noBarcodes.input.barcodes.length === 0);
});

test('claims: late orders by vendor, from the expected date or the vendor\'s lead time, claimed again after 30 days', async () => {
  const { lateOrders, DEFAULT_LEAD_DAYS } = await import('../supabase/functions/server/acquisitions.tsx');
  const now = new Date('2026-11-25T12:00:00Z');
  const vendors = [{ id: 'v1', name: 'Dar al-Kutub', lead_days: 30 }, { id: 'v2', name: 'Brill' }];
  const orders = [
    { id: 1, number: 'PO-1', title: 'A', quantity: 1, status: 'ordered', ordered_at: '2026-09-01T00:00:00Z', vendor_id: 'v1' }, // due 1 Oct
    { id: 2, number: 'PO-2', title: 'B', quantity: 2, status: 'ordered', ordered_at: '2026-11-01T00:00:00Z', vendor_id: 'v1' }, // due 1 Dec: not late
    { id: 3, number: 'PO-3', title: 'C', quantity: 1, status: 'ordered', ordered_at: '2026-01-01T00:00:00Z', expected_at: '2026-11-20', vendor_id: 'v2' },
    { id: 4, number: 'PO-4', title: 'D', quantity: 1, status: 'received', ordered_at: '2025-01-01T00:00:00Z', vendor_id: 'v2' },
    { id: 5, number: 'PO-5', title: 'E', quantity: 1, status: 'ordered', ordered_at: '2026-08-01T00:00:00Z', vendor_id: 'v2' }, // 60 days: due 30 Sep
  ];
  const claims = [{ order_id: 1, claimed_at: '2026-11-10T00:00:00Z' }, { order_id: 5, claimed_at: '2026-10-01T00:00:00Z' }];
  const g = lateOrders(orders, vendors, claims, now);
  assert.equal(DEFAULT_LEAD_DAYS, 60);
  assert.deepEqual(g.map((x) => x.vendor.name), ['Brill', 'Dar al-Kutub'], 'the vendor with the latest order first');
  const brill = g[0].orders;
  assert.deepEqual(brill.map((o) => o.number), ['PO-5', 'PO-3']);
  assert.equal(brill[1].expected, '2026-11-20');
  assert.equal(brill[0].claimNow, true, 'last claimed 55 days ago');
  const dar = g[1].orders;
  assert.deepEqual(dar.map((o) => [o.number, o.claims, o.claimNow]), [['PO-1', 1, false]], 'claimed 15 days ago: not again yet');
});
