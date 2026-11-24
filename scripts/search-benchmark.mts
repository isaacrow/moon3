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
fs.writeFileSync(out, JSON.stringify(result, null, 1) + '\n');
console.log(`${result.found} of ${result.questions} questions answered in the first 10 results (${(result.inTop10 * 100).toFixed(1)}%), ${(result.first * 100).toFixed(1)}% by the first result, over ${books} books.`);
for (const k of result.byKind) console.log(`  ${k.kind}: ${k.found}/${k.questions}`);
