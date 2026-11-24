// The catalogue search test, and the two search fixes it led to: typing slips, and short words across scripts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runBenchmark, type Question } from '../src/opac/searchBenchmark';
import { oneSlipApart, fuzzyMatchWork, matchWork } from '../src/opac/searchIndex';
import { crossKeys, crossScriptMatch } from '../src/opac/crossScript';

test('the score: found within the first 10 results, by the first one, by kind; an empty expect wants nothing', () => {
  const qs: Question[] = [
    { q: 'a', kind: 'title', expect: ['Gilgamesh'] },
    { q: 'b', kind: 'title', expect: ['Orientalism'] },
    { q: 'c', kind: 'typo', expect: ['Baghdad'] },
    { q: 'd', kind: 'none', expect: [] },
  ];
  const answers: Record<string, string[]> = {
    a: ['The epic of Gilgamesh'],
    b: ['x', 'y', 'Orientalism'],
    c: Array.from({ length: 11 }, (_, i) => (i === 10 ? 'Baghdad Journal' : `other ${i}`)),
    d: [],
  };
  const r = runBenchmark(qs, (q) => answers[q], 4, '2026-11-26T00:00:00Z');
  assert.equal(r.found, 3);
  assert.equal(r.inTop10, 0.75);
  assert.equal(r.first, 0.5, 'a, and d (nothing wanted, nothing found)');
  assert.deepEqual(r.missed.map((m) => m.q), ['c'], 'the 11th result is too far down');
  assert.deepEqual(r.byKind.find((k) => k.kind === 'title'), { kind: 'title', questions: 2, found: 2, first: 1 });
});

test('the question file: 200 questions, each with a kind, and expected titles as text', () => {
  const { questions } = JSON.parse(readFileSync(new URL('../src/opac/searchQuestions.json', import.meta.url), 'utf8'));
  assert.equal(questions.length, 200);
  for (const q of questions) {
    assert.ok(typeof q.q === 'string' && q.q.trim(), 'a question');
    assert.ok(typeof q.kind === 'string' && q.kind);
    assert.ok(Array.isArray(q.expect) && q.expect.every((e: unknown) => typeof e === 'string'));
  }
  assert.ok(questions.some((q: any) => q.kind === 'cross-script') && questions.some((q: any) => q.kind === 'typo'));
});

test('one typing slip: a letter wrong, missing, added, or two swapped', () => {
  assert.ok(oneSlipApart('bagdad', 'baghdad'));
  assert.ok(oneSlipApart('gilgamesch', 'gilgamesh'));
  assert.ok(oneSlipApart('mesopotamya', 'mesopotamia'));
  assert.ok(oneSlipApart('orientalizm', 'orientalism'));
  assert.ok(oneSlipApart('burckhart', 'burckhardt'));
  assert.ok(oneSlipApart('محفوط', 'محفوظ'));
  assert.ok(!oneSlipApart('sifuism', 'sufism'), 'a swap and a letter added: two slips');
  assert.ok(oneSlipApart('suifsm', 'sufism'), 'two letters swapped');
  assert.ok(!oneSlipApart('baghdad', 'bagdat'), 'two slips');
  assert.ok(oneSlipApart('iraq', 'iran'), 'one letter apart; fuzzyMatchWork only tries words of five letters or more');
});

test('typo matching: only for long words, only in titles, people and subjects', () => {
  const book = { title: 'The epic of Gilgamesh', primaryCreator: { name: 'Jastrow, Morris' }, notes: ['printed in Philadelphia'] };
  assert.ok(fuzzyMatchWork(book, 'Gilgamesch'));
  assert.ok(fuzzyMatchWork(book, 'epic Gilgamesch'), 'the other words exactly');
  assert.equal(fuzzyMatchWork(book, 'Gilgamesh'), null, 'no slip: the ordinary search answers it');
  assert.equal(fuzzyMatchWork(book, 'epuc'), null, 'four letters: too short to guess');
  assert.equal(fuzzyMatchWork(book, 'Philadelfia'), null, 'not from a note');
  assert.equal(fuzzyMatchWork(book, 'Gilgamesch Babylon'), null, 'every word is needed');
  assert.ok(fuzzyMatchWork(book, 'Gilgamesch')!.score < (matchWork(book, 'Gilgamesh')?.score ?? 0));
});

test('across scripts, a short word is skipped when a longer one matches', () => {
  const wardi = crossKeys('نظرية المعرفة عند ابن خلدون', 'علي الوردي');
  assert.ok(crossScriptMatch('Ali al-Wardi', wardi, true, false));
  assert.ok(crossScriptMatch('Duaa al-karawan', crossKeys('دعاء الكروان'), true, false));
  assert.ok(!crossScriptMatch('Ali', wardi, true, false), 'nothing comparable');
  assert.ok(!crossScriptMatch('Ibn', crossKeys('ابن خلدون'), true, false), 'two letters alone never match');
  assert.ok(!crossScriptMatch('Ali Battuta', wardi, true, false), 'the comparable words must all match');
  assert.ok(!crossScriptMatch('Quran', crossKeys('دعاء الكروان'), true, false));
});
