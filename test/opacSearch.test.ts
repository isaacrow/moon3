import test from 'node:test';
import assert from 'node:assert/strict';
import { allWordsIn, fold, matchWork, wordsFound, type SearchableWork } from '../src/opac/searchIndex.ts';
import { isSameRecord } from '../src/opac/sameRecord.ts';
import { addedOn, addedOrder, recentlyAdded, recentShelf, shuffled } from '../src/opac/recent.ts';

const gilgamesh: SearchableWork = {
  title: 'The epic of Gilgamesh',
  primaryCreator: { name: 'Sandars, N. K.', nameArabic: 'ساندارز', nameEnglish: 'Sandars, N. K.' },
  contributors: [{ nameArabic: 'طه باقر', nameEnglish: 'Baqir, Taha' }],
  subjects: [{ label: 'Gilgamesh' }, { label: 'ملحمة جلجامش' }],
  series: 'Penguin Classics',
  notes: ['Translated from the Akkadian'],
  instances: [{ publisher: 'Penguin Books', publicationPlace: 'London', isbn: '9780140441000' }],
};
const mutanabbi: SearchableWork = {
  title: 'ʻAlá khuṭā al-Mutanabbī fī asfārih',
  primaryCreator: { nameArabic: 'المتنبي', nameEnglish: 'Mutanabbī', otherNames: ['Abū al-Ṭayyib'] },
  tableOfContents: 'Aleppo; Cairo; Shiraz',
};
const nasr: SearchableWork = { title: 'The philosophy of Seyyed Hossein Nasr', primaryCreator: { nameArabic: 'حسين نصر', nameEnglish: 'Nasr, Seyyed Hossein' } };

test('fold ignores case, accents, ayn/hamza marks, hyphens and Arabic spelling variants', () => {
  assert.equal(fold('ʻAlá khuṭā al-Mutanabbī'), 'ala khuta al mutanabbi');
  assert.equal(fold('  Ibn   Khaldūn, '), 'ibn khaldun');
  assert.equal(fold('أحمد'), fold('احمد'));
  assert.equal(fold('مكتبة'), fold('مكتبه'));
  assert.equal(fold('على'), fold('علي'));
  assert.equal(fold('الْعِرَاق'), fold('العراق'));
  assert.equal(fold(undefined), '');
});

test('every word, in any order, is enough', () => {
  assert.ok(matchWork(gilgamesh, 'gilgamesh epic'));
  assert.ok(matchWork(gilgamesh, 'epic gilgamesh'));
  assert.ok(matchWork(nasr, 'nasr hossein'));
  assert.ok(matchWork(nasr, 'نصر حسين'));
  assert.equal(matchWork(gilgamesh, 'gilgamesh pizza'), null);
});

test('it looks beyond the title and the first author', () => {
  assert.ok(matchWork(gilgamesh, 'taha baqir'), 'a contributor');
  assert.ok(matchWork(gilgamesh, 'penguin classics'), 'the series');
  assert.ok(matchWork(gilgamesh, 'akkadian'), 'a note');
  assert.ok(matchWork(gilgamesh, 'london'), 'the place of publication');
  assert.ok(matchWork(gilgamesh, 'جلجامش'), 'an Arabic subject');
  assert.ok(matchWork(mutanabbi, 'shiraz'), 'the contents');
  assert.ok(matchWork(mutanabbi, 'abu tayyib'), 'another form of the name');
});

test('accents and ayn do not have to be typed', () => {
  assert.ok(matchWork(mutanabbi, 'mutanabbi'));
  assert.ok(matchWork(mutanabbi, 'ala khuta'));
  assert.ok(matchWork(mutanabbi, 'Mutanabbī'));
});

test('an ISBN is found with or without hyphens', () => {
  assert.equal(matchWork(gilgamesh, '9780140441000')?.score, 90);
  assert.equal(matchWork(gilgamesh, '978-0-14-044100-0')?.score, 90);
  assert.equal(matchWork(gilgamesh, '9780000000000'), null);
});

test('ranking: the title beats a note; the whole phrase beats separate words', () => {
  const inTitle = matchWork(gilgamesh, 'epic of gilgamesh')!;
  const inNote = matchWork(gilgamesh, 'akkadian')!;
  const separate = matchWork(gilgamesh, 'gilgamesh epic')!;
  assert.ok(inTitle.score > separate.score);
  assert.ok(inTitle.score > inNote.score);
  assert.equal(matchWork(gilgamesh, 'the epic')!.score, 100);
});

test('empty or punctuation-only text matches nothing', () => {
  assert.equal(matchWork(gilgamesh, ''), null);
  assert.equal(matchWork(gilgamesh, ' - , '), null);
});

test('recently added: by the day added, real books before samples, never by the last save', () => {
  const book = (id: string, createdAt: string, catalogingInterface = 'Wolf Moon') => ({ id, createdAt, catalogingInterface });
  const list = [
    book('sample-newest', '2026-11-10T21:15:00Z', 'Sample records'),
    book('old-resaved', '2026-02-27T20:00:00Z'),
    book('real-new', '2026-11-07T19:38:00Z'),
    book('real-mid', '2026-11-04T17:51:00Z'),
    book('sample-b', '2026-11-10T21:00:00Z', 'Sample records'),
  ];
  assert.deepEqual(recentlyAdded(list, 10).map(b => b.id), ['real-new', 'real-mid', 'old-resaved', 'sample-newest', 'sample-b']);
  assert.deepEqual(recentlyAdded(list, 2).map(b => b.id), ['real-new', 'real-mid']);
  assert.deepEqual(recentlyAdded([], 5), []);
});

test('addedOn writes the day in the reader\'s language and nothing for a bad date', () => {
  assert.match(addedOn('2026-11-07T19:38:00Z', 'en'), /7 Nov 2026/);
  assert.ok(addedOn('2026-11-07T19:38:00Z', 'ar').length > 4);
  assert.equal(addedOn('', 'en'), '');
  assert.equal(addedOn('not a date', 'ar'), '');
});

test('allWordsIn: every word, any text, any order', () => {
  assert.ok(allWordsIn('hossein nasr', 'Nasr, Seyyed Hossein'));
  assert.ok(allWordsIn('طه باقر', 'باقر، طه', 'x'));
  assert.ok(!allWordsIn('nasr pizza', 'Nasr, Seyyed Hossein'));
  assert.ok(!allWordsIn('', 'anything'));
});

test('wordsFound counts the typed words a book has (for the nothing-matched page)', () => {
  assert.deepEqual(wordsFound(gilgamesh, 'gilgamesh pizza'), { found: 1, total: 2 });
  assert.deepEqual(wordsFound(gilgamesh, 'epic gilgamesh'), { found: 2, total: 2 });
  assert.deepEqual(wordsFound(gilgamesh, 'pizza pasta'), { found: 0, total: 2 });
});

test('addedOrder is the order of the Recently added sort', () => {
  const a = { createdAt: '2026-11-07T00:00:00Z', catalogingInterface: 'Wolf Moon' };
  const b = { createdAt: '2026-11-10T00:00:00Z', catalogingInterface: 'Sample records' };
  const c = { createdAt: '2026-11-01T00:00:00Z' };
  assert.deepEqual([b, c, a].sort(addedOrder), [a, c, b]);
});

test('isSameRecord: different editions sharing a title are different books; identical records are one', () => {
  const book = (id: string, isbn: string | undefined, year = '1991') => ({ id, title: 'Palace Walk', originDate: year, primaryCreator: { name: 'Mahfouz, Naguib' }, instances: isbn ? [{ isbn }] : [] });
  assert.equal(isSameRecord(book('a', '9780844672267'), book('b', '9780385264662')), false, 'two ISBNs');
  assert.equal(isSameRecord(book('a', '9780844672267'), book('b', '978-0-8446-7226-7')), true, 'same ISBN, written differently');
  assert.equal(isSameRecord(book('a', undefined), book('b', undefined)), true, 'identical, no ISBN');
  assert.equal(isSameRecord(book('a', undefined), book('b', undefined, '2001')), false, 'another year');
  assert.equal(isSameRecord(book('same', '1'), { ...book('same', '2'), title: 'Other' }), true, 'same id is always the same record');
  assert.equal(isSameRecord({ id: 'x' }, { id: 'y' }), false, 'no title: never merged');
});

test('recently added: a sample book is recognised by its id too', () => {
  const list = [{ id: 'sample-9781', createdAt: '2026-11-10T00:00:00Z' }, { id: 'record-1', createdAt: '2026-11-07T00:00:00Z' }];
  assert.deepEqual(recentlyAdded(list, 2).map(b => b.id), ['record-1', 'sample-9781']);
});

test('the shelf: books with covers first, a new random order each time, drawn from the latest added', () => {
  const book = (id: string, day: number, cover: boolean) => ({ id, createdAt: '2026-11-0' + day + 'T00:00:00Z', cover });
  const works = [book('a', 9, false), book('b', 8, true), book('c', 7, true), book('d', 6, false), book('e', 5, true), book('old', 1, true)];
  const has = (w: { cover: boolean }) => w.cover;
  const shelf = recentShelf(works, has, 4, 5, () => 0.3);
  assert.equal(shelf.length, 4);
  assert.ok(shelf.slice(0, 3).every(has), 'the covered books come first');
  assert.ok(!shelf.some(w => w.id === 'old'), 'drawn only from the latest 5 added');
  assert.equal(shelf[3].cover, false, 'then the ones without a cover');
  const orders = new Set<string>();
  for (let i = 0; i < 40; i++) orders.add(recentShelf(works, has, 5, 5).map(w => w.id).join());
  assert.ok(orders.size > 1, 'a different order on different visits');
  assert.deepEqual(recentShelf([], has), []);
});

test('shuffled keeps every item and never changes the input', () => {
  const input = [1, 2, 3, 4, 5, 6];
  const out = shuffled(input);
  assert.deepEqual([...out].sort(), input);
  assert.deepEqual(input, [1, 2, 3, 4, 5, 6]);
  assert.equal(shuffled([1, 2, 3], () => 0).length, 3);
});
