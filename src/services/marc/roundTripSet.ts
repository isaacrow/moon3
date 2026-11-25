/**
 * The public round-trip report's fixed set (test/fixtures/round-trip/lc-set.xml, records from the Library of
 * Congress fetched by scripts/round-trip-set.mts) and the report as published (public/round-trip.json).
 * Node only (reads the file); the script writes it and the test checks it is current.
 */
import { readFileSync } from 'node:fs';
import { parseMarcXml } from './marcRecord';
import { publicRoundTrip } from './marcRoundTrip';

export const ROUND_TRIP_SET = { name: 'Library of Congress records', source: 'lx2.loc.gov SRU, fetched by scripts/round-trip-set.mts' };

export function roundTripReportJson(dir = '.'): string {
  const records = parseMarcXml(readFileSync(`${dir}/test/fixtures/round-trip/lc-set.xml`, 'utf8'));
  return JSON.stringify(publicRoundTrip(records, ROUND_TRIP_SET), null, 1) + '\n';
}
