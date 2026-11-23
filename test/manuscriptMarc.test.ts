// The Manuscripts screen builds each manuscript's MARC 21 / RDA record from its source fields with Al-Qamar's
// builder (manuscriptMarc.js). The fixture is four real records from Al-Qamar's catalogue that between them have
// several titles, no author, Persian, a script, an incipit and a description over 9,000 bytes, each with the MARC
// Al-Qamar stored for it. The builder must give the same record (005, the time it was built, aside).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildMarcRecord, toIso2709, toMrk, validateMarc } from '../src/app/utils/manuscriptMarc.js';

const records = readFileSync(new URL('./fixtures/manuscripts/sample.jsonl', import.meta.url), 'utf8')
  .split('\n').filter(Boolean).map((l) => JSON.parse(l));
const without005 = (marc: any[]) => marc.filter((f) => f.tag !== '005');

test('the builder gives the MARC Al-Qamar stored for each record', () => {
  assert.ok(records.length >= 4);
  assert.ok(records.some((r) => new TextEncoder().encode(r.source_fields['وصف النسخة'] || '').length > 9000), 'a long description');
  assert.ok(records.some((r) => !r.source_fields['المؤلف']), 'a record with no author');
  for (const r of records) {
    const built = buildMarcRecord(r);
    assert.deepEqual(without005(built), without005(r.marc21_rda), `record ${r.id}`);
    assert.deepEqual(validateMarc(built), [], `record ${r.id}`);
  }
});

test('the .mrc is valid ISO 2709: lengths, directory and terminators add up', () => {
  for (const r of records) {
    const bytes = toIso2709(buildMarcRecord(r));
    const ascii = (a: number, b: number) => String.fromCharCode(...bytes.slice(a, b));
    assert.equal(Number(ascii(0, 5)), bytes.length, `record ${r.id} length`);
    assert.equal(bytes[bytes.length - 1], 0x1d);
    const base = Number(ascii(12, 17));
    assert.equal(bytes[base - 1], 0x1e);
    const dir = ascii(24, base - 1);
    assert.equal(dir.length % 12, 0);
    for (let i = 0; i < dir.length; i += 12) {
      const len = Number(dir.slice(i + 3, i + 7)), off = Number(dir.slice(i + 7, i + 12));
      assert.equal(bytes[base + off + len - 1], 0x1e, `record ${r.id} field ${dir.slice(i, i + 3)}`);
    }
  }
});

test('the .mrk has the leader first and one line per field', () => {
  const r = records[0];
  const marc = buildMarcRecord(r);
  const lines = toMrk(marc).trimEnd().split('\n');
  assert.match(lines[0], /^=LDR {2}/);
  assert.equal(lines.length, marc.length);
  assert.ok(lines.some((l) => l.startsWith('=245  ')));
});
