// The catalogue's search, for what a reader types in the search bar.
//
// What it does (and the old search did not):
//   - every WORD must be found, in any order and in any field ("gilgamesh epic" finds "The epic of Gilgamesh";
//     "نصر حسين" finds "حسين نصر"), where the old search needed the whole text as one exact phrase;
//   - it looks in everything a reader could mean: the title and subtitle, the author's names in both scripts, every
//     other person on the record, the subjects, the series, the publisher, the contents, the notes, the summary, the
//     forms, the call numbers and ISBNs, and the works inside a volume;
//   - it ignores the differences a reader should not have to type: capitals, Latin accents and the ayn/hamza
//     marks ("Mutanabbī" = "mutanabbi"), hyphens and punctuation, and the Arabic spelling variants (hamza, ya/alif
//     maqsura, ta marbuta, tashkeel, tatweel);
//   - the best field decides how high a result ranks, so a title match still beats a note.
// It is pure (no network, no page) so it can be tested.

/** The search form of a text: lower case, no accents, no Arabic variants, punctuation as single spaces. */
export function fold(text: unknown): string {
  if (typeof text !== 'string' || !text) return '';
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')                              // Latin accents: ī ā ū é ...
    .replace(/[ʻʼʾʿ‘’'`´]/g, '') // ayn, hamza, apostrophes: ʻAlá = ala
    .toLowerCase()
    .replace(/[ً-ٰٟـ]/g, '')                  // tashkeel, dagger alef, tatweel
    .replace(/[إأآٱ]/g, 'ا')
    .replace(/[يى]/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')                             // hyphens, commas, quotes, brackets ...
    .replace(/\s+/g, ' ')
    .trim();
}

interface PersonLike { name?: string; nameArabic?: string; nameEnglish?: string; otherNames?: string[] }
export interface SearchableWork {
  title?: string; subtitle?: string; summaryArabic?: string; summaryEnglish?: string; series?: string;
  tableOfContents?: string; notes?: string[]; incipit?: string; explicit?: string; genreForm?: string[];
  classificationDdc?: string; classificationLcc?: string; languageLabel?: string;
  primaryCreator?: PersonLike; contributors?: PersonLike[];
  subjects?: Array<{ label?: string }>;
  publisher?: { name?: string; city?: string };
  expressionOfHub?: { label?: string };
  containedWorks?: Array<{ title?: string; creator?: string }>;
  instances?: Array<{ publisher?: string; publicationPlace?: string; carrierType?: string; isbn?: string; callNumber?: string }>;
}

interface Field { weight: number; ar: string; text: string }

const names = (p?: PersonLike) => [p?.name, p?.nameArabic, p?.nameEnglish, ...(p?.otherNames || [])].filter(Boolean).join(' ');

/** Every searchable piece of a work, with how much a match in it is worth and what to call it in the "why" line. */
function fieldsOf(w: SearchableWork): Field[] {
  const f: Field[] = [];
  const add = (weight: number, ar: string, ...texts: unknown[]) => {
    const text = fold(texts.filter(x => typeof x === 'string').join(' '));
    if (text) f.push({ weight, ar, text });
  };
  add(80, 'العنوان', w.title);
  add(50, 'العنوان الفرعي', w.subtitle);
  add(70, 'اسم المؤلف', names(w.primaryCreator));
  add(55, 'المساهمين في العمل', ...(w.contributors || []).map(names));
  add(60, 'رأس الموضوع المقنن', ...(w.subjects || []).map(s => s.label));
  add(45, 'السلسلة', w.series);
  add(45, 'العمل الأصلي', w.expressionOfHub?.label);
  add(65, 'ما في هذا المجلد', ...(w.containedWorks || []).map(c => `${c.title || ''} ${c.creator || ''}`));
  add(40, 'جهة النشر', w.publisher?.name, w.publisher?.city, ...(w.instances || []).map(i => `${i.publisher || ''} ${i.publicationPlace || ''}`));
  add(40, 'الشكل والنوع', ...(w.genreForm || []), ...(w.instances || []).map(i => i.carrierType));
  add(75, 'رمز الرف والتصنيف', w.classificationDdc, w.classificationLcc, ...(w.instances || []).map(i => i.callNumber));
  add(35, 'المحتويات', w.tableOfContents);
  add(30, 'الملخص', w.summaryArabic, w.summaryEnglish);
  add(30, 'الملاحظات', ...(w.notes || []));
  add(25, 'أول النص وآخره', w.incipit, w.explicit);
  add(20, 'اللغة', w.languageLabel);
  return f;
}

const cache = new WeakMap<object, Field[]>();
const fieldsFor = (w: SearchableWork) => {
  let f = cache.get(w);
  if (!f) { f = fieldsOf(w); cache.set(w, f); }
  return f;
};

export interface Match { score: number; reason: string }

/**
 * How well a work answers what was typed: a score (higher is better) and a short "why", or null when it does not.
 * The whole text found as one phrase ranks highest (as before); all the words found, in any order, ranks below it.
 */
export function matchWork(w: SearchableWork, rawQuery: string): Match | null {
  const phrase = fold(rawQuery);
  if (!phrase) return null;
  const fields = fieldsFor(w);

  // A book number typed in full (ISBN, with or without hyphens) finds the book.
  const digits = rawQuery.replace(/[\s-]/g, '');
  if (/^\d{9,13}[\dXx]?$/.test(digits) && (w.instances || []).some(i => (i.isbn || '').replace(/[\s-]/g, '').toLowerCase().includes(digits.toLowerCase()))) {
    return { score: 90, reason: 'تطابق في المعرف المعياري (ISBN)' };
  }

  // 1. The text as one phrase.
  let best: Match | null = null;
  for (const fl of fields) {
    if (!fl.text.includes(phrase)) continue;
    const exact = fl.ar === 'العنوان' && fl.text.startsWith(phrase);
    const score = exact ? 100 : fl.weight;
    if (!best || score > best.score) best = { score, reason: `${exact ? 'تطابق تام في' : 'تطابق في'} ${fl.ar}` };
  }
  if (best) return best;

  // 2. Every word, in any field and any order.
  const words = phrase.split(' ');
  if (words.length < 2) return null;
  let total = 0;
  let strongest: Field | null = null;
  for (const word of words) {
    let wordBest: Field | null = null;
    for (const fl of fields) if (fl.text.includes(word) && (!wordBest || fl.weight > wordBest.weight)) wordBest = fl;
    if (!wordBest) return null;
    total += wordBest.weight;
    if (!strongest || wordBest.weight > strongest.weight) strongest = wordBest;
  }
  // Capped at 79 so a whole phrase in a title or a name still ranks above it.
  const score = Math.min(79, Math.max(10, Math.round((total / words.length) * 0.9)));
  return { score, reason: `تطابق كل الكلمات (أقواها في ${strongest!.ar})` };
}

/** True when every word typed is found in any of the texts (any order, accents and spelling variants ignored). */
export function allWordsIn(rawQuery: string, ...texts: unknown[]): boolean {
  const words = fold(rawQuery).split(' ').filter(Boolean);
  if (!words.length) return false;
  const hay = fold(texts.filter(x => typeof x === 'string').join(' '));
  return words.every(w => hay.includes(w));
}

/**
 * For the "nothing matched" page: how many of the typed words this work contains (0 to all of them). A work that has
 * some of the words is worth suggesting when no work has all of them.
 */
export function wordsFound(w: SearchableWork, rawQuery: string): { found: number; total: number } {
  const words = fold(rawQuery).split(' ').filter(word => word.length > 1);
  const fields = fieldsFor(w);
  return { found: words.filter(word => fields.some(fl => fl.text.includes(word))).length, total: words.length };
}
