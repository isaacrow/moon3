// Bulk import of copies from a spreadsheet: reading the sheet, finding the book, never adding a copy twice, and
// writing Items that the editor and the OPAC read exactly like copies made by hand.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { byRecord, isbn13, isbnsOf, parseCopiesTable, planImport, withCopies } from '../supabase/functions/server/copiesImport.tsx';
import { nodeToCopy } from '../src/services/itemCopies';

const INST = 'https://mooon.site/resource/instance/i1';
const doc = (isbn: string, items: any[] = []) => ({
  '@graph': [
    { '@id': 'https://mooon.site/resource/work/w1', '@type': 'bf:Work', 'bf:hasInstance': { '@id': INST } },
    { '@id': INST, '@type': 'bf:Instance', 'bf:instanceOf': { '@id': 'https://mooon.site/resource/work/w1' },
      'bf:identifiedBy': [{ '@type': 'bf:Isbn', 'rdf:value': isbn }], ...(items.length ? { 'bf:hasItem': items.map((i) => ({ '@id': i['@id'] })) } : {}) },
    ...items,
  ],
});

test('isbn13: ISBN-10 and ISBN-13, with or without hyphens, give one form', () => {
  assert.equal(isbn13('0-14-044100-6'), '9780140441000');
  assert.equal(isbn13('978-0-14-044100-0'), '9780140441000');
  assert.equal(isbn13('080442957X'), '9780804429573');
  assert.equal(isbn13('12345'), '');
});

test('parseCopiesTable reads CSV, TSV from Excel, quoted fields and Arabic column names', () => {
  const csv = parseCopiesTable('ISBN,Library,Shelf mark,Copy,Reference only,Note\n9780140441000,Main,"PJ 1, A2",c. 2,yes,"He said ""fine"""\n');
  assert.deepEqual(csv.problems, []);
  assert.equal(csv.rows[0].shelfMark, 'PJ 1, A2');
  assert.equal(csv.rows[0].copyNumber, '2');
  assert.equal(csv.rows[0].referenceOnly, true);
  assert.equal(csv.rows[0].note, 'He said "fine"');
  assert.equal(csv.rows[0].line, 2);
  const tsv = parseCopiesTable('ردمك\tالمكتبة\tرقم الرف\tالباركود\n9780140441000\tالمكتبة المركزية\tPJ7846\t000123\n\n');
  assert.equal(tsv.rows[0].library, 'المكتبة المركزية');
  assert.equal(tsv.rows[0].barcode, '000123');
  assert.match(parseCopiesTable('Title,Author\nX,Y').problems[0], /ISBN/);
  assert.match(parseCopiesTable('ISBN,Title\n1,X').problems[0], /Library/);
  assert.match(parseCopiesTable('').problems[0], /empty/);
});

test('planImport: finds the book by ISBN in either form or by record id; reports the rest', () => {
  const records = [
    { id: 'r1', title: 'The epic of Gilgamesh', document: doc('0-14-044100-6') },
    { id: 'r2', title: 'Dup A', document: doc('9780000000002') },
    { id: 'r3', title: 'Dup B', document: doc('9780000000002') },
  ];
  const { rows } = parseCopiesTable([
    'ISBN,Record,Library,Shelf mark,Barcode',
    '9780140441000,,Main,PJ1,111',
    ',r1,Main,PJ1,222',
    '9780140441000,,Main,PJ1,111',
    '9789999999999,,Main,X,333',
    '9780000000002,,Main,Y,444',
  ].join('\n'));
  const plan = planImport(records, rows);
  assert.deepEqual(plan.map((p) => p.status), ['add', 'add', 'repeated in the sheet', 'no such book', 'several books']);
  assert.equal(plan[0].recordId, 'r1');
  assert.equal(plan[1].instance, INST);
});

test('a copy already on the record is not added again (barcode, or library + shelf mark + copy)', () => {
  const have = { '@id': 'https://mooon.site/resource/item/i1-a', '@type': 'bf:Item', 'bf:itemOf': { '@id': INST },
    'bf:heldBy': { 'rdfs:label': 'Main' }, 'bf:shelfMark': { 'rdfs:label': 'PJ1' }, 'bf:enumerationAndChronology': { 'rdfs:label': 'c. 1' },
    'bf:identifiedBy': [{ '@type': 'bf:Barcode', 'rdf:value': '111' }] };
  const records = [{ id: 'r1', document: doc('9780140441000', [have]) }];
  const { rows } = parseCopiesTable('ISBN,Library,Shelf mark,Copy,Barcode\n9780140441000,Main,PJ1,,111\n9780140441000,main,pj1,1,\n9780140441000,Main,PJ1,2,');
  assert.deepEqual(planImport(records, rows).map((p) => p.status), ['already there', 'already there', 'add']);
});

test('withCopies writes Items the editor reads back exactly, linked both ways, input untouched', () => {
  const original = doc('9780140441000');
  const before = JSON.stringify(original);
  const { rows } = parseCopiesTable('ISBN,Library,Location,Shelf mark,Barcode,Copy,Reference only,Note\n9780140441000,Main Library,Arabic collection,PJ7846 .A46,000123,2,yes,Gift of the author');
  const out = withCopies(original, INST, rows, 'x');
  assert.equal(JSON.stringify(original), before, 'the input is not changed');
  const item = out['@graph'].find((n: any) => n['@type'] === 'bf:Item');
  assert.equal(item['@id'], 'https://mooon.site/resource/item/i1-x1');
  const inst = out['@graph'].find((n: any) => n['@id'] === INST);
  assert.deepEqual(inst['bf:hasItem'], [{ '@id': item['@id'] }]);
  const copy = nodeToCopy(item);
  assert.equal(copy.library, 'Main Library');
  assert.equal(copy.location, 'Arabic collection');
  assert.equal(copy.shelfMark, 'PJ7846 .A46');
  assert.equal(copy.barcode, '000123');
  assert.equal(copy.copyNumber, '2');
  assert.equal(copy.referenceOnly, true);
  assert.equal(copy.note, 'Gift of the author');
  // Imported once, the same sheet adds nothing the second time.
  assert.deepEqual(planImport([{ id: 'r1', document: out }], rows).map((p) => p.status), ['already there']);
});

test('byRecord groups the copies to add, one save per record', () => {
  const records = [{ id: 'r1', document: doc('9780140441000') }];
  const { rows } = parseCopiesTable('ISBN,Library,Barcode\n9780140441000,Main,1\n9780140441000,Main,2\n9789999999999,Main,3');
  const groups = byRecord(planImport(records, rows));
  assert.equal(groups.size, 1);
  assert.equal(groups.get('r1')![0].rows.length, 2);
  assert.deepEqual(isbnsOf(doc('0140441006')), [{ isbn: '9780140441000', instance: INST }]);
});

test('a sheet with only library and location is safe to import twice too', () => {
  const { rows } = parseCopiesTable('ISBN,Library,Location\n9780140441000,Main,Arabic collection');
  const once = withCopies(doc('9780140441000'), INST, rows, 'y');
  assert.deepEqual(planImport([{ id: 'r1', document: once }], rows).map((p) => p.status), ['already there']);
});

test('the OPAC shows an imported copy (a copy listed as bf:hasItem { "@id": … } is read in full)', async () => {
  const { wolfMoonOpacService } = await import('../src/services/wolfMoonOpacService');
  const { rows } = parseCopiesTable('ISBN,Library,Location,Shelf mark,Barcode\n9780140441000,Moon Library,Main hall,PJ1,B1');
  const document = withCopies({ '@graph': [
    { '@id': 'https://mooon.site/resource/work/w1', '@type': 'bf:Work', 'bf:title': { '@id': '_:t' }, 'bf:hasInstance': { '@id': INST } },
    { '@id': '_:t', '@type': 'bf:Title', 'bf:mainTitle': 'The epic of Gilgamesh' },
    { '@id': INST, '@type': 'bf:Instance', 'bf:instanceOf': { '@id': 'https://mooon.site/resource/work/w1' }, 'bf:identifiedBy': [{ '@type': 'bf:Isbn', 'rdf:value': '9780140441000' }] },
  ] }, INST, rows, 'z');
  const work = (wolfMoonOpacService as any).parseBibframeDocumentToOpacWork({ id: 'r1', title: 'The epic of Gilgamesh', document });
  const copies = (work.holdingItems || []).filter((h: any) => !h.synthetic);
  assert.equal(copies.length, 1);
  assert.equal(copies[0].shelfMark, 'PJ1');
  assert.equal(copies[0].heldBy, 'Moon Library — Main hall');
  assert.equal(work.title, 'The epic of Gilgamesh', 'a title given as { "@id": … } is read too');
});
