/**
 * The catalogue's search test (the plan's test 9): a fixed list of questions a reader would type
 * (searchQuestions.json), each with the books that should come back in the first 10 results. Run with the same
 * search the results page uses, against the published catalogue, by scripts/search-benchmark.mts; the result is
 * published at mooon.site/search-test.json and on the scorecard page. Pure, so it can be tested.
 */
import { fold } from './searchIndex';

export interface Question { q: string; kind: string; expect: string[] }
export interface Answer { q: string; kind: string; found: boolean; rank: number | null; top: string[] }
export interface BenchmarkResult {
  at: string;
  books: number;
  questions: number;
  found: number;
  /** Share of questions answered within the first 10 results (0 to 1). */
  inTop10: number;
  /** Share answered by the very first result. */
  first: number;
  byKind: Array<{ kind: string; questions: number; found: number; first: number }>;
  /** The questions not answered, for anyone to check. */
  missed: Answer[];
  /** The same questions asked of the server's search of the published catalogue (one search: it should agree). */
  server?: { records: number; found: number; inTop10: number; first: number; missed: string[] };
}

const has = (title: string, expect: string[]) => {
  const t = fold(title);
  return expect.some((e) => t.includes(fold(e)));
};

/**
 * Asks every question. `search` returns the titles in the order the catalogue shows them. A question with an
 * empty `expect` is answered when nothing comes back.
 */
export function runBenchmark(questions: Question[], search: (q: string) => string[], books: number, at = new Date().toISOString()): BenchmarkResult {
  const answers: Answer[] = questions.map(({ q, kind, expect }) => {
    const titles = search(q);
    const top = titles.slice(0, 10);
    if (!expect.length) return { q, kind, found: titles.length === 0, rank: null, top: top.slice(0, 3) };
    const i = top.findIndex((t) => has(t, expect));
    return { q, kind, found: i >= 0, rank: i >= 0 ? i + 1 : null, top: top.slice(0, 3) };
  });
  const kinds = [...new Set(questions.map((x) => x.kind))];
  const found = answers.filter((a) => a.found).length;
  return {
    at,
    books,
    questions: answers.length,
    found,
    inTop10: answers.length ? found / answers.length : 0,
    first: answers.length ? answers.filter((a) => a.rank === 1 || (a.found && a.rank === null)).length / answers.length : 0,
    byKind: kinds.map((kind) => {
      const k = answers.filter((a) => a.kind === kind);
      return { kind, questions: k.length, found: k.filter((a) => a.found).length, first: k.filter((a) => a.rank === 1 || (a.found && a.rank === null)).length };
    }),
    missed: answers.filter((a) => !a.found),
  };
}
