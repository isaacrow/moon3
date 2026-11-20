/**
 * Search by field and advanced search for the public catalogue (as Regina and other library catalogues offer):
 * the search box can be limited to one field (?in=title), and the advanced search combines fields
 * (?ti=…&au=…&su=…&pb=…&sn=…&cn=…&y1=…&y2=…). Every field is matched like the main search: every word, any
 * order, accents and Arabic spelling variants ignored (searchIndex.fold), and names in every script the
 * authority file holds.
 */
import { fold, entityNamesOf } from './searchIndex';
import { workYearOf } from './facets';

export type FieldKey = 'all' | 'title' | 'author' | 'subject' | 'publisher' | 'series' | 'number' | 'callnumber';

export const FIELDS: Array<{ key: FieldKey; ar: string; en: string }> = [
  { key: 'all', ar: 'كل الحقول', en: 'All fields' },
  { key: 'title', ar: 'العنوان', en: 'Title' },
  { key: 'author', ar: 'المؤلف', en: 'Author' },
  { key: 'subject', ar: 'الموضوع', en: 'Subject' },
  { key: 'publisher', ar: 'الناشر', en: 'Publisher' },
  { key: 'series', ar: 'السلسلة', en: 'Series' },
  { key: 'number', ar: 'ISBN / ISSN', en: 'ISBN / ISSN' },
  { key: 'callnumber', ar: 'رقم الطلب والتصنيف', en: 'Call number / class' },
];

/** The address keys of the advanced search, one per field. */
export const ADVANCED_KEYS: Record<Exclude<FieldKey, 'all'>, string> = {
  title: 'ti', author: 'au', subject: 'su', publisher: 'pb', series: 'se', number: 'sn', callnumber: 'cn',
};
export const YEAR_KEYS = ['y1', 'y2'] as const;
/** Every address key this module owns (so the catalogue can carry them along or clear them). */
export const FIELD_PARAM_KEYS = ['in', 'adv', ...Object.values(ADVANCED_KEYS), ...YEAR_KEYS];

type Person = { name?: string; nameArabic?: string; nameEnglish?: string; otherNames?: string[]; uri?: string; authorityLinks?: string[] };
export interface FieldWork {
  title?: string;
  subtitle?: string;
  primaryCreator?: Person;
  contributors?: Person[];
  subjects?: Array<{ label?: string; uri?: string }>;
  series?: string;
  publisher?: { name?: string; city?: string };
  classificationDdc?: string;
  classificationLcc?: string;
  instances?: Array<{ title?: string; publisher?: string; publicationPlace?: string; publicationYear?: string; isbn?: string; issn?: string; callNumber?: string }>;
  originDate?: string;
  identifiers?: Array<{ value?: string }>;
}

const personText = (p?: Person) =>
  [p?.name, p?.nameArabic, p?.nameEnglish, ...(p?.otherNames || []), ...entityNamesOf([p?.uri, ...(p?.authorityLinks || [])])].filter(Boolean).join(' ');

/** The text of one field of a work, folded for matching. */
export function fieldText(w: FieldWork, field: Exclude<FieldKey, 'all'>): string {
  const parts: unknown[] = [];
  switch (field) {
    case 'title': parts.push(w.title, w.subtitle, ...(w.instances || []).map((i) => i.title)); break;
    case 'author': parts.push(personText(w.primaryCreator), ...(w.contributors || []).map(personText)); break;
    case 'subject': parts.push(...(w.subjects || []).map((s) => s.label), ...entityNamesOf((w.subjects || []).map((s) => s.uri))); break;
    case 'publisher': parts.push(w.publisher?.name, w.publisher?.city, ...(w.instances || []).flatMap((i) => [i.publisher, i.publicationPlace])); break;
    case 'series': parts.push(w.series); break;
    case 'number': parts.push(...(w.instances || []).flatMap((i) => [i.isbn, i.issn]), ...(w.identifiers || []).map((x) => x.value)); break;
    case 'callnumber': parts.push(w.classificationDdc, w.classificationLcc, ...(w.instances || []).map((i) => i.callNumber)); break;
  }
  return fold(parts.filter((x) => typeof x === 'string').join(' '));
}

/** ISBN and ISSN are compared as digits only, so "978-0-691" and "9780691" match. */
const digitsOnly = (s: string) => s.replace(/[^0-9xX]/g, '').toLowerCase();

/** True when every word of the query is in the field (an ISBN / ISSN by its digits). */
export function fieldMatches(w: FieldWork, field: Exclude<FieldKey, 'all'>, query: string): boolean {
  if (field === 'number') {
    const want = digitsOnly(query);
    if (!want) return false;
    const have = [...(w.instances || []).flatMap((i) => [i.isbn, i.issn]), ...(w.identifiers || []).map((x) => x.value)].filter(Boolean).map((x) => digitsOnly(String(x)));
    return have.some((h) => h.includes(want));
  }
  const words = fold(query).split(' ').filter(Boolean);
  if (!words.length) return false;
  const hay = fieldText(w, field);
  return words.every((word) => hay.includes(word));
}

export interface Advanced {
  /** The field the search box was limited to. */
  inField: FieldKey;
  /** Advanced search: words per field. */
  fields: Partial<Record<Exclude<FieldKey, 'all'>, string>>;
  yearFrom?: number;
  yearTo?: number;
}

export function readAdvanced(params: URLSearchParams): Advanced {
  const inField = (FIELDS.find((f) => f.key === params.get('in'))?.key) || 'all';
  const fields: Advanced['fields'] = {};
  for (const [field, key] of Object.entries(ADVANCED_KEYS) as Array<[Exclude<FieldKey, 'all'>, string]>) {
    const v = (params.get(key) || '').trim();
    if (v) fields[field] = v;
  }
  const year = (k: string) => { const n = Number(params.get(k)); return Number.isFinite(n) && n > 0 ? n : undefined; };
  return { inField, fields, yearFrom: year('y1'), yearTo: year('y2') };
}

/** True when the advanced search has anything in it (fields or years). */
export const hasAdvanced = (a: Advanced) => Object.keys(a.fields).length > 0 || a.yearFrom !== undefined || a.yearTo !== undefined;

/** The address parameters for an advanced search. */
export function advancedParams(a: Partial<Advanced>): URLSearchParams {
  const p = new URLSearchParams();
  if (a.inField && a.inField !== 'all') p.set('in', a.inField);
  for (const [field, v] of Object.entries(a.fields || {})) if (v && v.trim()) p.set(ADVANCED_KEYS[field as Exclude<FieldKey, 'all'>], v.trim());
  if (a.yearFrom) p.set('y1', String(a.yearFrom));
  if (a.yearTo) p.set('y2', String(a.yearTo));
  return p;
}

/**
 * Keeps the works that answer the query in its field (when the box was limited to one) and every advanced
 * condition. Years use the publication year (Hijri years converted), as the year filter does.
 */
export function applyFieldSearch<T extends FieldWork>(works: T[], query: string, a: Advanced): T[] {
  return works.filter((w) => {
    if (a.inField !== 'all' && query.trim() && !fieldMatches(w, a.inField, query)) return false;
    for (const [field, v] of Object.entries(a.fields) as Array<[Exclude<FieldKey, 'all'>, string]>) if (!fieldMatches(w, field, v)) return false;
    if (a.yearFrom !== undefined || a.yearTo !== undefined) {
      const y = workYearOf(w as any);
      if (y === undefined) return false;
      if (a.yearFrom !== undefined && y < a.yearFrom) return false;
      if (a.yearTo !== undefined && y > a.yearTo) return false;
    }
    return true;
  });
}
