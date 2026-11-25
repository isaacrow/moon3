/**
 * The OPAC in plain words (Phase 13 S13), as Libris and the LC Primer advise:
 * - whatItIs: one line saying what a book is, "Book · Printed · Arabic · Poetry" (category.ts), never the same fact twice;
 * - formatChips: the formats a Work exists in, across its editions;
 * - editionLines: for each edition, only what is different from the others (publisher, year, language …);
 * - exactMatch: the "exact words only" switch, against the default close matches.
 * No React here, so it is tested on plain records.
 */
import { t } from './i18n';
import { valuesOf, valueLabel, languageName, languageDisplay, workYearOf, type FacetWork } from './facets';
import { normalizeArabic } from '../services/wolfMoonOpacService';
import { categoryLabel, formatLabel } from './category';

const fold = (s: string) => normalizeArabic(String(s || '')).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
/** Two facts are the same when one folded text holds the other ("كتاب" in "كتاب مطبوع", "Poetry" twice). */
const sameFact = (a: string, b: string) => {
  const x = fold(a), y = fold(b);
  return !!x && !!y && (x === y || ` ${x} `.includes(` ${y} `) || ` ${y} `.includes(` ${x} `));
};

/** "Book · Printed · Arabic · Poetry": category, format, language, then up to two genres, each fact once. */
export function whatItIs(w: FacetWork & { genreForm?: string[] }): string {
  const facts: string[] = [];
  const add = (s?: string) => { if (s && s.trim() && !facts.some((f) => sameFact(f, s))) facts.push(s.trim()); };
  const category = valuesOf(w, 'category')[0] || '';
  const format = valuesOf(w, 'format')[0] || '';
  add(valueLabel('category', category));
  add(valueLabel('format', format));
  add(languageDisplay(languageName(w.languageLabel, w.language)));
  // The category and format in both languages, so a genre in the other language that says the same is left out too.
  const said = [...facts, ...[categoryLabel, formatLabel].flatMap((label, n) => {
    const v = n ? format : category;
    return v ? [label(v, false), label(v, true)] : [];
  })];
  const base = facts.length;
  for (const g of w.genreForm || []) {
    if (facts.length - base >= 2) break;
    // A genre that is the same as, or only the plural of, a fact already said ("مخطوطات" after "مخطوط") is left out.
    const repeats = said.some((f) => { const x = fold(f), y = fold(g); return sameFact(f, g) || (x.length >= 3 && y.startsWith(x) && y.length - x.length <= 2); });
    if (!repeats && !/^(book|books|text|كتاب|كتب|نص)$/i.test(fold(g))) add(valueLabel('genre', g));
  }
  return facts.join(' · ');
}

/** The formats a Work exists in across its records ("Printed book", "E-book"), each once. */
export function formatChips(members: FacetWork[]): string[] {
  const out: string[] = [];
  for (const m of members) for (const v of valuesOf(m, 'format')) {
    const l = valueLabel('format', v);
    if (l && !out.includes(l)) out.push(l);
  }
  return out;
}

type EditionLike = FacetWork;

/**
 * One line per edition saying only what sets it apart: the facts that differ between the editions
 * (language, translator, publisher and place, year, extent, format). A fact all editions share is left out.
 */
export function editionLines<E extends EditionLike>(editions: E[]): Array<{ edition: E; line: string }> {
  const facts = editions.map((e) => {
    const i = (e.instances || [])[0] as any || {};
    const translator = ((e.contributors || []) as Array<{ name?: string; nameArabic?: string; role?: string }>).find((c) => /translat|مترجم|ترجمة|trl/i.test(c.role || ''));
    const year = workYearOf(e);
    return {
      lang: languageDisplay(languageName(e.languageLabel, e.language)),
      translator: translator ? t(`ترجمة ${translator.nameArabic || translator.name}`, `translated by ${translator.name || translator.nameArabic}`) : '',
      pub: [i.publicationPlace && String(i.publicationPlace).replace(/\s*[:;,]\s*$/, ''), i.publisher].filter(Boolean).join(' : '),
      year: year ? String(year) : '',
      extent: String(i.extent || '').trim(),
      format: valueLabel('format', valuesOf(e, 'format')[0] || ''),
    };
  });
  const keys = ['lang', 'translator', 'pub', 'year', 'extent', 'format'] as const;
  const varies = keys.filter((k) => new Set(facts.map((f) => fold(f[k]))).size > 1);
  return editions.map((edition, n) => {
    const f = facts[n];
    const shown = varies.map((k) => f[k]).filter(Boolean);
    return { edition, line: shown.length ? shown.join(' · ') : t('الوصف نفسه', 'Same description') };
  });
}

/**
 * The "exact words only" switch: every word of the search is a whole word of the title, a name, a subject
 * or the publisher (Arabic folded, a leading "ال" or "و" allowed). The default search also takes close
 * matches, such as a word inside another word.
 */
export function exactMatch(w: {
  title: string; subtitle?: string;
  primaryCreator?: { name?: string; nameArabic?: string; nameEnglish?: string };
  contributors?: Array<{ name?: string; nameArabic?: string; nameEnglish?: string }>;
  subjects?: Array<{ label: string }>;
  instances?: Array<{ publisher?: string; isbn?: string }>;
}, query: string): boolean {
  const words = fold(query).split(' ').filter(Boolean);
  if (!words.length) return true;
  const hay = new Set(fold([
    w.title, w.subtitle,
    ...[w.primaryCreator, ...(w.contributors || [])].flatMap((p) => [p?.name, p?.nameArabic, p?.nameEnglish]),
    ...(w.subjects || []).map((s) => s.label),
    ...(w.instances || []).flatMap((i) => [i.publisher, i.isbn]),
  ].filter(Boolean).join(' ')).split(' ').flatMap((x) => [x, x.replace(/^(و|ف|ب)?ال(?=..)/, ''), x.replace(/^(و|ف|ب)(?=...)/, '')]));
  return words.every((q) => hay.has(q) || hay.has(q.replace(/^ال(?=..)/, '')));
}

// ---- A–Z browse in both scripts ----

const AR_LETTERS = 'ابتثجحخدذرزسشصضطظعغفقكلمنهوي'.split('');
const LA_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

/** The word a heading files under: Arabic folded, without "ال", "al-", "the" or a diacritic at the start. */
export function filingKey(label: string): string {
  const s = normalizeArabic(String(label || '')).normalize('NFKD').replace(/[̀-ͯʻʼʿʾ'’`"«»(\[]/g, '').trim();
  return s.replace(/^(ال(?=..)|al-|el-|the\s+|a\s+|an\s+)/i, '').replace(/^[ٱأإآ]/, 'ا').replace(/^ى/, 'ي').replace(/^ة/, 'ه').trim();
}

/** The letter a heading files under: one of the 28 Arabic letters, A–Z, or "#" for anything else. */
export function letterOf(label: string): string {
  const c = filingKey(label).charAt(0).toUpperCase();
  return AR_LETTERS.includes(c) || LA_LETTERS.includes(c) ? c : '#';
}

/** The A–Z bar: every letter of both alphabets, with how many headings file under it. */
export function alphaIndex(labels: string[]): Array<{ letter: string; count: number }> {
  const n = new Map<string, number>();
  for (const l of labels) { const k = letterOf(l); n.set(k, (n.get(k) || 0) + 1); }
  return [...AR_LETTERS, ...LA_LETTERS, '#'].map((letter) => ({ letter, count: n.get(letter) || 0 }))
    .filter((x) => x.letter !== '#' || x.count > 0);
}
