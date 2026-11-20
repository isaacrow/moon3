// Cross-script search: a name typed in Latin letters finds it in Arabic script, and the other way round.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crossKey, crossKeys, crossScriptMatch } from '../src/opac/crossScript';
import { matchWork } from '../src/opac/searchIndex';

const same = (a: string, b: string) => assert.equal(crossKey(a), crossKey(b), `${a} = ${b} (${crossKey(a)} / ${crossKey(b)})`);
const differ = (a: string, b: string) => assert.notEqual(crossKey(a), crossKey(b), `${a} ≠ ${b}`);

test('the same name in both scripts has the same key', () => {
  same('Khaldun', 'خلدون');
  same('Khaldūn', 'خلدون');
  same('Ibn', 'ابن');
  same('Mahfouz', 'محفوظ');
  same('Maḥfūẓ', 'محفوظ');
  same('Naguib', 'نجيب');
  same('Najib', 'نجيب');
  same('Jahiz', 'الجاحظ');
  same('al-Jāḥiẓ', 'الجاحظ');
  same('Quran', 'القرآن');
  same("Qur'an", 'القرآن');
  same('Gilgamesh', 'جلجامش');
  same('Kalila', 'كليلة');
  same('Dimna', 'دمنة');
  same('Muqaddimah', 'المقدمة');
  same('Fatimah', 'فاطمة');
  same('Shafii', 'الشافعي');
  same('ash-Shafi‘i', 'الشافعي');
  same('Baghdad', 'بغداد');
  same('Yahya', 'يحيى');
  same('Walid', 'وليد');
  same('history', 'هستري'); // only to show keys are spelling-blind; matching needs whole words in the other script
});

test('different names keep different keys', () => {
  differ('Khaldun', 'خالد');
  differ('Mahfouz', 'محمد');
  differ('Quran', 'الكروان'); // Karawan, the curlew: و before an alif is a consonant
  differ('Karen', 'القرآن'); // ق is q, ك is k
  differ('Tabari', 'الطبري'.slice(0, 3));
});

test('a match needs every word, the other script, and a long enough key', () => {
  const ar = crossKeys('نظرية المعرفة عند ابن خلدون');
  assert.ok(crossScriptMatch('Ibn Khaldun', ar, true, false));
  assert.ok(crossScriptMatch('ibn khaldoun', ar, true, false));
  assert.ok(!crossScriptMatch('Ibn Battuta', ar, true, false), 'every word must be there');
  assert.ok(!crossScriptMatch('Ibn', ar, true, false), 'a two-letter key alone never matches');
  assert.ok(!crossScriptMatch('Ibn Khaldun', crossKeys('Ibn Khaldun'), false, true), 'same script: the ordinary search decides');
  assert.ok(crossScriptMatch('جلجامش', crossKeys('The epic of Gilgamesh'), false, true));
  assert.ok(crossScriptMatch('Kalila wa-Dimna', crossKeys('كليلة ودمنة'), true, false), 'the و joined to دمنة');
  assert.ok(!crossScriptMatch('Quran', crossKeys('دعاء الكروان'), true, false));
});

test('the catalogue search finds an Arabic book by a Latin name, ranked below ordinary matches', () => {
  const book = { title: 'نظرية المعرفة عند ابن خلدون', primaryCreator: { name: 'عبد الرحمن' } };
  const m = matchWork(book, 'Ibn Khaldun');
  assert.ok(m, 'found');
  assert.ok(m!.score < 40, `ranked low (${m!.score})`);
  assert.equal(matchWork(book, 'Ibn Battuta'), null);
  const mahfouz = { title: 'أولاد حارتنا', primaryCreator: { name: 'محفوظ، نجيب', nameArabic: 'نجيب محفوظ' } };
  assert.ok(matchWork(mahfouz, 'Naguib Mahfouz'));
  assert.ok(matchWork(mahfouz, 'Mahfuz'));
  const gil = { title: 'The epic of Gilgamesh' };
  assert.ok(matchWork(gil, 'جلجامش'));
  assert.ok(matchWork({ title: 'القرآن الكريم' }, 'Quran'));
  assert.equal(matchWork({ title: 'أولاد حارتنا', subjects: [{ label: 'الأدب العربي -- القرن العشرون' }] }, 'Quran'), null, 'not by a subject word');
});
