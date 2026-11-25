// Writes the public round-trip report (public/round-trip.json, shown by public/round-trip.html; plan step A2):
// the fixed set of LC records (test/fixtures/round-trip/lc-set.xml) through Moon's MARC import and export.
//   npx tsx scripts/round-trip-report.mts
// Run it after changing the MARC converters; test/roundTripPublic.test.ts fails while the report is out of date.
import { writeFileSync } from 'node:fs';
import { roundTripReportJson } from '../src/services/marc/roundTripSet';

const json = roundTripReportJson();
writeFileSync('public/round-trip.json', json);
const r = JSON.parse(json);
console.log(`${r.clean} of ${r.set.records} records came back whole`);
