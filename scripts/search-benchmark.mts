/**
 * Runs the catalogue search test (src/opac/searchBenchmark.ts) against the live published catalogue, with the
 * search the results page uses, and writes the result as JSON.
 *
 *   npx tsx scripts/search-benchmark.mts [out.json]      (default: public/search-test.json)
 *
 * The deploy runs it before the build, so mooon.site/search-test.json and the scorecard show today's score.
 * Exits 0 even when questions are missed: the score is a measure, not a gate.
 */
import fs from 'node:fs';
import { wolfMoonOpacService as opac } from '../src/services/wolfMoonOpacService';
import { runBenchmark, type Question } from '../src/opac/searchBenchmark';
import { setEntityNames } from '../src/opac/searchIndex';
import { MOON_API, moonHeaders } from '../src/app/utils/moonApi';
import { searchableOf, searchDocs } from '../supabase/functions/server/searchDocs.tsx';
import { matchWork, fuzzyMatchWork } from '../supabase/functions/server/searchCore.tsx';

const out = process.argv[2] || 'public/search-test.json';
const { questions } = JSON.parse(fs.readFileSync(new URL('../src/opac/searchQuestions.json', import.meta.url), 'utf8')) as { questions: Question[] };

await opac.initDatabase();
// The entities' names in both scripts, as the catalogue page loads them.
try {
  const r = await fetch(`${MOON_API}/resource/names.json`, { headers: moonHeaders() });
  if (r.ok) { const d = await r.json(); if (d?.forms) setEntityNames(d.forms); }
} catch { /* the test runs without them, as the page does */ }

const books = opac.getAllWorks().length;
if (!books) { console.error('The catalogue came back empty; no score written.'); process.exit(0); }
const search = (q: string) => opac.searchWorks(q, 'all', 'all', 'all', 'all', 'relevance', 1, 100000).works.map((w: any) => w.title as string);
const result = runBenchmark(questions, search, books);

// The server's search of the published catalogue (searchDocs.tsx), on the same records and names, in-process:
// the code the server runs, asked the same 200 questions. A book counts by any of its titles.
try {
  const records: any[] = [];
  for (let offset = 0; offset < 100000; offset += 200) {
    const page = await fetch(`${MOON_API}/records/search?view=published&limit=200&offset=${offset}`, { headers: moonHeaders() }).then((r) => r.json());
    records.push(...(page.records || []));
    if (!page.records?.length || records.length >= (page.total ?? 0)) break;
  }
  const docs = records.map((record) => ({ record, work: searchableOf(record.document)! })).filter((d) => d.work);
  const titles = (d: any) => [d.record.title, d.work.title, d.work.subtitle].filter(Boolean).join(' / ');
  const byRecord = new Map(docs.map((d) => [d.record, d]));
  const server = runBenchmark(questions, (q) => searchDocs(docs, q, { matchWork, fuzzyMatchWork }, 0, 10).results.map((x) => titles(byRecord.get(x.record))), docs.length);
  result.server = { records: docs.length, found: server.found, inTop10: server.inTop10, first: server.first, missed: server.missed.map((m) => m.q) };
  console.log(`Server search: ${server.found} of ${server.questions} (${(server.inTop10 * 100).toFixed(1)}%), ${(server.first * 100).toFixed(1)}% by the first result, over ${docs.length} published records.`);
} catch (e) {
  console.error('The server search could not be measured:', e instanceof Error ? e.message : e);
}
fs.writeFileSync(out, JSON.stringify(result, null, 1) + '\n');
console.log(`${result.found} of ${result.questions} questions answered in the first 10 results (${(result.inTop10 * 100).toFixed(1)}%), ${(result.first * 100).toFixed(1)}% by the first result, over ${books} books.`);
for (const k of result.byKind) console.log(`  ${k.kind}: ${k.found}/${k.questions}`);
