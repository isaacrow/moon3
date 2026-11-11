/**
 * Search-result filters for the OPAC, in the manner of Libris: every facet lists its values with how many
 * results each would leave; several values in one facet widen the search (or), different facets narrow
 * it (and); each facet's counts are taken with the other facets applied, so a count never promises
 * results that are not there. The choice lives in the address (?f_lang=…&sort=…), so a filtered list
 * can be shared or bookmarked.
 */
import { t, opacLang } from './i18n';
import { addedOrder } from './recent';
import { readDate, hijriCenturyOf } from '../services/hijri';

export type FacetKey = 'avail' | 'category' | 'format' | 'lang' | 'library' | 'decade' | 'century' | 'author' | 'subject' | 'kind';
export type Selection = Partial<Record<FacetKey, string[]>>;
export type SortKey = 'relevance' | 'title-asc' | 'title-desc' | 'date-desc' | 'date-asc' | 'copies' | 'added';

export interface FacetValue { value: string; label: string; count: number }

interface Person { name?: string; nameArabic?: string; role?: string }
export interface FacetWork {
  id: string;
  title: string;
  language?: string;
  languageLabel?: string;
  genreForm?: string[];
  originDate?: string;
  primaryCreator?: Person;
  contributors?: Person[];
  subjects?: Array<{ label?: string }>;
  instances?: Array<{ publicationYear?: string; carrierType?: string; mediaType?: string; holdingStatus?: string }>;
  holdingItems?: Array<{ synthetic?: boolean; heldBy?: string; accessUrl?: string; status?: string }>;
  expressionOfHub?: { uri: string; label: string };
  createdAt?: string;
  catalogingInterface?: string;
}

export const FACETS: Array<{ key: FacetKey; title: string; en: string }> = [
  { key: 'avail', title: 'الإتاحة', en: 'Availability' },
  { key: 'category', title: 'الفئة', en: 'Category' },
  { key: 'format', title: 'الشكل', en: 'Format' },
  { key: 'lang', title: 'اللغة', en: 'Language' },
  { key: 'library', title: 'المكتبة', en: 'Library' },
  { key: 'decade', title: 'سنة النشر', en: 'Year published' },
  { key: 'century', title: 'القرن الهجري', en: 'Century AH' },
  { key: 'author', title: 'المؤلف والمساهمون', en: 'Authors and contributors' },
  { key: 'subject', title: 'الموضوع', en: 'Subject' },
  { key: 'kind', title: 'نوع العمل', en: 'Kind of work' },
];

export const SORTS: Array<{ v: SortKey; l: string; en: string }> = [
  { v: 'relevance', l: 'الأكثر صلة', en: 'Most relevant' },
  { v: 'title-asc', l: 'العنوان (أ–ي)', en: 'Title (A–Z)' },
  { v: 'title-desc', l: 'العنوان (ي–أ)', en: 'Title (Z–A)' },
  { v: 'added', l: 'أُضيف حديثاً للفهرس', en: 'Recently added to the catalogue' },
  { v: 'date-desc', l: 'الأحدث نشراً', en: 'Newest published' },
  { v: 'date-asc', l: 'الأقدم نشراً', en: 'Oldest published' },
  { v: 'copies', l: 'الأكثر نسخاً', en: 'Most copies' },
];

const UNKNOWN = /^(unknown|anonymous|غير معروف|مؤلف غير معروف|مجهول)$/i;

const LANGUAGE_NAMES: Record<string, string> = {
  ara: 'العربية', eng: 'الإنجليزية', per: 'الفارسية', fas: 'الفارسية', fre: 'الفرنسية', fra: 'الفرنسية', ger: 'الألمانية', deu: 'الألمانية',
  tur: 'التركية', ota: 'التركية العثمانية', urd: 'الأردية', kur: 'الكردية', heb: 'العبرية', syr: 'السريانية', spa: 'الإسبانية',
  ita: 'الإيطالية', rus: 'الروسية', lat: 'اللاتينية', grc: 'اليونانية القديمة', gre: 'اليونانية', mul: 'متعددة اللغات',
};

const LANGUAGE_NAMES_EN: Record<string, string> = {
  'العربية': 'Arabic', 'الإنجليزية': 'English', 'الفارسية': 'Persian', 'الفرنسية': 'French', 'الألمانية': 'German',
  'التركية': 'Turkish', 'التركية العثمانية': 'Ottoman Turkish', 'الأردية': 'Urdu', 'الكردية': 'Kurdish', 'العبرية': 'Hebrew',
  'السريانية': 'Syriac', 'الإسبانية': 'Spanish', 'الإيطالية': 'Italian', 'الروسية': 'Russian', 'اللاتينية': 'Latin',
  'اليونانية القديمة': 'Ancient Greek', 'اليونانية': 'Greek', 'متعددة اللغات': 'Multiple languages',
};

const FORMATS_EN: Record<string, string> = {
  'مصدر إلكتروني': 'Electronic resource', 'تسجيل صوتي': 'Sound recording', 'فيديو': 'Video', 'مصغّرات': 'Microform',
  'مخطوط': 'Manuscript', 'خريطة': 'Map', 'كتاب مطبوع': 'Printed book',
};

/** A language name (as languageName gives it) in the reader's language. */
export function languageDisplay(name: string): string {
  return opacLang() === 'en' ? LANGUAGE_NAMES_EN[name] || name : name;
}

/** A language as readers know it: an LC language URI or code (…/languages/eng, ara) becomes its Arabic name. */
export function languageName(label?: string, code?: string): string {
  for (const raw of [label, code]) {
    const s = String(raw || '').replace(/\s*\(.*\)$/, '').trim();
    if (!s) continue;
    const c = s.replace(/^.*\//, '').toLowerCase();
    if (LANGUAGE_NAMES[c]) return LANGUAGE_NAMES[c];
    if (!/^https?:|^[a-z]{2,3}$/i.test(s)) return s;
  }
  return '';
}
const toLatinDigits = (s: string) => s.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));

/** The publication year of a work (its first edition's, else the work's date). */
export function workYearOf(w: FacetWork): number | undefined {
  for (const raw of [...(w.instances || []).map((i) => i.publicationYear), w.originDate]) {
    // A Hijri or solar Hijri year ("1420 هـ", "1398" in an Arabic imprint) is converted, never read as Gregorian.
    const r = readDate(String(raw || ''));
    if (r.from !== undefined && r.gregorian === undefined) return r.from;
    const all = toLatinDigits(String(raw || '')).match(/(?<!\d)(1[0-9]\d\d|20\d\d)(?!\d)/g);
    if (all) return Number(all[all.length - 1]);
  }
  return undefined;
}

/** The copies a library really holds (never the OPAC's made-up placeholders), with all their fields. */
export function realCopies<T extends { synthetic?: boolean }>(w: { holdingItems?: T[] }): T[] {
  return (w.holdingItems || []).filter((h) => !h.synthetic);
}

export function libraryOf(heldBy: string | undefined): string {
  return String(heldBy || '').split(' — ')[0].trim();
}

const CARRIERS: Array<[RegExp, string]> = [
  [/online|electronic|computer|إلكترون|رقمي/i, 'مصدر إلكتروني'],
  [/audio|sound|صوت/i, 'تسجيل صوتي'],
  [/video|film|فيديو/i, 'فيديو'],
  [/microform|ميكرو/i, 'مصغّرات'],
  [/manuscript|مخطوط/i, 'مخطوط'],
  [/map|cartograph|خريطة/i, 'خريطة'],
  [/volume|unmediated|print|text|nc\b|مجلد|مطبوع/i, 'كتاب مطبوع'],
];

function formatOf(i: { carrierType?: string; mediaType?: string }): string | undefined {
  const s = `${i.carrierType || ''} ${i.mediaType || ''}`.replace(/^.*\//, '');
  if (!s.trim()) return undefined;
  for (const [re, label] of CARRIERS) if (re.test(s)) return label;
  return undefined;
}

function personLabel(p: Person | undefined): string | undefined {
  const n = (p?.nameArabic || p?.name || '').trim();
  return n && !UNKNOWN.test(n) ? n : undefined;
}

/** The values a work has in a facet (none when it says nothing about it). */
export function valuesOf(w: FacetWork, key: FacetKey): string[] {
  const uniq = (xs: Array<string | undefined>) => [...new Set(xs.map((x) => (x || '').trim()).filter(Boolean))] as string[];
  switch (key) {
    case 'avail': {
      const copies = realCopies(w);
      const online = copies.some((c) => c.accessUrl || c.status === 'digital_access') || (w.instances || []).some((i) => i.holdingStatus === 'digital_access');
      const physical = copies.some((c) => !c.accessUrl && c.status !== 'digital_access');
      return [online ? 'online' : '', physical ? 'physical' : ''].filter(Boolean);
    }
    case 'category': return uniq(w.genreForm || []);
    case 'format': return uniq((w.instances || []).map(formatOf));
    case 'lang': return uniq([languageName(w.languageLabel, w.language)]);
    case 'library': return uniq(realCopies(w).map((c) => libraryOf(c.heldBy)));
    case 'decade': {
      const y = workYearOf(w);
      return y ? [String(Math.floor(y / 10) * 10)] : [];
    }
    case 'century': {
      // The Hijri century: from the Hijri year itself when the record gives one, else from the Gregorian year.
      for (const raw of [...(w.instances || []).map((i) => i.publicationYear), w.originDate]) {
        const r = readDate(String(raw || ''));
        if (r.hijri !== undefined) return [String(Math.floor((r.hijri - 1) / 100) + 1)];
      }
      const y = workYearOf(w);
      return y ? [String(hijriCenturyOf(y))] : [];
    }
    case 'author': return uniq([personLabel(w.primaryCreator), ...(w.contributors || []).map(personLabel)]);
    case 'subject': return uniq((w.subjects || []).map((s) => s.label));
    case 'kind': {
      const translated = (w.contributors || []).some((c) => /translat|مترجم|ترجمة|trl/i.test(c.role || ''));
      return [translated ? 'translation' : '', w.expressionOfHub ? 'hub' : ''].filter(Boolean);
    }
  }
}

const ordinal = (n: number) => (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');

export function valueLabel(key: FacetKey, value: string): string {
  if (key === 'avail') return value === 'online' ? t('متاح على الإنترنت', 'Available online') : value === 'physical' ? t('نسخة ورقية في مكتبة', 'Print copy in a library') : value;
  if (key === 'decade') return `${value}–${Number(value) + 9}`;
  if (key === 'century') return t(`القرن ${value} هـ`, `${value}${ordinal(Number(value))} century AH`);
  if (key === 'kind') return value === 'translation' ? t('ترجمة', 'Translation') : value === 'hub' ? t('له طبعات وترجمات أخرى', 'Has other editions and translations') : value;
  if (key === 'lang') return languageDisplay(value);
  if (key === 'format') return opacLang() === 'en' ? FORMATS_EN[value] || value : value;
  return value;
}

function matches(w: FacetWork, sel: Selection, except?: FacetKey): boolean {
  for (const [key, chosen] of Object.entries(sel) as Array<[FacetKey, string[] | undefined]>) {
    if (key === except || !chosen?.length) continue;
    const have = valuesOf(w, key);
    if (!chosen.some((v) => have.includes(v))) return false;
  }
  return true;
}

export function applyFacets<T extends FacetWork>(works: T[], sel: Selection): T[] {
  return works.filter((w) => matches(w, sel));
}

/** Each facet's values with their counts (other facets applied); chosen values always stay listed. */
export function facetCounts(works: FacetWork[], sel: Selection): Record<FacetKey, FacetValue[]> {
  const out = {} as Record<FacetKey, FacetValue[]>;
  for (const { key } of FACETS) {
    const counts = new Map<string, number>();
    for (const w of works) {
      if (!matches(w, sel, key)) continue;
      for (const v of valuesOf(w, key)) counts.set(v, (counts.get(v) || 0) + 1);
    }
    for (const v of sel[key] || []) if (!counts.has(v)) counts.set(v, 0);
    const list = [...counts].map(([value, count]) => ({ value, label: valueLabel(key, value), count }));
    list.sort(key === 'decade' || key === 'century'
      ? (a, b) => Number(b.value) - Number(a.value)
      : (a, b) => b.count - a.count || a.label.localeCompare(b.label, opacLang()));
    out[key] = list;
  }
  return out;
}

export function sortWorks<T extends FacetWork>(works: T[], sort: SortKey): T[] {
  const list = [...works];
  const title = (w: FacetWork) => w.title.replace(/^(ال|the |a |an )/i, '');
  const year = (w: FacetWork, missing: number) => workYearOf(w) ?? missing;
  switch (sort) {
    case 'title-asc': return list.sort((a, b) => title(a).localeCompare(title(b), 'ar'));
    case 'title-desc': return list.sort((a, b) => title(b).localeCompare(title(a), 'ar'));
    case 'date-desc': return list.sort((a, b) => year(b, -Infinity) - year(a, -Infinity));
    case 'date-asc': return list.sort((a, b) => year(a, Infinity) - year(b, Infinity));
    case 'added': return list.sort(addedOrder);
    case 'copies': return list.sort((a, b) => realCopies(b).length - realCopies(a).length);
    default: return list;
  }
}

/** The filters, sort and page in the address: f_<facet>=value (repeated), sort=, page=. */
export function readState(params: URLSearchParams): { sel: Selection; sort: SortKey; page: number } {
  const sel: Selection = {};
  for (const { key } of FACETS) {
    const v = params.getAll(`f_${key}`).filter(Boolean);
    if (v.length) sel[key] = v;
  }
  const sort = (SORTS.find((s) => s.v === params.get('sort'))?.v) || 'relevance';
  const page = Math.max(1, Number(params.get('page')) || 1);
  return { sel, sort, page };
}

export function writeState(params: URLSearchParams, s: { sel: Selection; sort: SortKey; page: number }): URLSearchParams {
  const p = new URLSearchParams(params);
  for (const k of [...p.keys()]) if (k.startsWith('f_') || k === 'sort' || k === 'page') p.delete(k);
  for (const { key } of FACETS) for (const v of s.sel[key] || []) p.append(`f_${key}`, v);
  if (s.sort !== 'relevance') p.set('sort', s.sort);
  if (s.page > 1) p.set('page', String(s.page));
  return p;
}

export function toggle(sel: Selection, key: FacetKey, value: string): Selection {
  const cur = sel[key] || [];
  const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
  const out = { ...sel };
  if (next.length) out[key] = next; else delete out[key];
  return out;
}
