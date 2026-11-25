// The public round-trip report (public/round-trip.json, plan step A2) is what Moon's converters give today on the
// fixed set of LC records; and the fixes it led to stay fixed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { roundTripReportJson } from '../src/services/marc/roundTripSet';
import { roundTrip } from '../src/services/marc/marcRoundTrip';
import { toMarcKey, fromMarcKey } from '../src/services/marc/marcKey';
import type { MarcRecord } from '../src/services/marc/marcRecord';

test('the published round-trip report is current (else run: npx tsx scripts/round-trip-report.mts)', () => {
  const published = readFileSync('public/round-trip.json', 'utf8').replace(/\r\n/g, '\n');
  assert.equal(published, roundTripReportJson());
  const r = JSON.parse(published);
  assert.ok(r.set.records >= 40 && r.clean / r.set.records >= 0.95, `${r.clean} of ${r.set.records} came back whole`);
});

test('a "$" in a value survives the marcKey ({dollar})', () => {
  const key = toMarcKey({ tag: '020', ind1: ' ', ind2: ' ', subfields: [['a', '0961727306 :'], ['c', '$7.95']] }, /^$/);
  assert.equal(key, '020  $a0961727306 :$c{dollar}7.95');
  assert.deepEqual(fromMarcKey(key)?.subfields, [['a', '0961727306 :'], ['c', '$7.95']]);
});

const rec = (fields: any[]): MarcRecord => ({ leader: '00000cam a2200000 a 4500', fields: [{ tag: '001', data: 'x' }, { tag: '008', data: '860227s1964    iq            000 0 ara  ' }, ...fields] });

test('pre-RDA 260, Dewey prime marks, 856 subfields and names in two scripts come back as they were', () => {
  const r = rec([
    { tag: '082', ind1: '0', ind2: '4', subfields: [['a', '297/.82/095675']] },
    { tag: '100', ind1: '0', ind2: ' ', subfields: [['6', '880-01'], ['a', 'Khaṭīb al-Baghdādī, Abū Bakr Aḥmad ibn ʻAlī,'], ['d', '1002-1071,'], ['e', 'author.']] },
    { tag: '245', ind1: '1', ind2: '0', subfields: [['6', '880-02'], ['a', 'Tārīkh Baghdād /'], ['c', 'al-Khaṭīb.']] },
    { tag: '260', ind1: ' ', ind2: ' ', subfields: [['6', '880-03'], ['a', 'London,'], ['b', 'J. M. Dent;'], ['a', 'New York,'], ['b', 'E. P. Dutton,'], ['c', '[c1935]']] },
    { tag: '856', ind1: '4', ind2: '1', subfields: [['d', 'gdcwebcasts'], ['f', '190402alw1000'], ['u', 'http://www.loc.gov/today/cyberlc/feature_wdesc.php?rec=1000']] },
    { tag: '880', ind1: '0', ind2: ' ', subfields: [['6', '100-01/(3/r'], ['a', 'خطيب البغدادي، أبو بكر أحمد بن علي،'], ['d', '1002-1071.']] },
    { tag: '880', ind1: '1', ind2: '0', subfields: [['6', '245-02/(3/r'], ['a', 'تاريخ بغداد /'], ['c', 'الخطيب.']] },
    { tag: '880', ind1: ' ', ind2: ' ', subfields: [['6', '260-03/(3/r'], ['a', 'لندن،'], ['b', 'دنت،'], ['c', '1935.']] },
  ]);
  const { back, issues } = roundTrip(r);
  assert.deepEqual(issues, []);
  const f = (tag: string) => back.fields.filter((x) => x.tag === tag) as any[];
  assert.equal(f('264').length, 0, 'no 264 beside the 260');
  const link = f('260')[0].subfields.find(([c]: string[]) => c === '6')[1];
  const alt = f('880').find((x) => x.subfields.some(([c, v]: string[]) => c === '6' && v.startsWith('260-' + link.slice(4))));
  assert.ok(alt, 'the 880 of the 260 says 260');
  const name880 = f('880').find((x) => x.subfields.some(([c, v]: string[]) => c === '6' && v.startsWith('100-')));
  assert.deepEqual(name880.subfields.filter(([c]: string[]) => c === 'd').map(([, v]: string[]) => v.replace(/\.$/, '')), ['1002-1071']);
});
