// Lists (lists.tsx): queries are read strictly, run on rows, and exported as CSV people can read.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ENTITIES, OPS_BY_TYPE, readQuery, runQuery, toCsv, type ListQuery } from '../supabase/functions/server/lists.tsx';

const loans = [
  { barcode: 'B1', record_title: 'كتاب الأغاني', borrower_name: 'Ali', patron_kind: 'student', due_at: '2026-11-01T10:00:00Z', out: true, overdue: true, fine: 2, renewals: 0 },
  { barcode: 'B2', record_title: 'Kitāb al-Aghānī', borrower_name: 'Sara', patron_kind: 'staff', due_at: '2026-12-20T10:00:00Z', out: true, overdue: false, fine: 0, renewals: 2 },
  { barcode: 'B3', record_title: 'Muqaddima', borrower_name: null, patron_kind: 'reader', due_at: '2026-10-01T10:00:00Z', returned_at: '2026-10-02T09:00:00Z', out: false, overdue: false, fine: 0, renewals: 1 },
];
const q = (x: any): ListQuery => { const r = readQuery({ entity: 'loans', ...x }); if ('error' in r) throw new Error(r.error); return r.query; };
const barcodes = (rows: any[]) => rows.map((r) => r.barcode);

test('every entity has fields, readable names in both languages, and known default columns', () => {
  for (const e of Object.values(ENTITIES)) {
    assert.ok(e.en && e.ar && e.fields.length);
    for (const f of e.fields) assert.ok(f.en && f.ar && OPS_BY_TYPE[f.type], `${e.id}.${f.key}`);
    for (const k of e.columns) assert.ok(e.fields.some((f) => f.key === k), `${e.id} column ${k}`);
  }
});

test('queries are read strictly: unknown fields, wrong operators and bad values are refused', () => {
  assert.ok('error' in readQuery({ entity: 'nothing' }));
  assert.ok('error' in readQuery({ entity: 'loans', conditions: [{ field: 'password', op: 'is', value: 'x' }] }));
  assert.ok('error' in readQuery({ entity: 'loans', conditions: [{ field: 'overdue', op: 'contains', value: 'x' }] }));
  assert.ok('error' in readQuery({ entity: 'loans', conditions: [{ field: 'due_at', op: 'before', value: 'tomorrow' }] }));
  assert.ok('error' in readQuery({ entity: 'loans', conditions: [{ field: 'fine', op: 'more', value: 'lots' }] }));
  assert.ok('error' in readQuery({ entity: 'loans', conditions: [{ field: 'barcode', op: 'is', value: ' ' }] }));
  const ok = q({ conditions: [{ field: 'barcode', op: 'anyOf', value: 'B1, B2،B9' }], columns: ['barcode', 'nope'] });
  assert.deepEqual(ok.conditions[0].value, ['B1', 'B2', 'B9']);
  assert.deepEqual(ok.columns, ['barcode']);
  assert.deepEqual(q({}).columns, ENTITIES.loans.columns);
});

test('operators: is, contains (Arabic and accents folded), starts with, any of, empty, dates, numbers, NOT, any', () => {
  assert.deepEqual(barcodes(runQuery(loans, q({ conditions: [{ field: 'overdue', op: 'is', value: 'true' }] }))), ['B1']);
  assert.deepEqual(barcodes(runQuery(loans, q({ conditions: [{ field: 'record_title', op: 'contains', value: 'الاغاني' }] }))), ['B1']);
  assert.deepEqual(barcodes(runQuery(loans, q({ conditions: [{ field: 'record_title', op: 'contains', value: 'aghani' }] }))), ['B2']);
  assert.deepEqual(barcodes(runQuery(loans, q({ conditions: [{ field: 'record_title', op: 'starts', value: 'muq' }] }))), ['B3']);
  assert.deepEqual(barcodes(runQuery(loans, q({ conditions: [{ field: 'patron_kind', op: 'anyOf', value: ['staff', 'reader'] }] }))), ['B2', 'B3']);
  assert.deepEqual(barcodes(runQuery(loans, q({ conditions: [{ field: 'borrower_name', op: 'empty' }] }))), ['B3']);
  assert.deepEqual(barcodes(runQuery(loans, q({ conditions: [{ field: 'borrower_name', op: 'empty', not: true }] }))), ['B1', 'B2']);
  assert.deepEqual(barcodes(runQuery(loans, q({ conditions: [{ field: 'due_at', op: 'before', value: '2026-11-25' }] }))), ['B1', 'B3']);
  assert.deepEqual(barcodes(runQuery(loans, q({ conditions: [{ field: 'due_at', op: 'is', value: '2026-12-20' }] }))), ['B2']);
  assert.deepEqual(barcodes(runQuery(loans, q({ conditions: [{ field: 'renewals', op: 'more', value: '0' }] }))), ['B2', 'B3']);
  const both = [{ field: 'fine', op: 'more', value: '1' }, { field: 'renewals', op: 'is', value: '2' }];
  assert.deepEqual(barcodes(runQuery(loans, q({ conditions: both }))), []);
  assert.deepEqual(barcodes(runQuery(loans, q({ match: 'any', conditions: both }))), ['B1', 'B2']);
  assert.deepEqual(barcodes(runQuery(loans, q({ sort: { field: 'renewals', desc: true } }))), ['B2', 'B3', 'B1']);
  assert.deepEqual(barcodes(runQuery(loans, q({ sort: { field: 'borrower_name' } }))), ['B1', 'B2', 'B3'], 'empty values last');
});

test('CSV: readable headers in either language, readable values, quoting, no formulas, a BOM for Excel', () => {
  const rows = [...loans, { barcode: '=HYPERLINK("x")', record_title: 'A, "B"', overdue: false, fine: -1 }];
  const query = q({ columns: ['barcode', 'record_title', 'patron_kind', 'overdue', 'due_at', 'fine'] });
  const csv = toCsv(rows, query);
  const lines = csv.slice(1).trim().split('\r\n');
  assert.ok(csv.startsWith('﻿'));
  assert.equal(lines[0], 'Barcode,Title,Kind of borrower,Overdue,Due,Fine');
  assert.equal(lines[1], 'B1,كتاب الأغاني,Student,Yes,2026-11-01,2');
  assert.equal(lines[4], `"'=HYPERLINK(""x"")","A, ""B""",,No,,-1`);
  assert.ok(toCsv(rows, query, true).includes('الباركود,العنوان,نوع المستفيد,متأخرة'));
  assert.ok(toCsv(rows, query, true).includes('طالب,نعم'));
});
